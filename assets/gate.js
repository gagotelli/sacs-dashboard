(function () {
  "use strict";

  // Client-side access gate. IMPORTANT: this is a mild deterrent against
  // casual/drive-by viewing (and keeps the dashboard out of search engine
  // crawlers, since crawlers don't run this script) — it is NOT real
  // security. Every file this page loads (index.html, assets/*, data/*)
  // is a plain static file with no server-side check, so anyone who fetches
  // those URLs directly bypasses this entirely. Don't rely on it to protect
  // anything you wouldn't be okay with a determined visitor eventually seeing.
  const REQUIRED_HASH = "4177d843c5d2f77930620dd6a0e5fe2b61c277d32628aa67f1bf08e444cfdcd2";
  const SESSION_KEY = "sacs-gate-ok";

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function reveal() {
    const overlay = document.getElementById("sacs-gate-overlay");
    if (overlay) overlay.remove();
    document.getElementById("app-content").style.display = "";
  }

  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    reveal();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "sacs-gate-overlay";
  overlay.innerHTML = `
    <form id="sacs-gate-form" class="gate-card">
      <div class="gate-icon"><img src="assets/sacs-crest.png" alt="" /></div>
      <h1>SACS Network Dashboard</h1>
      <p>Sign in to continue.</p>
      <input type="text" id="sacs-gate-user" placeholder="Username" autocomplete="username" autofocus />
      <input type="password" id="sacs-gate-pass" placeholder="Password" autocomplete="current-password" />
      <button type="submit">Sign in</button>
      <div class="gate-error" id="sacs-gate-error" hidden>Incorrect username or password.</div>
    </form>
  `;
  document.body.appendChild(overlay);

  document.getElementById("sacs-gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("sacs-gate-user").value.trim();
    const pass = document.getElementById("sacs-gate-pass").value;
    const hash = await sha256Hex(`${user}:${pass}`);
    if (hash === REQUIRED_HASH) {
      sessionStorage.setItem(SESSION_KEY, "1");
      reveal();
    } else {
      const err = document.getElementById("sacs-gate-error");
      err.hidden = false;
      document.getElementById("sacs-gate-pass").value = "";
      document.getElementById("sacs-gate-pass").focus();
    }
  });
})();
