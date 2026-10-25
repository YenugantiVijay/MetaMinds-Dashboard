export function getSmtpConfiguration(env = process.env) {
  const host = env.SMTP_HOST?.trim() ?? "";
  const from = env.SMTP_FROM?.trim() ?? "";
  const user = env.SMTP_USER?.trim() ?? "";
  const rawPassword = env.SMTP_PASSWORD ?? "";
  const password = host.toLowerCase() === "smtp.gmail.com" ? rawPassword.replace(/\s/g, "") : rawPassword;
  const portValue = env.SMTP_PORT?.trim() || "587";
  const port = Number(portValue);
  const secure = env.SMTP_SECURE === "true";
  const allowInsecureLocalhost = env.SMTP_ALLOW_INSECURE_LOCALHOST === "true"
    && env.NODE_ENV !== "production"
    && ["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase())
    && !user
    && !password;
  const missing = [];

  if (!host) missing.push("SMTP_HOST");
  if (!from) missing.push("SMTP_FROM");
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT must be a valid port");
  if (Boolean(user) !== Boolean(password)) missing.push("SMTP_USER and SMTP_PASSWORD must both be set");

  return {
    configured: missing.length === 0,
    message: missing.length ? `SMTP setup incomplete: ${missing.join(", ")}.` : "",
    transport: {
      host,
      port,
      secure,
      requireTLS: !allowInsecureLocalhost,
      tls: {
        rejectUnauthorized: true,
      },
      ...(user ? { auth: { user, pass: password } } : {}),
      disableFileAccess: true,
      disableUrlAccess: true,
    },
    from,
  };
}
