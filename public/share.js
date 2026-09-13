/* Pack a community list into a URL fragment.

   A fragment is never sent to a server, so nothing here touches Cloudflare:
   building a link is pure client-side work, with no request to flood and
   nothing stored to grow.

   Payload is "<expiry epoch seconds or 0>\n<body>". The body is either a comma
   separated list of names (compact) or one tab separated record per line
   (detailed). Records win when the body contains a tab, which keeps links that
   were already sent working.

   The expiry is a courtesy, not a secret: whoever holds the link holds the list
   and can decode it offline whenever they like. */

const GZIP = "g.";
const PLAIN = "p.";
const TAB = "\t";

const b64url = {
  encode(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  },
  decode(str) {
    const pad = str.replaceAll("-", "+").replaceAll("_", "/");
    return Uint8Array.from(
      atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)),
      (c) => c.charCodeAt(0)
    );
  },
};

async function gzip(text) {
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function gunzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(s).text();
}

async function pack(text) {
  try {
    return GZIP + b64url.encode(await gzip(text));
  } catch {
    return PLAIN + b64url.encode(new TextEncoder().encode(text));
  }
}

const clean = (s) => String(s ?? "").replace(/[\t\n\r]+/g, " ").trim();

/* items: full subreddit objects. detailed=false ships names only. */
export async function encodeList(items, { expiresAt = 0, detailed = true, desc = 160 } = {}) {
  const head = `${Math.floor(expiresAt) || 0}\n`;

  if (!detailed) {
    return pack(head + items.map((s) => s.display_name).join(","));
  }

  const rows = items.map((s) =>
    [
      s.display_name,
      s.subscribers || 0,
      s.over18 ? 1 : 0,
      s.created_utc || 0,
      clean(s.public_description || s.title || "").slice(0, desc),
    ].join(TAB)
  );
  return pack(head + rows.join("\n"));
}

export async function decodeList(token) {
  const kind = token.slice(0, 2);
  const bytes = b64url.decode(token.slice(2));
  const text = kind === GZIP ? await gunzip(bytes) : new TextDecoder().decode(bytes);

  const nl = text.indexOf("\n");
  const expiresAt = nl === -1 ? 0 : Number(text.slice(0, nl)) || 0;
  const body = nl === -1 ? text : text.slice(nl + 1);

  if (!body.includes(TAB)) {
    const items = body
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((display_name) => ({ display_name }));
    return { items, expiresAt, detailed: false };
  }

  const items = body
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [display_name, subscribers, over18, created_utc, description] = line.split(TAB);
      return {
        display_name,
        subscribers: Number(subscribers) || 0,
        over18: over18 === "1",
        created_utc: Number(created_utc) || 0,
        public_description: description || "",
      };
    });
  return { items, expiresAt, detailed: true };
}

/* Subreddit names are [A-Za-z0-9_]. Anything else came from a hand-edited link,
   so drop it rather than paste it into a request. */
export function sane(items) {
  return items.filter((s) => /^[A-Za-z0-9_]{2,24}$/.test(s.display_name || ""));
}
