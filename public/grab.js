import { encodeList } from "/share.js";
import { AUTH_SNIPPET } from "/reddit-auth.js";

const $ = (id) => document.getElementById(id);
const WHERE = ["subscriber", "moderator", "contributor"];

const nf = new Intl.NumberFormat();
const fmt = (n) => nf.format(n ?? 0);

let data = {};
let view = { where: "subscriber", items: [] };

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

function fail(msg) {
  $("error").hidden = false;
  $("error").textContent = msg;
}

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stats(items) {
  const sizes = items.map((s) => s.subscribers || 0).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  $("s-count").textContent = fmt(items.length);
  $("s-members").textContent = fmt(sizes.reduce((a, b) => a + b, 0));
  $("s-nsfw").textContent = fmt(items.filter((s) => s.over18).length);
  $("s-median").textContent = fmt(median);
}

function visible() {
  const q = $("filter").value.trim().toLowerCase();
  const sfw = $("sfw").checked;
  return view.items.filter((s) => {
    if (sfw && s.over18) return false;
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
  return copy.sort((a, b) => a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase()));
}

function render() {
  const shown = sortBy(visible());

  $("subs").innerHTML = shown
    .map((s) => {
      const desc = esc((s.public_description || s.title || "").slice(0, 160));
      const tag = s.over18 ? `<span class="tag">18+</span>` : "";
      return `<li>
        <a href="https://www.reddit.com/r/${encodeURIComponent(s.display_name)}/" target="_blank" rel="noreferrer">r/${esc(s.display_name)}</a>${tag}
        <span class="count">${fmt(s.subscribers)}</span>
        ${desc ? `<p>${desc}</p>` : ""}
      </li>`;
    })
    .join("");

  $("status").textContent =
    shown.length === view.items.length
      ? `${fmt(shown.length)} communities`
      : `${fmt(shown.length)} of ${fmt(view.items.length)} communities`;
}

function loadWhere(where) {
  view = { where, items: data[where] || [] };
  stats(view.items);
  render();
}

function accept(json) {
  if (!json || typeof json !== "object") throw new Error("that file is not the expected JSON");
  if (!WHERE.some((w) => Array.isArray(json[w]))) {
    throw new Error("no subscriber/moderator/contributor lists inside");
  }
  data = json;
  $("error").hidden = true;
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

$("csv").addEventListener("click", () => download("reddata.csv", toCsv(), "text/csv"));

$("share").addEventListener("click", async () => {
  const names = sortBy(visible()).map((s) => s.display_name);
  if (!names.length) return fail("Nothing to share — every community is filtered out.");
  try {
    const url = `${location.origin}/join#${await encodeList(names)}`;
    $("share-url").value = url;
    $("share-open").href = url;
    $("share-out").hidden = false;
    $("copied").textContent = `${fmt(names.length)} communities · ${(url.length / 1024).toFixed(1)} KB`;
    $("share-out").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    fail(`Could not build a link: ${err.message}`);
  }
});

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("share-url").value);
    $("copied").textContent = "copied";
  } catch {
    $("share-url").select();
    $("copied").textContent = "press ⌘C";
  }
});

$("file").addEventListener("change", (e) => {
  if (e.target.files[0]) readFile(e.target.files[0]);
});

$("filter").addEventListener("input", render);
$("sfw").addEventListener("change", render);
$("sort").addEventListener("change", render);
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
