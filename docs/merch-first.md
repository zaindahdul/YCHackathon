# Current weekend plan: a merch company that delivers

Updated November 7, 2026 following Srujan's correction: the available time is very short and the product can be simple merchandise. **This replaces the QR-display/CAD-file offer as the weekend starting point.** CAD remains a later upgrade. No storefront, supplier connection or order has been implemented by this planning work.

## The offer

**“Send your team’s logo. We handle the merch.”**

Start with one standard physical item from a real supplier, one artwork template, and a tiny order. A custom mug is the first candidate because official CVS pages list same-day mugs. A local printer's branded labels/magnets or another simple item may replace it if that is what can actually be produced today. Select one confirmed SKU; don't open a catalog.

The buyer gets the item, not a CAD file. The initial customer can be another hackathon team wanting its logo on something real. Do not require a hardware use case, a printer or an upcoming booth. Do not imply YC endorsement. Use only assets the customer authorizes.

## Delivery comes first

Default success target: **one independent customer approves the design and receives the actual physical item before judging.** An accepted production order, paid preorder, mockup and handed-over item are separate states. If the team instead chooses a later-delivery business, say so explicitly and use a confirmed date; it does not count as physical delivery before judging.

Before building customization features, spend at most 15–20 minutes checking:

1. The exact local store/provider, SKU, small quantity and blank stock.
2. Whether its actual equipment can make that product today, current cutoff and ready time.
3. Print template/file requirements, total cost and pickup location/hours.
4. Who can collect it, how long collection takes, and whether the customer can receive it.

A generic “same day” page is not a reservation or stock confirmation. If the mug is unavailable, choose another genuinely useful, confirmed merch item. If no physical route is confirmed, tell the team immediately: physical delivery is unverified. Do not silently switch to selling a PNG.

## What is realistically available — research, not confirmed capacity

- **CVS:** official pages list same-day custom mugs and other gifts, but a mug page can also report that the selected store cannot produce it. Check the exact San Francisco location and product. [Mugs](https://www.cvs.com/photo/mugs-prodid-7201028?skuId=562898), [SF photo locations](https://www.cvs.com/store-locator/cvs-pharmacy-locations/California/San-Francisco/photo-printing).
- **Staples:** its same-day page lists mugs and advertising labels, with a noon order cutoff. At this update it is already after noon Pacific; don't assume its standard same-day promise applies. The same page also advertises a paid express option for limited quantities, in three hours or less, with an order cutoff three hours before closing. Check whether the actual item/store is eligible; this is a lead to verify, not reserved capacity. [Same-day services](https://www.staples.com/services/printing/same-day-services/).
- **FedEx Office:** posters are listed as same day or within 24 hours depending on order/location. A poster is a display-print alternative, not a delivered shirt or mug. Confirm timing directly before choosing it. [Poster printing](https://www.office.fedex.com/default/all-print-products/posters.html).
- **Printful:** useful for standard apparel orders with a later stated delivery date, but average fulfillment is 2–5 business days before shipping. It is not the physical-by-Sunday route. [Shipping/fulfillment](https://www.printful.com/shipping).

No local inventory, specific pickup appointment, retail account or supplier API has been confirmed. Avoid spending the weekend on a brittle retail checkout integration: a human can submit/collect the first order, with that intervention disclosed.

## The smallest company loop

**Logo → approved print layout → exact quote → customer approval/payment → supplier acknowledgment → ready notification → collection → customer handoff → feedback.**

The Naïve agent handles the brief, one or two template-based layout choices, missing information, approval conversation, quote preparation, order packet and status/follow-up. Preserve the original logo; use the provider's actual print area and resolution rules. Have the customer approve a versioned preview. Deterministic code checks quote, amount, approval and payment truth.

Place a production order only with the customer's exact approval, verified payment where required and configured purchase authority. Reconcile ambiguous submissions before retrying. If a human must operate checkout, collect the item or resolve a failed print, record it as human work. A receipt is evidence of an order, not proof of delivery; delivery requires the real customer handoff.

Use ordinary SDK sessions as the baseline; native team availability remains disputed in the docs. No CAD exporter, 3D viewer, arbitrary geometry, multi-supplier bidding, apparel size catalog or customer account system is needed for this first job. CAD can return after the merch loop succeeds.

## Get the first buyer in a few conversations

Srujan asks three nearby independent teams: **“Want your team’s logo on a mug? We’re testing an agent-run merch shop. I’ll confirm the exact price and pickup time before you commit.”** Only use the named mug offer once its production route is verified; before then, ask whether they would want it and make no delivery promise.

Show one working sample/layout, get permission to use their logo, and let them choose/approve a design. Obtain one real customer before posting broadly. Offer no artificial deadline or “first three free” traction scheme. Free samples are valid product tests, but show them as free; paid orders are a separate measure.

Once someone receives an item, ask permission to show a photo and for one introduction to another team. This gives the next buyer tangible proof. The message becomes “we made this team's merch,” only after that is true. No marketing messages have been sent as part of this plan.

Price the actual item and service, not a $39 CAD package. Use a clear total based on supplier cost, fees, failed-print reserve and handling/pickup, with enough contribution to justify the job. Keep the founder's actual handling time visible. Do not advertise a fixed price until the exact item and costs are checked; batch collection may reduce pickup cost if multiple customers genuinely order.

## Short execution order

| First step | Srujan | Zain |
|---|---|---|
| First 15–20 minutes | Verify one production route and ask 3 teams about the item | Run a real Naïve session; prepare the provider-specific logo layout |
| Next 30–45 minutes | Agree one customer's quantity, price, artwork and handoff | Implement/persist brief → preview → approval → supplier order packet |
| Once ready | Complete authorized payment/order; disclose manual supplier steps | Capture run IDs, files, exact quote and provider acknowledgment |
| Before pickup closes | Collect confirmed ready order; inspect print; hand to customer | Record actual status, exceptions, costs and feedback |
| Before judging | Show item/customer evidence and rehearse | Verify no fake status, duplicated order or unrecorded intervention |

These are work timeboxes, not promises of supplier or model speed. The production cutoff overrides a feature-building schedule. If a workflow isn't ready, a truthful assisted pilot can still test demand while the SDK handles the parts that work. Do not claim the whole business ran unattended.

## Demo and finish line

Show the original logo request, an agent's design/quote decision, the approved layout, a genuine paid or free-labeled order, provider acknowledgment, the actual item with the customer, and costs/interventions. Aim for one completed job first, then repeat it if time and capacity allow.

The interesting accomplishment is **a company taking an order and delivering merch with agents doing measurable work**. Making the item technologically complicated is unnecessary. A supplier-ready file by itself does not meet the physical-delivery target.
