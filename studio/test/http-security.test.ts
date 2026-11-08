import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { openLocalDb } from "../server/local-db.ts";
import { Repo } from "../server/repo.ts";
import { handleRequest, originOf, type ApiRequest } from "../server/routes.ts";
import { BRIDGE_JS, TRACKER_JS, renderMarkdown } from "../server/pages.ts";

let db: Awaited<ReturnType<typeof openLocalDb>>;
let repo: Repo;
let company: Awaited<ReturnType<Repo["startCompany"]>>;
const ctx = () => ({ db: async () => db, env: { vars: {} } });
const req = (
  method: string,
  path: string,
  body: unknown = null,
  cap?: string,
  query = "",
): ApiRequest => ({
  method,
  path,
  body,
  query: new URLSearchParams(query),
  headers: {
    host: "studio.test",
    "user-agent": "Mozilla/5.0 Safari",
    ...(cap ? { "x-pmf-user": cap } : {}),
  },
});
const api = (
  method: string,
  rest = "",
  body: unknown = null,
  cap?: string,
  query = "",
) =>
  handleRequest(
    req(method, `/p/${company.slug}/api/items${rest}`, body, cap, query),
    ctx(),
  );
const owner = "a".repeat(64),
  other = "b".repeat(64);
beforeAll(async () => {
  db = await openLocalDb();
  repo = new Repo(db);
  company = await repo.startCompany({
    founder: "founder-1",
    name: "Private plans",
    problem: "Keep a plan",
    audience: "Makers",
    evidence: ["https://example.com/problem"],
    solution: "A planner",
  });
  await repo.publish(
    company.id,
    [
      {
        path: "index.html",
        content:
          '<!doctype html><html><head><title>Plans</title></head><body><h1>Plans</h1><p>A working local planner with a saved browser document.</p><button id="save">Save</button></body></html>',
      },
      { path: "private/NOTES.md", content: "Private operating instructions" },
      {
        path: "active.xml",
        content: '<?xml version="1.0"?><root>XML product data</root>',
      },
    ],
    "First version",
    true,
  );
});
afterAll(async () => db.close());

describe("product storage authority", () => {
  it("requires a secret capability, hides owner hashes, and never lists/reads another browser's private document", async () => {
    expect(
      (
        await api(
          "POST",
          "",
          { collection: "plans", data: { secret: "A" } },
          "user-aaaa",
        )
      ).status,
    ).toBe(400);
    const added = await api(
      "POST",
      "",
      { collection: "plans", data: { secret: "A" } },
      owner,
    );
    expect(added.status).toBe(201);
    const item = added.json as { id: string; owner?: string };
    expect(item.owner).toBeUndefined();
    expect((await api("GET", `/${item.id}`)).status).toBe(404);
    expect((await api("GET", `/${item.id}`, null, other)).status).toBe(404);
    expect((await api("GET", `/${item.id}`, null, owner)).status).toBe(200);
    expect(
      (
        (await api("GET", "", null, undefined, "collection=plans")).json as {
          items: unknown[];
        }
      ).items,
    ).toHaveLength(0);
    expect(
      (
        (await api("GET", "", null, other, "collection=plans&mine=1")).json as {
          items: unknown[];
        }
      ).items,
    ).toHaveLength(0);
    expect(
      (
        (await api("GET", "", null, owner, "collection=plans&mine=1")).json as {
          items: unknown[];
        }
      ).items,
    ).toHaveLength(1);
    expect(
      (await api("PUT", `/${item.id}`, { data: { hacked: true } }, other))
        .status,
    ).toBe(404);
    expect((await api("DELETE", `/${item.id}`, null, other)).status).toBe(404);
  });
  it("shared means public read, while updates and deletes still belong to the creator", async () => {
    const added = await api(
      "POST",
      "",
      { collection: "board", data: { message: "Public" }, shared: true },
      owner,
    );
    const item = added.json as { id: string };
    expect((await api("GET", `/${item.id}`)).status).toBe(200);
    expect(
      (
        (await api("GET", "", null, undefined, "collection=board")).json as {
          items: unknown[];
        }
      ).items,
    ).toHaveLength(1);
    expect(
      (await api("PUT", `/${item.id}`, { data: { changed: true } })).status,
    ).toBe(404);
    expect((await api("DELETE", `/${item.id}`, null, other)).status).toBe(404);
    expect(
      (await api("PUT", `/${item.id}`, { data: { changed: true } }, owner))
        .status,
    ).toBe(200);
  });
});

