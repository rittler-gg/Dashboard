import type { StreamStatus } from "../types/dashboard";

export function getStreamStatusLabel(
  status: StreamStatus,
  surface: "header" | "feed",
) {
  if (surface === "feed") {
    switch (status) {
      case "live":
        return "Streaming";
      case "reconnecting":
        return "Reconnecting";
      case "stale":
        return "Stale";
      case "error":
        return "Error";
      default:
        return "Connecting";
    }
  }

  switch (status) {
    case "live":
      return "Live stream";
    case "reconnecting":
      return "Reconnecting";
    case "stale":
      return "Stale data";
    case "error":
      return "Stream error";
    default:
      return "Connecting";
  }
}
