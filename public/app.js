const STORAGE = "reddata.v1";
const SCOPES = "identity mysubreddits";

const $ = (id) => document.getElementById(id);
const redirectUri = () => `${location.origin}/`;

const store = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) || "{}");
    } catch {
      return {};
    }
  },
  write(patch) {
    const next = { ...this.read(), ...patch };
    localStorage.setItem(STORAGE, JSON.stringify(next));
    return next;
  },
  clear() {
    localStorage.removeItem(STORAGE);
  },
};

function fmtDate(unix) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtCount(n) {
  return new Intl.NumberFormat().format(n ?? 0);
}

async function reddit(path, token, params = {}) {
  const url = new URL(`/api/reddit/${path.replace(/^\//, "")}`, location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || res.statusText;
    throw new Error(msg);
  }
  return data;
}

async function exchange(body) {
  const res = await fetch("/api/oauth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  return data;
}

async function ensureToken() {
  const s = store.read();
  if (!s.accessToken) return null;
  const exp = Number(s.expiresAt || 0);
  if (Date.now() < exp - 30_000) return s.accessToken;
  if (!s.refreshToken || !s.clientId || !s.clientSecret) return null;
  const tokens = await exchange({
    grantType: "refresh_token",
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    refreshToken: s.refreshToken,
  });
  persistTokens(s, tokens);
  return tokens.access_token;
}

function persistTokens(prev, tokens) {
  store.write({
    ...prev,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || prev.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  });
}

function avatarUrl(me) {
  const icon = String(me.icon_img || me.snoovatar_img || "").split("?")[0];
  try {
    const url = new URL(icon);
    if (url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function renderProfile(me) {
  const name = escapeHtml(String(me.name || ""));
  const id = escapeHtml(String(me.id || ""));
  const src = avatarUrl(me);
  $("profile").innerHTML = `
    ${src ? `<img alt="" src="${src}" width="72" height="72" />` : `<span class="mark" aria-hidden="true"></span>`}
    <div>
      <h2>u/${name}</h2>
      <p class="meta">
        <span>id <b>t2_${id}</b></span>
        <span>karma <b>${fmtCount(me.total_karma ?? me.link_karma + me.comment_karma)}</b></span>
        <span>joined <b>${fmtDate(me.created_utc)}</b></span>
      </p>
    </div>
  `;
  $("who").textContent = `u/${me.name || ""}`;
}

function renderSubs(items, query) {
  const q = query.trim().toLowerCase();
  const filtered = items.filter((s) => {
    const hay = `${s.display_name} ${s.title || ""} ${s.public_description || ""}`.toLowerCase();
    return !q || hay.includes(q);
  });
  $("subs").innerHTML = filtered
    .map((s) => {
      const desc = (s.public_description || s.title || "").slice(0, 180);
      return `<li>
        <a href="https://www.reddit.com/${s.display_name_prefixed}" target="_blank" rel="noreferrer">${s.display_name_prefixed}</a>
        <span class="count">${fmtCount(s.subscribers)} members</span>
        ${desc ? `<p>${escapeHtml(desc)}</p>` : ""}
      </li>`;
    })
    .join("");
  $("status").textContent = `${fmtCount(filtered.length)} of ${fmtCount(items.length)} communities`;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadAllSubs(token, where) {
  const out = [];
  let after = null;
  do {
    const listing = await reddit(`subreddits/mine/${where}`, token, {
      limit: "100",
      after,
    });
    const children = listing?.data?.children || [];
    for (const child of children) out.push(child.data);
    after = listing?.data?.after || null;
  } while (after);
  out.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return out;
}

let cache = { where: "", items: [] };

async function showApp() {
  $("gate").hidden = true;
  $("app").hidden = false;
  $("session").hidden = false;
  const token = await ensureToken();
  if (!token) {
    signOut();
    return;
  }
  $("status").textContent = "Loading profile…";
  const me = await reddit("api/v1/me", token);
  renderProfile(me);
  await loadWhere("subscriber");
}

async function loadWhere(where) {
  const token = await ensureToken();
  $("status").textContent = "Loading communities…";
  cache = { where, items: await loadAllSubs(token, where) };
  renderSubs(cache.items, $("filter").value);
}

function signOut() {
  store.clear();
  sessionStorage.removeItem("reddata.state");
  $("app").hidden = true;
  $("gate").hidden = false;
  $("session").hidden = true;
}

function connect(clientId, clientSecret) {
  const state = crypto.randomUUID();
  sessionStorage.setItem("reddata.state", state);
  store.write({ clientId, clientSecret });
  const url = new URL("https://www.reddit.com/api/v1/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", SCOPES);
  location.assign(url);
}

async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const err = params.get("error");
  if (!code && !err) return false;
  history.replaceState({}, "", "/");
  if (err) throw new Error(err);
  if (state !== sessionStorage.getItem("reddata.state")) throw new Error("State mismatch");
  const s = store.read();
  const tokens = await exchange({
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    code,
    redirectUri: redirectUri(),
  });
  persistTokens(s, tokens);
  return true;
}

$("redirect-hint").textContent = redirectUri();

$("connect").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  connect(String(fd.get("clientId")).trim(), String(fd.get("clientSecret")).trim());
});

/* Returning via back/forward restores from the bfcache, where the module never
   re-runs, so clear again on that path too. */
addEventListener("pageshow", (e) => {
  if (e.persisted) $("connect").reset();
});

$("signout").addEventListener("click", signOut);
$("filter").addEventListener("input", () => renderSubs(cache.items, $("filter").value));
$("rel").addEventListener("change", (e) => {
  if (e.target.name === "rel") loadWhere(e.target.value).catch(showError);
});

function showError(err) {
  const el = $("gate-error");
  el.hidden = false;
  el.textContent = err.message || String(err);
  $("status").textContent = err.message || String(err);
}

(async () => {
  const saved = store.read();

  /* Start the form empty every load. Two things would otherwise refill it: we
     used to prefill the id from storage, and browsers restore form values on a
     soft reload regardless of autocomplete="off". Credentials still go to
     storage on submit because the OAuth round trip needs them after the
     redirect, but nothing types them back into the page. */
  $("connect").reset();
  $("connect").clientId.value = "";
  $("connect").clientSecret.value = "";

  try {
    const redirected = await handleRedirect();
    if (redirected || saved.accessToken) await showApp();
  } catch (err) {
    showError(err);
  }
})();
