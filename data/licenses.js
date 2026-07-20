// License / certificate expiry tracker.
//
// This is the direct follow-up to the 2026-07-20 P1 (HV10/HV11 Windows Server
// Datacenter license lapsed → forced reboots → DHCP VM went down with the
// host → network-wide outage). Nothing here is guessed — entries with no
// confirmed expiry date are marked "Unknown — needs audit" rather than
// inventing a date, per the manual audit steps in README.md.
//
// Fields:
//   id         - stable key
//   host       - id from hosts.js, or a plain name for non-host systems (Meraki org, etc.)
//   product    - what's licensed
//   kind       - "license" | "certificate" | "support-contract"
//   licenseType - Retail | MAK | KMS | Eval | Subscription | Perpetual | Unknown
//   expiresOn  - ISO date string, or null if not yet confirmed
//   status     - only used when expiresOn is null: "critical" | "warning" | "unknown"
//                (when expiresOn is set, the dashboard computes status from days-remaining)
//   note
const LICENSES = [
  {
    id: "hv10-os",
    host: "hv10",
    product: "Windows Server 2025 Datacenter",
    kind: "license",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "critical",
    note: "Caused the 2026-07-20 P1. Re-activated during incident response, " +
      "but the renewal/activation method (KMS vs MAK vs Azure Arc) and the " +
      "next expiry date have not been confirmed yet — run `slmgr /dlv` and " +
      "`slmgr /xpr` on HV10 and record the result here.",
  },
  {
    id: "hv11-os",
    host: "hv11",
    product: "Windows Server 2025 Datacenter",
    kind: "license",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "critical",
    note: "Same deployment batch as HV10 — audit before it causes a repeat incident.",
  },
  {
    id: "dc-98-os",
    host: "dc-98",
    product: "Windows Server (edition unconfirmed)",
    kind: "license",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "unknown",
  },
  {
    id: "dc-99-os",
    host: "dc-99",
    product: "Windows Server (edition unconfirmed)",
    kind: "license",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "unknown",
  },
  {
    id: "fs-sah-os",
    host: "fs-sah",
    product: "Windows Server (edition unconfirmed)",
    kind: "license",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "unknown",
  },
  {
    id: "clearpass-sub",
    host: "clearpass",
    product: "Aruba ClearPass Policy Manager",
    kind: "subscription",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "unknown",
    note: "Check Administration → Licensing in the ClearPass GUI.",
  },
  {
    id: "meraki-org",
    host: "Meraki Organization (SAH + BBC, 181 APs)",
    product: "Meraki Enterprise/Advanced device licensing",
    kind: "subscription",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "unknown",
    note: "One co-termination date covers the whole org. Check Dashboard → Organization → License Info.",
  },
  {
    id: "palo-a-subs",
    host: "fw-a",
    product: "Palo Alto Firewall A — Threat Prevention / URL Filtering / WildFire / support",
    kind: "subscription",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "unknown",
    note: "Device → Licenses in the PAN-OS GUI. Firewall A is the active HA member — prioritize this one.",
  },
  {
    id: "palo-b-subs",
    host: "fw-b",
    product: "Palo Alto Firewall B — Threat Prevention / URL Filtering / WildFire / support",
    kind: "subscription",
    licenseType: "Unknown — needs audit",
    expiresOn: null,
    status: "unknown",
  },
  {
    id: "adcs-99-cert",
    host: "adcs-99",
    product: "SACS-ADCS-99 Root CA certificate",
    kind: "certificate",
    licenseType: "N/A",
    expiresOn: null,
    status: "unknown",
    note: "Diagram already flags a to-do to extend CA lifetime to 10 years — confirm current NotAfter date in the Certification Authority console.",
  },
  {
    id: "adcs-45-cert",
    host: "adcs-45",
    product: "SACS-ADCS-45 Root CA certificate",
    kind: "certificate",
    licenseType: "N/A",
    expiresOn: null,
    status: "unknown",
  },
];
