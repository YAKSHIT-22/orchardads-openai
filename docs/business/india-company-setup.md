# Operating this SaaS from India — setup notes

> **This is not legal, tax, or accounting advice.** It is a structured research summary written by an engineer so that you can have a short, well-prepared conversation with a Chartered Accountant and a lawyer. Every item marked **[CONFIRM]** must be verified with a qualified Indian CA or advocate before you rely on it. Rules change; some of these change annually with the Finance Act.

**Date:** 2026-09-02.

---

## 1. Entity choice

| Structure | Setup cost / time | Compliance load | Foreign customers | When it fits |
| --- | --- | --- | --- | --- |
| **Sole proprietorship** | Nearly nil; GST + current account | Lowest | Possible but awkward — many foreign buyers and payment providers prefer a company; unlimited personal liability | Absolute earliest validation only |
| **LLP** | Moderate | Moderate; annual filings | Workable | Consultancies; rarely chosen by software startups |
| **Private Limited (Pvt Ltd)** | Higher; typically a few weeks | Highest — board, ROC filings, audit, DIN/DSC | **Best fit.** Clean for foreign customers, payment providers, and any future investment | **Recommended once you have paying customers** |

**Suggested sequencing:** start as a proprietorship with GST if you need to invoice immediately, and **incorporate a Pvt Ltd before you take meaningful international revenue or your first serious customer contract.** Incorporating too early buys compliance cost before there is anything to protect. **[CONFIRM]** the trigger point with your CA.

---

## 2. GST

| Topic | Research summary | Status |
| --- | --- | --- |
| Registration threshold | A services threshold (commonly cited as ₹20 lakh, lower in some special-category states) exists, **but** registration is effectively mandatory much earlier in practice for export claims and for platform onboarding | **[CONFIRM]** current threshold and your state |
| Domestic B2B SaaS | Taxable supply of service; commonly **18%** | **[CONFIRM]** rate and SAC code for your service |
| **Export of services** | Software/SaaS to a foreign customer is generally treated as **export of services** and **zero-rated**, subject to conditions (recipient outside India, payment in convertible foreign exchange, supplier and recipient not merely establishments of the same person) | **[CONFIRM]** — this is the single most valuable item to get right |
| LUT (Letter of Undertaking) | Filing an LUT generally lets you export **without paying IGST** and without the refund cycle. Typically filed annually | **[CONFIRM]** procedure and renewal timing |
| Invoicing | Export invoices must carry specific declarations and (where applicable) LUT reference; e-invoicing applies above a turnover threshold | **[CONFIRM]** |
| Input tax credit | GST paid on Indian inputs (some SaaS vendors, professional fees) may be creditable | **[CONFIRM]** |

**Practical consequence for the pricing page:** show **INR prices exclusive of GST** with "+18% GST" stated, and **USD prices as final** for foreign customers (zero-rated export). Do not display one blended number.

---

## 3. Receiving money

| Route | Fit | Notes |
| --- | --- | --- |
| **Razorpay** | **Primary for Indian customers** | UPI, cards, netbanking, RuPay; supports subscriptions; well understood by Indian CAs. ~2% + GST typical |
| **Razorpay / Cashfree international** | Secondary for foreign cards | Requires export documentation (FIRC/eBRC-style proof of inward remittance) |
| **Stripe India** | **[CONFIRM] current availability and eligibility** for an Indian entity — this has changed repeatedly. Do not design around it until confirmed | |
| **Paddle / Lemon Squeezy (Merchant of Record)** | **Strongly consider for global sales** | The MoR becomes the seller of record: they handle global sales tax/VAT registration and remittance, chargebacks, and invoicing; they pay you as a supplier. Higher fee (~5%) buys away an enormous compliance surface. **[CONFIRM]** how the MoR relationship is characterized for Indian GST/export purposes |
| **Direct bank / wire** | Enterprise only | Needs FIRC/eBRC for export proof |

**Recommendation:** **Razorpay for India + a Merchant of Record for the rest of the world.** For a solo founder, an MoR removes the need to reason about EU VAT, UK VAT, US state sales tax, and dozens of registration regimes. Take the 5%.

**[CONFIRM]** with your CA: FEMA implications of receiving foreign currency, the requirement to realize export proceeds within a prescribed period, and the documentation (FIRC / eBRC or equivalent) your bank will want.

