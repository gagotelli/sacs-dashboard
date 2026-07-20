// Live status data layer — intentionally empty in v1.
//
// The dashboard reads DEVICE_STATUS.devices[id] for each device in DEVICES
// (see devices.js) and falls back to "unknown" when a device has no entry
// here. This keeps the UI wired for live monitoring without requiring it:
// a future poller can overwrite just this file (or replace it with a fetch()
// against a small JSON endpoint) and every view — KPI tiles, topology map,
// device table — updates with no other code changes.
//
// Planned data source: vendor APIs reachable only from inside the school
// network (see README.md → "Wiring up live status"):
//   - Meraki Dashboard API      → SAH/BBC access point status
//   - Palo Alto PAN-OS XML/REST API → Firewall A / B health, HA state
//   - Aruba ClearPass API       → NAC/RADIUS service health
//   - Arctic Wolf               → sensor heartbeat (vendor-dependent API access)
//   - SNMP/ICMP poller          → Nexus/Catalyst core and access switches
//
// Status values: "up" | "warning" | "down" | "unknown"
const DEVICE_STATUS = {
  updatedAt: null,
  source: null,
  devices: {
    // "sqcs-sah-swc-01": { status: "up", latencyMs: 2, lastSeen: "2026-07-20T09:00:00Z" },
  },
};
