/* Pack a subreddit list into a URL fragment.

   A fragment is never sent to a server, so nothing here touches Cloudflare:
   building a link is pure client-side work, and there is no request to flood
   and nothing stored to grow.

   Payload is "<expiry epoch seconds or 0>\n<comma separated names>", gzipped
   and base64url'd. The expiry is a courtesy, not a secret: anyone holding the
   link still holds the list and can decode it offline whenever they like. */

const PREFIX_GZIP = "g.";
const PREFIX_PLAIN = "p.";

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

export async function encodeList(names, expiresAt = 0) {
  const text = `${Math.floor(expiresAt) || 0}\n${names.join(",")}`;
  try {
    return PREFIX_GZIP + b64url.encode(await gzip(text));
  } catch {
    return PREFIX_PLAIN + b64url.encode(new TextEncoder().encode(text));
  }
}

export async function decodeList(token) {
  const kind = token.slice(0, 2);
  const bytes = b64url.decode(token.slice(2));
  const text =
    kind === PREFIX_GZIP ? await gunzip(bytes) : new TextDecoder().decode(bytes);

  const nl = text.indexOf("\n");
  if (nl === -1) return { names: split(text), expiresAt: 0 }; // pre-expiry links
  return {
    names: split(text.slice(nl + 1)),
    expiresAt: Number(text.slice(0, nl)) || 0,
  };
}

const split = (s) => s.split(",").map((v) => v.trim()).filter(Boolean);

/* Subreddit names are [A-Za-z0-9_]. Anything else came from a hand-edited link,
   so drop it rather than paste it into a request. */
export function sane(names) {
  return names.filter((n) => /^[A-Za-z0-9_]{2,24}$/.test(n));
}
