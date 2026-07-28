// Documentation tree — one hierarchy covering everything the IT team needs to
// find: reference sections inside this dashboard, the SharePoint document
// library, runbooks, and each vendor's admin console.
//
// Node shape:
//   { name, kind, desc?, href?, external?, panel?, children?[] }
//   kind: "folder" | "page" | "link" | "doc" | "pending"
//
// SHAREPOINT: the 05Infrastructure library cannot be enumerated from a static
// site — it is behind Entra ID sign-in, and this dashboard has no server side.
// Listing it needs a Microsoft Graph app registration and a sync workflow, the
// same pattern used for Auvik/NinjaOne. Until that exists the branch links to
// the library rather than inventing a folder structure that may not match it.
const SHAREPOINT_ROOT = "https://standrewscs.sharepoint.com/sites/SACSITTeam/05Infrastructure";

const DOC_TREE = [
  {
    name: "SharePoint — 05 Infrastructure",
    kind: "folder",
    desc: "The team's document library. SACS sign-in required.",
    href: SHAREPOINT_ROOT,
    external: true,
    open: true,
    children: [
      {
        name: "Folder contents not yet synced",
        kind: "pending",
        desc: "Needs a Microsoft Graph app registration and a sync workflow before files can be listed here.",
        href: SHAREPOINT_ROOT,
        external: true,
      },
    ],
  },
  {
    name: "Network reference",
    kind: "folder",
    open: true,
    children: [
      { name: "Topology map", kind: "page", panel: "panel-topology", desc: "Core, security and access layers across SAH and BBC" },
      { name: "Devices & infrastructure", kind: "page", panel: "panel-devices", desc: "Switches, hosts, wireless access points and critical infrastructure" },
      { name: "VLAN reference", kind: "page", panel: "panel-vlans", desc: "All documented VLANs, searchable, with audit status" },
      { name: "Port & speed summary", kind: "page", panel: "panel-ports", desc: "Uplink ports, speeds and layer-3 interfaces" },
    ],
  },
  {
    name: "Operations",
    kind: "folder",
    open: true,
    children: [
      { name: "Support tickets", kind: "page", panel: "panel-tickets", desc: "ManageEngine ServiceDesk Plus — aggregate view" },
      { name: "Managed endpoints", kind: "page", panel: "panel-endpoints", desc: "NinjaOne — endpoint estate and open alerts" },
      { name: "Security tickets", kind: "page", panel: "panel-security", desc: "Arctic Wolf — ranked triage queue" },
      { name: "Services", kind: "page", panel: "panel-services", desc: "Business services, owners, criticality, MFA and exposure" },
      { name: "CCTV fleet", kind: "page", panel: "panel-cctv", desc: "Cameras across SAH and BBC, recording platform and models" },
      { name: "License tracker", kind: "page", panel: "panel-licenses", desc: "Expiry tracking for OS, firewall and subscription licences" },
    ],
  },
  {
    name: "Planning",
    kind: "folder",
    open: true,
    children: [
      { name: "Infrastructure roadmap", kind: "page", panel: "panel-roadmap", desc: "Phased upgrade plan, budgets and critical actions" },
    ],
  },
  {
    name: "Admin portals",
    kind: "folder",
    desc: "Most require being on the school network or VPN.",
    children: [
      { name: "Palo Alto Firewall A", kind: "link", href: "https://172.16.50.101", external: true, desc: "172.16.50.101" },
      { name: "Palo Alto Firewall B", kind: "link", href: "https://172.16.50.102", external: true, desc: "172.16.50.102" },
      { name: "Aruba ClearPass", kind: "link", href: "https://10.160.0.50", external: true, desc: "10.160.0.50 — RADIUS / NAC" },
      { name: "Meraki Dashboard", kind: "link", href: "https://dashboard.meraki.com", external: true, desc: "Wireless access points" },
      { name: "Auvik", kind: "link", href: "https://sacsmain.au1.my.auvik.com/", external: true, desc: "Live network discovery and monitoring" },
      { name: "NinjaOne", kind: "link", href: "https://oc.ninjarmm.com/", external: true, desc: "Endpoint management" },
      { name: "Arctic Wolf", kind: "link", href: "https://dashboard.arcticwolf.com/", external: true, desc: "Managed detection and response" },
      { name: "ManageEngine ServiceDesk", kind: "link", href: "https://sacs.sdpondemand.manageengine.com/app/itdesk/ui/requests", external: true, desc: "Helpdesk" },
      { name: "Vivi Cloud", kind: "link", href: "https://admin.vivi.io", external: true, desc: "AV casting / classroom displays" },
    ],
  },
];

// Runbooks — short procedures kept in full here so they're usable without
// leaving the dashboard. Longer background lives in README.md.
const RUNBOOKS = [
  {
    title: "Windows license audit (manual)",
    summary: "Check activation status on a host before it becomes a P1 — the procedure that follows the 2026-07-20 HV10/HV11 incident.",
    steps: [
      "RDP/console into the host, PowerShell as Administrator.",
      "Run `slmgr /dlv` — full license detail, status, description.",
      "Run `slmgr /xpr` — expiration date, if not permanently activated.",
      "LicenseStatus 1 = fine. Anything else (especially 5, Notification) forces periodic reboots.",
      "Re-activate: `slmgr /ipk <key>` + `slmgr /ato`, or `slmgr /skms <kms-host>:1688` first if on KMS.",
      "Record the confirmed expiry/renewal date in data/licenses.js so it shows up on the Licenses tab.",
    ],
  },
  {
    title: "Windows license audit (scripted)",
    summary: "scripts/audit-licenses.ps1 runs the same check across a list of hosts over WinRM and writes a JSON report.",
    steps: [
      "Requires WinRM enabled on target hosts (Enable-PSRemoting) and local admin rights.",
      "Run: .\\audit-licenses.ps1 -ComputerName HV10,HV11,DC-98,DC-99 -OutFile licenses-audit.json",
      "Review the output, then update data/licenses.js with confirmed values.",
      "Once trusted, wrap it in a daily Scheduled Task — see README.md → “Phase 2 — automate it”.",
    ],
  },
  {
    title: "2026-07-20 P1: DHCP outage",
    summary: "HV10/HV11 Windows Server Datacenter license lapsed → forced host reboots → DHCP VM went down with the host → network-wide outage.",
    steps: [
      "Root cause: license lapse forced periodic reboots on the Hyper-V host running DHCP.",
      "DHCP had no documented failover partner — a single host issue took the whole network's DHCP down.",
      "Immediate fix: re-activate HV10 (done during incident response) — confirm the renewal method and date.",
      "Follow-up: audit HV11 (same deployment batch, same risk).",
      "Structural fix, still open: set up a Windows DHCP failover relationship or split scope across HV10 and HV11.",
    ],
  },
];
