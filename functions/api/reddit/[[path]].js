const USER_AGENT = "web:reddata:0.1.0";

export async function onRequest({ request, params }) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return json({ error: "missing_token" }, 401);
  }

  const segments = params.path;
  const path = Array.isArray(segments) ? segments.join("/") : String(segments || "");
  if (!path || path.includes("..")) {
    return json({ error: "invalid_path" }, 400);
  }

  const incoming = new URL(request.url);
  const target = new URL(`https://oauth.reddit.com/${path}`);
  target.search = incoming.search;

  const headers = {
    Authorization: auth,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };

  const init = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
    const contentType = request.headers.get("Content-Type");
    if (contentType) headers["Content-Type"] = contentType;
  }

  const upstream = await fetch(target, init);
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
