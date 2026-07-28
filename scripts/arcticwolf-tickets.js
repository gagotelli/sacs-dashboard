#!/usr/bin/env node
// Builds data/security.js from the Arctic Wolf Ticket API.
//
// Endpoints come from the published spec:
//   https://docs.arcticwolf.com/en/developer-and-oem/ticket-api/
//     arctic-wolf-ticket-api/use-the-ticket-api---advanced
//
// PRIVACY — this repo is public and its sign-in is client-side only.
// Arctic Wolf ticket `title` and `description` name hosts, accounts and
// attack detail. They are read in this process to derive a coarse category
// label and are never written to data/security.js, never logged, and never
// included in any error message. Everything published is a count, an enum
// value Arctic Wolf already defines, a timestamp, or a ticket id.
//
// Env: ARCTICWOLF_API_KEY

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KEY = process.env.ARCTICWOLF_API_KEY || "";
const ORG_URL = "https://eloc.global-prod.arcticwolf.net/api/v1/organizations";
const PAGE = 100;

async function api(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  if (!res.ok) {
    // Deliberately not echoing the body: an error page from the ticket
    // endpoint can quote the record that failed.
    throw new Error(`HTTP ${res.status} for ${url.replace(/\/organizations\/[^/]+/, "/organizations/<id>")}`);
  }
  return res.json();
}

// Arctic Wolf incident titles are templated. Mapping them to a fixed
// vocabulary turns "should I look at this?" into a category without
// publishing a single character of the title itself. Anything unrecognised
// becomes "Other" — it is never passed through verbatim.
const CATEGORIES = [
  [/phish|spam|suspicious e-?mail|business e-?mail compromise|\bbec\b/i, "Phishing / email"],
  [/malware|ransom|trojan|virus|malicious file|infected/i, "Malware"],
  [/login|sign-?in|authentication|mfa|impossible travel|unusual location|brute.?force|password spray/i, "Suspicious login"],
  [/privilege|admin (?:rights|account)|escalat|new admin|group membership/i, "Privilege change"],
  [/vulnerab|\bcve-|patch|end.of.life|outdated|unsupported version/i, "Vulnerability"],
  [/scan|port sweep|recon|enumeration/i, "Scanning / recon"],
  [/exfil|data (?:loss|transfer)|large upload|dlp/i, "Data movement"],
  [/firewall|network traffic|c2|command and control|beacon|dns tunnel/i, "Network / C2"],
  [/sensor|agent|collector|log (?:source|ingest)|not reporting|offline/i, "Sensor / telemetry health"],
  [/policy|configuration|misconfig|hardening|best practice/i, "Configuration / policy"],
];

function categorise(ticket) {
  const text = `${ticket.title || ""} ${ticket.description || ""}`;
  for (const [re, label] of CATEGORIES) if (re.test(text)) return label;
  return "Other";
}

const PRIORITY_WEIGHT = { CRITICAL: 100, HIGH: 60, MEDIUM: 30, NORMAL: 30, LOW: 10 };

// Ranking, not suppression. Nothing is hidden or auto-closed — every open
// ticket is published and counted. The score only decides what sits at the
// top of the list, so a low score costs attention, never visibility.
function triageScore(t, now) {
  const priority = String(t.priority || "").toUpperCase();
  let score = PRIORITY_WEIGHT[priority] ?? 20;

  const created = Date.parse(t.createdAt || "");
  if (!Number.isNaN(created)) {
    // An unresolved ticket gets more urgent the longer it sits, capped so age
    // alone can never outrank a genuine HIGH.
    score += Math.min(40, Math.floor((now - created) / 86_400_000) * 4);
  }
  // Back-and-forth usually means a real investigation rather than a
  // notification that closed itself.
  score += Math.min(15, (Number(t.commentCount) || 0) * 3);
  if ((Number(t.attachmentCount) || 0) > 0) score += 5;
  return score;
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
  if (!KEY) throw new Error("ARCTICWOLF_API_KEY must be set");

  const orgs = await api(ORG_URL);
  const org = (Array.isArray(orgs) ? orgs : [])[0];
  if (!org || !org.pod || !org.id) throw new Error("Organizations API returned no pod/id pair");
  console.log(`pod: ${org.pod}`); // pod is a routing key; the org id is not logged

  const base = `https://ticket-api.managedgw.${org.pod}-prod.arcticwolf.net/api/v1/organizations/${org.id}/tickets`;

  const tickets = [];
  for (let offset = 0, pages = 0; pages < 100; pages++, offset += PAGE) {
    const body = await api(`${base}?limit=${PAGE}&offset=${offset}`);
    const batch = body.results || [];
    tickets.push(...batch);
    const total = Number(body.meta?.total ?? body.meta?.count ?? NaN);
    if (batch.length < PAGE) break;
    if (!Number.isNaN(total) && tickets.length >= total) break;
  }
  console.log(`tickets fetched: ${tickets.length}`);

  const now = Date.now();
  const isOpen = (t) => String(t.status || "").toUpperCase() !== "CLOSED";
  const open = tickets.filter(isOpen);

  // Per-ticket rows carry no title and no description — an id, the enums
  // Arctic Wolf already assigns, and a derived category. The id is what the
  // portal link needs; it is not content.
  const queue = open
    .map((t) => ({
      id: t.id,
      priority: String(t.priority || "UNKNOWN").toUpperCase(),
      status: String(t.status || "UNKNOWN").toUpperCase(),
      type: String(t.type || "UNKNOWN").toUpperCase(),
      category: categorise(t),
      createdAt: t.createdAt || null,
      updatedAt: t.updatedAt || null,
      comments: Number(t.commentCount) || 0,
      attachments: Number(t.attachmentCount) || 0,
      assigned: Boolean(t.assignee),
      score: triageScore(t, now),
    }))
    .sort((a, b) => b.score - a.score);

  const payload = {
    updatedAt: new Date().toISOString(),
    source: "Arctic Wolf",
    portalUrl: "https://dashboard.arcticwolf.com/",
    total: tickets.length,
    open: open.length,
    closed: tickets.length - open.length,
    byPriority: tally(tickets, (t) => String(t.priority || "UNKNOWN").toUpperCase()),
    byStatus: tally(tickets, (t) => String(t.status || "UNKNOWN").toUpperCase()),
    byType: tally(tickets, (t) => String(t.type || "UNKNOWN").toUpperCase()),
    openByCategory: tally(open, categorise),
    queue,
  };

  const banner = [
    "// Arctic Wolf security ticket summary and triage queue.",
    "// Generated by .github/workflows/sync-arcticwolf.yml — do not edit by hand.",
    "//",
    "// No ticket title or description is stored here. Arctic Wolf ticket text",
    "// names hosts, accounts and attack detail, and this repo is public; the",
    "// sync reads that text only to derive the coarse `category` label below.",
    "//",
    "// `score` ranks the queue — it never hides anything. Every open ticket",
    "// appears in `queue` regardless of score.",
  ].join("\n");

  fs.writeFileSync(
    path.join(ROOT, "data/security.js"),
    `${banner}\nconst SECURITY_SUMMARY = ${JSON.stringify(payload, null, 2)};\n`
  );

  console.log(`wrote data/security.js — ${open.length} open of ${tickets.length}`);
  console.log(`  by priority: ${payload.byPriority.map((p) => `${p.label}=${p.value}`).join(" ")}`);
  console.log(`  open categories: ${payload.openByCategory.map((c) => `${c.label}=${c.value}`).join(" ")}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
