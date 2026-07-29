#!/usr/bin/env node
// Evaluates the synced data against thresholds and posts anything new to a
// Teams channel via an incoming webhook.
//
// WHY STATE IS TRACKED: a naive checker re-posts every condition on every run,
// so a single dead sensor becomes 24 messages a day and the channel gets muted
// — at which point the alerting is worse than none. data/alert-state.js records
// which conditions have already been announced; only transitions are posted,
// plus a recovery note when one clears.
//
// Env: TEAMS_WEBHOOK_URL (optional — without it this runs as a dry run and
//      prints what it would have sent, which is also how it is tested)
//      DASHBOARD_URL     (optional, for the link in each message)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEBHOOK = process.env.TEAMS_WEBHOOK_URL || "";
const DASHBOARD = process.env.DASHBOARD_URL || "https://gagotelli.github.io/sacs-dashboard/";

// Re-announce a condition that is still true after this long, so a genuinely
// persistent problem does not fall silent forever after one message.
const REMIND_AFTER_HOURS = 72;

function loadConst(file, name) {
  const p = path.join(ROOT, "data", file);
  if (!fs.existsSync(p)) return null;
  try {
    return new Function(`${fs.readFileSync(p, "utf8")}; return ${name};`)();
  } catch (e) {
    console.log(`could not read ${file}: ${e.message}`);
    return null;
  }
}

const days = (iso) => (Date.parse(iso) - Date.now()) / 86400000;

