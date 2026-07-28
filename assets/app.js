(function () {
  "use strict";

  const LAYER_COLOR = {
    core: "var(--layer-core)",
    access: "var(--layer-access)",
    legacy: "var(--layer-legacy)",
    security: "var(--layer-security)",
  };
  const LAYER_LABEL = {
    core: "Core",
    access: "Access",
    legacy: "Legacy / 1G",
    security: "Security",
  };
  // Accepts both the palette names and the values data/status.js emits, so a
  // live "down" does not render as an empty status cell.
  const STATUS_LABEL = {
    up: "Up",
    warning: "Warning",
    serious: "Degraded",
    down: "Down",
    critical: "Down",
    // Meraki-specific: never came online, or powered down by schedule. Not a
    // fault, so it must not read as "Down".
    dormant: "Dormant",
    unknown: "Unknown",
  };
  const LICENSE_STATUS_LABEL = {
    critical: "Action needed",
    warning: "Expiring soon",
    unknown: "Needs audit",
    good: "OK",
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function deviceStatus(id) {
    const entry = (DEVICE_STATUS && DEVICE_STATUS.devices && DEVICE_STATUS.devices[id]) || null;
    return entry && entry.status ? entry.status : "unknown";
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function initTabs() {
    function activate(panelId) {
      document.querySelectorAll("nav.tabs button, .rail-item").forEach((b) => b.classList.toggle("active", b.dataset.panel === panelId));
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === panelId));
    }
    function go(panelId, updateHash) {
      if (!document.getElementById(panelId)) return;
      activate(panelId);
      if (updateHash) history.replaceState(null, "", "#" + panelId.replace("panel-", ""));
    }

    // Delegated so it also covers elements rendered later (e.g. the doc index).
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-panel]");
      if (!el) return;
      e.preventDefault();
      go(el.dataset.panel, true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const wanted = location.hash.replace("#", "");
    if (wanted) go("panel-" + wanted, false);

    initRailGroups();
    syncRailGroups();
    // activate() runs on every navigation, so group state must follow it.
    document.addEventListener("click", syncRailGroups);
  }

  // Collapsible rail groups. The open/closed choice is remembered, but a group
  // is force-opened whenever it holds the active panel — otherwise arriving by
  // URL hash lands you on a page you cannot see in the menu.
  function initRailGroups() {
    document.querySelectorAll(".rail-group").forEach((group) => {
      const toggle = group.querySelector(".rail-group-toggle");
      if (!toggle) return;
      const key = `sacs-rail-${group.id}`;
      if (localStorage.getItem(key) === "closed") toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        localStorage.setItem(key, open ? "closed" : "open");
      });
    });
  }

  function syncRailGroups() {
    document.querySelectorAll(".rail-group").forEach((group) => {
      const active = group.querySelector(".rail-item.active");
      group.classList.toggle("has-active", Boolean(active));
      if (active) group.querySelector(".rail-group-toggle")?.setAttribute("aria-expanded", "true");
    });
  }

  // ---------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------
  function initLogout() {
    const btn = document.getElementById("logout-button");
    if (!btn) return;
    btn.addEventListener("click", () => {
      sessionStorage.removeItem("sacs-gate-ok");
      location.reload();
    });
  }

  // ---------------------------------------------------------------------
  // Theme toggle
  // ---------------------------------------------------------------------
  function initTheme() {
    const btn = document.getElementById("theme-toggle");
    const iconUse = document.querySelector("#theme-icon use");
    const label = document.getElementById("theme-label");
    const root = document.documentElement;
    const stored = localStorage.getItem("sacs-theme");
    if (stored) root.setAttribute("data-theme", stored);

    // Must match the stylesheet's default, which is light. If these two
    // disagree the first click is a no-op, because it "switches" to the
    // theme already showing.
    function current() {
      return root.getAttribute("data-theme") || "light";
    }
    function sync() {
      const c = current();
      iconUse.setAttribute("href", c === "dark" ? "#icon-sun" : "#icon-moon");
      label.textContent = c === "dark" ? "Light" : "Dark";
    }
    sync();
    btn.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("sacs-theme", next);
      sync();
      // Group tints are baked into the SVG markup, so it is rebuilt on a
      // theme change. Listeners are bound once in initTopology, not here.
      renderTopology();
    });
  }

  // ---------------------------------------------------------------------
  // Small chart primitives (no external library — plain SVG / HTML)
  // ---------------------------------------------------------------------
  function donutSvg(segments, opts) {
    opts = opts || {};
    const size = opts.size || 132;
    const thickness = opts.thickness || 18;
    const filtered = segments.filter((s) => s.value > 0);
    const total = filtered.reduce((s, x) => s + x.value, 0) || 1;
    const centerValue = opts.centerValue != null ? opts.centerValue : total;
    const centerLabel = opts.centerLabel || "total";
    const r = (size - thickness) / 2;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;
    const gapDeg = filtered.length > 1 ? 3 : 0;
    let cumulativeDeg = -90;
    const arcs = filtered.map((seg) => {
      const sweepDeg = (seg.value / total) * 360;
      const startDeg = cumulativeDeg;
      cumulativeDeg += sweepDeg;
      const drawSweep = Math.max(sweepDeg - gapDeg, 0.001);
      const dash = (drawSweep / 360) * circumference;
      const gap = circumference - dash;
      const rotation = startDeg + gapDeg / 2;
      return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" transform="rotate(${rotation.toFixed(2)} ${c} ${c})"><title>${esc(seg.label)}: ${esc(seg.value)}</title></circle>`;
    }).join("");
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="donut-svg">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--gridline)" stroke-width="${thickness}"/>
      ${arcs}
      <text x="${c}" y="${c - 2}" text-anchor="middle" class="donut-total">${esc(centerValue)}</text>
      <text x="${c}" y="${c + 16}" text-anchor="middle" class="donut-total-label">${esc(centerLabel)}</text>
    </svg>`;
  }

  // Semicircle gauge. Percentages only — the arc length is the encoding, so a
  // non-ratio value here would be meaningless.
  function gaugeSvg(pct, color, opts) {
    opts = opts || {};
    const suffix = opts.suffix == null ? "%" : opts.suffix;
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    const w = 150, h = 84, cx = 75, cy = 74, r = 58, sw = 13;
    const len = Math.PI * r;
    const arc = (c, dash) =>
      `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${c}"` +
      ` stroke-width="${sw}" stroke-linecap="butt"` +
      (dash == null ? "" : ` stroke-dasharray="${dash.toFixed(2)} ${(len - dash).toFixed(2)}"`) + `/>`;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${p.toFixed(0)} percent">
      ${arc("var(--gridline)", null)}
      ${arc(color, (p / 100) * len)}
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" class="gauge-value">${p.toFixed(0)}${suffix}</text>
    </svg>`;
  }

  function gaugeColor(pct, invert) {
    const p = Number(pct) || 0;
    const good = invert ? p <= 5 : p >= 95;
    const warn = invert ? p <= 20 : p >= 80;
    return good ? "var(--status-good)" : warn ? "var(--status-warning)" : "var(--status-critical)";
  }

  // ---------------------------------------------------------------------
  // Overview v2 — health strip, per-campus cards, shared infrastructure
  // ---------------------------------------------------------------------

  // Every metric below is derived from a real feed. Where the design calls
  // for something we do not measure — uptime history, bandwidth, sparkline
  // trends — the tile is omitted rather than filled with a plausible number.
  function pctOrNull(n, d) { return d ? (n / d) * 100 : null; }

  function verdictFor(score) {
    if (score == null) return { word: "Unknown", tone: "unknown", color: "var(--status-unknown)" };
    if (score >= 90) return { word: "Excellent", tone: "good", color: "var(--status-good)" };
    if (score >= 75) return { word: "Good", tone: "good", color: "var(--status-good)" };
    if (score >= 55) return { word: "Fair", tone: "warning", color: "var(--status-warning)" };
    return { word: "Needs attention", tone: "critical", color: "var(--status-critical)" };
  }

  function deviceStats(filterFn) {
    const list = DEVICES.filter(filterFn || (() => true));
    const known = list.filter((d) => deviceStatus(d.id) !== "unknown");
    const up = list.filter((d) => deviceStatus(d.id) === "up").length;
    return { total: list.length, up, known: known.length };
  }

  function cameraStats(site) {
    if (typeof CAMERAS === "undefined") return null;
    const list = site ? CAMERAS.filter((c) => c.site === site) : CAMERAS;
    if (!list.length) return null;
    return { total: list.length, active: list.filter((c) => c.working === "Y").length };
  }

  // Composite of the signals we actually have, each weighted by how much a
  // failure in it would matter operationally.
  function healthScore(parts) {
    const usable = parts.filter((p) => p.pct != null);
    if (!usable.length) return null;
    const w = usable.reduce((s, p) => s + p.weight, 0);
    return Math.round(usable.reduce((s, p) => s + p.pct * p.weight, 0) / w);
  }

  function renderHealthStrip() {
    const el = document.getElementById("health-strip");
    if (!el) return;

    const dev = deviceStats();
    const devPct = pctOrNull(dev.up, dev.known);
    const licOk = LICENSES.filter((l) => !["critical", "warning"].includes(licenseStatus(l))).length;
    const licPct = pctOrNull(licOk, LICENSES.length);
    const cam = cameraStats(null);
    const camPct = cam ? pctOrNull(cam.active, cam.total) : null;
    const vlanPct = pctOrNull(VLANS.filter((v) => String(v.status).toLowerCase() === "up").length, VLANS.length);

    const score = healthScore([
      { pct: devPct, weight: 4 },
      { pct: licPct, weight: 2 },
      { pct: vlanPct, weight: 2 },
      { pct: camPct, weight: 1 },
    ]);
    const v = verdictFor(score);

    const licAction = LICENSES.filter((l) => licenseStatus(l) === "critical").length;
    const down = dev.known - dev.up;

    const metrics = [
      { label: "Devices up", value: dev.known ? `${dev.up}/${dev.known}` : "n/a", icon: "#icon-devices", tone: down ? "critical" : "good", panel: "panel-devices" },
      { label: "Open tickets", value: TICKET_SUMMARY.open == null ? "n/a" : TICKET_SUMMARY.open.toLocaleString(), icon: "#icon-ticket", tone: "", panel: "panel-tickets" },
      { label: "Urgent tickets", value: TICKET_SUMMARY.urgent == null ? "n/a" : TICKET_SUMMARY.urgent, icon: "#icon-ticket", tone: TICKET_SUMMARY.urgent ? "critical" : "good", panel: "panel-tickets" },
      { label: "Licenses to action", value: licAction, icon: "#icon-license", tone: licAction ? "critical" : "good", panel: "panel-licenses" },
      { label: "Cameras online", value: cam ? `${cam.active}/${cam.total}` : "n/a", icon: "#icon-camera", tone: cam && cam.active < cam.total ? "warning" : "good", panel: "panel-cctv" },
    ];

    el.innerHTML = `
      <div class="health-score">
        ${gaugeSvg(score == null ? 0 : score, v.color, { suffix: "" })}
        <div class="health-score-meta">
          <div class="eyebrow">Global health score</div>
          <div class="verdict" style="color:${v.color}">${esc(v.word)}</div>
          <div class="sub">Across both campuses</div>
        </div>
      </div>
      <div class="metric-strip">
        ${metrics.map((m) => `
          <button type="button" class="metric-item" data-panel="${esc(m.panel)}" style="background:none;border:0;font:inherit;cursor:pointer;text-align:left">
            <span class="metric-icon ${m.tone ? "tone-" + m.tone : ""}"><svg class="icon"><use href="${esc(m.icon)}"/></svg></span>
            <span>
              <span class="label">${esc(m.label)}</span><br>
              <span class="value">${esc(m.value)}</span>
            </span>
          </button>`).join("")}
      </div>`;
  }

  function renderCampusCards() {
    const el = document.getElementById("campus-grid");
    if (!el) return;

    const campuses = [
      { key: "SAH", name: "SAH Campus", sub: "St Andrew's House" },
      { key: "BBC", name: "BBC Campus", sub: "Blue Bay / Gawura" },
    ];

    el.innerHTML = campuses.map((c) => {
      const dev = deviceStats((d) => d.site === c.key);
      const devPct = pctOrNull(dev.up, dev.known);
      const cam = cameraStats(c.key);
      const camPct = cam ? pctOrNull(cam.active, cam.total) : null;
      const legacy = DEVICES.filter((d) => d.site === c.key && d.layer === "legacy").length;
      const score = healthScore([{ pct: devPct, weight: 4 }, { pct: camPct, weight: 2 }]);

      const issues = [];
      DEVICES.filter((d) => d.site === c.key).forEach((d) => {
        const st = deviceStatus(d.id);
        if (st === "down") issues.push({ tone: "critical", text: `${d.name} is down`, where: d.ip || "" });
        else if (st === "warning") issues.push({ tone: "warning", text: `${d.name} reporting warning`, where: d.ip || "" });
      });
      if (legacy) issues.push({ tone: "warning", text: `${legacy} legacy 1G uplink${legacy > 1 ? "s" : ""} still in service`, where: "" });
      if (cam && cam.active < cam.total) {
        issues.push({ tone: "warning", text: `${cam.total - cam.active} cameras not confirmed working`, where: "" });
      }
      const notReporting = dev.total - dev.known;
      if (notReporting) issues.push({ tone: "unknown", text: `${notReporting} device${notReporting > 1 ? "s" : ""} not polled by Auvik`, where: "" });

      // A headline of "Excellent" above a list of open problems is worse than
      // no headline, so the badge is capped by the worst issue on the card.
      let v = verdictFor(score);
      if (issues.some((i) => i.tone === "critical")) {
        v = { word: "Needs attention", tone: "critical", color: "var(--status-critical)" };
      } else if (issues.some((i) => i.tone === "warning")) {
        v = { word: "Minor issues", tone: "warning", color: "var(--status-warning)" };
      }

      const toneColor = { critical: "var(--status-critical)", warning: "var(--status-warning)", unknown: "var(--status-unknown)" };

      const metric = (label, value, note, tone) => `
        <div class="campus-metric">
          <div class="cm-label">${esc(label)}</div>
          <div class="cm-value">${esc(value)}</div>
          ${note ? `<div class="cm-note"><span class="dot" style="background:${toneColor[tone] || "var(--status-good)"};width:6px;height:6px;border-radius:50%"></span>${esc(note)}</div>` : ""}
        </div>`;

      return `
        <div class="card">
          <div class="campus-head">
            <div style="flex:1">
              <h3>${esc(c.name)}</h3>
              <div class="sub">${esc(c.sub)}</div>
            </div>
            <span class="pill pill-${v.tone === "unknown" ? "warning" : v.tone}">${esc(v.word)}</span>
          </div>
          <div class="campus-metrics">
            ${metric("Health", score == null ? "n/a" : String(score), null, v.tone)}
            ${metric("Devices", dev.known ? `${dev.up} / ${dev.known}` : "n/a", dev.up === dev.known ? "Up" : "Check", dev.up === dev.known ? "good" : "critical")}
            ${metric("Cameras", cam ? `${cam.active} / ${cam.total}` : "n/a", cam ? "Working" : null, cam && cam.active < cam.total ? "warning" : "good")}
            ${metric("Legacy 1G", legacy, legacy ? "Upgrade" : "None", legacy ? "warning" : "good")}
          </div>
          <div class="issue-list">
            <h4>Key issues</h4>
            ${issues.length
              ? issues.slice(0, 4).map((i) => `
                  <div class="issue-row">
                    <span class="dot" style="background:${toneColor[i.tone] || "var(--status-good)"}"></span>
                    <span class="issue-text">${esc(i.text)}</span>
                    <span class="issue-where">${esc(i.where)}</span>
                  </div>`).join("")
              : `<div class="issue-row"><span class="dot" style="background:var(--status-good)"></span><span class="issue-text">Nothing flagged</span></div>`}
          </div>
        </div>`;
    }).join("");
  }

  function renderInfraTiles() {
    const el = document.getElementById("infra-tiles");
    if (!el) return;

    const group = (label, fn) => {
      const s = deviceStats(fn);
      return { label, value: s.known ? `${s.up} / ${s.known}` : `0 / ${s.total}`, ok: s.known > 0 && s.up === s.known, none: s.known === 0 };
    };
    const tiles = [
      group("Core switches", (d) => d.layer === "core"),
      group("Firewalls", (d) => /firewall/i.test(d.name)),
      group("Access switches", (d) => d.layer === "access"),
      // Availability is not the point for these — their existence is.
      (() => { const t = group("Legacy 1G", (d) => d.layer === "legacy");
               return { ...t, ok: t.value.startsWith("0"), state: "Upgrade" }; })(),
    ];
    if (typeof CRITICAL_INFRA !== "undefined") {
      const wifi = CRITICAL_INFRA.find((c) => /wireless/i.test(c.category));
      const total = wifi && wifi.items.find((i) => /total/i.test(i.name));
      if (total) tiles.push({ label: "Wireless APs", value: (total.detail.match(/^\d+/) || ["?"])[0], ok: true, none: false });
    }
    tiles.push({
      label: "VLANs up",
      value: `${VLANS.filter((v) => String(v.status).toLowerCase() === "up").length} / ${VLANS.length}`,
      ok: !VLANS.some((v) => String(v.status).toLowerCase() === "down"), none: false,
    });

    el.innerHTML = tiles.map((t) => `
      <div class="infra-tile">
        <div class="it-label">${esc(t.label)}</div>
        <div class="it-value">${esc(t.value)}</div>
        <div class="it-state">
          <span class="dot" style="width:6px;height:6px;border-radius:50%;background:${t.none ? "var(--status-unknown)" : t.ok ? "var(--status-good)" : "var(--status-warning)"}"></span>
          ${t.none ? "Not polled" : t.state ? t.state : t.ok ? "Up" : "Check"}
        </div>
      </div>`).join("");
  }

  function legendHtml(items) {
    return items.map((i) => `
      <div class="legend-row-item"${i.title ? ` title="${esc(i.title)}"` : ""}>
        <span class="swatch" style="background:${i.color}"></span>
        <span class="legend-row-label">${esc(i.label)}</span>
        <span class="legend-value">${esc(i.value)}</span>
      </div>`).join("");
  }

  function barListHtml(items, color) {
    const max = Math.max(...items.map((i) => i.value), 1);
    return items.map((i) => `
      <div class="bar-row">
        <div class="bar-row-label">${esc(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${((i.value / max) * 100).toFixed(1)}%; background:${color}"></div></div>
        <div class="bar-row-value">${esc(i.value)}</div>
      </div>`).join("");
  }

  // ---------------------------------------------------------------------
  // Support tickets (ManageEngine ServiceDesk Plus)
  // ---------------------------------------------------------------------
  // ServiceDesk Plus priorities are renamed per portal — SACS uses SLA-style
  // names ("Critical: Drop Everything", "Normal: End of Next Day", "1 Week",
  // "Term Break") rather than Urgent/High/Medium/Low. Rank by the urgency
  // words in the name so the ordering survives a rename, and colour by rank
  // from an ordinal ramp. Unranked names land mid-scale rather than vanishing.
  function priorityRank(label) {
    const s = String(label || "").toLowerCase();
    if (/unassigned|none|not set|^-$/.test(s)) return 5;
    if (/critical|urgent|emergency|drop everything|\bp1\b/.test(s)) return 1;
    if (/high|next day|same day|\bp2\b/.test(s)) return 2;
    if (/normal|medium|week|\bp3\b/.test(s)) return 3;
    if (/low|term break|planned|month|quarter|\bp4\b/.test(s)) return 4;
    return 3;
  }

  const PRIORITY_RANK_COLOR = {
    1: "var(--prio-1)",
    2: "var(--prio-2)",
    3: "var(--prio-3)",
    4: "var(--prio-4)",
    5: "var(--prio-none)",
  };

  function renderTickets() {
    const labelEl = document.getElementById("ticket-button-label");
    const noteEl = document.getElementById("tickets-not-connected-note");
    const donutEl = document.getElementById("glance-tickets-donut");
    const legendEl = document.getElementById("glance-tickets-legend");

    if (TICKET_SUMMARY.total == null) {
      labelEl.textContent = "Tickets: not connected";
      donutEl.innerHTML = "";
      legendEl.innerHTML = "";
      noteEl.hidden = false;
      return;
    }

    // Most urgent first, so the donut and legend read in severity order.
    // These SLA names are far too long for the side rail ("Critical: Drop
    // Everything"), so show the part before the colon and keep the full
    // name on hover.
    const priorityCounts = (TICKET_SUMMARY.byPriority || [])
      .map((p) => ({ value: p.value, label: p.label, rank: priorityRank(p.label) }))
      .sort((a, b) => a.rank - b.rank || b.value - a.value)
      .map((p) => ({
        value: p.value,
        label: String(p.label).split(":")[0].trim(),
        title: p.label,
        color: PRIORITY_RANK_COLOR[p.rank] || "var(--prio-none)",
      }));

    // A sync can return the total but fail to resolve the per-bucket
    // breakdown. Reporting "0 open" in that case would state a number we
    // did not actually establish, so show the total and say so instead.
    const haveBreakdown = priorityCounts.length > 0;

    if (!haveBreakdown) {
      labelEl.textContent = `Tickets: ${TICKET_SUMMARY.total.toLocaleString()} total`;
      donutEl.innerHTML = donutSvg(
        [{ value: 1, color: "var(--status-unknown)", label: "Total" }],
        { centerValue: TICKET_SUMMARY.total, centerLabel: "total" }
      );
      legendEl.innerHTML = "";
      noteEl.textContent =
        "Total is live, but the open/priority breakdown could not be read from " +
        "ManageEngine on the last sync — treat only the total as current.";
      noteEl.hidden = false;
      return;
    }

    noteEl.hidden = true;
    labelEl.textContent = `${TICKET_SUMMARY.open} open · ${TICKET_SUMMARY.urgent ?? 0} urgent`;
    donutEl.innerHTML = donutSvg(priorityCounts, { centerValue: TICKET_SUMMARY.open, centerLabel: "open" });
    legendEl.innerHTML = legendHtml(priorityCounts);
  }

  // ---------------------------------------------------------------------
  // Network at a glance (charts derived from inventory data — not live telemetry)
  // ---------------------------------------------------------------------
  // Full Tickets tab. Everything here is an aggregate — see the privacy note
  // rendered on the page for why subjects and requesters are never fetched.
  function renderTicketsPage() {
    const updatedEl = document.getElementById("ticket-updated");
    const linkEl = document.getElementById("ticket-portal-link");
    const kpiEl = document.getElementById("ticket-kpi-row");

    const portal = TICKET_SUMMARY.portalUrl || "https://sacs.sdpondemand.manageengine.com/app/itdesk/ui/requests";
    linkEl.href = portal;

    if (TICKET_SUMMARY.total == null) {
      updatedEl.textContent = "Not connected to ManageEngine yet.";
      kpiEl.innerHTML = "";
      return;
    }

    updatedEl.textContent = TICKET_SUMMARY.updatedAt
      ? `Last synced ${new Date(TICKET_SUMMARY.updatedAt).toLocaleString()} · ${esc(TICKET_SUMMARY.source || "")}`
      : "";

    const closed = (TICKET_SUMMARY.total || 0) - (TICKET_SUMMARY.open || 0);
    kpiEl.innerHTML = [
      { value: TICKET_SUMMARY.total, label: "Total tickets" },
      { value: TICKET_SUMMARY.open, label: "Currently open" },
      { value: TICKET_SUMMARY.urgent, label: "Urgent &amp; open", urgent: true },
      { value: closed, label: "Closed / resolved" },
    ].map((k) => `
      <div class="kpi-tile">
        <div class="value"${k.urgent && k.value > 0 ? ' style="color:var(--status-critical)"' : ""}>${esc(Number(k.value || 0).toLocaleString())}</div>
        <div class="label">${k.label}</div>
      </div>`).join("");

    // Priority — same ordinal ramp and ordering as the Overview card.
    const prio = (TICKET_SUMMARY.byPriority || [])
      .map((p) => ({ value: p.value, label: p.label, rank: priorityRank(p.label) }))
      .sort((a, b) => a.rank - b.rank || b.value - a.value)
      .map((p) => ({
        value: p.value,
        label: String(p.label).split(":")[0].trim(),
        title: p.label,
        color: PRIORITY_RANK_COLOR[p.rank] || "var(--prio-none)",
      }));
    document.getElementById("ticket-priority-donut").innerHTML = prio.length
      ? donutSvg(prio, { size: 148, centerValue: TICKET_SUMMARY.open, centerLabel: "open" })
      : "";
    document.getElementById("ticket-priority-legend").innerHTML = legendHtml(prio);

    document.getElementById("ticket-status-bars").innerHTML =
      barListHtml(TICKET_SUMMARY.byStatus || [], "var(--layer-core)");

    const cats = TICKET_SUMMARY.byCategory || [];
    document.getElementById("ticket-category-bars").innerHTML = cats.length
      ? barListHtml(cats, "var(--layer-access)")
      : `<p class="muted-text" style="margin:0">No category breakdown in the last sync — re-run the
         sync workflow to populate it.</p>`;

    renderTicketMatrix();
    renderTicketList();
  }

  // Sentinel for the "no priority set" filter option. Must not begin or end
  // with whitespace — that is normalised away in an option value.
  const TICKET_NO_PRIORITY = "__unassigned__";

  function ticketAgeLabel(ms) {
    if (!ms) return "—";
    const days = Math.floor((Date.now() - Number(ms)) / 86400000);
    if (days < 0) return "—";
    if (days === 0) return "today";
    if (days === 1) return "1 day";
    if (days < 31) return `${days} days`;
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month" : `${months} months`;
  }

  function renderTicketList() {
    const body = document.getElementById("ticket-list-body");
    const countEl = document.getElementById("ticket-list-count");
    const rows = TICKET_SUMMARY.recentOpen || [];
    const portal = (TICKET_SUMMARY.portalUrl || "").replace(/\/requests\/?$/, "");

    if (!rows.length) {
      body.innerHTML = `<tr><td class="note" colspan="8">No ticket list in the last sync — re-run the sync workflow to populate it.</td></tr>`;
      countEl.textContent = "";
      return;
    }

    const search = (document.getElementById("ticket-list-search").value || "").toLowerCase();
    const prioFilter = document.getElementById("ticket-list-priority").value;
    const statusFilter = document.getElementById("ticket-list-status").value;

    const filtered = rows.filter((r) => {
      // Tickets with no priority render as "Unassigned", so that has to be
      // selectable too — otherwise those rows are visible but unfilterable.
      if (prioFilter === TICKET_NO_PRIORITY) {
        if (r.priority) return false;
      } else if (prioFilter !== "all" && r.priority !== prioFilter) {
        return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!search) return true;
      return [r.id, r.category, r.status, r.priority]
        .filter(Boolean).join(" ").toLowerCase().includes(search);
    });

    countEl.textContent = `${filtered.length} of ${rows.length} shown · newest first · subjects intentionally omitted`;

    body.innerHTML = filtered.map((r) => {
      const rank = priorityRank(r.priority);
      const color = PRIORITY_RANK_COLOR[rank] || "var(--prio-none)";
      const shortPrio = String(r.priority || "Unassigned").split(":")[0].trim();
      const created = r.created ? new Date(Number(r.created)).toLocaleDateString() : "—";
      const due = r.dueBy ? new Date(Number(r.dueBy)).toLocaleDateString() : "—";
      const overdue = r.dueBy && Number(r.dueBy) < Date.now();
      const href = portal ? `${portal}/requests/${encodeURIComponent(r.id)}` : "#";
      return `<tr>
        <td><span class="badge" title="${esc(r.priority || "")}"><span class="swatch" style="background:${color}"></span>${esc(shortPrio)}</span></td>
        <td class="name">#${esc(r.id)}</td>
        <td>${esc(r.status || "—")}</td>
        <td class="note">${esc(r.category || "—")}</td>
        <td class="ip">${esc(created)}</td>
        <td class="ip">${esc(ticketAgeLabel(r.created))}</td>
        <td class="ip"${overdue ? ' style="color:var(--status-critical);font-weight:600"' : ""}>${esc(due)}</td>
        <td><a class="doc-row-icon" href="${esc(href)}" target="_blank" rel="noopener" title="Open ticket in ManageEngine"><svg class="icon"><use href="#icon-external"/></svg></a></td>
      </tr>`;
    }).join("");
  }

  function initTicketListFilters() {
    const rows = TICKET_SUMMARY.recentOpen || [];
    const prioSel = document.getElementById("ticket-list-priority");
    const statusSel = document.getElementById("ticket-list-status");
    if (!prioSel || !statusSel) return;

    [...new Set(rows.map((r) => r.priority).filter(Boolean))]
      .sort((a, b) => priorityRank(a) - priorityRank(b))
      .forEach((p) => prioSel.insertAdjacentHTML("beforeend", `<option value="${esc(p)}">${esc(p)}</option>`));
    if (rows.some((r) => !r.priority)) {
      prioSel.insertAdjacentHTML("beforeend", `<option value="${TICKET_NO_PRIORITY}">Unassigned</option>`);
    }
    [...new Set(rows.map((r) => r.status).filter(Boolean))].sort()
      .forEach((s) => statusSel.insertAdjacentHTML("beforeend", `<option value="${esc(s)}">${esc(s)}</option>`));

    ["ticket-list-search", "ticket-list-priority", "ticket-list-status"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", renderTicketList);
    });
  }

  // Priority columns are ordered by severity; cells shade with their share of
  // the busiest cell so the hotspots are findable at a glance.
  function renderTicketMatrix() {
    const head = document.getElementById("ticket-matrix-head");
    const body = document.getElementById("ticket-matrix-body");
    const matrix = TICKET_SUMMARY.openMatrix || [];

    if (!matrix.length) {
      head.innerHTML = "";
      body.innerHTML = `<tr><td class="note">No status/priority breakdown in the last sync — re-run the sync workflow to populate it.</td></tr>`;
      return;
    }

    const cols = (matrix[0].cells || [])
      .map((c) => c.label)
      .sort((a, b) => priorityRank(a) - priorityRank(b));

    const max = Math.max(1, ...matrix.flatMap((r) => (r.cells || []).map((c) => c.value)));

    head.innerHTML = `<th>Status</th>` +
      cols.map((c) => `<th title="${esc(c)}">${esc(String(c).split(":")[0].trim())}</th>`).join("") +
      `<th>Total</th>`;

    body.innerHTML = matrix.map((row) => {
      const byLabel = Object.fromEntries((row.cells || []).map((c) => [c.label, c.value]));
      const total = (row.cells || []).reduce((s, c) => s + c.value, 0);
      const cells = cols.map((c) => {
        const v = byLabel[c] || 0;
        const shade = v === 0 ? 0 : 0.12 + 0.5 * (v / max);
        return `<td class="matrix-cell" style="background:rgba(var(--layer-core-rgb), ${shade.toFixed(3)})">${v ? esc(v) : "—"}</td>`;
      }).join("");
      return `<tr><td class="name">${esc(row.status)}</td>${cells}<td class="matrix-total">${esc(total)}</td></tr>`;
    }).join("");
  }

  // Only the licence donut survives on the v2 overview; the other glance
  // cards were folded into the campus cards and shared-infrastructure tiles.
  // renderKpis went with them — its target element no longer exists.
  function renderGlance() {
    const donut = document.getElementById("glance-license-donut");
    const legend = document.getElementById("glance-license-legend");
    if (!donut || !legend) return;

    const statusOrder = ["critical", "warning", "unknown", "good"];
    const statusCounts = statusOrder.map((k) => ({
      value: LICENSES.filter((l) => licenseStatus(l) === k).length,
      label: LICENSE_STATUS_LABEL[k],
      color: { critical: "var(--status-critical)", warning: "var(--status-warning)",
               unknown: "var(--status-unknown)", good: "var(--status-good)" }[k],
    }));
    const total = statusCounts.reduce((a, b) => a + b.value, 0);

    donut.innerHTML = donutSvg(statusCounts, { centerLabel: "licenses" });
    // Percentages beside the counts, so the split reads without arithmetic.
    legend.innerHTML = statusCounts.map((i) => `
      <div class="legend-row-item">
        <span class="swatch" style="background:${i.color}"></span>
        <span class="legend-row-label">${esc(i.label)}</span>
        <span class="legend-value">${esc(i.value)}<span class="pct-cell">${total ? ((i.value / total) * 100).toFixed(1) : "0.0"}%</span></span>
      </div>`).join("");
  }

  function gridLayout(devices, originX, originY, cols, nodeW, nodeH, gapX, gapY) {
    const pos = {};
    devices.forEach((d, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      pos[d.id] = {
        x: originX + col * (nodeW + gapX),
        y: originY + row * (nodeH + gapY),
        w: nodeW,
        h: nodeH,
      };
    });
    const rows = Math.ceil(devices.length / cols);
    return { pos, width: cols * nodeW + (cols - 1) * gapX, height: rows * nodeH + (rows - 1) * gapY };
  }

  // ---------------------------------------------------------------------
  // Interactive topology
  // ---------------------------------------------------------------------
  // The map is laid out once into world coordinates, then pan/zoom happens on
  // a single <g transform> — cheap, and it keeps hit-testing correct because
  // the browser transforms the geometry rather than us re-projecting it.
  const topoState = { scale: 1, tx: 0, ty: 0, selected: null, world: null };

  function topoNodes() {
    const core = DEVICES.filter((d) => d.layer === "core");
    const security = DEVICES.filter((d) => d.layer === "security");
    const sah = DEVICES.filter((d) => d.site === "SAH" && d.layer !== "core");
    const bbc = DEVICES.filter((d) => d.site === "BBC" && d.layer !== "core");
    return { core, security, sah, bbc };
  }

  function buildTopoWorld() {
    const { core, security, sah, bbc } = topoNodes();

    const nodeW = 148, nodeH = 44, gapX = 16, gapY = 14;
    const sahGrid = gridLayout(sah, 40, 320, 4, nodeW, nodeH, gapX, gapY);
    const bbcGrid = gridLayout(bbc, sahGrid.width + 40 + 70, 320, 3, nodeW, nodeH, gapX, gapY);
    const totalWidth = Math.max(sahGrid.width + 70 + bbcGrid.width + 80, 980);

    const pos = {};
    const coreW = 176, coreH = 52, coreGap = 32;
    const coreRowWidth = core.length * coreW + Math.max(0, core.length - 1) * coreGap;
    let cx = (totalWidth - coreRowWidth) / 2;
    core.forEach((d) => { pos[d.id] = { x: cx, y: 76, w: coreW, h: coreH }; cx += coreW + coreGap; });

    const secW = 176, secH = 48, secGap = 26;
    const secRowWidth = security.length * secW + Math.max(0, security.length - 1) * secGap;
    let sx = (totalWidth - secRowWidth) / 2;
    security.forEach((d) => { pos[d.id] = { x: sx, y: 190, w: secW, h: secH }; sx += secW + secGap; });

    Object.assign(pos, sahGrid.pos, bbcGrid.pos);

    const accessBottom = 320 + Math.max(sahGrid.height, bbcGrid.height);

    // Wireless clusters. Auvik does not tell us which switch each AP uplinks
    // to, so these are placed in their own band and deliberately drawn with no
    // links — inventing an uplink would be inventing topology.
    const wireless = (typeof WIRELESS !== "undefined" ? WIRELESS.bySite || [] : [])
      .filter((s) => s.label !== "Unassigned" || s.total > 0);
    const wirelessY = accessBottom + 56;
    const wW = 200, wH = 56, wGap = 28;
    const wRow = wireless.length * wW + Math.max(0, wireless.length - 1) * wGap;
    let wx = (totalWidth - wRow) / 2;
    wireless.forEach((s) => {
      pos[`ap:${s.label}`] = { x: wx, y: wirelessY, w: wW, h: wH };
      wx += wW + wGap;
    });

    const totalHeight = (wireless.length ? wirelessY + wH : accessBottom) + 50;

    const links = [];
    DEVICES.forEach((d) => {
      if (!d.uplink) return;
      const targets = Array.isArray(d.uplink.to) ? d.uplink.to : [d.uplink.to];
      targets.forEach((t) => {
        if (!pos[t] || !pos[d.id]) return;
        links.push({ from: d.id, to: t, speed: d.uplink.speedGbps, label: d.uplink.port });
      });
    });
    BACKBONE_LINKS.forEach((l) => {
      if (pos[l.from] && pos[l.to]) {
        links.push({ from: l.from, to: l.to, speed: l.speedGbps, label: l.label, backbone: true });
      }
    });

    return {
      pos, links, core, security, sah, bbc, wireless,
      totalWidth, totalHeight, coreRowWidth, secRowWidth,
      sahGridWidth: sahGrid.width, wirelessY,
    };
  }

  function topoNeighbours(id) {
    const w = topoState.world;
    const set = new Set([id]);
    w.links.forEach((l) => {
      if (l.from === id) set.add(l.to);
      if (l.to === id) set.add(l.from);
    });
    return set;
  }

  function renderTopology() {
    const stage = document.getElementById("topo-stage");
    if (!stage) return;
    const w = topoState.world || (topoState.world = buildTopoWorld());

    const site = document.getElementById("topo-site")?.value || "all";
    const layer = document.getElementById("topo-layer")?.value || "all";
    const showAps = document.getElementById("topo-show-aps")?.checked !== false;
    const query = (document.getElementById("topo-search")?.value || "").trim().toLowerCase();

    const visible = (d) => {
      if (site !== "all" && d.layer !== "core" && d.site !== site) return false;
      if (layer !== "all" && d.layer !== layer && !(layer === "access" && d.layer === "legacy")) return false;
      return true;
    };
    const shown = DEVICES.filter((d) => pos_has(w, d.id) && visible(d));
    const shownIds = new Set(shown.map((d) => d.id));

    const sel = topoState.selected;
    const near = sel && shownIds.has(sel) ? topoNeighbours(sel) : null;

    const widthFor = (speed) => (!speed ? 1.5 : Math.min(1.5 + Math.sqrt(speed) * 0.9, 8));
    const anchorTop = (p) => ({ x: p.x + p.w / 2, y: p.y });
    const anchorBottom = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h });
    const anchorCenter = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });

    const parts = [];
    parts.push(
      `<svg class="topology-svg" id="topo-svg" viewBox="0 0 ${w.totalWidth} ${w.totalHeight}" ` +
      `preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`
    );
    parts.push(`<g id="topo-viewport" transform="translate(${topoState.tx} ${topoState.ty}) scale(${topoState.scale})">`);

    function groupBox(list, labelY, rgbVar) {
      const items = list.filter((d) => shownIds.has(d.id));
      if (!items.length) return "";
      const xs = items.map((d) => w.pos[d.id].x);
      const xs2 = items.map((d) => w.pos[d.id].x + w.pos[d.id].w);
      const ys2 = items.map((d) => w.pos[d.id].y + w.pos[d.id].h);
      const pad = 16, top = labelY - 22;
      return `<rect class="topo-group" x="${Math.min(...xs) - pad}" y="${top}" width="${Math.max(...xs2) - Math.min(...xs) + pad * 2}" height="${Math.max(...ys2) - top + pad}" rx="16" fill="rgba(var(${rgbVar}), 0.07)" stroke="rgba(var(${rgbVar}), 0.22)"/>`;
    }
    parts.push(groupBox(w.core, 60, "--layer-core-rgb"));
    parts.push(groupBox(w.security, 175, "--layer-security-rgb"));
    parts.push(groupBox(w.sah, 310, "--layer-access-rgb"));
    parts.push(groupBox(w.bbc, 310, "--layer-access-rgb"));

    w.links.forEach((l) => {
      if (!shownIds.has(l.from) || !shownIds.has(l.to)) return;
      const a = w.pos[l.from], b = w.pos[l.to];
      const from = l.backbone ? anchorCenter(a) : anchorTop(a);
      const to = l.backbone ? anchorCenter(b) : anchorBottom(b);
      const midY = (from.y + to.y) / 2;
      const touches = near && (near.has(l.from) && near.has(l.to));
      const cls = ["topo-link"];
      if (near) cls.push(touches ? "hi" : "dim");
      parts.push(
        `<path class="${cls.join(" ")}" d="M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}" ` +
        `stroke-width="${widthFor(l.speed).toFixed(1)}"><title>${esc(l.label || "")} — ${esc(l.speed)}G</title></path>`
      );
    });

    function nodeSvg(d) {
      const p = w.pos[d.id];
      const color = LAYER_COLOR[d.layer] || "var(--baseline)";
      const status = deviceStatus(d.id);
      const cls = ["topo-node"];
      if (sel === d.id) cls.push("sel");
      else if (near) cls.push(near.has(d.id) ? "hi" : "dim");
      if (query && !`${d.name} ${d.ip || ""} ${d.model || ""}`.toLowerCase().includes(query)) cls.push("nomatch");
      else if (query) cls.push("match");
      return `
        <g class="${cls.join(" ")}" data-id="${esc(d.id)}" tabindex="0" role="button" aria-label="${esc(d.name)}">
          <rect class="topo-node-bg" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="9" fill="var(--surface-3)" stroke="${color}"/>
          <rect x="${p.x}" y="${p.y}" width="4" height="${p.h}" rx="2" fill="${color}"/>
          <circle class="status-dot-${status}" cx="${p.x + p.w - 11}" cy="${p.y + 11}" r="4.5"/>
          <text x="${p.x + 13}" y="${p.y + 19}">${esc(d.name)}</text>
          <text class="sub" x="${p.x + 13}" y="${p.y + 34}">${esc(d.ip || d.model || "")}</text>
        </g>`;
    }
    shown.forEach((d) => parts.push(nodeSvg(d)));

    if (showAps && w.wireless.length) {
      w.wireless.forEach((s) => {
        if (site !== "all" && s.label !== site) return;
        const p = w.pos[`ap:${s.label}`];
        const down = s.down || 0;
        const status = down > 0 ? "down" : s.up > 0 ? "up" : "unknown";
        const cls = ["topo-node", "topo-ap"];
        if (sel === `ap:${s.label}`) cls.push("sel");
        else if (near) cls.push("dim");
        parts.push(`
          <g class="${cls.join(" ")}" data-id="ap:${esc(s.label)}" tabindex="0" role="button" aria-label="${esc(s.label)} wireless">
            <rect class="topo-node-bg" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="9" fill="var(--surface-3)" stroke="var(--layer-access)" stroke-dasharray="4 3"/>
            <circle class="status-dot-${status}" cx="${p.x + p.w - 12}" cy="${p.y + 12}" r="4.5"/>
            <text x="${p.x + 14}" y="${p.y + 22}">${esc(s.label)} wireless</text>
            <text class="sub" x="${p.x + 14}" y="${p.y + 40}">${esc(s.total)} AP${s.total === 1 ? "" : "s"} · ${esc(s.up)} up${down ? ` · ${esc(down)} down` : ""}</text>
          </g>`);
      });
      parts.push(`<text class="topo-group-label" x="40" y="${w.wirelessY - 14}">Wireless — uplinks not modelled</text>`);
    }

    if (shown.some((d) => w.core.includes(d))) parts.push(`<text class="topo-group-label" x="${(w.totalWidth - w.coreRowWidth) / 2}" y="60">Core Layer</text>`);
    if (shown.some((d) => w.security.includes(d))) parts.push(`<text class="topo-group-label" x="${(w.totalWidth - w.secRowWidth) / 2}" y="175">Security / Firewall</text>`);
    if (shown.some((d) => w.sah.includes(d))) parts.push(`<text class="topo-group-label" x="40" y="310">SAH Access &amp; Distribution</text>`);
    if (shown.some((d) => w.bbc.includes(d))) parts.push(`<text class="topo-group-label" x="${w.sahGridWidth + 110}" y="310">BBC Access &amp; Distribution</text>`);

    parts.push("</g></svg>");
    stage.innerHTML = parts.join("\n");

    const sub = document.getElementById("topo-subtitle");
    if (sub) {
      const hidden = DEVICES.length - shown.length;
      sub.textContent = hidden
        ? `Drag to pan, scroll to zoom, click a device for detail. ${shown.length} of ${DEVICES.length} devices shown — ${hidden} filtered out.`
        : "Drag to pan, scroll to zoom, click a device for detail.";
    }

    renderTopoInspector();
  }

  function pos_has(world, id) { return Object.prototype.hasOwnProperty.call(world.pos, id); }

  function renderTopoInspector() {
    const el = document.getElementById("topo-inspector");
    if (!el) return;
    const id = topoState.selected;

    if (!id) {
      el.innerHTML = `<p class="muted-text" style="margin:0">Select a device to see its detail, uplinks and live status.</p>`;
      return;
    }

    if (id.startsWith("ap:")) {
      const site = id.slice(3);
      const s = (typeof WIRELESS !== "undefined" ? WIRELESS.bySite || [] : []).find((x) => x.label === site);
      const aps = (typeof WIRELESS !== "undefined" ? WIRELESS.aps || [] : []).filter((a) => a.site === site);
      const down = aps.filter((a) => a.status === "down");
      el.innerHTML = `
        <h3>${esc(site)} wireless</h3>
        <dl class="topo-dl">
          <dt>Access points</dt><dd>${esc(s?.total ?? aps.length)}</dd>
          <dt>Up</dt><dd>${esc(s?.up ?? 0)}</dd>
          <dt>Down</dt><dd>${esc(s?.down ?? 0)}</dd>
        </dl>
        ${down.length ? `<h4>Currently down</h4><ul class="topo-list">${down.slice(0, 20).map((a) => `<li>${esc(a.name)}<span class="muted-text"> ${esc(a.model || "")}</span></li>`).join("")}</ul>` : `<p class="muted-text">No APs are reporting down.</p>`}
        <p class="muted-text" style="margin-bottom:0">Auvik does not report which switch each AP uplinks to, so no link is drawn from this cluster.</p>`;
      return;
    }

    const d = DEVICES.find((x) => x.id === id);
    if (!d) { el.innerHTML = ""; return; }
    const status = deviceStatus(d.id);
    const live = (DEVICE_STATUS.devices || {})[d.id] || {};
    const w = topoState.world;
    const up = w.links.filter((l) => l.from === d.id);
    const dn = w.links.filter((l) => l.to === d.id);
    const nameOf = (nid) => DEVICES.find((x) => x.id === nid)?.name || nid;

    el.innerHTML = `
      <h3>${esc(d.name)}</h3>
      <p class="topo-status"><span class="dot status-dot-${status}"></span>${esc(STATUS_LABEL[status] || "Unknown")}</p>
      <dl class="topo-dl">
        ${d.ip ? `<dt>IP</dt><dd>${esc(d.ip)}</dd>` : ""}
        ${d.site ? `<dt>Site</dt><dd>${esc(d.site)}</dd>` : ""}
        ${d.layer ? `<dt>Layer</dt><dd>${esc(d.layer)}</dd>` : ""}
        ${live.model || d.model ? `<dt>Model</dt><dd>${esc(live.model || d.model)}</dd>` : ""}
        ${live.vendor ? `<dt>Vendor</dt><dd>${esc(live.vendor)}</dd>` : ""}
        ${live.firmware ? `<dt>Firmware</dt><dd>${esc(live.firmware)}</dd>` : ""}
        ${live.lastSeen ? `<dt>Last seen</dt><dd>${esc(new Date(live.lastSeen).toLocaleString())}</dd>` : ""}
      </dl>
      ${up.length ? `<h4>Uplinks to</h4><ul class="topo-list">${up.map((l) => `<li>${esc(nameOf(l.to))}<span class="muted-text"> ${esc(l.speed)}G${l.label ? " · " + esc(l.label) : ""}</span></li>`).join("")}</ul>` : ""}
      ${dn.length ? `<h4>Downlinks from</h4><ul class="topo-list">${dn.map((l) => `<li>${esc(nameOf(l.from))}<span class="muted-text"> ${esc(l.speed)}G</span></li>`).join("")}</ul>` : ""}
      ${d.note ? `<p class="muted-text">${esc(d.note)}</p>` : ""}`;
  }

  function initTopology() {
    const stage = document.getElementById("topo-stage");
    if (!stage) return;

    const clamp = (v) => Math.min(4, Math.max(0.35, v));

    // Zoom toward the cursor: convert the pointer to world coordinates, scale,
    // then translate so that same world point stays under the pointer.
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const svg = document.getElementById("topo-svg");
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const px = ((e.clientX - r.left) / r.width) * vb.width;
      const py = ((e.clientY - r.top) / r.height) * vb.height;
      const next = clamp(topoState.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      topoState.tx = px - (px - topoState.tx) * (next / topoState.scale);
      topoState.ty = py - (py - topoState.ty) * (next / topoState.scale);
      topoState.scale = next;
      applyTopoTransform();
    }, { passive: false });

    let drag = null;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".topo-node")) return;
      drag = { x: e.clientX, y: e.clientY, tx: topoState.tx, ty: topoState.ty };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("grabbing");
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const svg = document.getElementById("topo-svg");
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      topoState.tx = drag.tx + (e.clientX - drag.x) * (vb.width / r.width);
      topoState.ty = drag.ty + (e.clientY - drag.y) * (vb.height / r.height);
      applyTopoTransform();
    });
    const endDrag = () => { drag = null; stage.classList.remove("grabbing"); };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    stage.addEventListener("click", (e) => {
      const node = e.target.closest(".topo-node");
      topoState.selected = node ? node.getAttribute("data-id") : null;
      renderTopology();
    });
    stage.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const node = e.target.closest(".topo-node");
      if (!node) return;
      e.preventDefault();
      topoState.selected = node.getAttribute("data-id");
      renderTopology();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && topoState.selected) { topoState.selected = null; renderTopology(); }
    });

    const zoomBy = (f) => {
      const svg = document.getElementById("topo-svg");
      if (!svg) return;
      const vb = svg.viewBox.baseVal;
      const cxw = vb.width / 2, cyw = vb.height / 2;
      const next = clamp(topoState.scale * f);
      topoState.tx = cxw - (cxw - topoState.tx) * (next / topoState.scale);
      topoState.ty = cyw - (cyw - topoState.ty) * (next / topoState.scale);
      topoState.scale = next;
      applyTopoTransform();
    };
    document.getElementById("topo-zoom-in")?.addEventListener("click", () => zoomBy(1.25));
    document.getElementById("topo-zoom-out")?.addEventListener("click", () => zoomBy(1 / 1.25));
    document.getElementById("topo-reset")?.addEventListener("click", () => {
      topoState.scale = 1; topoState.tx = 0; topoState.ty = 0; topoState.selected = null;
      renderTopology();
    });

    ["topo-site", "topo-layer", "topo-show-aps"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", renderTopology);
    });
    document.getElementById("topo-search")?.addEventListener("input", renderTopology);
  }

  function applyTopoTransform() {
    const g = document.getElementById("topo-viewport");
    if (g) g.setAttribute("transform", `translate(${topoState.tx} ${topoState.ty}) scale(${topoState.scale})`);
  }

  // ---------------------------------------------------------------------
  // Device table
  // ---------------------------------------------------------------------
  function renderDeviceTable() {
    const search = document.getElementById("device-search");
    const siteFilter = document.getElementById("device-site-filter");
    const layerFilter = document.getElementById("device-layer-filter");
    const tbody = document.getElementById("device-table-body");
    const countEl = document.getElementById("device-count");

    function draw() {
      const q = search.value.trim().toLowerCase();
      const site = siteFilter.value;
      const layer = layerFilter.value;
      const rows = DEVICES.filter((d) => {
        if (site !== "all" && d.site !== site) return false;
        if (layer !== "all" && d.layer !== layer) return false;
        if (!q) return true;
        return [d.name, d.ip, d.model, d.note].filter(Boolean).join(" ").toLowerCase().includes(q);
      });
      countEl.textContent = `${rows.length} of ${DEVICES.length} devices`;
      tbody.innerHTML = rows.map((d) => {
        const status = deviceStatus(d.id);
        const uplink = d.uplink
          ? `${(Array.isArray(d.uplink.to) ? d.uplink.to.map((t) => (DEVICES.find((x) => x.id === t) || {}).name || t).join(" / ") : (DEVICES.find((x) => x.id === d.uplink.to) || {}).name || d.uplink.to)} · ${esc(d.uplink.port || "")} · ${esc(d.uplink.speedGbps)}G`
          : "—";
        return `
          <tr>
            <td class="name">${esc(d.name)}</td>
            <td>${esc(d.model || "—")}</td>
            <td>${esc(d.site)}</td>
            <td><span class="badge" style="border-color: ${LAYER_COLOR[d.layer]}; color: ${LAYER_COLOR[d.layer]}"><span class="dot" style="background:${LAYER_COLOR[d.layer]}"></span>${esc(LAYER_LABEL[d.layer])}</span></td>
            <td class="ip">${esc(d.ip || "—")}</td>
            <td class="port">${uplink}</td>
            <td><span class="badge"><span class="dot status-dot-${status}" style="background:currentColor"></span>${esc(STATUS_LABEL[status])}</span></td>
            <td class="note">${esc(d.note || "")}</td>
          </tr>`;
      }).join("") || `<tr><td colspan="8" style="color:var(--text-muted)">No devices match.</td></tr>`;
    }

    search.addEventListener("input", draw);
    siteFilter.addEventListener("change", draw);
    layerFilter.addEventListener("change", draw);
    draw();
  }

  // ---------------------------------------------------------------------
  // Hosts & Systems
  // ---------------------------------------------------------------------
  function hostName(id) {
    const h = HOSTS.find((x) => x.id === id);
    return h ? h.name : id;
  }

  function renderHosts() {
    const tbody = document.getElementById("hosts-table-body");
    tbody.innerHTML = HOSTS.map((h) => `
      <tr>
        <td class="name">${esc(h.name)}</td>
        <td>${esc(h.role)}</td>
        <td class="ip">${esc(h.ip || "—")}</td>
        <td>${esc(h.os || "—")}</td>
        <td class="note">${esc(h.hostedOn ? hostName(h.hostedOn) : "—")}</td>
        <td class="note">${esc(h.redundancy || "—")}</td>
        <td class="note">${esc(h.note || "")}</td>
      </tr>
    `).join("");
  }

  // ---------------------------------------------------------------------
  // Licenses
  // ---------------------------------------------------------------------
  function licenseStatus(lic) {
    if (!lic.expiresOn) return lic.status || "unknown";
    const days = (new Date(lic.expiresOn) - Date.now()) / 86400000;
    if (days < 0) return "critical";
    if (days < 14) return "critical";
    if (days < 45) return "warning";
    return "good";
  }

  function daysRemainingLabel(lic) {
    if (!lic.expiresOn) return "Unknown";
    const days = Math.floor((new Date(lic.expiresOn) - Date.now()) / 86400000);
    if (days < 0) return `Expired ${esc(Math.abs(days))}d ago`;
    return `${esc(lic.expiresOn)} (${days}d)`;
  }

  function renderLicenses() {
    const kpiEl = document.getElementById("license-kpi-row");
    const critical = LICENSES.filter((l) => licenseStatus(l) === "critical").length;
    const warning = LICENSES.filter((l) => licenseStatus(l) === "warning").length;
    const unknown = LICENSES.filter((l) => licenseStatus(l) === "unknown").length;
    const good = LICENSES.filter((l) => licenseStatus(l) === "good").length;
    kpiEl.innerHTML = [
      { label: "Needs immediate action", value: critical, color: "var(--status-critical)" },
      { label: "Expiring soon", value: warning, color: "var(--status-warning)" },
      { label: "Needs audit", value: unknown, color: "var(--status-unknown)" },
      { label: "Confirmed OK", value: good, color: "var(--status-good)" },
    ].map((t) => `
      <div class="kpi-tile">
        <div class="value" style="color:${t.color}">${esc(t.value)}</div>
        <div class="label">${esc(t.label)}</div>
      </div>
    `).join("");

    const order = { critical: 0, warning: 1, unknown: 2, good: 3 };
    const rows = LICENSES.slice().sort((a, b) => order[licenseStatus(a)] - order[licenseStatus(b)]);

    document.getElementById("license-table-body").innerHTML = rows.map((l) => {
      const status = licenseStatus(l);
      const asHost = HOSTS.find((h) => h.id === l.host);
      const asDevice = DEVICES.find((d) => d.id === l.host);
      const systemName = asHost ? asHost.name : (asDevice ? asDevice.name : l.host);
      return `
        <tr>
          <td class="name">${esc(systemName)}</td>
          <td class="note">${esc(l.product)}</td>
          <td>${esc(l.kind)}</td>
          <td class="note">${esc(l.licenseType)}</td>
          <td class="ip">${daysRemainingLabel(l)}</td>
          <td><span class="badge"><span class="dot status-dot-${status}" style="background:currentColor"></span>${esc(LICENSE_STATUS_LABEL[status] || status)}</span></td>
          <td class="note">${esc(l.note || "")}</td>
        </tr>`;
    }).join("");
  }

  // ---------------------------------------------------------------------
  // VLANs
  // ---------------------------------------------------------------------
  function renderVlans() {
    const search = document.getElementById("vlan-search");
    const statusFilter = document.getElementById("vlan-status-filter");
    const auditFilter = document.getElementById("vlan-audit-filter");
    const tbody = document.getElementById("vlan-table-body");
    const countEl = document.getElementById("vlan-count");

    const audits = Array.from(new Set(VLANS.map((v) => v.auditStatus).filter(Boolean))).sort();
    auditFilter.innerHTML = `<option value="all">All audit statuses</option>` +
      audits.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("");

    function draw() {
      const q = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const audit = auditFilter.value;
      const rows = VLANS.filter((v) => {
        if (status !== "all" && v.status !== status) return false;
        if (audit !== "all" && v.auditStatus !== audit) return false;
        if (!q) return true;
        return [v.vlan, v.name, v.subnet, v.owner, v.purpose].filter((x) => x != null).join(" ").toLowerCase().includes(q);
      });
      countEl.textContent = `${rows.length} of ${VLANS.length} VLANs`;
      tbody.innerHTML = rows.map((v) => `
        <tr>
          <td class="ip">${esc(v.vlan)}</td>
          <td class="name">${esc(v.name)}</td>
          <td class="ip">${esc(v.subnet || "—")}</td>
          <td class="ip">${esc(v.gateway || "—")}</td>
          <td>${esc(v.vrf || "—")}</td>
          <td><span class="badge"><span class="dot status-dot-${v.status === "up" ? "good" : "critical"}" style="background:currentColor"></span>${v.status === "up" ? "Up" : "Down"}</span></td>
          <td class="note">${esc(v.purpose || "")}</td>
          <td class="note">${esc(v.owner || "—")}</td>
          <td class="note">${esc(v.auditStatus || "—")}</td>
          <td class="note">${esc(v.notes || "")}</td>
        </tr>`).join("") || `<tr><td colspan="10" style="color:var(--text-muted)">No VLANs match.</td></tr>`;
    }

    search.addEventListener("input", draw);
    statusFilter.addEventListener("change", draw);
    auditFilter.addEventListener("change", draw);
    draw();
  }

  // ---------------------------------------------------------------------
  // Services
  // ---------------------------------------------------------------------
  function renderServices() {
    const search = document.getElementById("service-search");
    const critFilter = document.getElementById("service-criticality-filter");
    const tbody = document.getElementById("service-table-body");
    const countEl = document.getElementById("service-count");

    function draw() {
      const q = search.value.trim().toLowerCase();
      const crit = critFilter.value;
      const rows = SERVICES.filter((s) => {
        if (crit !== "all" && s.criticality !== crit) return false;
        if (!q) return true;
        return [s.service, s.hostname, s.ip, s.owner, s.purpose].filter((x) => x != null).join(" ").toLowerCase().includes(q);
      });
      countEl.textContent = `${rows.length} of ${SERVICES.length} services`;
      tbody.innerHTML = rows.map((s) => `
        <tr>
          <td class="name">${esc(s.service)}</td>
          <td class="ip">${esc(s.ip || "—")}</td>
          <td class="ip">${esc(s.vlan || "—")}</td>
          <td>${esc(s.deviceType || "—")}</td>
          <td class="note">${esc(s.purpose || "")}</td>
          <td class="note">${esc(s.owner || "—")}</td>
          <td>${esc(s.criticality || "—")}</td>
          <td>${esc(s.internetFacing || "—")}</td>
          <td class="note">${esc(s.notes || "")}</td>
        </tr>`).join("") || `<tr><td colspan="9" style="color:var(--text-muted)">No services match.</td></tr>`;
    }

    search.addEventListener("input", draw);
    critFilter.addEventListener("change", draw);
    draw();
  }

  // ---------------------------------------------------------------------
  // CCTV
  // ---------------------------------------------------------------------
  function renderCctv() {
    const s = CCTV_SUMMARY;
    document.getElementById("cctv-kpi-row").innerHTML = [
      { label: "Total cameras", value: s.totalCameras },
      { label: "Active (working)", value: s.activeCameras },
      { label: "SAH cameras", value: s.sahCameras },
      { label: "BBC cameras", value: s.bbcCameras },
      { label: "Proposed NVRs", value: s.newNvrs },
      { label: "On-prem usable (TB)", value: s.onPremUsableTb },
    ].map((t) => `
      <div class="kpi-tile">
        <div class="value">${esc(t.value)}</div>
        <div class="label">${esc(t.label)}</div>
      </div>
    `).join("");

    document.getElementById("cctv-platform-body").innerHTML = RECORDING_PLATFORM.map((p) => `
      <tr>
        <td class="name">${esc(p.instance)}</td>
        <td class="ip">${esc(p.ipDomain)}</td>
        <td>${esc(p.platform)}</td>
        <td class="note">${esc(p.runsOn)}</td>
        <td class="ip">${esc(p.port)}</td>
        <td class="ip">${esc(p.licensedChannels)}</td>
        <td><span class="badge"><span class="dot status-dot-${p.online === "Online" ? "good" : "critical"}" style="background:currentColor"></span>${esc(p.online)}</span></td>
        <td class="note">${esc(p.serial || "—")}</td>
      </tr>`).join("");

    document.getElementById("camera-models-body").innerHTML = CAMERA_MODELS.map((m) => `
      <tr>
        <td class="name">${esc(m.name)}</td>
        <td class="ip">${esc(m.dahuaModel || "—")}</td>
        <td class="note">${esc(m.type)}</td>
        <td class="ip">${esc(m.resolutionMp)}</td>
        <td class="ip">${esc(m.bitrateMbps)}</td>
        <td class="note">${esc(m.notes || "")}</td>
      </tr>`).join("");

    const search = document.getElementById("camera-search");
    const siteFilter = document.getElementById("camera-site-filter");
    const workingFilter = document.getElementById("camera-working-filter");
    const tbody = document.getElementById("camera-table-body");
    const countEl = document.getElementById("camera-count");

    function draw() {
      const q = search.value.trim().toLowerCase();
      const site = siteFilter.value;
      const working = workingFilter.value;
      const rows = CAMERAS.filter((c) => {
        if (site !== "all" && c.site !== site) return false;
        if (working === "Y" && c.working !== "Y") return false;
        if (working === "not" && c.working === "Y") return false;
        if (!q) return true;
        return [c.name, c.ip, c.room, c.location, c.area].filter((x) => x != null).join(" ").toLowerCase().includes(q);
      });
      countEl.textContent = `${rows.length} of ${CAMERAS.length} cameras`;
      tbody.innerHTML = rows.map((c) => `
        <tr>
          <td><span class="dot status-dot-${c.working === "Y" ? "good" : "unknown"}"></span></td>
          <td class="ip">${esc(c.camNo != null ? c.camNo : "—")}</td>
          <td class="name">${esc(c.name)}</td>
          <td>${esc(c.site)}</td>
          <td class="note">${esc(c.area || "—")}</td>
          <td class="ip">${esc(c.ip)}</td>
          <td>${esc(c.model || "—")}</td>
          <td class="note">${esc(c.switchPort || "—")}</td>
          <td class="ip">${esc(c.nvrChannel != null ? c.nvrChannel : "—")}</td>
          <td class="note">${esc(c.room || "—")}</td>
          <td class="note">${esc(c.location || "—")}</td>
        </tr>`).join("") || `<tr><td colspan="11" style="color:var(--text-muted)">No cameras match.</td></tr>`;
    }

    search.addEventListener("input", draw);
    siteFilter.addEventListener("change", draw);
    workingFilter.addEventListener("change", draw);
    draw();
  }

  // ---------------------------------------------------------------------
  // Critical infrastructure
  // ---------------------------------------------------------------------
  function renderCriticalInfra() {
    const el = document.getElementById("infra-grid");
    el.innerHTML = CRITICAL_INFRA.map((c) => `
      <div class="card infra-card">
        <h2>${esc(c.category)}</h2>
        <ul>
          ${c.items.map((i) => `<li><strong>${esc(i.name)}</strong> — ${esc(i.detail)}</li>`).join("")}
        </ul>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------------------
  // Port summary
  // ---------------------------------------------------------------------
  function renderPorts() {
    const el = document.getElementById("port-grid");
    el.innerHTML = PORT_SUMMARY.map((c) => `
      <div class="card port-card">
        <h2>${esc(c.category)}</h2>
        <ul>${c.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      </div>
    `).join("");

    document.getElementById("layer3-table-body").innerHTML = LAYER3_INTERFACES.map((i) => `
      <tr>
        <td class="name">${esc(i.iface)}</td>
        <td class="ip">${esc(i.ip || "—")}</td>
        <td>${esc(i.vrf || "—")}</td>
        <td><span class="badge"><span class="dot status-dot-${i.status === "up" ? "good" : "critical"}" style="background:currentColor"></span>${i.status === "up" ? "Up" : "Down"}</span></td>
        <td class="note">${esc(i.purpose || "")}</td>
      </tr>`).join("");
  }

  // ---------------------------------------------------------------------
  // Documentation index
  // ---------------------------------------------------------------------
  function renderDocs() {
    renderDocTree();

    const runbookEl = document.getElementById("runbooks");
    runbookEl.innerHTML = RUNBOOKS.map((r) => `
      <div class="card runbook-card">
        <h2>${esc(r.title)}</h2>
        <p class="muted-text">${esc(r.summary)}</p>
        <ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </div>
    `).join("");
  }

  const DOC_KIND_ICON = {
    folder: "icon-docs",
    page: "icon-arrow",
    link: "icon-external",
    doc: "icon-docs",
    pending: "icon-external",
  };

  // Renders DOC_TREE as a nested disclosure list. A filter matches a node if
  // the node itself matches or any descendant does, so a hit deep in a branch
  // still shows its path rather than appearing at the root with no context.
  function renderDocTree() {
    const mount = document.getElementById("doc-tree");
    if (!mount) return;
    const q = (document.getElementById("doc-search")?.value || "").trim().toLowerCase();

    const matches = (n) =>
      !q || `${n.name} ${n.desc || ""}`.toLowerCase().includes(q) || (n.children || []).some(matches);

    function nodeHtml(n, depth) {
      if (!matches(n)) return "";
      const kids = (n.children || []).filter(matches);
      const isFolder = n.kind === "folder";
      // A search should reveal what it found, so matching branches open even
      // if the user had collapsed them.
      const open = isFolder && (q ? true : n.open !== false);
      const icon = DOC_KIND_ICON[n.kind] || "icon-arrow";

      const label = `
        <span class="doc-node-text">
          <span class="doc-node-name">${esc(n.name)}</span>
          ${n.desc ? `<span class="doc-node-desc">${esc(n.desc)}</span>` : ""}
        </span>`;

      let row;
      if (isFolder) {
        row = `<button type="button" class="doc-node doc-node-folder" aria-expanded="${open}" data-toggle="1">
            <svg class="icon doc-chev"><use href="#icon-chevron"/></svg>
            <svg class="icon doc-kind"><use href="#${icon}"/></svg>
            ${label}
            ${n.href ? `<a class="doc-open" href="${esc(n.href)}" target="_blank" rel="noopener" title="Open in SharePoint"><svg class="icon"><use href="#icon-external"/></svg></a>` : ""}
          </button>`;
      } else if (n.panel) {
        row = `<button type="button" class="doc-node" data-panel="${esc(n.panel)}">
            <svg class="icon doc-kind"><use href="#${icon}"/></svg>${label}
          </button>`;
      } else {
        row = `<a class="doc-node" href="${esc(n.href || "#")}"${n.external ? ' target="_blank" rel="noopener"' : ""}>
            <svg class="icon doc-kind"><use href="#${icon}"/></svg>${label}
          </a>`;
      }

      return `<li class="doc-branch${n.kind === "pending" ? " doc-pending" : ""}" style="--depth:${depth}">
          ${row}
          ${kids.length ? `<ul class="doc-children"${open ? "" : " hidden"}>${kids.map((k) => nodeHtml(k, depth + 1)).join("")}</ul>` : ""}
        </li>`;
    }

    const html = DOC_TREE.map((n) => nodeHtml(n, 0)).join("");
    mount.innerHTML = html
      ? `<ul class="doc-root">${html}</ul>`
      : `<p class="muted-text" style="margin:0">Nothing matches that filter.</p>`;
  }

  function initDocTree() {
    const mount = document.getElementById("doc-tree");
    if (!mount) return;

    mount.addEventListener("click", (e) => {
      // The external-open affordance sits inside the folder button; let it
      // navigate instead of toggling the branch underneath it.
      if (e.target.closest(".doc-open")) { e.stopPropagation(); return; }
      const toggle = e.target.closest("[data-toggle]");
      if (!toggle) return;
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      const kids = toggle.parentElement.querySelector(".doc-children");
      if (kids) kids.hidden = open;
    });

    document.getElementById("doc-search")?.addEventListener("input", renderDocTree);
    const setAll = (open) => {
      mount.querySelectorAll("[data-toggle]").forEach((t) => {
        t.setAttribute("aria-expanded", String(open));
        const kids = t.parentElement.querySelector(".doc-children");
        if (kids) kids.hidden = !open;
      });
    };
    document.getElementById("doc-expand")?.addEventListener("click", () => setAll(true));
    document.getElementById("doc-collapse")?.addEventListener("click", () => setAll(false));
  }

  // ---------------------------------------------------------------------
  // Roadmap
  // ---------------------------------------------------------------------
  // "0–30 days", "30–90 days", "60–180 days" — parsed rather than hard-coded
  // so editing data/roadmap.js moves the bars without touching this file.
  function parseWindow(target) {
    const m = String(target || "").match(/(\d+)\s*[–-]\s*(\d+)/);
    if (m) return { start: Number(m[1]), end: Number(m[2]) };
    const single = String(target || "").match(/(\d+)/);
    return single ? { start: 0, end: Number(single[1]) } : null;
  }

  const ROADMAP_PRIORITY_COLOR = {
    1: "var(--prio-1)",
    2: "var(--prio-2)",
    3: "var(--prio-3)",
    4: "var(--prio-4)",
    5: "var(--prio-4)",
  };

  const PHASES = [
    { name: "Phase 1 — Stabilise & simplify", window: "0–90 days", detail: "Restore firewall HA, freeze and document the network, audit the DMZ stack, complete ClearPass." },
    { name: "Phase 2 — Modernise access", window: "60–180 days", detail: "Replace or uplift legacy 1G access uplinks on the priority switches." },
    { name: "Phase 3 — Reassess core", window: "2027–2028", detail: "Core Nexus pair remains adequate; revisit once the access layer and edge are settled." },
  ];

  function renderRoadmapTimeline() {
    const mount = document.getElementById("roadmap-timeline");
    if (!mount) return;

    const rows = ROADMAP_CRITICAL_ACTIONS
      .map((a) => ({ ...a, win: parseWindow(a.target) }))
      .filter((a) => a.win);

    if (!rows.length) {
      mount.innerHTML = `<p class="muted-text" style="margin:0">No dated actions in the roadmap data.</p>`;
      return;
    }

    const max = Math.max(...rows.map((r) => r.win.end));
    // Round the axis up to a sensible tick so the last bar is not flush with
    // the right edge and the gridlines land on readable numbers.
    const axisMax = Math.ceil(max / 30) * 30;
    const ticks = [];
    for (let d = 0; d <= axisMax; d += 30) ticks.push(d);

    const gridline = ticks
      .map((d) => `<div class="tl-gridline" style="left:${((d / axisMax) * 100).toFixed(2)}%"></div>`)
      .join("");

    mount.innerHTML = `
      <div class="tl-axis">
        ${ticks.map((d) => `<span class="tl-tick" style="left:${((d / axisMax) * 100).toFixed(2)}%">${d}d</span>`).join("")}
      </div>
      <div class="tl-rows">
        ${gridline}
        ${rows.map((r) => {
          const left = (r.win.start / axisMax) * 100;
          const width = Math.max(((r.win.end - r.win.start) / axisMax) * 100, 2);
          // Roadmap priorities are 1..n and are all real priorities — mapping
          // 5 through PRIORITY_RANK_COLOR would paint it the "unassigned" grey.
          const color = ROADMAP_PRIORITY_COLOR[Math.min(r.priority, 5)] || "var(--prio-4)";
          return `
            <div class="tl-row">
              <div class="tl-label">
                <span class="tl-prio" style="background:${color}">${esc(r.priority)}</span>
                <span class="tl-name">${esc(r.action)}</span>
              </div>
              <div class="tl-track">
                <div class="tl-bar" style="left:${left.toFixed(2)}%; width:${width.toFixed(2)}%; background:${color}"
                     title="${esc(r.action)} — ${esc(r.target)}">
                  <span class="tl-bar-text">${esc(r.target)}</span>
                </div>
              </div>
              <div class="tl-budget">${esc(r.budget)}</div>
            </div>`;
        }).join("")}
      </div>`;
  }

  function renderRoadmapPhases() {
    const mount = document.getElementById("roadmap-phases");
    if (!mount) return;
    mount.innerHTML = PHASES.map((p, i) => `
      <div class="phase-card">
        <div class="phase-step">${i + 1}</div>
        <div>
          <h3>${esc(p.name)}</h3>
          <p class="phase-window">${esc(p.window)}</p>
          <p class="muted-text" style="margin:0">${esc(p.detail)}</p>
        </div>
      </div>`).join("");
  }

  function renderRoadmapKpis() {
    const mount = document.getElementById("roadmap-kpi-row");
    if (!mount) return;
    const critical = ROADMAP_AREA_STATUS.filter((a) => a.status === "critical").length;
    const warning = ROADMAP_AREA_STATUS.filter((a) => a.status === "warning").length;
    mount.innerHTML = [
      { value: ROADMAP_CRITICAL_ACTIONS.length, label: "Critical actions" },
      { value: critical, label: "Areas at risk", urgent: true },
      { value: warning, label: "Areas needing work" },
      { value: ROADMAP_ACCESS_SWITCHES.length, label: "Switches to uplift" },
    ].map((k) => `
      <div class="kpi-tile">
        <div class="value"${k.urgent && k.value > 0 ? ' style="color:var(--status-critical)"' : ""}>${esc(k.value)}</div>
        <div class="label">${esc(k.label)}</div>
      </div>`).join("");
  }

  function renderRoadmap() {
    document.getElementById("roadmap-overall-position").textContent = ROADMAP_HEADER.overallPosition;
    document.getElementById("roadmap-immediate-decision").textContent = ROADMAP_HEADER.immediateDecision;
    document.getElementById("roadmap-budget").textContent = ROADMAP_HEADER.budget12mo;

    renderRoadmapKpis();
    renderRoadmapTimeline();
    renderRoadmapPhases();

    document.getElementById("roadmap-program-status-body").innerHTML = ROADMAP_PROGRAM_STATUS.map((p) => `
      <tr><td class="name">${esc(p.program)}</td><td class="note">${esc(p.status)}</td><td class="note">${esc(p.cost)}</td></tr>
    `).join("");

    document.getElementById("roadmap-area-status-body").innerHTML = ROADMAP_AREA_STATUS.map((a) => `
      <tr>
        <td class="name">${esc(a.area)}</td>
        <td><span class="badge"><span class="dot status-dot-${a.status}" style="background:currentColor"></span>${esc(a.status)}</span></td>
        <td class="note">${esc(a.message)}</td>
        <td class="note">${esc(a.action)}</td>
      </tr>`).join("");

    document.getElementById("roadmap-critical-actions-body").innerHTML = ROADMAP_CRITICAL_ACTIONS.map((c) => `
      <tr>
        <td class="ip">${esc(c.priority)}</td>
        <td class="name">${esc(c.action)}</td>
        <td class="note">${esc(c.why)}</td>
        <td class="note">${esc(c.budget)}</td>
        <td class="note">${esc(c.target)}</td>
      </tr>`).join("");

    document.getElementById("roadmap-deliverables-body").innerHTML = ROADMAP_DELIVERABLES.map((d) => `
      <tr><td class="name">${esc(d.deliverable)}</td><td class="note">${esc(d.outcome)}</td></tr>
    `).join("");

    document.getElementById("roadmap-access-switches-body").innerHTML = ROADMAP_ACCESS_SWITCHES.map((s) => `
      <tr><td class="name">${esc(s.item)}</td><td class="note">${esc(s.observation)}</td><td class="note">${esc(s.action)}</td><td class="ip">${esc(s.budget)}</td></tr>
    `).join("");

    document.getElementById("roadmap-pricing-refs-body").innerHTML = ROADMAP_PRICING_REFS.map((p) => `
      <tr><td class="name">${esc(p.item)}</td><td class="note">${esc(p.pricing)}</td><td class="note">${esc(p.use)}</td></tr>
    `).join("");

    document.getElementById("wifi-cert-design").textContent = WIFI_CERT_PROJECT.design;
    const wq = WIFI_CERT_PROJECT.quote;
    document.getElementById("wifi-cert-quote-body").innerHTML = `
      <tr><td class="name">Vendor</td><td class="note">${esc(wq.vendor)}</td></tr>
      <tr><td class="name">Quote ref</td><td class="note">${esc(wq.ref)}</td></tr>
      <tr><td class="name">Date</td><td class="note">${esc(wq.date)}</td></tr>
      <tr><td class="name">Scope</td><td class="note">${esc(wq.scope)}</td></tr>
      <tr><td class="name">Licensing</td><td class="note">${esc(wq.licensing)}</td></tr>
      <tr><td class="name">Total (ex tax)</td><td class="note">${esc(wq.totalExTax)}</td></tr>
      <tr><td class="name">Total (inc tax)</td><td class="note">${esc(wq.totalIncTax)}</td></tr>
    `;

    document.getElementById("firewall-ha-description").textContent = FIREWALL_HA_PROJECT.description;
    const fq = FIREWALL_HA_PROJECT.quote;
    document.getElementById("firewall-ha-quote-body").innerHTML = `
      <tr><td class="name">Vendor</td><td class="note">${esc(fq.vendor)}</td></tr>
      <tr><td class="name">Quote ref</td><td class="note">${esc(fq.ref)}</td></tr>
      <tr><td class="name">Date</td><td class="note">${esc(fq.date)}</td></tr>
      <tr><td class="name">Product</td><td class="note">${esc(fq.product)}</td></tr>
      <tr><td class="name">Term</td><td class="note">${esc(fq.term)}</td></tr>
      <tr><td class="name">Total (inc tax)</td><td class="note">${esc(fq.totalIncTax)}</td></tr>
      <tr><td class="name">Credit applied</td><td class="note">${esc(fq.credit)}</td></tr>
    `;

    document.getElementById("meraki-aruba-overview").textContent = MERAKI_ARUBA_MIGRATION.overview;
    document.getElementById("meraki-aruba-estate-body").innerHTML = MERAKI_ARUBA_MIGRATION.estate.map((e) => `
      <tr><td class="name">${esc(e.metric)}</td><td class="note">${esc(e.value)}</td></tr>
    `).join("");
    document.getElementById("meraki-aruba-timeline").innerHTML = MERAKI_ARUBA_MIGRATION.timeline.map((t) => `<li>${esc(t)}</li>`).join("");

    document.getElementById("roadmap-cleanup-stages-body").innerHTML = ROADMAP_CLEANUP_STAGES.map((s) => `
      <tr><td class="ip">${esc(s.stage)}</td><td class="name">${esc(s.work)}</td><td class="note">${esc(s.outcome)}</td><td class="note">${esc(s.risk)}</td></tr>
    `).join("");

    document.getElementById("roadmap-cleanup-areas-body").innerHTML = ROADMAP_CLEANUP_AREAS.map((a) => `
      <tr><td class="name">${esc(a.area)}</td><td class="note">${esc(a.action)}</td><td class="note">${esc(a.benefit)}</td></tr>
    `).join("");

    document.getElementById("roadmap-phases-body").innerHTML = ROADMAP_PHASES.map((p) => `
      <tr><td class="name">${esc(p.phase)}</td><td class="note">${esc(p.timeframe)}</td><td class="note">${esc(p.actions)}</td><td class="ip">${esc(p.budget)}</td></tr>
    `).join("");

    document.getElementById("roadmap-recommendations-body").innerHTML = ROADMAP_RECOMMENDATIONS.map((r) => `
      <tr><td class="name">${esc(r.recommendation)}</td><td class="note">${esc(r.decision)}</td></tr>
    `).join("");
  }

  // ---------------------------------------------------------------------
  // CNS roadmap notes (reference, from the source topology diagram)
  // ---------------------------------------------------------------------
  function renderCns() {
    const el = document.getElementById("cns-grid");
    el.innerHTML = CNS_NOTES.map((c) => `
      <div class="card cns-card">
        <h2>${esc(c.title)}</h2>
        <ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------------------
  // Wireless (Meraki APs discovered by Auvik)
  // ---------------------------------------------------------------------
  const WIFI = () => (typeof WIRELESS !== "undefined" ? WIRELESS : {});

  function renderWireless() {
    const sumEl = document.getElementById("wireless-summary");
    if (!sumEl) return;
    const W = WIFI();
    const fleet = W.fleet || {};
    const devices = fleet.devices || [];

    if (!devices.length) {
      sumEl.textContent = "No Meraki devices synced yet — run the Meraki sync workflow.";
      return;
    }

    const c = fleet.counts || {};
    sumEl.textContent =
      `${fleet.total} Meraki devices across ${(fleet.bySite || []).length} networks · ` +
      `last synced ${new Date(W.updatedAt).toLocaleString()} from ${W.source || "Meraki"}.`;

    document.getElementById("wireless-kpi-row").innerHTML = [
      { value: W.total, label: "Access points" },
      { value: (fleet.byKind || []).find((k) => k.label === "Switch")?.value || 0, label: "Switches" },
      { value: c.up || 0, label: "Online" },
      { value: c.warning || 0, label: "Alerting", urgent: true },
      { value: (c.down || 0) + (c.dormant || 0), label: "Offline or dormant" },
    ].map((k) => `
      <div class="kpi-tile">
        <div class="value"${k.urgent && k.value > 0 ? ' style="color:var(--status-warning)"' : ""}>${esc(Number(k.value || 0).toLocaleString())}</div>
        <div class="label">${esc(k.label)}</div>
      </div>`).join("");

    document.getElementById("wireless-site-bars").innerHTML = barListHtml(fleet.bySite || [], "var(--layer-access)");
    document.getElementById("wireless-model-bars").innerHTML = barListHtml((fleet.byModel || []).slice(0, 10), "var(--layer-core)");

    const kindSel = document.getElementById("wireless-kind-filter");
    if (kindSel && kindSel.options.length === 1) {
      (fleet.byKind || []).forEach((k) =>
        kindSel.insertAdjacentHTML("beforeend", `<option value="${esc(k.label)}">${esc(k.label)} (${esc(k.value)})</option>`));
    }
    const siteSel = document.getElementById("wireless-site-filter");
    if (siteSel && siteSel.options.length === 1) {
      (fleet.bySite || []).forEach((s) =>
        siteSel.insertAdjacentHTML("beforeend", `<option value="${esc(s.label)}">${esc(s.label)}</option>`));
    }
    renderWirelessTable();
  }

  function renderWirelessTable() {
    const body = document.getElementById("wireless-table-body");
    if (!body) return;
    const devices = (WIFI().fleet || {}).devices || [];
    const q = (document.getElementById("wireless-search")?.value || "").trim().toLowerCase();
    const kind = document.getElementById("wireless-kind-filter")?.value || "all";
    const site = document.getElementById("wireless-site-filter")?.value || "all";
    const status = document.getElementById("wireless-status-filter")?.value || "all";

    const rows = devices.filter((a) => {
      if (kind !== "all" && a.kind !== kind) return false;
      if (site !== "all" && a.site !== site) return false;
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      return `${a.name} ${a.model || ""} ${a.kind}`.toLowerCase().includes(q);
    });

    document.getElementById("wireless-count").textContent =
      rows.length === devices.length ? `${devices.length} devices` : `${rows.length} of ${devices.length} devices`;

    body.innerHTML = rows.length
      ? rows.map((a) => `
        <tr>
          <td>${esc(a.name)}</td>
          <td>${esc(a.kind)}</td>
          <td>${esc(a.site)}</td>
          <td>${esc(a.model || "—")}</td>
          <td><span class="dot status-dot-${esc(a.status)}"></span>${esc(STATUS_LABEL[a.status] || "Unknown")}</td>
          <td>${a.lastSeen ? esc(new Date(a.lastSeen).toLocaleString()) : "—"}</td>
        </tr>`).join("")
      : `<tr><td class="note" colspan="6">No Meraki devices match this filter.</td></tr>`;
  }

  function initWirelessFilters() {
    ["wireless-search", "wireless-kind-filter", "wireless-site-filter", "wireless-status-filter"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(el.tagName === "SELECT" ? "change" : "input", renderWirelessTable);
    });
  }

  // ---------------------------------------------------------------------
  // Security tickets (Arctic Wolf)
  // ---------------------------------------------------------------------
  // The queue ranks; it never suppresses. Every open ticket is rendered
  // regardless of score — the score only decides the order.
  //
  // No title or description reaches this file: see scripts/arcticwolf-tickets.js.
  const SEC = () => (typeof SECURITY_SUMMARY !== "undefined" ? SECURITY_SUMMARY : {});

  const AW_PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, NORMAL: 3, LOW: 4 };
  // Arctic Wolf issues HIGH / NORMAL / LOW here — there is no CRITICAL tier in
  // this tenant, so "needs attention" means HIGH, and CRITICAL is carried only
  // so the view still works if Arctic Wolf starts issuing it.
  const AW_ATTENTION = new Set(["CRITICAL", "HIGH"]);
  const AW_PRIORITY_COLOR = {
    CRITICAL: "var(--prio-1)",
    HIGH: "var(--prio-1)",
    MEDIUM: "var(--prio-2)",
    NORMAL: "var(--prio-3)",
    LOW: "var(--prio-4)",
  };

  function renderSecurity() {
    const updatedEl = document.getElementById("security-updated");
    if (!updatedEl) return;
    const S = SEC();

    if (S.total == null) {
      updatedEl.textContent = "Not connected to Arctic Wolf yet.";
      document.getElementById("security-kpi-row").innerHTML = "";
      return;
    }

    document.getElementById("security-portal-link").href = S.portalUrl || "https://dashboard.arcticwolf.com/";
    updatedEl.textContent = `Last synced ${new Date(S.updatedAt).toLocaleString()} · ${esc(S.source || "")}`;

    const queue = S.queue || [];
    const highOpen = queue.filter((q) => q.priority === "HIGH" || q.priority === "CRITICAL").length;
    const unassigned = queue.filter((q) => !q.assigned).length;

    document.getElementById("security-kpi-row").innerHTML = [
      { value: S.total, label: "Tickets all time" },
      { value: S.open, label: "Currently open" },
      { value: highOpen, label: "Open &amp; high priority", urgent: true },
      { value: unassigned, label: "Open, unassigned" },
    ].map((k) => `
      <div class="kpi-tile">
        <div class="value"${k.urgent && k.value > 0 ? ' style="color:var(--status-critical)"' : ""}>${esc(Number(k.value || 0).toLocaleString())}</div>
        <div class="label">${k.label}</div>
      </div>`).join("");

    document.getElementById("security-category-bars").innerHTML = (S.openByCategory || []).length
      ? barListHtml(S.openByCategory, "var(--layer-access)")
      : `<p class="muted-text" style="margin:0">No open security tickets.</p>`;

    const prio = (S.byPriority || []).slice().sort(
      (a, b) => (AW_PRIORITY_ORDER[a.label] ?? 9) - (AW_PRIORITY_ORDER[b.label] ?? 9)
    );
    document.getElementById("security-priority-bars").innerHTML = barListHtml(prio, "var(--layer-core)");

    renderSecurityQueue();
  }

  function renderSecurityQueue() {
    const body = document.getElementById("security-queue-body");
    const countEl = document.getElementById("security-queue-count");
    if (!body) return;
    const all = SEC().queue || [];

    if (!all.length) {
      body.innerHTML = `<tr><td class="note" colspan="8">Nothing open — the queue is clear.</td></tr>`;
      countEl.textContent = "";
      return;
    }

    const q = (document.getElementById("security-queue-search")?.value || "").trim().toLowerCase();
    const cat = document.getElementById("security-queue-category")?.value || "all";
    const prio = document.getElementById("security-queue-priority")?.value || "all";
    const view = document.getElementById("security-queue-view")?.value || "all";
    const noteEl = document.getElementById("security-queue-filter-note");

    const attention = all.filter((r) => AW_ATTENTION.has(r.priority));

    const rows = all.filter((r) => {
      if (view === "attention" && !AW_ATTENTION.has(r.priority)) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (prio !== "all" && r.priority !== prio) return false;
      if (!q) return true;
      return `${r.id} ${r.category} ${r.status}`.toLowerCase().includes(q);
    });

    // A view that hides things must say what it hid. Otherwise an empty
    // high-priority queue is indistinguishable from a broken filter.
    if (noteEl) {
      if (view === "attention") {
        noteEl.textContent = attention.length
          ? `Showing ${attention.length} high-priority of ${all.length} open. Switch to “Everything open” for the rest.`
          : `No high-priority tickets are open. ${all.length} ticket${all.length === 1 ? " is" : "s are"} open at lower priority — switch to “Everything open” to see them.`;
      } else {
        noteEl.textContent = "";
      }
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td class="note" colspan="8">Nothing matches this view.</td></tr>`;
      countEl.textContent = "";
      return;
    }

    countEl.textContent = rows.length === all.length
      ? `${all.length} open, most urgent first`
      : `${rows.length} of ${all.length} open`;

    const portal = (SEC().portalUrl || "https://dashboard.arcticwolf.com/").replace(/\/$/, "");

    body.innerHTML = rows.map((r) => {
      const created = r.createdAt ? Date.parse(r.createdAt) : null;
      const activity = [
        r.comments ? `${r.comments} comment${r.comments === 1 ? "" : "s"}` : null,
        r.attachments ? `${r.attachments} file${r.attachments === 1 ? "" : "s"}` : null,
      ].filter(Boolean).join(" · ") || "—";
      return `
      <tr>
        <td><span class="swatch" style="background:${AW_PRIORITY_COLOR[r.priority] || "var(--prio-none)"}"></span>${esc(r.priority)}</td>
        <td>#${esc(r.id)}${r.assigned ? "" : ` <span class="muted-text">unassigned</span>`}</td>
        <td>${esc(r.category)}</td>
        <td>${esc(r.status)}</td>
        <td>${created ? esc(new Date(created).toLocaleDateString()) : "—"}</td>
        <td>${esc(ticketAgeLabel(created))}</td>
        <td>${esc(activity)}</td>
        <td><a class="link-button" href="${esc(portal)}/tickets/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Open</a></td>
      </tr>`;
    }).join("");
  }

  function initSecurityQueueFilters() {
    const all = SEC().queue || [];
    const catSel = document.getElementById("security-queue-category");
    const prioSel = document.getElementById("security-queue-priority");
    if (!catSel || !prioSel) return;

    [...new Set(all.map((r) => r.category))].sort()
      .forEach((c) => catSel.insertAdjacentHTML("beforeend", `<option value="${esc(c)}">${esc(c)}</option>`));
    [...new Set(all.map((r) => r.priority))]
      .sort((a, b) => (AW_PRIORITY_ORDER[a] ?? 9) - (AW_PRIORITY_ORDER[b] ?? 9))
      .forEach((p) => prioSel.insertAdjacentHTML("beforeend", `<option value="${esc(p)}">${esc(p)}</option>`));

    ["security-queue-view", "security-queue-search", "security-queue-category", "security-queue-priority"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(el.tagName === "SELECT" ? "change" : "input", renderSecurityQueue);
    });
  }

  // ---------------------------------------------------------------------
  // Managed endpoints (NinjaOne)
  // ---------------------------------------------------------------------
  // Aggregates only — see the privacy note on the page. Two things about this
  // tenant shape the presentation:
  //
  //   1. NinjaOne "offline" means the agent has not checked in. Most of the
  //      estate is laptops, so a large offline count is normally powered-down
  //      machines, not an outage. It is labelled "not checked in" and split by
  //      staleness, because a laptop dark overnight and one dark for six weeks
  //      are different findings.
  //   2. Every alert here carries severity NONE, so severity ranks nothing.
  //      conditionName is what distinguishes them.
  const STALENESS_COLOR = {
    "Under 24 hours": "var(--prio-4)",
    "1–7 days": "var(--prio-3)",
    "7–30 days": "var(--prio-2)",
    "Over 30 days": "var(--prio-1)",
    "Never contacted": "var(--prio-none)",
  };

  function renderEndpoints() {
    const updatedEl = document.getElementById("endpoint-updated");
    const kpiEl = document.getElementById("endpoint-kpi-row");
    const linkEl = document.getElementById("endpoint-portal-link");
    if (!updatedEl) return;

    const S = typeof ENDPOINT_SUMMARY !== "undefined" ? ENDPOINT_SUMMARY : {};
    const dev = S.devices || {};
    const alerts = S.alerts || {};

    if (dev.total == null) {
      updatedEl.textContent = "Not connected to NinjaOne yet.";
      kpiEl.innerHTML = "";
      return;
    }

    linkEl.href = S.portalUrl || "https://app.ninjarmm.com/";
    updatedEl.textContent = S.updatedAt
      ? `Last synced ${new Date(S.updatedAt).toLocaleString()} · ${esc(S.source || "")}`
      : "";

    const stale = dev.byStaleness || [];
    // Only the buckets past a week are worth chasing; the rest is normal churn.
    const chaseable = stale
      .filter((b) => b.label === "7–30 days" || b.label === "Over 30 days" || b.label === "Never contacted")
      .reduce((n, b) => n + b.value, 0);

    kpiEl.innerHTML = [
      { value: dev.total, label: "Managed endpoints" },
      { value: dev.online, label: "Checked in recently" },
      { value: dev.notCheckedIn, label: "Not checked in" },
      { value: chaseable, label: "Dark over 7 days", urgent: true },
      { value: alerts.total, label: "Open alerts" },
    ].map((k) => `
      <div class="kpi-tile">
        <div class="value"${k.urgent && k.value > 0 ? ' style="color:var(--status-warning)"' : ""}>${esc(Number(k.value || 0).toLocaleString())}</div>
        <div class="label">${esc(k.label)}</div>
      </div>`).join("");

    document.getElementById("endpoint-class-bars").innerHTML =
      barListHtml(dev.byClass || [], "var(--layer-access)");

    document.getElementById("endpoint-staleness-note").textContent =
      `${Number(dev.notCheckedIn || 0).toLocaleString()} of ${Number(dev.total || 0).toLocaleString()} endpoints are not currently checked in. ` +
      "For a laptop estate that is mostly powered-down machines — the buckets " +
      "past a week are the ones worth chasing.";

    document.getElementById("endpoint-staleness-bars").innerHTML = stale.length
      ? stale.map((b) => `
          <div class="bar-row">
            <div class="bar-row-label">${esc(b.label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${((b.value / Math.max(...stale.map((x) => x.value), 1)) * 100).toFixed(1)}%; background:${STALENESS_COLOR[b.label] || "var(--prio-none)"}"></div></div>
            <div class="bar-row-value">${esc(b.value)}</div>
          </div>`).join("")
      : `<p class="muted-text" style="margin:0">Everything has checked in.</p>`;

    document.getElementById("endpoint-alert-note").textContent = alerts.severityUsable
      ? "Grouped by NinjaOne's alert condition."
      : "Every alert in this tenant is reported with severity NONE, so severity " +
        "cannot rank them — these are grouped by condition instead.";

    document.getElementById("endpoint-condition-bars").innerHTML = (alerts.byCondition || []).length
      ? barListHtml(alerts.byCondition, "var(--layer-core)")
      : `<p class="muted-text" style="margin:0">No open alerts.</p>`;
  }

  // ---------------------------------------------------------------------
  // Status banner
  // ---------------------------------------------------------------------
  function renderStatusBanner() {
    const el = document.getElementById("status-banner-text");
    const banner = el.closest(".status-banner");

    if (!DEVICE_STATUS.updatedAt) {
      el.innerHTML = `<strong>Live status is not wired up yet.</strong> Every device below shows "Unknown" until a poller populates <code>data/status.js</code> — see README.md.`;
      if (banner) banner.style.borderLeftColor = "var(--status-unknown)";
      return;
    }

    const entries = Object.values(DEVICE_STATUS.devices || {});
    const down = entries.filter((d) => d.status === "down").length;
    const warn = entries.filter((d) => d.status === "warning").length;
    const up = entries.filter((d) => d.status === "up").length;
    const when = new Date(DEVICE_STATUS.updatedAt).toLocaleString();

    // A device published here but absent from the poller is genuinely unknown,
    // so say so rather than letting it read as healthy.
    const notReporting = (DEVICE_STATUS.published || entries.length) - entries.length;

    let health = `<strong>${up} up</strong>`;
    if (warn) health += ` · <strong>${warn} warning</strong>`;
    if (down) health += ` · <strong>${down} down</strong>`;
    if (notReporting > 0) health += ` · ${notReporting} not reporting`;

    el.innerHTML = `${health} — live from <strong>${esc(DEVICE_STATUS.source || "poller")}</strong>, updated ${esc(when)}.`;
    if (banner) {
      banner.style.borderLeftColor = down
        ? "var(--status-critical)"
        : warn ? "var(--status-warning)" : "var(--status-good)";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initTheme();
    initLogout();
    renderStatusBanner();

    renderTickets();
    initTicketListFilters();
    renderTicketsPage();
    renderEndpoints();
    initSecurityQueueFilters();
    renderSecurity();
    renderHealthStrip();
    renderCampusCards();
    renderInfraTiles();
    renderGlance();
    initTopology();
    renderTopology();
    initWirelessFilters();
    renderWireless();
    renderDeviceTable();
    renderHosts();
    renderServices();
    renderLicenses();
    renderVlans();
    renderCctv();
    renderCriticalInfra();
    renderPorts();
    renderRoadmap();
    renderCns();
    initDocTree();
    renderDocs();
  });
})();
