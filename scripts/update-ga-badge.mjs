import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { google } from "googleapis";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseServiceAccount(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(decoded);
}

function formatCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
}

async function main() {
  const propertyId = getRequiredEnv("GA4_PROPERTY_ID");
  const serviceAccountRaw = getRequiredEnv("GA_SERVICE_ACCOUNT_KEY");
  const metric = process.env.GA4_METRIC || "screenPageViews";
  const outputPath = process.env.BADGE_OUTPUT_PATH || "public/badges/visits.json";
  const label = process.env.BADGE_LABEL || "visits";
  const color = process.env.BADGE_COLOR || "blue";

  const credentials = parseServiceAccount(serviceAccountRaw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });

  const analyticsData = google.analyticsdata("v1beta");
  const response = await analyticsData.properties.runReport({
    auth,
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: "2000-01-01", endDate: "today" }],
      metrics: [{ name: metric }],
    },
  });

  const metricValue = response.data.rows?.[0]?.metricValues?.[0]?.value ?? "0";
  const badgePayload = {
    schemaVersion: 1,
    label,
    message: formatCount(metricValue),
    color,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(badgePayload, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outputPath} with ${label}=${badgePayload.message}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
