import { createServer, type IncomingMessage } from "node:http";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type { Store } from "./store.js";
import type { Company } from "./company.js";
import type { Job } from "./domain.js";
import {
  orderPayment,
  processStripeEvent,
  registerCheckout,
  StripePaymentProvider,
  type PaymentProvider,
} from "./payments.js";

export interface CompanyServerOptions {
  customerSecret: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  publicBaseUrl?: string;
  artifactsDirectory?: string;
  assetsDirectory?: string;
  /** Offline integration tests can replace only the provider transport. */
  paymentProvider?: PaymentProvider;
}
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function bad(message: string): never {
  throw new HttpError(400, message);
}
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, name: string, limit = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    bad(`${name} must be a nonempty string of at most ${limit} characters`);
  return value as string;
}
async function rawBody(
  request: IncomingMessage,
  max = 128_000,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > max)
      throw new HttpError(413, "Request exceeds the allowed body size");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
async function body(
  request: IncomingMessage,
  max = 128_000,
): Promise<Record<string, unknown>> {
  if (
    !request.headers["content-type"]
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "Use application/json");
  let parsed: unknown;
  try {
    parsed = JSON.parse((await rawBody(request, max)).toString("utf8") || "{}");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Malformed JSON");
  }
  if (!object(parsed)) bad("JSON body must be an object");
  return parsed as Record<string, unknown>;
}
function authorized(header: string | undefined, token: string) {
  const actual = Buffer.from(header ?? ""),
    expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function customerOrderToken(secret: string, orderId: string): string {
  if (secret.length < 32)
    throw new Error("COMPANY_CUSTOMER_SECRET must be at least 32 characters");
  return createHmac("sha256", secret)
    .update(`customer-order:v1:${orderId}`)
    .digest("hex");
}
function approved(store: Store, job: Job) {
  return store
    .signals(job.experimentId)
    .some(
      (s) =>
        s.type === "approval" &&
        s.orderId === job.id &&
        s.scopeHash === job.scopeHash &&
        s.mode === job.mode &&
        s.verified,
    );
}
function artifacts(
  job: Job,
): Array<{ name: string; path: string; mimeType?: string }> {
  const fulfillment = job.output?.fulfillment;
  if (
    !object(fulfillment) ||
    fulfillment.status !== "completed" ||
    !Array.isArray(fulfillment.artifacts)
  )
    return [];
  return fulfillment.artifacts.filter(
    (a) =>
      object(a) && typeof a.name === "string" && typeof a.path === "string",
  ) as Array<{ name: string; path: string; mimeType?: string }>;
}
function ready(job: Job) {
  return job.status === "completed" && artifacts(job).length > 0;
}
function customerStatus(store: Store, job: Job) {
  const payment = orderPayment(store, job),
    isApproved = approved(store, job);
  const canDownload =
    ready(job) && isApproved && (job.priceCents === 0 || payment.settled);
  return {
    id: job.id,
    experimentId: job.experimentId,
    mode: job.mode,
    offer: job.offer,
    priceCents: job.priceCents,
    currency: job.currency,
    scopeHash: job.scopeHash,
    status: job.status,
    summary: job.summary,
    reason: job.reason,
    approved: isApproved,
    payment: { ...payment, required: job.priceCents > 0 },
    canDownload,
    artifacts: artifacts(job).map((a, index) => ({
      index,
      name: basename(a.name),
      downloadable: canDownload,
      ...(canDownload
        ? { downloadPath: `/api/orders/${job.id}/artifacts/${index}` }
        : {}),
    })),
  };
}
async function publicInput(
  value: Record<string, unknown>,
  type: string,
  uploadId: string,
  assetsDirectory?: string,
) {
  const input = value.input === undefined ? {} : value.input;
  if (!object(input)) bad("input must be an object");
  for (const key of Object.keys(input))
    if (
      ![
        "acceptanceExamples",
        "template",
        "durationSeconds",
        "approvedFacts",
        "targetUrl",
        "journeys",
        "targetAuthorized",
      ].includes(key)
    )
      bad(`Unsupported public input field: ${key}`);
  if (type === "microtool") {
    if (
      !Array.isArray(input.acceptanceExamples) ||
      input.acceptanceExamples.length < 1 ||
      input.acceptanceExamples.length > 20
    )
      bad("Provide one to twenty acceptance examples");
    for (const item of input.acceptanceExamples)
      if (
        !object(item) ||
        typeof item.input !== "string" ||
        typeof item.expected !== "string" ||
        item.input.length > 50_000 ||
        item.expected.length > 50_000
      )
        bad("Acceptance examples need bounded input and expected strings");
    if (
      input.template !== undefined &&
      !["csv-dedupe", "json-formatter", "utm-builder"].includes(
        String(input.template),
      )
    )
      bad("Unsupported microtool template");
    return { ...input, assetRights: true };
  }
  if (type === "qa")
    throw new HttpError(503, "Live device collector not connected");
  if (type !== "video") bad("Unsupported public fulfillment type");
  if (!assetsDirectory)
    throw new HttpError(503, "Secure video asset storage is not configured");
  if (
    !Array.isArray(value.assets) ||
    value.assets.length < 1 ||
    value.assets.length > 6
  )
    bad("Video requests need one to six authorized image uploads");
  if (
    input.durationSeconds !== undefined &&
    (!Number.isInteger(input.durationSeconds) ||
      Number(input.durationSeconds) < 5 ||
      Number(input.durationSeconds) > 30)
  )
    bad("Video duration must be 5–30 seconds");
  if (
    input.approvedFacts !== undefined &&
    (!Array.isArray(input.approvedFacts) ||
      input.approvedFacts.length > 20 ||
      input.approvedFacts.some((f) => typeof f !== "string" || f.length > 1000))
  )
    bad("approvedFacts must contain at most twenty bounded strings");
  const files: Array<{ extension: string; bytes: Buffer }> = [];
  for (const asset of value.assets) {
    if (
      !object(asset) ||
      typeof asset.base64 !== "string" ||
      asset.base64.length > 1_400_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(asset.base64)
    )
      bad("Upload must be a bounded base64-encoded image");
    const bytes = Buffer.from(asset.base64, "base64");
    if (
      bytes.length < 12 ||
      bytes.length > 1_000_000 ||
      bytes.toString("base64") !== asset.base64
    )
      bad("Image encoding or size is invalid");
    const extension =
      asset.contentType === "image/png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? ".png"
        : asset.contentType === "image/jpeg" &&
            bytes[0] === 0xff &&
            bytes[1] === 0xd8
          ? ".jpg"
          : asset.contentType === "image/webp" &&
              bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP"
            ? ".webp"
            : null;
    if (!extension)
      bad("Image content does not match PNG, JPEG or WebP content type");
    files.push({ extension, bytes });
  }
  await mkdir(assetsDirectory, { recursive: true });
  const root = await realpath(assetsDirectory),
    folder = resolve(root, uploadId);
  await mkdir(folder, { recursive: false });
  const paths: string[] = [];
  for (const file of files) {
    const name = `${randomUUID()}${file.extension}`;
    await writeFile(resolve(folder, name), file.bytes, {
      flag: "wx",
      mode: 0o600,
    });
    paths.push(`${uploadId}/${name}`);
  }
  return { ...input, assetPaths: paths, assetRights: true };
}

export function createCompanyServer(
  store: Store,
  company: Company,
  token: string,
  options?: CompanyServerOptions,
) {
  if (token.length < 24)
    throw new Error("COMPANY_API_TOKEN must be at least 24 characters");
  if (options && options.customerSecret.length < 32)
    throw new Error("COMPANY_CUSTOMER_SECRET must be at least 32 characters");
  const provider =
    options?.paymentProvider ??
    (options?.stripeSecretKey
      ? new StripePaymentProvider(options.stripeSecretKey)
      : undefined);
  const windows = new Map<string, { count: number; until: number }>();
  let activeDownloads = 0;
  const rate = (key: string, limit: number, duration: number) => {
    const now = Date.now(),
      prior = windows.get(key);
    if (windows.size > 10_000)
      for (const [entry, row] of windows)
        if (row.until <= now) windows.delete(entry);
    if (!prior || prior.until <= now) {
      if (windows.size >= 10_000)
        throw new HttpError(429, "Server request capacity reached");
      windows.set(key, { count: 1, until: now + duration });
      return;
    }
    if (++prior.count > limit)
      throw new HttpError(429, "Too many requests; try again later");
  };
  const server = createServer(
    { maxHeaderSize: 16_384 },
    async (request, response) => {
      const send = (code: number, data: unknown) => {
        if (response.headersSent || response.destroyed) return;
        response.writeHead(code, {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(JSON.stringify(data));
      };
      try {
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        rate(
          `request:${request.socket.remoteAddress ?? "unknown"}`,
          120,
          60_000,
        );
        if (path === "/health") {
          send(200, {
            ok: true,
            service: "naive-company",
            mode: store.policy().mode,
          });
          return;
        }
        if (request.method === "GET" && path === "/checkout/return") {
          send(200, {
            message:
              "Checkout return is not proof of payment. Use your private order token to check the signed-webhook payment status.",
          });
          return;
        }
        if (request.method === "POST" && path === "/api/stripe/webhook") {
          if (!provider || !options?.stripeWebhookSecret)
            throw new HttpError(503, "Stripe webhook is not configured");
          const signature = request.headers["stripe-signature"];
          if (typeof signature !== "string")
            throw new HttpError(400, "Stripe signature is required");
          const raw = await rawBody(request, 512_000);
          let event;
          try {
            event = provider.constructEvent(
              raw,
              signature,
              options.stripeWebhookSecret,
            );
          } catch {
            throw new HttpError(400, "Invalid Stripe webhook signature");
          }
          const result = processStripeEvent(store, event);
          send(result.status === "pending" ? 503 : 200, result);
          return;
        }
        if (request.method === "POST" && path === "/api/requests") {
          if (!options)
            throw new HttpError(503, "Customer intake is not configured");
          const p = store.policy();
          if (
            p.mode !== "live" ||
            !p.liveAuthorized ||
            !p.allowedChannels.includes("owned_intake") ||
            Date.now() >= Date.parse(p.stopAt)
          )
            throw new HttpError(
              409,
              "Live customer intake is not enabled within the operating window",
            );
          rate(
            `intake:${request.socket.remoteAddress ?? "unknown"}`,
            6,
            60_000,
          );
          const value = await body(request, 8_500_000);
          const experiment = store.experiment(
            text(value.experimentId, "experimentId", 100),
          );
          if (experiment.fulfillmentType === "qa")
            throw new HttpError(503, "Live device collector not connected");
          if (
            store.policy().enabledFulfillmentTypes &&
            !store
              .policy()
              .enabledFulfillmentTypes.includes(experiment.fulfillmentType)
          )
            throw new HttpError(
              503,
              "This fulfillment capability is not enabled",
            );
          if (
            !["candidate", "active"].includes(experiment.status) ||
            !experiment.channels.includes("owned_intake")
          )
            throw new HttpError(
              409,
              "This offer is not accepting customer requests",
            );
          if (value.consent !== true || value.assetRights !== true)
            bad(
              "Confirm customer contact consent and rights to submitted inputs/assets",
            );
          const contact = text(value.contact, "contact", 320)
              .normalize("NFKC")
              .trim()
              .toLowerCase(),
            name = text(value.name, "name", 160);
          // Stable, opaque buyer identity prevents repeated same-contact orders from
          // inflating independent-customer counts. This is not identity verification.
          const customerId = `contact:${createHmac("sha256", options.customerSecret).update(`customer-contact:v1:${contact}`).digest("hex")}`;
          const jobInput = await publicInput(
            value,
            experiment.fulfillmentType,
            randomUUID(),
            options.assetsDirectory,
          );
          const lead = store.addLead({
            experimentId: experiment.id,
            customerId,
            name,
            request: text(value.request, "request", 4000),
            sourceUrl: options.publicBaseUrl
              ? new URL("/api/requests", options.publicBaseUrl).toString()
              : "owned_intake",
            contact,
            channel: "owned_intake",
            consent: true,
            assetRights: true,
            independent: false,
            jobInput,
          });
          const job = store.enqueue(
            experiment.id,
            "fulfill",
            jobInput,
            `live:request:${lead.id}`,
            lead.id,
          );
          store.event("customer_order_requested", {
            orderId: job.id,
            leadId: lead.id,
            source: "owned_intake",
          });
          send(201, {
            order: customerStatus(store, job),
            token: customerOrderToken(options.customerSecret, job.id),
            tokenUsage: "Bearer token for this order only; keep it private.",
          });
          return;
        }
        const customerRoute = path.match(
          /^\/api\/orders\/([a-f0-9-]{36})(?:\/(approve|checkout|feedback|artifacts\/([0-9]{1,3})))?$/,
        );
        if (customerRoute) {
          if (!options)
            throw new HttpError(503, "Customer orders are not configured");
          const orderId = customerRoute[1]!;
          if (
            !authorized(
              request.headers.authorization,
              customerOrderToken(options.customerSecret, orderId),
            )
          )
            throw new HttpError(401, "Private order token required");
          const job = store.job(orderId);
          if (job.kind !== "fulfill" || !job.leadId || job.mode !== "live")
            throw new HttpError(404, "Customer order not found");
          const lead = store.lead(job.leadId),
            action = customerRoute[2];
          if (request.method === "GET" && !action) {
            send(200, customerStatus(store, job));
            return;
          }
          if (request.method === "POST" && action === "approve") {
            const value = await body(request);
            if (value.scopeHash !== job.scopeHash)
              throw new HttpError(
                409,
                "Approval must match the exact order scope",
              );
            if (!approved(store, job))
              store.addSignal({
                experimentId: job.experimentId,
                orderId: job.id,
                scopeHash: job.scopeHash,
                customerId: lead.customerId,
                type: "approval",
                evidence: `Customer bearer-token approval of immutable scope ${job.scopeHash}`,
                amountCents: 0,
                independent: lead.independent ?? false,
                mode: "live",
                externalId: `customer:approval:${job.id}:${job.scopeHash}`,
                verified: true,
              });
            const qualifiedId = `customer:qualified-request:${job.id}:${job.scopeHash}`;
            if (
              !store
                .signals(job.experimentId)
                .some((s) => s.externalId === qualifiedId)
            )
              store.addSignal({
                experimentId: job.experimentId,
                orderId: job.id,
                scopeHash: job.scopeHash,
                customerId: lead.customerId,
                type: "qualified_lead",
                evidence: `Customer approved the exact requested offer and immutable scope ${job.scopeHash}; independent-buyer qualification is separate`,
                amountCents: 0,
                independent: lead.independent ?? false,
                mode: "live",
                externalId: qualifiedId,
                verified: true,
              });
            send(200, customerStatus(store, store.job(job.id)));
            return;
          }
          if (request.method === "POST" && action === "feedback") {
            const value = await body(request, 12_000),
              feedback = text(value.text, "text", 2000).trim();
            const externalId = `customer:feedback:${job.id}:${createHash("sha256").update(feedback).digest("hex")}`;
            if (
              !store
                .signals(job.experimentId)
                .some((s) => s.externalId === externalId)
            )
              store.addSignal({
                experimentId: job.experimentId,
                orderId: job.id,
                scopeHash: job.scopeHash,
                customerId: lead.customerId,
                type: "reply",
                evidence: feedback,
                amountCents: 0,
                independent: lead.independent ?? false,
                mode: "live",
                externalId,
                verified: true,
              });
            send(200, { received: true, orderId: job.id });
            return;
          }
          if (request.method === "POST" && action === "checkout") {
            if (
              !provider ||
              !options.publicBaseUrl ||
              !options.stripeWebhookSecret
            )
              throw new HttpError(
                503,
                "Live Stripe checkout and webhook configuration are required",
              );
            if (!approved(store, job))
              throw new HttpError(409, "Approve the exact scope first");
            if (!ready(job))
              throw new HttpError(
                409,
                "The checked deliverable is not ready for customer review/payment",
              );
            if (job.priceCents === 0)
              throw new HttpError(
                409,
                "This is an approved free pilot; no checkout is required",
              );
            if (orderPayment(store, job).settled)
              throw new HttpError(409, "This order is already paid");
            const checkout = await provider.createCheckout({
              orderId: job.id,
              scopeHash: job.scopeHash,
              customerId: lead.customerId,
              offer: job.offer,
              priceCents: job.priceCents,
              currency: job.currency,
              returnBaseUrl: options.publicBaseUrl,
            });
            if (!checkout.live)
              throw new HttpError(
                409,
                "Stripe test checkout cannot be attached to a live order",
              );
            registerCheckout(store, job, checkout.id);
            send(201, { checkoutUrl: checkout.url, paymentConfirmed: false });
            return;
          }
          if (request.method === "GET" && action?.startsWith("artifacts/")) {
            if (!options.artifactsDirectory)
              throw new HttpError(503, "Artifact handoff is not configured");
            if (
              !approved(store, job) ||
              !ready(job) ||
              (job.priceCents > 0 && !orderPayment(store, job).settled)
            )
              throw new HttpError(
                403,
                "Exact approval and verified payment (or a zero-price pilot) are required",
              );
            if (activeDownloads >= 4)
              throw new HttpError(429, "Download capacity reached");
            const list = artifacts(job),
              index = Number(customerRoute[3]),
              selected = list[index];
            if (!selected) throw new HttpError(404, "Artifact not found");
            // Acquire before any asynchronous filesystem work; hold the slot until
            // the response finishes/closes, including network backpressure.
            activeDownloads++;
            let released = false;
            const release = () => {
              if (!released) {
                released = true;
                activeDownloads--;
              }
            };
            const readController = new AbortController();
            response.once("finish", release);
            response.once("close", () => {
              readController.abort();
              release();
            });
            try {
              const root = await realpath(options.artifactsDirectory),
                file = await realpath(
                  isAbsolute(selected.path)
                    ? selected.path
                    : resolve(root, selected.path),
                );
              const relation = relative(root, file);
              if (
                !relation ||
                relation.startsWith("..") ||
                isAbsolute(relation)
              )
                throw new HttpError(
                  403,
                  "Artifact escapes the configured delivery directory",
                );
              const info = await stat(file);
              if (!info.isFile() || info.size < 1 || info.size > 50_000_000)
                throw new HttpError(
                  403,
                  "Artifact is not a bounded regular file",
                );
              const bytes = await readFile(file, {
                signal: readController.signal,
              });
              if (bytes.length !== info.size || bytes.length > 50_000_000)
                throw new HttpError(409, "Artifact changed during handoff");
              const digest = createHash("sha256").update(bytes).digest("hex");
              store.db.exec(
                "CREATE TABLE IF NOT EXISTS commerce_downloads (order_id TEXT NOT NULL, artifact_index INTEGER NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY(order_id,artifact_index))",
              );
              response.once("finish", () => {
                // An aborted socket may emit finish while buffered writes fail.
                // It must never become a customer-delivery receipt.
                if (response.destroyed || !response.writableFinished) return;
                try {
                  store.db
                    .prepare(
                      "INSERT INTO commerce_downloads(order_id,artifact_index,sha256) VALUES(?,?,?) ON CONFLICT(order_id,artifact_index) DO UPDATE SET sha256=excluded.sha256",
                    )
                    .run(job.id, index, digest);
                  const count = Number(
                    store.db
                      .prepare(
                        "SELECT COUNT(*) AS count FROM commerce_downloads WHERE order_id=?",
                      )
                      .get(job.id)!.count,
                  );
                  store.event("customer_artifact_transferred", {
                    orderId: job.id,
                    artifactIndex: index,
                    sha256: digest,
                    bytes: bytes.length,
                  });
                  if (
                    count === list.length &&
                    !store
                      .signals(job.experimentId)
                      .some(
                        (s) =>
                          s.externalId ===
                          `customer:delivery:${job.id}:${job.scopeHash}`,
                      )
                  )
                    store.addSignal({
                      experimentId: job.experimentId,
                      orderId: job.id,
                      scopeHash: job.scopeHash,
                      customerId: lead.customerId,
                      type: "delivery",
                      evidence: `All ${list.length} checked artifact HTTP responses completed for this private order token; this does not prove use or satisfaction`,
                      amountCents: 0,
                      independent: lead.independent ?? false,
                      mode: "live",
                      externalId: `customer:delivery:${job.id}:${job.scopeHash}`,
                      verified: true,
                    });
                } catch (error) {
                  try {
                    store.event("delivery_record_failed", {
                      orderId: job.id,
                      reason:
                        error instanceof Error
                          ? error.message
                          : "Unknown persistence error",
                    });
                  } catch {
                    /* A shutting-down database cannot accept an audit event. */
                  }
                }
              });
              const name =
                basename(selected.name)
                  .replace(/[^A-Za-z0-9._-]/g, "_")
                  .slice(0, 160) || "artifact.bin";
              response.writeHead(200, {
                "content-type": "application/octet-stream",
                "x-content-sha256": digest,
                "content-length": bytes.length,
                "content-disposition": `attachment; filename="${name}"`,
                "cache-control": "private, no-store",
                "x-content-type-options": "nosniff",
                "content-security-policy": "sandbox; default-src 'none'",
                "cross-origin-resource-policy": "same-origin",
              });
              response.end(bytes);
            } catch (error) {
              release();
              throw error;
            }
            return;
          }
          send(404, { error: "Unknown customer operation" });
          return;
        }
        if (!authorized(request.headers.authorization, token)) {
          send(401, { error: "Authentication required" });
          return;
        }
        if (request.method === "GET" && path === "/api/status") {
          send(200, company.status());
          return;
        }
        if (request.method === "GET" && path === "/api/events") {
          send(200, store.events());
          return;
        }
        if (request.method === "POST" && path === "/api/leads") {
          send(201, store.addLead((await body(request)) as never));
          return;
        }
        if (request.method === "POST" && path === "/api/signals") {
          const value = await body(request);
          if (
            value.type === "payment" ||
            value.type === "refund" ||
            value.type === "delivery"
          )
            value.verified = false;
          const signal = store.addSignal(value as never);
          store.event("operator_evidence_intervention", {
            signalId: signal.id,
            verification: signal.verified ? "operator-attested" : "unverified",
          });
          send(201, signal);
          return;
        }
        if (request.method === "POST" && path === "/api/jobs") {
          const value = await body(request);
          send(
            201,
            store.enqueue(
              String(value.experimentId),
              value.kind as never,
              (value.input ?? {}) as Record<string, unknown>,
              text(value.idempotencyKey, "idempotencyKey", 200),
              typeof value.leadId === "string" ? value.leadId : null,
            ),
          );
          return;
        }
        send(404, { error: "Not found" });
      } catch (error) {
        send(error instanceof HttpError ? error.status : 400, {
          error:
            error instanceof HttpError
              ? error.message
              : "Request could not be completed",
        });
      }
    },
  );
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
