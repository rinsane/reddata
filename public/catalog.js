/* Everything the grab viewer and the join picker have in common: filtering,
   sorting, stats, card markup and the dual slider. Shared rather than copied so
   the two pages cannot drift apart. */

export const STEPS = 1000;

const nf = new Intl.NumberFormat();
export const fmt = (n) => nf.format(n ?? 0);
export const short = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n ?? 0);

export function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* Member counts run from single digits to hundreds of millions, so a linear
   slider would spend its whole travel on the largest few. Map logarithmically. */
export function makeScale(items) {
  const sizes = items.map((s) => s.subscribers || 0);
  const lo = sizes.length ? Math.min(...sizes) : 0;
  const hi = sizes.length ? Math.max(...sizes) : 0;
  return {
    lo,
    hi,
    toValue(pos) {
      if (hi <= lo) return lo;
      const a = Math.log1p(lo);
      const b = Math.log1p(hi);
      return Math.round(Math.expm1(a + ((b - a) * pos) / STEPS));
    },
  };
}

export function filterItems(items, { q = "", mature = "all", min = 0, max = Infinity }) {
  const needle = q.trim().toLowerCase();
  return items.filter((s) => {
    if (mature === "hide" && s.over18) return false;
    if (mature === "only" && !s.over18) return false;
    const n = s.subscribers || 0;
    if (n < min || n > max) return false;
    if (!needle) return true;
    return `${s.display_name} ${s.title || ""} ${s.public_description || ""}`
      .toLowerCase()
      .includes(needle);
  });
}

export function sortItems(items, how) {
  const copy = [...items];
  if (how === "size") return copy.sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0));
  if (how === "age") return copy.sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0));
  return copy.sort((a, b) =>
    a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase())
  );
}

export function stats(items) {
  const sizes = items.map((s) => s.subscribers || 0).sort((a, b) => a - b);
  return {
    count: items.length,
    members: sizes.reduce((a, b) => a + b, 0),
    nsfw: items.filter((s) => s.over18).length,
    median: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0,
  };
}

/* `pick` turns the title into a checkbox label for the join page. Everything
   else renders the same on both. */
export function cardHTML(s, { pick = false, checked = false } = {}) {
  const name = esc(s.display_name);
  const desc = esc((s.public_description || s.title || "").slice(0, 160));
  const tag = s.over18 ? `<span class="tag">18+</span>` : "";
  const members = s.subscribers == null ? "" : `<span class="count">${fmt(s.subscribers)}</span>`;

  const href = `https://www.reddit.com/r/${encodeURIComponent(s.display_name)}/`;

  /* Exactly two grid children either way, so list and card layouts line up
     whether or not there are checkboxes. */
  const left = pick
    ? `<label class="pick">
         <input type="checkbox" value="${name}"${checked ? " checked" : ""} />
         <span class="pick-name">r/${name}</span>
       </label>${tag}`
    : `<a href="${href}" target="_blank" rel="noreferrer">r/${name}</a>${tag}`;

  const right = `<span class="meta-right">${members}${
    pick ? `<a class="pick-peek" href="${href}" target="_blank" rel="noreferrer">open</a>` : ""
  }</span>`;

  return `<li>${left}${right}${desc ? `<p>${desc}</p>` : ""}</li>`;
}

/* Two inputs overlaid on one track. Keeps the thumbs from crossing, paints the
   fill between them, and lifts the min thumb above the max when both sit at the
   far right so it can still be dragged back. */
export function wireDualSlider({ min, max, fill }, onChange) {
  function paint(moved) {
    const lo = Number(min.value);
    const hi = Number(max.value);
    if (lo > hi) {
      if (moved === "max") min.value = hi;
      else max.value = lo;
    }
    const a = Number(min.value) / STEPS;
    const b = Number(max.value) / STEPS;
    fill.style.left = `${a * 100}%`;
    fill.style.width = `${(b - a) * 100}%`;
    min.style.zIndex = lo > STEPS - 40 ? "4" : "2";
    max.style.zIndex = "3";
  }

  min.addEventListener("input", () => {
    paint("min");
    onChange();
  });
  max.addEventListener("input", () => {
    paint("max");
    onChange();
  });

  return {
    paint,
    reset() {
      min.value = 0;
      max.value = STEPS;
      paint();
    },
    read(scale) {
      const a = Number(min.value);
      const b = Number(max.value);
      return { min: scale.toValue(a), max: scale.toValue(b), wide: a === 0 && b === STEPS };
    },
  };
}
