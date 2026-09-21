export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
  abbr: string;
}

export interface TimezoneGroup {
  region: string;
  timezones: TimezoneOption[];
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    region: "North America",
    timezones: [
      { value: "Pacific/Honolulu", label: "Honolulu, USA", offset: "UTC-10:00", abbr: "HST" },
      { value: "America/Anchorage", label: "Anchorage, USA", offset: "UTC-09:00", abbr: "AKST" },
      { value: "America/Los_Angeles", label: "Los Angeles, USA", offset: "UTC-08:00", abbr: "PT" },
      { value: "America/Vancouver", label: "Vancouver, Canada", offset: "UTC-08:00", abbr: "PT" },
      { value: "America/Phoenix", label: "Phoenix, USA", offset: "UTC-07:00", abbr: "MST" },
      { value: "America/Denver", label: "Denver, USA", offset: "UTC-07:00", abbr: "MT" },
      { value: "America/Edmonton", label: "Edmonton, Canada", offset: "UTC-07:00", abbr: "MT" },
      { value: "America/Chicago", label: "Chicago, USA", offset: "UTC-06:00", abbr: "CT" },
      { value: "America/Winnipeg", label: "Winnipeg, Canada", offset: "UTC-06:00", abbr: "CT" },
      { value: "America/New_York", label: "New York, USA", offset: "UTC-05:00", abbr: "ET" },
      { value: "America/Toronto", label: "Toronto, Canada", offset: "UTC-05:00", abbr: "ET" },
      { value: "America/Montreal", label: "Montreal, Canada", offset: "UTC-05:00", abbr: "ET" },
      { value: "America/Halifax", label: "Halifax, Canada", offset: "UTC-04:00", abbr: "AT" },
      { value: "America/St_Johns", label: "St. John's, Canada", offset: "UTC-03:30", abbr: "NT" },
    ]
  },
  {
    region: "Central America & Caribbean",
    timezones: [
      { value: "America/Mexico_City", label: "Mexico City, Mexico", offset: "UTC-06:00", abbr: "CST" },
      { value: "America/Cancun", label: "Cancun, Mexico", offset: "UTC-05:00", abbr: "EST" },
      { value: "America/Guatemala", label: "Guatemala City, Guatemala", offset: "UTC-06:00", abbr: "CST" },
      { value: "America/Costa_Rica", label: "San Jose, Costa Rica", offset: "UTC-06:00", abbr: "CST" },
      { value: "America/Panama", label: "Panama City, Panama", offset: "UTC-05:00", abbr: "EST" },
      { value: "America/Jamaica", label: "Kingston, Jamaica", offset: "UTC-05:00", abbr: "EST" },
      { value: "America/Havana", label: "Havana, Cuba", offset: "UTC-05:00", abbr: "CST" },
      { value: "America/Santo_Domingo", label: "Santo Domingo, Dominican Republic", offset: "UTC-04:00", abbr: "AST" },
      { value: "America/Puerto_Rico", label: "San Juan, Puerto Rico", offset: "UTC-04:00", abbr: "AST" },
    ]
  },
  {
    region: "South America",
    timezones: [
      { value: "America/Bogota", label: "Bogota, Colombia", offset: "UTC-05:00", abbr: "COT" },
      { value: "America/Lima", label: "Lima, Peru", offset: "UTC-05:00", abbr: "PET" },
      { value: "America/Guayaquil", label: "Quito, Ecuador", offset: "UTC-05:00", abbr: "ECT" },
      { value: "America/Caracas", label: "Caracas, Venezuela", offset: "UTC-04:00", abbr: "VET" },
      { value: "America/La_Paz", label: "La Paz, Bolivia", offset: "UTC-04:00", abbr: "BOT" },
      { value: "America/Santiago", label: "Santiago, Chile", offset: "UTC-04:00", abbr: "CLT" },
      { value: "America/Asuncion", label: "Asuncion, Paraguay", offset: "UTC-04:00", abbr: "PYT" },
      { value: "America/Sao_Paulo", label: "Sao Paulo, Brazil", offset: "UTC-03:00", abbr: "BRT" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires, Argentina", offset: "UTC-03:00", abbr: "ART" },
      { value: "America/Montevideo", label: "Montevideo, Uruguay", offset: "UTC-03:00", abbr: "UYT" },
    ]
  },
  {
    region: "Europe",
    timezones: [
      { value: "UTC", label: "UTC", offset: "UTC+00:00", abbr: "UTC" },
      { value: "Atlantic/Reykjavik", label: "Reykjavik, Iceland", offset: "UTC+00:00", abbr: "GMT" },
      { value: "Europe/London", label: "London, UK", offset: "UTC+00:00", abbr: "GMT" },
      { value: "Europe/Dublin", label: "Dublin, Ireland", offset: "UTC+00:00", abbr: "GMT" },
      { value: "Europe/Lisbon", label: "Lisbon, Portugal", offset: "UTC+00:00", abbr: "WET" },
      { value: "Europe/Paris", label: "Paris, France", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Madrid", label: "Madrid, Spain", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Barcelona", label: "Barcelona, Spain", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Berlin", label: "Berlin, Germany", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Amsterdam", label: "Amsterdam, Netherlands", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Brussels", label: "Brussels, Belgium", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Zurich", label: "Zurich, Switzerland", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Rome", label: "Rome, Italy", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Vienna", label: "Vienna, Austria", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Prague", label: "Prague, Czech Republic", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Warsaw", label: "Warsaw, Poland", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Stockholm", label: "Stockholm, Sweden", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Oslo", label: "Oslo, Norway", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Copenhagen", label: "Copenhagen, Denmark", offset: "UTC+01:00", abbr: "CET" },
      { value: "Europe/Athens", label: "Athens, Greece", offset: "UTC+02:00", abbr: "EET" },
      { value: "Europe/Helsinki", label: "Helsinki, Finland", offset: "UTC+02:00", abbr: "EET" },
      { value: "Europe/Bucharest", label: "Bucharest, Romania", offset: "UTC+02:00", abbr: "EET" },
      { value: "Europe/Kyiv", label: "Kyiv, Ukraine", offset: "UTC+02:00", abbr: "EET" },
      { value: "Europe/Moscow", label: "Moscow, Russia", offset: "UTC+03:00", abbr: "MSK" },
      { value: "Europe/Istanbul", label: "Istanbul, Turkey", offset: "UTC+03:00", abbr: "TRT" },
    ]
  },
  {
    region: "Africa",
    timezones: [
      { value: "Africa/Casablanca", label: "Casablanca, Morocco", offset: "UTC+00:00", abbr: "WET" },
      { value: "Africa/Lagos", label: "Lagos, Nigeria", offset: "UTC+01:00", abbr: "WAT" },
      { value: "Africa/Algiers", label: "Algiers, Algeria", offset: "UTC+01:00", abbr: "CET" },
      { value: "Africa/Tunis", label: "Tunis, Tunisia", offset: "UTC+01:00", abbr: "CET" },
      { value: "Africa/Cairo", label: "Cairo, Egypt", offset: "UTC+02:00", abbr: "EET" },
      { value: "Africa/Johannesburg", label: "Johannesburg, South Africa", offset: "UTC+02:00", abbr: "SAST" },
      { value: "Africa/Cape_Town", label: "Cape Town, South Africa", offset: "UTC+02:00", abbr: "SAST" },
      { value: "Africa/Nairobi", label: "Nairobi, Kenya", offset: "UTC+03:00", abbr: "EAT" },
      { value: "Africa/Addis_Ababa", label: "Addis Ababa, Ethiopia", offset: "UTC+03:00", abbr: "EAT" },
    ]
  },
  {
    region: "Middle East",
    timezones: [
      { value: "Asia/Jerusalem", label: "Jerusalem, Israel", offset: "UTC+02:00", abbr: "IST" },
      { value: "Asia/Tel_Aviv", label: "Tel Aviv, Israel", offset: "UTC+02:00", abbr: "IST" },
      { value: "Asia/Beirut", label: "Beirut, Lebanon", offset: "UTC+02:00", abbr: "EET" },
      { value: "Asia/Amman", label: "Amman, Jordan", offset: "UTC+03:00", abbr: "AST" },
      { value: "Asia/Baghdad", label: "Baghdad, Iraq", offset: "UTC+03:00", abbr: "AST" },
      { value: "Asia/Kuwait", label: "Kuwait City, Kuwait", offset: "UTC+03:00", abbr: "AST" },
      { value: "Asia/Riyadh", label: "Riyadh, Saudi Arabia", offset: "UTC+03:00", abbr: "AST" },
      { value: "Asia/Qatar", label: "Doha, Qatar", offset: "UTC+03:00", abbr: "AST" },
      { value: "Asia/Bahrain", label: "Manama, Bahrain", offset: "UTC+03:00", abbr: "AST" },
      { value: "Asia/Tehran", label: "Tehran, Iran", offset: "UTC+03:30", abbr: "IRST" },
      { value: "Asia/Dubai", label: "Dubai, UAE", offset: "UTC+04:00", abbr: "GST" },
      { value: "Asia/Muscat", label: "Muscat, Oman", offset: "UTC+04:00", abbr: "GST" },
    ]
  },
  {
    region: "Asia",
    timezones: [
      { value: "Asia/Karachi", label: "Karachi, Pakistan", offset: "UTC+05:00", abbr: "PKT" },
      { value: "Asia/Tashkent", label: "Tashkent, Uzbekistan", offset: "UTC+05:00", abbr: "UZT" },
      { value: "Asia/Kolkata", label: "Mumbai, India", offset: "UTC+05:30", abbr: "IST" },
      { value: "Asia/Colombo", label: "Colombo, Sri Lanka", offset: "UTC+05:30", abbr: "SLST" },
      { value: "Asia/Kathmandu", label: "Kathmandu, Nepal", offset: "UTC+05:45", abbr: "NPT" },
      { value: "Asia/Dhaka", label: "Dhaka, Bangladesh", offset: "UTC+06:00", abbr: "BST" },
      { value: "Asia/Almaty", label: "Almaty, Kazakhstan", offset: "UTC+06:00", abbr: "ALMT" },
      { value: "Asia/Yangon", label: "Yangon, Myanmar", offset: "UTC+06:30", abbr: "MMT" },
      { value: "Asia/Bangkok", label: "Bangkok, Thailand", offset: "UTC+07:00", abbr: "ICT" },
      { value: "Asia/Jakarta", label: "Jakarta, Indonesia", offset: "UTC+07:00", abbr: "WIB" },
      { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City, Vietnam", offset: "UTC+07:00", abbr: "ICT" },
      { value: "Asia/Singapore", label: "Singapore", offset: "UTC+08:00", abbr: "SGT" },
      { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur, Malaysia", offset: "UTC+08:00", abbr: "MYT" },
      { value: "Asia/Hong_Kong", label: "Hong Kong", offset: "UTC+08:00", abbr: "HKT" },
      { value: "Asia/Shanghai", label: "Shanghai, China", offset: "UTC+08:00", abbr: "CST" },
      { value: "Asia/Beijing", label: "Beijing, China", offset: "UTC+08:00", abbr: "CST" },
      { value: "Asia/Taipei", label: "Taipei, Taiwan", offset: "UTC+08:00", abbr: "CST" },
      { value: "Asia/Manila", label: "Manila, Philippines", offset: "UTC+08:00", abbr: "PHT" },
      { value: "Asia/Seoul", label: "Seoul, South Korea", offset: "UTC+09:00", abbr: "KST" },
      { value: "Asia/Tokyo", label: "Tokyo, Japan", offset: "UTC+09:00", abbr: "JST" },
    ]
  },
  {
    region: "Australia & Pacific",
    timezones: [
      { value: "Australia/Perth", label: "Perth, Australia", offset: "UTC+08:00", abbr: "AWST" },
      { value: "Australia/Darwin", label: "Darwin, Australia", offset: "UTC+09:30", abbr: "ACST" },
      { value: "Australia/Adelaide", label: "Adelaide, Australia", offset: "UTC+09:30", abbr: "ACST" },
      { value: "Australia/Brisbane", label: "Brisbane, Australia", offset: "UTC+10:00", abbr: "AEST" },
      { value: "Australia/Sydney", label: "Sydney, Australia", offset: "UTC+10:00", abbr: "AEST" },
      { value: "Australia/Melbourne", label: "Melbourne, Australia", offset: "UTC+10:00", abbr: "AEST" },
      { value: "Australia/Hobart", label: "Hobart, Australia", offset: "UTC+10:00", abbr: "AEST" },
      { value: "Pacific/Guam", label: "Guam", offset: "UTC+10:00", abbr: "ChST" },
      { value: "Pacific/Port_Moresby", label: "Port Moresby, Papua New Guinea", offset: "UTC+10:00", abbr: "PGT" },
      { value: "Pacific/Noumea", label: "Noumea, New Caledonia", offset: "UTC+11:00", abbr: "NCT" },
      { value: "Pacific/Auckland", label: "Auckland, New Zealand", offset: "UTC+12:00", abbr: "NZST" },
      { value: "Pacific/Wellington", label: "Wellington, New Zealand", offset: "UTC+12:00", abbr: "NZST" },
      { value: "Pacific/Fiji", label: "Suva, Fiji", offset: "UTC+12:00", abbr: "FJT" },
      { value: "Pacific/Tongatapu", label: "Nuku'alofa, Tonga", offset: "UTC+13:00", abbr: "TOT" },
      { value: "Pacific/Apia", label: "Apia, Samoa", offset: "UTC+13:00", abbr: "WST" },
    ]
  }
];

export const COMMON_TIMEZONES: TimezoneOption[] = TIMEZONE_GROUPS.flatMap(group => group.timezones);

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Asia/Kolkata";
  }
}

export function getTimezoneFromCoordinates(lat: number, lng: number): string | null {
  if (lat >= 25 && lat <= 50 && lng >= -130 && lng <= -60) {
    if (lng < -115) return "America/Los_Angeles";
    if (lng < -100) return "America/Denver";
    if (lng < -85) return "America/Chicago";
    return "America/New_York";
  }
  if (lat >= -60 && lat <= 15 && lng >= -80 && lng <= -35) {
    if (lng < -60) return "America/Lima";
    return "America/Sao_Paulo";
  }
  if (lat >= 35 && lat <= 70 && lng >= -10 && lng <= 40) {
    if (lng < 0) return "Europe/London";
    if (lng < 15) return "Europe/Paris";
    if (lng < 30) return "Europe/Athens";
    return "Europe/Moscow";
  }
  if (lat >= -35 && lat <= 35 && lng >= -20 && lng <= 55) {
    if (lng < 20) return "Africa/Lagos";
    if (lat < -20) return "Africa/Johannesburg";
    return "Africa/Nairobi";
  }
  if (lat >= 10 && lat <= 45 && lng >= 40 && lng <= 80) {
    if (lng < 60) return "Asia/Dubai";
    return "Asia/Karachi";
  }
  if (lat >= 5 && lat <= 35 && lng >= 68 && lng <= 98) {
    return "Asia/Kolkata";
  }
  if (lat >= -10 && lat <= 25 && lng >= 95 && lng <= 120) {
    return "Asia/Bangkok";
  }
  if (lat >= 15 && lat <= 55 && lng >= 100 && lng <= 145) {
    if (lat > 30) return "Asia/Tokyo";
    return "Asia/Hong_Kong";
  }
  if (lat >= -45 && lat <= -10 && lng >= 110 && lng <= 155) {
    return "Australia/Sydney";
  }
  if (lat >= -50 && lat <= -30 && lng >= 165 && lng <= 180) {
    return "Pacific/Auckland";
  }
  return null;
}

const TIMEZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ujjain": "Asia/Kolkata",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Asia/Chongqing": "Asia/Shanghai",
  "Asia/Chungking": "Asia/Shanghai",
  "Asia/Harbin": "Asia/Shanghai",
  "Asia/Tel_Aviv": "Asia/Jerusalem",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Nicosia": "Asia/Nicosia",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "US/Alaska": "America/Anchorage",
  "US/Hawaii": "Pacific/Honolulu",
  "US/Arizona": "America/Phoenix",
  "Canada/Eastern": "America/Toronto",
  "Canada/Central": "America/Winnipeg",
  "Canada/Mountain": "America/Edmonton",
  "Canada/Pacific": "America/Vancouver",
  "Canada/Atlantic": "America/Halifax",
  "Canada/Newfoundland": "America/St_Johns",
  "Australia/ACT": "Australia/Sydney",
  "Australia/Canberra": "Australia/Sydney",
  "Australia/NSW": "Australia/Sydney",
  "Australia/North": "Australia/Darwin",
  "Australia/Queensland": "Australia/Brisbane",
  "Australia/South": "Australia/Adelaide",
  "Australia/Tasmania": "Australia/Hobart",
  "Australia/Victoria": "Australia/Melbourne",
  "Australia/West": "Australia/Perth",
  "Australia/LHI": "Australia/Lord_Howe",
  "Pacific/Samoa": "Pacific/Pago_Pago",
  "Etc/GMT": "UTC",
  "Etc/UTC": "UTC",
  "Etc/Greenwich": "UTC",
  "GMT": "UTC",
};

