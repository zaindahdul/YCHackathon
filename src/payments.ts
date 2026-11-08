import Stripe from "stripe";
import type { Store } from "./store.js";
import type { Job } from "./domain.js";

export interface CheckoutRequest {
  orderId: string;
  scopeHash: string;
  customerId: string;
  offer: string;
  priceCents: number;
  currency: "USD";
  returnBaseUrl: string;
}
export interface PaymentProvider {
  createCheckout(
    input: CheckoutRequest,
  ): Promise<{ id: string; url: string; live: boolean }>;
  constructEvent(raw: Buffer, signature: string, secret: string): Stripe.Event;
}
/** Provider calls occur only in customer-initiated checkout; signature checks are local. */
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe;
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, {
      timeout: 10_000,
      maxNetworkRetries: 0,
    });
  }
  async createCheckout(input: CheckoutRequest) {
    if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0)
      throw new Error("Checkout requires a positive fixed amount");
    const metadata = {
      orderId: input.orderId,
      scopeHash: input.scopeHash,
      customerId: input.customerId,
    };
    const origin = new URL(input.returnBaseUrl);
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      )
    )
      throw new Error("Public checkout base URL must use HTTPS");
    if (origin.username || origin.password || origin.search || origin.hash)
      throw new Error("Invalid checkout base URL");
    const returnUrl = new URL("/checkout/return", origin);
    returnUrl.searchParams.set("order", input.orderId);
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: input.orderId,
        metadata,
        payment_intent_data: { metadata },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: input.priceCents,
              product_data: { name: input.offer.slice(0, 250) },
            },
          },
        ],
        success_url: returnUrl.toString(),
        cancel_url: returnUrl.toString(),
      },
      { idempotencyKey: `order:${input.orderId}:${input.scopeHash}` },
    );
    if (!session.url) throw new Error("Stripe returned no hosted checkout URL");
    return { id: session.id, url: session.url, live: session.livemode };
  }
  constructEvent(raw: Buffer, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(raw, signature, secret);
  }
}

