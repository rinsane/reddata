import { encodeList } from "/share.js";

const $ = (id) => document.getElementById(id);
const WHERE = ["subscriber", "moderator", "contributor"];

/* The bookmarklet. Runs on reddit.com, where the session lives. Kept as one
   expression so it survives being pasted into a bookmark URL. */
const BOOKMARKLET = `javascript:(async()=>{try{
var t=(window.___r&&window.___r.user&&window.___r.user.session&&window.___r.user.session.accessToken)||null;
var s=function(m){return new Promise(function(r){setTimeout(r,m)})};
var pg=async function(w,a){var u=new URL(t?'https://oauth.reddit.com/subreddits/mine/'+w:location.origin+'/subreddits/mine/'+w+'.json');u.searchParams.set('limit','100');u.searchParams.set('raw_json','1');if(a)u.searchParams.set('after',a);var r=await fetch(u,t?{headers:{Authorization:'Bearer '+t}}:{credentials:'include'});if(!r.ok)throw new Error(r.status+' '+r.statusText);return r.json()};
var all=async function(w){var o=[],a=null,g=0;do{var j=await pg(w,a);var k=(j&&j.data&&j.data.children)||[];for(var i=0;i<k.length;i++)o.push(k[i].data);a=(j&&j.data&&j.data.after)||null;if(a)await s(500)}while(a&&++g<60);return o};
var res={},ws=['subscriber','moderator','contributor'];
for(var i=0;i<ws.length;i++){try{res[ws[i]]=await all(ws[i])}catch(e){res[ws[i]]=[]}await s(500)}
var b=new Blob([JSON.stringify(res,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='reddit-subs.json';a.click();
alert('reddata\\n'+res.subscriber.length+' joined\\n'+res.moderator.length+' moderating\\n'+res.contributor.length+' approved\\n\\nSaved reddit-subs.json - drop it into reddata.');
}catch(e){alert('reddata failed: '+e.message)}})()`
  .replace(/\n/g, "");

$("bookmarklet").href = BOOKMARKLET;
$("bookmarklet").addEventListener("click", (e) => {
  e.preventDefault();
  fail("Don't click it here — drag it to your bookmarks bar, then click it on reddit.com.");
});

let data = {};
let cache = { where: "subscriber", items: [] };

function fail(msg) {
  const el = $("error");
  el.hidden = false;
  el.textContent = msg;
}

function fmtCount(n) {
  return new Intl.NumberFormat().format(n ?? 0);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  const q = $("filter").value.trim().toLowerCase();
  const items = cache.items;
  const filtered = items.filter((s) => {
    const hay = `${s.display_name} ${s.title || ""} ${s.public_description || ""}`.toLowerCase();
    return !q || hay.includes(q);
  });

  $("subs").innerHTML = filtered
    .map((s) => {
      const name = escapeHtml(s.display_name_prefixed || `r/${s.display_name}`);
      const desc = escapeHtml((s.public_description || s.title || "").slice(0, 180));
      const nsfw = s.over18 ? ` <span class="tag">18+</span>` : "";
      return `<li>
        <a href="https://www.reddit.com/r/${encodeURIComponent(s.display_name)}/" target="_blank" rel="noreferrer">${name}</a>${nsfw}
        <span class="count">${fmtCount(s.subscribers)} members</span>
        ${desc ? `<p>${desc}</p>` : ""}
      </li>`;
    })
    .join("");

  $("status").textContent = `${fmtCount(filtered.length)} of ${fmtCount(items.length)} communities`;
}

function loadWhere(where) {
  cache = { where, items: [...(data[where] || [])] };
  cache.items.sort((a, b) => a.display_name.localeCompare(b.display_name));
  render();
}

function accept(json) {
  if (!json || typeof json !== "object") throw new Error("That file isn't the expected JSON.");
  const found = WHERE.filter((w) => Array.isArray(json[w]));
  if (!found.length) throw new Error("No subscriber/moderator/contributor lists in that file.");
  data = json;
  $("error").hidden = true;
  $("drop").hidden = true;
  $("app").hidden = false;
  loadWhere("subscriber");
}

async function readFile(file) {
  try {
    accept(JSON.parse(await file.text()));
  } catch (err) {
    fail(err.message || String(err));
  }
}

function toCsv() {
  const cols = [
    "relationship", "display_name", "name", "title", "public_description",
    "subscribers", "over18", "created_iso", "url",
  ];
  const esc = (v) => {
    const s = String(v ?? "").replace(/\r?\n/g, " ");
    return /[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const rows = [];
  for (const where of WHERE) {
    for (const s of data[where] || []) {
      rows.push([
        where,
        s.display_name,
        s.display_name_prefixed,
        s.title,
        s.public_description,
        s.subscribers,
        s.over18,
        s.created_utc ? new Date(s.created_utc * 1000).toISOString() : "",
        s.url ? `https://www.reddit.com${s.url}` : "",
      ]);
    }
  }
  return [cols.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

$("csv").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toCsv()], { type: "text/csv" }));
  a.download = "reddata-subs.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

$("file").addEventListener("change", (e) => {
  if (e.target.files[0]) readFile(e.target.files[0]);
});

$("filter").addEventListener("input", render);
$("rel").addEventListener("change", (e) => {
  if (e.target.name === "rel") loadWhere(e.target.value);
});

const drop = $("drop");
for (const type of ["dragenter", "dragover"]) {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
}
for (const type of ["dragleave", "drop"]) {
  drop.addEventListener(type, () => drop.classList.remove("over"));
}
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) readFile(file);
});

$("share").addEventListener("click", async () => {
  const names = cache.items.map((s) => s.display_name);
  if (!names.length) return fail("Nothing to share in this tab.");
  try {
    const url = `${location.origin}/join#${await encodeList(names)}`;
    $("share-url").value = url;
    $("share-out").hidden = false;
    $("copied").textContent = `${names.length} communities · ${(url.length / 1024).toFixed(1)} KB link`;
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
    $("copied").textContent = "press Cmd+C";
  }
});