// Each rule returns zero or more alerts. `key` must be stable for the same
// condition across runs — that is what makes de-duplication work.
function evaluate() {
  const alerts = [];
  const status = loadConst("status.js", "DEVICE_STATUS");
  const wireless = loadConst("wireless.js", "WIRELESS");
  const endpoints = loadConst("endpoints.js", "ENDPOINT_SUMMARY");
  const security = loadConst("security.js", "SECURITY_SUMMARY");
  const tickets = loadConst("tickets.js", "TICKET_SUMMARY");
  const licenses = loadConst("licenses.js", "LICENSES") || [];

  // --- core devices down -------------------------------------------------
  Object.entries(status?.devices || {}).forEach(([id, d]) => {
    if (d.status !== "down") return;
    alerts.push({
      key: `device-down:${id}`, severity: "critical",
      title: `Device down: ${id}`,
      detail: `Auvik reports ${id} as down. Last seen ${d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "unknown"}.`,
    });
  });

  // --- attested devices --------------------------------------------------
  // Devices no feed can poll carry a human check instead. That check is only
  // worth anything while it is recent — an attestation nobody revisits is a
  // green dot backed by a memory, which is exactly the failure mode the undated
  // licence rule below exists to catch.
  const ATTEST_STALE_DAYS = 90;
  const stale = (loadConst("devices.js", "DEVICES") || [])
    .filter((d) => d.attested?.on && -days(d.attested.on) > ATTEST_STALE_DAYS);
  if (stale.length) {
    alerts.push({
      key: "attestation-stale", severity: "warning",
      title: `${stale.length} device${stale.length === 1 ? "" : "s"} last confirmed over ${ATTEST_STALE_DAYS} days ago`,
      detail: `${stale.map((d) => `${d.name} (${d.attested.on})`).join(", ")}. Nothing polls ${stale.length === 1 ? "it" : "them"}, so re-check in the vendor portal and update data/devices.js.`,
    });
  }

  // --- wireless ----------------------------------------------------------
  const apDown = wireless?.counts?.down || 0;
  if (apDown > 0) {
    alerts.push({
      key: "aps-down", severity: apDown >= 5 ? "critical" : "warning",
      title: `${apDown} access point${apDown === 1 ? "" : "s"} offline`,
      detail: `Meraki reports ${apDown} of ${wireless.total} APs offline.`,
    });
  }
  // Meraki reports a struggling AP as "alerting", not "down". A dry run with
  // 15 APs alerting produced zero alerts, because only `down` was checked —
  // an all-clear that was simply wrong.
  const apAlerting = wireless?.counts?.warning || 0;
  if (apAlerting >= 10) {
    alerts.push({
      key: "aps-alerting", severity: "warning",
      title: `${apAlerting} access points alerting`,
      detail: `Meraki reports ${apAlerting} of ${wireless.total} APs in an alerting state.`,
    });
  }

  (wireless?.bySite || []).forEach((s) => {
    // A whole site losing a third of its wireless is a different problem from
    // scattered singles, so it is called out separately.
    if (s.total >= 5 && s.down / s.total >= 0.34) {
      alerts.push({
        key: `site-wireless:${s.label}`, severity: "critical",
        title: `${s.label} wireless degraded`,
        detail: `${s.down} of ${s.total} APs down at ${s.label}.`,
      });
    }
  });

  // --- Meraki licence capacity ------------------------------------------
  const lic = wireless?.licensing;
  if (lic?.expiresOn && days(lic.expiresOn) < 90) {
    alerts.push({
      key: "meraki-licence", severity: days(lic.expiresOn) < 30 ? "critical" : "warning",
      title: `Meraki co-termination licence expires in ${Math.floor(days(lic.expiresOn))} days`,
      detail: `Co-termination means every AP and switch lapses together on ${lic.expiresOn}.`,
    });
  }
  // One alert for all exhausted pools, not one per model. Five near-identical
  // messages saying the same thing in different words is most of what made the
  // first real card read as a wall of text — and a wall of text is skimmed,
  // which is the failure mode alerting exists to avoid.
  const exhausted = lic?.exhausted || [];
  if (exhausted.length) {
    alerts.push({
      key: `licence-pool:${[...exhausted].sort().join(",")}`, severity: "warning",
      title: exhausted.length === 1
        ? `No spare Meraki licences for ${exhausted[0]}`
        : `No spare Meraki licences for ${exhausted.length} switch models`,
      detail: `Every licensed slot is in use for ${exhausted.join(", ")}. None of these can have another unit added until a licence is bought.`,
    });
  }

  // --- licence and support expiry ---------------------------------------
  // A licence with NO known expiry is the exact shape of the 2026-07-20 P1 —
  // it lapsed because nobody knew when it was due. Skipping undated entries
  // would make this engine silent about the one failure that already happened.
  const undated = licenses.filter((l) => !l.expiresOn && l.status === "critical");
  if (undated.length) {
    alerts.push({
      key: "licence-unaudited", severity: "critical",
      title: `${undated.length} licence${undated.length === 1 ? " has" : "s have"} no confirmed expiry date`,
      detail: `${undated.map((l) => l.product).join(", ")}. This is how the 2026-07-20 DHCP outage started — run the audit runbook and record the dates.`,
    });
  }

  licenses.forEach((l) => {
    if (!l.expiresOn) return;
    const d = days(l.expiresOn);
    if (d > 60) return;
    alerts.push({
      key: `licence:${l.id}`, severity: d < 0 ? "critical" : d < 30 ? "critical" : "warning",
      title: d < 0
        ? `EXPIRED: ${l.product}`
        : `${l.product} expires in ${Math.floor(d)} days`,
      detail: `${l.host} — ${l.expiresOn}.`,
    });
  });

  // --- security ----------------------------------------------------------
  (security?.queue || []).forEach((q) => {
    if (!["CRITICAL", "HIGH"].includes(q.priority)) return;
    alerts.push({
      key: `security:${q.id}`, severity: "critical",
      title: `Arctic Wolf ${q.priority}: ${q.category}`,
      detail: `Ticket #${q.id}, opened ${q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "?"}.`,
    });
  });

  // --- endpoints ---------------------------------------------------------
  const dark = (endpoints?.devices?.byStaleness || [])
    .filter((b) => /30 days|Never/.test(b.label))
    .reduce((n, b) => n + b.value, 0);
  if (dark > 0) {
    alerts.push({
      key: "endpoints-dark", severity: "warning",
      title: `${dark} endpoint${dark === 1 ? "" : "s"} not seen in over 30 days`,
      detail: "NinjaOne has had no check-in from these for a month or more.",
    });
  }

  // --- tickets -----------------------------------------------------------
  if ((tickets?.urgent || 0) >= 15) {
    alerts.push({
      key: "tickets-urgent", severity: "warning",
      title: `${tickets.urgent} urgent tickets open`,
      detail: `Above the threshold of 15. ${tickets.open} open in total.`,
    });
  }

  // --- feed staleness ----------------------------------------------------
  // A sync that quietly stops is the failure that hides every other failure,
  // so the freshness of each feed is itself a rule.
  [
    ["Auvik", status?.updatedAt], ["Meraki", wireless?.updatedAt],
    ["NinjaOne", endpoints?.updatedAt], ["Arctic Wolf", security?.updatedAt],
    ["ManageEngine", tickets?.updatedAt],
  ].forEach(([name, at]) => {
    if (!at) return;
    const hours = (Date.now() - Date.parse(at)) / 3600000;
    if (hours > 6) {
      alerts.push({
        key: `stale:${name}`, severity: "warning",
        title: `${name} feed is stale`,
        detail: `Last successful sync was ${hours.toFixed(1)} hours ago.`,
      });
    }
  });

  return alerts;
}

const SEV_COLOR = { critical: "attention", warning: "warning" };

// A Workflows post into a channel is silent unless someone is @mentioned — the
// first live card landed correctly and notified nobody. Set TEAMS_MENTION to
// one or more UPNs to make Teams actually raise a notification:
//
//   TEAMS_MENTION="a.person@school.nsw.edu.au,Someone Else <b.person@school.edu>"
//
// Left unset, the card posts exactly as before.
function parseMentions() {
  return (process.env.TEAMS_MENTION || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const angled = entry.match(/^(.*?)\s*<([^>]+)>$/);
      const upn = (angled ? angled[2] : entry).trim();
      const name = angled && angled[1].trim() ? angled[1].trim() : upn.split("@")[0];
      return { upn, name };
    });
}

