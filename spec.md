# Econic Dashboard Metabase Integration Spec

## Goal

Replace the current mock order data flow with a backend-served, Metabase-backed integration using the two available source tables:

- `econic_unicommerce_data`
- `econic_dashboard_shopify_data`

This spec is intentionally backend-first. The frontend should not call Metabase directly.

## Current frontend contract

The current dashboard expects:

- aggregate snapshot data for KPIs and breakdowns
- a recent-order stream for the map and live comments overlay
- traffic data from a separate realtime endpoint

Current frontend shapes live in:

- `src/types/dashboard.ts`
- `src/hooks/useDashboardStream.ts`

Important implication:

- The frontend is not ready to consume the raw database tables as-is.
- We need a canonical order fact shape between Metabase and the frontend.

## Source tables

### 1. `econic_unicommerce_data`

Fields:

- `id`
- `created_at`
- `updated_at`
- `code`
- `quantity`
- `price`
- `source`
- `order_category`

Likely characteristics:

- looks line-item-ish rather than order-level
- `quantity` suggests units
- `price` may be unit price or item-line price
- `code` may be the order identifier, but this must be confirmed

### 2. `econic_dashboard_shopify_data`

Fields:

- `id`
- `created_at`
- `updated_at`
- `shopify_order_id`
- `total_price`
- `latitude`
- `longitude`

Likely characteristics:

- looks order-level rather than line-item-level
- has location coordinates
- likely useful for map placement and order total

## Critical caveat

The two tables should not be joined blindly.

Why:

- `econic_unicommerce_data` likely has multiple rows per order
- `econic_dashboard_shopify_data` likely has one row per order
- if you join line items directly to order totals, revenue can be duplicated

Safe approach:

1. Aggregate `econic_unicommerce_data` to order grain first
2. Confirm the join key
3. Join aggregated order-level unicommerce data to shopify order-level data

## Required data product for the frontend

We need a canonical order fact model with one row per order, something conceptually like:

- `order_id`
- `order_timestamp`
- `order_value`
- `units_sold`
- `channel`
- `order_category`
- `lat`
- `lng`
- `city` or `null`
- `state` or `null`
- `brand` or `Unknown`
- `platform` or `Unknown`

This should be the shape used by the backend adapter before sending data to the frontend.

## Recommended architecture

### Do not do this

- frontend directly calls Metabase APIs
- frontend owns the SQL or Metabase question IDs
- frontend stitches multiple raw Metabase responses into business state

### Do this instead

Use a backend adapter layer:

- frontend calls your own server endpoints
- server queries Metabase saved questions or models
- server normalizes results into the dashboard contract

Recommended server endpoints:

- `GET /api/dashboard/snapshot`
- `GET /api/dashboard/orders?since=<iso>&limit=<n>`
- `GET /api/realtime-users`

Optional:

- `GET /api/dashboard/health`

## Metabase layer design

Create saved models/questions in Metabase at these levels.

### A. Canonical order facts

Purpose:

- one row per order
- normalized source for recent orders and aggregate metrics

Steps:

1. Create a Metabase model or native question that aggregates `econic_unicommerce_data` by order key
2. Sum `quantity` to get order units
3. Determine how to compute order value:
   - prefer one canonical source for revenue
   - do not sum both `price` and `total_price`
4. Join the aggregated order-level result to `econic_dashboard_shopify_data`
5. Expose lat/lng in the final model

### B. Aggregate snapshot query

Purpose:

- total orders
- total revenue
- total units
- average order value
- as-of timestamp

### C. Daily series query

Purpose:

- date bucket
- order count
- revenue
- units

### D. Breakdown query

Purpose:

- brand/channel/platform breakdowns

Current limitation:

- from the provided schema, `channel` may be derivable from `source`
- `brand` is not obviously available
- `platform` is not obviously available

So:

- channel breakdown may be feasible now
- brand/platform may need placeholder `Unknown` until another source exists

### E. Recent orders query

