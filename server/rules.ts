/**
 * The studio's decision rules, as pure functions.
 *
 * Founder agents make the final call on their own company, but they make it against these
 * verdicts, so an iteration, a kill or a pivot rests on numbers the studio counted itself
 * (unique visitors, people who used the product, people who came back), not on what an agent
 * remembers or claims. Thresholds can be overridden per company.
 */

export interface Thresholds {
  /** A company still unlaunched after this many hours is stalled. */
  maxBuildHours: number;
  /** Don't judge a product live for less than this. */
  minHours: number;
  /** Outreach actions a product gets before it is judged. */
  minTouches: number;
  /** Unique visitors needed before the product itself is judged. */
  minVisitors: number;
  /** Share of visitors who used the core feature, below which the product is not landing. */
  killActivation: number;
  /** This many active users is a scale signal. */
  scaleUsers: number;
  /** This many returning users is a scale signal: people came back on their own. */
  scaleReturning: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  maxBuildHours: 2,
  minHours: 2,
  minTouches: 10,
  minVisitors: 30,
  killActivation: 0.05,
  scaleUsers: 10,
  scaleReturning: 3,
};

export interface CompanyStats {
  status: string;
  hoursSinceCreated: number;
  hoursLive: number;
  touches: number;
  visitors: number;
  activeUsers: number;
  returningUsers: number;
  signups: number;
}

export type Verdict = "stalled" | "building" | "too_early" | "no_reach" | "iterate" | "keep" | "scale" | "ended";

export interface Judgement {
  verdict: Verdict;
  reason: string;
  activation: number | null;
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
 * The rule-based verdict for one company.
 *
 * Reach and product are judged separately: a product nobody visited has not been rejected
 * ("no_reach": fix distribution), and a product people visited but did not use gets "iterate"
 * (fix the product or the promise). Whether a second "iterate" means kill is the founder's call,
 * made against the decision log.
 */
export function judge(s: CompanyStats, t: Thresholds = DEFAULT_THRESHOLDS): Judgement {
  const activation = s.visitors > 0 ? s.activeUsers / s.visitors : null;

  if (s.status === "killed" || s.status === "winner") {
    return { verdict: "ended", reason: `company ${s.status}`, activation };
  }
  if (s.status === "building") {
    return s.hoursSinceCreated >= t.maxBuildHours
      ? { verdict: "stalled", reason: `${s.hoursSinceCreated.toFixed(1)}h since it started and still no product live: ship something small now`, activation }
      : { verdict: "building", reason: "not launched yet", activation };
  }

  if (s.activeUsers >= t.scaleUsers || s.returningUsers >= t.scaleReturning) {
    return {
      verdict: "scale",
      reason: `${s.activeUsers} people used it and ${s.returningUsers} came back (scale at ${t.scaleUsers} users or ${t.scaleReturning} returning)`,
      activation,
    };
  }

  if (s.visitors >= t.minVisitors && activation !== null) {
    if (activation < t.killActivation) {
      return {
        verdict: "iterate",
        reason: `${s.visitors} visitors but only ${s.activeUsers} used it (${pct(activation)}, bar ${pct(t.killActivation)}): the product or its promise is not landing`,
        activation,
      };
    }
    return { verdict: "keep", reason: `${pct(activation)} of ${s.visitors} visitors used it: promising, keep improving and pushing`, activation };
  }

  if (s.hoursLive >= t.minHours && s.touches >= t.minTouches) {
    return {
      verdict: "no_reach",
      reason: `${s.touches} outreach actions produced only ${s.visitors} visitors (need ${t.minVisitors} to judge the product): fix the channel or the hook`,
      activation,
    };
  }
  if (s.hoursLive >= t.minHours * 2 && s.touches < t.minTouches) {
    return { verdict: "no_reach", reason: `live ${s.hoursLive.toFixed(1)}h with only ${s.touches} outreach actions: it is starved of distribution`, activation };
  }
  return {
    verdict: "too_early",
    reason: `live ${s.hoursLive.toFixed(1)}h, ${s.touches}/${t.minTouches} outreach actions, ${s.visitors}/${t.minVisitors} visitors`,
    activation,
  };
}

export interface Caps {
  /** Per company, per rolling 24 hours. */
  emailsPerCompany: number;
  postsPerCompany: number;
  /** Across the whole studio: the email domain and the social account are shared. */
  emailsTotal: number;
  postsTotal: number;
}

export const DEFAULT_CAPS: Caps = { emailsPerCompany: 15, postsPerCompany: 6, emailsTotal: 45, postsTotal: 18 };

export function capsFromEnv(env: Record<string, string | undefined>): Caps {
  const num = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return value !== undefined && value !== "" && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    emailsPerCompany: num(env["EMAILS_PER_COMPANY_PER_DAY"], DEFAULT_CAPS.emailsPerCompany),
    postsPerCompany: num(env["POSTS_PER_COMPANY_PER_DAY"], DEFAULT_CAPS.postsPerCompany),
    emailsTotal: num(env["EMAILS_PER_DAY"], DEFAULT_CAPS.emailsTotal),
    postsTotal: num(env["POSTS_PER_DAY"], DEFAULT_CAPS.postsTotal),
  };
}

