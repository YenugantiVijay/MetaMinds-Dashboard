import { validateUploadedDataUrl } from "./domain.mjs";

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

function validateProfilePhoto(value, fail) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail(400, "Please upload a valid PNG, JPG, or WebP image (max 2 MB).");
  if (!value.trim()) return null;
  try {
    return validateUploadedDataUrl(value, {
      allowPdf: false,
      maxBytes: MAX_PROFILE_PHOTO_BYTES,
      fieldLabel: "Profile image",
    }).dataUrl;
  } catch (error) {
    fail(400, error instanceof Error ? error.message : "Please upload a valid PNG, JPG, or WebP image (max 2 MB).");
  }
}

// Employee self-service endpoints. Existing payroll policy is intentionally unchanged.
export function employeeSelfService({
  method, path, body, context, db, requireUser, getEmployeeForUser, fail,
  validDate, countWorkingDays, withTransaction, audit, notifyUser, queueEmail,
  currentDateInZone, timestamp, searchParams,
}) {
  if (!["/api/me/profile", "/api/me/profile/photo", "/api/personal-leave", "/api/personal-leave/quota"].includes(path)) return undefined;
  const user = requireUser(context);
  const employee = getEmployeeForUser(user);
  if (method === "GET" && path === "/api/me/profile") {
    const row = db.prepare("SELECT phone, address, emergency_name AS emergencyName, emergency_relationship AS emergencyRelationship, emergency_phone AS emergencyPhone, updated_at AS updatedAt FROM employee_self_profiles WHERE employee_id=?").get(employee.id);
    return { status: 200, body: {
      employeeId: employee.employee_id, fullName: employee.full_name,
      email: user.email, position: employee.position,
      photoUrl: employee.photo_url ?? null,
      phone: row?.phone ?? "", address: row?.address ?? "",
      emergencyName: row?.emergencyName ?? "", emergencyRelationship: row?.emergencyRelationship ?? "",
      emergencyPhone: row?.emergencyPhone ?? "", updatedAt: row?.updatedAt ?? null,
    } };
  }
  if (method === "POST" && path === "/api/me/profile/photo") {
    const photoUrl = validateProfilePhoto(body.photoUrl ?? null, fail);
    withTransaction(() => {
      db.prepare("UPDATE employees SET photo_url = ? WHERE id = ?").run(photoUrl, employee.id);
      audit(
        user.user_id,
        photoUrl ? "employee.profile_photo_updated" : "employee.profile_photo_removed",
        "employee",
        employee.id,
      );
    });
    return { status: 200, body: { ok: true, photoUrl } };
  }
  if (method === "POST" && path === "/api/me/profile") {
    const clean = (key, max) => {
      if (typeof body[key] !== "string" || body[key].length > max) fail(400, `${key} is invalid.`);
      return body[key].trim();
    };
    const phone = clean("phone", 20);
    const address = clean("address", 600);
    const emergencyName = clean("emergencyName", 100);
    const emergencyRelationship = clean("emergencyRelationship", 50);
    const emergencyPhone = clean("emergencyPhone", 20);
    for (const number of [phone, emergencyPhone]) {
      if (number && !/^\+?[0-9 ()-]{7,20}$/.test(number)) fail(400, "Provide a valid contact phone number.");
    }
    const updatedAt = timestamp();
    withTransaction(() => {
      db.prepare(`INSERT INTO employee_self_profiles
        (employee_id,phone,address,emergency_name,emergency_relationship,emergency_phone,updated_at)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(employee_id) DO UPDATE SET phone=excluded.phone,address=excluded.address,
          emergency_name=excluded.emergency_name,emergency_relationship=excluded.emergency_relationship,
          emergency_phone=excluded.emergency_phone,updated_at=excluded.updated_at
      `).run(employee.id,phone,address,emergencyName,emergencyRelationship,emergencyPhone,updatedAt);
      audit(user.user_id,"employee.self_profile_updated","employee",employee.id);
    });
    return { status: 200, body: { ok: true, updatedAt } };
  }
  if (method === "GET" && path === "/api/personal-leave/quota") {
    const requestedYear = searchParams?.get("year");
    if (requestedYear && !/^(20[2-9][0-9]|21[0-9][0-9])$/.test(requestedYear)) {
      fail(400, "Choose a valid leave calendar year.");
    }
    const year = requestedYear || currentDateInZone().slice(0,4);
    const used = db.prepare(`SELECT COUNT(*) AS total FROM leave_requests
      WHERE employee_id=? AND exemption_day=1 AND status='approved' AND substr(start_date,1,4)=?`
    ).get(employee.id,year).total;
    return { status: 200, body: { year:Number(year),entitled:1,used,remaining:Math.max(0,1-used) } };
  }
  if (method === "POST" && path === "/api/personal-leave") {
    const labels = { personal:"Personal work",medical:"Medical / health",family:"Family function",
      emergency:"Emergency",travel:"Travel",festival:"Festival / occasion",other:"Other" };
    const category = body.reasonCategory;
    if (typeof category !== "string" || !Object.hasOwn(labels,category)) fail(400,"Select a reason for leave.");
    const details = typeof body.details === "string" ? body.details.trim() : "";
    if (details.length>1000 || (category==="other" && details.length<3)) fail(400,"Provide a valid reason (up to 1,000 characters).");
    const startDate=validDate(body.startDate,"Start date");
    const endDate=validDate(body.endDate,"End date");
    if (startDate>endDate) fail(400,"End date must be after start date.");
    if (startDate.slice(0,4)!==endDate.slice(0,4)) fail(400,"Submit separate requests for different calendar years.");
    const holidays=new Set(db.prepare("SELECT holiday_date FROM company_holidays").all().map(row=>row.holiday_date));
    const workingDays=countWorkingDays(startDate,endDate,holidays);
    if (workingDays<1) fail(400,"The selected period has no working days.");
    const result=withTransaction(()=>{
      const overlap=db.prepare(`SELECT 1 FROM leave_requests
        WHERE employee_id=? AND status IN ('pending','approved') AND start_date<=? AND end_date>=?
        LIMIT 1`).get(employee.id,endDate,startDate);
      if(overlap) fail(409,"The dates overlap an existing leave request.");
      const used=db.prepare(`SELECT COUNT(*) AS total FROM leave_requests WHERE employee_id=?
        AND exemption_day=1 AND status='approved' AND substr(start_date,1,4)=?`
      ).get(employee.id,startDate.slice(0,4)).total;
      const exemption=workingDays===1 && used===0;
      db.prepare("INSERT OR IGNORE INTO leave_types(name,paid,active) VALUES ('Personal leave request',0,1)").run();
      const categoryRow=db.prepare("SELECT id FROM leave_types WHERE name='Personal leave request' AND active=1").get();
      if(!categoryRow) fail(503,"Personal leave policy is not configured.");
      const status=exemption?"approved":"pending";
      const reason=details?`${labels[category]}: ${details}`:labels[category];
      const inserted=db.prepare(`INSERT INTO leave_requests
        (employee_id,leave_type_id,start_date,end_date,reason,working_days_count,
         pay_treatment,requires_ceo_approval,excess_days,policy_mode,reason_category,exemption_day,status)
        VALUES (?,?,?,?,?,?,NULL,?,0,'personal',?,?,?)`
      ).run(employee.id,categoryRow.id,startDate,endDate,reason,workingDays,exemption?0:1,category,exemption?1:0,status);
      const id=Number(inserted.lastInsertRowid);
      audit(user.user_id,exemption?"leave.annual_exemption_applied":"leave.personal_requested","leave_request",id);
      if(exemption) notifyUser(user.user_id,"leave","Annual exemption recorded",
        "Your one annual exemption day has been recorded on your leave calendar.");
      else for(const ceo of db.prepare("SELECT id,email FROM users WHERE role='ceo' AND active=1").all()){
        notifyUser(ceo.id,"leave","Personal leave awaiting CEO approval",
          "An employee requested personal leave. Review the request in MetaMinds.");
        queueEmail(ceo.email,"MetaMinds | Personal leave approval",
          "A personal leave request is awaiting your review.");
      }
      return {id,status,exemption,workingDays};
    });
    return {status:201,body:result};
  }
  fail(405,"Method not allowed.");
}
