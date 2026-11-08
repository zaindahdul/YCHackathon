import { describe, expect, it } from "vitest";
import {
  capsFromEnv,
  cleanPath,
  isBot,
  isEmail,
  judge,
  maskEmail,
  slugify,
  withDefaults,
  type CompanyStats,
} from "../server/rules.ts";

const live = (over: Partial<CompanyStats> = {}): CompanyStats => ({
  status: "live",
  hoursSinceCreated: 4,
  hoursLive: 3,
  touches: 12,
  visitors: 0,
  activeUsers: 0,
  returningUsers: 0,
  signups: 0,
  ...over,
});

describe("judge", () => {
  it("tells a founder who has not shipped to ship", () => {
    expect(
      judge(live({ status: "building", hoursSinceCreated: 0.5 })).verdict,
    ).toBe("building");
    expect(
      judge(live({ status: "building", hoursSinceCreated: 3 })).verdict,
    ).toBe("stalled");
  });

  it("waits before judging a fresh launch", () => {
    expect(judge(live({ hoursLive: 0.5, touches: 2 })).verdict).toBe(
      "too_early",
    );
  });

  it("calls outreach with no visitors a reach problem, not a product problem", () => {
    const j = judge(live({ visitors: 5 }));
    expect(j.verdict).toBe("no_reach");
    expect(j.reason).toMatch(/fix the channel/);
    expect(judge(live({ hoursLive: 5, touches: 1 })).verdict).toBe("no_reach");
  });

  it("asks for an iteration when people visit but do not use it", () => {
    const j = judge(live({ visitors: 60, activeUsers: 1 }));
    expect(j.verdict).toBe("iterate");
    expect(j.activation).toBeCloseTo(1 / 60);
  });

  it("keeps a product people use, and scales one they come back to", () => {
    expect(judge(live({ visitors: 40, activeUsers: 6 })).verdict).toBe("keep");
    expect(judge(live({ visitors: 40, activeUsers: 10 })).verdict).toBe(
      "scale",
    );
    expect(
      judge(live({ visitors: 8, activeUsers: 4, returningUsers: 3 })).verdict,
    ).toBe("scale");
  });

  it("stops judging an ended company", () => {
    expect(judge(live({ status: "killed" })).verdict).toBe("ended");
  });

  it("honours per-company threshold overrides and ignores junk", () => {
    const t = withDefaults({
      minVisitors: 10,
      killActivation: 0.5,
      scaleUsers: -1,
    });
    expect(t.scaleUsers).toBe(10);
    expect(judge(live({ visitors: 10, activeUsers: 3 }), t).verdict).toBe(
      "iterate",
    );
  });
  it("cannot create a scale verdict from zero or fractional evidence thresholds", () => {
    const t = withDefaults({
      scaleUsers: 0,
      scaleReturning: 0,
      minVisitors: 0,
      minTouches: 0,
    });
    expect(t.scaleUsers).toBe(10);
    expect(t.scaleReturning).toBe(3);
    expect(t.minVisitors).toBe(30);
    expect(judge(live(), t).verdict).not.toBe("scale");
    expect(
      withDefaults({ scaleUsers: 0.5, killActivation: 2 }).scaleUsers,
    ).toBe(10);
    expect(withDefaults({ killActivation: 2 }).killActivation).toBe(0.05);
  });
});

describe("helpers", () => {
  it("masks emails", () => {
    expect(maskEmail("jane.doe@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("nope")).toBe("***");
  });

  it("makes clean slugs", () => {
    expect(slugify("Invoice Chaser!")).toBe("invoice-chaser");
    expect(slugify("Café résumé")).toBe("cafe-resume");
    expect(slugify("!!!")).toBe("company");
  });

  it("only accepts safe product paths", () => {
    expect(cleanPath("index.html")).toBe("index.html");
    expect(cleanPath("/assets/app.js")).toBe("assets/app.js");
    expect(cleanPath("../secrets.js")).toBeNull();
    expect(cleanPath("a//b.js")).toBeNull();
    expect(cleanPath("server.php")).toBeNull();
    expect(cleanPath("noext")).toBeNull();
  });

  it("validates emails and spots crawlers", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(isBot("Twitterbot/1.0")).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(
      isBot("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1"),
    ).toBe(false);
  });

  it("reads quota caps from the environment", () => {
    expect(capsFromEnv({ EMAILS_PER_COMPANY_PER_DAY: "3" })).toEqual({
      emailsPerCompany: 3,
      postsPerCompany: 6,
      emailsTotal: 45,
      postsTotal: 18,
    });
    expect(capsFromEnv({ POSTS_PER_DAY: "lots" }).postsTotal).toBe(18);
  });
});
