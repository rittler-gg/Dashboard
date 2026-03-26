import { useEffect, useRef } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import chaChingSound from "./assets/cha-ching.mp3";
import { DashboardLayout } from "./components/DashboardLayout";
import { BreakdownsPage } from "./pages/BreakdownsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { useDashboardDateRange } from "./hooks/useDashboardDateRange";
import { useDashboardStream } from "./hooks/useDashboardStream";

const ORDER_ALERT_BATCH_WINDOW_MS = 180;
const ORDER_ALERT_STAGGER_MS = 115;
const MAX_ALERTS_PER_BATCH = 3;
const ORDER_ALERT_AUDIO_VERSION = "cha-ching-v1";

function getOrderAlertAudio() {
  if (typeof window === "undefined") {
    return null;
  }

  const audioWindow = window as typeof window & {
    __econicOrderAlertAudio?: HTMLAudioElement;
    __econicOrderAlertAudioVersion?: string;
  };

  if (
    !audioWindow.__econicOrderAlertAudio ||
    audioWindow.__econicOrderAlertAudioVersion !== ORDER_ALERT_AUDIO_VERSION
  ) {
    const audio = new Audio(chaChingSound);
    audio.preload = "auto";
    audio.volume = 0.9;
    audioWindow.__econicOrderAlertAudio = audio;
    audioWindow.__econicOrderAlertAudioVersion = ORDER_ALERT_AUDIO_VERSION;
  }

  return audioWindow.__econicOrderAlertAudio;
}

function playOrderAlertBurst(count: number) {
  const baseAudio = getOrderAlertAudio();

  if (!baseAudio) {
    return;
  }

  const playCount = Math.min(count, MAX_ALERTS_PER_BATCH);

  for (let index = 0; index < playCount; index += 1) {
    window.setTimeout(() => {
      const audio = baseAudio.cloneNode() as HTMLAudioElement;
      audio.volume = baseAudio.volume;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    }, index * ORDER_ALERT_STAGGER_MS);
  }
}

function App() {
  const { dateRange, setFrom, setTo, setFromTime, setToTime, fromLabel, toLabel } =
    useDashboardDateRange();
  const state = useDashboardStream(dateRange);
  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const isHydratedRef = useRef(false);
  const pendingAlertCountRef = useRef(0);
  const alertFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const primeAudio = () => {
      const audio = getOrderAlertAudio();

      if (!audio) {
        return;
      }

      void audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => undefined);
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

      playOrderAlertBurst(pendingAlertCountRef.current);
      pendingAlertCountRef.current = 0;
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
        <Route
          path="/breakdowns"
          element={<BreakdownsPage state={state} />}
        />
      </Routes>
    </DashboardLayout>
  );
}

export default App;