function normalizeTimezone(tz: string): string {
  return TIMEZONE_ALIASES[tz] || tz;
}

function findTimezoneInGroups(timezoneValue: string): TimezoneOption | undefined {
  const normalized = normalizeTimezone(timezoneValue);
  for (const group of TIMEZONE_GROUPS) {
    const tz = group.timezones.find(t => t.value === normalized);
    if (tz) return tz;
  }
  return undefined;
}

export function getTimezoneLabel(timezoneValue: string): string {
  const tz = findTimezoneInGroups(timezoneValue);
  if (tz) return tz.label;
  return timezoneValue;
}

export function getTimezoneOffset(timezoneValue: string): string {
  const tz = findTimezoneInGroups(timezoneValue);
  if (tz) return tz.offset;
  return "";
}

export function formatTimezoneShort(timezoneValue: string): string {
  const tz = findTimezoneInGroups(timezoneValue);
  if (tz) return `${tz.abbr} (${tz.label})`;

  try {
    const normalized = normalizeTimezone(timezoneValue);
    const offsetMinutes = getOffsetMinutesForTimezone(normalized);
    if (offsetMinutes !== null) {
      for (const group of TIMEZONE_GROUPS) {
        for (const candidate of group.timezones) {
          const candidateOffset = getOffsetMinutesForTimezone(candidate.value);
          if (candidateOffset === offsetMinutes) {
            return `${candidate.abbr} (${candidate.label})`;
          }
        }
      }
    }
  } catch {}

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneValue,
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    const shortName = tzPart?.value || timezoneValue;
    if (!shortName.startsWith('GMT')) return shortName;
    return shortName;
  } catch {
    return timezoneValue;
  }
}

