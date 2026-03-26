import { useEffect, useReducer, useRef } from "react";
import type {
  AggregateSnapshot,
  Brand,
  DashboardDateRange,
  DashboardState,
  DashboardStreamUpdate,
  OrderEvent,
  Platform,
  SalesChannel,
} from "../types/dashboard";
import {
  buildMapMarker,
  buildOrderComment,
  buildSummaryComment,
  DRAIN_INTERVAL_MS,
  getAdaptiveMarkerVisibleMs,
  getLatestOrder,
  MAX_FEED_COMMENTS,
  MAX_FEED_QUEUE,
  MAX_MAP_MARKERS,
  orderTimestamp,
  RECENT_ORDER_LIMIT,
  setMarkerHighlights,
  STALE_AFTER_MS,
} from "../utils/dashboardLive";

const TRAFFIC_POLL_INTERVAL_MS = 300000;
const ORDER_POLL_INTERVAL_MS = 10000;
const RECENT_ORDERS_LIMIT = 100;
const RECENT_ORDERS_LOOKBACK_MINUTES = 360;
const SNAPSHOT_POLL_INTERVAL_MS = 30000;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const indiaCityCentroids = new Map(
  [
    { city: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777 },
    { city: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209 },
    { city: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
    { city: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867 },
    { city: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
    { city: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639 },
    { city: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567 },
    { city: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714 },
    { city: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
    { city: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
    { city: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673 },
    { city: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362 },
    { city: "Indore", state: "Madhya Pradesh", lat: 22.7196, lng: 75.8577 },
    { city: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311 },
    { city: "Bhubaneswar", state: "Odisha", lat: 20.2961, lng: 85.8245 },
    { city: "Chandigarh", state: "Chandigarh", lat: 30.7333, lng: 76.7794 },
    { city: "Patna", state: "Bihar", lat: 25.5941, lng: 85.1376 },
  ].map((location) => [`${location.city}|${location.state}`, location] as const),
);

const indiaStateCentroids = new Map(
  [
    { state: "Andhra Pradesh", lat: 16.5062, lng: 80.648 },
    { state: "Arunachal Pradesh", lat: 27.0844, lng: 93.6053 },
    { state: "Assam", lat: 26.1445, lng: 91.7362 },
    { state: "Bihar", lat: 25.5941, lng: 85.1376 },
    { state: "Chandigarh", lat: 30.7333, lng: 76.7794 },
    { state: "Chhattisgarh", lat: 21.2514, lng: 81.6296 },
    { state: "Delhi", lat: 28.6139, lng: 77.209 },
    { state: "Goa", lat: 15.4909, lng: 73.8278 },
    { state: "Gujarat", lat: 23.0225, lng: 72.5714 },
    { state: "Haryana", lat: 30.7333, lng: 76.7794 },
    { state: "Himachal Pradesh", lat: 31.1048, lng: 77.1734 },
    { state: "Jammu and Kashmir", lat: 34.0837, lng: 74.7973 },
    { state: "Jharkhand", lat: 23.3441, lng: 85.3096 },
    { state: "Karnataka", lat: 12.9716, lng: 77.5946 },
    { state: "Kerala", lat: 9.9312, lng: 76.2673 },
    { state: "Madhya Pradesh", lat: 23.2599, lng: 77.4126 },
    { state: "Maharashtra", lat: 19.076, lng: 72.8777 },
    { state: "Odisha", lat: 20.2961, lng: 85.8245 },
    { state: "Punjab", lat: 30.900965, lng: 75.857277 },
    { state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
    { state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
    { state: "Telangana", lat: 17.385, lng: 78.4867 },
    { state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
    { state: "Uttarakhand", lat: 30.3165, lng: 78.0322 },
    { state: "West Bengal", lat: 22.5726, lng: 88.3639 },
  ].map((location) => [location.state, location] as const),
);

interface ShopifyRecentOrder {
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
  quantity?: number;
  vendorSummary?: string | null;
  brand?: Brand;
  channel?: SalesChannel;
  platform?: Platform;
  appId?: string | null;
  appName?: string | null;
  lineItems?: Array<{
    id: string;
    title: string;
    vendor: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

function createEmptySnapshot(): AggregateSnapshot {
  return {
    kpis: {
      totalOrders: 0,
      totalRevenue: 0,
      totalUnits: 0,
      averageOrderValue: 0,
    },
    traffic: {
      activeUsers: 0,
      delta: 0,
    },
    breakdowns: {
      brand: [
        { category: "Core", orders: 0, revenue: 0 },
        { category: "BTC", orders: 0, revenue: 0 },
        { category: "Amodira", orders: 0, revenue: 0 },
        { category: "Other", orders: 0, revenue: 0 },
        { category: "Unknown", orders: 0, revenue: 0 },
      ],
      channel: [
        { category: "D2C", orders: 0, revenue: 0 },
        { category: "MP", orders: 0, revenue: 0 },
        { category: "Offline", orders: 0, revenue: 0 },
        { category: "Other", orders: 0, revenue: 0 },
        { category: "Unknown", orders: 0, revenue: 0 },
      ],
      platform: [
        { category: "App", orders: 0, revenue: 0 },
        { category: "Web", orders: 0, revenue: 0 },
        { category: "Other", orders: 0, revenue: 0 },
        { category: "Unknown", orders: 0, revenue: 0 },
      ],
    },
    dailySeries: [],
    brandHourly: [],
    checkoutFunnel: null,
    asOf: new Date().toISOString(),
  };
}

function coerceBrand(value?: string | null): Brand {
  return value === "Core" || value === "BTC" || value === "Amodira" ? value : "Unknown";
}

function coerceChannel(value?: string | null): SalesChannel {
  return value === "D2C" || value === "MP" || value === "Offline" ? value : "Unknown";
}

function coercePlatform(value?: string | null): Platform {
  return value === "App" || value === "Web" ? value : "Unknown";
}

function normalizeShopifyOrder(order: ShopifyRecentOrder): OrderEvent {
  const city = order.shippingAddress?.city?.trim() || "Unknown";
  const state = order.shippingAddress?.province?.trim() || order.shippingAddress?.country?.trim() || "Unknown";
  const country = order.shippingAddress?.country?.trim() || "";
  const cityMatch = indiaCityCentroids.get(`${city}|${state}`);
  const stateMatch = indiaStateCentroids.get(state);
  const isOutOfIndia = Boolean(country) && country.toLowerCase() !== "india";

  if (isOutOfIndia) {
    return {
      id: order.id,
      timestamp: order.createdAt,
      city,
      state,
      lat: null,
      lng: null,
      brand: coerceBrand(order.brand),
      channel: coerceChannel(order.channel),
      platform: coercePlatform(order.platform),
      orderValue: order.orderValue,
      unitsSold: order.quantity ?? 1,
      locationResolution: "out_of_india",
      isOutOfIndia: true,
    };
  }

  if (cityMatch) {
    return {
      id: order.id,
      timestamp: order.createdAt,
      city,
      state,
      lat: cityMatch.lat,
      lng: cityMatch.lng,
      brand: coerceBrand(order.brand),
      channel: coerceChannel(order.channel),
      platform: coercePlatform(order.platform),
      orderValue: order.orderValue,
      unitsSold: order.quantity ?? 1,
      locationResolution: "city_centroid",
      isOutOfIndia: false,
    };
  }

  if (stateMatch) {
    return {
      id: order.id,
      timestamp: order.createdAt,
      city,
      state,
      lat: stateMatch.lat,
      lng: stateMatch.lng,
      brand: coerceBrand(order.brand),
      channel: coerceChannel(order.channel),
      platform: coercePlatform(order.platform),
      orderValue: order.orderValue,
      unitsSold: order.quantity ?? 1,
      locationResolution: "state_centroid",
      isOutOfIndia: false,
    };
  }

  return {
    id: order.id,
    timestamp: order.createdAt,
    city,
    state,
    lat: null,
    lng: null,
    brand: coerceBrand(order.brand),
    channel: coerceChannel(order.channel),
    platform: coercePlatform(order.platform),
    orderValue: order.orderValue,
    unitsSold: order.quantity ?? 1,
    locationResolution: "unknown",
    isOutOfIndia: false,
  };
}

type DashboardAction =
  | { type: "stream"; update: DashboardStreamUpdate; now: number }
  | { type: "drain"; now: number }
  | { type: "expire"; now: number }
  | { type: "markStale"; now: number };

function dedupeIncomingOrders(state: DashboardState, incoming: OrderEvent[]) {
  const knownIds = new Set([
    ...state.recentOrders.map((order) => order.id),
    ...state.feedQueue.map((order) => order.id),
    ...state.activeFeedComments.map((comment) => comment.order?.id).filter(Boolean),
    ...state.activeMapMarkers.map((marker) => marker.orderId),
  ]);
  const byId = new Map<string, OrderEvent>();

  for (const order of incoming) {
    const existing = byId.get(order.id);

    if (!existing || orderTimestamp(order) > orderTimestamp(existing)) {
      byId.set(order.id, order);
    }
  }

  return Array.from(byId.values())
    .filter((order) => !knownIds.has(order.id))
    .sort((left, right) => orderTimestamp(left) - orderTimestamp(right));
}

function mergeRecentOrders(current: OrderEvent[], incoming: OrderEvent[]) {
  const merged = new Map<string, OrderEvent>();

  for (const order of current) {
    merged.set(order.id, order);
  }

  for (const order of incoming) {
    const existing = merged.get(order.id);

    if (!existing || orderTimestamp(order) >= orderTimestamp(existing)) {
      merged.set(order.id, order);
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => orderTimestamp(right) - orderTimestamp(left))
    .slice(0, RECENT_ORDER_LIMIT);
}

function pruneExpired(state: DashboardState, now: number): DashboardState {
  const activeFeedComments = state.activeFeedComments.filter(
    (comment) => comment.expiresAt > now,
  );

  if (activeFeedComments.length === state.activeFeedComments.length) {
    return state;
  }

  return {
    ...state,
    activeFeedComments,
  };
}

function reduceDashboardState(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "stream": {
      const { update, now } = action;

      if (update.type === "snapshot") {
        return {
          ...state,
          aggregateSnapshot: update.snapshot,
          lastMessageAt: update.snapshot.asOf,
          streamStatus:
            state.streamStatus === "connecting" ||
            state.streamStatus === "reconnecting" ||
            state.streamStatus === "stale"
              ? "live"
              : state.streamStatus,
          streamError: undefined,
        };
      }

      if (update.type === "traffic") {
        return {
          ...state,
          aggregateSnapshot: {
            ...state.aggregateSnapshot,
            traffic: update.traffic,
          },
          lastMessageAt: new Date(now).toISOString(),
          streamStatus:
            state.streamStatus === "connecting" ||
            state.streamStatus === "reconnecting" ||
            state.streamStatus === "stale"
              ? "live"
              : state.streamStatus,
          streamError: undefined,
        };
      }

      if (update.type === "status") {
        return {
          ...state,
          streamStatus: update.status,
          streamError: update.status === "error" ? state.streamError : undefined,
        };
      }

      if (update.type === "error") {
        return {
          ...state,
          streamStatus: "error",
          streamError: update.message,
        };
      }

      const uniqueIncoming = dedupeIncomingOrders(state, update.orders);

      if (uniqueIncoming.length === 0) {
        return {
          ...state,
          lastMessageAt: new Date(now).toISOString(),
          streamStatus: "live",
          streamError: undefined,
        };
      }

      const recentOrders = mergeRecentOrders(state.recentOrders, uniqueIncoming);
      const latestOrder = getLatestOrder(recentOrders);

      return {
        ...state,
        recentOrders,
        feedQueue: [...state.feedQueue, ...uniqueIncoming].slice(-MAX_FEED_QUEUE),
        activeMapMarkers: setMarkerHighlights(state.activeMapMarkers, latestOrder?.id),
        lastMessageAt: new Date(now).toISOString(),
        streamStatus: "live",
        streamError: undefined,
      };
    }

    case "drain": {
      const now = action.now;
      const cleaned = pruneExpired(state, now);

      if (cleaned.feedQueue.length === 0) {
        return cleaned;
      }

      const queue = [...cleaned.feedQueue];
      const chunkSize = queue.length > 14 ? 4 : queue.length > 8 ? 2 : 1;
      const drained = queue.splice(0, chunkSize);
      const primary = drained[0];
      const comments = [buildOrderComment(primary, now)];
      const latestOrder = getLatestOrder(cleaned.recentOrders);
      const markerVisibleMs = getAdaptiveMarkerVisibleMs(cleaned.feedQueue.length, drained.length);

      if (drained.length > 1) {
        comments.unshift(buildSummaryComment(drained.length - 1, now));
      }

      const markers = drained.slice(0, 2).map((order, index) =>
        buildMapMarker(
          order,
          now + index * 80,
          order.id === latestOrder?.id,
          markerVisibleMs,
        ),
      );

      return {
        ...cleaned,
        feedQueue: queue,
        activeFeedComments: [...comments, ...cleaned.activeFeedComments].slice(
          0,
          MAX_FEED_COMMENTS,
        ),
        activeMapMarkers: setMarkerHighlights(
          [...markers, ...cleaned.activeMapMarkers].slice(0, MAX_MAP_MARKERS),
          latestOrder?.id,
        ),
      };
    }

    case "expire":
      return pruneExpired(state, action.now);

    case "markStale":
      if (
        state.streamStatus !== "live" ||
        !state.lastMessageAt ||
        action.now - Number(new Date(state.lastMessageAt)) < STALE_AFTER_MS
      ) {
        return state;
      }

      return {
        ...state,
        streamStatus: "stale",
      };
  }
}

export function useDashboardStream(dateRange: DashboardDateRange) {
  const [state, dispatch] = useReducer(
    reduceDashboardState,
    undefined,
    () => ({
      aggregateSnapshot: createEmptySnapshot(),
      recentOrders: [],
      feedQueue: [],
      activeFeedComments: [],
      activeMapMarkers: [],
      streamStatus: "connecting" as const,
      lastMessageAt: undefined,
      streamError: undefined,
    }),
  );
  const useApiTrafficRef = useRef(true);
  const apiFailureCountRef = useRef(0);
  const latestTrafficRef = useRef(state.aggregateSnapshot.traffic.activeUsers);
  const latestTrafficSnapshotRef = useRef(state.aggregateSnapshot.traffic);
  const latestDateRangeRef = useRef(dateRange);
  const hasPrimedRecentOrdersRef = useRef(false);
  const seenRecentOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    latestDateRangeRef.current = dateRange;
  }, [dateRange.from, dateRange.to, dateRange.fromTime, dateRange.toTime]);

  useEffect(() => {
    const drainTimer = window.setInterval(() => {
      dispatch({ type: "drain", now: Date.now() });
    }, DRAIN_INTERVAL_MS);

    const expireTimer = window.setInterval(() => {
      dispatch({ type: "expire", now: Date.now() });
      dispatch({ type: "markStale", now: Date.now() });
    }, 600);

    return () => {
      window.clearInterval(drainTimer);
      window.clearInterval(expireTimer);
    };
  }, []);

  useEffect(() => {
    latestTrafficRef.current = state.aggregateSnapshot.traffic.activeUsers;
    latestTrafficSnapshotRef.current = state.aggregateSnapshot.traffic;
  }, [state.aggregateSnapshot.traffic]);

  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        const params = new URLSearchParams({
          from: latestDateRangeRef.current.from,
          to: latestDateRangeRef.current.to,
          fromTime: latestDateRangeRef.current.fromTime,
          toTime: latestDateRangeRef.current.toTime,
        });
        const response = await fetch(`${API_URL}/api/dashboard/snapshot?${params.toString()}`);

        if (!response.ok) {
          throw new Error(`Snapshot API failed with status ${response.status}`);
        }

        const snapshot = (await response.json()) as AggregateSnapshot;
        dispatch({
          type: "stream",
          update: {
            type: "snapshot",
            snapshot: {
              ...snapshot,
              traffic: latestTrafficSnapshotRef.current,
            },
          },
          now: Date.now(),
        });
      } catch (error) {
        console.error("Snapshot polling failed:", error);
      }
    };

    fetchSnapshot();
    const interval = window.setInterval(fetchSnapshot, SNAPSHOT_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [dateRange.from, dateRange.to, dateRange.fromTime, dateRange.toTime]);

  useEffect(() => {
    const fetchShopifyOrders = async () => {
      try {
        const params = new URLSearchParams({
          limit: String(RECENT_ORDERS_LIMIT),
          lookbackMinutes: String(RECENT_ORDERS_LOOKBACK_MINUTES),
        });
        const response = await fetch(`${API_URL}/api/shopify/orders/recent?${params.toString()}`);

        if (!response.ok) {
          throw new Error(`Orders API failed with status ${response.status}`);
        }

        const data = (await response.json()) as { orders?: ShopifyRecentOrder[] };
        const normalizedOrders = (data.orders ?? []).map(normalizeShopifyOrder);
        const unseenOrders = normalizedOrders.filter((order) => !seenRecentOrderIdsRef.current.has(order.id));

        for (const order of normalizedOrders) {
          seenRecentOrderIdsRef.current.add(order.id);
        }

        if (!hasPrimedRecentOrdersRef.current) {
          hasPrimedRecentOrdersRef.current = true;

          if (unseenOrders.length === 0) {
            return;
          }

          dispatch({
            type: "stream",
            update: {
              type: "orders",
              orders: unseenOrders.slice(0, 6),
            },
            now: Date.now(),
          });
          return;
        }

        if (unseenOrders.length === 0) {
          return;
        }

        dispatch({
          type: "stream",
          update: {
            type: "orders",
            orders: unseenOrders,
          },
          now: Date.now(),
        });
      } catch (error) {
        console.error("Shopify orders polling failed:", error);
      }
    };

    fetchShopifyOrders();
    const interval = window.setInterval(fetchShopifyOrders, ORDER_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const fetchLiveTraffic = async () => {
      try {
        const params = new URLSearchParams({
          from: latestDateRangeRef.current.from,
          to: latestDateRangeRef.current.to,
          fromTime: latestDateRangeRef.current.fromTime,
          toTime: latestDateRangeRef.current.toTime,
        });
        const response = await fetch(`${API_URL}/api/realtime-users?${params.toString()}`);

        if (!response.ok) {
          if (response.status === 429) {
            dispatch({
              type: "stream",
              update: { type: "status", status: "stale" },
              now: Date.now(),
            });
            return;
          }

          throw new Error(`Traffic API failed with status ${response.status}`);
        }

        const data = (await response.json()) as { activeUsers?: number | null };
        const activeUsers = data.activeUsers ?? 0;
        const delta = activeUsers - latestTrafficRef.current;

        useApiTrafficRef.current = true;
        apiFailureCountRef.current = 0;
        latestTrafficRef.current = activeUsers;

        dispatch({
          type: "stream",
          update: {
            type: "traffic",
            traffic: { activeUsers, delta },
          },
          now: Date.now(),
        });
      } catch {
        apiFailureCountRef.current += 1;

        if (apiFailureCountRef.current >= 2) {
          useApiTrafficRef.current = false;
        }
      }
    };

    useApiTrafficRef.current = true;
    fetchLiveTraffic();
    const interval = window.setInterval(fetchLiveTraffic, TRAFFIC_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return state;
}
