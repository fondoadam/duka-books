import { describe, expect, it } from "vitest";
import { resolvePeriod } from "../convex/lib/periods";

describe("resolvePeriod", () => {
  it("this_week on a Sunday covers Mon–Sun", () => {
    expect(resolvePeriod("this_week", "2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("this_week on a Monday starts that day", () => {
    expect(resolvePeriod("this_week", "2026-10-26")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("last_week is the Mon–Sun before", () => {
    expect(resolvePeriod("last_week", "2026-10-29")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("today and yesterday, across a month boundary", () => {
    expect(resolvePeriod("today", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(resolvePeriod("yesterday", "2026-11-01")).toEqual({ from: "2026-10-31", to: "2026-10-31" });
  });

  it("months, including last_month in January and a leap February", () => {
    expect(resolvePeriod("this_month", "2026-10-29")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("last_month", "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(resolvePeriod("last_month", "2028-03-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});
