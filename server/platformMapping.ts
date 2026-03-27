export type StoredPlatform = "App" | "Web" | "Unknown";

const APP_PLATFORM_BY_APP_ID = new Map<string, StoredPlatform>([
  ["293855199233", "App"],
  ["294191628289", "App"],
  ["294190448641", "App"],
  ["294189531137", "Web"],
  ["293711314945", "Web"],
  ["293855920129", "Web"],
]);

function normalizeAppId(appId: string | null | undefined) {
  if (!appId) {
    return null;
  }

  const trimmed = appId.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/(\d+)$/);
  return match ? match[1] : trimmed;
}

export function mapPlatformFromAppId(appId: string | null | undefined): StoredPlatform {
  const normalized = normalizeAppId(appId);

  if (!normalized) {
    return "Unknown";
  }

  return APP_PLATFORM_BY_APP_ID.get(normalized) ?? "Unknown";
}

export function getKnownPlatformMappings() {
  return Array.from(APP_PLATFORM_BY_APP_ID.entries());
}
