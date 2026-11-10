import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceProgress,
  createApplicationOtp,
  evaluateAttendanceDayPolicy,
  hashPassword,
  localDateTimeToUtc,
  makeCompanyEmployeeId,
  isSecondSaturday,
  isCompanyHoliday,
  validateUploadedDataUrl,
  verifyPassword,
  workedMinutes,
} from "../src/domain.mjs";

test("approved employee IDs include the company year and compact sequence", () => {
  assert.equal(makeCompanyEmployeeId(2026, 1), "MM-2026-0001");
  assert.equal(makeCompanyEmployeeId(2026, 12), "MM-2026-0012");
  assert.throws(() => makeCompanyEmployeeId(99, 1), /year/);
  assert.throws(() => makeCompanyEmployeeId(2026, 0), /positive/);
});

test("employee ID sequences are positive, numeric, and zero-padded", () => {
  assert.equal(makeCompanyEmployeeId(2026, "7"), "MM-2026-0007");
  assert.equal(makeCompanyEmployeeId(2026, 9999), "MM-2026-9999");
  assert.throws(() => makeCompanyEmployeeId(2026, "0000"), /positive/);
  assert.throws(() => makeCompanyEmployeeId(2026, "1A"), /positive/);
  assert.throws(() => makeCompanyEmployeeId(2026, 10000), /positive/);
});

test("company working calendar consistently excludes Sundays, second Saturdays, and holidays", () => {
  assert.equal(isSecondSaturday("2026-11-14"), true);
  assert.equal(isSecondSaturday("2026-11-07"), false);
  assert.equal(isCompanyHoliday("2026-11-14"), true);
  assert.equal(isCompanyHoliday("2026-11-07"), false);
  assert.equal(isCompanyHoliday("2026-11-08"), true);
  assert.equal(isCompanyHoliday("2026-11-09", new Set(["2026-11-09"])), true);
});

test("evaluateAttendanceDayPolicy accurately classifies working and non-working days", () => {
  const holidaysMap = new Map([["2026-11-09", "Diwali"]]);

  // Sunday: 2026-11-01
  const sunday = evaluateAttendanceDayPolicy("2026-11-01", holidaysMap);
  assert.equal(sunday.isWorkingDay, false);
  assert.equal(sunday.reason, "sunday");
  assert.match(sunday.message, /Sunday.*weekly off/i);

  // Second Saturday: 2026-11-14
  const secondSat = evaluateAttendanceDayPolicy("2026-11-14", holidaysMap);
  assert.equal(secondSat.isWorkingDay, false);
  assert.equal(secondSat.reason, "second_saturday");
  assert.match(secondSat.message, /second Saturday.*weekly off/i);

  // First Saturday: 2026-11-07
  const firstSat = evaluateAttendanceDayPolicy("2026-11-07", holidaysMap);
  assert.equal(firstSat.isWorkingDay, true);
  assert.equal(firstSat.reason, "working_day");

  // Third Saturday: 2026-11-21
  const thirdSat = evaluateAttendanceDayPolicy("2026-11-21", holidaysMap);
  assert.equal(thirdSat.isWorkingDay, true);
  assert.equal(thirdSat.reason, "working_day");

  // Fourth Saturday: 2026-11-28
  const fourthSat = evaluateAttendanceDayPolicy("2026-11-28", holidaysMap);
  assert.equal(fourthSat.isWorkingDay, true);
  assert.equal(fourthSat.reason, "working_day");

  // Fifth Saturday: 2026-10-31
  const fifthSat = evaluateAttendanceDayPolicy("2026-10-31", holidaysMap);
  assert.equal(fifthSat.isWorkingDay, true);
  assert.equal(fifthSat.reason, "working_day");

  // Company Holiday: 2026-11-09
  const holiday = evaluateAttendanceDayPolicy("2026-11-09", holidaysMap);
  assert.equal(holiday.isWorkingDay, false);
  assert.equal(holiday.reason, "company_holiday");
  assert.equal(holiday.holidayName, "Diwali");
  assert.match(holiday.message, /Diwali/);

  // Normal weekday: 2026-11-04 (Wednesday)
  const wednesday = evaluateAttendanceDayPolicy("2026-11-04", holidaysMap);
  assert.equal(wednesday.isWorkingDay, true);
  assert.equal(wednesday.reason, "working_day");

  // Year boundary: 2026-12-31 (Thursday)
  const newYearsEve = evaluateAttendanceDayPolicy("2026-12-31", holidaysMap);
  assert.equal(newYearsEve.isWorkingDay, true);
  assert.equal(newYearsEve.reason, "working_day");

  // Year boundary: 2027-01-01 (Friday)
  const newYear = evaluateAttendanceDayPolicy("2027-01-01", holidaysMap);
  assert.equal(newYear.isWorkingDay, true);

  // Year boundary: 2027-01-03 (Sunday)
  const newYearSun = evaluateAttendanceDayPolicy("2027-01-03", holidaysMap);
  assert.equal(newYearSun.isWorkingDay, false);
  assert.equal(newYearSun.reason, "sunday");

  // Year boundary: 2027-01-09 (2nd Saturday of January 2027)
  const janSecondSat = evaluateAttendanceDayPolicy("2027-01-09", holidaysMap);
  assert.equal(janSecondSat.isWorkingDay, false);
  assert.equal(janSecondSat.reason, "second_saturday");
});

