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
    // No feed can reach the device, so this is a recorded human check rather
    // than a reading. Labelled to make that unmistakable — rendering it as
    // plain "Up" would claim a poll that never happened.
    attested: "Up (not polled)",
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

  const DEVICE_BY_ID = new Map(DEVICES.map((d) => [d.id, d]));

  function deviceStatus(id) {
    const entry = (DEVICE_STATUS && DEVICE_STATUS.devices && DEVICE_STATUS.devices[id]) || null;
    if (entry && entry.status) return entry.status;
    // A live reading always wins. Only when no feed has one does the recorded
    // human check stand in, and it stands in under its own status value so it
    // stays visibly distinct from a poll.
    if (DEVICE_BY_ID.get(id)?.attested) return "attested";
    return "unknown";
  }

  // Availability percentages must be built from devices something actually
  // polls. An attested device is neither a live "up" nor an unexplained
  // "unknown", so it is excluded from the denominator rather than quietly
  // inflating or deflating the number.
  const isPolled = (s) => s !== "unknown" && s !== "attested";

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
  function initAccountMenu() {
    const wrap = document.getElementById("account");
    const btn = document.getElementById("account-btn");
    const menu = document.getElementById("account-menu");
    if (!wrap || !btn || !menu) return;

    const setOpen = (open) => {
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      wrap.classList.toggle("open", open);
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    // Click-away and Escape both close it. A popover that only closes by
    // clicking its own button feels stuck.
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); }
    });

    document.getElementById("logout-button")?.addEventListener("click", () => {
      sessionStorage.removeItem("sacs-gate-ok");
      location.reload();
    });
  }

  // ---------------------------------------------------------------------
  // Theme — auto | light | dark
  // ---------------------------------------------------------------------
  // The stylesheet has no prefers-color-scheme rules; dark is reachable only
  // through :root[data-theme="dark"]. "Auto" is therefore resolved here and
  // re-resolved when the OS setting changes, rather than handed to CSS.
  const THEME_KEY = "sacs-theme";
  const systemDark = () =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

  function storedTheme() {
    const v = localStorage.getItem(THEME_KEY);
    // Anything unrecognised — including the plain "light"/"dark" written by
    // the previous two-state toggle — is still valid; only a missing value
    // falls back to auto.
    return v === "light" || v === "dark" || v === "auto" ? v : "auto";
  }

  function applyTheme(pref) {
    const resolved = pref === "auto" ? (systemDark() ? "dark" : "light") : pref;
    document.documentElement.setAttribute("data-theme", resolved);
    return resolved;
  }

  function initTheme() {
    const select = document.getElementById("theme-select");
    let pref = storedTheme();
    applyTheme(pref);
    if (select) select.value = pref;

    select?.addEventListener("change", () => {
      pref = select.value;
      localStorage.setItem(THEME_KEY, pref);
      applyTheme(pref);
      // Topology tints are baked into the SVG markup, so it is rebuilt on a
      // theme change. Listeners are bound once in initTopology, not here.
      renderTopology();
    });

    // Follow the OS while on auto. Without this, "Auto" would only mean
    // "whatever the OS was when the page loaded".
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const onSystemChange = () => {
      if (storedTheme() !== "auto") return;
      applyTheme("auto");
      renderTopology();
    };
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
      else if (mq.addListener) mq.addListener(onSystemChange);
    }
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

  // Single source of truth for how a health score reads. Everything that
  // colours a score — the overview ring, the campus pills, the gauges — comes
  // through here, so a number cannot be green in one place and amber in
  // another.
  function verdictFor(score) {
    if (score == null) return { word: "Unknown", tone: "unknown", color: "var(--status-unknown)" };
    if (score >= 90) return { word: "Excellent", tone: "good", color: "var(--status-good)" };
    if (score >= 75) return { word: "Good", tone: "good", color: "var(--status-good)" };
    if (score >= 50) return { word: "Fair", tone: "warning", color: "var(--status-warning)" };
    if (score >= 30) return { word: "Poor", tone: "serious", color: "var(--status-serious)" };
    return { word: "Needs attention", tone: "critical", color: "var(--status-critical)" };
  }

  function deviceStats(filterFn) {
    const list = DEVICES.filter(filterFn || (() => true));
    const known = list.filter((d) => isPolled(deviceStatus(d.id)));
    const up = list.filter((d) => deviceStatus(d.id) === "up").length;
    const attested = list.filter((d) => deviceStatus(d.id) === "attested").length;
    return { total: list.length, up, known: known.length, attested };
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
      const notReporting = dev.total - dev.known - dev.attested;
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

  // The overview no longer carries a ticket donut — only the header button
  // survives. Every element here is optional so this keeps working whichever
  // of them the page actually has.
  function renderTickets() {
    const labelEl = document.getElementById("ticket-button-label");
    const noteEl = document.getElementById("tickets-not-connected-note");
    const donutEl = document.getElementById("glance-tickets-donut");
    const legendEl = document.getElementById("glance-tickets-legend");
    // Every target here is optional — the header ticket counter was removed,
    // and the overview donut before it. This runs for whichever survive.
    const setText = (el, t) => { if (el) el.textContent = t; };
    const setHtml = (el, html) => { if (el) el.innerHTML = html; };
    const setHidden = (el, v) => { if (el) el.hidden = v; };

    if (TICKET_SUMMARY.total == null) {
      setText(labelEl, "Tickets: not connected");
      setHtml(donutEl, "");
      setHtml(legendEl, "");
      setHidden(noteEl, false);
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
      setText(labelEl, `Tickets: ${TICKET_SUMMARY.total.toLocaleString()} total`);
      setHtml(donutEl, donutSvg(
        [{ value: 1, color: "var(--status-unknown)", label: "Total" }],
        { centerValue: TICKET_SUMMARY.total, centerLabel: "total" }
      ));
      setHtml(legendEl, "");
      if (noteEl) noteEl.textContent =
        "Total is live, but the open/priority breakdown could not be read from " +
        "ManageEngine on the last sync — treat only the total as current.";
      setHidden(noteEl, false);
      return;
    }

    setHidden(noteEl, true);
    setText(labelEl, `${TICKET_SUMMARY.open} open · ${TICKET_SUMMARY.urgent ?? 0} urgent`);
    setHtml(donutEl, donutSvg(priorityCounts, { centerValue: TICKET_SUMMARY.open, centerLabel: "open" }));
    setHtml(legendEl, legendHtml(priorityCounts));
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

    renderTicketAge();
    renderTicketDue();
    renderTicketTrend();

    const cats = TICKET_SUMMARY.byCategory || [];
    document.getElementById("ticket-category-bars").innerHTML = cats.length
      ? barListHtml(cats, "var(--layer-access)")
      : `<p class="muted-text" style="margin:0">No category breakdown in the last sync — re-run the
         sync workflow to populate it.</p>`;

    renderTicketTechnicians();
    renderTicketMatrix();
    renderTicketList();
  }

  // Ranked by open tickets — who is carrying the most right now. All-time is
  // shown alongside but does not drive the order: ranking by all-time would
  // just rank by how long someone has worked here.
  //
  // These are assignees, not requesters. Nothing here says who reported a
  // ticket or what it was about.
  function renderTicketTechnicians() {
    const mount = document.getElementById("ticket-tech");
    if (!mount) return;
    const note = document.getElementById("ticket-tech-note");
    const rows = (TICKET_SUMMARY.byTechnician || []).slice();

    if (!rows.length) {
      if (note) note.textContent = "";
      mount.innerHTML = `<p class="muted-text" style="margin:0">No technician breakdown in the last
        sync — re-run the ticket sync workflow to populate it.</p>`;
      return;
    }

    const max = Math.max(...rows.map((r) => r.open || 0), 1);
    if (note) {
      note.textContent = `Open tickets currently assigned, highest first. ${rows.length} ${rows.length === 1 ? "queue" : "queues"}.`;
    }

    // Unassigned is not a person and must not be given a rank number, or the
    // list reads as though someone is responsible for it.
    let rank = 0;
    mount.innerHTML = `
      <div class="table-wrap">
        <table class="tech-table">
          <thead>
            <tr><th>#</th><th>Technician</th><th class="tech-bar-col"></th>
                <th class="num">Open</th><th class="num">All time</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const unassigned = /^unassigned$/i.test(r.label || "");
              if (!unassigned) rank++;
              const pct = Math.round(((r.open || 0) / max) * 100);
              return `
                <tr class="${unassigned ? "tech-unassigned" : ""}">
                  <td class="tech-rank">${unassigned ? "—" : rank}</td>
                  <td class="name">${esc(r.label)}</td>
                  <td class="tech-bar-col"><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${
                    unassigned ? "var(--status-unknown)" : "var(--layer-core)"
                  }"></div></div></td>
                  <td class="num"><strong>${r.open || 0}</strong></td>
                  <td class="num muted-text">${r.total == null ? "—" : r.total}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }


  // The three charts below are derived from recentOpen, which carries created
  // and dueBy per ticket. That is the only real time information in the feed —
  // it covers the most recent open tickets, not the whole backlog, and the
  // notes say so rather than implying these describe all 549.
  // Benign end first. Green/blue/amber/red escalates the way an operator
  // already reads status colours; the severity ramp's purple end reads as a
  // category rather than "this one is fine".
  const AGE_BUCKETS = [
    { label: "Today", max: 1, color: "var(--status-good)" },
    { label: "2–7 days", max: 7, color: "var(--prio-3)" },
    { label: "8–30 days", max: 30, color: "var(--prio-2)" },
    { label: "Over 30 days", max: Infinity, color: "var(--prio-1)" },
  ];

  // ServiceDesk Plus returns timestamps as epoch milliseconds in a string
  // ("1785205030286"). Date.parse gives NaN for those, which silently bucketed
  // every ticket into the oldest band — so parse numerics explicitly.
  function ticketTime(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    const str = String(v).trim();
    if (/^\d{10,}$/.test(str)) {
      const n = Number(str);
      return str.length <= 10 ? n * 1000 : n;
    }
    return Date.parse(str);
  }

  function openSample() {
    return (TICKET_SUMMARY.recentOpen || []).filter((t) => Number.isFinite(ticketTime(t.created)));
  }

  function colouredBars(items) {
    const max = Math.max(...items.map((i) => i.value), 1);
    return items.map((i) => `
      <div class="bar-row">
        <div class="bar-row-label">${esc(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${((i.value / max) * 100).toFixed(1)}%; background:${i.color}"></div></div>
        <div class="bar-row-value">${esc(i.value)}</div>
      </div>`).join("");
  }

  function renderTicketAge() {
    const el = document.getElementById("ticket-age-bars");
    if (!el) return;
    const rows = openSample();
    const noteEl = document.getElementById("ticket-age-note");

    if (!rows.length) {
      el.innerHTML = `<p class="muted-text" style="margin:0">No per-ticket dates in the last sync.</p>`;
      if (noteEl) noteEl.textContent = "";
      return;
    }

    const now = Date.now();
    const counts = AGE_BUCKETS.map((b) => ({ label: b.label, color: b.color, value: 0 }));
    rows.forEach((t) => {
      const days = (now - ticketTime(t.created)) / 86400000;
      const idx = AGE_BUCKETS.findIndex((b) => days < b.max);
      counts[idx === -1 ? AGE_BUCKETS.length - 1 : idx].value++;
    });

    const stale = counts.slice(3).reduce((n, c) => n + c.value, 0);
    if (noteEl) {
      noteEl.textContent = `Newest ${rows.length} open tickets. ` +
        (stale ? `${stale} have been open more than a month.` : "None older than a month.");
    }
    el.innerHTML = colouredBars(counts.filter((c) => c.value > 0));
  }

  function renderTicketDue() {
    const el = document.getElementById("ticket-due-bars");
    if (!el) return;
    const rows = TICKET_SUMMARY.recentOpen || [];
    const now = Date.now();
    const buckets = { Overdue: 0, "Due today": 0, "Due this week": 0, Later: 0, "No due date": 0 };

    rows.forEach((t) => {
      if (!t.dueBy) { buckets["No due date"]++; return; }
      const d = (ticketTime(t.dueBy) - now) / 86400000;
      if (Number.isNaN(d)) { buckets["No due date"]++; return; }
      if (d < 0) buckets.Overdue++;
      else if (d < 1) buckets["Due today"]++;
      else if (d < 7) buckets["Due this week"]++;
      else buckets.Later++;
    });

    const colors = {
      Overdue: "var(--status-critical)", "Due today": "var(--status-warning)",
      "Due this week": "var(--prio-3)", Later: "var(--prio-4)", "No due date": "var(--prio-none)",
    };
    const items = Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value, color: colors[label] }));

    const noteEl = document.getElementById("ticket-due-note");
    if (noteEl) {
      noteEl.textContent = buckets.Overdue
        ? `${buckets.Overdue} of the newest ${rows.length} open tickets are past their due date.`
        : `Nothing in the newest ${rows.length} open tickets is overdue.`;
    }
    el.innerHTML = items.length ? colouredBars(items) : `<p class="muted-text" style="margin:0">No due dates in the last sync.</p>`;
  }

  // A column per day for the last 30 days. This is a real series — each ticket
  // carries its own created date — unlike the overview trends, which have no
  // history to draw from.
  function renderTicketTrend() {
    const el = document.getElementById("ticket-trend");
    if (!el) return;
    const rows = openSample();
    const noteEl = document.getElementById("ticket-trend-note");
    if (!rows.length) {
      el.innerHTML = `<p class="muted-text" style="margin:0">No per-ticket dates in the last sync.</p>`;
      return;
    }

    const DAYS = 30;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const counts = new Array(DAYS).fill(0);
    let older = 0;
    rows.forEach((t) => {
      const d = new Date(ticketTime(t.created)); d.setHours(0, 0, 0, 0);
      const idx = DAYS - 1 - Math.round((today - d) / 86400000);
      if (idx >= 0 && idx < DAYS) counts[idx]++; else older++;
    });

    const max = Math.max(...counts, 1);
    const W = 100 / DAYS;
    if (noteEl) {
      noteEl.textContent = `Still-open tickets by the day they were raised${older ? `, ${older} raised before this window` : ""}.`;
    }
    el.innerHTML = `
      <svg class="ticket-trend-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
        ${counts.map((c, i) => {
          const h = (c / max) * 34;
          return `<rect x="${(i * W + W * 0.15).toFixed(2)}" y="${(36 - h).toFixed(2)}" width="${(W * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="0.6" fill="var(--layer-core)"><title>${c} on ${new Date(today - (DAYS - 1 - i) * 86400000).toLocaleDateString()}</title></rect>`;
        }).join("")}
      </svg>
      <div class="ticket-trend-axis"><span>30 days ago</span><span>today</span></div>`;
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







  // ---------------------------------------------------------------------
  // Topology
  // ---------------------------------------------------------------------
  // Built from both feeds, because neither sees the whole estate: Auvik owns
  // the Cisco core and Palo Alto edge, Meraki owns its own switches, APs and
  // sensors. Nodes are laid out once into world coordinates and pan/zoom is a
  // single <g transform>, so hit-testing stays correct.
  //
  // 188 access points cannot each be a node and stay readable, so APs and
  // sensors are clustered by the location token in their name (SAH-L5-AP-…
  // clusters as SAH · L5). Clusters expand on click.
  const topoState = { scale: 1, tx: 0, ty: 0, selected: null, world: null, expanded: {}, needsFit: true, lastSize: "" };

  const TOPO_ICON = {
    internet: "icon-cloud",
    firewall: "icon-firewall",
    core: "icon-switch",
    switch: "icon-switch",
    ap: "icon-ap",
    sensor: "icon-sensor",
    cluster: "icon-ap",
  };
  const TOPO_COLOR = {
    internet: "var(--baseline)",
    firewall: "var(--layer-security)",
    core: "var(--layer-core)",
    switch: "var(--layer-access)",
    ap: "var(--layer-legacy)",
    sensor: "var(--status-warning)",
  };

  const meraki = () => (typeof WIRELESS !== "undefined" ? WIRELESS.fleet || {} : {});

  // Sites hidden from the visual summaries on request — the topology map and
  // the overview campus cards. They are still counted in every total, in the
  // Meraki device table and in the device tables, so nothing disappears from
  // the numbers; only the two diagrams omit them.
  const HIDDEN_SITES = /^KIRR$/i;
  const shortSite = (s) => String(s || "").replace(/^SACS-/i, "") || "Unassigned";

  // "SAH-L5-AP-BE4C" -> "L5"; "BBC-G-A1-1" -> "G". Falls back to the whole
  // name so nothing silently lands in a bucket it does not belong to.
  function locationToken(name) {
    const parts = String(name || "").split("-");
    return parts.length >= 2 ? parts[1].toUpperCase() : "—";
  }

  // For a group, the worst member is the wrong summary: one dead AP out of 145
  // made a whole campus render as "Down", which is both alarming and false.
  // Everything down is Down; anything down or warning is a partial failure.
  function aggregateStatus(list) {
    if (!list.length) return "unknown";
    const known = list.filter((s) => s && s !== "unknown");
    if (!known.length) return "unknown";
    if (known.every((s) => s === "down")) return "down";
    if (known.some((s) => s === "down" || s === "warning")) return "warning";
    if (known.some((s) => s === "up" || s === "attested")) return "up";
    return "unknown";
  }

  function worstStatus(list) {
    if (list.some((s) => s === "down")) return "down";
    if (list.some((s) => s === "warning")) return "warning";
    if (list.some((s) => s === "up")) return "up";
    return "unknown";
  }

  // Geometry. One place, so rows stay aligned when any of it changes.
  const TG = { NW: 158, NH: 40, SW: 198, SH: 60, GX: 18, GY: 76, PAD: 40 };

  // Lay a row out centred on `mid`, returning x positions.
  function rowX(count, w, gap, mid) {
    const total = count * w + Math.max(0, count - 1) * gap;
    const left = mid - total / 2;
    return Array.from({ length: count }, (_, i) => left + i * (w + gap));
  }

  // The map is built around progressive disclosure. Drawing all 40-odd access
  // switches at once produced a wall of identical boxes that had to be zoomed
  // and dragged to read — a directory, not a topology. By default each site is
  // ONE node carrying its counts and worst status; clicking it expands that
  // site alone. The backbone (internet, firewalls, sensors, cores) is always
  // visible because that is the part you actually trace a fault through.
  function buildTopoWorld() {
    const nodes = [];
    const links = [];
    const push = (n) => (nodes.push(n), n);

    const live = (d) => deviceStatus(d.id);
    const inScope = (d) => !HIDDEN_SITES.test(d.site || "");

    const fw = DEVICES.filter((d) => d.layer === "security" && inScope(d));
    const cores = DEVICES.filter((d) => d.layer === "core" && inScope(d));
    const access = DEVICES.filter((d) => d.layer === "access" && inScope(d));

    // The fleet is one flat list tagged with productType — there are no
    // per-kind arrays on it, and reading `fleet.switches` silently yielded
    // nothing, which dropped every Meraki switch and two whole sites.
    const mDevices = (meraki().devices || []).filter((d) => !HIDDEN_SITES.test(shortSite(d.site)));
    const mSwitches = mDevices.filter((d) => d.productType === "switch");
    const mAps = mDevices.filter((d) => d.productType === "wireless");

    // Site key -> its switches (Cisco + Meraki) and access points.
    const bySite = new Map();
    const bucket = (key) => {
      const k = key || "Unassigned";
      if (!bySite.has(k)) bySite.set(k, { site: k, switches: [], aps: [] });
      return bySite.get(k);
    };
    access.forEach((d) => bucket(shortSite(d.site)).switches.push({
      id: d.id, name: d.name, status: live(d), sub: d.ip || d.model || "", device: d,
    }));
    mSwitches.forEach((s) => bucket(shortSite(s.site)).switches.push({
      id: `mk:${s.name}`, name: s.name, status: s.status, sub: s.model || "", meraki: s,
    }));
    mAps.forEach((a) => bucket(shortSite(a.site)).aps.push({ name: a.name, status: a.status, meraki: a }));

    const sites = [...bySite.keys()].sort();
    sites.forEach((k) => bySite.get(k).switches.sort((a, b) => a.name.localeCompare(b.name)));

    // ---- widths -----------------------------------------------------------
    // The widest row sets the canvas; everything else centres inside it.
    const secW = fw.length * TG.NW + (fw.length - 1) * TG.GX;
    const coreW = cores.length * TG.NW + (cores.length - 1) * TG.GX;
    const siteW = sites.length * TG.SW + (sites.length - 1) * TG.GX;

    // An expanded site lays its switches out in a block beneath it. The block
    // is as wide as it needs to be, and pushes the sites row wider.
    // Roughly square. A fixed 4 columns turned 30 switches into 8 rows, and
    // the auto-fit then zoomed out far enough to make every label unreadable.
    const colsFor = (n) => Math.max(3, Math.min(7, Math.ceil(Math.sqrt(n))));
    const expandedOf = (k) => !!topoState.expanded[`site:${k}`];
    const blockW = (k) => {
      if (!expandedOf(k)) return TG.SW;
      const n = bySite.get(k).switches.length + (bySite.get(k).aps.length ? 1 : 0);
      const cols = colsFor(n);
      return Math.max(TG.SW, cols * TG.NW + (cols - 1) * TG.GX);
    };
    const siteBlocks = sites.map(blockW);
    const sitesRowW = siteBlocks.reduce((a, b) => a + b, 0) + Math.max(0, sites.length - 1) * (TG.GX * 2);

    const totalWidth = Math.max(secW, coreW, siteW, sitesRowW, 640) + TG.PAD * 2;
    const mid = totalWidth / 2;

    // ---- rows -------------------------------------------------------------
    const yInternet = TG.PAD;
    const ySec = yInternet + TG.GY;
    const yCore = ySec + TG.GY;
    const ySite = yCore + TG.GY;
    const yExpand = ySite + TG.SH + 34;

    const inet = push({
      id: "internet", kind: "internet", name: "Internet", sub: "WAN edge",
      status: "up", x: mid - TG.NW / 2, y: yInternet, w: TG.NW, h: TG.NH,
    });

    const secX = rowX(fw.length, TG.NW, TG.GX, mid);
    const secNodes = fw.map((d, i) => push({
      // Arctic Wolf sensors sit in the security tier but are not firewalls;
      // a firewall icon would overstate what they do.
      id: d.id, kind: /sensor/i.test(d.name) ? "sensor" : "firewall",
      name: d.name, sub: d.ip || d.model || "", status: live(d), device: d,
      x: secX[i], y: ySec, w: TG.NW, h: TG.NH,
    }));
    secNodes.forEach((n) => links.push({ from: inet.id, to: n.id, kind: "wan" }));

    const coreX = rowX(cores.length, TG.NW, TG.GX, mid);
    const coreNodes = cores.map((d, i) => push({
      id: d.id, kind: "core", name: d.name, sub: d.ip || d.model || "",
      status: live(d), device: d, x: coreX[i], y: yCore, w: TG.NW, h: TG.NH,
    }));
    // Only firewalls feed the cores; sensors observe, they do not route.
    secNodes.filter((n) => n.kind === "firewall")
      .forEach((f) => coreNodes.forEach((c) => links.push({ from: f.id, to: c.id, kind: "core" })));
    for (let i = 1; i < coreNodes.length; i++) {
      links.push({ from: coreNodes[i - 1].id, to: coreNodes[i].id, kind: "peer" });
    }

    // ---- sites ------------------------------------------------------------
    let cursor = mid - sitesRowW / 2;
    let maxY = ySite + TG.SH;
    const bands = [];

    sites.forEach((key, i) => {
      const info = bySite.get(key);
      const bw = siteBlocks[i];
      const cx = cursor + bw / 2;
      const open = expandedOf(key);
      const members = [...info.switches, ...info.aps];
      const worst = aggregateStatus(members.map((m) => m.status));

      const siteNode = push({
        id: `site:${key}`, kind: "site", name: key,
        sub: `${info.switches.length} switch${info.switches.length === 1 ? "" : "es"}${info.aps.length ? ` · ${info.aps.length} AP${info.aps.length === 1 ? "" : "s"}` : ""}`,
        status: worst, site: key, open,
        counts: { switches: info.switches.length, aps: info.aps.length },
        members,
        x: cx - TG.SW / 2, y: ySite, w: TG.SW, h: TG.SH,
      });
      // A site hangs off whichever core is nearest horizontally, so the lines
      // do not cross the whole diagram to reach a switch two metres away.
      const nearest = coreNodes.length
        ? coreNodes.reduce((a, b) =>
            Math.abs(a.x + a.w / 2 - cx) <= Math.abs(b.x + b.w / 2 - cx) ? a : b)
        : null;
      if (nearest) links.push({ from: nearest.id, to: siteNode.id, kind: "site" });

      if (open) {
        const items = [
          ...info.switches.map((s) => ({ ...s, kind: "switch" })),
          ...(info.aps.length ? [{
            id: `aps:${key}`, kind: "cluster", name: `${info.aps.length} access points`,
            sub: key, status: aggregateStatus(info.aps.map((a) => a.status)), members: info.aps,
          }] : []),
        ];
        const cols = colsFor(items.length);
        const left = cx - (cols * TG.NW + (cols - 1) * TG.GX) / 2;
        items.forEach((it, idx) => {
          const c = idx % cols, r = Math.floor(idx / cols);
          const n = push({
            ...it, site: key,
            x: left + c * (TG.NW + TG.GX),
            y: yExpand + r * (TG.NH + 16),
            w: TG.NW, h: TG.NH,
          });
          links.push({ from: siteNode.id, to: n.id, kind: "access" });
          maxY = Math.max(maxY, n.y + n.h);
        });
        bands.push({ site: key, x: left - 16, y: ySite - 14, w: cols * TG.NW + (cols - 1) * TG.GX + 32, h: (maxY - ySite) + 30 });
      }

      cursor += bw + TG.GX * 2;
    });

    const byId = new Map(nodes.map((n) => [n.id, n]));
    return {
      nodes, links, byId, sites, bands,
      totalWidth, totalHeight: maxY + TG.PAD,
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

  // Rendered in stage pixel space (viewBox matches the element's own size), so
  // one world unit is one CSS pixel at scale 1. Pan and zoom maths then needs
  // no conversion between viewBox units and screen pixels — the source of the
  // drift the old version had when the window was resized.
  function renderTopology() {
    const stage = document.getElementById("topo-stage");
    if (!stage) return;
    const w = (topoState.world = buildTopoWorld());

    const site = document.getElementById("topo-site")?.value || "all";
    const layer = document.getElementById("topo-layer")?.value || "all";
    const showAps = document.getElementById("topo-show-aps")?.checked !== false;
    const query = (document.getElementById("topo-search")?.value || "").trim().toLowerCase();

    const KIND_LAYER = {
      firewall: "security", sensor: "security", core: "core",
      switch: "access", cluster: "wireless", site: "core", internet: "core",
    };
    const visible = (n) => {
      if (!showAps && n.kind === "cluster") return false;
      if (site !== "all" && n.site && n.site !== site) return false;
      if (site !== "all" && n.kind === "site" && n.name !== site) return false;
      if (layer !== "all" && KIND_LAYER[n.kind] !== layer) return false;
      return true;
    };
    const shown = w.nodes.filter(visible);
    const shownIds = new Set(shown.map((n) => n.id));

    const sel = topoState.selected;
    // Neighbour focus dims everything unrelated, which is useful for tracing a
    // single device but wrong for a site: opening one greyed out the entire
    // backbone you opened it from.
    const selNode = sel ? w.byId.get(sel) : null;
    const near = sel && shownIds.has(sel) && selNode?.kind !== "site"
      ? topoNeighbours(sel) : null;
    const cx = (n) => n.x + n.w / 2;

    const rect = stage.getBoundingClientRect();
    const vw = Math.max(320, Math.round(rect.width));
    const vh = Math.max(320, Math.round(rect.height));

    const parts = [];
    parts.push(`<svg class="topology-svg" id="topo-svg" viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg">`);
    parts.push(`<g id="topo-viewport" transform="translate(${topoState.tx} ${topoState.ty}) scale(${topoState.scale})">`);

    w.bands.forEach((b) => {
      if (!shown.some((n) => n.site === b.site)) return;
      parts.push(`<rect class="topo-band" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14"/>`);
    });

    // Orthogonal links: down, across, down. Straight diagonals across a diagram
    // this wide are impossible to follow where they overlap.
    w.links.forEach((l) => {
      const a = w.byId.get(l.from), b = w.byId.get(l.to);
      if (!a || !b || !shownIds.has(a.id) || !shownIds.has(b.id)) return;
      const dim = near && !(near.has(a.id) && near.has(b.id));
      const cls = `topo-link kind-${l.kind}${dim ? " dim" : ""}${near && !dim ? " hi" : ""}`;
      if (l.kind === "peer") {
        parts.push(`<path class="${cls}" d="M${a.x + a.w},${a.y + a.h / 2} H${b.x}"/>`);
        return;
      }
      const y1 = a.y + a.h, y2 = b.y, myd = y1 + (y2 - y1) / 2;
      parts.push(`<path class="${cls}" d="M${cx(a)},${y1} V${myd} H${cx(b)} V${y2}"/>`);
    });

    shown.forEach((n) => {
      const cls = ["topo-node", `kind-${n.kind}`];
      if (sel === n.id) cls.push("sel");
      else if (near) cls.push(near.has(n.id) ? "hi" : "dim");
      if (query) cls.push(`${n.name} ${n.sub || ""}`.toLowerCase().includes(query) ? "match" : "nomatch");
      if (n.kind === "site" && n.open) cls.push("open");

      const icon = TOPO_ICON[n.kind] || "icon-switch";
      const color = TOPO_COLOR[n.kind] || "var(--baseline)";
      const isSite = n.kind === "site";

      parts.push(`
        <g class="${cls.join(" ")}" data-id="${esc(n.id)}" tabindex="0" role="button"
           aria-label="${esc(n.name)}${isSite ? `, ${n.open ? "expanded" : "collapsed"}` : ""}">
          <rect class="topo-node-bg" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"/>
          <rect class="topo-node-edge" x="${n.x}" y="${n.y}" width="3.5" height="${n.h}" rx="2"
                fill="${color}"/>
          <g class="topo-node-icon" style="color:${color}"
             transform="translate(${n.x + 13} ${n.y + n.h / 2 - 8})">
            <svg width="16" height="16" viewBox="0 0 24 24"><use href="#${icon}"/></svg>
          </g>
          <text class="topo-node-name" x="${n.x + 38}" y="${n.y + (n.sub ? n.h / 2 - 2 : n.h / 2 + 4)}">${esc(n.name)}</text>
          ${n.sub ? `<text class="topo-node-sub" x="${n.x + 38}" y="${n.y + n.h / 2 + 12}">${esc(n.sub)}</text>` : ""}
          <circle class="dot status-dot-${n.status}" cx="${n.x + n.w - 13}" cy="${n.y + 13}" r="4.5"/>
          ${isSite ? `<text class="topo-node-chev" x="${n.x + n.w - 13}" y="${n.y + n.h - 10}">${n.open ? "−" : "+"}</text>` : ""}
        </g>`);
    });

    parts.push(`</g></svg>`);
    stage.innerHTML = parts.join("");

    // First paint, or a change in what is drawn, should frame itself. Nobody
    // should have to hunt for the diagram before they can read it.
    if (topoState.needsFit) { topoState.needsFit = false; topoFit(); }

    const sub = document.getElementById("topo-subtitle");
    if (sub) {
      const hidden = w.nodes.length - shown.length;
      const openSites = w.nodes.filter((n) => n.kind === "site" && n.open).length;
      sub.textContent = hidden
        ? `Drag to move, scroll or pinch to zoom. Tap a site to expand it. ${hidden} node${hidden === 1 ? "" : "s"} hidden by filters.`
        : openSites
          ? "Drag to move, scroll or pinch to zoom. Tap a site again to collapse it."
          : "Drag to move, scroll or pinch to zoom. Tap a site to see its switches, or any device for detail.";
    }
    renderTopoInspector();
  }

  function renderTopoInspector() {
    const el = document.getElementById("topo-inspector");
    if (!el) return;
    const id = topoState.selected;
    const w = topoState.world;
    if (!id || !w) {
      el.innerHTML = `<p class="muted-text" style="margin:0">Select a device to see its detail and live status.</p>`;
      return;
    }
    const n = w.byId.get(id);
    if (!n) { el.innerHTML = ""; return; }

    if (n.kind === "site") {
      const bad = n.members.filter((m) => m.status === "down" || m.status === "warning");
      const up = n.members.filter((m) => m.status === "up").length;
      el.innerHTML = `
        <h3>${esc(n.name)}</h3>
        <p class="topo-status"><span class="dot status-dot-${n.status}"></span>${esc(STATUS_LABEL[n.status] || "Unknown")}</p>
        <dl class="topo-dl">
          <dt>Switches</dt><dd>${esc(n.counts.switches)}</dd>
          <dt>Access points</dt><dd>${esc(n.counts.aps)}</dd>
          <dt>Reporting up</dt><dd>${esc(up)} of ${esc(n.members.length)}</dd>
        </dl>
        ${bad.length
          ? `<h4>Needs attention</h4><ul class="topo-list">${bad.slice(0, 12).map((m) =>
              `<li>${esc(m.name)} <span class="muted-text">${esc(STATUS_LABEL[m.status] || "")}</span></li>`).join("")}
             ${bad.length > 12 ? `<li class="muted-text">…and ${bad.length - 12} more</li>` : ""}</ul>`
          : `<p class="muted-text">Everything at this site is reporting up.</p>`}
        <p class="muted-text" style="margin-bottom:0">${n.open
          ? "Tap the site again to collapse it."
          : "Tap the site to see its individual switches."}</p>`;
      return;
    }

    if (n.kind === "cluster") {
      const down = n.members.filter((m) => m.status === "down" || m.status === "warning");
      el.innerHTML = `
        <h3>${esc(n.name)}</h3>
        <p class="topo-status"><span class="dot status-dot-${n.status}"></span>${esc(STATUS_LABEL[n.status] || "Unknown")}</p>
        <dl class="topo-dl">
          <dt>Access points</dt><dd>${esc(n.members.filter((m) => m.productType === "wireless").length)}</dd>
          <dt>Sensors</dt><dd>${esc(n.members.filter((m) => m.productType === "sensor").length)}</dd>
          <dt>Site</dt><dd>${esc(n.site)}</dd>
        </dl>
        ${down.length ? `<h4>Needs attention</h4><ul class="topo-list">${down.map((m) => `<li>${esc(m.name)} <span class="muted-text">${esc(STATUS_LABEL[m.status] || "")}</span></li>`).join("")}</ul>` : `<p class="muted-text">All members are up.</p>`}
        <p class="muted-text" style="margin-bottom:0">Neither Auvik nor Meraki reports which switch each AP is patched into, so this cluster links to the site's switch stack rather than to a named port.</p>`;
      return;
    }

    const live = n.device ? (DEVICE_STATUS.devices || {})[n.device.id] || {} : {};
    const m = n.meraki || {};
    const att = n.status === "attested" ? n.device?.attested : null;
    const up = w.links.filter((l) => l.to === id).map((l) => w.byId.get(l.from)).filter(Boolean);
    const dn = w.links.filter((l) => l.from === id).map((l) => w.byId.get(l.to)).filter(Boolean);

    el.innerHTML = `
      <h3>${esc(n.name)}</h3>
      <p class="topo-status"><span class="dot status-dot-${n.status}"></span>${esc(STATUS_LABEL[n.status] || "Unknown")}</p>
      <dl class="topo-dl">
        <dt>Role</dt><dd>${esc(n.kind)}</dd>
        ${n.site ? `<dt>Site</dt><dd>${esc(n.site)}</dd>` : ""}
        ${n.device?.ip ? `<dt>IP</dt><dd>${esc(n.device.ip)}</dd>` : ""}
        ${m.model || live.model || n.device?.model ? `<dt>Model</dt><dd>${esc(m.model || live.model || n.device.model)}</dd>` : ""}
        ${m.firmware || live.firmware ? `<dt>Firmware</dt><dd>${esc(m.firmware || live.firmware)}</dd>` : ""}
        ${live.vendor ? `<dt>Vendor</dt><dd>${esc(live.vendor)}</dd>` : ""}
        ${m.lastSeen || live.lastSeen ? `<dt>Last seen</dt><dd>${esc(new Date(m.lastSeen || live.lastSeen).toLocaleString())}</dd>` : ""}
        ${att ? `<dt>Confirmed</dt><dd>${esc(att.on)} via ${esc(att.by)}</dd>` : ""}
        <dt>Source</dt><dd>${att ? "Manual check — no feed reaches this device" : n.meraki ? "Meraki" : "Auvik"}</dd>
      </dl>
      ${att ? `<p class="topo-attested">Arctic Wolf's Ticket API exposes tickets only, and Auvik does not discover this subnet, so nothing polls this sensor. The status above is the last recorded human check, not a live reading — re-confirm it in the Arctic Wolf portal.</p>` : ""}
      ${up.length ? `<h4>Upstream</h4><ul class="topo-list">${up.slice(0, 6).map((x) => `<li>${esc(x.name)}</li>`).join("")}</ul>` : ""}
      ${dn.length ? `<h4>Downstream</h4><ul class="topo-list">${dn.length > 6 ? `<li>${esc(dn.length)} connected nodes</li>` : dn.map((x) => `<li>${esc(x.name)}</li>`).join("")}</ul>` : ""}
      ${n.device?.note ? `<p class="muted-text">${esc(n.device.note)}</p>` : ""}`;
  }

  function populateTopoFilters() {
    const sel = document.getElementById("topo-site");
    if (!sel) return;
    const w = topoState.world || (topoState.world = buildTopoWorld());
    sel.innerHTML = `<option value="all">All sites</option>` +
      w.sites.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  }

  const TOPO_MIN = 0.25, TOPO_MAX = 3;
  const topoClamp = (v) => Math.min(TOPO_MAX, Math.max(TOPO_MIN, v));

  function applyTopoTransform() {
    const g = document.getElementById("topo-viewport");
    if (g) g.setAttribute("transform", `translate(${topoState.tx} ${topoState.ty}) scale(${topoState.scale})`);
  }

  // Frame the whole diagram in the stage. This is the "reset" everyone
  // actually wants — scale 1 at origin is meaningless once the map is wider
  // than the screen, which it always is.
  function topoFit(pad = 26) {
    const svg = document.getElementById("topo-svg");
    const w = topoState.world;
    if (!svg || !w) return;
    const vb = svg.viewBox.baseVal;

    // With a site open, frame that site rather than the whole diagram. Fitting
    // everything meant opening SAH zoomed out until no label could be read —
    // the opposite of what asking for its switches was meant to achieve. The
    // backbone stays one short drag above.
    let x = 0, y = 0, W = w.totalWidth, H = w.totalHeight;
    if (w.bands.length) {
      const x0 = Math.min(...w.bands.map((b) => b.x));
      const x1 = Math.max(...w.bands.map((b) => b.x + b.w));
      const y0 = Math.min(...w.bands.map((b) => b.y));
      const y1 = Math.max(...w.bands.map((b) => b.y + b.h));
      x = x0; y = y0; W = x1 - x0; H = y1 - y0;
    }

    const s = topoClamp(Math.min((vb.width - pad * 2) / W, (vb.height - pad * 2) / H));
    topoState.scale = s;
    topoState.tx = (vb.width - W * s) / 2 - x * s;
    topoState.ty = (vb.height - H * s) / 2 - y * s;
    applyTopoTransform();
  }

  // Zoom about a fixed point in stage coordinates, so whatever is under the
  // cursor or the pinch centre stays there.
  function topoZoomAt(px, py, factor) {
    const next = topoClamp(topoState.scale * factor);
    const k = next / topoState.scale;
    topoState.tx = px - (px - topoState.tx) * k;
    topoState.ty = py - (py - topoState.ty) * k;
    topoState.scale = next;
    applyTopoTransform();
  }

  function initTopology() {
    const stage = document.getElementById("topo-stage");
    if (!stage) return;

    const local = (e) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e);
      // Trackpads report small deltas continuously; mice report ~100 per notch.
      // Scaling by the delta keeps both feeling the same rather than making a
      // trackpad crawl and a mouse jump.
      const step = Math.exp(-e.deltaY * 0.0015);
      topoZoomAt(p.x, p.y, step);
    }, { passive: false });

    // One pointer pans, two pinch. Tracking pointers in a map rather than
    // using touch events keeps mouse, pen and touch on the same code path.
    const pointers = new Map();
    let pan = null, pinch = null, moved = 0, hit = null;

    stage.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, local(e));
      stage.setPointerCapture(e.pointerId);
      moved = 0;
      // Captured pointers retarget the following click to the capturing
      // element, so `click` sees the stage and never the node. The hit is
      // therefore recorded here, while the original target is still intact,
      // and acted on at pointerup.
      hit = e.target.closest(".topo-node")?.getAttribute("data-id") || null;
      if (pointers.size === 1) {
        const p = pointers.get(e.pointerId);
        pan = { x: p.x, y: p.y, tx: topoState.tx, ty: topoState.ty };
        stage.classList.add("grabbing");
      } else if (pointers.size === 2) {
        pan = null;
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    });

    stage.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, local(e));

      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.dist > 0) {
          topoZoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.dist);
        }
        pinch.dist = dist;
        return;
      }
      if (!pan) return;
      const p = pointers.get(e.pointerId);
      moved = Math.max(moved, Math.hypot(p.x - pan.x, p.y - pan.y));
      topoState.tx = pan.tx + (p.x - pan.x);
      topoState.ty = pan.ty + (p.y - pan.y);
      applyTopoTransform();
    });

    const release = (e) => {
      const wasPanning = pointers.size === 1 && pinch === null;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) { pan = null; stage.classList.remove("grabbing"); }
      // A drag that happens to end over a node must not also select it.
      if (wasPanning && e.type === "pointerup" && moved <= 5) activate(hit);
      hit = null;
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);

    const activate = (id) => {
      if (id && id.startsWith("site:")) {
        // One tap does both: select it and open it. Requiring a second tap to
        // expand, as the old cluster behaviour did, just felt broken.
        topoState.expanded[id] = !topoState.expanded[id];
        topoState.selected = id;
        // Opening a site changes how big the diagram is, so it has to be
        // re-framed — otherwise the switches you just asked for are drawn
        // off the bottom of the stage.
        topoState.needsFit = true;
      } else {
        topoState.selected = id;
      }
      renderTopology();
    };

    stage.addEventListener("dblclick", (e) => {
      if (e.target.closest(".topo-node")) return;
      topoFit();
    });

    stage.addEventListener("keydown", (e) => {
      const node = e.target.closest(".topo-node");
      if (!node || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      activate(node.getAttribute("data-id"));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && topoState.selected) {
        topoState.selected = null;
        renderTopology();
      }
    });

    const centreZoom = (f) => {
      const svg = document.getElementById("topo-svg");
      if (!svg) return;
      topoZoomAt(svg.viewBox.baseVal.width / 2, svg.viewBox.baseVal.height / 2, f);
    };
    document.getElementById("topo-zoom-in")?.addEventListener("click", () => centreZoom(1.3));
    document.getElementById("topo-zoom-out")?.addEventListener("click", () => centreZoom(1 / 1.3));
    document.getElementById("topo-reset")?.addEventListener("click", () => {
      topoState.selected = null;
      topoState.expanded = {};
      topoState.needsFit = true;
      renderTopology();
    });

    // The first render happens while this panel is still display:none, so the
    // stage measures zero and any fit computed then is meaningless. Watching
    // the element covers that, tab switches and window resizes with one
    // mechanism, instead of guessing when it became visible.
    if (typeof ResizeObserver !== "undefined") {
      let rt;
      new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        if (r.width < 10 || r.height < 10) return;
        const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
        if (key === topoState.lastSize) return;
        topoState.lastSize = key;
        clearTimeout(rt);
        rt = setTimeout(() => { topoState.needsFit = true; renderTopology(); }, 60);
      }).observe(stage);
    }

    populateTopoFilters();
    ["topo-site", "topo-layer", "topo-show-aps"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        topoState.needsFit = true;
        renderTopology();
      });
    });
    document.getElementById("topo-search")?.addEventListener("input", renderTopology);
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
  // Documentation — SharePoint connection guide
  // ---------------------------------------------------------------------
  // Rendered from data rather than hand-written markup so the steps stay
  // editable in one place.
  const SHAREPOINT_STEPS = [
    {
      title: "Register an app in Entra ID",
      body: "In the Azure portal go to Entra ID → App registrations → New registration. " +
        "Name it something like “SACS Dashboard — SharePoint reader”, choose " +
        "single tenant, and leave the redirect URI blank. This is a " +
        "daemon app, so it signs in as itself, not as a user.",
      note: "You need an Entra ID role that can register applications. If you cannot, " +
        "this is the step to hand to whoever administers the tenant.",
    },
    {
      title: "Give it read-only application permissions",
      body: "On the new app go to API permissions → Add a permission → Microsoft Graph → " +
        "Application permissions, and add Sites.Read.All. Then click " +
        "Grant admin consent — the permission does nothing until consent is given.",
      note: "Sites.Read.All grants read across every site in the tenant. If that is too " +
        "broad, use Sites.Selected instead and grant this app read on the SACSITTeam " +
        "site only — narrower, but it needs one extra Graph call to assign.",
    },
    {
      title: "Create a client secret",
      body: "Certificates & secrets → New client secret. Pick the shortest expiry your " +
        "process can handle re-issuing, and copy the Value immediately — it is " +
        "shown once and cannot be retrieved later.",
    },
    {
      title: "Collect three values",
      body: "From the app's Overview page copy the Application (client) ID and the " +
        "Directory (tenant) ID. With the secret from step 3 that is everything the sync needs.",
    },
    {
      title: "Add them as GitHub secrets",
      body: "In this repository go to Settings → Secrets and variables → Actions → " +
        "New repository secret, and add SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID " +
        "and SHAREPOINT_CLIENT_SECRET.",
      note: "Paste them into GitHub directly. Do not send them through chat — anything " +
        "pasted into a conversation should be treated as compromised and rotated.",
    },
    {
      title: "Confirm the site and library",
      body: "The library is at /sites/SACSITTeam, document library “05Infrastructure”. " +
        "The sync resolves the site ID from that path, so nothing else needs hard-coding.",
    },
    {
      title: "I build the sync",
      body: "Once the secrets exist I add scripts/sharepoint-index.js and a scheduled " +
        "workflow that authenticates via client credentials, walks the drive, and writes " +
        "data/sharepoint.js — folder and file names, paths, sizes, modified dates and " +
        "SharePoint links. No file contents are downloaded or published.",
    },
  ];

  function renderSharePointSteps() {
    const el = document.getElementById("sharepoint-steps");
    if (!el) return;
    el.innerHTML = SHAREPOINT_STEPS.map((s) => `
      <li class="setup-step">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.body)}</p>
        ${s.note ? `<p class="setup-note">${esc(s.note)}</p>` : ""}
      </li>`).join("");
  }


  // ---------------------------------------------------------------------
  // SharePoint library browser
  // ---------------------------------------------------------------------
  const SP = () => (typeof SHAREPOINT !== "undefined" ? SHAREPOINT : null);

  const SP_EXT_ICON = {
    pdf: "icon-docs", doc: "icon-docs", docx: "icon-docs",
    xls: "icon-ports", xlsx: "icon-ports", csv: "icon-ports",
    ppt: "icon-map", pptx: "icon-map",
    png: "icon-camera", jpg: "icon-camera", jpeg: "icon-camera",
    vsd: "icon-topology", vsdx: "icon-topology",
    zip: "icon-devices", txt: "icon-docs",
  };

  function formatBytes(n) {
    if (!n) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
  }

  function renderSharePoint() {
    const card = document.getElementById("sharepoint-browser-card");
    const setup = document.getElementById("sharepoint-setup-card");
    const why = document.getElementById("sharepoint-why-card");
    const subtitle = document.getElementById("doc-subtitle");
    const mount = document.getElementById("sharepoint-tree");
    if (!mount) return;
    const D = SP();

    // Until the sync has run there is nothing to browse, so the setup guide is
    // the page. Once it has, the whole guide — rationale included — collapses
    // out of the way; leaving "why this needs setting up" above a working
    // library reads as though it still does.
    const connected = Boolean(D && (D.tree || []).length);
    if (card) card.hidden = !connected;
    if (setup) setup.hidden = connected;
    if (why) why.hidden = connected;
    if (subtitle) {
      subtitle.textContent = connected
        ? `${D.library} — synced from SharePoint. Open any item to view it there.`
        : "Connect the SharePoint library so its folders and files list here.";
    }
    if (!connected) return;

    const meta = document.getElementById("sharepoint-meta");
    if (meta) {
      meta.textContent =
        `${D.folders} folders · ${D.files} files · ${formatBytes(D.totalBytes)}` +
        (D.omitted ? ` · ${D.omitted} omitted` : "") +
        ` · synced ${new Date(D.updatedAt).toLocaleString()}`;
    }
    renderSharePointTree();
  }

  function renderSharePointTree() {
    const mount = document.getElementById("sharepoint-tree");
    const D = SP();
    if (!mount || !D) return;
    const q = (document.getElementById("sp-search")?.value || "").trim().toLowerCase();

    const matches = (n) =>
      !q || n.name.toLowerCase().includes(q) || (n.children || []).some(matches);

    function nodeHtml(n, depth) {
      if (!matches(n)) return "";
      const isFolder = n.kind === "folder";
      const kids = (n.children || []).filter(matches);
      // A search should reveal what it found, so matching branches open even
      // if the user had collapsed them.
      const open = isFolder && (q ? true : depth === 0);
      const icon = isFolder ? "icon-docs" : (SP_EXT_ICON[n.ext] || "icon-docs");
      const detail = isFolder
        ? `${n.count} item${n.count === 1 ? "" : "s"}`
        : [n.ext ? n.ext.toUpperCase() : "", formatBytes(n.size)].filter(Boolean).join(" · ");
      const when = n.modified ? new Date(n.modified).toLocaleDateString() : "";

      const label = `
        <span class="doc-node-text">
          <span class="doc-node-name">${esc(n.name)}</span>
          <span class="doc-node-desc">${esc(detail)}${when ? ` · ${esc(when)}` : ""}</span>
        </span>`;

      const row = isFolder
        ? `<button type="button" class="doc-node doc-node-folder" aria-expanded="${open}" data-toggle="1">
             <svg class="icon doc-chev"><use href="#icon-chevron"/></svg>
             <svg class="icon doc-kind"><use href="#${icon}"/></svg>${label}
             ${n.href ? `<a class="doc-open" href="${esc(n.href)}" target="_blank" rel="noopener" title="Open in SharePoint"><svg class="icon"><use href="#icon-external"/></svg></a>` : ""}
           </button>`
        : `<a class="doc-node" href="${esc(n.href || "#")}" target="_blank" rel="noopener">
             <svg class="icon doc-kind"><use href="#${icon}"/></svg>${label}
             <svg class="icon doc-row-icon"><use href="#icon-external"/></svg>
           </a>`;

      return `<li class="doc-branch" style="--depth:${depth}">
          ${row}
          ${kids.length ? `<ul class="doc-children"${open ? "" : " hidden"}>${kids.map((k) => nodeHtml(k, depth + 1)).join("")}</ul>` : ""}
        </li>`;
    }

    const html = D.tree.map((n) => nodeHtml(n, 0)).join("");
    mount.innerHTML = html
      ? `<ul class="doc-root">${html}</ul>`
      : `<p class="muted-text" style="margin:0;padding:14px 16px">Nothing matches that search.</p>`;
  }

  function initSharePoint() {
    const mount = document.getElementById("sharepoint-tree");
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

    document.getElementById("sp-search")?.addEventListener("input", renderSharePointTree);
    const setAll = (open) => {
      mount.querySelectorAll("[data-toggle]").forEach((t) => {
        t.setAttribute("aria-expanded", String(open));
        const kids = t.parentElement.querySelector(".doc-children");
        if (kids) kids.hidden = !open;
      });
    };
    document.getElementById("sp-expand")?.addEventListener("click", () => setAll(true));
    document.getElementById("sp-collapse")?.addEventListener("click", () => setAll(false));
  }


  // ---------------------------------------------------------------------
  // Sortable tables
  // ---------------------------------------------------------------------
  // Applied to every table in the dashboard rather than wired per-table, so a
  // new table is sortable without extra code. Works on the rendered DOM, which
  // means it sorts whatever the current filter has produced.
  //
  // Sort keys are inferred from the cell: a date if it parses as one, a number
  // if it looks numeric, otherwise text. Status cells sort by severity, not
  // alphabetically — "Down, Dormant, Unknown, Up" is the wrong order to hand
  // someone looking for what is broken.
  const STATUS_RANK = {
    down: 0, critical: 0, offline: 0,
    warning: 1, alerting: 1, degraded: 1, serious: 1,
    unknown: 2, dormant: 3,
    // Keyed by the rendered label, like every other entry here — this table is
    // matched against cell text, not against the raw status value.
    "up (not polled)": 3,
    up: 4, online: 4, good: 4, ok: 4, active: 4,
  };

  function cellSortValue(cell) {
    const text = cell.textContent.trim();
    const lower = text.toLowerCase();

    if (Object.prototype.hasOwnProperty.call(STATUS_RANK, lower)) {
      return { type: "rank", v: STATUS_RANK[lower] };
    }
    if (!text || text === "—") {
      // Blanks always sort last, whichever direction — an empty cell is not
      // "smaller", it is absent.
      return { type: "empty", v: 0 };
    }
    const num = text.replace(/[, ]/g, "").match(/^-?\d+(\.\d+)?%?$/);
    if (num) return { type: "num", v: parseFloat(text.replace(/[, %]/g, "")) };

    const t = Date.parse(text);
    if (!Number.isNaN(t) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(text)) return { type: "num", v: t };

    return { type: "text", v: lower };
  }

  function sortTable(table, index, dir) {
    const body = table.tBodies[0];
    if (!body) return;
    const rows = [...body.rows].filter((r) => r.cells.length > index);
    // A "no results" row spans the table; it must not be sorted into the middle.
    const spanning = [...body.rows].filter((r) => r.cells.length <= index);

    rows.sort((a, b) => {
      const x = cellSortValue(a.cells[index]);
      const y = cellSortValue(b.cells[index]);
      if (x.type === "empty" && y.type === "empty") return 0;
      if (x.type === "empty") return 1;
      if (y.type === "empty") return -1;
      const cmp = typeof x.v === "string"
        ? x.v.localeCompare(y.v, undefined, { numeric: true })
        : x.v - y.v;
      return dir === "asc" ? cmp : -cmp;
    });

    rows.forEach((r) => body.appendChild(r));
    spanning.forEach((r) => body.appendChild(r));
  }

  function initSortableTables() {
    document.querySelectorAll("table").forEach((table) => {
      const head = table.tHead && table.tHead.rows[0];
      if (!head) return;
      [...head.cells].forEach((th, i) => {
        if (!th.textContent.trim()) return;   // action columns have no label
        if (th.classList.contains("sortable")) return;
        th.classList.add("sortable");
        th.setAttribute("aria-sort", "none");
        th.insertAdjacentHTML("beforeend", '<span class="sort-arrow">\u25B2</span>');
        th.addEventListener("click", () => {
          const current = th.getAttribute("aria-sort");
          const dir = current === "ascending" ? "desc" : "asc";
          [...head.cells].forEach((o) => o.setAttribute("aria-sort", "none"));
          th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
          sortTable(table, i, dir);
        });
      });
    });
  }

  // Tables are re-rendered by their own filters, which replaces the tbody and
  // drops any applied order. Re-attaching on click keeps newly rendered tables
  // sortable without every renderer having to know about this.
  function watchForNewTables() {
    document.addEventListener("click", () => setTimeout(initSortableTables, 0));
    document.addEventListener("input", () => setTimeout(initSortableTables, 0));
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
    "Under 24 hours": "var(--status-good)",
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
  // Overview
  // ---------------------------------------------------------------------
  function overviewSources() {
    const out = [];
    if (typeof DEVICE_STATUS !== "undefined" && DEVICE_STATUS.updatedAt) {
      out.push({ name: DEVICE_STATUS.source || "Auvik", at: DEVICE_STATUS.updatedAt });
    }
    if (typeof WIRELESS !== "undefined" && WIRELESS.updatedAt) {
      out.push({ name: WIRELESS.source || "Meraki", at: WIRELESS.updatedAt });
    }
    return out;
  }

  function renderOverviewMeta() {
    const srcEl = document.getElementById("ov-live-source");
    const updEl = document.getElementById("ov-updated");
    if (!srcEl) return;

    const sources = overviewSources();
    if (!sources.length) {
      srcEl.textContent = "Not connected";
      updEl.textContent = "";
      return;
    }
    srcEl.textContent = `Live from ${sources.map((s) => s.name).join(" + ")}`;
    // Several feeds land at different times; the oldest is the honest answer
    // to "how current is this page".
    const oldest = sources.reduce((a, b) => (Date.parse(a.at) < Date.parse(b.at) ? a : b));
    updEl.textContent = `Updated ${new Date(oldest.at).toLocaleString()}`;
  }

  // The ring used to be a fixed orange-to-purple gradient, which looked like a
  // severity signal while carrying no information at all — 95% and 25% drew the
  // same colours. The arc length is one encoding; the colour is now a second,
  // reading straight off the score.
  const healthColor = (pct) => verdictFor(Math.round(Number(pct) || 0)).color;

  function ringSvg(pct, size) {
    const r = size / 2 - 14;
    const c = 2 * Math.PI * r;
    const on = (Math.max(0, Math.min(100, pct)) / 100) * c;
    return `
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ov-ring">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--gridline)" stroke-width="16"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${healthColor(pct)}" stroke-width="16"
                stroke-linecap="round" stroke-dasharray="${on.toFixed(1)} ${(c - on).toFixed(1)}"
                transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>`;
  }

  function renderOverviewHealth() {
    const scoreEl = document.getElementById("ov-health-score");
    if (!scoreEl) return;

    // Built from LIVE feeds only. This used to average in cameras, VLANs and
    // licences — all three of which are hand-maintained files that no sync
    // touches — so 60% of a number labelled "Network health" could not change
    // no matter what the network did. Worse, the 188 access points, by far the
    // largest thing being polled, were left out entirely.
    //
    // Cameras, VLANs and licences still matter; they have their own pages and
    // their own alerts. They are just not evidence of health right now.
    const dev = deviceStats();
    const devPct = pctOrNull(dev.up, dev.known);

    const w = typeof WIRELESS !== "undefined" ? WIRELESS : null;
    // Dormant means never brought online or powered down on schedule, which is
    // not a fault — counting it against health would permanently cap the score.
    const apKnown = w ? (w.total || 0) - (w.counts?.dormant || 0) : 0;
    const apPct = apKnown > 0 ? pctOrNull(w.counts?.up || 0, apKnown) : null;

    const score = healthScore([
      { pct: devPct, weight: 3 },
      { pct: apPct, weight: 4 },
    ]);

    if (score == null) {
      scoreEl.innerHTML = `—`;
      document.getElementById("ov-health-verdict").textContent = "No data";
      document.getElementById("ov-health-note").textContent = "No feed has reported yet.";
      document.getElementById("ov-health-ring").innerHTML = ringSvg(0, 210);
      return;
    }

    const v = verdictFor(score);
    scoreEl.innerHTML = `${score}<span class="ov-pct">%</span>`;
    const verdictEl = document.getElementById("ov-health-verdict");
    // verdictFor returns { word, tone, color }. This read `v.label` / `v.status`,
    // which are not fields on it, so the verdict word rendered blank.
    verdictEl.innerHTML = `<span style="color:${v.color}">${esc(v.word)}</span> <span class="dot status-dot-${v.tone}"></span>`;

    // Only things a feed reported. The old version listed inactive cameras and
    // licences needing action, both read from hand-maintained files, so the same
    // sentence sat there unchanged for weeks and read as a stuck display.
    const problems = [];
    if (dev.down) problems.push(`${dev.down} core device${dev.down === 1 ? "" : "s"} down`);
    if (w?.counts?.down) problems.push(`${w.counts.down} AP${w.counts.down === 1 ? "" : "s"} offline`);
    if (w?.counts?.warning) problems.push(`${w.counts.warning} APs alerting`);

    document.getElementById("ov-health-note").innerHTML = problems.length
      ? esc(problems.join(" · "))
      : `All ${dev.known + apKnown} polled devices reporting healthy.`;
    document.getElementById("ov-health-ring").innerHTML = ringSvg(score, 210);
  }

  function renderOverviewStats() {
    const el = document.getElementById("ov-stats");
    if (!el) return;

    const dev = deviceStats();
    const published = (typeof DEVICE_STATUS !== "undefined" && DEVICE_STATUS.published) || DEVICES.length;
    // Attested devices are accounted for, just not by a poller. Leaving them in
    // "not reporting" would keep flagging a gap that has already been answered.
    const notReporting = published - dev.known - dev.attested;
    const wl = typeof WIRELESS !== "undefined" ? WIRELESS : null;
    const apTotal = wl?.total || 0;
    const apDown = wl?.counts?.down || 0;
    const apWarn = wl?.counts?.warning || 0;
    const cam = cameraStats(null);
    const vlanUp = VLANS.filter((v) => String(v.status).toLowerCase() === "up").length;
    const licOk = LICENSES.filter((l) => !["critical", "warning"].includes(licenseStatus(l))).length;
    const cards = [
      {
        icon: "icon-devices", title: "Devices",
        // Access points are included. Showing 30 while Meraki polls another 188
        // made the estate look an order of magnitude smaller than it is, and the
        // APs are where nearly all the faults actually are.
        //
        // Count every documented device, not just the ones reporting — showing
        // only reporters would silently shrink the estate when a poller drops.
        value: published + apTotal, unit: "", sub: apTotal ? `Incl. ${apTotal} access points` : "Monitored",
        bad: [
          dev.down ? `${dev.down} core down` : null,
          apDown ? `${apDown} AP${apDown === 1 ? "" : "s"} down` : null,
          apWarn ? `${apWarn} alerting` : null,
          notReporting > 0 ? `${notReporting} not reporting` : null,
        ].filter(Boolean).join(" · ") || null,
        link: "panel-devices", linkText: "View devices",
      },
      {
        icon: "icon-camera", title: "Cameras",
        value: cam ? Math.round((cam.active / cam.total) * 100) : null, unit: "%", sub: "Active",
        bad: cam && cam.total - cam.active ? `${cam.total - cam.active} down` : null,
        link: "panel-cctv", linkText: "View cameras",
      },
      {
        icon: "icon-vlans", title: "VLANs",
        value: VLANS.length ? Math.round((vlanUp / VLANS.length) * 100) : null, unit: "%", sub: "Up",
        bad: VLANS.length - vlanUp ? `${VLANS.length - vlanUp} down` : null,
        link: "panel-vlans", linkText: "View VLANs",
      },
      {
        icon: "icon-license", title: "Licenses",
        value: LICENSES.length ? Math.round((licOk / LICENSES.length) * 100) : null, unit: "%", sub: "In good standing",
        bad: LICENSES.length - licOk ? `${LICENSES.length - licOk} action needed` : null,
        link: "panel-licenses", linkText: "View licenses",
      },
    ];

    el.innerHTML = cards.map((c) => `
      <div class="card ov-stat">
        <div class="ov-stat-head"><svg class="icon"><use href="#${c.icon}"/></svg><span>${esc(c.title)}</span></div>
        <div class="ov-stat-value">${c.value == null ? "—" : esc(Number(c.value).toLocaleString())}${c.unit ? `<span class="ov-pct">${c.unit}</span>` : ""}</div>
        <div class="ov-stat-sub">${esc(c.sub)}</div>
        <div class="ov-stat-bad">${c.bad ? esc(c.bad) : ""}</div>
        <button type="button" class="ov-stat-link" data-panel="${esc(c.link)}">${esc(c.linkText)} <svg class="icon"><use href="#icon-arrow"/></svg></button>
      </div>`).join("");
  }

  // Availability is computed from the devices that actually report, per site.
  // Sites with no reporting device are shown as "no data" rather than 100%,
  // because an empty average would otherwise look perfect.
  function renderOverviewCampus() {
    const el = document.getElementById("ov-campus");
    if (!el) return;

    const wifiSites = typeof WIRELESS !== "undefined" ? WIRELESS.bySite || [] : [];
    // "Core" is a layer that spans both campuses, not a campus — showing it
    // here would report shared kit as if it were a site. Meraki network names
    // contribute campuses that have wireless but no documented switch.
    const NOT_A_CAMPUS = /^(core|shared|test)$/i;
    const fromDevices = [...new Set(DEVICES.map((d) => d.site).filter(Boolean))];
    const fromWifi = wifiSites.map((w) => String(w.label).replace(/^SACS-/i, ""));
    const sites = [...new Set([...fromDevices, ...fromWifi])]
      .filter((s) => !NOT_A_CAMPUS.test(s) && !HIDDEN_SITES.test(s));

    const cards = sites.map((site) => {
      const list = DEVICES.filter((d) => d.site === site);
      const known = list.filter((d) => isPolled(deviceStatus(d.id)));
      const up = known.filter((d) => deviceStatus(d.id) === "up").length;
      const layers = [...new Set(list.map((d) => d.layer).filter(Boolean))];
      // Match the site to a Meraki network by code, e.g. SAH -> SACS-SAH.
      const wifi = wifiSites.find((w) => new RegExp(`(^|[-_])${site}([-_]|$)`, "i").test(w.label));
      return {
        site, layers,
        pct: known.length ? Math.round((up / known.length) * 100) : null,
        known: known.length, total: list.length,
        aps: wifi ? wifi.total : null, apsUp: wifi ? wifi.up : null,
      };
    }).sort((a, b) => b.total - a.total);

    el.innerHTML = cards.map((c) => {
      const status = c.pct == null ? "unknown" : c.pct >= 95 ? "up" : c.pct >= 80 ? "warning" : "down";
      return `
        <div class="ov-campus-card">
          <div class="ov-campus-head">
            <svg class="icon"><use href="#icon-devices"/></svg>
            <span class="ov-campus-name">${esc(c.site)}</span>
            <span class="dot status-dot-${status}"></span>
          </div>
          <div class="ov-campus-layers">${esc(c.layers.join(" · ") || "—")}</div>
          <div class="ov-campus-value">${c.pct == null ? "—" : esc(c.pct)}${c.pct == null ? "" : `<span class="ov-pct">%</span>`}</div>
          <div class="ov-campus-sub">${c.pct == null ? "No device reporting" : `${esc(c.known)} of ${esc(c.total)} reporting`}</div>
          ${c.aps != null ? `<div class="ov-campus-wifi">${esc(c.apsUp)}/${esc(c.aps)} APs up</div>` : ""}
        </div>`;
    }).join("");
  }

  // Real issues from the feeds that are wired up, newest signal first. This is
  // not a ticket list — it is what the monitoring is currently complaining
  // about, which is why it can be empty.
  function renderOverviewInbox() {
    const el = document.getElementById("ov-inbox");
    if (!el) return;
    const items = [];

    Object.entries((typeof DEVICE_STATUS !== "undefined" ? DEVICE_STATUS.devices : {}) || {}).forEach(([id, s]) => {
      if (s.status !== "down") return;
      const d = DEVICES.find((x) => x.id === id);
      items.push({
        sev: "critical", title: "Device down",
        meta: `${d ? d.name : id}${d && d.site ? " · " + d.site : ""}`,
        tag: "Network", at: s.lastSeen, panel: "panel-devices",
      });
    });

    ((typeof WIRELESS !== "undefined" ? WIRELESS.fleet?.devices : null) || [])
      .filter((d) => d.status === "warning" || d.status === "down")
      .slice(0, 6)
      .forEach((d) => items.push({
        sev: d.status === "down" ? "critical" : "warning",
        title: d.status === "down" ? `${d.kind} offline` : `${d.kind} alerting`,
        meta: `${d.name} · ${d.site}`, tag: "Wireless", at: d.lastSeen, panel: "panel-devices",
      }));

    ((typeof ENDPOINT_SUMMARY !== "undefined" ? ENDPOINT_SUMMARY.alerts?.byCondition : null) || [])
      .slice(0, 3)
      .forEach((c) => items.push({
        sev: "warning", title: c.label,
        meta: `${c.value} endpoint${c.value === 1 ? "" : "s"}`, tag: "Endpoints",
        at: typeof ENDPOINT_SUMMARY !== "undefined" ? ENDPOINT_SUMMARY.updatedAt : null,
        panel: "panel-endpoints",
      }));

    ((typeof SECURITY_SUMMARY !== "undefined" ? SECURITY_SUMMARY.queue : null) || [])
      .slice(0, 4)
      .forEach((q) => items.push({
        sev: AW_ATTENTION.has(q.priority) ? "critical" : "info",
        title: q.category, meta: `Arctic Wolf #${q.id} · ${q.priority}`,
        tag: "Security", at: q.updatedAt || q.createdAt, panel: "panel-security",
      }));

    LICENSES.filter((l) => ["critical", "warning"].includes(licenseStatus(l)))
      .slice(0, 4)
      .forEach((l) => items.push({
        sev: licenseStatus(l) === "critical" ? "critical" : "warning",
        title: "Licence needs action", meta: `${l.product || l.id}${l.host ? " · " + l.host : ""}`,
        tag: "License", at: null, panel: "panel-licenses",
      }));

    const SEV_ORDER = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) =>
      SEV_ORDER[a.sev] - SEV_ORDER[b.sev] ||
      (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0));

    if (!items.length) {
      el.innerHTML = `<p class="muted-text" style="margin:0">Nothing is currently flagged by the connected monitoring.</p>`;
      return;
    }

    el.innerHTML = items.slice(0, 8).map((i) => `
      <button type="button" class="ov-inbox-row" data-panel="${esc(i.panel)}">
        <span class="ov-inbox-dot sev-${esc(i.sev)}"></span>
        <span class="ov-inbox-text">
          <span class="ov-inbox-title">${esc(i.title)}</span>
          <span class="ov-inbox-meta">${esc(i.meta)}</span>
        </span>
        <span class="ov-tag">${esc(i.tag)}</span>
        <span class="ov-inbox-age">${i.at ? esc(relativeAge(i.at)) : ""}</span>
      </button>`).join("");
  }

  function relativeAge(ts) {
    const ms = Date.now() - Date.parse(ts);
    if (!Number.isFinite(ms) || ms < 0) return "";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // Trends need a time series, and nothing here stores one yet — every sync
  // overwrites its data file. Rather than draw a plausible-looking line from
  // a single sample, this says what is missing.
  function renderOverviewTrends() {
    const el = document.getElementById("ov-trends");
    if (!el) return;

    const history = typeof HISTORY !== "undefined" ? HISTORY : null;
    if (!history || !(history.samples || []).length) {
      el.innerHTML = `
        <p class="muted-text" style="margin:0 0 10px">
          No 24-hour history yet. The syncs currently overwrite their data each
          run, so there is no time series to plot — drawing one from a single
          sample would be inventing a trend.
        </p>
        <p class="muted-text" style="margin:0">
          Once history collection is enabled, device availability, wireless
          health and open alerts will chart here.
        </p>`;
      return;
    }

    const series = [
      { key: "devicesUp", label: "Devices up", color: "var(--layer-core)" },
      { key: "apsUp", label: "Access points up", color: "var(--status-good)" },
      { key: "openAlerts", label: "Open alerts", color: "var(--status-warning)" },
    ];

    el.innerHTML = series.map((s) => {
      const pts = history.samples.map((x) => x[s.key]).filter((v) => v != null);
      if (!pts.length) return "";
      const last = pts[pts.length - 1];
      const first = pts[0];
      const delta = first ? Math.round(((last - first) / first) * 100) : 0;
      const max = Math.max(...pts, 1);
      const min = Math.min(...pts, 0);
      const span = max - min || 1;
      const d = pts.map((v, i) =>
        `${(i / Math.max(pts.length - 1, 1)) * 100},${30 - ((v - min) / span) * 26}`).join(" ");
      return `
        <div class="ov-trend">
          <div class="ov-trend-head">
            <span class="ov-trend-label">${esc(s.label)}</span>
            <span class="ov-trend-value">${esc(last)}
              <span class="ov-trend-delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "▲" : "▼"} ${esc(Math.abs(delta))}%</span>
            </span>
          </div>
          <svg class="ov-spark" viewBox="0 0 100 32" preserveAspectRatio="none">
            <polyline points="${d}" fill="none" stroke="${s.color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
          </svg>
        </div>`;
    }).join("");
  }

  // A compact read-only version of the topology: same data, no interaction,
  // sized for a card. Clicking through opens the real one.
  // Compact read-only version of the topology: same data, no interaction,
  // sized for a card. Clicking through opens the real one.
  function renderOverviewMiniTopo() {
    const el = document.getElementById("ov-mini-topo");
    if (!el) return;
    const w = topoState.world || (topoState.world = buildTopoWorld());

    const byKind = (k) => w.nodes.filter((n) => n.kind === k);
    const fw = byKind("firewall");
    const core = byKind("core");
    const switchCount = byKind("switch").length;
    const apCount = (meraki().devices || []).filter((d) => d.productType === "wireless").length;
    const sensorCount = (meraki().devices || []).filter((d) => d.productType === "sensor").length;

    const chip = (n) => `
      <div class="ov-chip" title="${esc(n.name)}${n.sub ? " — " + esc(n.sub) : ""}">
        <span class="ov-chip-icon" style="color:${TOPO_COLOR[n.kind] || "var(--baseline)"}">
          <svg class="icon"><use href="#${TOPO_ICON[n.kind]}"/></svg>
        </span>
        <span class="ov-chip-text">
          <span class="ov-chip-name">${esc(n.name)}</span>
          <span class="ov-chip-sub">${esc(n.sub || "")}</span>
        </span>
        <span class="dot status-dot-${n.status}"></span>
      </div>`;

    const groups = [
      { label: "Access switches", count: switchCount, unit: "devices", color: TOPO_COLOR.switch, icon: TOPO_ICON.switch },
      { label: "Wireless APs", count: apCount, unit: "devices", color: TOPO_COLOR.ap, icon: TOPO_ICON.ap },
      { label: "Sensors", count: sensorCount, unit: "devices", color: TOPO_COLOR.sensor, icon: TOPO_ICON.sensor },
      { label: "CCTV cameras", count: (cameraStats(null) || {}).total || 0, unit: "cameras", color: "var(--layer-security)", icon: "icon-camera" },
    ];

    el.innerHTML = `
      <div class="ov-tier">${fw.map(chip).join("")}</div>
      <div class="ov-tier-line"></div>
      <div class="ov-tier">${core.map(chip).join("")}</div>
      <div class="ov-tier-line"></div>
      <div class="ov-tier ov-tier-groups">
        ${groups.map((g) => `
          <div class="ov-group-chip" style="border-color:${g.color}">
            <span class="ov-chip-icon" style="color:${g.color}"><svg class="icon"><use href="#${g.icon}"/></svg></span>
            <span class="ov-chip-text">
              <span class="ov-chip-name">${esc(g.label)}</span>
              <span class="ov-chip-sub">${esc(g.count)} ${esc(g.unit)}</span>
            </span>
          </div>`).join("")}
      </div>`;
  }

  function renderOverview() {
    renderOverviewMeta();
    renderOverviewHealth();
    renderOverviewStats();
    renderOverviewCampus();
    renderOverviewInbox();
    renderOverviewMiniTopo();
    renderOverviewTrends();
  }

  function initOverview() {
    document.getElementById("ov-refresh")?.addEventListener("click", () => location.reload());
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
    // so say so rather than letting it read as healthy. Devices carrying a
    // recorded manual check are counted apart — they are unpolled but not
    // unaccounted for, and lumping them in reports a gap that is already closed.
    const attested = DEVICES.filter((d) => d.attested && !DEVICE_STATUS.devices?.[d.id]).length;
    const notReporting = (DEVICE_STATUS.published || entries.length) - entries.length - attested;

    let health = `<strong>${up} up</strong>`;
    if (warn) health += ` · <strong>${warn} warning</strong>`;
    if (down) health += ` · <strong>${down} down</strong>`;
    if (attested > 0) health += ` · ${attested} confirmed manually`;
    if (notReporting > 0) health += ` · ${notReporting} not reporting`;

    el.innerHTML = `${health} — live from <strong>${esc(DEVICE_STATUS.source || "poller")}</strong>, updated ${esc(when)}.`;
    if (banner) {
      banner.style.borderLeftColor = down
        ? "var(--status-critical)"
        : warn ? "var(--status-warning)" : "var(--status-good)";
    }
  }

  // ---------------------------------------------------------------------
  // Alerts (data/alert-state.js, written by check-alerts.yml)
  // ---------------------------------------------------------------------
  // Deliberately reads the alert engine's own state file rather than
  // re-evaluating the thresholds here. Two implementations of "what counts as
  // an alert" would drift, and the page would eventually disagree with the
  // Teams message about the same estate.
  const ALERT_SEV_RANK = { critical: 0, warning: 1 };

  // Acknowledgements. There is no backend, so these live in this browser only.
  //
  // Two rules make this safe rather than a way of hiding problems:
  //   1. Acknowledging never deletes. The row moves to a collapsed section that
  //      still shows a count, so an acknowledged fault stays visible as a fact.
  //   2. An acknowledgement is bound to the occurrence it was made against, via
  //      the alert's `at` timestamp. If the condition clears and returns, or is
  //      re-announced, `at` changes and the acknowledgement stops applying — so
  //      a new occurrence of an old problem always comes back.
  const ACK_KEY = "sacs-alert-acks";

  function loadAcks() {
    try {
      return JSON.parse(localStorage.getItem(ACK_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveAcks(acks) {
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify(acks));
    } catch (e) {
      /* storage disabled or full — acknowledging simply will not persist */
    }
  }

  function setAck(key, at, on) {
    const acks = loadAcks();
    if (on) acks[key] = { at: at || null, ackedAt: new Date().toISOString() };
    else delete acks[key];
    saveAcks(acks);
    renderAlerts();
  }

  function alertRowHtml(r, acked) {
    return `
      <div class="alert-row sev-${esc(r.severity || "warning")}${acked ? " acked" : ""}">
        <div class="alert-row-head">
          <span class="badge alert-sev">${esc((r.severity || "warning").toUpperCase())}</span>
          <strong>${esc(r.title)}</strong>
          <button type="button" class="alert-ack-btn" data-ack="${esc(r.key)}"
                  data-at="${esc(r.at || "")}" data-on="${acked ? "0" : "1"}">
            ${acked ? "Restore" : "Mark done"}
          </button>
        </div>
        ${r.detail ? `<p class="alert-detail">${esc(r.detail)}</p>` : ""}
        <p class="alert-since">Since ${r.at ? esc(new Date(r.at).toLocaleString()) : "unknown"}${
          acked && r.ackedAt ? ` · marked done ${esc(new Date(r.ackedAt).toLocaleString())}` : ""
        }</p>
      </div>`;
  }

  function renderAlerts() {
    const list = document.getElementById("alerts-list");
    if (!list) return;
    const state = typeof ALERT_STATE === "undefined" ? null : ALERT_STATE;
    const acks = loadAcks();

    const all = Object.entries(state?.seen || {})
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (ALERT_SEV_RANK[a.severity] ?? 9) - (ALERT_SEV_RANK[b.severity] ?? 9)
        || Date.parse(b.at || 0) - Date.parse(a.at || 0));

    // An acknowledgement only counts against the same occurrence.
    const isAcked = (r) => acks[r.key] && (acks[r.key].at || null) === (r.at || null);
    const open = all.filter((r) => !isAcked(r));
    const done = all.filter(isAcked).map((r) => ({ ...r, ackedAt: acks[r.key].ackedAt }));

    // Drop acknowledgements for conditions that are no longer active at all,
    // so the store cannot grow forever or silence a returning problem.
    const live = new Set(all.map((r) => r.key));
    let pruned = false;
    Object.keys(acks).forEach((k) => {
      if (!live.has(k)) { delete acks[k]; pruned = true; }
    });
    if (pruned) saveAcks(acks);

    const updated = document.getElementById("alerts-updated");
    const badge = document.getElementById("rail-alert-count");
    const crit = open.filter((r) => r.severity === "critical").length;

    // The badge counts what still needs attention, not what has been read.
    if (badge) {
      badge.hidden = open.length === 0;
      badge.textContent = String(open.length);
      badge.classList.toggle("crit", crit > 0);
    }

    if (updated) {
      updated.textContent = state?.updatedAt
        ? `${open.length} open${done.length ? `, ${done.length} marked done` : ""} · last evaluated ${new Date(state.updatedAt).toLocaleString()}`
        : "Never evaluated.";
    }

    let html = "";

    if (!all.length) {
      // "Nothing active" and "the checker never ran" look identical on a page
      // like this, and they mean opposite things, so they are said separately.
      html = state?.updatedAt
        ? `<div class="card"><p class="muted-text" style="margin:0">
             Nothing is currently tripping a threshold.</p></div>`
        : `<div class="card"><p class="muted-text" style="margin:0">
             The alert checker has not run yet, so this is not an all-clear —
             it is no data. Run the <code>Check alerts</code> workflow.</p></div>`;
    } else {
      html += open.length
        ? `<div class="alert-rows">${open.map((r) => alertRowHtml(r, false)).join("")}</div>`
        : `<div class="card"><p class="muted-text" style="margin:0">
             Everything currently tripping a threshold has been marked done.
             <strong>The conditions below are still true</strong> — the checker
             re-reports them until they actually clear.</p></div>`;

      if (done.length) {
        html += `
          <details class="alert-done" ${open.length ? "" : "open"}>
            <summary>${done.length} marked done <span class="muted-text">— still active, hidden from the list above</span></summary>
            <div class="alert-rows" style="margin-top:10px">
              ${done.map((r) => alertRowHtml(r, true)).join("")}
            </div>
            <button type="button" class="alert-ack-btn" id="alerts-restore-all"
                    style="margin-top:10px">Restore all</button>
          </details>`;
      }
    }

    list.innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // History (data/history.js, one sample per hour, 30-day retention)
  // ---------------------------------------------------------------------
  const HISTORY_SERIES = [
    { key: "devicesUp", label: "Core devices up", color: "var(--layer-core)" },
    { key: "apsUp", label: "Access points up", color: "var(--status-good)" },
    { key: "apsDown", label: "Access points down", color: "var(--status-critical)", invert: true },
    { key: "endpointsOnline", label: "Endpoints online", color: "var(--prio-3)" },
    { key: "endpointAlerts", label: "Endpoint alerts", color: "var(--status-warning)", invert: true },
    { key: "ticketsOpen", label: "Open tickets", color: "var(--prio-4)", invert: true },
    { key: "ticketsUrgent", label: "Urgent tickets", color: "var(--prio-1)", invert: true },
    { key: "securityOpen", label: "Open security tickets", color: "var(--status-serious)", invert: true },
  ];

  // A gap in a feed is stored as null, not zero — plotting it as zero would
  // draw a cliff that never happened. Nulls break the line instead.
  function historyPathHtml(pts, color, w, h) {
    const vals = pts.filter((p) => p.v != null).map((p) => p.v);
    if (vals.length < 2) return null;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const span = max - min || 1;
    const x = (i) => (i / Math.max(pts.length - 1, 1)) * w;
    const y = (v) => h - 4 - ((v - min) / span) * (h - 10);

    let d = "";
    let pen = false;
    pts.forEach((p, i) => {
      if (p.v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)} `;
      pen = true;
    });
    return { d, min, max };
  }

  function renderHistory() {
    const mount = document.getElementById("history-charts");
    if (!mount) return;
    const H = typeof HISTORY === "undefined" ? null : HISTORY;
    const samples = (H && H.samples) || [];
    const updated = document.getElementById("history-updated");

    if (samples.length < 2) {
      if (updated) {
        updated.textContent = samples.length
          ? `${samples.length} sample so far — collection started ${new Date(samples[0].at).toLocaleString()}`
          : "No samples yet.";
      }
      // One point is not a trend. Saying so beats drawing a flat line that
      // looks like stability.
      mount.innerHTML = `<div class="card"><p class="muted-text" style="margin:0">
        ${samples.length
          ? `Only ${samples.length} sample collected so far. Charts appear once there are at least two — a single point cannot show a change.`
          : `No history collected yet. The <code>Collect history sample</code> workflow runs hourly at :55.`}
      </p></div>`;
      return;
    }

    const first = samples[0], last = samples[samples.length - 1];
    // Early on the span is minutes, and "over 0h" reads like a bug.
    const mins = Math.round((Date.parse(last.at) - Date.parse(first.at)) / 60000);
    const span = mins < 90 ? `${mins} min`
      : mins < 2880 ? `${Math.round(mins / 60)}h`
      : `${Math.round(mins / 1440)} days`;
    if (updated) {
      updated.textContent = `${samples.length} samples over ${span} · latest ${new Date(last.at).toLocaleString()}`;
    }

    const W = 260, Hh = 54;
    const cards = HISTORY_SERIES.map((s) => {
      const pts = samples.map((x) => ({ at: x.at, v: x[s.key] == null ? null : Number(x[s.key]) }));
      const known = pts.filter((p) => p.v != null);
      if (known.length < 2) return "";

      const path = historyPathHtml(pts, s.color, W, Hh);
      if (!path) return "";
      const a = known[0].v, b = known[known.length - 1].v;
      const diff = b - a;
      // "Better" is not always "up": more open tickets is worse. invert says so.
      const good = s.invert ? diff <= 0 : diff >= 0;
      const arrow = diff === 0 ? "→" : diff > 0 ? "▲" : "▼";

      return `
        <div class="hist-card">
          <div class="hist-head">
            <span class="hist-label">${esc(s.label)}</span>
            <span class="hist-now">${esc(b)}</span>
          </div>
          <svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" class="hist-spark">
            <path d="${path.d.trim()}" fill="none" stroke="${s.color}" stroke-width="2"
                  stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
          <div class="hist-foot">
            <span class="hist-delta ${good ? "good" : "bad"}">${arrow} ${esc(Math.abs(diff))}</span>
            <span class="muted-text">range ${esc(path.min)}–${esc(path.max)}</span>
          </div>
        </div>`;
    }).filter(Boolean).join("");

    mount.innerHTML = `<div class="hist-grid">${cards}</div>`;
  }

  // ---------------------------------------------------------------------
  // Backups (data/backups.js — an index only, never configuration)
  // ---------------------------------------------------------------------
  function renderBackups() {
    const mount = document.getElementById("backups-body");
    if (!mount) return;
    const B = typeof BACKUPS === "undefined" ? null : BACKUPS;
    const snaps = (B && B.snapshots) || [];
    const updated = document.getElementById("backups-updated");

    if (!snaps.length) {
      if (updated) updated.textContent = "No backup has run yet.";
      mount.innerHTML = `<div class="card">
        <p style="margin:0 0 8px"><strong>No configuration backup has been taken yet.</strong></p>
        <p class="muted-text" style="margin:0 0 8px">
          This is not a display problem — there is genuinely nothing stored. The
          workflow needs a <code>BACKUP_PASSPHRASE</code> repository secret before
          it will run; it refuses to continue without one rather than write
          pre-shared keys and firewall rules in plaintext to a public repository.
        </p>
        <p class="muted-text" style="margin:0">
          Generate one with <code>openssl rand -base64 32</code>, add it at
          <em>Settings → Secrets and variables → Actions</em>, then use
          <strong>Run a backup now</strong> above. Keep a copy of the passphrase
          somewhere outside this repository — it is the only thing that can open
          the backups.
        </p>
      </div>`;
      return;
    }

    const latest = snaps[snaps.length - 1];
    const ageH = (Date.now() - Date.parse(latest.at)) / 3600000;
    const stale = ageH > 36;
    if (updated) {
      const n = B.total || snaps.length;
      updated.textContent = `${n} snapshot${n === 1 ? "" : "s"} retained · latest ${new Date(latest.at).toLocaleString()}`;
    }

    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
    const c = latest.counts || {};

    mount.innerHTML = `
      <div class="card">
        <h2>Latest snapshot</h2>
        ${stale ? `<p class="alert-detail" style="color:var(--status-warning)">
          <strong>Last backup was ${Math.round(ageH)} hours ago.</strong> The schedule is
          daily, so this one is overdue — check the workflow.</p>` : ""}
        <div class="table-wrap">
          <table>
            <tbody>
              <tr><td class="name">Taken</td><td>${esc(new Date(latest.at).toLocaleString())}</td></tr>
              <tr><td class="name">Networks</td><td>${esc(latest.networks)}</td></tr>
              <tr><td class="name">Devices</td><td>${esc(latest.devices)}</td></tr>
              <tr><td class="name">Enabled SSIDs</td><td>${esc(c.ssids ?? "—")}</td></tr>
              <tr><td class="name">Group policies</td><td>${esc(c.groupPolicies ?? "—")}</td></tr>
              <tr><td class="name">Switch ports</td><td>${esc(c.switchPorts ?? "—")}</td></tr>
              <tr><td class="name">VLANs</td><td>${esc(c.vlans ?? "—")}${
                c.vlans === 0 ? ` <span class="muted-text">— none in Meraki</span>` : ""}</td></tr>
              <tr><td class="name">Firewall rules</td><td>${esc(c.firewallRules ?? "—")}${
                c.firewallRules === 0 ? ` <span class="muted-text">— none in Meraki</span>` : ""}</td></tr>
              <tr><td class="name">Encrypted size</td><td>${esc(kb(latest.bytes || 0))}</td></tr>
              ${/* No inline currentColor: the badge sets no colour of its own, so
                    currentColor resolves to body text and the dot renders black. */ ""}
              <tr><td class="name">Restore verified</td><td>${latest.restoreChecked
                ? `<span class="badge"><span class="dot status-dot-up"></span>Yes, decrypted and read back</span>`
                : `<span class="badge"><span class="dot status-dot-unknown"></span>Not checked</span>`}</td></tr>
            </tbody>
          </table>
        </div>
        ${(c.vlans === 0 && c.firewallRules === 0) ? `
          <p class="alert-detail" style="border-left:3px solid var(--status-warning);padding-left:10px">
            <strong>This does not back up your firewall rules.</strong> Those zeros are
            correct, not a failure: there are no Meraki MX appliances here, so Meraki
            holds no VLANs or firewall rules to export. Routing and firewalling live on
            the Palo Alto pair and the Cisco core, which need their own backup — this
            snapshot covers the wireless and switching estate only.
          </p>` : ""}
        <p class="muted-text" style="margin:10px 0 0">
          Every snapshot is decrypted and re-read immediately after it is written.
          A backup nobody has opened is a hope, not a backup.
        </p>
      </div>

      <div class="card">
        <h2>How to restore</h2>
        <p class="muted-text" style="margin:0 0 8px">
          Download the file from the <code>backups/</code> folder of the repository, then:
        </p>
        <pre class="code-block">gpg --decrypt --output config.json ${esc(latest.file || "backups/meraki-....json.gpg")}</pre>
        <p class="muted-text" style="margin:8px 0 0">
          It will prompt for the passphrase. The result is JSON — apply the parts
          you need through the Meraki dashboard or API. This is a record to read
          from, not an automatic rollback.
        </p>
      </div>

      <div class="card">
        <h2>All snapshots</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Taken</th><th>Networks</th><th>Devices</th><th>Size</th><th>SHA-256</th></tr></thead>
            <tbody>
              ${[...snaps].reverse().map((s) => `
                <tr>
                  <td>${esc(new Date(s.at).toLocaleString())}</td>
                  <td>${esc(s.networks)}</td>
                  <td>${esc(s.devices)}</td>
                  <td>${esc(kb(s.bytes || 0))}</td>
                  <td class="ip">${esc((s.sha256 || "").slice(0, 16))}…</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function initAlerts() {
    const list = document.getElementById("alerts-list");
    if (!list) return;
    list.addEventListener("click", (e) => {
      if (e.target.id === "alerts-restore-all") { saveAcks({}); renderAlerts(); return; }
      const btn = e.target.closest("[data-ack]");
      if (!btn) return;
      setAck(btn.dataset.ack, btn.dataset.at || null, btn.dataset.on === "1");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initTheme();
    initAccountMenu();

    initAlerts();
    renderAlerts();
    renderHistory();
    renderBackups();
    renderTickets();
    initTicketListFilters();
    renderTicketsPage();
    renderEndpoints();
    initSecurityQueueFilters();
    renderSecurity();
    initOverview();
    renderOverview();
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
    renderSharePointSteps();
    initSortableTables();
    watchForNewTables();
    initSharePoint();
    renderSharePoint();
  });
})();
