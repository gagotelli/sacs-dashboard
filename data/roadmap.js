// Roadmap data — combines two source documents:
//   1. SACS Core Infrastructure Upgrade Roadmap (management report, June 2026)
//   2. SACS IT Program Overview — technical/cost facts only. The MSP
//      performance critique, named-contractor commentary, and internal
//      staffing/resourcing sections from that document are deliberately
//      left out of this public dashboard.
const ROADMAP_HEADER = {
  overallPosition: "The core switching layer is serviceable and should not be the first replacement priority. The immediate risk is operational complexity, incomplete clean-up, firewall HA not active, unfinished ClearPass/EAP-TLS, and legacy 1G access uplinks.",
  immediateDecision: "Approve Phase 1: stabilise and simplify. Make Firewall B HA the first critical action, then finish documentation/IPAM, validate DMZ removal, complete ClearPass, and replace 1G/legacy uplinks.",
  budget12mo: "AUD $75,000 – $180,000, depending on switch model choice, licensing, vendor engineering, and whether the existing Firewall B has valid subscriptions/support.",
};

const ROADMAP_AREA_STATUS = [
  { area: "Core switching", status: "good", message: "Nexus 3172 pair provides 80G vPC peer-link and remains adequate.", action: "Do not replace core first. Reassess 2027–2028." },
  { area: "Firewall HA", status: "critical", message: "Firewall B is not active. This is a resilience risk.", action: "Priority 1: restore Palo Alto HA pair and test failover." },
  { area: "Access layer", status: "warning", message: "Several 1G / legacy uplinks remain.", action: "Replace or uplink-upgrade priority switches." },
  { area: "DMZ stack", status: "warning", message: "Dedicated DMZ stack may be unnecessary.", action: "Audit services, migrate behind firewall zones, then retire if no longer required." },
  { area: "ClearPass / WiFi", status: "warning", message: "EAP-TLS and dynamic VLAN assignment still require completion.", action: "Finish pilot, enforce roles, then migrate users." },
];

const ROADMAP_CRITICAL_ACTIONS = [
  { priority: 1, action: "Restore Palo Alto Firewall HA", why: "Firewall B is not active. A single active firewall increases outage risk. Validate HA cabling, HA1/HA2, licenses/support, session sync, routing, and failover.", budget: "$8,000–$25,000 engineering only; $25,000–$90,000+ if support/licensing/hardware is missing", target: "0–30 days" },
  { priority: 2, action: "Freeze and document current network", why: "Current topology, VLANs, services, switch management IPs and uplinks must be the baseline before changes.", budget: "$0–$8,000", target: "0–30 days" },
  { priority: 3, action: "Audit DMZ stack and plan removal", why: "DMZ stack appears to add complexity without clear value. If no required workloads remain, migrate policy to Palo Alto security zones and retire Po50/DMZ switching.", budget: "$5,000–$15,000", target: "30–60 days" },
  { priority: 4, action: "Complete ClearPass EAP-TLS remediation", why: "Single SSID with cert-based auth and dynamic VLANs reduces WiFi support issues and improves security.", budget: "$10,000–$30,000", target: "30–90 days" },
  { priority: 5, action: "Replace / uplift legacy 1G access uplinks", why: "1G legacy uplinks are likely bottlenecks and lifecycle risks.", budget: "$35,000–$90,000 depending on model/licensing", target: "60–180 days" },
];

const ROADMAP_DELIVERABLES = [
  { deliverable: "Firewall HA test record", outcome: "Documented failover test, rollback, HA status, and action list for any missing support/licensing." },
  { deliverable: "Network source of truth", outcome: "Updated topology, IP address register, switch management IPs, services list, VLAN inventory and port-channel map." },
  { deliverable: "DMZ decision paper", outcome: "Retain or retire decision with services affected, firewall zones, NAT/rules, and migration steps." },
  { deliverable: "ClearPass migration plan", outcome: "Pilot users/devices, RADIUS rules, VLAN enforcement, rollback plan and production migration dates." },
];

