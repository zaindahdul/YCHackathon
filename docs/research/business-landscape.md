# Business landscape and recommended wedge

Research date: November 7, 2026. This is a recommendation and feasibility assessment, not evidence of connected accounts, customer demand, supplier acceptance, or orders placed. No customers or suppliers were contacted for this research.

## Decision status

This research records alternatives considered. The integrated [company plan](../company-plan.md) and [build plan](../build-plan.md) are authoritative: one QR-display family, native Naïve build123d first, and a scoped digital design offer. CadQuery and the $399 batch/deposit below are unselected alternatives for later validation, not parallel weekend commitments.

## Recommendation

Build an **autonomous custom-object studio for startup teams**. Its first product is a branded, functional desk object: a company-logo stand with a QR display for a demo, office, or event. The buyer supplies a company URL, approved logo, rough size, quantity, budget, and deadline. Agents turn that into an editable CAD design, a checked manufacturing package, a quote, an approval request, and a fulfillment workflow.

The shared customer need joining CAD and merch is: **“Make a useful physical thing that feels like our company, without making us manage a designer and manufacturer.”** This is more coherent than offering arbitrary engineering parts alongside generic shirts on day one. CAD is the production engine; custom merch is the initial market. Expand into noncritical custom fixtures and product displays after repeat orders establish quality and economics.

The strongest weekend version lets people at the event become actual customers. Show their requested changes, generated design revisions, accepted quotes, and supplier handoff. A manufactured sample would strengthen it if printer access is confirmed early. Do not make physical arrival by judging a dependency unless a supplier or available printer explicitly accepts that deadline.

## Three concrete products

| Product | What changes in CAD | Why someone might buy | Weekend scope |
| --- | --- | --- | --- |
| Branded demo-desk stand | Base width, logo relief/text, display angle, QR-panel slot | A useful product-demo object and team gift | Primary: one tested template, one material, one production process |
| Team-name cable organizer | Number and size of cable channels, team text, mounting dimensions | An onboarding gift that serves a daily purpose | Second template only after the first completes its workflow |
| Hardware startup demo cradle | Device dimensions, clearances, viewing angle, logo plate | Better presentation of an existing prototype | Later or a carefully bounded stretch; requires real dimensions and fit validation |

These are proposed products, not validated demand. Exclude electrical enclosures, food-contact objects, load-bearing parts, and safety-critical uses from the initial catalog. A valid model does not establish suitability for those uses.

## What already exists, and how to differ

**Conversational CAD is already a product category.** Zoo's current official page redirects the former Text-to-CAD URL to Zookeeper, a conversational CAD agent within Zoo Design Studio. Zoo describes editable models plus geometry inspection and debugging. Use it as an optional supplier of design capability, not the entire pitch. Its marketing description is not proof that any particular generated part is manufacturable. [Zoo Zookeeper](https://zoo.dev/zookeeper)

**Conventional merch fulfillment is already automated.** Printful offers a REST API with catalog, cost-estimation, order, and webhook capabilities. Draft orders can be created before confirmation; confirming an order charges the store owner's card. Its mockup generator is rate limited, so do not regenerate on every keystroke. It fulfills existing catalog products rather than arbitrary uploaded CAD objects. [Printful API documentation](https://developers.printful.com/docs/)

