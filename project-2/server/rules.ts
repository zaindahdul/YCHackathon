/**
 * Launchpad's pure rules: what a launch kit must contain, how each channel's one-click share link
 * is built, and the small helpers everything else shares.
 */
import { createHash } from "node:crypto";

export const CHANNELS = ["x", "linkedin", "show_hn", "product_hunt", "launch_yc", "email"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_NAMES: Record<Channel, string> = {
  x: "X", linkedin: "LinkedIn", show_hn: "Show HN", product_hunt: "Product Hunt", launch_yc: "Launch YC / Bookface", email: "Email your network",
};

/** Where the {link} placeholder goes. Redirect-tracked on the social and email channels; plain
 * UTM on Hacker News and Product Hunt, which expect the real URL (and frown on redirects). */
export const TRACKED: readonly Channel[] = ["x", "linkedin", "email", "launch_yc"];

export interface Kit {
  strategy: string;
  timing: { channel: Channel; when: string; why: string }[];
  posts: {
    x?: string[];
    linkedin?: string;
    show_hn?: { title: string; text: string };
    product_hunt?: { tagline: string; description: string; first_comment: string };
    launch_yc?: { title: string; body: string };
    email?: { subject: string; body: string };
  };
  boost_text: string;
  checklist: string[];
}

export class KitError extends Error {}

const str = (value: unknown, label: string, max: number, min = 1): string => {
  if (typeof value !== "string" || value.trim().length < min) throw new KitError(`${label} is required`);
  if (value.length > max) throw new KitError(`${label} is ${value.length} characters; the limit is ${max}`);
  return value.trim();
};
const needsLink = (text: string, label: string) => {
  if (!text.includes("{link}")) throw new KitError(`${label} must contain {link} where the tracked link goes`);
  return text;
};

/** The producer's kit, checked field by field so a page never renders half a launch. */
export function validateKit(raw: unknown, channels: readonly string[]): Kit {
  if (typeof raw !== "object" || raw === null) throw new KitError("kit must be an object");
  const k = raw as Record<string, unknown>;
  const posts = (typeof k["posts"] === "object" && k["posts"] !== null ? k["posts"] : {}) as Record<string, unknown>;
  const out: Kit = {
    strategy: str(k["strategy"], "strategy", 4000, 80),
    timing: [],
    posts: {},
    boost_text: needsLink(str(k["boost_text"], "boost_text", 240), "boost_text"),
    checklist: [],
  };

  if (!Array.isArray(k["timing"]) || k["timing"].length === 0 || k["timing"].length > 10) throw new KitError("timing must list 1 to 10 {channel, when, why}");
  for (const t of k["timing"] as Record<string, unknown>[]) {
    const channel = t?.["channel"];
    if (typeof channel !== "string" || !(CHANNELS as readonly string[]).includes(channel)) throw new KitError(`timing channel must be one of ${CHANNELS.join(", ")}`);
    out.timing.push({ channel: channel as Channel, when: str(t["when"], "timing.when", 120), why: str(t["why"], "timing.why", 600) });
  }

  const wanted = new Set(channels.length ? channels : CHANNELS);
  if (wanted.has("x")) {
    const x = posts["x"];
    if (!Array.isArray(x) || x.length === 0 || x.length > 8) throw new KitError("posts.x must be a thread of 1 to 8 posts");
    out.posts.x = x.map((p, i) => str(p, `posts.x[${i}]`, 280));
    needsLink(out.posts.x.join("\n"), "posts.x");
  }
  if (wanted.has("linkedin")) out.posts.linkedin = needsLink(str(posts["linkedin"], "posts.linkedin", 3000, 80), "posts.linkedin");
  if (wanted.has("show_hn")) {
    const hn = (posts["show_hn"] ?? {}) as Record<string, unknown>;
    const title = str(hn["title"], "posts.show_hn.title", 80);
    if (!/^Show HN: /.test(title)) throw new KitError('posts.show_hn.title must start with "Show HN: "');
    out.posts.show_hn = { title, text: str(hn["text"], "posts.show_hn.text", 2000, 80) };
  }
  if (wanted.has("product_hunt")) {
    const ph = (posts["product_hunt"] ?? {}) as Record<string, unknown>;
    out.posts.product_hunt = {
      tagline: str(ph["tagline"], "posts.product_hunt.tagline", 60),
      description: str(ph["description"], "posts.product_hunt.description", 260),
      first_comment: str(ph["first_comment"], "posts.product_hunt.first_comment", 1500, 80),
    };
  }
  if (wanted.has("launch_yc")) {
    const yc = (posts["launch_yc"] ?? {}) as Record<string, unknown>;
    out.posts.launch_yc = { title: str(yc["title"], "posts.launch_yc.title", 90), body: needsLink(str(yc["body"], "posts.launch_yc.body", 5000, 200), "posts.launch_yc.body") };
  }
  if (wanted.has("email")) {
    const em = (posts["email"] ?? {}) as Record<string, unknown>;
    out.posts.email = { subject: str(em["subject"], "posts.email.subject", 120), body: needsLink(str(em["body"], "posts.email.body", 3000, 80), "posts.email.body") };
  }

  if (!Array.isArray(k["checklist"]) || k["checklist"].length > 15) throw new KitError("checklist must be a list of up to 15 steps");
  out.checklist = (k["checklist"] as unknown[]).map((c, i) => str(c, `checklist[${i}]`, 300));
  return out;
}

export const withLink = (text: string, link: string) => text.split("{link}").join(link);

export function utm(url: string, source: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("ref", source);
    return u.toString();
  } catch {
    return url;
  }
}

/** One-click share links: each opens the platform with the post already written. */
export const share = {
  x: (text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  linkedin: (text: string) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
  show_hn: (url: string, title: string) => `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(title)}`,
  product_hunt: () => "https://www.producthunt.com/posts/new",
  launch_yc: () => "https://www.ycombinator.com/launches",
  email: (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
};

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at <= 0 ? "***" : `${email[0]}***${email.slice(at)}`;
}

export function slugify(name: string): string {
  return (
    name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "") || "launch"
  );
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const isEmail = (value: string): boolean => value.length <= 254 && EMAIL.test(value);
export const isUrl = (value: string): boolean => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value) && value.length <= 500;

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|outbrain|pinterest|vkshare|whatsapp|discord|telegram|headless|curl|wget|python|node-fetch|go-http|axios|scanner|safelinks|proofpoint|mimecast|barracuda/i;
export const isBot = (userAgent: string | undefined): boolean => !userAgent || BOT.test(userAgent);

export const visitorKey = (ip: string, ua: string, salt: string) => createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex").slice(0, 24);

export interface Caps { emailsPerDay: number; postsPerDay: number; boostsPerBoosterPerDay: number; boostsPerLaunch: number }
export const DEFAULT_CAPS: Caps = { emailsPerDay: 40, postsPerDay: 12, boostsPerBoosterPerDay: 3, boostsPerLaunch: 40 };
export function capsFromEnv(env: Record<string, string | undefined>): Caps {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    emailsPerDay: num(env["EMAILS_PER_DAY"], DEFAULT_CAPS.emailsPerDay),
    postsPerDay: num(env["POSTS_PER_DAY"], DEFAULT_CAPS.postsPerDay),
    boostsPerBoosterPerDay: num(env["BOOSTS_PER_BOOSTER_PER_DAY"], DEFAULT_CAPS.boostsPerBoosterPerDay),
    boostsPerLaunch: num(env["BOOSTS_PER_LAUNCH"], DEFAULT_CAPS.boostsPerLaunch),
  };
}