test("application OTPs are six-character alphanumeric codes containing a letter and a number", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = createApplicationOtp();
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.match(code, /[A-HJ-NP-Z]/);
    assert.match(code, /[2-9]/);
  }
});

test("attendance progress distinguishes partial, complete, and unconfigured policy", () => {
  assert.deepEqual(attendanceProgress(210, 420), { percentage: 50, complete: false, overtimeMinutes: 0 });
  assert.deepEqual(attendanceProgress(510, 420), { percentage: 100, complete: true, overtimeMinutes: 90 });
  assert.deepEqual(attendanceProgress(210, 0), { percentage: null, complete: false, overtimeMinutes: 0 });
});

test("worked duration uses elapsed server timestamps and approved break minutes", () => {
  assert.equal(workedMinutes("2026-10-23T04:30:00.000Z", "2026-10-23T12:00:00.000Z", 30), 420);
  assert.throws(() => workedMinutes("not-a-date", "2026-10-23T12:00:00.000Z"), /timestamps/);
  assert.throws(() => workedMinutes("2026-10-23T12:00:00.000Z", "2026-10-23T04:30:00.000Z"), /timestamps/);
});

test("scheduled local times resolve correctly across timezones and daylight-saving transitions", () => {
  assert.equal(localDateTimeToUtc("2026-10-23", "10:00", "Asia/Kolkata").toISOString(), "2026-10-23T04:30:00.000Z");
  assert.equal(localDateTimeToUtc("2026-01-15", "10:00", "America/New_York").toISOString(), "2026-01-15T15:00:00.000Z");
  assert.equal(localDateTimeToUtc("2026-07-15", "10:00", "America/New_York").toISOString(), "2026-07-15T14:00:00.000Z");
  assert.throws(() => localDateTimeToUtc("2026-03-08", "02:30", "America/New_York"), /does not exist/);
});

test("password hashes are salted and can be verified without storing plaintext", () => {
  const first = hashPassword("Example-only strong password 123!");
  const second = hashPassword("Example-only strong password 123!");
  assert.notEqual(first, second);
  assert.equal(verifyPassword("Example-only strong password 123!", first), true);
  assert.equal(verifyPassword("not the password", first), false);
  assert.equal(verifyPassword("password", "malformed"), false);
  assert.throws(() => hashPassword("short"), /12 and 256/);
});

test("uploaded document and photo validator checks MIME types, magic bytes, and size limits", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const pdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64")}`;
  assert.equal(validateUploadedDataUrl(png, { allowPdf: false, fieldLabel: "Photo" }).mimeType, "image/png");
  assert.equal(validateUploadedDataUrl(pdf, { allowPdf: true, fieldLabel: "Certificate" }).mimeType, "application/pdf");
  assert.throws(() => validateUploadedDataUrl(pdf, { allowPdf: false, fieldLabel: "Photo" }), /valid PNG, JPG, or WebP/);
  assert.throws(() => validateUploadedDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", { allowPdf: true, fieldLabel: "PAN" }), /valid JPG, PNG, WebP, or PDF/);
  assert.throws(() => validateUploadedDataUrl("data:image/png;base64,bm90LWEtcG5n", { allowPdf: true, fieldLabel: "PAN" }), /valid JPG, PNG, WebP, or PDF/);
});
