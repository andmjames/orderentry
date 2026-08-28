# PMI Tape — Order Entry App

React (Create React App) frontend + Netlify Functions backend. Reads customer POs with
Claude, matches items against the customer's price list, and creates Sales Orders in
Zoho Inventory, plus packing lists, pallet labels, and customs/BOL documents.

Live: https://pmiorder.netlify.app · Repo: andmjames/orderentry

---

## Architecture

- `src/` — React app (CRA). Key files:
  - `src/components/OrderReview.js` — the main orchestrator (large; most features live here)
  - `src/components/OrderSummary.js`, `OrderItemsTable.js`, `PackingList.js`, `PalletLabels.js`
  - `src/lib/order.js` — PURE calculations (totals, shipping, pallets, address matching). No I/O.
  - `src/lib/zoho.js` — client helpers; every call goes through a Netlify function
  - `src/lib/supabase.js` — customer pricing lookups
  - `src/lib/packingPdf.js`, `palletPdf.js` — jsPDF document generation
- `netlify/functions/` — all server-side work. Credentials live here, never in the browser.
  - `zoho-utils.js` — token minting/caching + shared request helpers (`zohoGet/Post/Put/Upload`)
  - `po-analyze.js` / `po-match.js` — Claude API calls (PO reading and item matching)
  - `zoho-*.js` — customers, items, sales orders, invoices, attachments

**Rule:** the browser never talks to Zoho or Anthropic directly. Add a Netlify function instead.

---

## Deployment

- Deploys happen by pushing to `main`; Netlify auto-builds and publishes.
- Changes to `netlify/functions/**` REQUIRE a real build (function bundling). Never deploy
  those via Netlify's drag-and-drop.
- The owner deploys through the GitHub web UI / PR merges — not a local CLI.

## Build constraints (these break deploys)

- Netlify builds with `CI=true`, so **ESLint warnings fail the build**. No unused variables,
  no unused imports.
- Do NOT add `eslint-disable` comments for rules that aren't in this project's config
  (e.g. `react-hooks/exhaustive-deps`) — an unknown rule name is itself a fatal error.
- Prompt strings in the functions are backtick template literals. **Never put a backtick
  inside prompt text** — it terminates the literal and breaks the build. Use single quotes.

---

## Zoho Inventory integration

- US data center. API base `https://www.zohoapis.com/inventory/v1`.
- `organization_id=710612567` is required on every call (handled by `buildApiUrl`).
- Auth: refresh-token grant. Access tokens are cached in Supabase table `zoho_token_cache`
  under key `zoho_order_entry` so stateless function instances don't each mint a token and
  trip Zoho's rate limit ("too many requests"). Needs `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
  (service role — the table has RLS on).
- `authedFetch` retries once on a 401 with a freshly minted token.
- Common errors: `401 code 57` = the refresh token is missing a scope for that endpoint.

### Data sources (don't mix these up)
- Customer list and customer details (addresses, freight settings, terms) → **Zoho contacts**.
  The list is cached 15 minutes in localStorage; details are fetched fresh per selection.
- Item details (units/case, weight/case, cases/pallet, stock) → **Zoho items**.
  "Available for Sale" = `stock_on_hand − committed_stock` (can be negative).
- **Pricing** → **Supabase** `customer_pricing`, keyed by the exact Zoho customer name.
- A contact's primary `shipping_address`/`billing_address` are separate from the `addresses`
  array (which holds only ADDITIONAL addresses). Read both.

---

## Claude API calls (po-analyze, po-match)

- Model comes from `ANTHROPIC_MODEL` (defaults to `claude-sonnet-4-6`), `temperature: 0`.
- Both use **tool use / structured output** (`tool_choice`) so the API returns an already-parsed,
  schema-validated object. This exists because free-text JSON kept breaking on unescaped inch
  marks (`3" x 60YD`) and stray code fences.
- **If you change the prompt's output shape, change the tool `input_schema` to match.**
  A field missing from the schema is silently dropped. Field names must match what the
  frontend reads (e.g. `customer_name`, `line_items`, `matches`, `unmatched`, `po_index`,
  `item_number`, `ordered_quantity`).
- A text-parsing fallback with a JSON repair pass is kept for safety.

---

## Business rules worth knowing

- **Shipping**: <160 lb product → parcel, ≥160 lb → freight (user can override).
  Pallets are freight-only. Charge precedence: RJ Hanlon flat $94 → Image Technology
  $120×pallets → free-freight threshold → account on file → per-lb.
- **Pallet height**: `(palletFraction / pallets) × 60`, clamped **19"–60"**, so the load is
  spread evenly across the rounded-up pallet count. Dimensions are always `40"x48"xH"`.
- **Order-level price breaks**: tier is chosen by TOTAL order case count across all lines.
- **Customer discount**: percentage of the product subtotal (freight excluded), added to the
  Zoho SO as a negative line item using the "Duties" item id `2211255000000234247`.
  It must NOT appear on the packing list.
- **Credit hold**: any open invoice 15+ days overdue. 15–29 days and 30+ days each add a note.
- **Private-label matching**: PMI manufactures product that customers stock under their own
  brand. Match on product spec (family number, width, length, type) and ignore the brand
  label — e.g. a PO line for `PMI #451 3"` matches catalog item `RIV3451` (River City).
- **Customer-specific docs**: Ryonet barcode note; Image Technology + Screen Printers Resource
  get the boxed "Do Not Stack" cone/label note; plastic-pallet customer list; Nazdar footer;
  Menards Bill of Lading; Canada/USMCA customs pages.
- Never use PMI's own address (525 Herriman Ct, Noblesville IN 46060) as a ship-to.

---

## Working style

- Bundle multiple fixes per deploy; after each change, say explicitly **what to test**.
- Debugging is usually done from screenshots, so prefer visible on-screen diagnostics and
  error messages that quote the real underlying error rather than a generic one.
- Keep secrets in Netlify environment variables. Never commit them.
- Don't produce zip deliverables for this repo — commit to the repo instead.

## Environment variables (Netlify)

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORGANIZATION_ID`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (optional), `REACT_APP_SUPABASE_URL`,
`REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_PRICING_APP_URL` (optional),
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