const ROADMAP_ACCESS_SWITCHES = [
  { item: "SAH-L6-R1-1", observation: "1G uplink / upgrade candidate", action: "Replace or migrate to 10G-capable access switch with 10G uplink.", budget: "$4,000–$12,000" },
  { item: "SAH-L9-R2-1", observation: "1G uplink / upgrade candidate", action: "Replace or migrate to 10G uplink.", budget: "$4,000–$12,000" },
  { item: "SACS-SAH-SWA-LG-01", observation: "Legacy Cisco / 1G", action: "Replace with Meraki access switch or modern Cisco/Aruba equivalent.", budget: "$4,000–$12,000" },
  { item: "SACS-SAH-SWA-L8-04", observation: "Legacy Cisco / 1G", action: "Replace with modern PoE access switch.", budget: "$4,000–$12,000" },
  { item: "SACS-CHC-SW-02", observation: "1G uplink", action: "Upgrade uplink/switch if endpoint density or APs justify it.", budget: "$4,000–$12,000" },
  { item: "BBC-L5-R1-1", observation: "1G uplink", action: "Upgrade to 10G uplink capable switch.", budget: "$4,000–$12,000" },
];

const ROADMAP_PRICING_REFS = [
  { item: "Meraki MS130-48", pricing: "Approx. $2,559.81–$3,923 AUD ex GST (AU resellers, licence extra)", use: "Budget access switch where PoE/10G needs are moderate." },
  { item: "Meraki MS150-48FP-4G", pricing: "Approx. $6,962 AUD (AU reseller)", use: "Higher capacity PoE access switch option." },
  { item: "Meraki MS225-48FP", pricing: "Approx. $9,944 AUD (AU reseller)", use: "Stackable 48-port PoE option, generally higher budget." },
  { item: "Palo Alto PA-3420 HA", pricing: "Quote-based for appliance/subscription/support.", use: "Budget as engineering first, then quote if support/licensing missing." },
];

const ROADMAP_CLEANUP_STAGES = [
  { stage: 1, work: "Inventory DMZ connected devices and firewall rules", outcome: "Know exactly what is using the DMZ stack and why.", risk: "Read-only review. No outage." },
  { stage: 2, work: "Classify each service", outcome: "Keep, migrate, retire, or replace with SaaS/cloud pattern.", risk: "Agree service owners." },
  { stage: 3, work: "Build Palo Alto zones and rules", outcome: "Security policy replaces switching complexity.", risk: "Implement staged rules with logging first." },
  { stage: 4, work: "Move one service at a time", outcome: "Reduce failure domain and validate dependency impact.", risk: "Change windows and rollback per service." },
  { stage: 5, work: "Decommission DMZ stack if empty", outcome: "Remove Po50 links and reduce topology complexity.", risk: "Keep backup configs and cabling record." },
];

const ROADMAP_CLEANUP_AREAS = [
  { area: "VLANs", action: "Audit all VLANs, mark active/unused/retire, remove unused SVIs only after validation.", benefit: "Lower operational risk and cleaner firewall/routing." },
  { area: "Switch ports", action: "Audit unused ports, wrong descriptions, old trunks, and orphaned port-channels.", benefit: "Cleaner troubleshooting and reduced loop/mispatch risk." },
  { area: "IPAM", action: "Create IP register for switches, servers, APs, DVR/NVR, ClearPass, Arctic Wolf, firewalls.", benefit: "Faster incident response." },
  { area: "Monitoring", action: "Confirm SNMP/syslog/Arctic Wolf visibility for all critical switches/firewalls.", benefit: "Earlier detection of outages and misconfiguration." },
];

const ROADMAP_PHASES = [
  { phase: "Phase 1 — Stabilise", timeframe: "0–3 months", actions: "Firewall B HA remediation, documentation, source of truth, IPAM, DMZ audit, ClearPass remediation plan.", budget: "$20,000–$55,000" },
  { phase: "Phase 2 — Simplify and secure", timeframe: "3–9 months", actions: "DMZ migration/removal, ClearPass EAP-TLS rollout, VLAN cleanup, switch port cleanup, monitoring validation.", budget: "$25,000–$65,000" },
  { phase: "Phase 3 — Modernise access layer", timeframe: "6–12 months", actions: "Replace/uplift 1G legacy access switches, standardise uplinks, refresh cabling/SFPs where required.", budget: "$35,000–$90,000" },
  { phase: "Phase 4 — Future core/server review", timeframe: "12–36 months", actions: "Core refresh business case, server/backup/DR review, firewall lifecycle review.", budget: "$50,000–$150,000" },
];

const ROADMAP_RECOMMENDATIONS = [
  { recommendation: "Approve Phase 1 immediately", decision: "Prioritise firewall HA and source-of-truth documentation before additional architecture changes." },
  { recommendation: "Do not approve core switch replacement yet", decision: "Current core capacity is sufficient. Spend first on resilience, clean-up and access layer bottlenecks." },
  { recommendation: "Request vendor quotes", decision: "Get formal AU education pricing for firewall HA support/licensing and 6 access switch replacements with 10G uplinks." },
  { recommendation: "Assign ownership", decision: "Define which work is internal SACS vs. MSP/vendor partners." },
];

