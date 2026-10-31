function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function emailLayout({ preheader, heading, content }) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
  <body style="margin:0;padding:28px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#243247;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;color:transparent">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e4eaf2;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:26px 32px;background:#eef5ff;border-bottom:1px solid #e1eaf5;">
        <div style="font-size:20px;font-weight:700;letter-spacing:-.4px;color:#15375f;">MetaMinds</div>
        <div style="margin-top:3px;font-size:12px;letter-spacing:1px;color:#60748e;">PVT. LTD. &middot; PEOPLE FIRST</div>
      </td></tr>
      <tr><td style="padding:34px 32px 30px;">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;letter-spacing:-.4px;color:#193452;">${escapeHtml(heading)}</h1>
        ${content}
      </td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #edf0f4;color:#718198;font-size:12px;line-height:1.6;">
        This message was sent by MetaMinds Pvt. Ltd. Do not forward verification codes or share them with anyone.
      </td></tr>
    </table>
  </body>
</html>`;
}

export function applicationOtpEmail({ name, code, expiryMinutes }) {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  const html = emailLayout({
    preheader: "Your MetaMinds application verification code",
    heading: "Verify your email address",
    content: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#53647a;">Hello ${safeName}, use this one-time code to verify the email address for your MetaMinds application.</p>
        <div style="margin:24px 0;padding:20px 16px;border:1px solid #dbe8f8;border-radius:12px;background:#f5f9ff;text-align:center;">
          <div style="margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:1.4px;color:#7186a1;">YOUR VERIFICATION CODE</div>
          <div style="font-family:Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#2569b6;">${safeCode}</div>
        </div>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#53647a;">This code expires in ${Number(expiryMinutes)} minutes. If you did not request it, you can safely ignore this message.</p>`,
  });
  return {
    subject: "Verify your email | MetaMinds Pvt. Ltd.",
    text: `Hello ${name}, your MetaMinds email verification code is ${code}. It expires in ${expiryMinutes} minutes. Do not share this code with anyone.`,
    html,
  };
}

export function applicationSubmittedEmail({ name, position, employmentType, appUrl }) {
  const safeName = escapeHtml(name);
  const safePosition = escapeHtml(position);
  const safeEmploymentType = escapeHtml(employmentType);
  const safeAppUrl = escapeHtml(appUrl);
  const html = emailLayout({
    preheader: "Your MetaMinds employee account registration has been received",
    heading: "Employee Account Created · Pending CEO Approval",
    content: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#53647a;">Hello ${safeName}, your employee account registration has been successfully created and submitted for executive review.</p>
        <div style="margin:24px 0;padding:18px 20px;border:1px solid #e2e9f1;border-radius:12px;background:#fafbfd;">
          <div style="margin-bottom:12px;font-size:11px;font-weight:700;letter-spacing:1.3px;color:#7186a1;">ACCOUNT DETAILS</div>
          <p style="margin:6px 0;font-size:14px;color:#40536b;"><strong>Position / Role:</strong> ${safePosition}</p>
          <p style="margin:6px 0;font-size:14px;color:#40536b;"><strong>Employment Type:</strong> ${safeEmploymentType}</p>
          <p style="margin:6px 0;font-size:14px;color:#40536b;"><strong>Status:</strong> Awaiting CEO Review &amp; Approval</p>
        </div>
        <div style="margin:24px 0;padding:18px 20px;border:1px solid #dbe8f8;border-radius:12px;background:#f5f9ff;">
          <div style="margin-bottom:6px;font-size:11px;font-weight:700;letter-spacing:1.4px;color:#2569b6;">EMPLOYEE ID DELIVERY NOTICE</div>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#334d6e;">The employee ID will be sent directly to your email address once your account is reviewed and approved by the CEO. You do not need to take any further action at this time.</p>
        </div>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#53647a;">As soon as executive approval is completed, you will receive a follow-up email containing your official Employee ID, allowing you to sign in immediately using your password.</p>
        <p style="margin:22px 0 0;"><a href="${safeAppUrl}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#347bcf;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">Visit MetaMinds Portal</a></p>`,
  });
  return {
    subject: "Employee Account Created · Pending CEO Approval | MetaMinds Pvt. Ltd.",
    text: `Hello ${name}, your employee account for ${position} (${employmentType}) has been created successfully and is pending CEO approval. The official employee ID will be sent directly to your email once approved. MetaMinds Portal: ${appUrl}`,
    html,
  };
}

export function applicationApprovedEmail({ name, employeeId, appUrl }) {
  const safeName = escapeHtml(name);
  const safeEmployeeId = escapeHtml(employeeId);
  const safeAppUrl = escapeHtml(appUrl);
  const html = emailLayout({
    preheader: `Your MetaMinds employee account has been approved · Employee ID: ${employeeId}`,
    heading: "Employee Account Approved by CEO",
    content: `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#53647a;">Hello ${safeName}, congratulations! Your employee account has been reviewed and approved by the CEO. Here is your official company Employee ID:</p>
        <div style="margin:24px 0;padding:22px;border:1px solid #dbe8f8;border-radius:12px;background:#f5f9ff;text-align:center;">
          <div style="margin-bottom:6px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#7186a1;">YOUR OFFICIAL EMPLOYEE ID</div>
          <div style="font-family:Consolas,monospace;font-size:32px;font-weight:800;letter-spacing:2px;color:#2569b6;">${safeEmployeeId}</div>
        </div>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#53647a;">You can now sign in to the MetaMinds People Portal using this Employee ID (<strong>${safeEmployeeId}</strong>) or your registered email address, along with the password you created during registration.</p>
        <p style="margin:22px 0 0;"><a href="${safeAppUrl}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#21845f;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">Proceed to Sign In</a></p>`,
  });
  return {
    subject: `Employee Account Approved · Employee ID: ${employeeId} | MetaMinds Pvt. Ltd.`,
    text: `Hello ${name}, your employee account has been approved by the CEO! Your official Employee ID is ${employeeId}. Sign in to the people portal with your Employee ID: ${appUrl}`,
    html,
  };
}
