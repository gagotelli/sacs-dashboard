// "Port and Speed Summary" legend cards from the topology diagram.
const PORT_SUMMARY = [
  {
    category: "Core / Backbone",
    lines: [
      "SWC-01 Eth1/53 ↔ SWC-02 Eth1/53: 40G",
      "SWC-01 Eth1/54 ↔ SWC-02 Eth1/54: 40G",
      "Po1 vPC Peer Link: 2 × 40G = 80G",
      "BBC Core to SWC-01: 10G",
      "BBC Core to SWC-02: 10G",
      "BBC–SAH Po100: 2 × 10G = 20G",
    ],
  },
  {
    category: "DMZ / Firewall",
    lines: [
      "DMZ-01 to SWC-01 Eth1/21: 10G",
      "DMZ-02 to SWC-01 Eth1/22: 10G",
      "DMZ-01 to SWC-02 Eth1/21: 10G",
      "DMZ-02 to SWC-02 Eth1/22: 10G",
      "DMZ Stack Po50: 20G",
      "Firewall A Po60: 20G",
      "Firewall B: not active",
    ],
  },
  {
    category: "SAH Uplinks",
    lines: [
      "L6-01: SWC-01 Eth1/27 — 10G",
      "L6-02: SWC-01/02 Eth1/25 — 20G",
      "L5-01: SWC-01 Eth1/26 — 10G",
      "L4-01: SWC-02 Eth1/26 — 10G",
      "L7 Stack: SWC-01/02 Eth1/47 — 20G",
      "1G: L6-R1, L9-R2, LG-01, L8-04, CHC-SW-02",
    ],
  },
  {
    category: "BBC Uplinks",
    lines: [
      "L1-R1 Te1/1/5 — 10G",
      "L1-R2 Te1/1/6 — 10G",
      "L2-R1 Te1/1/9 — 10G",
      "L3-C1 Te1/1/11 — 10G",
      "L4-R1 Te1/1/7 — 10G",
      "G-R1 Te2/1/8 — 10G",
      "G-A1 Te2/1/4 — 10G",
      "LG-C1 Te1/1/8 — 10G",
      "L5-R1 Te2/1/13 — 1G",
    ],
  },
];
