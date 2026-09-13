import { encodeList } from "/share.js";
import { AUTH_SNIPPET } from "/reddit-auth.js";
import { fail, note } from "/toast.js";

const $ = (id) => document.getElementById(id);
const WHERE = ["subscriber", "moderator", "contributor"];
const STEPS = 1000;

const nf = new Intl.NumberFormat();
const fmt = (n) => nf.format(n ?? 0);
const short = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

let data = {};
let view = { where: "subscriber", items: [] };
let bounds = { lo: 0, hi: 0 };

/* Runs on reddit.com, where the session lives. Reads only. */
const BOOKMARKLET =
  `javascript:(async()=>{try{${AUTH_SNIPPET}` +
  `if(!requireReddit())return;` +
  `var a=await getAuth();` +
  `if(!a){alert('reddata\\n\\nNo Reddit session found.\\n\\nOpen reddit.com, sign in, then click the bookmark there.');return}` +
  `var s=function(m){return new Promise(function(r){setTimeout(r,m)})};` +
  `var pg=async function(w,af){var u=new URL(a.mode==='token'?'https://oauth.reddit.com/subreddits/mine/'+w:'https://www.reddit.com/subreddits/mine/'+w+'.json');u.searchParams.set('limit','100');u.searchParams.set('raw_json','1');if(af)u.searchParams.set('after',af);` +
  `var r=await fetch(u,a.mode==='token'?{headers:{Authorization:'Bearer '+a.token}}:{credentials:'include'});if(!r.ok)throw new Error(r.status+' '+r.statusText);return r.json()};` +
  `var all=async function(w){var o=[],af=null,g=0;do{var j=await pg(w,af);var k=(j&&j.data&&j.data.children)||[];for(var i=0;i<k.length;i++)o.push(k[i].data);af=(j&&j.data&&j.data.after)||null;if(af)await s(500)}while(af&&++g<60);return o};` +
  `var res={},ws=['subscriber','moderator','contributor'];` +
  `for(var i=0;i<ws.length;i++){try{res[ws[i]]=await all(ws[i])}catch(e){res[ws[i]]=[]}await s(400)}` +
  `var b=new Blob([JSON.stringify(res)],{type:'application/json'});var el=document.createElement('a');el.href=URL.createObjectURL(b);el.download='reddit-subs.json';el.click();` +
  `alert('reddata ('+a.mode+')\\n\\n'+res.subscriber.length+' joined\\n'+res.moderator.length+' moderating\\n'+res.contributor.length+' approved\\n\\nSaved reddit-subs.json - drop it into reddata.');` +
  `}catch(e){alert('reddata failed: '+e.message)}})()`;

$("bookmarklet").href = BOOKMARKLET;
$("bookmarklet").addEventListener("click", (e) => {
  e.preventDefault();
  fail("Drag this to your bookmarks bar, then click it while you are on reddit.com. It cannot run from this page.");
});

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* Member counts span single digits to hundreds of millions, so a linear slider
   would spend its whole travel on the top few communities. Map logarithmically. */
const toValue = (pos) => {
  const { lo, hi } = bounds;
  if (hi <= lo) return lo;
  const a = Math.log1p(lo);
  const b = Math.log1p(hi);
  return Math.round(Math.expm1(a + ((b - a) * pos) / STEPS));
};

function sliderRange() {
  let a = Number($("min").value);
  let b = Number($("max").value);
  if (a > b) [a, b] = [b, a];
  return { min: toValue(a), max: toValue(b), wide: a === 0 && b === STEPS };
}

function stats(items) {
  const sizes = items.map((s) => s.subscribers || 0).sort((a, b) => a - b);
  $("s-count").textContent = fmt(items.length);
  $("s-members").textContent = fmt(sizes.reduce((a, b) => a + b, 0));
  $("s-nsfw").textContent = fmt(items.filter((s) => s.over18).length);
  $("s-median").textContent = fmt(sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0);
}

function visible() {
  const q = $("filter").value.trim().toLowerCase();
  const mature = document.querySelector('input[name="mature"]:checked').value;
  const { min, max } = sliderRange();

  return view.items.filter((s) => {
    if (mature === "hide" && s.over18) return false;
    if (mature === "only" && !s.over18) return false;
    const n = s.subscribers || 0;
    if (n < min || n > max) return false;
    if (!q) return true;
    return `${s.display_name} ${s.title || ""} ${s.public_description || ""}`
      .toLowerCase()
      .includes(q);
  });
}

function sortBy(items) {
  const how = document.querySelector('input[name="sort"]:checked').value;
  const copy = [...items];
  if (how === "size") return copy.sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0));
  if (how === "age") return copy.sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0));
  return copy.sort((a, b) =>
    a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase())
  );
}

