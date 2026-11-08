/**
 * The studio's whole route table, independent of where it runs: the deployed function
 * (`server/entry.ts`), the local dev server (`server/dev.ts`) and the tests all call
 * `handleRequest` with the same request shape.
 *
 *   /                      public dashboard of every company
 *   /c/<slug>              one company: problem, evidence, versions, decisions, outreach, feedback
 *   /p/<slug>/<path>       the company's product, built and shipped by its founder agent
 *   /p/<slug>/api/items    the product's backend: a small JSON document store
 *   /t.js, /api/t          product analytics (views, uses, signups, feedback)
 *   /mcp                   the agents' tools (platform bearer only)
 *   /api/interventions     log a human step-in (admin bearer only)
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.ts";
import { handleMcp, productUrl, shipProduct, ToolError } from "./mcp.ts";
import {
  renderCompany,
  renderDashboard,
  renderNotFound,
  renderNotLive,
  renderOffline,
  renderReport,
  renderReports,
  TRACKER_JS,
  BRIDGE_JS,
  renderProductShell,
  redactPublicText,
  wrapProductHtml,
} from "./pages.ts";
import { LIMITS, Repo, RepoError, type Company } from "./repo.ts";
import {
  isPrivateFile,
  capsFromEnv,
  cleanPath,
  contentTypeOf,
  isBot,
  isEmail,
  placeholderReason,
} from "./rules.ts";

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  /** The body, parsed: a form's fields or a JSON value. Null when there was none or it did not parse. */
  body: unknown;
  /** The body exactly as sent, when the host handed it over unparsed (uploads). */
  raw?: string;
}

export interface ApiReply {
  status: number;
  headers?: Record<string, string>;
  html?: string;
  json?: unknown;
  /** A raw body; its type comes from headers["content-type"], else text/plain. */
  text?: string;
}

export interface Env {
  /** The bearer the platform mints for `/mcp` (VETTA_MCP_TOKEN). */
  mcpToken?: string;
  /** The operator's own bearer, for logging interventions (ADMIN_TOKEN). */
  adminToken?: string;
  vars: Record<string, string | undefined>;
}

export interface Context {
  db: () => Promise<Db>;
  env: Env;
  now?: () => Date;
}

/** Turns whatever the host handed over (a parsed object, a string, a Buffer) into one parsed value. */
export function parseBody(
  raw: unknown,
  contentType: string | undefined,
): unknown {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "object" && !(raw instanceof Uint8Array)) return raw;
  const text =
    typeof raw === "string"
      ? raw
      : Buffer.from(raw as Uint8Array).toString("utf8");
  if (text === "") return null;
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const sameSecret = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
const bearer = (header: string | undefined) =>
  /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1] ?? null;
function hasBearer(
  req: ApiRequest,
  ...secrets: (string | undefined)[]
): boolean {
  const token = bearer(req.headers["authorization"]);
  return (
    token !== null &&
    secrets.some(
      (secret) =>
        secret !== undefined && secret !== "" && sameSecret(secret, token),
    )
  );
}

