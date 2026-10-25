import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const OTP_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const OTP_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const OTP_DIGITS = "23456789";

export function makeCompanyEmployeeId(year, sequence) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Employee ID year must be a four-digit year.");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Employee ID sequence must be a positive integer.");
  }
  return `MM-${year}-${String(sequence).padStart(4, "0")}`;
}

export function createApplicationOtp() {
  const values = Array.from({ length: 6 }, (_, index) => {
    if (index === 0) return OTP_DIGITS[randomInt(OTP_DIGITS.length)];
    if (index === 1) return OTP_LETTERS[randomInt(OTP_LETTERS.length)];
    return OTP_ALPHABET[randomInt(OTP_ALPHABET.length)];
  });
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values.join("");
}

export function isSecondSaturday(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (d.getUTCDay() !== 6) return false;
  const dayOfMonth = d.getUTCDate();
  return dayOfMonth >= 8 && dayOfMonth <= 14;
}

export function isCompanyHoliday(dateStr, holidaysSet = new Set()) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dayOfWeek = d.getUTCDay();
  if (dayOfWeek === 0) return true; // Sunday is weekly off
  if (isSecondSaturday(dateStr)) return true; // 2nd Saturday is holiday
  if (holidaysSet.has(dateStr)) return true; // Indian public holiday
  return false;
}

export function countWorkingDays(startDate, endDate, holidaysSet = new Set()) {
  let count = 0;
  const current = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    if (!isCompanyHoliday(dateStr, holidaysSet)) {
      count += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

export function attendanceProgress(workedMinutes, expectedMinutes) {
  if (!Number.isFinite(workedMinutes) || workedMinutes < 0) {
    throw new Error("Worked minutes must be a non-negative number.");
  }
  if (!Number.isFinite(expectedMinutes) || expectedMinutes <= 0) {
    return { percentage: null, complete: false, overtimeMinutes: 0 };
  }
  const percentage = Math.min(100, Math.round((workedMinutes / expectedMinutes) * 100));
  return {
    percentage,
    complete: workedMinutes >= expectedMinutes,
    overtimeMinutes: Math.max(0, workedMinutes - expectedMinutes),
  };
}

export function workedMinutes(checkIn, checkOut, breakMinutes = 0) {
  const start = Date.parse(checkIn);
  const end = Date.parse(checkOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("Attendance timestamps are invalid.");
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    throw new Error("Break duration must be a non-negative whole number of minutes.");
  }
  return Math.max(0, Math.floor((end - start) / 60_000) - breakMinutes);
}

export function localDateTimeToUtc(date, time, zone) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Local date and time must use YYYY-MM-DD and HH:MM formats.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.toISOString().slice(0, 10) !== date) throw new Error("Local date is invalid.");
  let guess = wanted;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const actual = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += wanted - actual;
  }
  const result = new Date(guess);
  const resolved = Object.fromEntries(formatter.formatToParts(result).map((part) => [part.type, part.value]));
  if (
    Number(resolved.year) !== year || Number(resolved.month) !== month || Number(resolved.day) !== day
    || Number(resolved.hour) !== hour || Number(resolved.minute) !== minute
  ) {
    throw new Error("The local time does not exist in the selected timezone.");
  }
  return result;
}

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    throw new Error("Password must be between 12 and 256 characters.");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const [scheme, saltHex, hashHex] = encoded.split(":");
  if (scheme !== "scrypt" || !/^[a-f0-9]{32}$/.test(saltHex ?? "") || !/^[a-f0-9]{128}$/.test(hashHex ?? "")) {
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
