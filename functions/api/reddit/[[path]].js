import { forbidden, json, sameOrigin } from "../../_shared.js";

const USER_AGENT = "web:reddata:0.1.0";
const ALLOWED = new Set([
  "api/v1/me",
  "subreddits/mine/subscriber",
  "subreddits/mine/moderator",
  "subreddits/mine/contributor",
]);

export async function onRequestGet({ request, params }) {
  if (!sameOrigin(request)) return forbidden();

  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer \S{16,2048}$/.test(auth)) {
    return json({ error: "missing_token" }, 401);
  }

  const segments = params.path;
  const path = Array.isArray(segments) ? segments.join("/") : String(segments || "");
  if (!ALLOWED.has(path)) {
    return json({ error: "path_not_allowed" }, 403);
  }

  const incoming = new URL(request.url);
  const target = new URL(`https://oauth.reddit.com/${path}`);
  const after = incoming.searchParams.get("after");
  const limit = incoming.searchParams.get("limit") || "100";
  if (!/^\d{1,3}$/.test(limit) || Number(limit) > 100) {
    return json({ error: "invalid_limit" }, 400);
  }
  target.searchParams.set("limit", limit);
  target.searchParams.set("raw_json", "1");
  if (after) {
    if (!/^[A-Za-z0-9_:]{1,64}$/.test(after)) {
      return json({ error: "invalid_after" }, 400);
    }
    target.searchParams.set("after", after);
  }

  const upstream = await fetch(target, {
    method: "GET",
    headers: {
      Authorization: auth,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
