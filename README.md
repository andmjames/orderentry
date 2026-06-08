# Order Entry App

A standalone React app that turns a customer Purchase Order into a priced order
and pushes it to Zoho Inventory as a Sales Order. It shares the look, logo, fonts,
and color scheme of the Customer Pricing App, and reuses the same Zoho + Supabase
data sources.

## How it works

1. **Upload a PO** (PDF or image).
2. **Claude (Sonnet)** reads the PO, identifies which customer it's from (matched
   against your Zoho customer list), and extracts the line items.
3. The app loads that customer's **contract pricing** (Supabase `customer_pricing`)
   and **item details** (Zoho), then uses Claude again to **match the PO lines to
   that customer's catalog**. Items not on the customer's price list are excluded.
4. Pricing on the PO is **ignored** — the correct contract price tier is applied
   based on the number of cases ordered.
5. The app calculates, like the order sheet:
   - **No. of Cases on Order**
   - **No. of Pallets**
   - **Weight (lb)**
   - **Shipping Method** (Freight/LTL vs Parcel, from the customer's Zoho fields)
   - **Freight Charge** (free when the customer's "Cases for Free Freight" threshold
     is met, otherwise weight × the customer's per-lb rate)
   - **Shipping Account** (the customer's freight or parcel account, if on file)
6. Review and edit case quantities, then **approve** and click **Send to Zoho** to
   create the Sales Order in Zoho Inventory.

## Architecture

- **Frontend**: React 18 (Create React App)
- **Backend**: Netlify serverless functions (proxy to Zoho Inventory + Anthropic API)
- **Database**: Supabase (`customer_pricing` table, keyed by `customer_name`)
- **AI**: Anthropic Claude (Sonnet) — never called from the browser; the API key
  lives only in the serverless functions.

## Netlify Functions

| Function | Purpose |
|---|---|
| `zoho-customers.js` | List all Zoho customers |
| `zoho-customer.js` | One customer's details + freight/parcel custom fields |
| `zoho-items-by-sku.js` | Item details (units/case, weight/case, cases/pallet) by SKU |
| `po-analyze.js` | Claude: identify customer + extract PO line items |
| `po-match.js` | Claude: match PO lines to the customer's catalog |
| `zoho-create-salesorder.js` | Create the Sales Order in Zoho Inventory |

## Environment Variables (Netlify → Site settings → Environment variables)

| Variable | Scope | Value |
|---|---|---|
| `REACT_APP_SUPABASE_URL` | frontend | Supabase project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | frontend | Supabase anon key |
| `REACT_APP_PRICING_APP_URL` | frontend | Optional — URL of your deployed Customer Pricing App (enables the "Modify Customer Items & Pricing" popup) |
| `ZOHO_CLIENT_ID` | server | Zoho OAuth client ID |
| `ZOHO_CLIENT_SECRET` | server | Zoho OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | server | Zoho OAuth refresh token |
| `ZOHO_ORGANIZATION_ID` | server | Zoho organization ID |
| `ZOHO_DOMAIN` | server | Optional, non-US regions only |
| `ANTHROPIC_API_KEY` | server | Anthropic API key |
| `ANTHROPIC_MODEL` | server | Optional, defaults to a current Sonnet model |

> Required Zoho contact custom fields (same as the Customer Pricing App):
> `Cases for Free Freight`, `Method if Freight`, `Freight Account Number`,
> `Method if Parcel`, `Parcel Account Number`, `Parcel Price per LB`,
> `Freight Price per LB`.
> Required item custom fields: `Units per Case`, `Weight per Case (LBS)`,
> `Cases per Pallet` (label variants like "…per Carton" are also recognized).

## Deploy

Same as the Customer Pricing App: push to GitHub, import into Netlify. Build
settings are in `netlify.toml` (`npm run build` → `build`). Set the environment
variables above and deploy.

## Local Development

```bash
npm install
npm install -g netlify-cli
cp .env.example .env.local   # fill in values
netlify dev                  # http://localhost:8888
```

## Notes / Assumptions

- **Shipping method default**: palletized (≥ 1 pallet) or heavy (> 150 lb) orders
  default to Freight; otherwise Parcel. You can switch the method in the summary
  card, and freight/account recalculate accordingly.
- **Pallets**: summed as `Σ (cases ÷ cases-per-pallet)` across items, then rounded up.
- **Pricing tier**: the highest tier whose `min_cases` ≤ the cases ordered.
- Case quantities are editable in the review table; totals, weight, pallets, and
  freight recompute live. Only lines with a matched Zoho item **and** a contract
  price are sent to Zoho.
