#!/usr/bin/env node
// Builds data/endpoints.js from NinjaOne.
//
// NinjaOne inventories every managed endpoint, including staff laptops. This
// repo is public, so nothing here names a device, a user or an organisation —
// only counts, class names and NinjaOne's own condition labels are written.
//
// Env: NINJA_CLIENT_ID, NINJA_CLIENT_SECRET, NINJA_HOST (optional)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CLIENT_ID = process.env.NINJA_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NINJA_CLIENT_SECRET || "";

// Client-credentials against the wrong regional host is a plain 401 and costs
// nothing, so the region can be probed rather than configured.
const HOSTS = [
  process.env.NINJA_HOST,
  "oc.ninjarmm.com",
  "app.ninjarmm.com",
  "us2.ninjarmm.com",
  "eu.ninjarmm.com",
  "ca.ninjarmm.com",
].filter(Boolean);

async function authenticate() {
  let last = "";
  for (const host of HOSTS) {
    const res = await fetch(`https://${host}/ws/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "monitoring",
      }),
    });
    const text = await res.text();
    let token = null;
    try { token = JSON.parse(text).access_token; } catch { /* not json */ }
    if (token) {
      console.log(`authenticated against ${host}`);
      return { host, token };
    }
    last = `${host} -> HTTP ${res.status} ${text.slice(0, 160)}`;
  }
  throw new Error(`no NinjaOne region accepted these credentials. Last: ${last}`);
}

async function get(host, token, pathname) {
  const res = await fetch(`https://${host}${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname}\n${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// NinjaOne reports lastContact as epoch seconds (fractional). Older tenants
// have been seen returning milliseconds or an ISO string, so accept all three
// rather than silently producing 1970 dates.
function toMillis(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v > 1e11 ? v : v * 1000;
}

const STALE_BUCKETS = [
  { label: "Under 24 hours", maxHours: 24 },
  { label: "1–7 days", maxHours: 24 * 7 },
  { label: "7–30 days", maxHours: 24 * 30 },
  { label: "Over 30 days", maxHours: Infinity },
];

function bucketFor(hours) {
  return (STALE_BUCKETS.find((b) => hours < b.maxHours) || STALE_BUCKETS[STALE_BUCKETS.length - 1]).label;
}

// "CONDITION_AGENT_DISK_FREE_SPACE" reads badly on a wallboard.
function humanCondition(raw) {
  const s = String(raw || "").replace(/^CONDITION_/, "").replace(/^AGENT_/, "");
  if (!s) return "Unknown";
  return s
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bio\b/i, "I/O")
    .replace(/\bcpu\b/i, "CPU");
}

function tally(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("NINJA_CLIENT_ID and NINJA_CLIENT_SECRET must be set");
  }
  const { host, token } = await authenticate();

  const devices = await get(host, token, "/v2/devices");
  const alerts = await get(host, token, "/v2/alerts");
  console.log(`devices: ${devices.length}, alerts: ${alerts.length}`);

  const now = Date.now();
  const offline = devices.filter((d) => d.offline === true);

  // Split the offline pile by how long it has been. A laptop that went home
  // for the night and a server dark for six weeks are not the same finding,
  // and reporting them as one number ("212 offline") reads as an outage.
  const staleness = [];
  let noContactTimestamp = 0;
  for (const d of offline) {
    const ms = toMillis(d.lastContact);
    if (ms == null) { noContactTimestamp++; continue; }
    staleness.push(bucketFor((now - ms) / 3_600_000));
  }
  const byStaleness = STALE_BUCKETS
    .map((b) => ({ label: b.label, value: staleness.filter((s) => s === b.label).length }))
    .filter((b) => b.value > 0);
  if (noContactTimestamp) byStaleness.push({ label: "Never contacted", value: noContactTimestamp });

  // Every alert in this tenant carries severity NONE, so severity cannot rank
  // anything. conditionName is what actually distinguishes them.
  const severities = new Set(alerts.map((a) => String(a.severity || "NONE").toUpperCase()));
  const severityUsable = severities.size > 1 || !severities.has("NONE");

  const payload = {
    updatedAt: new Date().toISOString(),
    source: "NinjaOne",
    portalUrl: `https://${host}/#/deviceDashboard`,
    devices: {
      total: devices.length,
      online: devices.length - offline.length,
      // "offline" in NinjaOne means the agent has not checked in. For a
      // laptop estate that is mostly powered-down machines, not an outage.
      notCheckedIn: offline.length,
      byClass: tally(devices, (d) => humanCondition(d.nodeClass)),
      byStaleness,
    },
    alerts: {
      total: alerts.length,
      severityUsable,
      byCondition: tally(alerts, (a) => humanCondition(a.conditionName)),
      bySourceType: tally(alerts, (a) => humanCondition(a.sourceType || a.type)),
    },
  };

  const banner = [
    "// Managed endpoint summary from NinjaOne.",
    "// Generated by .github/workflows/sync-ninjaone.yml — do not edit by hand.",
    "//",
    "// Counts and condition labels only. No hostname, user or organisation",
    "// name is written here: NinjaOne covers the whole endpoint estate and",
    "// this repo is public.",
  ].join("\n");

  fs.writeFileSync(
    path.join(ROOT, "data/endpoints.js"),
    `${banner}\nconst ENDPOINT_SUMMARY = ${JSON.stringify(payload, null, 2)};\n`
  );
  console.log("wrote data/endpoints.js");
  console.log(`  not checked in: ${offline.length}/${devices.length}`);
  console.log(`  alerts: ${alerts.length}, severity usable for ranking: ${severityUsable}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
