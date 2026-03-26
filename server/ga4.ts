import { BetaAnalyticsDataClient } from "@google-analytics/data";

const client = new BetaAnalyticsDataClient();

export async function getActiveUsers(): Promise<number> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!propertyId) {
    throw new Error("GA4_PROPERTY_ID is not configured");
  }

  if (!credentialsPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not configured");
  }

  const [response] = await client.runRealtimeReport({
    property: `properties/${propertyId}`,
    metrics: [{ name: "activeUsers" }],
  });

  const value = response.rows?.[0]?.metricValues?.[0]?.value;
  return value ? parseInt(value, 10) : 0;
}