Purpose:

- recent order rows for the map and feed

Requirements:

- strict ordering by canonical order timestamp descending
- explicit row limit
- stable order identifier

## Mapping from source data to frontend fields

### Likely direct mappings

- `OrderEvent.id` <- confirmed canonical order key
- `OrderEvent.timestamp` <- confirmed order timestamp
- `OrderEvent.unitsSold` <- aggregated `SUM(quantity)`
- `OrderEvent.lat` <- `latitude`
- `OrderEvent.lng` <- `longitude`

### Needs business confirmation

- `OrderEvent.orderValue`
  - use `shopify total_price` or unicommerce-derived revenue
  - do not mix them casually

- `OrderEvent.channel`
  - likely mapped from `source`

- `OrderEvent.brand`
  - not present in the provided schema
  - default to `Unknown` unless another source exists

- `OrderEvent.platform`
  - not present in the provided schema
  - default to `Unknown` unless another source exists

- `OrderEvent.city` / `OrderEvent.state`
  - not present in the provided schema
  - must be derived from lat/lng, sourced elsewhere, or rendered as `Unknown`

## Frontend impact

These tables do not currently cover everything the UI shows.

Still missing from the provided schema:

- brand breakdown source
- platform breakdown source
- checkout funnel source
- realtime traffic source
- city/state labels for feed and map metadata

Implication:

- some frontend sections will need partial fallback behavior until those sources are defined

Recommended temporary behavior:

- keep traffic on the existing GA4-backed endpoint
- keep checkout funnel as `null` if no analytics source is available
- map unknown brand/platform to `Unknown`
- map missing city/state to `Unknown`

## Documentation questions for backend / analytics / data team

These must be answered before the integration is considered stable.

### Join and grain

- Is `econic_unicommerce_data.code` the same business order ID as `econic_dashboard_shopify_data.shopify_order_id`?
- Is the join one-to-one after aggregating unicommerce by `code`, or are there still one-to-many cases?
- Which table is the source of truth for canonical order existence?

### Revenue

- What is the correct revenue field for the dashboard:
  - `SUM(quantity * price)` from unicommerce
  - `total_price` from Shopify
  - something else?
- Is `price` a unit price, a row total, or net of discounts?
- Is `total_price` gross, net, tax-inclusive, or shipping-inclusive?

### Timestamp semantics

- Which timestamp represents the actual order event time:
  - `created_at`
  - `updated_at`
  - some other field not listed here?
- Are all timestamps in UTC?
- What timezone should the dashboard use for display and aggregation?

### Dimensions

- How should `source` map to the frontend `channel`?
- Where do `brand` and `platform` come from, if they are required in the UI?
- Is `order_category` meant to drive any current dashboard breakdown?

### Location

- Are `latitude` and `longitude` reliable for all orders?
- Do we have a source for city/state labels, or only coordinates?
- How should missing coordinates be handled?
- How should out-of-India coordinates be handled?

### Data quality

- Can there be duplicate rows for the same order in either table?
- Can orders appear in one table but not the other?
- How late can records arrive after the order event happened?

### Product scope

- Should breakdowns remain visible if brand/platform are not available yet?
- Is it acceptable to show `Unknown` buckets temporarily?
- Is checkout funnel in scope for this integration, or should it remain unavailable until another analytics source is connected?

## Implementation expectations for the agent

The next implementation step should:

1. introduce a real server-backed dashboard data source instead of the current mock-only source
2. define the server contract for snapshot + recent orders
3. keep the frontend adapter-friendly and avoid exposing Metabase details to the browser
4. support partial data gracefully where the schema is incomplete

## Acceptance criteria

- frontend does not call Metabase directly
- backend exposes a normalized dashboard contract
- recent orders are modeled at one row per order
- no double-counting from line-item/order-level joins
- unresolved schema gaps are explicitly handled, not ignored
- traffic remains separately sourced unless the backend provides a replacement
- spec questions are answered before production wiring is treated as complete

