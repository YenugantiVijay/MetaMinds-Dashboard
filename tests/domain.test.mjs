import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceProgress,
  createApplicationOtp,
  hashPassword,
  localDateTimeToUtc,
  makeCompanyEmployeeId,
  verifyPassword,
  workedMinutes,
} from "../src/domain.mjs";

test("approved employee IDs include the company year and compact sequence", () => {
  assert.equal(makeCompanyEmployeeId(2026, 1), "MM-2026-0001");
  assert.equal(makeCompanyEmployeeId(2026, 12), "MM-2026-0012");
  assert.throws(() => makeCompanyEmployeeId(99, 1), /year/);
  assert.throws(() => makeCompanyEmployeeId(2026, 0), /positive/);
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
