/**
 * The contract between the workspace backend (workspace.ts, producer.ts, routes.ts) and its pages
 * (workspace-pages.ts). Everything a founder's private workspace renders comes through WorkspaceView.
 */
import type { Launch, LaunchStats, Report } from "./repo.ts";

export const TABS = ["kit", "reach", "demo", "replies", "results", "network", "follow"] as const;
export type Tab = (typeof TABS)[number];

export interface Faq { q: string; a: string }
/** Only what the founder told us. Empty fields stay empty: the producer asks instead of inventing. */
export interface Facts { audience: string; problem: string; proof: string; pricing: string; voice: string; b2b: boolean; faq: Faq[] }

export interface Community {
  name: string; url: string; kind: "reddit" | "forum" | "newsletter" | "launch_site";
  why: string; rules: string; rules_url: string; angle: string; draft_title: string; draft_body: string;
  /** Date a human last reviewed this catalog entry. The founder must re-check rules before posting. */
  reviewed: string;
}

export interface DemoScene { seconds: number; heading: string; caption: string }
export interface DemoPlan {
  title: string; format: "technical_b2b" | "consumer"; scenes: DemoScene[];
  /** Regular demo cadence between launches: real topics derived from facts, one a week. */
  cadence: { week: number; topic: string; why: string }[];
}

export interface WavePlan { channel: string; step: string; when: string; why: string }
export type OutreachStatus = "draft" | "approved" | "sent_manual" | "opted_out";
export interface Outreach { id: string; name: string; contact: string; why: string; draft: string; status: OutreachStatus; updated_at: Date; approved_at: Date | null; sent_at: Date | null }

export type CommentCategory = "question" | "buying_intent" | "objection" | "support" | "praise" | "low_value";
export type CommentStatus = "needs_review" | "needs_founder" | "approved" | "posted_manual" | "ignored";
export interface LaunchComment { id: string; platform: string; author: string; url: string | null; body: string; category: CommentCategory; status: CommentStatus; draft: string; fact_refs: string[]; unknown: string | null; created_at: Date }
export interface CommentInsights { total: number; by_category: Record<CommentCategory, number>; unanswered: number; top_questions: { text: string; comment_id: string }[]; objections: { text: string; comment_id: string }[]; interested: { author: string; comment_id: string }[] }

export interface WaveCheck { id: string; channel: string; minutes_since_post: number; impressions: number; likes: number; replies: number; created_at: Date }
/** Rule-based reading of founder-entered numbers. `verdict` compares against stated thresholds. */
export interface WaveAdvice { channel: string; verdict: "ahead" | "on_track" | "behind" | "no_data"; reading: string; action: string; rule: string }

export interface ChannelFunnel { channel: string; clicks: number; visitors: number; activated: number; returned: number }
export interface Attribution {
  rules: string; funnel: ChannelFunnel[]; totals: { clicks: number; visitors: number; activated: number; returned: number; qa_excluded: number };
  return_window_days: number; snippet: string;
}
export interface Deal { price_usd: number; deliverables: string[]; trial_accepted_at: Date | null; hours_saved: number | null; paid: false }

export interface NetworkMatch { company: string; one_liner: string; url: string; why: string; ask: string; score: number }
export interface Commitment { id: string; person: string; context: string; promise: string; due: string | null; status: "open" | "done"; followup: string; created_at: Date }

export interface WorkspaceView {
  launch: Launch; tab: Tab; origin: string; token: string; notice: string | null;
  facts: Facts; missing: string[]; producer: string | null; is_sample: boolean;
  links: Record<string, string>; stats: LaunchStats; squad: number; reports: Omit<Report, "body">[];
  communities: Community[]; demo: DemoPlan | null; wave_plan: WavePlan[];
  outreach: Outreach[]; comments: LaunchComment[]; insights: CommentInsights;
  checks: WaveCheck[]; advice: WaveAdvice[]; attribution: Attribution; deal: Deal;
  ask: string; matches: NetworkMatch[]; commitments: Commitment[];
}

/*
 * ROUTES (all owner-gated by ?t=<launch.token>; a wrong token 404s; each POST 303s back to its tab with &n=<notice>):
 *   GET  /k/:slug                 no kit → writing state. kit → renderWorkspace(view with tab=kit). ?tab=<Tab>
 *   GET  /k/:slug/status          json {ready:boolean}
 *   POST /k/:slug/produce         runs local producer if LAUNCHPAD_LOCAL_PRODUCER=1; idempotent
 *   POST /k/:slug/go              existing Launch now, idempotent
 *   POST /k/:slug/facts           audience problem proof pricing voice b2b(“1”) faq("Q: …\nA: …" blocks)
 *   POST /k/:slug/edit            channel, part ("0".."n" for x, else title|text|tagline|description|first_comment|body|subject), text
 *   POST /k/:slug/outreach        name contact why → adds a draft (grounded in facts)
 *   POST /k/:slug/outreach/:id    action=save|approve|sent|opt_out, draft
 *   POST /k/:slug/comments        platform, raw (blocks separated by blank line: "author: text", optional URL on its own line) → labelled manual import
 *   POST /k/:slug/comments/:id    action=save|approve|posted|ignore|escalate, draft
 *   POST /k/:slug/wave            channel minutes impressions likes replies
 *   POST /k/:slug/commit          person context promise due
 *   POST /k/:slug/commit/:id      action=done|reopen
 *   POST /k/:slug/deal            action=accept_trial | hours, hours
 *   GET  /k/:slug?tab=network&ask=… computes matches from opted-in squad launches only
 *   GET  /t.js                    public tracking snippet       POST /e  {launch:<slug>, ref, event:"visit"|"activate", qa?:bool}  CORS *
 *   /l/:code                      appends lp_ref=<visitor hash>&lp_ch=<channel> to the target
 */
