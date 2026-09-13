import { decodeList, sane } from "/share.js";
import { AUTH_SNIPPET } from "/reddit-auth.js";

const $ = (id) => document.getElementById(id);

let names = [];
const picked = new Set();

function fail(msg) {
  $("error").hidden = false;
  $("error").textContent = msg;
}

/* The selection is baked in: code running on reddit.com cannot read this page,
   so the names have to travel inside the bookmarklet itself. */
function buildBookmarklet() {
  const list = [...picked];
  const src =
    `javascript:(async()=>{try{${AUTH_SNIPPET}` +
    `var L=${JSON.stringify(list)};` +
    `if(!L.length){alert('reddata: nothing selected.');return}` +
    `var a=await getAuth();` +
    `if(!a){alert('reddata\\n\\nNo Reddit session found.\\n\\nOpen reddit.com in this tab, sign in, then click the bookmark again. It must run on a reddit.com page, not on reddata.');return}` +
    `if(!confirm('reddata will subscribe '+(a.name?'u/'+a.name:'you')+' to '+L.length+' subreddits.\\n\\nContinue?'))return;` +
    `var B=50,ok=0,bad=[];` +
    `for(var i=0;i<L.length;i+=B){` +
    `var c=L.slice(i,i+B);` +
    `var r=await subscribe(a,c);` +
    `if(r.ok){ok+=c.length}else{bad.push(r.status)}` +
    `if(i+B<L.length)await new Promise(function(x){setTimeout(x,2000)})}` +
    `alert('reddata ('+a.mode+')\\n\\njoined '+ok+' of '+L.length+(bad.length?'\\nfailed batches: '+bad.join(', '):'')+'\\n\\nReload reddit.com to see them.');` +
    `}catch(e){alert('reddata failed: '+e.message)}})()`;

  $("bookmarklet").href = src;
  $("meta").textContent = `${list.length} selected · ${(src.length / 1024).toFixed(1)} KB bookmarklet`;
  $("bookmarklet").setAttribute("aria-disabled", list.length ? "false" : "true");
}

function render() {
  const q = $("filter").value.trim().toLowerCase();
  const shown = names.filter((n) => !q || n.toLowerCase().includes(q));

  $("subs").innerHTML = shown
    .map(
      (n) => `<li>
        <label class="pick">
          <input type="checkbox" value="${n}"${picked.has(n) ? " checked" : ""} />
          <span class="pick-name">r/${n}</span>
        </label>
        <a class="pick-peek" href="https://www.reddit.com/r/${encodeURIComponent(n)}/" target="_blank" rel="noreferrer">open</a>
      </li>`
    )
    .join("");

  $("status").textContent = q
    ? `${shown.length} of ${names.length} shown`
    : `${names.length} communities shared`;
  buildBookmarklet();
}

$("subs").addEventListener("change", (e) => {
  if (e.target.type !== "checkbox") return;
  e.target.checked ? picked.add(e.target.value) : picked.delete(e.target.value);
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
  fail("Drag this to your bookmarks bar, then click it while you are on reddit.com. It cannot run from this page.");
});

(async () => {
  const token = location.hash.slice(1);
  if (!token) {
    $("empty").hidden = false;
    return;
  }
  try {
    names = sane(await decodeList(token));
    if (!names.length) throw new Error("no valid subreddit names");
    names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    names.forEach((n) => picked.add(n));
    $("app").hidden = false;
    $("count").textContent = String(names.length);
    render();
  } catch (err) {
    $("empty").hidden = false;
    fail(`Could not read that link: ${err.message}. Make sure you copied the whole URL, including everything after the #.`);
  }
})();