function getOffsetMinutesForTimezone(tz: string): number | null {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  } catch {
    return null;
  }
}

export function getDatePartsInTimezone(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  let hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  if (hour === 24) hour = 0;
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '1'),
    day: parseInt(parts.find(p => p.type === 'day')?.value || '1'),
    hour,
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0')
  };
}

export function dateTimeToUTC(dateStr: string, time24: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = time24.split(':').map(Number);

  let utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  for (let i = 0; i < 3; i++) {
    const inTz = getDatePartsInTimezone(utcGuess, timezone);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const currentMs = Date.UTC(inTz.year, inTz.month - 1, inTz.day, inTz.hour, inTz.minute, 0);
    const diffMs = targetMs - currentMs;

    if (Math.abs(diffMs) < 60000) break;
    utcGuess = new Date(utcGuess.getTime() + diffMs);
  }

  return utcGuess;
}

export interface ConvertedTime {
  time: string;
  date: string;
  timezone: string;
  dateChanged: boolean;
}

export function convertTimeBetweenTimezones(
  time24: string,
  dateStr: string,
  fromTimezone: string,
  toTimezone: string
): ConvertedTime {
  if (fromTimezone === toTimezone) {
    return { time: time24, date: dateStr, timezone: toTimezone, dateChanged: false };
  }

  try {
    const utcDate = dateTimeToUTC(dateStr, time24, fromTimezone);
    const result = getDatePartsInTimezone(utcDate, toTimezone);

    const convertedTime = `${String(result.hour).padStart(2, '0')}:${String(result.minute).padStart(2, '0')}`;
    const convertedDate = `${result.year}-${String(result.month).padStart(2, '0')}-${String(result.day).padStart(2, '0')}`;

    return {
      time: convertedTime,
      date: convertedDate,
      timezone: toTimezone,
      dateChanged: convertedDate !== dateStr
    };
  } catch (e) {
    console.error('Timezone conversion error:', e);
    return { time: time24, date: dateStr, timezone: fromTimezone, dateChanged: false };
  }
}