/** "jane.doe@gmail.com" → "j***@gmail.com": public pages and founders never see a full address. */
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
      .slice(0, 40)
      .replace(/-+$/g, "") || "company"
  );
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const isEmail = (value: string): boolean => value.length <= 254 && EMAIL.test(value);

/** Crawlers that fetch a link to render a preview would otherwise count as visitors. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|outbrain|pinterest|vkshare|whatsapp|discord|telegram|headless|curl|wget|python|node-fetch|go-http|axios/i;
export const isBot = (userAgent: string | undefined): boolean => !userAgent || BOT.test(userAgent);

/** Product file paths: relative, no traversal, a short whitelist of text types. */
export const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  webmanifest: "application/manifest+json",
  xml: "application/xml",
};

export function cleanPath(path: string): string | null {
  const trimmed = path.trim().replace(/^\/+/, "");
  if (trimmed === "" || trimmed.length > 120) return null;
  if (!/^[A-Za-z0-9._\/-]+$/.test(trimmed)) return null;
  if (trimmed.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  const ext = trimmed.includes(".") ? trimmed.slice(trimmed.lastIndexOf(".") + 1).toLowerCase() : "";
  return CONTENT_TYPES[ext] ? trimmed : null;
}

export const contentTypeOf = (path: string): string =>
  CONTENT_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

/**
 * Why a file is not real product code, or null when it looks real. Catches the stand-ins a model
 * sends when it means to paste the file later ("PLACEHOLDER", "...", "<contents of index.html>").
 */
export function placeholderReason(path: string, content: string): string | null {
  const trimmed = content.trim();
  if (/^(placeholder|todo|tbd|\.\.\.|…|<[^>]*(content|file|code)[^>]*>|\[[^\]]*(content|file|code)[^\]]*\])$/i.test(trimmed)) {
    return `${path} is a placeholder ("${trimmed.slice(0, 40)}"), not the file's contents`;
  }
  if (path.endsWith(".html") && (trimmed.length < 200 || !/<[a-z]/i.test(trimmed))) {
    return `${path} is only ${trimmed.length} characters: that is not a working page`;
  }
  return null;
}

/** Problems with the live product a founder must fix before anything else. */
export function productHealth(files: { path: string; content: string }[]): string[] {
  const warnings: string[] = [];
  const index = files.find((f) => f.path === "index.html");
  if (!index) warnings.push("There is no index.html: the product has no front page.");
  for (const f of files) {
    if (PRIVATE_FILES.has(f.path)) continue;
    const why = placeholderReason(f.path, f.content);
    if (why) warnings.push(`${why}. Users see a broken product: rebuild it and ship now.`);
  }
  return warnings;
}

/** Files a product keeps for its founder but never serves. */
export const PRIVATE_FILES = new Set(["NOTES.md", "AGENTS.md"]);
