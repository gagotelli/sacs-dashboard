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
    id: "palo-advanced-dns-security",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — Advanced DNS Security",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "Advanced DNS Security Subscription. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-advanced-threat-prevention",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — Advanced Threat Prevention",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "Advanced Threat Prevention Subscription. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-advanced-url-filtering",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — Advanced URL Filtering",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "Palo Alto Networks Advanced URL License. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-advanced-wildfire",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — Advanced WildFire",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "Access to Advanced WildFire signatures, logs, API. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-pan-db-url-filtering",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — PAN-DB URL Filtering",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "Palo Alto Networks URL Filtering License — Active: Yes. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-premium-support",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — Premium Support",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "24x7 phone support, advanced replacement hardware service. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-sd-wan",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — SD-WAN",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "Advanced SD-WAN License. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-threat-prevention",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — Threat Prevention",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "Threat Prevention. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "palo-wildfire",
    host: "Palo Alto PA-3420",
    product: "PA-3420 — WildFire",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2028-04-03",
    note: "WildFire signature feed, integrated WildFire logs, WildFire API. Issued 2026-01-06. Read from the firewall's Device > Licenses page.",
  },
  {
    id: "clearpass-support",
    host: "Aruba ClearPass",
    product: "HPE Software Technical Unlimited Support & Software Updates",
    kind: "support-contract",
    licenseType: "Subscription",
    expiresOn: "2027-01-31",
    note: "Part JZ399AAE, 1 year from 2026-01-26. AUD $3,209.42 inc GST via CNS " +
      "Australia (invoice CNSAU41271, PO IT351). This is the support and updates " +
      "contract — without it ClearPass keeps running but stops receiving updates.",
  },
  {
    id: "meraki-co-term",
    host: "Meraki organisation",
    product: "Meraki Enterprise — co-termination licence",
    kind: "license",
    licenseType: "Subscription",
    expiresOn: "2027-10-28",
    note: "Co-termination model: every device shares one expiry, so the whole " +
      "estate lapses together rather than device by device. Refreshed " +
      "automatically by the Meraki sync — see data/wireless.js licensing.",
  },
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
