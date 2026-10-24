/**
 * Faculty Access Time Utility
 * Manages daily time window restrictions for faculty attendance marking.
 * Default timezone: Asia/Kolkata
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_START_TIME = "07:00";
export const DEFAULT_END_TIME = "10:00";

/**
 * Common timezones for selection in settings
 */
export const SUPPORTED_TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+4:00)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (AST, UTC+3:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT, UTC+8:00)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (BST, UTC+6:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT, UTC-5/-4)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT, UTC-6/-5)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT, UTC-8/-7)" },
];

/**
 * Formats a time string (e.g. "07:00" or "07:00:00") into 12-hour format ("7:00 AM")
 */
export const formatTime12h = (timeStr) => {
  if (!timeStr) return "";
  const parts = String(timeStr).trim().split(":");
  let hours = parseInt(parts[0], 10);
  let minutes = parseInt(parts[1] || "0", 10);

  if (isNaN(hours)) return timeStr;
  if (isNaN(minutes)) minutes = 0;

  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  const minutesFormatted = String(minutes).padStart(2, "0");

  return `${hours12}:${minutesFormatted} ${ampm}`;
};

/**
 * Normalizes time string to standard "HH:mm" (24h) format
 */
export const normalizeTime24h = (timeStr, defaultVal = "07:00") => {
  if (!timeStr) return defaultVal;
  const parts = String(timeStr).trim().split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);
  if (isNaN(h)) return defaultVal;
  return `${String(h).padStart(2, "0")}:${String(isNaN(m) ? 0 : m).padStart(2, "0")}`;
};

/**
 * Converts a "HH:mm" or "HH:mm:ss" string to minutes from midnight (0 - 1439)
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
};

/**
 * Resolves current time in minutes and parts for a specific timezone.
 */
export const getCurrentTimeInZone = (timezone = DEFAULT_TIMEZONE) => {
  const tz = timezone?.trim() || DEFAULT_TIMEZONE;
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const second = parseInt(parts.find((p) => p.type === "second")?.value ?? "0", 10);

    return {
      hour,
      minute,
      second,
      totalMinutes: hour * 60 + minute,
      timezone: tz,
    };
  } catch (err) {
    console.warn(`[timeSettings] invalid timezone '${tz}', falling back to ${DEFAULT_TIMEZONE}:`, err);
    // Fallback to DEFAULT_TIMEZONE
    try {
      const fallbackFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: DEFAULT_TIMEZONE,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      const parts = fallbackFormatter.formatToParts(now);
      const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
      const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
      return {
        hour,
        minute,
        second: 0,
        totalMinutes: hour * 60 + minute,
        timezone: DEFAULT_TIMEZONE,
      };
    } catch {
      const h = now.getHours();
      const m = now.getMinutes();
      return {
        hour: h,
        minute: m,
        second: now.getSeconds(),
        totalMinutes: h * 60 + m,
        timezone: "UTC",
      };
    }
  }
};

/**
 * Evaluates whether faculty access is currently allowed based on center configuration.
 *
 * @param {Object} center - Center record from database or session
 * @param {boolean} [center.faculty_time_restriction_enabled]
 * @param {string} [center.faculty_start_time] - e.g. "07:00"
 * @param {string} [center.faculty_end_time] - e.g. "10:00"
 * @param {string} [center.timezone] - e.g. "Asia/Kolkata"
 *
 * @returns {Object} {
 *   allowed: boolean,
 *   reason?: 'before' | 'after',
 *   message?: string,
 *   formattedStart: string,
 *   formattedEnd: string,
 *   timezone: string
 * }
 */
export const checkFacultyAccessTime = (center) => {
  const isEnabled = Boolean(
    center?.faculty_time_restriction_enabled ??
    center?.facultyTimeRestrictionEnabled
  );

  const startTimeRaw = center?.faculty_start_time || center?.facultyStartTime || DEFAULT_START_TIME;
  const endTimeRaw = center?.faculty_end_time || center?.facultyEndTime || DEFAULT_END_TIME;
  const timezone = center?.timezone || DEFAULT_TIMEZONE;

  const formattedStart = formatTime12h(startTimeRaw);
  const formattedEnd = formatTime12h(endTimeRaw);

  if (!isEnabled) {
    return {
      allowed: true,
      enabled: false,
      formattedStart,
      formattedEnd,
      timezone,
    };
  }

  const { totalMinutes: currentMins } = getCurrentTimeInZone(timezone);
  const startMins = timeToMinutes(startTimeRaw);
  const endMins = timeToMinutes(endTimeRaw);

  // Case 1: Standard daytime window (e.g. 07:00 to 10:00)
  if (startMins <= endMins) {
    if (currentMins < startMins) {
      return {
        allowed: false,
        enabled: true,
        reason: "before",
        message: `Faculty login opens at ${formattedStart}.`,
        formattedStart,
        formattedEnd,
        timezone,
      };
    }

    if (currentMins > endMins) {
      return {
        allowed: false,
        enabled: true,
        reason: "after",
        message: "Faculty attendance access has closed for today.",
        formattedStart,
        formattedEnd,
        timezone,
      };
    }

    return {
      allowed: true,
      enabled: true,
      formattedStart,
      formattedEnd,
      timezone,
    };
  }

  // Case 2: Midnight-crossing window (e.g. 22:00 to 04:00)
  // Allowed if currentMins >= startMins (22:00-23:59) OR currentMins <= endMins (00:00-04:00)
  const isAllowedMidnight = currentMins >= startMins || currentMins <= endMins;

  if (isAllowedMidnight) {
    return {
      allowed: true,
      enabled: true,
      formattedStart,
      formattedEnd,
      timezone,
    };
  }

  // Outside midnight window (between endMins and startMins, e.g. 04:01 to 21:59)
  // If closer to startMins, show opens at start; otherwise closed
  const midPoint = (endMins + startMins) / 2;
  const isBefore = currentMins >= midPoint;

  return {
    allowed: false,
    enabled: true,
    reason: isBefore ? "before" : "after",
    message: isBefore
      ? `Faculty login opens at ${formattedStart}.`
      : "Faculty attendance access has closed for today.",
    formattedStart,
    formattedEnd,
    timezone,
  };
};
