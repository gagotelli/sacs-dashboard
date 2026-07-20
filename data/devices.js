// SACS network device inventory, extracted from
// SACS_topology_Current_Final_with_CNS.drawio ("Modern clean topology" page).
//
// Fields:
//   id        - stable key, used to join with data/status.js later
//   name      - device hostname as labelled on the topology diagram
//   model     - hardware model, where noted
//   ip        - management/primary IP
//   site      - SAH | BBC | Core  (which campus the device sits on)
//   layer     - core | security | access | legacy | wireless
//   uplink    - { to, port, speedGbps } describing the uplink shown on the diagram
//   note      - free-text extras from the diagram (HA state, stack info, etc.)
const DEVICES = [
  // ---- Core layer ----
  {
    id: "sacs-bbc-swc-01",
    name: "SACS-BBC-SWC-01",
    model: "Catalyst 4500X",
    ip: "10.255.0.10",
    site: "BBC",
    layer: "core",
    note: "BBC Core",
  },
  {
    id: "sqcs-sah-swc-01",
    name: "SQCS-SAH-SWC-01",
    model: "Nexus 3172",
    ip: "172.16.50.21",
    site: "SAH",
    layer: "core",
    note: "SAH Core 01 · vPC peer of SWC-02",
  },
  {
    id: "sqcs-sah-swc-02",
    name: "SQCS-SAH-SWC-02",
    model: "Nexus 3172",
    ip: "172.16.50.22",
    site: "SAH",
    layer: "core",
    note: "SAH Core 02 · vPC peer of SWC-01",
  },

  // ---- Security / Firewall ----
  {
    id: "fw-a",
    name: "Palo Alto Firewall A",
    model: "Palo Alto",
    ip: "172.16.50.101",
    site: "Core",
    layer: "security",
    uplink: { to: "sqcs-sah-swc-01", port: "Po60", speedGbps: 20 },
    note: "Po60 Active",
  },
  {
    id: "fw-b",
    name: "Palo Alto Firewall B",
    model: "Palo Alto",
    ip: "172.16.50.102",
    site: "Core",
    layer: "security",
    uplink: { to: "sqcs-sah-swc-01", port: "Po61", speedGbps: 20 },
    note: "Po61 Passive (standby)",
  },
  {
    id: "arctic-wolf-01",
    name: "Arctic Wolf Sensor 01",
    model: "Arctic Wolf MDR Sensor",
    ip: "10.160.0.71",
    site: "Core",
    layer: "security",
    note: "GW 10.160.0.65 · DNS 10.30.2.40 · Mgmt VLAN 2604",
  },
  {
    id: "arctic-wolf-02",
    name: "Arctic Wolf Sensor 02",
    model: "Arctic Wolf MDR Sensor",
    ip: "10.160.0.72",
    site: "Core",
    layer: "security",
    note: "GW 10.160.0.65 · DNS 10.30.2.40 · Mgmt VLAN 2604",
  },

  // ---- SAH Access & Distribution ----
  { id: "sah-l6-01", name: "SAH-L6-01", ip: "172.16.50.32", site: "SAH", layer: "access",
    uplink: { to: "sqcs-sah-swc-01", port: "Eth1/27", speedGbps: 10 } },
  { id: "sah-l6-02", name: "SAH-L6-02", ip: "172.16.50.66", site: "SAH", layer: "access",
    uplink: { to: ["sqcs-sah-swc-01", "sqcs-sah-swc-02"], port: "Eth1/25 (both)", speedGbps: 20 } },
  { id: "sah-l5-01", name: "SAH-L5-01", ip: "172.16.50.249", site: "SAH", layer: "access",
    uplink: { to: "sqcs-sah-swc-01", port: "Eth1/26", speedGbps: 10 } },
  { id: "sah-l4-01", name: "SAH-L4-01", ip: "172.16.50.240", site: "SAH", layer: "access",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/26", speedGbps: 10 } },
  { id: "sah-l5-r1-1", name: "SAH-L5-R1-1", ip: "172.16.50.128", site: "SAH", layer: "access",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/29", speedGbps: 10 } },
  { id: "sah-g-r1-1", name: "SAH-G-R1-1", ip: "172.16.50.124", site: "SAH", layer: "access",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/38", speedGbps: 10 } },
  { id: "sah-l7-r1-stack", name: "SAH-L7-R1 Stack", ip: "172.16.50.129 / .110", site: "SAH", layer: "access",
    uplink: { to: ["sqcs-sah-swc-01", "sqcs-sah-swc-02"], port: "Eth1/47 (both)", speedGbps: 20 }, note: "Switch stack" },
  { id: "sah-l9-r1-1", name: "SAH-L9-R1-1", ip: "172.16.50.145", site: "SAH", layer: "access",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/44", speedGbps: 10 } },
  { id: "sah-l6-r1-1", name: "SAH-L6-R1-1", ip: "172.16.50.133", site: "SAH", layer: "legacy",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/41", speedGbps: 1 }, note: "1G legacy — upgrade candidate" },
  { id: "sah-l9-r2-1", name: "SAH-L9-R2-1", ip: "172.16.50.120", site: "SAH", layer: "legacy",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/45", speedGbps: 1 }, note: "1G legacy — upgrade candidate" },
  { id: "sacs-sah-swa-lg-01", name: "SACS-SAH-SWA-LG-01", ip: "172.16.50.100", site: "SAH", layer: "legacy",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/43", speedGbps: 1 }, note: "1G legacy — upgrade candidate" },
  { id: "sacs-sah-swa-l8-04", name: "SACS-SAH-SWA-L8-04", ip: "172.16.50.5", site: "SAH", layer: "legacy",
    uplink: { to: "sqcs-sah-swc-02", port: "Eth1/46", speedGbps: 1 }, note: "1G legacy — upgrade candidate" },
  { id: "sacs-chc-sw-02", name: "SACS-CHC-SW-02", ip: "172.16.50.103", site: "SAH", layer: "legacy",
    uplink: { to: "sqcs-sah-swc-01", port: "Eth1/42", speedGbps: 1 }, note: "1G legacy — upgrade candidate" },
  { id: "sah-l6-crm1-1", name: "SAH-L6-CRM1-1", ip: "172.16.50.104", site: "SAH", layer: "access",
    uplink: { to: "sqcs-sah-swc-01", port: "Eth1/32", speedGbps: 10 } },

  // ---- BBC Access & Distribution ----
  { id: "bbc-l1-r1-1", name: "BBC-L1-R1-1", ip: "172.16.50.109", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te1/1/5", speedGbps: 10 } },
  { id: "bbc-l1-r2-1", name: "BBC-L1-R2-1", ip: "172.16.50.126", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te1/1/6", speedGbps: 10 } },
  { id: "bbc-l2-r1-1", name: "BBC-L2-R1-1", ip: "172.16.50.127", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te1/1/9", speedGbps: 10 } },
  { id: "bbc-l3-c1-1", name: "BBC-L3-C1-1", ip: "172.16.50.115", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te1/1/11", speedGbps: 10 } },
  { id: "bbc-l4-r1-1", name: "BBC-L4-R1-1", ip: "172.16.50.130", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te1/1/7", speedGbps: 10 } },
  { id: "bbc-g-r1-1", name: "BBC-G-R1-1", ip: "172.16.50.112", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te2/1/8", speedGbps: 10 } },
  { id: "bbc-g-a1-1", name: "BBC-G-A1-1", ip: "172.16.50.111", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te2/1/4", speedGbps: 10 } },
  { id: "bbc-lg-c1-1", name: "BBC-LG-C1-1", ip: "172.16.50.135", site: "BBC", layer: "access",
    uplink: { to: "sacs-bbc-swc-01", port: "Te1/1/8", speedGbps: 10 } },
  { id: "bbc-l5-r1-1", name: "BBC-L5-R1-1", ip: "172.16.50.122", site: "BBC", layer: "legacy",
    uplink: { to: "sacs-bbc-swc-01", port: "Te2/1/13", speedGbps: 1 }, note: "1G legacy — upgrade candidate" },
];

// Core-to-core / core-to-security backbone links not captured as a device uplink above.
const BACKBONE_LINKS = [
  { from: "sqcs-sah-swc-01", to: "sqcs-sah-swc-02", label: "Po1 vPC peer-link", speedGbps: 80 },
  { from: "sacs-bbc-swc-01", to: "sqcs-sah-swc-01", label: "BBC Te1/1/3 → SWC-01 Eth1/15", speedGbps: 10 },
  { from: "sacs-bbc-swc-01", to: "sqcs-sah-swc-02", label: "BBC Te2/1/16 → SWC-02 Eth1/15", speedGbps: 10 },
];
