// Live device status, generated from Auvik by
// .github/workflows/sync-auvik-status.yml — do not edit by hand.
//
// Only devices already listed in data/devices.js appear here. Auvik
// discovers the full estate including endpoints this public repo does
// not publish, so those are counted and otherwise dropped.
//
// Status values: "up" | "warning" | "down" | "unknown"
const DEVICE_STATUS = {
  "updatedAt": "2026-07-28T22:32:23.722Z",
  "source": "Auvik",
  "matched": 28,
  "published": 30,
  "discoveredNotPublished": 139,
  "devices": {
    "sacs-bbc-swc-01": {
      "status": "up",
      "lastSeen": "2026-06-24T06:07:17.812Z",
      "vendor": "Cisco",
      "model": "Catalyst 4000 series VS",
      "firmware": "15.0(1r)SG11"
    },
    "sqcs-sah-swc-01": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.974Z",
      "vendor": "Cisco",
      "model": "Nexus 3000 Series",
      "firmware": "9.2(1)"
    },
    "sqcs-sah-swc-02": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.795Z",
      "vendor": "Cisco",
      "model": "Nexus 3000 Series",
      "firmware": "9.2(1)"
    },
    "fw-a": {
      "status": "up",
      "lastSeen": "2026-07-08T02:34:30.865Z",
      "vendor": "Palo Alto",
      "model": "PA-3420",
      "firmware": null
    },
    "fw-b": {
      "status": "up",
      "lastSeen": "2026-07-08T07:57:38.711Z",
      "vendor": "Palo Alto",
      "model": null,
      "firmware": null
    },
    "sah-l6-01": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.954Z",
      "vendor": "Cisco",
      "model": "WS-C2960X-48FPD-L",
      "firmware": "15.0(2)EX5"
    },
    "sah-l6-02": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.860Z",
      "vendor": "Cisco",
      "model": "WS-C4507R+E",
      "firmware": "15.1(1r)SG17"
    },
    "sah-l5-01": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:48.031Z",
      "vendor": "Cisco",
      "model": "WS-C4506-E",
      "firmware": "12.2(44r)SG10"
    },
    "sah-l4-01": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.971Z",
      "vendor": "Cisco",
      "model": "WS-C4506-E",
      "firmware": "15.1(1r)SG6"
    },
    "sah-l5-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.882Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "sah-g-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.870Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "sah-l7-r1-stack": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.921Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "sah-l9-r1-1": {
      "status": "up",
      "lastSeen": "2026-07-21T01:47:51.855Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "sah-l6-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.778Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "sah-l9-r2-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.805Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "sacs-sah-swa-lg-01": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.774Z",
      "vendor": "Cisco",
      "model": "WS-C3560V2-48PS-S",
      "firmware": "12.2(50)SE1"
    },
    "sacs-sah-swa-l8-04": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.997Z",
      "vendor": "Cisco",
      "model": "WS-C2960-24PC-L",
      "firmware": "12.2(44)SE6"
    },
    "sacs-chc-sw-02": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.800Z",
      "vendor": "Meraki",
      "model": "MS210-48FP",
      "firmware": null
    },
    "sah-l6-crm1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:48.015Z",
      "vendor": "Meraki",
      "model": "MS125-48",
      "firmware": null
    },
    "bbc-l1-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.915Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-l1-r2-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.812Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-l2-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.838Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-l3-c1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.727Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-l4-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.979Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-g-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T05:33:25.382Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-g-a1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.960Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-lg-c1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.891Z",
      "vendor": "Meraki",
      "model": "MS225-48FP",
      "firmware": null
    },
    "bbc-l5-r1-1": {
      "status": "up",
      "lastSeen": "2026-06-19T01:23:47.833Z",
      "vendor": "Meraki",
      "model": "MS120-8FP",
      "firmware": null
    }
  }
};
