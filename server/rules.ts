/**
 * The company's decision rules, as pure functions.
 *
 * The strategist agent makes the final call on every experiment, but it makes it against these
 * verdicts, so a kill or a pivot is grounded in numbers the app counted itself rather than in
 * numbers an agent remembers or claims. Thresholds can be overridden per experiment.
 */

export interface Thresholds {
  /** Don't judge an offer younger than this. */
  minHours: number;
  /** Outreach actions (posts + emails) an experiment gets before it is judged. */
  minTouches: number;
  /** Landing-page visitors needed before the offer itself is judged. */
  minViews: number;
  /** Signup rate below this, once there are enough visitors, means the offer is not wanted. */
  killRate: number;
  /** Signup rate at or above this means double down. */
  scaleRate: number;
  /** This many signups is a scale signal whatever the rate. */
  scaleSignups: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minHours: 2,
  minTouches: 12,
  minViews: 25,
  killRate: 0.02,
  scaleRate: 0.08,
  scaleSignups: 5,
};

export interface ExperimentStats {
  ageHours: number;
  touches: number;
  views: number;
  signups: number;
  impressions: number;
}

export type Verdict = "too_early" | "no_reach" | "kill" | "keep" | "scale";

export interface Judgement {
  verdict: Verdict;
  reason: string;
  signupRate: number | null;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function withDefaults(overrides: Partial<Thresholds> | null | undefined): Thresholds {
  const out = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[]) {
    const value = overrides?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return out;
}

/**
 * The rule-based verdict for one experiment.
 *
 * Reach and conversion are judged separately on purpose: an offer nobody saw has not been
 * rejected, so "no_reach" tells the company to fix distribution, not to pivot the product.
 */
export function judge(stats: ExperimentStats, t: Thresholds = DEFAULT_THRESHOLDS): Judgement {
  const rate = stats.views > 0 ? stats.signups / stats.views : null;

  if (stats.signups >= t.scaleSignups) {
    return { verdict: "scale", reason: `${stats.signups} signups (scale threshold ${t.scaleSignups})`, signupRate: rate };
  }

  if (stats.views >= t.minViews && rate !== null) {
    if (rate >= t.scaleRate) {
      return { verdict: "scale", reason: `${pct(rate)} of ${stats.views} visitors signed up (scale at ${pct(t.scaleRate)})`, signupRate: rate };
    }
    if (rate < t.killRate) {
      return {
        verdict: "kill",
        reason: `${stats.views} visitors but only ${stats.signups} signups (${pct(rate)}, kill below ${pct(t.killRate)}): people saw it and did not want it`,
        signupRate: rate,
      };
    }
    return { verdict: "keep", reason: `${pct(rate)} of ${stats.views} visitors signed up: promising, keep pushing`, signupRate: rate };
  }

  const judgedLongEnough = stats.ageHours >= t.minHours;
  const enoughOutreach = stats.touches >= t.minTouches;
  if (judgedLongEnough && enoughOutreach) {
    return {
      verdict: "no_reach",
      reason: `${stats.touches} outreach actions and ${stats.impressions} impressions produced only ${stats.views} visitors (need ${t.minViews} to judge the offer): fix the channel or the hook, not the product`,
      signupRate: rate,
    };
  }
  if (stats.ageHours >= t.minHours * 3 && !enoughOutreach) {
    return {
      verdict: "no_reach",
      reason: `${stats.ageHours.toFixed(1)}h old with only ${stats.touches} outreach actions: it is starved of distribution`,
      signupRate: rate,
    };
  }
  return {
    verdict: "too_early",
    reason: `${stats.ageHours.toFixed(1)}h old, ${stats.touches}/${t.minTouches} outreach actions, ${stats.views}/${t.minViews} visitors: keep running`,
    signupRate: rate,
  };
}

export interface Caps {
  emailsPerDay: number;
  xPostsPerDay: number;
}

export const DEFAULT_CAPS: Caps = { emailsPerDay: 40, xPostsPerDay: 16 };

export function capsFromEnv(env: Record<string, string | undefined>): Caps {
  const num = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    emailsPerDay: num(env["EMAIL_CAP_PER_DAY"], DEFAULT_CAPS.emailsPerDay),
    xPostsPerDay: num(env["X_POST_CAP_PER_DAY"], DEFAULT_CAPS.xPostsPerDay),
  };
}

/** "jane.doe@gmail.com" → "j***@gmail.com": the public dashboard never shows a full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "offer"
  );
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const isEmail = (value: string): boolean => value.length <= 254 && EMAIL.test(value);

/** Crawlers that fetch a link to render a preview would otherwise count as visitors. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|outbrain|pinterest|vkshare|whatsapp|discord|telegram|headless|curl|wget|python|node-fetch|go-http|axios/i;
export const isBot = (userAgent: string | undefined): boolean => !userAgent || BOT.test(userAgent);
