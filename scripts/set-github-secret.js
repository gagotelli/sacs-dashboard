#!/usr/bin/env node
// Writes a GitHub Actions repository secret.
//
// Used so the ticket sync can store the refresh token it just obtained,
// instead of a human copying a 70-character string out of a terminal and
// into a web form — the step that repeatedly put the wrong one of Zoho's
// three identically-formatted tokens into the secret.
//
// Secrets must be sealed with the repository's libsodium public key before
// upload; GitHub never accepts a plaintext value.
//
// Env: SECRET_NAME, SECRET_VALUE, GH_SECRET_WRITE_TOKEN, GITHUB_REPOSITORY

const sodium = require("libsodium-wrappers");

const NAME = process.env.SECRET_NAME;
const VALUE = process.env.SECRET_VALUE;
const TOKEN = process.env.GH_SECRET_WRITE_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;

async function gh(path, init) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init && init.headers),
    },
  });
  const body = await res.text();
  if (!res.ok) {
    // The overwhelmingly likely failure is a token without Secrets: write,
    // so name that rather than dumping a bare status code.
    const hint = res.status === 403 || res.status === 404
      ? "\nThe token needs Repository permissions > Secrets: Read and write on this repo."
      : "";
    throw new Error(`GitHub API ${res.status} on ${path}: ${body.slice(0, 300)}${hint}`);
  }
  return body ? JSON.parse(body) : {};
}

async function main() {
  for (const [k, v] of Object.entries({ SECRET_NAME: NAME, SECRET_VALUE: VALUE, GH_SECRET_WRITE_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO })) {
    if (!v) throw new Error(`${k} is not set`);
  }
  await sodium.ready;

  const pk = await gh("/actions/secrets/public-key");
  const sealed = sodium.crypto_box_seal(
    sodium.from_string(VALUE),
    sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL)
  );

  await gh(`/actions/secrets/${encodeURIComponent(NAME)}`, {
    method: "PUT",
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL),
      key_id: pk.key_id,
    }),
  });

  // Length only — never the value, and never a prefix that would help
  // reconstruct it.
  console.log(`stored secret ${NAME} (${VALUE.length} chars)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
