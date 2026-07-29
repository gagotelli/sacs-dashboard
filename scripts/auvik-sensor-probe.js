#!/usr/bin/env node
// One-off diagnostic: is 10.160.0.71 / .72 (the Arctic Wolf MDR sensors)
// anywhere in Auvik's inventory?
//
// Prints counts, subnet coverage and onlineStatus only. Discovered device
// names are NOT printed — this runs in a public repo's Actions log.

const DOMAIN = process.env.AUVIK_API_DOMAIN || "auvikapi.au1.my.auvik.com";
const USER = process.env.AUVIK_API_USERNAME || "";
const KEY = process.env.AUVIK_API_KEY || "";
const auth = "Basic " + Buffer.from(`${USER}:${KEY}`).toString("base64");

const TARGETS = ["10.160.0.71", "10.160.0.72"];

async function api(url) {
  const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(/\?.*/, "")}\n${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function main() {
  if (!USER || !KEY) throw new Error("AUVIK_API_USERNAME and AUVIK_API_KEY must be set");

  const tenants = await api(`https://${DOMAIN}/v1/tenants`);
  const client = (tenants.data || []).find((t) => t.attributes?.tenantType === "client")
    || (tenants.data || [])[0];
  console.log(`tenant: ${client.attributes?.domainPrefix || "?"}`);

  let url = `https://${DOMAIN}/v1/inventory/device/info?tenants=${client.id}&page[first]=100`;
  const devices = [];
  let pages = 0;
  while (url && pages < 60) {
    const body = await api(url);
    devices.push(...(body.data || []));
    url = body.links?.next || null;
    pages++;
  }
  console.log(`auvik devices: ${devices.length} across ${pages} page(s)`);

  // How much of the sensor's management range does Auvik cover at all? If the
  // answer is zero, the sensors are not "missed", the subnet is not monitored.
  const inRange = devices.filter((d) =>
    (d.attributes?.ipAddresses || []).some((ip) => ip.startsWith("10.160.0.")));
  const in160 = devices.filter((d) =>
    (d.attributes?.ipAddresses || []).some((ip) => ip.startsWith("10.160.")));
  console.log(`devices with an address in 10.160.0.0/24 : ${inRange.length}`);
  console.log(`devices with an address in 10.160.0.0/16 : ${in160.length}`);

  for (const target of TARGETS) {
    const hit = devices.find((d) => (d.attributes?.ipAddresses || []).includes(target));
    if (!hit) {
      console.log(`${target} -> not in Auvik inventory`);
      continue;
    }
    const a = hit.attributes || {};
    console.log(`${target} -> FOUND  onlineStatus=${a.onlineStatus}  deviceType=${a.deviceType}  vendor=${a.vendorName}  lastSeen=${a.lastSeenTime}`);
  }

  // Vendor is the other way in: an Arctic Wolf appliance may be discovered on
  // a different address than the one on the topology diagram.
  const byVendor = devices.filter((d) =>
    /arctic/i.test(`${d.attributes?.vendorName || ""} ${d.attributes?.makeModel || ""}`));
  console.log(`devices whose vendor/model mentions "arctic": ${byVendor.length}`);
  byVendor.forEach((d) => {
    const a = d.attributes || {};
    console.log(`  onlineStatus=${a.onlineStatus} deviceType=${a.deviceType} model=${a.makeModel}`);
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