// ---- From the IT Program Overview — technical/cost facts only ----
const ROADMAP_PROGRAM_STATUS = [
  { program: "CNS support and MSP transition", status: "Under review by leadership", cost: "Ongoing monthly retainer, value under review" },
  { program: "Wi-Fi certificate authentication upgrade", status: "Stalled — no delivery yet", cost: "$25,146.00 quoted (expired), plus $3,209.42 already paid for ClearPass licensing" },
  { program: "Firewall high availability", status: "Quote received, pending approval", cost: "$22,783.88, offset by CoreSec credit" },
  { program: "Meraki to Aruba migration", status: "Long-term planning — licence renews Oct 2027", cost: "Pricing to be confirmed with resellers" },
];

const WIFI_CERT_PROJECT = {
  design: "Microsoft Intune Cloud PKI issuing certificates, deployed to devices via Intune policy, with the existing Aruba ClearPass Policy Manager acting as RADIUS server for EAP-TLS authentication. Staff, student, and AV SSIDs move to certificate-based authentication; guest and device SSIDs remain PSK-based. Phased pilot, then full rollout per SSID, then cleanup of old SSIDs/configs.",
  quote: {
    vendor: "CNS", ref: "AH-200727", date: "2 Jun 2025 (expired 23 Jun 2025)",
    scope: "Infrastructure prep, QA, implementation across all SSIDs, documentation, and project management (8 days professional services)",
    licensing: "Microsoft Cloud PKI, approximately 2,000 staff and student accounts",
    totalExTax: "$22,860.00 AUD", totalIncTax: "$25,146.00 AUD",
  },
};

const FIREWALL_HA_PROJECT = {
  description: "Palo Alto PA-3420 firewalls are not currently running in true high availability — the second unit sits as a cold spare rather than an active HA pair with automatic failover. A cold spare requires manual physical intervention to bring the second unit into service (realistically 30 minutes to several hours of outage), compared to near-instant automatic failover with a properly configured HA pair.",
  quote: {
    vendor: "Katana1", ref: "8545", date: "06/07/2026 (expires 15/07/2026)",
    product: "PA-3420 Precision AI Network Security Subscription Renewal Bundle: Advanced Threat Prevention, Advanced URL Filtering, Advanced Wildfire, Advanced DNS Security, Advanced SD-WAN, Device Security",
    term: "3 years (36 months), 02/07/2026 – 02/04/2028",
    totalIncTax: "$22,783.88 AUD",
    credit: "Remaining/unused term of the existing CoreSec bundle credited against this quote, reducing net new spend.",
  },
};

const MERAKI_ARUBA_MIGRATION = {
  overview: "SACS runs a Cisco Meraki cloud-managed access layer (switches, access points, environmental sensors) across SAH, BBC, and KIRR, behind a non-Meraki core (Nexus 3172, Palo Alto pair, Arctic Wolf sensors). The Meraki licence co-term expires October 2027. The core layer, firewall pair, and Arctic Wolf sensors are not Meraki products and are unaffected by this migration.",
  estate: [
    { metric: "Total licensed Meraki devices", value: "240" },
    { metric: "Access points", value: "188 (MR44, MR57, MR42, MR46)" },
    { metric: "Switches", value: "49 (MS425, MS225, MS210, MS130, MS120, MS125)" },
    { metric: "Environmental sensors", value: "3 (MT10, MT12)" },
    { metric: "Campuses and networks", value: "SAH, BBC, KIRR, SAH DMZ, plus one test network" },
    { metric: "Licence renewal trigger", value: "October 2027" },
  ],
  timeline: [
    "Q3–Q4 2026: decision and procurement, comparative quoting from Australian Aruba partners",
    "Q4 2026–Q1 2027: detailed design and a pilot deployment at the smallest site, KIRR",
    "Q1–Q2 2027: priority upgrades — six switches already on ageing 1G uplinks, regardless of vendor",
    "Q2–Q3 2027: main rollout at SAH, the largest site, followed by BBC in Q3 2027",
    "Q3 2027: DMZ aggregation cutover — the highest-risk step, touching the Palo Alto and Nexus core",
    "Sep–Oct 2027: decommission remaining Meraki hardware and let the licence lapse rather than renewing",
  ],
};
