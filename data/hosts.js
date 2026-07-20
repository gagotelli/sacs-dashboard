// Systems & hosts inventory — servers, hypervisors, and appliances that sit
// behind the network devices in devices.js. Unlike devices.js (extracted
// straight from the topology diagram), this file is built up by hand as
// systems get audited. Fields left "Unknown — needs audit" are honest
// placeholders, not guesses — fill them in as you confirm each one.
//
// Fields:
//   id         - stable key, referenced from licenses.js via `host`
//   name       - hostname
//   role       - what it does (Hypervisor, Domain Controller, DHCP, ...)
//   ip         - management IP, if known
//   os         - operating system / platform
//   hostedOn   - id of the hypervisor this runs on, if it's a VM
//   redundancy - failover/HA note; flag single points of failure explicitly
//   note       - free text, including incident history
const HOSTS = [
  {
    id: "hv10",
    name: "HV10",
    role: "Hyper-V Host",
    ip: "Unknown — needs audit",
    os: "Windows Server 2025 Datacenter",
    redundancy: "Unknown — confirm cluster/standalone status",
    note: "P1 (2026-07-20): Datacenter license lapsed, host entered notification " +
      "state and began forcing periodic reboots. Re-activated during incident " +
      "response — confirm activation method (KMS/MAK/Azure Arc) and set a " +
      "renewal reminder so this can't silently expire again.",
  },
  {
    id: "hv11",
    name: "HV11",
    role: "Hyper-V Host",
    ip: "Unknown — needs audit",
    os: "Windows Server 2025 Datacenter",
    redundancy: "Unknown — confirm cluster/standalone status",
    note: "Same deployment batch as HV10 — audit activation status even if it " +
      "didn't trigger the P1, it's likely on the same licensing timeline.",
  },
  {
    id: "dhcp-sah",
    name: "SACS-SAH-DH-20",
    role: "DHCP Server",
    ip: "10.0.4.201",
    os: "Unknown — needs audit",
    hostedOn: "Unknown — confirm whether this VM lives on HV10 or HV11",
    redundancy: "No known failover partner. Recommend DHCP failover (Windows " +
      "DHCP failover relationship) or a split-scope secondary on the other " +
      "Hyper-V host so a single host issue can't take DHCP offline network-wide.",
    note: "Root cause path for the 2026-07-20 P1: this VM went down when its " +
      "host rebooted from a license lapse.",
  },
  {
    id: "dc-98",
    name: "DC-98",
    role: "Domain Controller / DNS",
    ip: "10.0.4.98",
    os: "Unknown — needs audit",
    note: "Paired with DC-99 for AD/DNS redundancy.",
  },
  {
    id: "dc-99",
    name: "DC-99",
    role: "Domain Controller / DNS",
    ip: "10.0.4.99",
    os: "Unknown — needs audit",
  },
  {
    id: "fs-sah",
    name: "SACS-SAH-FS-20",
    role: "File Server",
    ip: "10.0.4.110",
    os: "Unknown — needs audit",
  },
  {
    id: "pos",
    name: "POS",
    role: "Point of Sale",
    ip: "Unknown",
    os: "Unknown — needs audit",
  },
  {
    id: "adcs-99",
    name: "SACS-ADCS-99",
    role: "Certificate Authority (Root)",
    ip: "10.160.0.44",
    os: "Unknown — needs audit",
    note: "Diagram already flags a to-do: extend CA lifetime to 10 years.",
  },
  {
    id: "adcs-45",
    name: "SACS-ADCS-45",
    role: "Certificate Authority (Root)",
    ip: "10.160.0.45",
    os: "Unknown — needs audit",
  },
  {
    id: "clearpass",
    name: "ClearPass",
    role: "RADIUS / NAC",
    ip: "10.160.0.50",
    os: "Aruba ClearPass Policy Manager",
    note: "License/subscription tracked in licenses.js — check Administration → Licensing in the ClearPass GUI.",
  },
  {
    id: "sah-dvr-01",
    name: "SAH DVR 01",
    role: "CCTV DVR",
    ip: "172.30.32.1",
    os: "Unknown — needs audit",
  },
  {
    id: "sah-dvr-02",
    name: "SAH DVR 02",
    role: "CCTV DVR",
    ip: "172.30.32.2",
    os: "Unknown — needs audit",
  },
  {
    id: "bbc-nvr-01",
    name: "BBC NVR 01",
    role: "CCTV NVR",
    ip: "172.30.33.2",
    os: "Unknown — needs audit",
  },
];
