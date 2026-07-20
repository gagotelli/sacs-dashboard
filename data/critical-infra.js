// "Critical Infrastructure" legend cards from the topology diagram.
const CRITICAL_INFRA = [
  {
    category: "Identity & Directory",
    items: [
      { name: "DC-98", detail: "10.0.4.98 — Domain Controller / DNS" },
      { name: "DC-99", detail: "10.0.4.99 — Domain Controller / DNS" },
    ],
  },
  {
    category: "Infrastructure Services",
    items: [
      { name: "SACS-SAH-DH-20", detail: "DHCP — 10.0.4.201" },
      { name: "SACS-SAH-FS-20", detail: "File Server — 10.0.4.110" },
      { name: "POS", detail: "IP unknown" },
    ],
  },
  {
    category: "CCTV Systems",
    items: [
      { name: "SAH DVR 01", detail: "172.30.32.1" },
      { name: "SAH DVR 02", detail: "172.30.32.2" },
      { name: "BBC NVR 01", detail: "172.30.33.2" },
    ],
  },
  {
    category: "Cloud Services",
    items: [{ name: "Vivi Cloud", detail: "admin.vivi.io" }],
  },
  {
    category: "Network Security",
    items: [
      { name: "Firewall A", detail: "172.16.50.101" },
      { name: "Firewall B", detail: "172.16.50.102" },
      { name: "ClearPass", detail: "10.160.0.50 — RADIUS / NAC" },
    ],
  },
  {
    category: "Arctic Wolf MDR",
    items: [
      { name: "Sensor 01", detail: "10.160.0.71" },
      { name: "Sensor 02", detail: "10.160.0.72" },
      { name: "Gateway", detail: "10.160.0.65" },
      { name: "DNS", detail: "10.30.2.40" },
    ],
  },
  {
    category: "Wireless Infrastructure",
    items: [
      { name: "SAH APs", detail: "115 — Meraki MR57 / MR44" },
      { name: "BBC APs", detail: "66 — Meraki MR57 / MR44" },
      { name: "Total APs", detail: "181 — Mgmt VLAN 610, ClearPass EAP-TLS" },
    ],
  },
];
