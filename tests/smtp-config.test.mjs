import test from "node:test";
import assert from "node:assert/strict";
import { getSmtpConfiguration } from "../src/smtp-config.mjs";

test("SMTP setup is incomplete when Gmail credentials are missing", () => {
  const configuration = getSmtpConfiguration({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "people@example.com",
    SMTP_PASSWORD: "",
    SMTP_FROM: "people@example.com",
  });

  assert.equal(configuration.configured, false);
  assert.match(configuration.message, /SMTP_USER and SMTP_PASSWORD must both be set/);
});

test("SMTP setup accepts a complete authenticated provider configuration", () => {
  const configuration = getSmtpConfiguration({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "people@example.com",
    SMTP_PASSWORD: "test-app password",
    SMTP_FROM: "people@example.com",
  });

  assert.equal(configuration.configured, true);
  assert.equal(configuration.transport.secure, true);
  assert.equal(configuration.transport.requireTLS, true);
  assert.deepEqual(configuration.transport.auth, {
    user: "people@example.com",
    pass: "test-apppassword",
  });
});

test("SMTP setup requires STARTTLS when implicit TLS is not selected", () => {
  const configuration = getSmtpConfiguration({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "people@example.com",
    SMTP_PASSWORD: "secret",
    SMTP_FROM: "people@example.com",
  });

  assert.equal(configuration.configured, true);
  assert.equal(configuration.transport.secure, false);
  assert.equal(configuration.transport.requireTLS, true);
  assert.equal(configuration.transport.tls.rejectUnauthorized, true);
});

test("plaintext SMTP is allowed only for unauthenticated local development tests", () => {
  const configuration = getSmtpConfiguration({
    NODE_ENV: "development",
    SMTP_ALLOW_INSECURE_LOCALHOST: "true",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "2525",
    SMTP_FROM: "portal@example.test",
  });

  assert.equal(configuration.configured, true);
  assert.equal(configuration.transport.requireTLS, false);
  assert.equal(configuration.transport.auth, undefined);
});

test("SMTP setup rejects invalid ports and partial credentials", () => {
  const configuration = getSmtpConfiguration({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "70000",
    SMTP_USER: "people@example.com",
    SMTP_FROM: "people@example.com",
  });

  assert.equal(configuration.configured, false);
  assert.match(configuration.message, /SMTP_PORT must be a valid port/);
  assert.match(configuration.message, /SMTP_USER and SMTP_PASSWORD must both be set/);
});
