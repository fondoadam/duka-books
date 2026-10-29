export const PERIODS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month"] as const;
export type Period = (typeof PERIODS)[number];

// Dates are Nairobi calendar days as YYYY-MM-DD; the arithmetic runs in UTC so no clock offset leaks in.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

// Weeks start Monday. Both ends are inclusive.
export function resolvePeriod(name: Period, today: string): { from: string; to: string } {
  const t = day(today);
  const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
  const month = (offset: number) => ({
    from: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1))),
    to: iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset + 1, 0))),
  });
  switch (name) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: iso(addDays(t, -1)), to: iso(addDays(t, -1)) };
    case "this_week":
      return { from: iso(monday), to: iso(addDays(monday, 6)) };
    case "last_week":
      return { from: iso(addDays(monday, -7)), to: iso(addDays(monday, -1)) };
    case "this_month":
      return month(0);
    case "last_month":
      return month(-1);
  }
}

// Today's date in Nairobi (UTC+3, no daylight saving).
export const nairobiToday = (now = Date.now()) => new Date(now).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
