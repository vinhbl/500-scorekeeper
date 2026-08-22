const fs=require("fs"),path=require("path");
const {JSDOM}=require("jsdom");
const html=fs.readFileSync(path.join(__dirname,"..","docs","index.html"),"utf8");
const app =fs.readFileSync(path.join(__dirname,"..","docs","app.js"),"utf8");
const css =html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
let pass=0,fail=0;
function ok(c,n){c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  FAIL "+n));}
function eq(a,b,n){
  const x=JSON.stringify(a), y=JSON.stringify(b);
  x===y ? (pass++,console.log("  ok   "+n))
        : (fail++,console.log("  FAIL "+n+"\n         expected "+y+"\n         got      "+x));
}

// static CSS assertions
ok(/@media \(orientation:landscape\) and \(max-height:600px\) and \(pointer:coarse\)/.test(html),"landscape query is phone-scoped (height + coarse pointer)");
/* Extract the landscape @media block by matching braces rather than slicing
   between markers \u2014 the old version broke the moment another media query was
   added earlier in the stylesheet. */
const block = (function(){
  const at = html.indexOf("@media (orientation:landscape)");
  if (at < 0) return "";
  let i = html.indexOf("{", at), depth = 0;
  for (let j = i; j < html.length; j++){
    if (html[j] === "{") depth++;
    else if (html[j] === "}"){ depth--; if (depth === 0) return html.slice(at, j + 1); }
  }
  return "";
})();
/* ---- landscape is a carousel, not a single view ----
   Every section now gets a slide. The old assertions checked that sections were
   hidden; hiding them is exactly what the carousel undoes. */
{
  ok(/main\.wrap\{[^}]*scroll-snap-type:y mandatory/.test(block),
     "paging is vertical, matching the dot rail on the right edge");
  ok(/main\.wrap\{[^}]*flex-direction:column/.test(block), "slides stack vertically");
  ok(!/scroll-snap-type:x/.test(block), "no horizontal snapping left");
  ok(/\.slide\.land\{[^}]*height:100%/.test(block), "each slide is a full screen tall");
  ok(/\.slide\.land\{[^}]*flex:0 0 100%/.test(block), "each landscape slide is a full screen wide");
  ok(/\.slide\.land\{[^}]*scroll-snap-align:center/.test(block), "slides snap");
  ok(/\.slide:not\(\.land\)\{display:none\}/.test(block),
     "sections without the land class are cut from landscape");
  ok(/\.slide \.head\{display:none\}/.test(block), "section headings come off in landscape");
  ok(/\.mast,details\.rules,\.colophon\{display:none!important\}/.test(block),
     "masthead, house rules and colophon stay out of the carousel");
  ["#record","#log","#board","#reference"].forEach(function(sel){
    ok(block.indexOf(sel + "{display:none") === -1, sel + " is no longer hidden \u2014 it has a slide");
  });
}

/* five slides, in the agreed order */
{
  const body = html.slice(html.indexOf("<body>"));
  const all = [...body.matchAll(/class="slide(?: land)?" data-slide="([a-z]+)"/g)].map(function(m){ return m[1]; });
  eq(all, ["score","bids","ranks","record","log"],
     "portrait order: scores, bid table, card ranks, record a hand, hands played");
  const land = [...body.matchAll(/class="slide land" data-slide="([a-z]+)"/g)].map(function(m){ return m[1]; });
  eq(land, ["score","bids","ranks"],
     "landscape carries scores, bid table and card ranks only");
}

/* ---- every slide uses its screen, not just the bid table ---- */
{
  ok(/\.slide\[data-slide="ranks"\] \.rcard\{[^}]*flex:1 1 0/.test(block),
     "rank chips divide the row instead of sitting at a fixed width");
  ok(/\.slide\[data-slide="ranks"\] \.cards\{[^}]*flex-wrap:nowrap/.test(block),
     "the ladder stays on one line in landscape");
  ok(/\.slide\[data-slide="ranks"\] \.panel\{[^}]*flex:1/.test(block),
     "the ranks panel fills the slide");
  ok(/\.slide\[data-slide="ranks"\] \.rk-note\{[^}]*font-size:14px/.test(block),
     "the bower note scales up too");
}

/* ---- the score slide stacks and fills ---- */
{
  ok(/\.board\{[^}]*grid-template-columns:1fr;/.test(block),
     "score cards stack in one column rather than sitting side by side");
  ok(/\.board\{[^}]*grid-auto-rows:1fr/.test(block),
     "the cards divide the height evenly between them");
  ok(/\.board\{[^}]*flex:1/.test(block), "the board fills the slide");
  ok(/\.slide\[data-slide="score"\]\{justify-content:stretch\}/.test(block),
     "the score slide stretches its board rather than centring it");
  ok(!/\.board\{[^}]*grid-template-columns:1fr 1fr/.test(block),
     "no two-column board left in landscape");
  ok(/\.board\.seats-5 \.side-total\{font-size:30px\}/.test(block),
     "five stacked cards use smaller type so they still fit");
}

/* recording a hand is portrait-only in v0 */
{
  const live = block.replace(/\/\* ---- PARKED for v0[\s\S]*?---- end parked ---- \*\//, "");
  ok(!/\.slide\[data-slide="record"\]/.test(live),
     "no live landscape rules for record \u2014 it is portrait-only");
  ok(!/\.slide\[data-slide="log"\]/.test(live), "hands played stays portrait-only");
  ok(/PARKED for v0/.test(block),
     "the landscape record layout is parked rather than deleted");
  ok(/class="slide" data-slide="record"/.test(html),
     "the record section has no land class");
}

/* the stepper replaced eleven chips per number */
{
  ok(/\.srow\{/.test(css), "stepper rows exist");
  ok(/\.step\{[^}]*width:34px;height:34px/.test(css),
     "34px targets in portrait \u2014 matched to the compact tap-to-assign sizing");
  ok(/\.step-val\{[^}]*font-size:20px/.test(css), "and a 20px value");
  ok(/\.remain\{/.test(css), "a running remainder replaces the assigned-of tally");
}

/* dots */
{
  ok(/\.dots\{[^}]*position:fixed/.test(block), "the dot rail is pinned");
  ok(/\.dots\{[^}]*flex-direction:column/.test(block), "dots stack vertically");
  ok(/\.dots\{[^}]*right:calc\(10px \+ var\(--safe-r\)\)/.test(block), "on the right edge");
  ok(!/\.dots\{[^}]*bottom:/.test(block), "no longer pinned to the bottom");
  ok(/\.slide\.land\{[^}]*calc\(28px \+ var\(--safe-r\)\)/.test(block),
     "slides pad on the right to clear the dot rail");
  ok(/\.slide\.land\{[^}]*calc\(9px \+ var\(--safe-b\)\)/.test(block),
     "and reclaim the bottom space the dots used to occupy");
  ok(/\.slide\[data-slide="ranks"\] \.rcard\.tail\{flex:2\.2/.test(block),
     "the tail chip gets the width a five-card run needs");
  ok(/\.dots b\.on\{/.test(block), "there is an active dot state");
  ok(/<nav class="dots" id="dots" hidden/.test(html), "dots start hidden and are shown only in landscape");
}

/* [hidden] must remain the last rule \u2014 .slide and .head both set display */
{
  const styleEnd = html.lastIndexOf("</style>");
  const tail = html.slice(html.lastIndexOf("[hidden]"), styleEnd);
  ok(html.lastIndexOf("[hidden]{display:none!important}") > -1, "the global hidden rule exists");
  ok(!/\}\s*[.#\w\[][^}]*\{/.test(tail.replace("[hidden]{display:none!important}","")),
     "[hidden] is the last rule in the stylesheet");
}

/* the app still boots with the carousel css present */
{
  const dom2 = new JSDOM(html, {runScripts:"outside-only", url:"https://x/"});
  const w2 = dom2.window; const store2 = {};
  Object.defineProperty(w2, "localStorage", {value:{
    getItem:k=>k in store2?store2[k]:null, setItem:(k,v)=>{store2[k]=v}, removeItem:k=>{delete store2[k]}
  }, configurable:true});
  let threw = null;
  try { w2.eval(app); } catch(e){ threw = e.message; }
  ok(!threw, "app boots" + (threw ? " (" + threw + ")" : ""));
  eq(w2.document.querySelectorAll("main.wrap .slide").length, 5, "five sections in the DOM");
  eq(w2.document.querySelectorAll("main.wrap .slide.land").length, 3, "three of them page in landscape");
  ok(w2.document.getElementById("dots").hidden, "dots hidden in portrait");
  ok(w2.document.querySelector("#bidTable").innerHTML.indexOf("440") > -1, "bid table still renders");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail?1:0);