async function postToTeams(alerts, recovered) {
  const lines = [];
  const mentions = parseMentions();

  if (mentions.length) {
    // The mention must appear in the card BODY as well as in the entities
    // list — an entity nobody references renders as nothing and notifies
    // nobody, which is the silent-failure version of this feature.
    lines.push({
      type: "TextBlock", wrap: true,
      text: mentions.map((m) => `<at>${m.name}</at>`).join(" "),
    });
  }

  if (alerts.length) {
    lines.push({ type: "TextBlock", text: `**${alerts.length} new alert${alerts.length === 1 ? "" : "s"}**`, wrap: true });
    alerts.forEach((a) => lines.push({
      type: "TextBlock", wrap: true, spacing: "Small",
      color: SEV_COLOR[a.severity] || "default",
      text: `**${a.title}**\n\n${a.detail}`,
    }));
  }
  if (recovered.length) {
    lines.push({ type: "TextBlock", text: `**Cleared**`, wrap: true, spacing: "Medium" });
    recovered.forEach((k) => lines.push({
      type: "TextBlock", wrap: true, spacing: "Small", isSubtle: true, text: k,
    }));
  }

  const card = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        type: "AdaptiveCard", version: "1.4",
        ...(mentions.length ? {
          msteams: {
            entities: mentions.map((m) => ({
              type: "mention",
              text: `<at>${m.name}</at>`,
              mentioned: { id: m.upn, name: m.name },
            })),
          },
        } : {}),
        body: [{ type: "TextBlock", size: "Medium", weight: "Bolder", text: "SACS Network Dashboard" }, ...lines],
        actions: [{ type: "Action.OpenUrl", title: "Open dashboard", url: DASHBOARD }],
      },
    }],
  };

  // Without a webhook this is a dry run, and a dry run that only says "nothing
  // sent" cannot tell you whether the mention block came out right. Print the
  // payload instead, so the card can be checked before it reaches a channel.
  // Logged on real posts too, not just dry runs: "did it tag anyone" is the
  // one thing you cannot tell from a card that arrived, and an unset
  // TEAMS_MENTION fails by being silently polite rather than by erroring.
  console.log(`mentions: ${mentions.length ? mentions.map((m) => `${m.name} <${m.upn}>`).join(", ") : "NONE — TEAMS_MENTION is not set, this post will not notify anyone"}`);

  if (!WEBHOOK) {
    console.log("would post:");
    console.log(JSON.stringify(card, null, 2));
    return;
  }

  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) throw new Error(`Teams webhook returned HTTP ${res.status}`);
}

async function main() {
  const alerts = evaluate();
  const state = loadConst("alert-state.js", "ALERT_STATE") || { seen: {} };
  const now = Date.now();

  const isNew = (a) => {
    const prev = state.seen[a.key];
    if (!prev) return true;
    return (now - Date.parse(prev.at)) / 3600000 >= REMIND_AFTER_HOURS;
  };

  const fresh = alerts.filter(isNew);
  const activeKeys = new Set(alerts.map((a) => a.key));
  const recovered = Object.entries(state.seen)
    .filter(([k]) => !activeKeys.has(k))
    .map(([, v]) => v.title || "");

  console.log(`${alerts.length} conditions active, ${fresh.length} new, ${recovered.length} cleared`);
  alerts.forEach((a) => console.log(`  [${a.severity}] ${a.title}${isNew(a) ? " (NEW)" : ""}`));

  if (fresh.length || recovered.length) {
    await postToTeams(fresh, recovered);
    console.log(WEBHOOK ? "posted to Teams" : "TEAMS_WEBHOOK_URL not set — dry run, nothing sent");
  } else {
    console.log("nothing new to post");
  }

  // Persist only what is currently active, so a cleared condition alerts again
  // if it comes back.
  const seen = {};
  alerts.forEach((a) => {
    seen[a.key] = {
      at: state.seen[a.key] && !isNew(a) ? state.seen[a.key].at : new Date().toISOString(),
      title: a.title,
      severity: a.severity,
      // Carried so the dashboard's Alerts page can show the same explanation
      // the Teams card does, instead of a bare headline.
      detail: a.detail,
    };
  });

  const banner = [
    "// Currently active alert conditions, and when each was first announced.",
    "// Generated by .github/workflows/check-alerts.yml — do not edit by hand.",
    "//",
    "// Two jobs: it stops a standing problem being posted to Teams on every",
    "// run, and it is the source for the dashboard's Alerts page. A condition",
    "// still true after the reminder window is re-announced; one that",
    "// disappears is reported as cleared and removed, so it alerts again if it",
    "// returns.",
  ].join("\n");

  fs.writeFileSync(
    path.join(ROOT, "data/alert-state.js"),
    `${banner}\nconst ALERT_STATE = ${JSON.stringify({ updatedAt: new Date().toISOString(), seen }, null, 2)};\n`
  );
}

main().catch((e) => { console.error(e.message); process.exit(1); });