**Manufacturing marketplaces already quote uploaded geometry.** Xometry accepts several engineering file types, while mesh formats support selected processes. Its public developer onboarding page describes a partner-oriented API requiring an access request; do not assume a public customer instant-quote API is available to your new account. [Xometry file formats](https://community.xometry.com/kb/articles/643-what-file-types-does-xometry-accept), [Xometry developer onboarding](https://developer.xometry.com/docs/getting-started)

Your proposed difference is ownership of the complete small order: interpreting a messy request, choosing a supported product, checking dimensions, revising it, comparing real available production options, protecting margin, following status, and handling a customer change. The demo should show a decision that affected the outcome: an oversized design is revised, a cost increase changes the quote, or an impossible deadline produces an honest alternative. A viewer spinning an STL is weak evidence of a company operating.

Longer-term defensibility is a hypothesis: repeat customers' approved design history, verified production templates, supplier performance, and reorder workflows could reduce future transaction cost. Neither a model prompt nor connecting several APIs is a durable moat by itself.

## Technical and supplier feasibility

**Fallback CAD option considered: bounded parametric templates in CadQuery.** Official documentation supports Python-based parametric models and engineering exports including STEP, STL, and 3MF. A short template with constrained dimensions is easier to validate than arbitrary generated CAD code. Keep the editable source and export both an engineering artifact and a preview. [CadQuery documentation](https://cadquery.readthedocs.io/en/latest/)

**Alternative: OpenSCAD.** Its official site provides the language and modeling documentation. Use it if already familiar or installed; do not change geometry engines mid-build for appearance alone. Confirm the specific export formats and CLI behavior in the installed version before adopting an automation path. [OpenSCAD documentation](https://openscad.org/documentation.html)

**Local fabrication is the weekend path, subject to confirmation.** Treatstock lists FDM providers in San Francisco and nearby cities, including material availability and minimum charges. A listing does not prove current weekend capacity, pickup, quote accuracy, or access through an API. Verify the chosen provider before promising a date. [Treatstock San Francisco FDM directory](https://www.treatstock.com/3d-printing-services?location=san-francisco--ca--us&technology=fdm)

**Remote fabrication is a later shipping path.** Shapeways has a live developer documentation landing page listing model, materials, order, and shipping areas. During this inspection, deeper navigation returned the same landing page, so authenticated functionality and onboarding were not established. Do not put this integration on the critical path without a successful account-level test. [Shapeways developer portal](https://developers.shapeways.com/)

**Standard merch is an optional secondary channel.** Printful reports average fulfillment of 2–5 business days before shipping; its delivery dates are estimates. That does not support receiving a new remote order during a Saturday–Sunday hackathon. It can support a genuine draft/accepted production order and later delivery, accurately labeled. [Printful shipping and fulfillment](https://www.printful.com/shipping)

Choose one CAD engine and one fabrication path first. A supplier-ready package should include source revision, units, dimensions, material, quantity, desired finish/color, exported geometry, preview, customer approval, quote basis, and stated delivery conditions. Geometry checks should include valid solid/mesh, sensible bounds and volume, template-specific minimum dimensions, and successful slicing under a known printer profile. A passing slicer check still requires process-specific judgment; call the result a preflight, not a manufacturability guarantee.

## Pricing hypothesis and unit economics

An alternative physical-first offer would test a **$49 design deposit credited against a $399 batch of 20 simple branded stands**. This alternative was not selected for the initial weekend offer because supplier access is unconfirmed. These are proposed price points, not market observations. Ask whether the buyer would pay before treating this as validated.

Illustrative $399 batch calculation; all numbers below are assumptions needing real quotes:

| Item | Assumed dollars |
| --- | ---: |
| Customer revenue, excluding tax | 399 |
| Fabrication, 20 × $6 | 120 |
| Packaging | 20 |
| Delivery/shipping allowance | 25 |
| AI and tooling allocation | 3 |
| Payment fee allowance | 12 |
| Rework reserve | 15 |
| Variable cost total | 195 |
| Contribution before founder labor, overhead, and tax | 204 |

Contribution margin in this example is 204 / 399 = 51.1%. It is not net profit. If fabrication costs $10 per unit instead, contribution falls to $124, or 31.1%. If customers will only pay $199, the original cost model leaves $4 before labor and overhead. This makes supplier cost and willingness to pay the first commercial questions, rather than optional later research.

The agent should store quote provenance and expiry. An estimate from material volume is not a supplier quote. Reprice when quantity, dimensions, finish, address, or supplier cost changes. Require customer acceptance of the final specification and price. Founder authorization can establish a spending envelope for repeat operations; actions outside it must pause rather than silently buying an unprofitable order.

## Validation conversations

Use permission-based conversations with attendees first; no automated outreach was performed in this research.

1. What physical object did your company last buy for a launch, team, event, or demo? What did it cost and how long did coordination take?
2. Would a custom functional object be useful enough to buy, or do you only need standard apparel/stickers?
3. What is the next actual deadline, quantity, and budget? Who can authorize the purchase?
4. Would you accept a $49 credited design deposit now, with a specific revision policy and an honest delivery date?
5. Which dimension, logo detail, material, or finish would make this unacceptable?
6. Would you reorder the same design for each new employee, event, or customer milestone?

Ask a production provider: Can it inspect the actual exported file, quote this material and quantity, state pickup/shipping timing, and describe how failed prints/reworks are charged? Do not substitute “website says fast” for that confirmation.

## Feasible deadline and proof

The supplied schedule gives **22 hours from Saturday 1pm hacking to Sunday 11am stop**, despite the two-day event description. Plan for that window rather than 48 uninterrupted hours.

- First two hours: obtain a real brief from one attendee, confirm access to a printer/provider, export and inspect one simple stand, and establish the Naïve SDK run path.
- Next four hours: complete request → constrained design → preflight → honest quote → approval, recording actual agent actions.
- Evening: connect one authorized fulfillment/draft path; implement revisions, cost limits, retry-safe ordering, and status records. Seek two more real briefs only after the first works.
- Overnight/morning: exercise a changed quantity, invalid dimension, supplier failure, and restart. Capture evidence and any physical sample. Freeze before 11am and rehearse.

Demo claims must follow evidence: “designed” requires files; “quoted” needs quote provenance; “approved” needs a real customer decision; “paid” needs a real settled/test-labeled transaction; “ordered” needs a provider acknowledgment; “manufactured” needs an actual object. If production is blocked, deliver the useful design package and show the actual blocked state instead of simulating fulfillment as live.
