import { useEffect, useRef } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import chaChing from "./assets/cha-ching.mp3";
import { DashboardLayout } from "./components/DashboardLayout";
import { BreakdownsPage } from "./pages/BreakdownsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { useDashboardDateRange } from "./hooks/useDashboardDateRange";
import { useDashboardStream } from "./hooks/useDashboardStream";

const ORDER_ALERT_BATCH_WINDOW_MS = 180;
const ORDER_ALERT_STAGGER_MS = 115;
const MAX_ALERTS_PER_BATCH = 3;
const ORDER_ALERT_AUDIO_VERSION = "cha-ching-v3";
const ORDER_ALERT_AUDIO_POOL_SIZE = 4;

type AudioPoolWindow = typeof window & {
  __econicOrderAlertAudioPool?: HTMLAudioElement[];
  __econicOrderAlertAudioVersion?: string;
};

function getOrderAlertAudioPool() {
  if (typeof window === "undefined") {
    return [];
  }

  const audioWindow = window as AudioPoolWindow;

  if (
    !audioWindow.__econicOrderAlertAudioPool ||
    audioWindow.__econicOrderAlertAudioVersion !== ORDER_ALERT_AUDIO_VERSION
  ) {
    audioWindow.__econicOrderAlertAudioPool = Array.from(
      { length: ORDER_ALERT_AUDIO_POOL_SIZE },
      () => {
        const audio = new Audio(chaChing);
        audio.preload = "auto";
        audio.volume = 1;
        return audio;
      },
    );
    audioWindow.__econicOrderAlertAudioVersion = ORDER_ALERT_AUDIO_VERSION;
  }

  return audioWindow.__econicOrderAlertAudioPool;
}

function playOrderAlertBurst(count: number) {
  const audioPool = getOrderAlertAudioPool();

  if (audioPool.length === 0) {
    return false;
  }

  const playCount = Math.min(count, MAX_ALERTS_PER_BATCH);

  for (let index = 0; index < playCount; index += 1) {
    window.setTimeout(() => {
      const audio = audioPool[index % audioPool.length];
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch((error) => {
        console.warn("Order alert playback failed:", error);
      });
    }, index * ORDER_ALERT_STAGGER_MS);
  }

  return true;
}

function App() {
  const { dateRange, setFrom, setTo, setFromTime, setToTime, fromLabel, toLabel } =
    useDashboardDateRange();
  const state = useDashboardStream(dateRange);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const isHydratedRef = useRef(false);
  const pendingAlertCountRef = useRef(0);
  const alertFlushTimerRef = useRef<number | null>(null);
  const audioPrimedRef = useRef(false);

  useEffect(() => {
    const audioPool = getOrderAlertAudioPool();

    audioPool.forEach((audio) => {
      audio.load();
    });

    const primeAudio = () => {
      if (audioPrimedRef.current) {
        return;
      }

      const pool = getOrderAlertAudioPool();

      if (pool.length === 0) {
        return;
      }

      audioPrimedRef.current = true;

      pool.forEach((audio) => {
        void audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch((error) => {
          audioPrimedRef.current = false;
          console.warn("Order alert priming failed:", error);
        });
      });

      if (pendingAlertCountRef.current > 0) {
        const didPlay = playOrderAlertBurst(pendingAlertCountRef.current);

        if (didPlay) {
          pendingAlertCountRef.current = 0;
        }
      }
    };

    window.addEventListener("pointerdown", primeAudio, { passive: true });
    window.addEventListener("keydown", primeAudio);

    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };
  }, []);

  useEffect(() => {
    const flushPendingAlerts = () => {
      if (pendingAlertCountRef.current <= 0) {
        return;
      }

      const didPlay = playOrderAlertBurst(pendingAlertCountRef.current);

      if (didPlay) {
        pendingAlertCountRef.current = 0;
      }

      alertFlushTimerRef.current = null;
    };

    const newOrderIds = state.recentOrders
      .map((order) => order.id)
      .filter((id) => !seenOrderIdsRef.current.has(id));

    for (const order of state.recentOrders) {
      seenOrderIdsRef.current.add(order.id);
    }

    if (!isHydratedRef.current) {
      isHydratedRef.current = true;
      return;
    }

    if (newOrderIds.length > 0) {
      pendingAlertCountRef.current += newOrderIds.length;

      if (alertFlushTimerRef.current === null) {
        alertFlushTimerRef.current = window.setTimeout(
          flushPendingAlerts,
          ORDER_ALERT_BATCH_WINDOW_MS,
        );
      }
    }
  }, [state.recentOrders]);

  useEffect(
    () => () => {
      if (alertFlushTimerRef.current !== null) {
        window.clearTimeout(alertFlushTimerRef.current);
      }
    },
    [],
  );

  return (
    <DashboardLayout
      dateRange={dateRange}
      fromLabel={fromLabel}
      toLabel={toLabel}
      onFromChange={setFrom}
      onToChange={setTo}
      onFromTimeChange={setFromTime}
      onToTimeChange={setToTime}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage state={state} dateRange={dateRange} />} />
        <Route path="/breakdowns" element={<BreakdownsPage state={state} />} />
      </Routes>
    </DashboardLayout>
  );
}

export default App;
