import { decodeList, sane } from "/share.js";

const $ = (id) => document.getElementById(id);

let names = [];
const picked = new Set();

function fail(msg) {
  $("error").hidden = false;
  $("error").textContent = msg;
}

/* Built fresh whenever the selection changes: the chosen names are baked into
   the bookmarklet, because code running on reddit.com cannot read this page. */
function buildBookmarklet() {
  const list = [...picked];
  const src = `javascript:(async()=>{try{
var t=(window.___r&&window.___r.user&&window.___r.user.session&&window.___r.user.session.accessToken)||null;
if(!t){alert('reddata: no Reddit session found.\\n\\nOpen reddit.com, make sure you are signed in, then click this again.');return}
var L=${JSON.stringify(list)};
if(!confirm('reddata will subscribe you to '+L.length+' subreddits.\\n\\nContinue?'))return;
var B=50,ok=0,bad=[];
for(var i=0;i<L.length;i+=B){
var c=L.slice(i,i+B);
var body=new URLSearchParams({action:'sub',skip_initial_defaults:'true',sr_name:c.join(',')});
var r=await fetch('https://oauth.reddit.com/api/subscribe',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/x-www-form-urlencoded'},body:body});
if(r.ok){ok+=c.length}else{bad.push(r.status)}
if(i+B<L.length)await new Promise(function(x){setTimeout(x,2000)});
}
alert('reddata\\n\\njoined '+ok+' of '+L.length+(bad.length?'\\nfailed batches: '+bad.join(', '):'')+'\\n\\nReload reddit.com to see them.');
}catch(e){alert('reddata failed: '+e.message)}})()`.replace(/\n/g, "");

  $("bookmarklet").href = src;
  $("size").textContent = `${list.length} selected · bookmarklet is ${(src.length / 1024).toFixed(1)} KB`;
}

function render() {
  const q = $("filter").value.trim().toLowerCase();
  const shown = names.filter((n) => !q || n.toLowerCase().includes(q));

  $("subs").innerHTML = shown
    .map(
      (n) => `<li>
        <label>
          <input type="checkbox" value="${n}" ${picked.has(n) ? "checked" : ""} />
          <a href="https://www.reddit.com/r/${encodeURIComponent(n)}/" target="_blank" rel="noreferrer">r/${n}</a>
        </label>
      </li>`
    )
    .join("");

  $("status").textContent = `${picked.size} selected · showing ${shown.length} of ${names.length}`;
  $("count").textContent = String(names.length);
  buildBookmarklet();
}

$("subs").addEventListener("change", (e) => {
  const cb = e.target;
  if (cb.type !== "checkbox") return;
  cb.checked ? picked.add(cb.value) : picked.delete(cb.value);
  $("status").textContent = `${picked.size} selected · showing ${names.length} of ${names.length}`;
  buildBookmarklet();
});

$("all").addEventListener("click", () => {
  names.forEach((n) => picked.add(n));
  render();
});

$("none").addEventListener("click", () => {
  picked.clear();
  render();
});

$("filter").addEventListener("input", render);

$("bookmarklet").addEventListener("click", (e) => {
  e.preventDefault();
  fail("Drag this to your bookmarks bar, then click it on reddit.com. It cannot run from this page.");
});

(async () => {
  const token = location.hash.slice(1);
  if (!token) {
    $("empty").hidden = false;
    return;
  }
  try {
    names = sane(await decodeList(token));
    if (!names.length) throw new Error("No valid subreddit names in that link.");
    names.sort((a, b) => a.localeCompare(b));
    names.forEach((n) => picked.add(n));
    $("app").hidden = false;
    render();
  } catch (err) {
    $("empty").hidden = false;
    fail(`Could not read that link: ${err.message}`);
  }
})();
