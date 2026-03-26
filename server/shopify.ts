import type { DashboardDateRange } from "../src/types/dashboard";
import { getUtcRangeForIst } from "./timeRange";

const SHOPIFY_API_VERSION = "2026-01";
const SHOPIFY_ACCESS_TOKEN_TTL_BUFFER_MS = 60_000;
const SHOPIFY_PAGE_SIZE = 100;

interface ShopifyLineItemNode {
  id: string;
  title: string;
  vendor: string | null;
  quantity: number;
  originalUnitPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
}

interface ShopifyOrderNode {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  currentTotalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  shippingAddress: {
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
  } | null;
  app: {
    id: string | null;
    name: string | null;
  } | null;
  lineItems: {
    edges: Array<{
      node: ShopifyLineItemNode;
    }>;
  };
}

interface ShopifyOrdersResponse {
  data?: {
    orders?: {
      edges: Array<{ cursor: string; node: ShopifyOrderNode }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
  errors?: Array<{ message?: string }>;
}

interface ShopifyTokenResponse {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

type ShopifyBrand = "Core" | "BTC" | "Amodira" | "Unknown";

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let inFlightAccessTokenPromise: Promise<string> | null = null;

function getRequiredEnv(
  name: "SHOPIFY_SHOP_DOMAIN" | "SHOPIFY_CLIENT_ID" | "SHOPIFY_CLIENT_SECRET",
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function mapVendorToBrand(vendor: string | null | undefined): ShopifyBrand {
  const normalized = vendor?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return "Unknown";
  }

  if (normalized.includes("amodira")) {
    return "Amodira";
  }

  if (normalized.includes("beyondthecurve") || normalized === "btc") {
    return "BTC";
  }

  if (normalized.includes("virgio") || normalized.includes("core")) {
    return "Core";
  }

  return "Unknown";
}

function buildRangeQuery(dateRange: DashboardDateRange) {
  const { startIso, endInclusiveIso } = getUtcRangeForIst(dateRange);

  return `created_at:>='${startIso}' created_at:<='${endInclusiveIso}'`;
}

function formatDateInIst(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTimeInIst(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function getShopifyAccessToken() {
  const now = Date.now();

  if (cachedAccessToken && now < cachedAccessToken.expiresAt - SHOPIFY_ACCESS_TOKEN_TTL_BUFFER_MS) {
    return cachedAccessToken.value;
  }

  if (!inFlightAccessTokenPromise) {
    inFlightAccessTokenPromise = requestShopifyAccessToken().finally(() => {
      inFlightAccessTokenPromise = null;
    });
  }

  return inFlightAccessTokenPromise;
}

async function requestShopifyAccessToken() {
  const shopDomain = getRequiredEnv("SHOPIFY_SHOP_DOMAIN");
  const clientId = getRequiredEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SHOPIFY_CLIENT_SECRET");
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify token request failed with status ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as ShopifyTokenResponse;

  if (!payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Shopify token request did not return an access token",
    );
  }

  const expiresInMs = Math.max(
    (payload.expires_in ?? 86_399) * 1000,
    SHOPIFY_ACCESS_TOKEN_TTL_BUFFER_MS,
  );
  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + expiresInMs,
  };

  return payload.access_token;
}

async function fetchShopifyOrdersPage(query: string, after: string | null) {
  const shopDomain = getRequiredEnv("SHOPIFY_SHOP_DOMAIN");
  const accessToken = await getShopifyAccessToken();
  const response = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `
          query OrdersPage($first: Int!, $after: String, $query: String!) {
            orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true, query: $query) {
              edges {
                cursor
                node {
                  id
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  currentTotalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  shippingAddress {
                    city
                    province
                    country
                    zip
                  }
                  app {
                    id
                    name
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        title
                        vendor
                        quantity
                        originalUnitPriceSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        variables: {
          first: SHOPIFY_PAGE_SIZE,
          after,
          query,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify orders request failed with status ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as ShopifyOrdersResponse;

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((error) => error.message ?? "Unknown Shopify error").join("; "),
    );
  }

  return payload.data?.orders;
}

export async function getShopifyOrdersForDateRange(dateRange: DashboardDateRange) {
  const query = buildRangeQuery(dateRange);
  const orders: Array<{
    id: string;
    name: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    orderValue: number;
    currencyCode: string;
    shippingAddress: {
      city: string | null;
      province: string | null;
      country: string | null;
      zip: string | null;
    } | null;
    quantity: number;
    vendorSummary: string | null;
    brand: ShopifyBrand;
    channel: "D2C";
    platform: "Unknown";
    appId: string | null;
    appName: string | null;
    lineItems: Array<{
      id: string;
      title: string;
      vendor: string | null;
      quantity: number;
      unitPrice: number;
      currencyCode: string;
      totalPrice: number;
    }>;
  }> = [];

  let after: string | null = null;

  while (true) {
    const connection = await fetchShopifyOrdersPage(query, after);

    if (!connection) {
      break;
    }

    for (const edge of connection.edges) {
      const vendors = Array.from(
        new Set(
          edge.node.lineItems.edges
            .map((lineItem) => lineItem.node.vendor?.trim())
            .filter((vendor): vendor is string => Boolean(vendor)),
        ),
      );
      const brand =
        vendors.map(mapVendorToBrand).find((mappedBrand) => mappedBrand !== "Unknown") ?? "Unknown";

      orders.push({
        id: edge.node.id,
        name: edge.node.name,
        createdAt: edge.node.createdAt,
        financialStatus: edge.node.displayFinancialStatus,
        fulfillmentStatus: edge.node.displayFulfillmentStatus,
        orderValue: Number(edge.node.currentTotalPriceSet.shopMoney.amount),
        currencyCode: edge.node.currentTotalPriceSet.shopMoney.currencyCode,
        shippingAddress: edge.node.shippingAddress,
        quantity: edge.node.lineItems.edges.reduce((sum, lineItem) => sum + lineItem.node.quantity, 0),
        vendorSummary: vendors.join(", ") || null,
        brand,
        channel: "D2C",
        platform: "Unknown",
        appId: edge.node.app?.id ?? null,
        appName: edge.node.app?.name ?? null,
        lineItems: edge.node.lineItems.edges.map(({ node: lineItem }) => ({
          id: lineItem.id,
          title: lineItem.title,
          vendor: lineItem.vendor,
          quantity: lineItem.quantity,
          unitPrice: Number(lineItem.originalUnitPriceSet.shopMoney.amount),
          currencyCode: lineItem.originalUnitPriceSet.shopMoney.currencyCode,
          totalPrice:
            Number(lineItem.originalUnitPriceSet.shopMoney.amount) * lineItem.quantity,
        })),
      });
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }

    after = connection.pageInfo.endCursor;
  }

  return orders;
}

export async function getRecentShopifyOrders(limit = 25, lookbackMinutes = 30) {
  const to = new Date();
  const from = new Date(Date.now() - lookbackMinutes * 60_000);
  const orders = await getShopifyOrdersForDateRange({
    from: formatDateInIst(from),
    to: formatDateInIst(to),
    fromTime: formatTimeInIst(from),
    toTime: formatTimeInIst(to),
  });

  return orders
    .sort((left, right) => Number(new Date(right.createdAt)) - Number(new Date(left.createdAt)))
    .slice(0, limit);
}
