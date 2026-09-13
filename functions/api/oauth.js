import { forbidden, json, sameOrigin } from "../_shared.js";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const USER_AGENT = "web:reddata:0.1.0";

export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return forbidden();

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const clientId = String(payload.clientId || "").trim();
  const clientSecret = String(payload.clientSecret || "").trim();
  if (!looksLikeId(clientId) || !looksLikeSecret(clientSecret)) {
    return json({ error: "invalid_credentials" }, 400);
  }

  const expectedRedirect = `${new URL(request.url).origin}/`;
  const grantType = payload.grantType === "refresh_token" ? "refresh_token" : "authorization_code";
  const body = new URLSearchParams({ grant_type: grantType });

  if (grantType === "refresh_token") {
    const refreshToken = String(payload.refreshToken || "");
    if (!refreshToken || refreshToken.length > 2048) {
      return json({ error: "missing_refresh_token" }, 400);
    }
    body.set("refresh_token", refreshToken);
  } else {
    const code = String(payload.code || "");
    const redirectUri = String(payload.redirectUri || "");
    if (!code || code.length > 512 || redirectUri !== expectedRedirect) {
      return json({ error: "invalid_oauth" }, 400);
    }
    body.set("code", code);
    body.set("redirect_uri", redirectUri);
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const upstream = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });

  let data;
  try {
    data = await upstream.json();
  } catch {
    return json({ error: "upstream_invalid" }, 502);
  }

  if (!upstream.ok || data.error) {
    return json({ error: "oauth_failed" }, upstream.status === 401 ? 401 : 400);
  }

  return json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    token_type: data.token_type,
    scope: data.scope,
  });
}

function looksLikeId(value) {
  return /^[A-Za-z0-9_-]{10,64}$/.test(value);
}

function looksLikeSecret(value) {
  return /^[A-Za-z0-9_-]{10,64}$/.test(value);
}
