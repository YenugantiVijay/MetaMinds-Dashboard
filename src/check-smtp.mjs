import nodemailer from "nodemailer";
import { getSmtpConfiguration } from "./smtp-config.mjs";

const configuration = getSmtpConfiguration();
if (!configuration.configured) {
  console.error(configuration.message);
  process.exitCode = 1;
} else {
  const transport = nodemailer.createTransport(configuration.transport);
  try {
    await transport.verify();
    console.log("SMTP connection and authentication verified. No email was sent.");
  } catch (error) {
    const code = error.code ?? "SMTP_CONNECTION_FAILED";
    const responseCode = error.responseCode ? ` (${error.responseCode})` : "";
    if (code === "EAUTH" || error.responseCode === 535) {
      console.error("SMTP authentication was rejected. For Gmail, create a new Google App Password while signed into the same account used by SMTP_USER, paste that App Password into SMTP_PASSWORD (not your normal Google password), save .env, and retry. If this is a managed Google Workspace account, ask its administrator whether SMTP/App Password access is allowed.");
    } else {
      console.error(`SMTP verification failed: ${code}${responseCode}. Check the host, port, TLS setting, and network access.`);
    }
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
