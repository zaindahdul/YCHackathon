/**
 * Fills a running local Launchpad with one clearly fictional launch, through the same HTTP routes
 * a founder and their product use. Companies are named "(sample)", which the backend flags as
 * is_sample, and every URL uses the reserved .example domain. Nothing here contacts anyone.
 *
 *   LAUNCHPAD_LOCAL_PRODUCER=1 npm run dev     # in one terminal
 *   npm run seed:demo                          # in another (BASE_URL overrides the address)
 *
 * No return-visit events are sent: a return window has to actually elapse before it can be shown.
 */
const BASE = (process.env["BASE_URL"] ?? "http://localhost:8790").replace(/\/+$/, "");
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

interface Workspace { slug: string; token: string }

async function post(path: string, fields: Record<string, string>): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": BROWSER },
    body: new URLSearchParams(fields).toString(),
  });
  if (res.status >= 400) throw new Error(`POST ${path.split("?")[0]} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}
const act = (w: Workspace, sub: string, fields: Record<string, string>) => post(`/k/${w.slug}/${sub}?t=${w.token}`, fields);

async function page(w: Workspace, tab: string): Promise<string> {
  const res = await fetch(`${BASE}/k/${w.slug}?t=${w.token}&tab=${tab}`, { headers: { "user-agent": BROWSER } });
  if (!res.ok) throw new Error(`GET workspace tab ${tab} returned ${res.status}`);
  return res.text();
}

async function createLaunch(fields: Record<string, string>): Promise<Workspace> {
  const res = await post("/new", {
    ch_x: "1", ch_linkedin: "1", ch_show_hn: "1", ch_product_hunt: "1", ch_launch_yc: "1", ch_email: "1",
    join_squad: "1", timezone: "America/Los_Angeles", ...fields,
  });
  const location = res.headers.get("location") ?? "";
  const m = /\/k\/([a-z0-9-]+)\?t=([^&]+)/.exec(location);
  if (!m) throw new Error(`POST /new did not redirect to a workspace (status ${res.status})`);
  return { slug: m[1]!, token: m[2]! };
}

async function produce(w: Workspace): Promise<void> {
  await act(w, "produce", {});
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${BASE}/k/${w.slug}/status?t=${w.token}`);
    if (res.ok && ((await res.json()) as { ready?: boolean }).ready) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The kit never became ready. Start the server with LAUNCHPAD_LOCAL_PRODUCER=1.");
}

const COMMENTS_X = `maya_sre: How does this differ from just shipping OpenTelemetry traces to Grafana?
https://x.example/maya_sre/status/1001

devin_platform: We run about 40 agents in prod and debugging tool-call loops is painful. Can I get on a trial this week?
https://x.example/devin_platform/status/1002

opsgoblin: Another observability tool, cool. Agent traces are just logs with extra steps.
https://x.example/opsgoblin/status/1003

kira_ml: Are you SOC2 compliant, and what does it cost for 50M spans a month? Need both before I can bring this to security.
https://x.example/kira_ml/status/1004

jtan: congrats on the launch!!
https://x.example/jtan/status/1005`;

const COMMENTS_LINKEDIN = `Priya N: Does the replay view work when an agent crashes halfway through a tool call?
https://linkedin.example/feed/2001

Tomas R: The trace link from the docs quickstart gives me a 404 after signup.
https://linkedin.example/feed/2002

Elena V: Our infra team has been asking for exactly this. Who should I talk to about a pilot?
https://linkedin.example/feed/2003`;

