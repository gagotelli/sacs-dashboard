#!/usr/bin/env node
// Builds data/sharepoint.js — an index of the IT team's 05Infrastructure
// document library, via Microsoft Graph.
//
// WHAT IS PUBLISHED: folder and file names, paths, sizes, last-modified dates
// and the SharePoint link for each item.
// WHAT IS NOT: file contents. Nothing is ever downloaded.
//
// This repo is public and its sign-in is client-side only, so the file NAMES
// themselves become public. That is the whole point of the index, but it is
// also its main risk: a name like "core-switch-admin-passwords.xlsx" leaks
// something even though the file does not. Two guards:
//
//   1. SHAREPOINT_EXCLUDE — a regex of names to omit entirely. Excluded items
//      are counted in `omitted` so the tree never silently under-reports.
//   2. Anything matching SENSITIVE_HINT is omitted by default, on the
//      assumption that a file advertising credentials in its name should not
//      have that name republished.
//
// Env: SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET
//      SHAREPOINT_SITE_PATH  (optional, default /sites/SACSITTeam)
//      SHAREPOINT_LIBRARY    (optional, default 05Infrastructure)
//      SHAREPOINT_EXCLUDE    (optional, extra regex)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TENANT = process.env.SHAREPOINT_TENANT_ID || "";
const CLIENT = process.env.SHAREPOINT_CLIENT_ID || "";
const SECRET = process.env.SHAREPOINT_CLIENT_SECRET || "";
const HOSTNAME = process.env.SHAREPOINT_HOSTNAME || "standrewscs.sharepoint.com";
const SITE_PATH = process.env.SHAREPOINT_SITE_PATH || "/sites/SACSITTeam";
const LIBRARY = process.env.SHAREPOINT_LIBRARY || "05Infrastructure";
const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_DEPTH = 6;

// Names that advertise secrets. Omitted from the published index by default.
const SENSITIVE_HINT = /(password|passwd|credential|secret|private[-_ ]?key|\.pem$|\.pfx$|\.key$|recovery[-_ ]?key|bitlocker|licen[cs]e[-_ ]?key)/i;
const USER_EXCLUDE = process.env.SHAREPOINT_EXCLUDE
  ? new RegExp(process.env.SHAREPOINT_EXCLUDE, "i")
  : null;

let token = null;

async function getToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT,
      client_secret: SECRET,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const body = await res.json();
  if (!body.access_token) {
    // Never echo the raw body — it can contain the request's own parameters.
    throw new Error(`token request failed: ${body.error || res.status} ${body.error_description?.split(/[\r\n]/)[0] || ""}`);
  }
  return body.access_token;
}

async function graph(url) {
  const res = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status} ${e.error?.code || ""} — ${e.error?.message || url}`);
  }
  return res.json();
}

// Graph pages with @odata.nextLink; one page is not the folder.
async function children(driveId, itemId) {
  let url = itemId === "root"
    ? `/drives/${driveId}/root/children?$top=200`
    : `/drives/${driveId}/items/${itemId}/children?$top=200`;
  const out = [];
  let guard = 0;
  while (url && guard++ < 50) {
    const body = await graph(url);
    out.push(...(body.value || []));
    url = body["@odata.nextLink"] || null;
  }
  return out;
}

const stats = { folders: 0, files: 0, omitted: 0, bytes: 0 };

function omit(name) {
  return SENSITIVE_HINT.test(name) || (USER_EXCLUDE && USER_EXCLUDE.test(name));
}

async function walk(driveId, itemId, depth) {
  if (depth > MAX_DEPTH) return [];
  const items = await children(driveId, itemId);
  const out = [];

  for (const it of items) {
    if (omit(it.name)) { stats.omitted++; continue; }

    if (it.folder) {
      stats.folders++;
      out.push({
        name: it.name,
        kind: "folder",
        count: it.folder.childCount ?? 0,
        modified: it.lastModifiedDateTime || null,
        href: it.webUrl || null,
        children: await walk(driveId, it.id, depth + 1),
      });
    } else if (it.file) {
      stats.files++;
      stats.bytes += it.size || 0;
      out.push({
        name: it.name,
        kind: "file",
        ext: (it.name.split(".").pop() || "").toLowerCase(),
        size: it.size || 0,
        modified: it.lastModifiedDateTime || null,
        href: it.webUrl || null,
      });
    }
  }

  // Folders first, then files; alphabetical within each.
  return out.sort((a, b) =>
    (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1) || a.name.localeCompare(b.name));
}

async function main() {
  if (!TENANT || !CLIENT || !SECRET) {
    throw new Error("SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID and SHAREPOINT_CLIENT_SECRET must be set");
  }
  token = await getToken();

  const site = await graph(`/sites/${HOSTNAME}:${SITE_PATH}`);
  console.log(`site: ${site.displayName || site.name}`);

  const drives = await graph(`/sites/${site.id}/drives`);
  const libRe = new RegExp(LIBRARY.replace(/[^a-z0-9]/gi, ".?"), "i");
  let drive = (drives.value || []).find((d) => libRe.test(d.name));
  let rootId = "root";
  let rootUrl = drive?.webUrl || null;

  // The library may instead be a folder inside the default Documents drive.
  if (!drive) {
    drive = (drives.value || []).find((d) => d.name === "Documents") || (drives.value || [])[0];
    if (!drive) throw new Error("no document library visible to this app");
    const top = await children(drive.id, "root");
    const folder = top.find((i) => i.folder && libRe.test(i.name));
    if (!folder) {
      throw new Error(`could not find "${LIBRARY}" as a library or as a folder in "${drive.name}"`);
    }
    rootId = folder.id;
    rootUrl = folder.webUrl || null;
    console.log(`library: folder "${folder.name}" inside drive "${drive.name}"`);
  } else {
    console.log(`library: drive "${drive.name}"`);
  }

  const tree = await walk(drive.id, rootId, 0);

  const payload = {
    updatedAt: new Date().toISOString(),
    source: "SharePoint — Microsoft Graph",
    library: LIBRARY,
    rootUrl: rootUrl || `https://${HOSTNAME}${SITE_PATH}`,
    folders: stats.folders,
    files: stats.files,
    // Counted, never named: the point is that the tree does not silently
    // under-report when something is filtered out.
    omitted: stats.omitted,
    totalBytes: stats.bytes,
    tree,
  };

  const banner = [
    "// SharePoint document index — 05 Infrastructure library.",
    "// Generated by .github/workflows/sync-sharepoint.yml — do not edit by hand.",
    "//",
    "// Names, paths, sizes, modified dates and SharePoint links only. No file",
    "// content is ever downloaded or published. Items whose names advertise",
    "// credentials are omitted and counted in `omitted`.",
  ].join("\n");

  fs.writeFileSync(
    path.join(ROOT, "data/sharepoint.js"),
    `${banner}\nconst SHAREPOINT = ${JSON.stringify(payload, null, 2)};\n`
  );

  console.log(`wrote data/sharepoint.js`);
  console.log(`  folders: ${stats.folders}, files: ${stats.files}, omitted: ${stats.omitted}`);
  console.log(`  total size: ${(stats.bytes / 1048576).toFixed(1)} MB`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
