const fs=require("fs"),path=require("path");
const {JSDOM}=require("jsdom");
const html=fs.readFileSync(path.join(__dirname,"..","docs","index.html"),"utf8");
const app =fs.readFileSync(path.join(__dirname,"..","docs","app.js"),"utf8");
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
  ok(/main\.wrap\{[^}]*scroll-snap-type:x mandatory/.test(block),
     "the section list becomes a horizontal snap scroller");
  ok(/\.slide\{[^}]*flex:0 0 100%/.test(block), "each slide is a full screen wide");
  ok(/\.slide\{[^}]*scroll-snap-align:center/.test(block), "slides snap");
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
  const order = [...body.matchAll(/class="slide" data-slide="([a-z]+)"/g)].map(function(m){ return m[1]; });
  eq(order, ["score","bids","record","ranks","log"],
     "slide order: scores, bid table, record a hand, card ranks, hands played");
}

/* the two sections that can outgrow a screen scroll within their slide */
{
  ok(/\.slide\{[^}]*overflow-y:auto/.test(block), "a slide scrolls if its content is taller than the screen");
  ok(/\.slide\[data-slide="record"\],\.slide\[data-slide="log"\]\{justify-content:flex-start\}/.test(block),
     "record and log start at the top rather than centring");
}

/* the bid table keeps the treatment built for reading across a table */
{
  ok(/table\.bids\{flex:1;min-height:0\}/.test(block), "bid table fills its slide via flex");
  ok(!/table\.bids\{[^}]*height:100%/.test(block),
     "table.bids must not set height:100% \u2014 it clips .specials in WebKit");
  ok(/\.cell\{font-size:23px/.test(block), "cells enlarged for across-the-table reading");
  ok(!/#specials[^{]*display:none/.test(block), "mis\u00e8re bids stay visible");
}

/* dots */
{
  ok(/\.dots\{[^}]*position:fixed/.test(block), "the dot indicator is pinned above the safe area");
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
  eq(w2.document.querySelectorAll("main.wrap .slide").length, 5, "five slides in the DOM");
  ok(w2.document.getElementById("dots").hidden, "dots hidden in portrait");
  ok(w2.document.querySelector("#bidTable").innerHTML.indexOf("440") > -1, "bid table still renders");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail?1:0);
