const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const USER_AGENT = "web:reddata:0.1.0";

export async function onRequestPost({ request }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const clientId = String(payload.clientId || "").trim();
  const clientSecret = String(payload.clientSecret || "").trim();
  if (!clientId || !clientSecret) {
    return json({ error: "missing_credentials" }, 400);
  }

  const grantType = payload.grantType === "refresh_token" ? "refresh_token" : "authorization_code";
  const body = new URLSearchParams({ grant_type: grantType });

  if (grantType === "refresh_token") {
    if (!payload.refreshToken) return json({ error: "missing_refresh_token" }, 400);
    body.set("refresh_token", payload.refreshToken);
  } else {
    if (!payload.code || !payload.redirectUri) return json({ error: "missing_code" }, 400);
    body.set("code", payload.code);
    body.set("redirect_uri", payload.redirectUri);
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

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
