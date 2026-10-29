import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 16:00 UTC = 19:00 Nairobi (no daylight saving), after most dukas' evening rush.
crons.cron("evening summary", "0 16 * * *", internal.summaries.evening, {});

export default crons;
