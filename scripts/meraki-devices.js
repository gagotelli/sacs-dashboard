#!/usr/bin/env node
// Builds data/wireless.js from the Meraki Dashboard API.
//
// Meraki is the authoritative source for the Meraki estate: it reported 188
// access points where Auvik's SNMP discovery found 106, because Auvik only
// sees what it can reach and poll. Auvik still owns data/status.js for the
// Cisco/Palo Alto core — the two are not interchangeable.
//
// PUBLISHED: device name, network, model, product type, status, firmware.
// NOT PUBLISHED: serial, MAC, LAN/public IP, street address, lat/lng. Those
// identify and locate hardware, and this repo is public.
//
// Env: MERAKI_API

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KEY = process.env.MERAKI_API || "";
const BASE = "https://api.meraki.com/api/v1";

async function api(pathname) {
  const res = await fetch(`${BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname.replace(/\/organizations\/[^/]+/, "/organizations/<id>")}`);
  return res.json();
}

// Meraki statuses are online / alerting / dormant / offline. "dormant" means
// the device has never come online or is powered down by schedule — it is not
// a fault, so it is kept distinct rather than folded into "down".
function mapStatus(s) {
  switch (String(s || "").toLowerCase()) {
    case "online": return "up";
    case "alerting": return "warning";
    case "offline": return "down";
    case "dormant": return "dormant";
    default: return "unknown";
  }
}

const PRODUCT_LABEL = {
  wireless: "Access point",
  switch: "Switch",
  sensor: "Sensor",
  appliance: "Security appliance",
  camera: "Camera",
};

function tally(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

async function main() {
  if (!KEY) throw new Error("MERAKI_API must be set");

  const orgs = await api("/organizations");
  const org = (orgs || [])[0];
  if (!org) throw new Error("no Meraki organization visible to this key");

  const networks = await api(`/organizations/${org.id}/networks`);
  const devices = await api(`/organizations/${org.id}/devices?perPage=1000`);
  const statuses = await api(`/organizations/${org.id}/devices/statuses?perPage=1000`);
  console.log(`networks: ${networks.length}, devices: ${devices.length}, statuses: ${statuses.length}`);

  // Licence overview. Meraki is co-termination here — one expiry for the whole
  // estate — so a lapse takes every AP and switch at once, which makes the
  // headroom numbers below worth watching as closely as the date.
  let licensing = null;
  try {
    const lic = await api(`/organizations/${org.id}/licenses/overview`);
    const limits = lic.licensedDeviceCounts || {};
    // Compare each licensed pool against what is actually deployed. A pool at
    // 0 spare means the next switch of that model cannot be added without
    // buying a licence first — worth knowing before the switch arrives.
    const pools = Object.entries(limits).map(([model, limit]) => {
      const used = model === "MR" || model === "wireless"
        ? devices.filter((d) => /^MR/.test(d.model || "")).length
        : devices.filter((d) => (d.model || "") === model).length;
      return { model, limit: Number(limit) || 0, used, spare: (Number(limit) || 0) - used };
    }).sort((a, b) => a.spare - b.spare || a.model.localeCompare(b.model));

    licensing = {
      status: lic.status || null,
      model: "co-termination",
      expiresOn: lic.expirationDate || null,
      pools,
      exhausted: pools.filter((p) => p.spare <= 0).map((p) => p.model),
    };
    console.log(`licence: ${licensing.status}, expires ${licensing.expiresOn}`);
    console.log(`  pools with no spare: ${licensing.exhausted.join(", ") || "none"}`);
  } catch (e) {
    // A licence read failing must not take the whole device sync with it.
    console.log(`licence overview unavailable: ${e.message}`);
  }

  const netName = new Map(networks.map((n) => [n.id, n.name]));
  // Status is keyed by serial, which is never written out — it is used here
  // only to join the two responses.
  const statusBySerial = new Map(statuses.map((s) => [s.serial, s]));

  const rows = devices.map((d) => {
    const st = statusBySerial.get(d.serial) || {};
    return {
      name: d.name || "(unnamed)",
      site: netName.get(d.networkId) || "Unassigned",
      kind: PRODUCT_LABEL[d.productType] || d.productType || "Unknown",
      productType: d.productType || "unknown",
      model: d.model || null,
      firmware: d.firmware || null,
      status: mapStatus(st.status),
      lastSeen: st.lastReportedAt || null,
    };
  }).sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name));

  const aps = rows.filter((r) => r.productType === "wireless");

  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const apCounts = aps.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});

  // Per-site AP rollup drives the topology clusters, so it counts APs only —
  // mixing switches in would make the wireless node meaningless.
  const bySite = [...new Set(aps.map((r) => r.site))].map((site) => {
    const list = aps.filter((r) => r.site === site);
    return {
      label: site,
      total: list.length,
      up: list.filter((r) => r.status === "up").length,
      down: list.filter((r) => r.status === "down").length,
      warning: list.filter((r) => r.status === "warning").length,
      dormant: list.filter((r) => r.status === "dormant").length,
    };
  }).sort((a, b) => b.total - a.total);

  const payload = {
    updatedAt: new Date().toISOString(),
    source: "Meraki Dashboard",
    portalUrl: "https://dashboard.meraki.com",
    total: aps.length,
    counts: apCounts,
    licensing,
    bySite,
    byModel: tally(aps, (r) => r.model),
    aps,
    fleet: {
      total: rows.length,
      counts,
      byKind: tally(rows, (r) => r.kind),
      byModel: tally(rows, (r) => r.model),
      bySite: tally(rows, (r) => r.site),
      devices: rows,
    },
  };

  const banner = [
    "// Meraki estate — access points, switches and sensors.",
    "// Generated by .github/workflows/sync-meraki.yml — do not edit by hand.",
    "//",
    "// Meraki is authoritative for Meraki hardware: it reports the full estate,",
    "// where Auvik only sees what it can reach and poll. Auvik still owns",
    "// data/status.js for the Cisco/Palo Alto core.",
    "//",
    "// Serial numbers, MACs, IP addresses and physical locations are",
    "// deliberately not written here: this repo is public.",
  ].join("\n");

  fs.writeFileSync(
    path.join(ROOT, "data/wireless.js"),
    `${banner}\nconst WIRELESS = ${JSON.stringify(payload, null, 2)};\n`
  );

  console.log(`wrote data/wireless.js`);
  console.log(`  access points: ${aps.length} (${JSON.stringify(apCounts)})`);
  console.log(`  whole fleet:   ${rows.length} (${JSON.stringify(counts)})`);
  console.log(`  sites:         ${bySite.map((s) => `${s.label}=${s.total}`).join(", ")}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