function card(s) {
  const desc = esc((s.public_description || s.title || "").slice(0, 160));
  const tag = s.over18 ? `<span class="tag">18+</span>` : "";
  return `<li>
    <a href="https://www.reddit.com/r/${encodeURIComponent(s.display_name)}/" target="_blank" rel="noreferrer">r/${esc(s.display_name)}</a>${tag}
    <span class="count">${fmt(s.subscribers)}</span>
    ${desc ? `<p>${desc}</p>` : ""}
  </li>`;
}

function render() {
  const layout = document.querySelector('input[name="view"]:checked').value;
  const shown = sortBy(visible());

  $("subs").className = layout === "grid" ? "subs grid" : "subs";
  $("subs").innerHTML = shown.map(card).join("");

  const { min, max, wide } = sliderRange();
  $("range-label").textContent = wide ? "any size" : `${short(min)} – ${short(max)}`;
  $("status").textContent =
    shown.length === view.items.length
      ? `${fmt(shown.length)} communities`
      : `${fmt(shown.length)} of ${fmt(view.items.length)} communities`;
}

function loadWhere(where) {
  view = { where, items: data[where] || [] };
  const sizes = view.items.map((s) => s.subscribers || 0);
  bounds = { lo: sizes.length ? Math.min(...sizes) : 0, hi: sizes.length ? Math.max(...sizes) : 0 };
  $("min").value = 0;
  $("max").value = STEPS;
  stats(view.items);
  render();
}

function accept(json) {
  if (!json || typeof json !== "object") throw new Error("that file is not the expected JSON");
  if (!WHERE.some((w) => Array.isArray(json[w]))) {
    throw new Error("no subscriber/moderator/contributor lists inside");
  }
  data = json;
  $("intro").hidden = true;
  $("drop").hidden = true;
  $("app").hidden = false;
  loadWhere("subscriber");
}

async function readFile(file) {
  try {
    accept(JSON.parse(await file.text()));
  } catch (err) {
    fail(`Could not read that file: ${err.message}`);
  }
}

function toCsv() {
  const cols = ["relationship", "subreddit", "title", "description", "members", "mature", "created", "url"];
  const cell = (v) => {
    const s = String(v ?? "").replace(/\r?\n/g, " ");
    return /[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const rows = [];
  for (const where of WHERE) {
    for (const s of data[where] || []) {
      rows.push([
        where,
        s.display_name,
        s.title,
        s.public_description,
        s.subscribers,
        s.over18 ? "yes" : "no",
        s.created_utc ? new Date(s.created_utc * 1000).toISOString().slice(0, 10) : "",
        `https://www.reddit.com/r/${s.display_name}/`,
      ]);
    }
  }
  return [cols.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* Shares exactly what the filters currently show, nothing else. Runs entirely
   here: no request is made, so links are free to make and cost the site nothing. */
async function buildShare() {
  const names = sortBy(visible()).map((s) => s.display_name);
  if (!names.length) {
    fail("Nothing to share — every community is filtered out.");
    return;
  }
  const ttl = Number($("expiry").value);
  const expiresAt = ttl ? Math.floor(Date.now() / 1000) + ttl : 0;

  try {
    const url = `${location.origin}/join#${await encodeList(names, expiresAt)}`;
    $("share-url").value = url;
    $("share-open").href = url;
    $("share-out").hidden = false;
    $("share-desc").textContent =
      `Sharing the ${fmt(names.length)} communities shown right now — filters included. ` +
      `The list rides after the #, which browsers never send to a server, so nothing is stored and no request is made. ` +
      (expiresAt
        ? `The page refuses it after ${new Date(expiresAt * 1000).toLocaleString()}, though anyone who saved the link can still decode it offline.`
        : `This link never expires.`);
    $("share-out").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    fail(`Could not build a link: ${err.message}`);
  }
}

$("share").addEventListener("click", buildShare);
$("expiry").addEventListener("change", () => {
  if (!$("share-out").hidden) buildShare();
});
$("share-close").addEventListener("click", () => ($("share-out").hidden = true));
$("csv").addEventListener("click", () => download("reddata.csv", toCsv(), "text/csv"));

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("share-url").value);
    note("Share link copied to clipboard");
  } catch {
    $("share-url").select();
    note("Selected — press ⌘C to copy");
  }
});

$("reset").addEventListener("click", () => {
  $("filter").value = "";
  $("min").value = 0;
  $("max").value = STEPS;
  document.querySelector('input[name="mature"][value="all"]').checked = true;
  document.querySelector('input[name="sort"][value="name"]').checked = true;
  render();
});

$("file").addEventListener("change", (e) => {
  if (e.target.files[0]) readFile(e.target.files[0]);
});

$("filter").addEventListener("input", render);
$("sort").addEventListener("change", render);
$("mature").addEventListener("change", render);
$("view").addEventListener("change", render);
$("min").addEventListener("input", render);
$("max").addEventListener("input", render);
$("rel").addEventListener("change", (e) => {
  if (e.target.name === "rel") loadWhere(e.target.value);
});

const drop = $("drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const file = e.dataTransfer?.files?.[0];
  if (file) readFile(file);
});
