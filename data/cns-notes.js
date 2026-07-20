// "CNS" (core network security/services) reference pages bundled at the end of the
// source drawio file — Now / Transition / End state of the firewall+DMZ L2 design,
// plus the CPPM/SCEP certificate flow notes. Kept here as read-only project
// documentation, not live inventory.
const CNS_NOTES = [
  {
    title: "Now State (L2)",
    points: [
      "Palo 1 / Palo 2, DMZ 1 / DMZ 2, N3K 1 / N3K 2, NTU 1 / NTU 2",
      "Internet VLAN 1666 and Private Peering VLAN 1667",
      "NTU trunks: VLAN 1, 2001",
      "Aggregate VLANs on AGGR0 / AGGR1: 100, 800-801, 999, 1666-1667, 2001, 3501-3509",
      "Internal aggregate VLANs: 100, 800-801, 998, 3501-3509",
      "Stack / HA / VPC noted",
    ],
  },
  {
    title: "Transition State (L2)",
    points: [
      "Internal ae.2 to PO60",
      "AGGR1 ae.1 / AGGR0 ae.1",
      "ae.2 to PO61",
      "Management VLAN 50 on Palo 1 / Palo 2",
      "Port-channel VLANs — PO60: 110, 3502-3509",
      "Port-channel VLANs — PO61: 110, 3502-3509",
    ],
  },
  {
    title: "End State (L2)",
    points: [
      "Palo 2 marked as On-Site Spare",
      "DMZ aggregate VLANs — AGGR0: 1666-1667, 2001",
      "DMZ aggregate VLANs — AGGR1: 1666-1667, 2001",
      "ae.2 to PO61 and PO62",
      "Management VLAN 50",
      "Stack / HA / VPC retained",
    ],
  },
  {
    title: "Firewall to Core",
    points: [
      "Palo A / Palo B to Nexus 1 / Nexus 2",
      "Palo interfaces: eth1/16",
      "Nexus interfaces: eth1/31",
      "Reference numbers: 21 and 22",
    ],
  },
  {
    title: "CPPM / SCEP Flow",
    points: [
      "SSID: SACS",
      "iPad certificate: IPAD_SCEP_Cloud_PKI",
      "Wireless profile: HS-CPPM-WIFI",
      "Staff SCEP profile: CPPM STAFF SCEP",
    ],
  },
  {
    title: "Certificate / Policy Notes",
    points: [
      "SACS-ADCS-99 CA Root Certificate: 10.160.0.44",
      "SACS-ADCS-45 CA Root Certificate: 10.160.0.45",
      "Rename configuration policy to reflect platform",
      "Extend CA lifetime to 10 years",
      "Scopetag group: HS-Scopetag-Group",
    ],
  },
];