export function convertTimeToVisitorTimezone(
  time: string,
  date: string,
  eventTimezone: string,
  visitorTimezone?: string
): { time: string; date: string; timezone: string } {
  const targetTz = visitorTimezone || getBrowserTimezone();
  const result = convertTimeBetweenTimezones(time, date, eventTimezone, targetTz);
  return { time: result.time, date: result.date, timezone: result.timezone };
}

export function formatTime24to12(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function formatTime12to24(time12: string): string {
  const match = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time12;
  let [, hourStr, minuteStr, period] = match;
  let hour = parseInt(hourStr);
  if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minuteStr}`;
}

export function convertSlotToVisitorTimezone(
  slot12h: string,
  selectedDate: Date,
  coachTimezone: string,
  visitorTimezone?: string
): { displayTime: string; time24InCoachTz: string; dateChanged: boolean; convertedDate: string } {
  const targetTz = visitorTimezone || getBrowserTimezone();
  const time24 = formatTime12to24(slot12h);
  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

  if (coachTimezone === targetTz) {
    return {
      displayTime: slot12h,
      time24InCoachTz: time24,
      dateChanged: false,
      convertedDate: dateStr
    };
  }

  const converted = convertTimeBetweenTimezones(time24, dateStr, coachTimezone, targetTz);
  return {
    displayTime: formatTime24to12(converted.time),
    time24InCoachTz: time24,
    dateChanged: converted.dateChanged,
    convertedDate: converted.date
  };
}

export function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
  eventTimezone: string,
  visitorTimezone?: string
): { displayStart: string; displayEnd: string; displayTimezone: string; isConverted: boolean; dateNote: string } {
  const targetTz = visitorTimezone || getBrowserTimezone();
  const isConverted = eventTimezone !== targetTz;

  if (!startTime) {
    return { displayStart: '', displayEnd: '', displayTimezone: eventTimezone, isConverted: false, dateNote: '' };
  }

  if (!isConverted) {
    return {
      displayStart: formatTime24to12(startTime),
      displayEnd: endTime ? formatTime24to12(endTime) : '',
      displayTimezone: eventTimezone,
      isConverted: false,
      dateNote: ''
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const convertedStart = convertTimeBetweenTimezones(startTime, today, eventTimezone, targetTz);
  let convertedEnd = { time: '', date: today, dateChanged: false, timezone: targetTz };
  if (endTime) {
    convertedEnd = convertTimeBetweenTimezones(endTime, today, eventTimezone, targetTz);
  }

  return {
    displayStart: formatTime24to12(convertedStart.time),
    displayEnd: endTime ? formatTime24to12(convertedEnd.time) : '',
    displayTimezone: targetTz,
    isConverted: true,
    dateNote: convertedStart.dateChanged ? '(next day)' : ''
  };
}

export function formatEventTimeForDisplay(
  startTime: string | null,
  endTime: string | null,
  eventDate: string,
  eventTimezone: string,
  visitorTimezone?: string
): {
  displayStart: string;
  displayEnd: string;
  displayDate: string;
  displayTimezone: string;
  originalTimezone: string;
  isConverted: boolean;
  dateChanged: boolean;
} {
  const targetTz = visitorTimezone || getBrowserTimezone();
  const isConverted = eventTimezone !== targetTz;

  if (!startTime) {
    return {
      displayStart: '',
      displayEnd: '',
      displayDate: eventDate,
      displayTimezone: eventTimezone,
      originalTimezone: eventTimezone,
      isConverted: false,
      dateChanged: false
    };
  }

  if (!isConverted) {
    return {
      displayStart: formatTime24to12(startTime),
      displayEnd: endTime ? formatTime24to12(endTime) : '',
      displayDate: eventDate,
      displayTimezone: eventTimezone,
      originalTimezone: eventTimezone,
      isConverted: false,
      dateChanged: false
    };
  }

  const convertedStart = convertTimeBetweenTimezones(startTime, eventDate, eventTimezone, targetTz);
  let displayEnd = '';
  if (endTime) {
    const convertedEnd = convertTimeBetweenTimezones(endTime, eventDate, eventTimezone, targetTz);
    displayEnd = formatTime24to12(convertedEnd.time);
  }

  return {
    displayStart: formatTime24to12(convertedStart.time),
    displayEnd,
    displayDate: convertedStart.date,
    displayTimezone: targetTz,
    originalTimezone: eventTimezone,
    isConverted: true,
    dateChanged: convertedStart.dateChanged
  };
}

export function isEventPast(event: {
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  date?: string | Date | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
}): boolean {
  // New schema: use startAt/endAt
  if (event.startAt) {
    const ref = event.endAt ? new Date(event.endAt) : new Date(event.startAt);
    const threshold = new Date(ref.getTime() + 12 * 60 * 60 * 1000);
    return new Date() > threshold;
  }
  // Legacy fallback: use date/startTime/endTime
  if (event.date) {
    const dateStr = typeof event.date === 'string'
      ? event.date.split('T')[0]
      : event.date.toISOString().split('T')[0];
    const timeStr = event.endTime || event.startTime || '00:00';
    const tz = event.timezone || 'UTC';
    const eventEndUTC = dateTimeToUTC(dateStr, timeStr, tz);
    const threshold = new Date(eventEndUTC.getTime() + 12 * 60 * 60 * 1000);
    return new Date() > threshold;
  }
  return false;
}
