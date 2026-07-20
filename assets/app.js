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
  const STATUS_LABEL = {
    up: "Up",
    warning: "Warning",
    serious: "Degraded",
    critical: "Down",
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
      document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("active", b.dataset.panel === panelId));
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
      if (el.classList.contains("nav-card") || el.classList.contains("doc-row") || el.classList.contains("legend-row-link")) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    const wanted = location.hash.replace("#", "");
    if (wanted) go("panel-" + wanted, false);
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

    function current() {
      return root.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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

  function legendHtml(items) {
    return items.map((i) => `
      <div class="legend-row-item">
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
  // Network at a glance (charts derived from inventory data — not live telemetry)
  // ---------------------------------------------------------------------
  function renderGlance() {
    const layerCounts = ["core", "security", "access", "legacy"].map((l) => ({
      value: DEVICES.filter((d) => d.layer === l).length,
      label: LAYER_LABEL[l],
      color: LAYER_COLOR[l],
    }));
    document.getElementById("glance-layer-donut").innerHTML = donutSvg(layerCounts, { centerLabel: "devices" });
    document.getElementById("glance-layer-legend").innerHTML = legendHtml(layerCounts);

    const statusCounts = ["critical", "warning", "unknown", "good"].map((s) => ({
      value: LICENSES.filter((l) => licenseStatus(l) === s).length,
      label: LICENSE_STATUS_LABEL[s],
      color: `var(--status-${s})`,
    }));
    document.getElementById("glance-license-donut").innerHTML = donutSvg(statusCounts, { centerLabel: "licenses" });
    document.getElementById("glance-license-legend").innerHTML = legendHtml(statusCounts);

    const licensesNeedingAction = LICENSES.filter((l) => ["critical", "warning"].includes(licenseStatus(l))).length;
    const legacyCount = DEVICES.filter((d) => d.layer === "legacy").length;
    const noRedundancyHosts = HOSTS.filter((h) => h.redundancy && /^no known/i.test(h.redundancy)).length;
    const attnItems = [
      { label: "Licenses to action", value: licensesNeedingAction, panel: "panel-licenses" },
      { label: "Legacy uplinks", value: legacyCount, panel: "panel-devices" },
      { label: "No DHCP failover", value: noRedundancyHosts, panel: "panel-hosts" },
    ];
    const attnTotal = attnItems.reduce((s, i) => s + i.value, 0);
    document.getElementById("glance-attention-ring").innerHTML = donutSvg(
      [{ value: 1, color: attnTotal > 0 ? "var(--status-warning)" : "var(--status-good)", label: "Flagged" }],
      { size: 132, thickness: 18, centerValue: attnTotal, centerLabel: "flagged" }
    );
    document.getElementById("glance-attention-list").innerHTML = attnItems.map((i) => `
      <button type="button" class="legend-row-item legend-row-link" data-panel="${esc(i.panel)}">
        <span class="swatch" style="background:${i.value > 0 ? 'var(--status-warning)' : 'var(--status-good)'}"></span>
        <span class="legend-row-label">${esc(i.label)}</span>
        <span class="legend-value">${esc(i.value)}</span>
      </button>`).join("");

    const siteCounts = ["SAH", "BBC", "Core"].map((s) => ({
      label: s === "Core" ? "Shared" : s,
      value: DEVICES.filter((d) => d.site === s).length,
    }));
    document.getElementById("glance-site-bars").innerHTML = barListHtml(siteCounts, "var(--layer-core)");

    const vlanCounts = VLAN_GROUPS.map((g) => ({ label: g.category, value: g.vlans.length }));
    document.getElementById("glance-vlan-bars").innerHTML = barListHtml(vlanCounts, "var(--layer-core)");

    const speedBuckets = {};
    DEVICES.forEach((d) => {
      if (d.uplink && d.uplink.speedGbps) speedBuckets[d.uplink.speedGbps] = (speedBuckets[d.uplink.speedGbps] || 0) + 1;
    });
    BACKBONE_LINKS.forEach((l) => { speedBuckets[l.speedGbps] = (speedBuckets[l.speedGbps] || 0) + 1; });
    const speedItems = Object.keys(speedBuckets)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => ({ label: `${k}G links`, value: speedBuckets[k] }));
    document.getElementById("glance-speed-bars").innerHTML = barListHtml(speedItems, "var(--layer-core)");
  }

  // ---------------------------------------------------------------------
  // KPI tiles
  // ---------------------------------------------------------------------
  function renderKpis() {
    const total = DEVICES.length;
    const bySite = { SAH: 0, BBC: 0 };
    DEVICES.forEach((d) => { if (bySite[d.site] !== undefined) bySite[d.site]++; });
    const legacyCount = DEVICES.filter((d) => d.layer === "legacy").length;
    const totalVlans = VLAN_GROUPS.reduce((n, g) => n + g.vlans.length, 0);
    const apInfra = CRITICAL_INFRA.find((c) => c.category === "Wireless Infrastructure");
    const totalAps = apInfra ? apInfra.items.find((i) => i.name === "Total APs") : null;
    const licensesNeedingAction = LICENSES.filter((l) => {
      const s = licenseStatus(l);
      return s === "critical" || s === "warning";
    }).length;

    const tiles = [
      { label: "Monitored devices", value: total },
      { label: "SAH devices", value: bySite.SAH },
      { label: "BBC devices", value: bySite.BBC },
      { label: "Legacy / 1G links", value: legacyCount },
      { label: "VLANs documented", value: totalVlans },
      { label: "Wireless APs", value: totalAps ? totalAps.detail.split(" —")[0] : "—" },
      { label: "Licenses needing action", value: licensesNeedingAction, color: licensesNeedingAction ? "var(--status-critical)" : null },
    ];

    document.getElementById("kpi-row").innerHTML = tiles.map((t) => `
      <div class="kpi-tile">
        <div class="value"${t.color ? ` style="color:${t.color}"` : ""}>${esc(t.value)}</div>
        <div class="label">${esc(t.label)}</div>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------------------
  // Topology (hand-laid SVG, generated from devices.js)
  // ---------------------------------------------------------------------
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

  function renderTopology() {
    const core = DEVICES.filter((d) => d.layer === "core");
    const security = DEVICES.filter((d) => d.layer === "security");
    const sah = DEVICES.filter((d) => d.site === "SAH" && d.layer !== "core");
    const bbc = DEVICES.filter((d) => d.site === "BBC" && d.layer !== "core");

    const nodeW = 148, nodeH = 42, gapX = 14, gapY = 12;
    const sahGrid = gridLayout(sah, 40, 300, 4, nodeW, nodeH, gapX, gapY);
    const bbcGrid = gridLayout(bbc, sahGrid.width + 40 + 60, 300, 3, nodeW, nodeH, gapX, gapY);

    const totalWidth = Math.max(sahGrid.width + 60 + bbcGrid.width + 80, 900);

    // core row, centered
    const coreW = 170, coreH = 50, coreGap = 30;
    const coreRowWidth = core.length * coreW + (core.length - 1) * coreGap;
    let cx = (totalWidth - coreRowWidth) / 2;
    const pos = {};
    core.forEach((d) => { pos[d.id] = { x: cx, y: 70, w: coreW, h: coreH }; cx += coreW + coreGap; });

    // security row, centered
    const secW = 170, secH = 46, secGap = 24;
    const secRowWidth = security.length * secW + (security.length - 1) * secGap;
    let sx = (totalWidth - secRowWidth) / 2;
    security.forEach((d) => { pos[d.id] = { x: sx, y: 175, w: secW, h: secH }; sx += secW + secGap; });

    Object.assign(pos, sahGrid.pos, bbcGrid.pos);
    const totalHeight = 300 + Math.max(sahGrid.height, bbcGrid.height) + 40;

    function anchorTop(p) { return { x: p.x + p.w / 2, y: p.y }; }
    function anchorBottom(p) { return { x: p.x + p.w / 2, y: p.y + p.h }; }
    function anchorCenter(p) { return { x: p.x + p.w / 2, y: p.y + p.h / 2 }; }

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
      if (pos[l.from] && pos[l.to]) links.push({ from: l.from, to: l.to, speed: l.speedGbps, label: l.label, backbone: true });
    });

    function widthFor(speed) {
      if (!speed) return 1.5;
      return Math.min(1.5 + Math.sqrt(speed) * 0.9, 8);
    }

    const svgParts = [];
    svgParts.push(`<svg id="topology-svg" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, -apple-system, sans-serif">`);

    // soft colored group backgrounds, echoing the source diagram's layer boxes
    function groupBox(deviceList, labelY, rgbVar) {
      if (!deviceList.length) return "";
      const xs = deviceList.map((d) => pos[d.id].x);
      const xs2 = deviceList.map((d) => pos[d.id].x + pos[d.id].w);
      const ys2 = deviceList.map((d) => pos[d.id].y + pos[d.id].h);
      const pad = 16;
      const top = labelY - 22;
      const x = Math.min(...xs) - pad;
      const width = Math.max(...xs2) - Math.min(...xs) + pad * 2;
      const height = Math.max(...ys2) - top + pad;
      return `<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="16" fill="rgba(var(${rgbVar}), 0.07)" stroke="rgba(var(${rgbVar}), 0.22)"/>`;
    }
    svgParts.push(groupBox(core, 55, "--layer-core-rgb"));
    svgParts.push(groupBox(security, 160, "--layer-security-rgb"));
    svgParts.push(groupBox(sah, 290, "--layer-access-rgb"));
    svgParts.push(groupBox(bbc, 290, "--layer-access-rgb"));

    // links (behind nodes, above group backgrounds)
    links.forEach((l) => {
      let from, to;
      if (l.backbone) {
        from = anchorCenter(pos[l.from]);
        to = anchorCenter(pos[l.to]);
      } else {
        // access/security device (below) uplinking to a core/security device (above)
        from = anchorTop(pos[l.from]);
        to = anchorBottom(pos[l.to]);
      }
      const midY = (from.y + to.y) / 2;
      const path = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
      svgParts.push(`<path class="topo-link" d="${path}" stroke-width="${widthFor(l.speed).toFixed(1)}" opacity="${l.backbone ? 0.85 : 0.55}"><title>${esc(l.label || "")} — ${esc(l.speed)}G</title></path>`);
    });

    function nodeSvg(d) {
      const p = pos[d.id];
      if (!p) return "";
      const color = LAYER_COLOR[d.layer] || "var(--baseline)";
      const status = deviceStatus(d.id);
      const sub = d.ip || "";
      return `
        <g class="topo-node" data-id="${esc(d.id)}">
          <title>${esc(d.name)}${d.model ? " — " + esc(d.model) : ""}${d.ip ? " — " + esc(d.ip) : ""}${d.note ? "\n" + esc(d.note) : ""}\nStatus: ${esc(STATUS_LABEL[status])}</title>
          <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="var(--surface-3)" stroke="${color}"/>
          <rect x="${p.x}" y="${p.y}" width="4" height="${p.h}" rx="2" fill="${color}"/>
          <circle class="status-dot-${status}" cx="${p.x + p.w - 10}" cy="${p.y + 10}" r="4"/>
          <text x="${p.x + 12}" y="${p.y + 17}">${esc(d.name)}</text>
          <text class="sub" x="${p.x + 12}" y="${p.y + 31}">${esc(sub)}</text>
        </g>`;
    }

    core.concat(security).forEach((d) => svgParts.push(nodeSvg(d)));
    sah.forEach((d) => svgParts.push(nodeSvg(d)));
    bbc.forEach((d) => svgParts.push(nodeSvg(d)));

    // group labels
    svgParts.push(`<text class="topo-group-label" x="40" y="290">SAH Access &amp; Distribution</text>`);
    svgParts.push(`<text class="topo-group-label" x="${sahGrid.width + 100}" y="290">BBC Access &amp; Distribution</text>`);
    svgParts.push(`<text class="topo-group-label" x="${(totalWidth - coreRowWidth) / 2}" y="55">Core Layer</text>`);
    svgParts.push(`<text class="topo-group-label" x="${(totalWidth - secRowWidth) / 2}" y="160">Security / Firewall</text>`);

    svgParts.push("</svg>");

    document.getElementById("topology-wrap").innerHTML = svgParts.join("\n");
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
    const el = document.getElementById("vlan-groups");
    el.innerHTML = VLAN_GROUPS.map((g) => `
      <div class="card">
        <h2>${esc(g.category)}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width:80px">VLAN</th><th>Name</th></tr></thead>
            <tbody>
              ${g.vlans.map((v) => `<tr><td class="ip">${esc(v.id)}</td><td>${esc(v.name)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `).join("");
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
  }

  // ---------------------------------------------------------------------
  // Documentation index
  // ---------------------------------------------------------------------
  function renderDocs() {
    const indexEl = document.getElementById("doc-index");
    indexEl.innerHTML = DOC_INDEX.map((cat) => `
      <div class="card doc-card">
        <h2>${esc(cat.category)}</h2>
        <div class="doc-list">
          ${cat.items.map((item) => {
            const tag = item.external ? "a" : "button";
            const attrs = item.external
              ? `href="${esc(item.href)}" target="_blank" rel="noopener"`
              : `type="button" data-panel="panel-${esc(item.href.replace('#', ''))}"`;
            const icon = item.external ? "icon-external" : "icon-arrow";
            return `
              <${tag} class="doc-row" ${attrs}>
                <span class="doc-row-text">
                  <span class="doc-row-title">${esc(item.title)}</span>
                  <span class="doc-row-desc">${esc(item.desc)}</span>
                </span>
                <svg class="icon doc-row-icon"><use href="#${icon}"/></svg>
              </${tag}>`;
          }).join("")}
        </div>
      </div>
    `).join("");

    const runbookEl = document.getElementById("runbooks");
    runbookEl.innerHTML = RUNBOOKS.map((r) => `
      <div class="card runbook-card">
        <h2>${esc(r.title)}</h2>
        <p class="muted-text">${esc(r.summary)}</p>
        <ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------------------
  // CNS roadmap notes
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
  // Status banner
  // ---------------------------------------------------------------------
  function renderStatusBanner() {
    const el = document.getElementById("status-banner-text");
    if (DEVICE_STATUS.updatedAt) {
      el.innerHTML = `Live status last updated <strong>${esc(DEVICE_STATUS.updatedAt)}</strong> from <strong>${esc(DEVICE_STATUS.source)}</strong>.`;
    } else {
      el.innerHTML = `<strong>Live status is not wired up yet.</strong> Every device below shows "Unknown" until a poller populates <code>data/status.js</code> — see README.md.`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initTheme();
    renderStatusBanner();
    renderKpis();
    renderGlance();
    renderTopology();
    renderDeviceTable();
    renderHosts();
    renderLicenses();
    renderVlans();
    renderCriticalInfra();
    renderPorts();
    renderCns();
    renderDocs();
  });
})();
