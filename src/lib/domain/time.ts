// Asia/Taipei has a fixed +08:00 offset (no DST). All instants are stored as ISO UTC;
// all calendar math is done on Taipei wall-clock strings to avoid UTC date-splitting bugs.
export const SHOP_TZ = "Asia/Taipei";
const OFFSET = "+08:00";

export function taipeiIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00${OFFSET}`).toISOString();
}

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

export function taipeiParts(iso: string) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    minutes: Number(hour) * 60 + Number(p.minute),
    weekday: new Date(`${p.year}-${p.month}-${p.day}T12:00:00${OFFSET}`).getUTCDay(),
  };
}

export const hhmm = (iso: string) => taipeiParts(iso).time;
export const dateOf = (iso: string) => taipeiParts(iso).date;

export function minutesOf(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function hmFromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return taipeiParts(d.toISOString()).date;
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

export function weekdayLabel(date: string): string {
  return `週${WEEKDAY[new Date(`${date}T12:00:00${OFFSET}`).getUTCDay()]}`;
}

export function formatDateLong(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日 ${weekdayLabel(date)}`;
}

export function formatDateShort(isoOrDate: string): string {
  const date = isoOrDate.length > 10 ? dateOf(isoOrDate) : isoOrDate;
  const [y, m, d] = date.split("-").map(Number);
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export function formatMonthDay(isoOrDate: string): string {
  const date = isoOrDate.length > 10 ? dateOf(isoOrDate) : isoOrDate;
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

/** Age text from a birthdate; null-safe (never shows a wrong "0 歲"). */
export function ageText(birthdate: string | null, estimated: boolean, today: string): string {
  if (!birthdate) return "年齡未提供";
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const text = y >= 1 ? `${y} 歲` : `${months} 個月`;
  return estimated ? `約 ${text}` : text;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}