async function main(): Promise<void> {
  console.log(`Seeding sample data into ${BASE}`);
  const lp = await createLaunch({
    company: "Northwind Trace (sample)",
    one_liner: "Agent observability for infra teams running LLM agents in production",
    description: "Northwind Trace records every tool call, retry and model decision an agent makes, then lets infra teams replay a failed run step by step. This launch adds crash replay and a one-line OpenTelemetry exporter. This is a fictional sample company used to demonstrate Launchpad.",
    url: "https://northwind-trace.example/",
    launch_when: "Tuesday morning",
    batch: "F25",
    email: "founder@northwind-trace.example",
    x_handle: "northwindtrace",
  });
  await act(lp, "facts", {
    audience: "Platform and SRE teams running LLM agents in production at Series A to C companies",
    problem: "When an agent fails in production, logs do not show which tool call or retry caused it, so engineers re-run it by hand to find out",
    proof: "Sample figure for this demo: a design partner cut median agent incident triage from 90 minutes to 12 minutes",
    pricing: "",
    voice: "Plain, technical, no hype. Show the trace, not the adjectives.",
    b2b: "1",
    faq: "Q: Does it work with OpenTelemetry?\nA: Yes. A one-line exporter sends agent spans to any OTLP backend, including Grafana.\n\nQ: Can it replay a crashed run?\nA: Yes. Crash replay restores each tool call and model response up to the point of failure.\n\nQ: Where does trace data live?\nA: In the customer's own cloud account. Northwind Trace runs in their VPC.",
  });
  await produce(lp);
  console.log("Kit produced by the local producer");

  await act(lp, "comments", { platform: "x", raw: COMMENTS_X });
  await act(lp, "comments", { platform: "linkedin", raw: COMMENTS_LINKEDIN });
  console.log("Imported 8 sample comments as manual imports");

  const people = [
    { name: "Dana Okafor (sample)", contact: "dana@helix-infra.example", why: "Leads platform at a team that wrote publicly about debugging agent retries" },
    { name: "Rohit Mehta (sample)", contact: "rohit@quaycloud.example", why: "SRE manager evaluating OpenTelemetry backends for agent workloads" },
    { name: "Sam Lindqvist (sample)", contact: "sam@tessel.example", why: "Runs an infra newsletter that covers LLM operations tooling" },
  ];
  for (const p of people) await act(lp, "outreach", p);
  const outreachId = new RegExp(`/k/${lp.slug}/outreach/([A-Za-z0-9_-]+)`).exec(await page(lp, "reach"))?.[1];
  if (!outreachId) throw new Error("Could not find an outreach draft to approve on the reach tab");
  await act(lp, `outreach/${outreachId}`, { action: "approve" });
  console.log("Added 3 outreach drafts and approved 1. Nothing was sent");

  await act(lp, "wave", { channel: "x", minutes: "30", impressions: "180", likes: "2", replies: "0" });
  await act(lp, "wave", { channel: "x", minutes: "90", impressions: "420", likes: "5", replies: "1" });

  for (const peer of [
    { company: "Harbor Evals (sample)", one_liner: "Regression tests for LLM agents before they reach production", slug: "harbor-evals", description: "Harbor Evals runs agent regression suites in CI so infra teams catch tool-call breakage before deploy. Fictional sample company used to demonstrate squad matching." },
    { company: "Ledgerbeam (sample)", one_liner: "Usage-based billing for AI infrastructure companies", slug: "ledgerbeam", description: "Ledgerbeam meters tokens and spans, then turns them into invoices for AI infrastructure startups. Fictional sample company used to demonstrate squad matching." },
  ]) {
    const w = await createLaunch({ company: peer.company, one_liner: peer.one_liner, description: peer.description, url: `https://${peer.slug}.example/`, email: `founder@${peer.slug}.example`, listed: "1" });
    await produce(w);
  }

  await act(lp, "commit", { person: "Elena V (sample)", context: "LinkedIn launch comment about a pilot", promise: "Send the pilot scope and a VPC deployment one-pager", due: "Friday" });
  await act(lp, "commit", { person: "Kira (sample)", context: "Asked about SOC2 and pricing on X", promise: "Reply once the security and pricing answers are confirmed", due: "Tomorrow" });

  await act(lp, "go", {});
  console.log("Launched");

  const kitHtml = await page(lp, "kit");
  const codes = [...new Set([...kitHtml.matchAll(/\/l\/([A-Za-z0-9]{4,12})/g)].map((m) => m[1]!))];
  if (codes.length === 0) throw new Error("No tracked links found on the kit tab");

  const visits = [
    { code: 0, activate: true, qa: false }, { code: 0, activate: true, qa: false }, { code: 0, activate: false, qa: false },
    { code: 1, activate: true, qa: false }, { code: 1, activate: false, qa: false }, { code: 2, activate: false, qa: false },
    { code: 0, activate: true, qa: true },
  ];
  let tracked = 0;
  for (const [i, v] of visits.entries()) {
    const code = codes[Math.min(v.code, codes.length - 1)]!;
    const click = await fetch(`${BASE}/l/${code}`, { redirect: "manual", headers: { "user-agent": BROWSER, "x-forwarded-for": `198.51.100.${10 + i}` } });
    const ref = new URL(click.headers.get("location") ?? "https://none.example/").searchParams.get("lp_ref");
    if (!ref) throw new Error(`Tracked link did not return lp_ref (status ${click.status})`);
    for (const event of v.activate ? ["visit", "activate"] : ["visit"]) {
      const res = await fetch(`${BASE}/e`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ launch: lp.slug, ref, event, ...(v.qa ? { qa: true } : {}) }) });
      if (!res.ok) throw new Error(`POST /e returned ${res.status}`);
    }
    tracked++;
  }
  console.log(`Sent product events for ${tracked} sample visitors, 1 of them QA`);

  console.log(`\nPrivate workspace (keep this link to yourself):\n${BASE}/k/${lp.slug}?t=${lp.token}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
