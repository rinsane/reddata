import { encodeList } from "/share.js";
import { AUTH_SNIPPET } from "/reddit-auth.js";
import { fail, note } from "/toast.js";
import {
  fmt, short, cardHTML, filterItems, sortItems, stats, makeScale, wireDualSlider,
} from "/catalog.js";

const $ = (id) => document.getElementById(id);
const WHERE = ["subscriber", "moderator", "contributor"];

let data = {};
let view = { where: "subscriber", items: [] };
let scale = makeScale([]);

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

const slider = wireDualSlider(
  { min: $("min"), max: $("max"), fill: $("dual-fill") },
  () => render()
);

function shown() {
  const { min, max } = slider.read(scale);
  return sortItems(
    filterItems(view.items, {
      q: $("filter").value,
      mature: document.querySelector('input[name="mature"]:checked').value,
      min,
      max,
    }),
    document.querySelector('input[name="sort"]:checked').value
  );
}

function render() {
  const layout = document.querySelector('input[name="view"]:checked').value;
  const list = shown();

  $("subs").className = layout === "grid" ? "subs grid" : "subs";
  $("subs").innerHTML = list.map((s) => cardHTML(s)).join("");

  const { wide, min, max } = slider.read(scale);
  $("range-label").textContent = wide ? "any size" : `${short(min)} – ${short(max)}`;
  $("status").textContent =
    list.length === view.items.length
      ? `${fmt(list.length)} communities`
      : `${fmt(list.length)} of ${fmt(view.items.length)} communities`;
}

function loadWhere(where) {
  view = { where, items: data[where] || [] };
  scale = makeScale(view.items);
  slider.reset();

  const t = stats(view.items);
  $("s-count").textContent = fmt(t.count);
  $("s-members").textContent = fmt(t.members);
  $("s-nsfw").textContent = fmt(t.nsfw);
  $("s-median").textContent = fmt(t.median);

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
        where, s.display_name, s.title, s.public_description, s.subscribers,
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

/* Shares exactly what the filters currently show. Runs entirely here: no request
   is made, so links cost the site nothing however many you build. */
async function buildShare() {
  const list = shown();
  if (!list.length) {
    fail("Nothing to share — every community is filtered out.");
    return;
  }
  const ttl = Number($("expiry").value);
  const expiresAt = ttl ? Math.floor(Date.now() / 1000) + ttl : 0;
  const detailed = $("detailed").checked;

  try {
    const url = `${location.origin}/join#${await encodeList(list, { expiresAt, detailed })}`;
    const kb = (url.length / 1024).toFixed(1);
    $("share-url").value = url;
    $("share-open").href = url;
    $("share-out").hidden = false;
    $("share-desc").textContent =
      `Sharing the ${fmt(list.length)} communities shown right now — filters included. ` +
      (detailed
        ? `They get the same browser you see: stats, search, sort, cards, mature and member filters. `
        : `Names only, so they get a plain picker without the stats and filters. `) +
      `Link is ${kb} KB` +
      (url.length > 8000 ? ` — long enough that some chat apps may trim it, so paste it somewhere that keeps the whole URL. ` : `. `) +
      (expiresAt
        ? `The page refuses it after ${new Date(expiresAt * 1000).toLocaleString()}, though anyone who saved it can still decode it offline.`
        : `This link never expires.`);
    $("share-out").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    fail(`Could not build a link: ${err.message}`);
  }
}

const rebuild = () => {
  if (!$("share-out").hidden) buildShare();
};

$("share").addEventListener("click", buildShare);
$("expiry").addEventListener("change", rebuild);
$("detailed").addEventListener("change", rebuild);
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
  slider.reset();
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
