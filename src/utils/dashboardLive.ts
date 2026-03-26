import type { FeedComment, LocationHealth, MapMarker, OrderEvent } from "../types/dashboard";

export const RECENT_ORDER_LIMIT = 120;
export const MAX_FEED_QUEUE = 120;
export const MAX_FEED_COMMENTS = 6;
export const MAX_MAP_MARKERS = 24;
export const COMMENT_VISIBLE_MS = 8000;
export const MARKER_VISIBLE_MS_LOW_TRAFFIC = 6800;
export const MARKER_VISIBLE_MS_MEDIUM_TRAFFIC = 4600;
export const MARKER_VISIBLE_MS_HIGH_TRAFFIC = 2800;
export const MARKER_VISIBLE_MS_BURST = 1800;
export const STALE_AFTER_MS = 6500;
export const DRAIN_INTERVAL_MS = 320;
export const INITIAL_MARKER_COUNT = 12;
export const INITIAL_COMMENT_COUNT = 2;

export function orderTimestamp(order: OrderEvent) {
  return Number(new Date(order.timestamp));
}

export function getLatestOrder(orders: OrderEvent[]) {
  return orders[0];
}

export function computeLocationHealth(orders: OrderEvent[]): LocationHealth {
  return orders.reduce<LocationHealth>(
    (health, order) => {
      if (order.isOutOfIndia) {
        health.outOfIndiaCount += 1;
      }

      if (order.locationResolution === "unknown") {
        health.unknownCount += 1;
        health.invalidCount += 1;
      }

      if (
        order.locationResolution === "city_centroid" ||
        order.locationResolution === "state_centroid"
      ) {
        health.fallbackCount += 1;
        health.invalidCount += 1;
      }

      return health;
    },
    { invalidCount: 0, outOfIndiaCount: 0, unknownCount: 0, fallbackCount: 0 },
  );
}

export function getMarkerEdge(order: OrderEvent): MapMarker["edge"] {
  if (!order.isOutOfIndia || order.lat === null || order.lng === null) {
    return undefined;
  }

  if (order.lng < 68) {
    return "west";
  }
  if (order.lng > 97.5) {
    return "east";
  }
  if (order.lat < 6) {
    return "south";
  }
  return "north";
}

export function buildOrderComment(order: OrderEvent, now: number): FeedComment {
  return {
    id: `${order.id}-${now}`,
    kind: "order",
    timestamp: order.timestamp,
    order,
    expiresAt: now + COMMENT_VISIBLE_MS,
  };
}

export function buildSummaryComment(summaryCount: number, now: number): FeedComment {
  return {
    id: `summary-${now}`,
    kind: "summary",
    timestamp: new Date(now).toISOString(),
    summaryCount,
    expiresAt: now + COMMENT_VISIBLE_MS - 600,
  };
}

export function getAdaptiveMarkerVisibleMs(queueDepth: number, batchSize: number) {
  if (queueDepth <= 1 && batchSize <= 1) {
    return MARKER_VISIBLE_MS_LOW_TRAFFIC;
  }

  if (queueDepth <= 4 && batchSize <= 2) {
    return MARKER_VISIBLE_MS_MEDIUM_TRAFFIC;
  }

  if (queueDepth <= 10 && batchSize <= 3) {
    return MARKER_VISIBLE_MS_HIGH_TRAFFIC;
  }

  return MARKER_VISIBLE_MS_BURST;
}

export function buildMapMarker(
  order: OrderEvent,
  now: number,
  highlighted: boolean,
  visibleMs: number,
): MapMarker {
  return {
    id: `${order.id}-${now}`,
    orderId: order.id,
    timestamp: order.timestamp,
    city: order.city,
    state: order.state,
    orderValue: order.orderValue,
    brand: order.brand,
    lat: order.lat,
    lng: order.lng,
    placement:
      order.locationResolution === "unknown"
        ? "unknown"
        : order.isOutOfIndia
          ? "outskirts"
          : "india",
    edge: getMarkerEdge(order),
    locationResolution: order.locationResolution,
    highlighted,
    expiresAt: now + visibleMs,
  };
}

export function setMarkerHighlights(markers: MapMarker[], highlightedOrderId?: string) {
  return markers.map((marker) => ({
    ...marker,
    highlighted: marker.orderId === highlightedOrderId,
  }));
}