---

## 4. Direct tax

| Topic | Summary | Status |
| --- | --- | --- |
| Corporate income tax | Pvt Ltd rates vary by regime and turnover; concessional regimes exist for certain companies | **[CONFIRM]** |
| Presumptive taxation | Sections such as 44AD/44ADA may apply to proprietorships within turnover limits | **[CONFIRM]** eligibility for a software business |
| **TDS you must deduct** | On payments to Indian vendors, contractors, professionals, and rent above thresholds | **[CONFIRM]** rates and thresholds |
| **Equalisation levy / TDS on foreign digital vendors** | Payments to non-resident vendors (Vercel, Neon, Upstash, OpenAI, Anthropic, Google) may attract withholding or levy obligations. **This one surprises founders every year.** | **[CONFIRM]** current position — the rules here have changed repeatedly |
| Advance tax | Quarterly instalments once liability crosses the threshold | **[CONFIRM]** |
| Transfer pricing | Only if you create a foreign subsidiary later | **[CONFIRM]** if relevant |

---

## 5. Legal documents needed before the first paying customer

| Document | Why it is non-negotiable here |
| --- | --- |
| **Terms of Service** | Must state explicitly: we act on the customer's instruction; automated changes happen only within the limits the customer configures; we are not liable for ad-spend outcomes; the customer remains responsible for compliance with OpenAI's advertising policies |
| **Privacy Policy** | We process customer account data, campaign data, and personal data of their team. Must cover India's **DPDP Act** obligations **[CONFIRM]** and, if we serve EU customers, GDPR |
| **Data Processing Agreement (DPA)** | Enterprise and EU customers will require one. Includes sub-processor list (Vercel, Neon, Upstash, model providers), transfer mechanism, breach notification |
| **Sub-processor page** | Public list, kept current |
| **Refund / cancellation policy** | Required by Indian payment gateways at onboarding |
| **Security page** | Encryption at rest, credential handling, access control, audit logging. Buyers of an ad-account-write tool will ask |
| **Credential-handling disclosure** | Plain-language: what the OpenAI Ads API key can do, that it is encrypted, that it never leaves our servers, how to revoke it in Ads Manager |

**[CONFIRM]** all of the above with a lawyer. Template ToS/Privacy from a generic generator is a poor fit for a product that holds a credential which can spend money.

---

## 6. Compliance calendar (indicative, **[CONFIRM]** every date)

| Cadence | Item |
| --- | --- |
| Monthly / quarterly | GST returns (GSTR-1, GSTR-3B); TDS deposit |
| Quarterly | TDS returns; advance tax |
| Annually | LUT renewal; income-tax return; ROC filings (Pvt Ltd); statutory audit if applicable; DIR-3 KYC |
| Ongoing | Export proceeds realization and documentation |

---

## 7. What to actually do, in order

1. **Now (pre-revenue):** build. Nothing here blocks development. Use personal accounts for vendor spend and keep receipts.
2. **Before the first invoice:** engage a CA; decide proprietorship vs Pvt Ltd; obtain GST registration; file LUT if exporting.
3. **Before the first foreign customer:** MoR account (Paddle/Lemon Squeezy) or Razorpay international + export documentation process; publish ToS, Privacy, refund policy.
4. **Before the first enterprise customer:** Pvt Ltd, DPA, sub-processor page, security page.
5. **Ongoing:** monthly bookkeeping from day one. Retrofitting a year of transactions is the most expensive avoidable mistake at this stage.

---

## 8. Questions to take to your CA (copy this list)

1. Proprietorship or Pvt Ltd for a SaaS with mostly foreign customers — and at what revenue should I switch?
2. GST registration threshold for services in my state today, and does exporting force earlier registration?
3. Is my SaaS an "export of services"? What exactly must my invoices say?
4. Should I file an LUT, and when?
5. What proof of inward remittance will my bank require, and how do I obtain it routinely?
6. Do I owe TDS or equalisation levy on payments to Vercel, Neon, Upstash, OpenAI, Anthropic? At what rate?
7. Does a Merchant of Record (Paddle) change my GST treatment — am I supplying to the MoR or to the end customer?
8. Is Stripe currently usable by an entity like mine?
9. What is my advance-tax schedule once revenue starts?
10. What are my DPDP Act obligations as a processor of customer business data?
