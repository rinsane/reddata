import { decodeList, sane } from "/share.js";
import { AUTH_SNIPPET } from "/reddit-auth.js";
import { fail } from "/toast.js";
import {
  STEPS, fmt, short, cardHTML, filterItems, sortItems, stats, makeScale, wireDualSlider,
} from "/catalog.js";

const $ = (id) => document.getElementById(id);

let items = [];
let scale = makeScale([]);
let detailed = false;
const picked = new Set();

/* The selection is baked in: code running on reddit.com cannot read this page,
   so the names have to travel inside the bookmarklet itself. */
function buildBookmarklet() {
  const list = [...picked];
  const src =
    `javascript:(async()=>{try{${AUTH_SNIPPET}` +
    `if(!requireReddit())return;` +
    `var L=${JSON.stringify(list)};` +
    `if(!L.length){alert('reddata: nothing selected.');return}` +
    `var a=await getAuth();` +
    `if(!a){alert('reddata\\n\\nNo Reddit session found.\\n\\nOpen reddit.com in this tab, sign in, then click the bookmark again.');return}` +
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
  $("bookmarklet").setAttribute("aria-disabled", list.length ? "false" : "true");
  $("meta").textContent = `${fmt(list.length)} selected · ${(src.length / 1024).toFixed(1)} KB bookmarklet`;
}

const slider = wireDualSlider(
  { min: $("min"), max: $("max"), fill: $("dual-fill") },
  () => render()
);

function shown() {
  const { min, max } = slider.read(scale);
  return sortItems(
    filterItems(items, {
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
  $("subs").innerHTML = list
    .map((s) => cardHTML(s, { pick: true, checked: picked.has(s.display_name) }))
    .join("");

  if (detailed) {
    const { wide, min, max } = slider.read(scale);
    $("range-label").textContent = wide ? "any size" : `${short(min)} – ${short(max)}`;
    const t = stats(items);
    $("s-count").textContent = fmt(t.count);
    $("s-members").textContent = fmt(t.members);
    $("s-nsfw").textContent = fmt(t.nsfw);
    $("s-median").textContent = fmt(t.median);
  }

  $("status").textContent =
    `${fmt(picked.size)} selected · ` +
    (list.length === items.length
      ? `${fmt(items.length)} shared`
      : `${fmt(list.length)} of ${fmt(items.length)} shown`);

  buildBookmarklet();
}

$("subs").addEventListener("change", (e) => {
  if (e.target.type !== "checkbox") return;
  e.target.checked ? picked.add(e.target.value) : picked.delete(e.target.value);
  $("status").textContent = $("status").textContent.replace(/^\d[\d,]*/, fmt(picked.size));
  buildBookmarklet();
});

$("all").addEventListener("click", () => {
  shown().forEach((s) => picked.add(s.display_name));
  render();
});

$("none").addEventListener("click", () => {
  picked.clear();
  render();
});

$("filter").addEventListener("input", render);
$("sort").addEventListener("change", render);
$("mature").addEventListener("change", render);
$("view").addEventListener("change", render);

$("bookmarklet").addEventListener("click", (e) => {
  e.preventDefault();
  fail("Drag this to your bookmarks bar, then click it while you are on reddit.com. It cannot run from this page.");
});

function expired(at) {
  $("empty").hidden = false;
  $("empty").querySelector("h1").textContent = "This link has expired";
  $("empty").querySelector(".lede").textContent =
    `The sender set it to expire on ${new Date(at * 1000).toLocaleString()}. Ask them for a fresh one.`;
}

(async () => {
  const token = location.hash.slice(1);
  if (!token) {
    $("empty").hidden = false;
    return;
  }
  try {
    const decoded = await decodeList(token);
    if (decoded.expiresAt && Date.now() / 1000 > decoded.expiresAt) return expired(decoded.expiresAt);

    items = sane(decoded.items);
    if (!items.length) throw new Error("no valid subreddit names");
    detailed = decoded.detailed;

    scale = makeScale(items);
    slider.reset();
    items.forEach((s) => picked.add(s.display_name));

    /* A compact link carries names only, so the controls that need member
       counts and descriptions have nothing to work with. Hide them instead of
       showing dead inputs. */
    if (!detailed) {
      document.querySelectorAll(".rich").forEach((el) => (el.hidden = true));
    } else {
      $("stats").hidden = false;
    }

    $("app").hidden = false;
    $("count").textContent = fmt(items.length);
    render();
  } catch (err) {
    $("empty").hidden = false;
    fail(`Could not read that link: ${err.message}. Make sure you copied the whole URL, including everything after the #.`);
  }
})();