describe("product code isolation and public evidence", () => {
  it("never interpolates untrusted Host text into upload commands", () => {
    expect(() =>
      originOf(req("GET", "/", null, undefined), "https://good.example/evil"),
    ).toThrow();
    expect(() =>
      originOf({
        ...req("GET", "/"),
        headers: { host: "evil.example;touch /tmp/oops" },
      }),
    ).toThrow();
    expect(() =>
      originOf({ ...req("GET", "/"), headers: { host: 'evil".example' } }),
    ).toThrow();
    expect(originOf(req("GET", "/"), "https://studio.example")).toBe(
      "https://studio.example",
    );
  });
  it("serves a trusted host shell and opaque generated content, preserving QA/ref and hiding nested notes", async () => {
    const shell = await handleRequest(
      req("GET", `/p/${company.slug}/`, null, undefined, "qa=1&ref=email"),
      ctx(),
    );
    expect(shell.html).toContain(
      'sandbox="allow-scripts allow-forms allow-downloads allow-popups"',
    );
    expect(shell.html).not.toContain("allow-same-origin");
    expect(shell.headers?.["content-security-policy"]).toContain(
      "connect-src 'self'",
    );
    expect(shell.html).toContain("/__content/index.html?qa=1&amp;ref=email");
    expect(shell.headers?.["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    const content = await handleRequest(
      req("GET", `/p/${company.slug}/__content/index.html`),
      ctx(),
    );
    expect(content.text).toContain('src="/t.js"');
    expect(content.headers?.["access-control-allow-origin"]).toBe("*");
    expect(content.headers?.["content-security-policy"]).toContain(
      "sandbox allow-scripts",
    );
    expect(content.headers?.["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
    expect(
      (
        await handleRequest(
          req("GET", `/p/${company.slug}/private/NOTES.md`),
          ctx(),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handleRequest(
          req("GET", `/p/${company.slug}/__content/private/NOTES.md`),
          ctx(),
        )
      ).status,
    ).toBe(404);
  });
  it("all generated asset types including XML inherit the opaque sandbox", async () => {
    const xml = await handleRequest(
      req("GET", `/p/${company.slug}/active.xml`),
      ctx(),
    );
    expect(xml.status).toBe(200);
    expect(xml.headers?.["content-type"]).toContain("application/xml");
    expect(xml.headers?.["content-security-policy"]).toContain(
      "sandbox allow-scripts",
    );
    expect(xml.headers?.["content-security-policy"]).not.toContain(
      "allow-same-origin",
    );
  });
  it("a signup is not automatically counted as a core feature use", async () => {
    await handleRequest(
      req("POST", "/api/t", {
        c: company.slug,
        u: "signup-only-browser",
        t: "view",
      }),
      ctx(),
    );
    await handleRequest(
      req("POST", "/api/t", {
        c: company.slug,
        u: "signup-only-browser",
        t: "signup",
        email: "signup@example.com",
      }),
      ctx(),
    );
    const row = (await repo.scoreboard()).find((c) => c.id === company.id)!;
    expect(row.stats.signups).toBe(1);
    expect(row.stats.active_users).toBe(0);
  });
  it("redacts emails inside public prose and refuses executable report links", async () => {
    await repo.addFeedback(
      company.id,
      "email",
      "Please contact secret-person@example.com about the plan",
      "secret-person@example.com",
    );
    await repo.logIntervention("Configured hello-private@example.com inbox");
    const page = await handleRequest(req("GET", "/"), ctx());
    expect(page.html).not.toContain("secret-person@example.com");
    expect(page.html).not.toContain("hello-private@example.com");
    expect(page.html).toContain("browser-event estimates");
    const state = await handleRequest(req("GET", "/api/state"), ctx());
    expect(JSON.stringify(state.json)).not.toContain(
      "hello-private@example.com",
    );
    expect(renderMarkdown("[link](javascript:alert(1))")).not.toContain(
      'href="javascript:',
    );
  });
  it("rejects oversized requests before database work", async () => {
    const reply = await handleRequest(
      {
        ...req("PUT", "/api/upload/up_" + "a".repeat(40) + "/large.js"),
        raw: "x".repeat(400_001),
      },
      {
        db: async () => {
          throw Error("must not query");
        },
        env: { vars: {} },
      },
    );
    expect(reply.status).toBe(413);
  });
});

/** Run the actual trusted broker and generated tracker with isolated window/message surfaces. */
async function browser(slug: string, storage: Map<string, string>, qa = false) {
  const hostListeners: Array<(e: any) => void> = [],
    childListeners: Array<(e: any) => void> = [];
  const requests: Array<{
    url: string;
    headers: Record<string, string>;
    body: any;
  }> = [];
  const hostWindow: any = {
    addEventListener: (n: string, f: any) => {
      if (n === "message") hostListeners.push(f);
    },
  };
  const childWindow: any = {
    addEventListener: (n: string, f: any) => {
      if (n === "message") childListeners.push(f);
    },
  };
  hostWindow.postMessage = (data: any) =>
    queueMicrotask(() =>
      hostListeners.forEach((f) => f({ data, source: childWindow })),
    );
  childWindow.postMessage = (data: any) =>
    queueMicrotask(() =>
      childListeners.forEach((f) => f({ data, source: hostWindow })),
    );
  const fetcher = async (url: string, opts: any = {}) => {
    requests.push({
      url,
      headers: opts.headers ?? {},
      body: opts.body ? JSON.parse(opts.body) : null,
    });
    const parsed = new URL(url, "https://studio.test");
    const result = await handleRequest(
      {
        method: opts.method ?? "GET",
        path: parsed.pathname,
        query: parsed.searchParams,
        headers: {
          host: "studio.test",
          "user-agent": "Mozilla/5.0 Safari",
          ...opts.headers,
        },
        body: opts.body ? JSON.parse(opts.body) : null,
      },
      ctx(),
    );
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => JSON.parse(JSON.stringify(result.json ?? {})),
    };
  };
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
  };
  runInNewContext(BRIDGE_JS, {
    window: hostWindow,
    document: {
      currentScript: {
        getAttribute: (n: string) =>
          n === "data-company"
            ? slug
            : n === "data-qa"
              ? qa
                ? "1"
                : "0"
              : null,
      },
      getElementById: () => ({ contentWindow: childWindow }),
    },
    crypto: webcrypto,
    Uint8Array,
    Array,
    localStorage,
    fetch: fetcher,
    Promise,
  });
  runInNewContext(TRACKER_JS, {
    window: childWindow,
    parent: hostWindow,
    document: { currentScript: { getAttribute: () => slug } },
    location: {
      pathname: `/p/${slug}/__content/index.html`,
      search: qa ? "?qa=1" : "",
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URLSearchParams,
    Promise,
  });
  for (let i = 0; i < 30 && !childWindow.pmf?.user; i++)
    await new Promise((r) => setTimeout(r, 2));
  await new Promise((r) => setTimeout(r, 10));
  return {
    pmf: childWindow.pmf,
    requests,
    hostListeners,
    childWindow,
    hostWindow,
  };
}

describe("actual tracker and host broker", () => {
  it("keeps storage capabilities out of generated code and confines messages to the owning frame/company", async () => {
    const storage = new Map<string, string>();
    const b = await browser(company.slug, storage);
    expect(b.pmf.user).toMatch(/^[a-f0-9]{64}$/);
    const cap = storage.get(`pmf:${company.slug}:cap`)!;
    expect(cap).toMatch(/^[a-f0-9]{64}$/);
    expect(b.pmf.user).not.toBe(cap);
    expect(JSON.stringify(b.pmf)).not.toContain(cap);
    const saved = await b.pmf.db.add("brokerplans", {
      text: "Only in this company",
    });
    expect(saved.id).toMatch(/^itm_/);
    expect(
      (await b.pmf.db.list("brokerplans", { mine: true })).items,
    ).toHaveLength(1);
    expect((await b.pmf.db.list("brokerplans")).items).toHaveLength(0);
    const before = b.requests.length;
    for (const listener of b.hostListeners) {
      listener({
        source: {},
        data: {
          pmf: true,
          company: company.slug,
          id: "evil",
          op: "list",
          args: ["brokerplans", { mine: true }],
        },
      });
      listener({
        source: b.childWindow,
        data: {
          pmf: true,
          company: "another-company",
          id: "evil",
          op: "list",
          args: ["brokerplans", { mine: true }],
        },
      });
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(b.requests.length).toBe(before);
    expect(
      b.requests.find(
        (r) => r.url.includes("/api/items") && r.headers["x-pmf-user"] === cap,
      ),
    ).toBeTruthy();
  });
  it("persists QA across navigation and suppresses view/use/signup/feedback without blocking local storage", async () => {
    const storage = new Map<string, string>();
    const first = await browser(company.slug, storage, true);
    await first.pmf.track("generated");
    await first.pmf.signup("qa@example.com");
    await first.pmf.feedback("QA fixture feedback");
    await first.pmf.db.add("qa-plans", { test: true });
    expect(first.requests.filter((r) => r.url === "/api/t")).toHaveLength(0);
    const next = await browser(company.slug, storage, false);
    await next.pmf.track("later page");
    await next.pmf.signup("qa2@example.com");
    await next.pmf.feedback("Later QA fixture");
    expect(next.requests.filter((r) => r.url === "/api/t")).toHaveLength(0);
    expect(storage.get(`pmf:${company.slug}:qa`)).toBe("1");
    const clean = await browser(company.slug + "-different", storage, false);
    expect(clean.requests.some((r) => r.url === "/api/t")).toBe(true);
    expect(clean.pmf.user).not.toBe(first.pmf.user);
  });
});
