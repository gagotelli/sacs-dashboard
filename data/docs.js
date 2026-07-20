// Documentation index — a single map of everything the IT team might need to
// find: in-dashboard reference sections, runbooks, and the admin portals for
// each vendor system. `href` starting with "#" jumps to a tab in this
// dashboard; anything else opens externally.
const DOC_INDEX = [
  {
    category: "Network Reference",
    items: [
      { title: "Topology map", desc: "Core, security, and SAH/BBC access & distribution layers", href: "#topology" },
      { title: "Device inventory", desc: "Every switch — name, model, site, IP, uplink", href: "#devices" },
      { title: "VLAN reference", desc: "All 42 documented VLANs by category", href: "#vlans" },
      { title: "Port & speed summary", desc: "Uplink port and speed reference, by segment", href: "#ports" },
    ],
  },
  {
    category: "Systems & Compliance",
    items: [
      { title: "Hosts & systems", desc: "Servers, hypervisors, and appliances behind the network", href: "#devices" },
      { title: "License tracker", desc: "Expiry tracking for OS, firewall, and subscription licenses", href: "#licenses" },
      { title: "Critical infrastructure", desc: "DCs, DHCP, CCTV, cloud services, security, wireless", href: "#devices" },
    ],
  },
  {
    category: "Security Roadmap",
    items: [
      { title: "Roadmap", desc: "Infrastructure upgrade plan, budgets, and project status", href: "#roadmap" },
    ],
  },
  {
    category: "Admin Portals",
    items: [
      { title: "Palo Alto Firewall A", desc: "172.16.50.101 — on network/VPN only", href: "https://172.16.50.101", external: true },
      { title: "Palo Alto Firewall B", desc: "172.16.50.102 — on network/VPN only", href: "https://172.16.50.102", external: true },
      { title: "Aruba ClearPass", desc: "10.160.0.50 — RADIUS / NAC, on network/VPN only", href: "https://10.160.0.50", external: true },
      { title: "Meraki Dashboard", desc: "SAH + BBC access points (181 APs)", href: "https://dashboard.meraki.com", external: true },
      { title: "Vivi Cloud", desc: "AV casting / classroom display management", href: "https://admin.vivi.io", external: true },
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
