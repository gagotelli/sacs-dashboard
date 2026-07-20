// Layer-3 interface reference, extracted from SACS_Network_and_CCTV_Master_Inventory.xlsx
// (Layer3 Interfaces sheet).
const LAYER3_INTERFACES = [
  { iface: "Lo0", ip: "10.255.2.2", vrf: "default", status: "up", purpose: "Default VRF loopback" },
  { iface: "Eth1/15", ip: "10.255.0.9", vrf: "default", status: "up", purpose: "Routed link to BBC" },
  { iface: "mgmt0", ip: "172.16.50.21", vrf: "management", status: "up", purpose: "Out of band switch management" },
  { iface: "Lo128", ip: "10.251.0.128", vrf: "CCTV", status: "up", purpose: "CCTV OSPF router ID" },
  { iface: "Lo130", ip: "10.251.0.130", vrf: "SERVER", status: "up", purpose: "SERVER OSPF router ID" },
  { iface: "Lo132", ip: "10.251.0.132", vrf: "SERVERTEST", status: "up", purpose: "SERVERTEST OSPF router ID" },
  { iface: "Lo134", ip: "10.251.0.134", vrf: "NET-MGMT", status: "up", purpose: "NET-MGMT OSPF router ID" },
  { iface: "Lo136", ip: "10.251.0.136", vrf: "STAFF", status: "up", purpose: "STAFF OSPF router ID" },
  { iface: "Lo140", ip: "10.251.0.140", vrf: "STUDENT", status: "up", purpose: "STUDENT OSPF router ID" },
  { iface: "Lo142", ip: "10.251.0.142", vrf: "AUDIOVISUAL", status: "up", purpose: "AUDIOVISUAL OSPF router ID" },
];