/** Only a validated HTTP(S) origin may be embedded in upload commands or public links. */
export function originOf(req: ApiRequest, trustedUrl?: string): string {
  const host = (
    req.headers["x-forwarded-host"] ??
    req.headers["host"] ??
    "localhost"
  )
    .split(",")[0]!
    .trim();
  const proto = (
    req.headers["x-forwarded-proto"] ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")
  )
    .split(",")[0]!
    .trim();
  const value = trustedUrl ?? `${proto}://${host}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A valid studio public URL is required");
  }
  const name = url.hostname;
  const local =
    name === "localhost" || name === "127.0.0.1" || name === "[::1]";
  const dns =
    /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(
      name,
    );
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    (!dns && name !== "[::1]") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Studio public URL must be a plain HTTPS origin (HTTP only on localhost)",
    );
  return url.origin;
}

const html = (status: number, body: string): ApiReply => ({
  status,
  html: body,
  headers: {
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; frame-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
  },
});
const json = (status: number, body: unknown): ApiReply => ({
  status,
  json: body,
  headers: { "cache-control": "no-store" },
});
const obj = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
const str = (body: unknown, key: string): string => {
  const value = obj(body)[key];
  return typeof value === "string" ? value.trim() : "";
};

const CAPABILITY = /^[a-f0-9]{64}$/;
const UID = /^[A-Za-z0-9-]{4,64}$/;
const COLLECTION = /^[A-Za-z0-9_-]{1,40}$/;
const isOpen = (c: Company) => c.status === "live" || c.status === "winner";

export async function handleRequest(
  req: ApiRequest,
  ctx: Context,
): Promise<ApiReply> {
  const now = ctx.now ?? (() => new Date());
  const repo = async () => new Repo(await ctx.db());
  const { method } = req;
  // Product paths keep their trailing slash (relative links depend on it); everything else matches without one.
  const raw = req.path;
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;

  // Enforce a bounded parsed/raw request even when invoked by a serverless adapter.
  const rawLimit =
    method === "PUT" && path.startsWith("/api/upload/")
      ? LIMITS.fileBytes
      : LIMITS.productBytes + 64_000;
  if (
    (req.raw !== undefined && Buffer.byteLength(req.raw, "utf8") > rawLimit) ||
    (req.raw === undefined &&
      Buffer.byteLength(JSON.stringify(req.body ?? null), "utf8") >
        LIMITS.productBytes + 64_000)
  )
    return json(413, { error: "request body exceeds the allowed size" });
  if (path === "/health") return { status: 200, text: "ok" };

  // ---------------------------------------------------------------- the agents' tools
  if (path === "/mcp") {
    if (method !== "POST")
      return {
        status: 405,
        headers: { allow: "POST" },
        text: "MCP streamable HTTP: POST only",
      };
    if (!hasBearer(req, ctx.env.mcpToken, ctx.env.adminToken))
      return json(401, { error: "unauthorized" });
    const mcp = {
      repo: await repo(),
      origin: originOf(req, ctx.env.vars["STUDIO_PUBLIC_URL"]),
      caps: capsFromEnv(ctx.env.vars),
      now,
    };
    if (Array.isArray(req.body)) {
      const answers = (
        await Promise.all(req.body.map((m) => handleMcp(m, mcp)))
      ).filter((a) => a !== null);
      return answers.length === 0 ? { status: 202 } : json(200, answers);
    }
    const answer = await handleMcp(req.body, mcp);
    return answer === null ? { status: 202 } : json(200, answer);
  }

  // ---------------------------------------------------------------- operator
  if (path === "/api/interventions") {
    if (!hasBearer(req, ctx.env.adminToken))
      return json(401, { error: "unauthorized" });
    const r = await repo();
    if (method === "GET") return json(200, await r.listInterventions());
    if (method !== "POST") return json(405, { error: "GET or POST" });
    const description = str(req.body, "description");
    if (description === "" || description.length > 1000)
      return json(400, {
        error: "description is required (at most 1000 characters)",
      });
    return json(201, await r.logIntervention(description));
  }

  if (path === "/api/state" && method === "GET") {
    const r = await repo();
    const companies = await r.scoreboard(now());
    return json(200, {
      now: now().toISOString(),
      companies: publicValue(companies.map(({ thresholds: _t, ...c }) => c)),
      decisions: publicValue(await r.listDecisions({ limit: 100 })),
      interventions: publicValue(await r.listInterventions()),
    });
  }

  // ---------------------------------------------------------------- uploads from a founder's sandbox
  const upload = /^\/api\/upload\/(up_[a-f0-9]{40})(?:\/(.+))?$/.exec(path);
  if (upload) {
    const r = await repo();
    const link = await r.getUpload(upload[1]!, now());
    if (!link)
      return json(404, {
        error:
          "this upload link does not exist or has expired; get a new one with pmf.get_upload_link",
      });
    const rest = upload[2] ?? "";
    if (rest === "" && method === "GET") {
      const staged = await r.stagedFiles(link.token);
      return json(200, {
        staged: staged.map((f) => ({
          path: f.path,
          bytes: Buffer.byteLength(f.content, "utf8"),
        })),
      });
    }
    if (rest === "commit" && method === "POST") {
      const company = await r.getCompany(link.company_id);
      if (!company) return json(404, { error: "no such company" });
      const body = obj(req.body);
      const note = (
        typeof body["note"] === "string"
          ? body["note"]
          : (req.query.get("note") ?? "")
      )
        .trim()
        .slice(0, 200);
      if (!note)
        return json(400, {
          error: "give a note: what changed in this version",
        });
      const replace =
        body["replace"] === true || req.query.get("replace") === "1";
      try {
        const version = await r.commitUpload(
          link.token,
          now(),
          (current, staged, founder) =>
            shipProduct(r, current, staged, note, replace, founder),
        );
        return json(201, {
          version,
          product_url: productUrl(
            originOf(req, ctx.env.vars["STUDIO_PUBLIC_URL"]),
            company.slug,
          ),
          check:
            "Open the product_url with the browser and use it like a new user.",
        });
      } catch (error) {
        if (error instanceof ToolError || error instanceof RepoError)
          return json(400, { error: error.message });
        throw error;
      }
    }
    if (rest !== "commit" && method === "PUT") {
      const clean = cleanPath(rest);
      if (!clean)
        return json(400, {
          error:
            "bad path: relative, letters/digits/._-/ only, and one of .html .css .js .mjs .json .svg .md .txt .webmanifest .xml",
        });
      const content =
        req.raw ?? (typeof req.body === "string" ? req.body : null);
      if (content === null)
        return json(400, {
          error:
            "send the file as the raw body: curl --data-binary @file -H 'content-type: application/octet-stream'",
        });
      if (Buffer.byteLength(content, "utf8") > LIMITS.fileBytes)
        return json(413, {
          error: `the limit per file is ${LIMITS.fileBytes} bytes`,
        });
      const fake = placeholderReason(clean, content);
      if (fake) return json(400, { error: fake });
      try {
        await r.stageFile(link.token, clean, content, now());
      } catch (error) {
        if (error instanceof RepoError)
          return json(409, { error: error.message });
        throw error;
      }
      return json(200, {
        staged: clean,
        bytes: Buffer.byteLength(content, "utf8"),
      });
    }
    return json(405, { error: "GET the link, PUT <path>, or POST commit" });
  }

  // ---------------------------------------------------------------- product analytics
  if (path === "/bridge.js" && method === "GET")
    return {
      status: 200,
      text: BRIDGE_JS,
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
      },
    };
  if (path === "/t.js" && method === "GET") {
    return {
      status: 200,
      text: TRACKER_JS,
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    };
  }

  if (path === "/api/t") {
    if (method !== "POST") return json(405, { error: "POST only" });
    if (isBot(req.headers["user-agent"])) return { status: 204 };
    const body = obj(req.body);
    const slug = str(body, "c");
    const uid = str(body, "u");
    const type = str(body, "t");
    if (!UID.test(uid) || !/^[a-z0-9-]{1,64}$/.test(slug))
      return json(400, { error: "bad event" });
    const r = await repo();
    const company = await r.getCompanyBySlug(slug);
    if (!company || !isOpen(company)) return { status: 204 };
    const pagePath = str(body, "p").slice(0, 200) || null;
    if (type === "view" || type === "use") {
      const name = type === "use" ? str(body, "n").slice(0, 64) || "use" : "";
      const ref = str(body, "r").toLowerCase();
      await r.recordEvent(
        company.id,
        uid,
        type,
        name,
        pagePath,
        now(),
        /^[a-z0-9_-]{1,24}$/.test(ref) ? ref : null,
      );
      return { status: 204 };
    }
    if (type === "signup") {
      const email = str(body, "email").toLowerCase();
      if (!isEmail(email)) return json(400, { error: "invalid email" });
      await r.addSignup(company.id, email, uid, "product");
      return { status: 204 };
    }
    if (type === "feedback") {
      const text = str(body, "text").slice(0, 2000);
      if (text.length < 2) return json(400, { error: "empty feedback" });
      await r.addFeedback(company.id, "product", text, null);
      return { status: 204 };
    }
    return json(400, { error: "unknown event type" });
  }

  // ---------------------------------------------------------------- public pages
  if (path === "/" && method === "GET") {
    const r = await repo();
    const [companies, decisions, touches, feedback, interventions, reports] =
      await Promise.all([
        r.scoreboard(now()),
        r.listDecisions({ limit: 40 }),
        r.listTouches({ limit: 15 }),
        r.listFeedback(undefined, 15),
        r.listInterventions(),
        r.listReports({ limit: 8 }),
      ]);
    return html(
      200,
      renderDashboard({
        now: now(),
        companies,
        decisions,
        touches,
        feedback,
        interventions,
        reports,
      }),
    );
  }

  if (path === "/reports" && method === "GET") {
    const r = await repo();
    const [reports, companies] = await Promise.all([
      r.listReports({ limit: 200 }),
      r.scoreboard(now()),
    ]);
    return html(
      200,
      renderReports(reports, new Map(companies.map((c) => [c.id, c.name]))),
    );
  }

  const reportPage = /^\/r\/(rep_[a-f0-9]{12})$/.exec(path);
  if (reportPage && method === "GET") {
    const r = await repo();
    const report = await r.getReport(reportPage[1]!);
    const company = report && (await r.getCompany(report.company_id));
    if (!report || !company) return html(404, renderNotFound());
    return html(200, renderReport(report, company));
  }

  const companyPage = /^\/c\/([a-z0-9-]{1,64})$/.exec(path);
  if (companyPage && method === "GET") {
    const r = await repo();
    const board = await r.scoreboard(now());
    const company = board.find((c) => c.slug === companyPage[1]);
    if (!company) return html(404, renderNotFound());
    const [decisions, versions, touches, feedback, reports] = await Promise.all(
      [
        r.listDecisions({ company_id: company.id, limit: 50 }),
        r.versionResults(company.id),
        r.listTouches({ company_id: company.id, limit: 30 }),
        r.listFeedback(company.id, 30),
        r.listReports({ company_id: company.id, limit: 50 }),
      ],
    );
    const parentName = company.parent_id
      ? (board.find((c) => c.id === company.parent_id)?.name ?? null)
      : null;
    return html(
      200,
      renderCompany(company, {
        decisions,
        versions,
        touches,
        feedback,
        reports,
        parentName,
      }),
    );
  }

  // ---------------------------------------------------------------- products
  const product = /^\/p\/([a-z0-9-]{1,64})(\/.*)?$/.exec(raw);
  if (product) {
    const slug = product[1]!;
    const rest = product[2] ?? "";
    // Relative links inside a product need the trailing slash.
    if (rest === "" && method === "GET")
      return { status: 308, headers: { location: `/p/${slug}/` } };
    const r = await repo();
    const company = await r.getCompanyBySlug(slug);
    if (!company) return html(404, renderNotFound());

    const api = /^\/api\/items(?:\/([A-Za-z0-9_]{1,40}))?$/.exec(rest);
    if (api) return await itemsApi(req, r, company, api[1] ?? null);

    if (method !== "GET") return json(405, { error: "GET only" });
    if (company.status === "killed")
      return html(410, renderOffline(company.name));
    const contentRequest = rest.startsWith("/__content/");
    const resource = contentRequest
      ? rest.slice("/__content/".length)
      : rest.slice(1);
    const wanted = resource === "" ? "index.html" : resource;
    const clean = cleanPath(wanted);
    let file =
      clean && !isPrivateFile(clean)
        ? await r.readFile(company.id, clean)
        : null;
    let served = clean ?? "";
    // Single-page apps: an extensionless path that is not a file falls back to index.html.
    if (file === null && !/\.[a-z0-9]+$/i.test(wanted)) {
      file = await r.readFile(company.id, "index.html");
      served = "index.html";
    }
    if (file === null)
      return company.status === "building"
        ? html(503, renderNotLive(company.name))
        : html(404, renderNotFound());
    const type = contentTypeOf(served);
    const isHtml = type.startsWith("text/html");
    if (isHtml && !contentRequest) {
      return html(
        200,
        renderProductShell(
          company.slug,
          company.name,
          clean ?? (/^[A-Za-z0-9_/-]+$/.test(wanted) ? wanted : "index.html"),
          req.query.get("qa") === "1",
          req.query.get("ref"),
        ),
      );
    }
    return {
      status: 200,
      text: isHtml ? wrapProductHtml(file, company.slug) : file,
      headers: {
        "content-type": type,
        "access-control-allow-origin": "*",
        "cache-control": isHtml ? "no-store" : "public, max-age=60",
        "x-content-type-options": "nosniff",
        "referrer-policy": "same-origin",
        // XML/XSLT, SVG and future text types can become active documents too.
        // Every generated asset inherits the same opaque sandbox boundary.
        "content-security-policy":
          "sandbox allow-scripts allow-forms allow-downloads allow-popups; default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      },
    };
  }

  return html(404, renderNotFound());
}

/** The products' backend: list, add, read, update and remove JSON documents. */
async function itemsApi(
  req: ApiRequest,
  r: Repo,
  company: Company,
  id: string | null,
): Promise<ApiReply> {
  if (!isOpen(company)) return json(410, { error: "this product is offline" });
  const userHeader = req.headers["x-pmf-user"] ?? "";
  const user = CAPABILITY.test(userHeader)
    ? createHash("sha256")
        .update(`product-owner:v1:${company.id}:${userHeader}`)
        .digest("hex")
    : null;
  const body = obj(req.body);
  const sizeOk = (data: unknown) =>
    data !== undefined &&
    Buffer.byteLength(JSON.stringify(data), "utf8") <= LIMITS.itemBytes;

  try {
    if (id === null) {
      if (req.method === "GET") {
        const collection = req.query.get("collection") ?? "";
        if (!COLLECTION.test(collection))
          return json(400, {
            error: "collection is required (letters, digits, _ and -)",
          });
        const mine = req.query.get("mine") === "1";
        if (mine && !user)
          return json(400, {
            error: "mine needs a secure browser storage capability",
          });
        const limit = Math.min(
          Math.max(Number(req.query.get("limit")) || 50, 1),
          200,
        );
        return json(200, {
          items: (
            await r.listItems(company.id, collection, mine ? user : null, limit)
          ).map(publicItem),
        });
      }
      if (req.method === "POST") {
        const collection = str(body, "collection");
        if (!COLLECTION.test(collection))
          return json(400, {
            error: "collection is required (letters, digits, _ and -)",
          });
        if (!sizeOk(body["data"]))
          return json(400, {
            error: `data is required and at most ${LIMITS.itemBytes} bytes`,
          });
        if (!user)
          return json(400, {
            error: "a secure browser storage capability is required",
          });
        return json(
          201,
          publicItem(
            await r.addItem(
              company.id,
              collection,
              user,
              body["data"],
              body["shared"] === true,
            ),
          ),
        );
      }
      return json(405, { error: "GET or POST" });
    }
    if (req.method === "GET") {
      const item = await r.getItem(company.id, id, user);
      return item
        ? json(200, publicItem(item))
        : json(404, { error: "not found" });
    }
    if (req.method === "PUT") {
      if (!sizeOk(body["data"]))
        return json(400, {
          error: `data is required and at most ${LIMITS.itemBytes} bytes`,
        });
      const item = await r.updateItem(company.id, id, user, body["data"]);
      return item
        ? json(200, publicItem(item))
        : json(404, { error: "not found, or not yours" });
    }
    if (req.method === "DELETE") {
      return (await r.deleteItem(company.id, id, user))
        ? json(200, { deleted: id })
        : json(404, { error: "not found, or not yours" });
    }
    return json(405, { error: "GET, PUT or DELETE" });
  } catch (error) {
    if (error instanceof RepoError) return json(409, { error: error.message });
    throw error;
  }
}

/** Public JSON must not expose owner capability hashes or email prose. */
function publicItem<T extends { owner: string | null }>(item: T) {
  const { owner: _owner, ...rest } = item;
  return rest;
}
function publicValue(value: unknown): unknown {
  if (typeof value === "string") return redactPublicText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(publicValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, publicValue(v)]),
    );
  return value;
}
