import { useEffect, useReducer, useRef } from "react";
import { mockDashboardDataSource } from "../data/mockDashboard";
import type {
  DashboardDateRange,
  DashboardState,
  DashboardStreamUpdate,
  OrderEvent,
} from "../types/dashboard";
import {
  buildMapMarker,
  buildOrderComment,
  buildSummaryComment,
  DRAIN_INTERVAL_MS,
  getLatestOrder,
  MAX_FEED_COMMENTS,
  MAX_FEED_QUEUE,
  MAX_MAP_MARKERS,
  orderTimestamp,
  RECENT_ORDER_LIMIT,
  setMarkerHighlights,
  STALE_AFTER_MS,
} from "../utils/dashboardLive";

const TRAFFIC_POLL_INTERVAL_MS = 10000;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
  const activeMapMarkers = state.activeMapMarkers.filter((marker) => marker.expiresAt > now);

  if (
    activeFeedComments.length === state.activeFeedComments.length &&
    activeMapMarkers.length === state.activeMapMarkers.length
  ) {
    return state;
  }

  return {
    ...state,
    activeFeedComments,
    activeMapMarkers,
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

      if (drained.length > 1) {
        comments.unshift(buildSummaryComment(drained.length - 1, now));
      }

      const markers = drained.slice(0, 2).map((order, index) =>
        buildMapMarker(order, now + index * 80, order.id === latestOrder?.id),
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
    () => {
      const initialState = mockDashboardDataSource.getInitialDashboardState(dateRange);

      return {
        ...initialState,
        aggregateSnapshot: {
          ...initialState.aggregateSnapshot,
          traffic: { activeUsers: 0, delta: 0 },
        },
      };
    },
  );
  const useApiTrafficRef = useRef(true);
  const apiFailureCountRef = useRef(0);
  const latestTrafficRef = useRef(state.aggregateSnapshot.traffic.activeUsers);
  const latestTrafficSnapshotRef = useRef(state.aggregateSnapshot.traffic);
  const latestDateRangeRef = useRef(dateRange);

  useEffect(() => {
    latestDateRangeRef.current = dateRange;
    dispatch({
      type: "stream",
      update: {
        type: "snapshot",
        snapshot: mockDashboardDataSource.getAggregateSnapshotForRange(
          dateRange,
          latestTrafficSnapshotRef.current,
        ),
      },
      now: Date.now(),
    });
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    const unsubscribe = mockDashboardDataSource.subscribeToMockUpdates(
      (update) => {
        if (update.type === "traffic" && useApiTrafficRef.current) {
          return;
        }

        const nextUpdate =
          update.type === "snapshot" && useApiTrafficRef.current
            ? {
                ...update,
                snapshot: {
                  ...update.snapshot,
                  traffic: latestTrafficSnapshotRef.current,
                },
              }
            : update;

        dispatch({ type: "stream", update: nextUpdate, now: Date.now() });
      },
      {
        getDateRange: () => latestDateRangeRef.current,
      },
    );

    return unsubscribe;
  }, []);

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
    const fetchLiveTraffic = async () => {
      try {
        const params = new URLSearchParams({
          from: latestDateRangeRef.current.from,
          to: latestDateRangeRef.current.to,
        });
        const response = await fetch(`${API_URL}/api/realtime-users?${params.toString()}`);

        if (!response.ok) {
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
