import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const OTP_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const OTP_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const OTP_DIGITS = "23456789";

export function generateNonZero4Digits() {
  const digits = "123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += digits[randomInt(0, 9)];
  }
  return result;
}

export function makeCompanyEmployeeId(year, code) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Employee ID year must be a four-digit year.");
  }
  let codeStr;
  if (code === undefined) {
    codeStr = generateNonZero4Digits();
  } else {
    const suppliedCode = String(code).trim();
    if (!/^\d{1,4}$/.test(suppliedCode) || Number(suppliedCode) <= 0) {
      throw new Error("Employee ID sequence must be a positive integer from 1 to 9999.");
    }
    codeStr = suppliedCode.padStart(4, "0");
  }
  return `MM-${year}-${codeStr}`;
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

export function evaluateAttendanceDayPolicy(dateStr, holidaysSource = new Map()) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // 1. Sunday check
  if (dayOfWeek === 0) {
    return {
      date: dateStr,
      isWorkingDay: false,
      reason: "sunday",
      holidayName: null,
      message: "Today is Sunday, a company weekly off. Check-in is unavailable.",
    };
  }

  // 2. Second Saturday check
  if (isSecondSaturday(dateStr)) {
    return {
      date: dateStr,
      isWorkingDay: false,
      reason: "second_saturday",
      holidayName: null,
      message: "Today is the second Saturday, a company weekly off. Check-in is unavailable.",
    };
  }

  // 3. Configured company holiday check
  let holidayName = null;
  if (holidaysSource instanceof Map) {
    if (holidaysSource.has(dateStr)) {
      holidayName = holidaysSource.get(dateStr) || "Company Holiday";
    }
  } else if (holidaysSource instanceof Set) {
    if (holidaysSource.has(dateStr)) {
      holidayName = "Company Holiday";
    }
  } else if (Array.isArray(holidaysSource)) {
    const match = holidaysSource.find((h) => (h?.holiday_date || h?.holidayDate || h?.date) === dateStr);
    if (match) {
      holidayName = match.name || "Company Holiday";
    }
  } else if (typeof holidaysSource === "object" && holidaysSource !== null) {
    if (dateStr in holidaysSource) {
      holidayName = holidaysSource[dateStr] || "Company Holiday";
    }
  }

  if (holidayName !== null) {
    const holidayLabel = typeof holidayName === "string" && holidayName.trim() ? holidayName.trim() : "";
    const message = holidayLabel && holidayLabel !== "Company Holiday"
      ? `Today is a company holiday (${holidayLabel}). Check-in is unavailable.`
      : "Today is a company holiday. Check-in is unavailable.";
    return {
      date: dateStr,
      isWorkingDay: false,
      reason: "company_holiday",
      holidayName: holidayLabel || null,
      message,
    };
  }

  // 4. Scheduled working day (Monday - Friday, 1st, 3rd, 4th, 5th Saturday)
  return {
    date: dateStr,
    isWorkingDay: true,
    reason: "working_day",
    holidayName: null,
    message: "Today is a scheduled working day.",
  };
}

export function isCompanyHoliday(dateStr, holidaysSet = new Set()) {
  const policy = evaluateAttendanceDayPolicy(dateStr, holidaysSet);
  return !policy.isWorkingDay;
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

export function validateUploadedDataUrl(
  value,
  { allowPdf = false, maxBytes = 2 * 1024 * 1024, fieldLabel = "File" } = {},
) {
  const allowedLabel = allowPdf ? "JPG, PNG, WebP, or PDF" : "PNG, JPG, or WebP";
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldLabel} is required.`);
  }
  const trimmed = value.trim();
  const pattern = allowPdf
    ? /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/
    : /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
  const match = pattern.exec(trimmed);
  if (!match) {
    throw new Error(`${fieldLabel} must be a valid ${allowedLabel} file (max ${Math.round(maxBytes / (1024 * 1024))} MB).`);
  }
  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error(`${fieldLabel} must be less than ${Math.round(maxBytes / (1024 * 1024))}MB.`);
  }
  const isPng = mimeType === "image/png" &&
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
  const isJpeg = mimeType === "image/jpeg" &&
    buffer.length >= 3 &&
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = mimeType === "image/webp" &&
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const isPdf = allowPdf && mimeType === "application/pdf" &&
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!isPng && !isJpeg && !isWebp && !isPdf) {
    throw new Error(`${fieldLabel} must be a valid ${allowedLabel} file (max ${Math.round(maxBytes / (1024 * 1024))} MB).`);
  }
  return {
    mimeType,
    sizeBytes: buffer.length,
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
  };
}
