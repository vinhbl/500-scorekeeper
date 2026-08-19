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
const block = html.slice(html.indexOf("orientation:landscape"), html.indexOf("prefers-reduced-motion"));
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
  eq(land, ["score","bids","ranks","record"],
     "landscape carries scores, bid table, card ranks and record a hand");
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

/* record a hand must fit one slide \u2014 that is the whole constraint */
{
  ok(/\.slide\[data-slide="record"\] \.panel\{[^}]*grid-template-columns:1fr 1fr/.test(block),
     "record splits into two columns in landscape");
  ok(/\.panel\.has-split\{[^}]*grid-template-columns:1fr 1fr 1\.05fr/.test(block),
     "the defender split gets a third column instead of stacking");
  ok(/"who  num  split"/.test(block), "split occupies its own grid area");
  ok(/\.panel:not\(\.has-split\) \.step\{width:44px/.test(block),
     "the sparse case scales up to fill the slide");
  ok(/\.panel\.has-split \.step\{width:31px/.test(block),
     "the dense case stays compact");
  ok(/\.slide\[data-slide="record"\] \.panel\{[^}]*align-content:center/.test(block),
     "its contents centre rather than stretching");
  ok(/\.rec-who\{grid-area:who\}/.test(block) && /\.rec-split\{grid-area:split\}/.test(block),
     "regions are placed by name, not by counting fields");
  ok(!/\.slide\[data-slide="record"\][^{]*nth-of-type/.test(block),
     "no positional placement \u2014 it breaks when the partner field appears");
  ok(/\.rec-col\{display:contents\}/.test(css),
     "the column wrappers are layout-neutral in portrait");
  ok(!/\.slide\[data-slide="log"\]/.test(block),
     "hands played stays portrait-only");
}

/* the bid table keeps the treatment built for reading across a table */
{
  ok(/table\.bids\{flex:1;min-height:0\}/.test(block), "bid table fills its slide via flex");
  ok(!/table\.bids\{[^}]*height:100%/.test(block),
     "table.bids must not set height:100% \u2014 it clips .specials in WebKit");
  ok(/\.cell\{font-size:23px/.test(block), "cells enlarged for across-the-table reading");
  ok(!/#specials[^{]*display:none/.test(block), "mis\u00e8re bids stay visible");
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
  eq(w2.document.querySelectorAll("main.wrap .slide.land").length, 4, "four of them page in landscape");
  ok(w2.document.getElementById("dots").hidden, "dots hidden in portrait");
  ok(w2.document.querySelector("#bidTable").innerHTML.indexOf("440") > -1, "bid table still renders");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail?1:0);
