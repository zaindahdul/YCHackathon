import { describe, expect, it } from "vitest";
import { capsFromEnv, isBot, isEmail, judge, maskEmail, slugify, withDefaults } from "../server/rules.ts";

const stats = (over: Partial<Parameters<typeof judge>[0]> = {}) => ({ ageHours: 3, touches: 20, views: 0, signups: 0, impressions: 0, ...over });

describe("judge", () => {
  it("waits before judging a young experiment", () => {
    expect(judge(stats({ ageHours: 0.5, touches: 3 })).verdict).toBe("too_early");
  });

  it("calls lots of outreach with no visitors a reach problem, not a product problem", () => {
    const j = judge(stats({ touches: 20, views: 4, impressions: 900 }));
    expect(j.verdict).toBe("no_reach");
    expect(j.reason).toMatch(/fix the channel/);
  });

  it("flags an experiment starved of outreach", () => {
    expect(judge(stats({ ageHours: 7, touches: 2, views: 1 })).verdict).toBe("no_reach");
  });

  it("kills an offer people saw and did not want", () => {
    const j = judge(stats({ views: 60, signups: 0 }));
    expect(j.verdict).toBe("kill");
    expect(j.signupRate).toBe(0);
  });

  it("keeps a promising offer and scales a strong one", () => {
    expect(judge(stats({ views: 40, signups: 2 })).verdict).toBe("keep");
    expect(judge(stats({ views: 30, signups: 3 })).verdict).toBe("scale");
  });

  it("scales on raw signups even before there are enough visitors to compute a rate", () => {
    expect(judge(stats({ views: 6, signups: 5 })).verdict).toBe("scale");
  });

  it("honours per-experiment threshold overrides and ignores junk", () => {
    const t = withDefaults({ minViews: 10, killRate: 0.2, scaleRate: 0.5, minTouches: -1 });
    expect(t.minViews).toBe(10);
    expect(t.minTouches).toBe(12);
    // Under the defaults 10 visitors are too few to judge the offer; this experiment asked for a 20% bar at 10.
    expect(judge(stats({ views: 10, signups: 1 })).verdict).toBe("no_reach");
    expect(judge(stats({ views: 10, signups: 1 }), t).verdict).toBe("kill");
  });
});

describe("helpers", () => {
  it("masks emails for the public page", () => {
    expect(maskEmail("jane.doe@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("nope")).toBe("***");
  });

  it("makes clean slugs", () => {
    expect(slugify("Launch-day QA Teardown!")).toBe("launch-day-qa-teardown");
    expect(slugify("Café résumé")).toBe("cafe-resume");
    expect(slugify("!!!")).toBe("offer");
  });

  it("validates emails", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("not an email")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
  });

  it("does not count link-preview crawlers as visitors", () => {
    expect(isBot("Twitterbot/1.0")).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")).toBe(false);
  });

  it("reads quota caps from the environment", () => {
    expect(capsFromEnv({ EMAIL_CAP_PER_DAY: "10" })).toEqual({ emailsPerDay: 10, xPostsPerDay: 16 });
    expect(capsFromEnv({ EMAIL_CAP_PER_DAY: "lots" }).emailsPerDay).toBe(40);
  });
});
