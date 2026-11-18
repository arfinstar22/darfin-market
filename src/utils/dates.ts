import { env } from "../config/env.js";

export function nowIsoUtc(): string {
  return new Date().toISOString();
}

export function unixSecondsToIsoUtc(seconds: number | undefined | null): string | undefined {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString();
}

export function isTimestampStale(
  sourceUpdatedAtIso: string | undefined,
  maxAgeSeconds: number,
  nowMs: number = Date.now(),
): boolean {
  if (!sourceUpdatedAtIso) {
    return false;
  }
  const parsed = Date.parse(sourceUpdatedAtIso);
  if (Number.isNaN(parsed)) {
    return true;
  }
  const ageSeconds = (nowMs - parsed) / 1000;
  return ageSeconds > maxAgeSeconds;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function formatTimestampForUser(
  isoString: string | Date | undefined,
  timezone: string = env.APP_TIMEZONE,
): string {
  if (!isoString) {
    return "tidak diketahui";
  }
  const date = typeof isoString === "string" ? new Date(isoString) : isoString;
  if (Number.isNaN(date.getTime())) {
    return "tidak diketahui";
  }
  const safeTz = isValidTimezone(timezone) ? timezone : env.APP_TIMEZONE;
  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone: safeTz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);

  const tzShort = getTimezoneLabel(safeTz);
  return `${formatted} ${tzShort}`;
}

export function getTimezoneLabel(timezone: string): string {
  switch (timezone) {
    case "Asia/Jakarta":
      return "WIB";
    case "Asia/Makassar":
      return "WITA";
    case "Asia/Jayapura":
      return "WIT";
    case "UTC":
      return "UTC";
    default:
      return timezone;
  }
}
