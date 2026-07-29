#!/usr/bin/env node
// Captures the Meraki configuration that would have to be rebuilt by hand
// after a mistaken change or a device swap: VLANs, firewall rules, SSIDs,
// group policies and the device inventory.
//
// SECURITY — READ BEFORE CHANGING ANYTHING HERE.
// The output contains SSID pre-shared keys and the full firewall ruleset. This
// repository is public. The plaintext snapshot is therefore written OUTSIDE the
// working tree (BACKUP_OUT, default /tmp) and the workflow encrypts it before
// anything is committed. Nothing in this file may write configuration into the
// repo directory, and the manifest that does get published carries counts and
// checksums only — never configuration values.
//
// Env: MERAKI_API_KEY, BACKUP_OUT (path for the plaintext snapshot),
//      MANIFEST_OUT (path for the publishable manifest JSON)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KEY = process.env.MERAKI_API_KEY || "";
const BASE = "https://api.meraki.com/api/v1";
const OUT = process.env.BACKUP_OUT || "/tmp/meraki-config-backup.json";
const MANIFEST = process.env.MANIFEST_OUT || "/tmp/backup-manifest.json";

// Rate-limit handling comes FIRST, before the `optional` early return.
// Written the other way round, a 429 on an optional path returned null and that
// section vanished from the backup without a word — and nearly every call here
// is optional. A backup that silently loses parts of itself under load is worse
// than one that fails.
//
// Retries are capped: an unbounded retry loop does not fail, it hangs, and a
// job that never finishes is indistinguishable from one still working.
const MAX_429_RETRIES = 6;

async function api(pathname, { optional = false, attempt = 0 } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${pathname}`, {
      headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
    });
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return api(pathname, { optional, attempt: attempt + 1 });
    }
    throw e;
  }

  if (res.status === 429) {
    if (attempt >= MAX_429_RETRIES) {
      throw new Error(`still rate limited after ${MAX_429_RETRIES} retries for ${pathname}`);
    }
    const wait = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
    return api(pathname, { optional, attempt: attempt + 1 });
  }

  if (res.status === 404) return null;
  if (optional && !res.ok) {
    console.log(`  (skipped ${pathname}: HTTP ${res.status})`);
    return null;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname}`);
  return res.json();
}

// Meraki allows ~10 req/s per organization. Serial requests made the first run
// take over ten minutes on an estate this size; a small amount of concurrency
// stays well inside the limit and cuts it to about a minute.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

async function main() {
  if (!KEY) throw new Error("MERAKI_API_KEY must be set");
  if (path.resolve(OUT).startsWith(path.resolve(__dirname, ".."))) {
    // A plaintext snapshot inside the repo is one `git add -A` away from being
    // published forever. Refuse rather than rely on .gitignore.
    throw new Error(`BACKUP_OUT (${OUT}) is inside the repository — refusing to write plaintext config there`);
  }

  const orgs = await api("/organizations");
  const org = (orgs || [])[0];
  if (!org) throw new Error("no Meraki organization returned");
  console.log(`org: ${org.name}`);

  const networks = await api(`/organizations/${org.id}/networks`);
  const devices = await api(`/organizations/${org.id}/devices?perPage=1000`);
  console.log(`networks: ${networks.length}, devices: ${devices.length}`);

  const snapshot = {
    capturedAt: new Date().toISOString(),
    organization: { id: org.id, name: org.name },
    networks: [],
    // Serial and MAC are configuration — they matter for a rebuild — so they
    // are kept here, in the encrypted file, and never in the manifest.
    devices,
  };

  const counts = { vlans: 0, firewallRules: 0, ssids: 0, groupPolicies: 0, switchPorts: 0 };

  for (const net of networks) {
    const p = net.productTypes || [];
    const entry = { id: net.id, name: net.name, productTypes: p, timeZone: net.timeZone };

    if (p.includes("appliance")) {
      entry.vlans = await api(`/networks/${net.id}/appliance/vlans`, { optional: true });
      entry.l3FirewallRules = await api(`/networks/${net.id}/appliance/firewall/l3FirewallRules`, { optional: true });
      entry.l7FirewallRules = await api(`/networks/${net.id}/appliance/firewall/l7FirewallRules`, { optional: true });
      counts.vlans += (entry.vlans || []).length;
      counts.firewallRules += (entry.l3FirewallRules?.rules || []).length
        + (entry.l7FirewallRules?.rules || []).length;
    }
    if (p.includes("wireless")) {
      // Contains psk / radiusSecret. Encrypted output only.
      const ssids = await api(`/networks/${net.id}/wireless/ssids`, { optional: true });
      entry.ssids = ssids;
      counts.ssids += (ssids || []).filter((s) => s.enabled).length;
    }
    entry.groupPolicies = await api(`/networks/${net.id}/groupPolicies`, { optional: true });
    counts.groupPolicies += (entry.groupPolicies || []).length;

    snapshot.networks.push(entry);
    console.log(`  ${net.name}: ${(entry.vlans || []).length} vlans, ${(entry.ssids || []).filter((s) => s.enabled).length || 0} ssids`);
  }

  // Switch port configuration, which is the single most painful thing to
  // rebuild from memory after a stack replacement.
  snapshot.switchPorts = {};
  const switches = devices.filter((d) => /^MS/.test(d.model || ""));
  console.log(`fetching port config for ${switches.length} switches…`);
  const portResults = await pool(switches, 5, (sw) =>
    api(`/devices/${sw.serial}/switch/ports`, { optional: true }));
  switches.forEach((sw, i) => {
    const ports = portResults[i];
    if (ports) {
      snapshot.switchPorts[sw.serial] = ports;
      counts.switchPorts += ports.length;
    }
  });
  const missed = switches.length - Object.keys(snapshot.switchPorts).length;
  console.log(`switch port config captured for ${Object.keys(snapshot.switchPorts).length} of ${switches.length} switches`);
  // Say it plainly rather than letting a partial backup look complete.
  if (missed) console.log(`WARNING: ${missed} switch(es) returned no port config — this backup is incomplete for those`);

  const json = JSON.stringify(snapshot, null, 2);
  fs.writeFileSync(OUT, json);
  const sha = crypto.createHash("sha256").update(json).digest("hex");
  console.log(`wrote ${OUT} (${json.length} bytes, sha256 ${sha.slice(0, 16)}…)`);

  // Publishable summary. Deliberately counts and checksums only — enough to
  // prove a backup ran and covered the estate, nothing that helps an attacker.
  fs.writeFileSync(MANIFEST, JSON.stringify({
    capturedAt: snapshot.capturedAt,
    source: "Meraki Dashboard API",
    networks: networks.length,
    devices: devices.length,
    switchesWithPortConfig: Object.keys(snapshot.switchPorts).length,
    counts,
    plaintextBytes: json.length,
    plaintextSha256: sha,
  }, null, 2));
  console.log(`wrote ${MANIFEST}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
