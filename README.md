# SACS Network Dashboard

A reference dashboard for the SACS network (SAH and BBC campuses), built from
the *SACS Topology (Current Final, with CNS)* diagram. It's a static site —
open `index.html` directly, or serve the folder with any static file host
(GitHub Pages works out of the box).

## What's in it

| Tab | Content |
|---|---|
| Overview | KPI tiles (device/VLAN/AP counts, licenses needing action) |
| Topology | Interactive map of core, security, and SAH/BBC access & distribution layers, generated from `data/devices.js` |
| Devices | Searchable/filterable inventory — name, model, site, layer, IP, uplink, status |
| Hosts & Systems | Servers, hypervisors and appliances behind the network devices — role, IP, OS, what it's hosted on, redundancy notes |
| Licenses | License/certificate/subscription expiry tracker with a color-coded status and days-remaining, across Windows hosts, Palo Alto, Meraki, ClearPass, and the ADCS root CAs |
| VLANs | Full VLAN table by category (management, servers, staff, student, AV/CCTV) |
| Critical Infrastructure | Identity, DHCP/file services, CCTV, cloud, security, Arctic Wolf MDR, wireless |
| Port & Speed Summary | Uplink port/speed reference for core, DMZ/firewall, SAH and BBC |
| CNS Roadmap | Now/transition/end-state notes for the firewall+DMZ L2 design and the SCEP/CPPM certificate flow |

## Data model

Everything is a plain JS file under `data/` (loaded as `<script>` tags, so it
works from `file://` with no build step or CORS issues):

- `devices.js` — the device inventory (`DEVICES`) and inter-core backbone
  links (`BACKBONE_LINKS`)
- `hosts.js` — servers/hypervisors/appliances (`HOSTS`), hand-maintained as
  systems get audited; fields you haven't confirmed yet say
  `"Unknown — needs audit"` rather than guessing
- `licenses.js` — the license/certificate expiry tracker (`LICENSES`), see
  "License monitoring" below
- `vlans.js`, `critical-infra.js`, `ports.js`, `cns-notes.js` — static
  reference tables, transcribed from the source diagram
- `status.js` — **the live-status data layer** (see below)

`assets/app.js` renders everything from those files; `assets/style.css` holds
the theme (light/dark, follows OS preference or the in-page toggle).

## Wiring up live status

v1 ships **static** — every device shows "Unknown" because `data/status.js`
is empty. It's intentionally its own file so a live poller can update just
that one file without touching layout/rendering code:

```js
const DEVICE_STATUS = {
  updatedAt: "2026-07-20T09:00:00Z",
  source: "meraki+snmp-poller",
  devices: {
    "sqcs-sah-swc-01": { status: "up", latencyMs: 2 },
    "sah-l6-01":        { status: "down" },
  },
};
```

Status values: `"up" | "warning" | "serious" | "critical" | "unknown"`.
Device ids match the `id` field in `data/devices.js`.

This only works with something that has network access *inside* the school —
this dashboard itself is static and has none. The intended path (per the
vendor APIs already in use on this network):

- **Meraki Dashboard API** — SAH/BBC access point status (115 + 66 APs)
- **Palo Alto PAN-OS API** — Firewall A/B health and HA state (active/passive)
- **Aruba ClearPass API** — RADIUS/NAC service health
- **Arctic Wolf** — MDR sensor heartbeat, if the vendor exposes an API
- **SNMP/ICMP poller** — the Nexus/Catalyst core and access switches, which
  don't have a vendor dashboard API

A small on-site script (cron job, or a container on a machine already inside
the network) can poll those sources and either overwrite `data/status.js`
directly (if it also pushes to this repo) or be swapped for a `fetch()` call
against a small JSON endpoint — the rendering code only cares about the
`DEVICE_STATUS` shape, not where it came from.

## License monitoring (added after the 2026-07-20 P1)

**Incident**: HV10/HV11's Windows Server 2025 Datacenter license lapsed. An
unactivated/expired Windows Server enters a "Notification" licensing state
and starts forcing periodic reboots. The DHCP server VM lived on one of
these hosts with no failover partner, so it went down with the host and took
DHCP out for the whole network.

Two independent fixes:
1. **See it coming** — `data/licenses.js` + the Licenses tab, so an
   expiring license shows up as a KPI count before it becomes an outage.
2. **Don't let one host's problem become a network-wide problem** — DHCP
   currently has no documented failover partner (see the `redundancy` note
   on `dhcp-sah` in `data/hosts.js`). Worth setting up a Windows DHCP
   failover relationship or a split scope across HV10 and HV11 regardless of
   the licensing fix.

### Phase 1 — manual audit (do this first)

On each Windows host (HV10, HV11, DC-98, DC-99, the file server — anything
in `data/hosts.js`), PowerShell as Administrator:

```powershell
slmgr /dlv     # full license detail — status, description
slmgr /xpr     # expiration date, if not permanently activated
Get-CimInstance -ClassName SoftwareLicensingProduct -Filter "PartialProductKey is not null" |
  Select Name, Description, LicenseStatus, GracePeriodRemaining
```

`LicenseStatus = 1` is fine (Licensed). Anything else — especially `5`
(Notification) — is the state that forces reboots. Re-activate with
`slmgr /ipk <key>` + `slmgr /ato`, or point at your KMS host with
`slmgr /skms <server>:1688` first. If the host is Azure Arc-connected
(common for Server 2025 Datacenter pay-as-you-go), check its license status
in the Azure Arc portal instead — that's the actual source of truth.

For non-Windows systems, check the vendor's own console:
- **Palo Alto A/B**: Device → Licenses
- **Meraki**: Organization → License Info (one co-term date for the whole org)
- **ClearPass**: Administration → Licensing
- **ADCS root CAs**: Certification Authority console → certificate `NotAfter`

Once you have a real value, update the matching entry in `data/licenses.js`
(`expiresOn: "2027-03-01"`, drop the `status` override so it's computed from
the date) or add a new entry for anything not already listed.

### Phase 2 — automate it

`scripts/audit-licenses.ps1` runs the same `slmgr` check across a list of
hosts over WinRM and writes a JSON report in roughly the shape
`data/licenses.js` expects:

```powershell
.\audit-licenses.ps1 -ComputerName HV10,HV11,DC-98,DC-99 -OutFile licenses-audit.json
```

Run it by hand first and sanity-check the output. Once you trust it:
- Wrap it in a **Scheduled Task** (daily) on a machine that already has
  WinRM access to these hosts.
- Have the task overwrite `data/licenses.js` (or a JSON file the dashboard
  fetches) and, if that machine has git access, commit + push — the same
  pattern as `data/status.js` for live device status.
- For proactive email alerts instead of "check the dashboard": your other
  project in this account (`gagotelli/tracker`, the finance tracker) already
  has a working pattern for this — a scheduled Firebase Cloud Function that
  checks a data source and emails on a threshold (bill due-date alerts). The
  same shape works here: a daily function reads `data/licenses.js`-equivalent
  data and emails when something crosses 30/14/7 days, so a lapsed license
  surfaces as an email instead of a P1.

## Editing the inventory

Add/remove/rename a device by editing `data/devices.js` — the topology map,
device table, and KPI tiles all derive from that one array, so there's
nothing else to keep in sync. `uplink.to` can be a single device id or an
array of ids (for dual-homed/stacked devices).

## Source

Generated from `SACS_topology_Current_Final_with_CNS.drawio`. Re-run the
extraction by hand if the diagram changes — there's no automated sync.
