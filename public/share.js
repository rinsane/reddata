/* Encode a subreddit list into a URL fragment.

   The list never reaches a server: a fragment is not sent with the request.
   That also means there is nothing to expire, and nothing of yours stored
   anywhere. The link itself is the data. */

const b64url = {
  encode(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  },
  decode(str) {
    const pad = str.replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function encodeList(names) {
  const joined = names.join(",");
  try {
    return `g.${b64url.encode(await gzip(joined))}`;
  } catch {
    return `p.${b64url.encode(new TextEncoder().encode(joined))}`;
  }
}

export async function decodeList(token) {
  const [kind, payload] = [token.slice(0, 2), token.slice(2)];
  const bytes = b64url.decode(payload);
  const text =
    kind === "g." ? await gunzip(bytes) : new TextDecoder().decode(bytes);
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

/* Subreddit names are [A-Za-z0-9_]. Anything else came from a hand-edited
   link, so drop it rather than paste it into a request. */
export function sane(names) {
  return names.filter((n) => /^[A-Za-z0-9_]{2,24}$/.test(n));
}
