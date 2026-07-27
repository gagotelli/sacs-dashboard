// "Critical Infrastructure" legend cards from the topology diagram.
//
// Deliberately excludes anything already shown in the Devices or
// Hosts & Systems tables above this section (same tab) — DCs, DHCP/file
// servers, CCTV DVR/NVRs, firewalls, and Arctic Wolf sensors all live there
// instead of being repeated here. Only genuinely unique summary info stays.
const CRITICAL_INFRA = [
  {
    category: "Cloud Services",
    items: [{ name: "Vivi Cloud", detail: "admin.vivi.io" }],
  },
  {
    category: "Arctic Wolf MDR",
    items: [
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