function table(store: Store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS commerce_checkouts (
    order_id TEXT PRIMARY KEY, scope_hash TEXT NOT NULL, checkout_id TEXT NOT NULL UNIQUE,
    payment_intent_id TEXT UNIQUE, created_at TEXT NOT NULL
  )`);
}
export function registerCheckout(store: Store, job: Job, checkoutId: string) {
  table(store);
  const old = store.db
    .prepare("SELECT * FROM commerce_checkouts WHERE order_id=?")
    .get(job.id);
  if (
    old &&
    (old.scope_hash !== job.scopeHash || old.checkout_id !== checkoutId)
  )
    throw new Error("Order already has a different checkout");
  store.db
    .prepare(
      "INSERT OR IGNORE INTO commerce_checkouts(order_id,scope_hash,checkout_id,created_at) VALUES(?,?,?,?)",
    )
    .run(job.id, job.scopeHash, checkoutId, new Date().toISOString());
}
export type PaymentEventResult = {
  status: "recorded" | "duplicate" | "ignored" | "pending";
  reason: string;
  orderId?: string;
};
function id(value: unknown): string | null {
  return typeof value === "string"
    ? value
    : value &&
        typeof value === "object" &&
        "id" in value &&
        typeof value.id === "string"
      ? value.id
      : null;
}
function paidSignals(store: Store, job: Job) {
  return store
    .signals(job.experimentId)
    .filter(
      (s) =>
        s.orderId === job.id &&
        s.scopeHash === job.scopeHash &&
        s.mode === "live" &&
        s.verified,
    );
}
export function orderPayment(store: Store, job: Job) {
  const signals = paidSignals(store, job);
  const paidCents = signals
    .filter((s) => s.type === "payment")
    .reduce((sum, s) => sum + s.amountCents, 0);
  const refundedCents = signals
    .filter((s) => s.type === "refund")
    .reduce((sum, s) => sum + s.amountCents, 0);
  return {
    paidCents,
    refundedCents,
    settled: job.priceCents > 0 && paidCents - refundedCents >= job.priceCents,
  };
}

/** Call only after verifying the raw Stripe signature. This never trusts a browser success redirect. */
export function processStripeEvent(
  store: Store,
  event: Stripe.Event,
): PaymentEventResult {
  table(store);
  const ignored = (reason: string, orderId?: string): PaymentEventResult => ({
    status: "ignored",
    reason,
    ...(orderId ? { orderId } : {}),
  });
  if (event.livemode !== true || store.policy().mode !== "live")
    return ignored("Test-mode provider events never become live revenue");
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (
      !session.livemode ||
      session.mode !== "payment" ||
      session.payment_status !== "paid" ||
      session.status !== "complete"
    )
      return ignored("Checkout has not completed a live payment");
    const orderId = session.metadata?.orderId;
    if (!orderId) return ignored("Missing order metadata");
    let job: Job;
    try {
      job = store.job(orderId);
    } catch {
      return {
        status: "pending",
        reason: "Referenced order is not available yet",
        orderId,
      };
    }
    const lead = job.leadId ? store.lead(job.leadId) : null;
    const checkout = store.db
      .prepare("SELECT * FROM commerce_checkouts WHERE order_id=?")
      .get(job.id);
    if (!checkout)
      return {
        status: "pending",
        reason: "Checkout registration is not available yet",
        orderId,
      };
    if (
      !lead ||
      job.kind !== "fulfill" ||
      job.mode !== "live" ||
      checkout.checkout_id !== session.id ||
      checkout.scope_hash !== job.scopeHash ||
      session.metadata?.scopeHash !== job.scopeHash ||
      session.metadata?.customerId !== lead.customerId ||
      session.client_reference_id !== job.id ||
      session.currency !== "usd" ||
      session.amount_total !== job.priceCents ||
      job.priceCents <= 0
    ) {
      return ignored(
        "Checkout does not match the immutable customer/order/price/currency contract",
        orderId,
      );
    }
    const approval = store
      .signals(job.experimentId)
      .some(
        (s) =>
          s.orderId === job.id &&
          s.scopeHash === job.scopeHash &&
          s.customerId === lead.customerId &&
          s.type === "approval" &&
          s.verified &&
          s.mode === "live",
      );
    if (!approval)
      return ignored("Payment lacks exact-scope customer approval", orderId);
    const intent = id(session.payment_intent);
    if (!intent)
      return ignored(
        "Completed checkout lacks a payment-intent reference",
        orderId,
      );
    if (checkout.payment_intent_id && checkout.payment_intent_id !== intent)
      return ignored("Checkout payment-intent reference changed", orderId);
    // Persist/repair the mapping before an idempotent payment return. A crash
    // after payment insertion must not strand every later refund callback.
    store.db
      .prepare(
        "UPDATE commerce_checkouts SET payment_intent_id=? WHERE order_id=?",
      )
      .run(intent, job.id);
    const externalId = `stripe:payment:${session.id}`;
    const existing = store
      .signals(job.experimentId)
      .find((s) => s.externalId === externalId);
    if (existing)
      return {
        status: "duplicate",
        reason: "Checkout payment already recorded",
        orderId,
      };
    if (paidSignals(store, job).some((s) => s.type === "payment"))
      return ignored(
        "An order cannot record a second provider payment",
        orderId,
      );
    store.addSignal({
      experimentId: job.experimentId,
      orderId: job.id,
      scopeHash: job.scopeHash,
      customerId: lead.customerId,
      type: "payment",
      evidence: `Verified live Stripe checkout ${session.id}; signed event ${event.id}`,
      amountCents: job.priceCents,
      independent: lead.independent ?? false,
      mode: "live",
      verified: true,
      externalId,
    });
    store.event("provider_payment_verified", {
      orderId,
      checkoutId: session.id,
      eventId: event.id,
    });
    return {
      status: "recorded",
      reason: "Exact live checkout payment recorded",
      orderId,
    };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    if (!charge.livemode || !charge.paid || charge.currency !== "usd")
      return ignored("Not a paid live USD charge");
    const intent = id(charge.payment_intent);
    const checkout = intent
      ? store.db
          .prepare("SELECT * FROM commerce_checkouts WHERE payment_intent_id=?")
          .get(intent)
      : undefined;
    if (!checkout)
      return {
        status: "pending",
        reason: "Refund awaits original verified checkout mapping",
      };
    const job = store.job(String(checkout.order_id)),
      lead = job.leadId ? store.lead(job.leadId) : null;
    if (
      !lead ||
      job.mode !== "live" ||
      charge.amount !== job.priceCents ||
      checkout.scope_hash !== job.scopeHash
    )
      return ignored("Refund does not match the original order", job.id);
    if (
      !Number.isSafeInteger(charge.amount_refunded) ||
      charge.amount_refunded < 0 ||
      charge.amount_refunded > job.priceCents
    )
      return ignored("Invalid cumulative provider refund", job.id);
    const paid = orderPayment(store, job);
    if (paid.paidCents !== job.priceCents)
      return {
        status: "pending",
        reason: "Refund awaits verified original payment",
        orderId: job.id,
      };
    const delta = charge.amount_refunded - paid.refundedCents;
    if (delta <= 0)
      return {
        status: "duplicate",
        reason: "Cumulative refund already recorded or event is older",
        orderId: job.id,
      };
    store.addSignal({
      experimentId: job.experimentId,
      orderId: job.id,
      scopeHash: job.scopeHash,
      customerId: lead.customerId,
      type: "refund",
      evidence: `Verified Stripe charge refund ${charge.id}; cumulative ${charge.amount_refunded}; signed event ${event.id}`,
      amountCents: delta,
      independent: lead.independent ?? false,
      mode: "live",
      verified: true,
      externalId: `stripe:refund:${charge.id}:${charge.amount_refunded}`,
    });
    store.event("provider_refund_verified", {
      orderId: job.id,
      chargeId: charge.id,
      eventId: event.id,
      amountCents: delta,
    });
    return {
      status: "recorded",
      reason: "Confirmed refund delta recorded",
      orderId: job.id,
    };
  }
  return ignored("Provider event has no commercial state transition");
}
