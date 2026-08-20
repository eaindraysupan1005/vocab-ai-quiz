// Every "what day is it" decision in the app goes through here.
//
// The app used to date things with `new Date().toISOString().slice(0, 10)`,
// which is UTC. For a learner in Bangkok (UTC+7) that rolls the day over at
// 07:00 local: study at 11pm and you'd be served tomorrow's batch, and the
// daily quiz would unlock against a batch you hadn't seen. `weekStartIso` was
// worse — it found the Monday with local `getDay()`/`setDate()` and then
// serialised as UTC, so its two halves disagreed with each other.
//
// The learner's timezone isn't stored per user, so the app runs on one:
// APP_TIMEZONE, defaulting to Asia/Bangkok. A per-user column would be the
// real fix if the app ever has learners in more than one place.
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Bangkok";

// en-CA formats as YYYY-MM-DD, which is the shape Postgres `date` columns want.
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The calendar date in the app's timezone, as YYYY-MM-DD.
export function todayIso(now: Date = new Date()): string {
  return formatter.format(now);
}

// The calendar date a stored timestamptz falls on, in the app's timezone.
// Postgres hands these back as UTC ISO strings, so slicing the first 10
// characters buckets an 11pm Bangkok answer onto the following day.
export function isoDayOf(timestamp: string): string {
  return formatter.format(new Date(timestamp));
}

// Day of week in the app's timezone, 0 = Sunday. Derived from the formatted
// date rather than `getDay()` so it can't disagree with `todayIso`.
function dayOfWeek(iso: string): number {
  // Parsed as UTC midnight — safe here because this is a bare calendar date
  // with no time component, so no zone conversion can shift it.
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

// Adds (or subtracts) whole days to a YYYY-MM-DD date, staying in calendar
// space. No timezone involved: shifting a date by days can't cross a DST
// boundary the way shifting a timestamp can.
export function addDaysIso(days: number, from: string = todayIso()): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The UTC instant at which a calendar date begins in the app's timezone, for
// comparing against `timestamptz` columns. Filtering `learned_at >= "2026-08-17
// T00:00:00Z"` drops everything a Bangkok learner did before 7am that day.
//
// Works by asking what the app-zone wall clock reads at UTC midnight and
// subtracting the difference. That reads the offset at one instant, so a zone
// changing offset within the day (DST) could be an hour out; Asia/Bangkok has
// no DST, and an hour's skew at a day boundary is not worth a date library.
export function startOfDayUtc(iso: string): string {
  const utcMidnight = new Date(`${iso}T00:00:00Z`);
  const asZone = new Date(utcMidnight.toLocaleString("en-US", { timeZone: APP_TIMEZONE }));
  const asUtc = new Date(utcMidnight.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utcMidnight.getTime() - (asZone.getTime() - asUtc.getTime())).toISOString();
}

// The Monday of the current week, used as the weekly quiz's `quiz_date` so a
// week's answers all land on one quizzes row no matter which day they're given.
export function weekStartIso(now: Date = new Date()): string {
  const today = todayIso(now);
  const daysSinceMonday = (dayOfWeek(today) + 6) % 7;
  return addDaysIso(-daysSinceMonday, today);
}
