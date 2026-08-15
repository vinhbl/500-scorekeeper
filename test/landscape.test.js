const fs=require("fs"),path=require("path");
const {JSDOM}=require("jsdom");
const html=fs.readFileSync(path.join(__dirname,"..","docs","index.html"),"utf8");
let pass=0,fail=0;
function ok(c,n){c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  FAIL "+n));}

// static CSS assertions
ok(/@media \(orientation:landscape\) and \(max-height:600px\) and \(pointer:coarse\)/.test(html),"landscape query is phone-scoped (height + coarse pointer)");
const block = html.slice(html.indexOf("orientation:landscape"), html.indexOf("prefers-reduced-motion"));
ok(/#record[^{]*display:none/.test(block) || block.includes("#record,#log"),"record + log hidden in landscape");
ok(block.includes("#board"),"scoreboard hidden in landscape");
ok(/table\.bids\{flex:1;min-height:0\}/.test(block),"bid table fills leftover height via flex");
ok(!/table\.bids\{[^}]*height:100%/.test(block),"table.bids must not set height:100% — it clips .specials in WebKit");
ok(/\.cell\{font-size:23px/.test(block),"cells enlarged for across-the-table reading");
ok(!/#specials[^{]*display:none/.test(block),"specials (misère bids) stay visible");

// behaviour still intact: load the app in a portrait-ish jsdom and confirm nothing threw
const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://x/"});
const w=dom.window; const store={};
Object.defineProperty(w,"localStorage",{value:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},configurable:true});
const app=fs.readFileSync(path.join(__dirname,"..","docs","app.js"),"utf8");
let threw=null; try{ w.eval(app); }catch(e){ threw=e.message; }
ok(!threw, "app still boots with landscape CSS present"+(threw?" ("+threw+")":""));
ok(w.document.querySelector("#bidTable").innerHTML.includes("440"),"bid table still renders its cells");

/* ---- the hidden attribute must beat every display rule in the sheet ----
   Three landscape bugs have come from a class selector setting display on an
   element the app hides from JS. jsdom ignores !important but does honour
   source order, so these pass only while [hidden] stays the last rule. */
{
  const dom2 = new JSDOM(html, {runScripts:"outside-only", url:"https://x/"});
  const w2 = dom2.window; const store2 = {};
  Object.defineProperty(w2, "localStorage", {value:{
    getItem:k=>k in store2?store2[k]:null, setItem:(k,v)=>{store2[k]=v}, removeItem:k=>{delete store2[k]}
  }, configurable:true});
  w2.eval(app);
  const d2 = w2.document;
  const disp = id => w2.getComputedStyle(d2.getElementById(id)).display;
  const click = sel => d2.querySelector(sel).dispatchEvent(new w2.MouseEvent("click",{bubbles:true}));

  ok(disp("roundView") === "none", "in-round view is hidden before a bid, despite the landscape display rule");
  ok(disp("roundHead") === "none", "its header is hidden too, despite .head setting display:flex");
  ok(disp("bidSheet")  !== "none", "the bid table is visible before a bid");

  click('[data-kind="suit"][data-level="9"][data-suit="2"]');
  click('[data-role="bidder"][data-i="0"]');
  click("#confirmBtn");

  ok(disp("bidSheet")  === "none", "the bid table really hides once the bid is confirmed");
  ok(disp("bidHead")   === "none", "and so does its header");
  ok(disp("roundView") !== "none", "the in-round view takes its place");
}

/* [hidden] must remain the final rule for the above to hold */
{
  const styleEnd = html.lastIndexOf("</style>");
  const tail = html.slice(html.lastIndexOf("[hidden]"), styleEnd);
  ok(html.lastIndexOf("[hidden]{display:none!important}") > -1, "the global hidden rule exists");
  ok(!/\}\s*[.#\w\[][^}]*\{/.test(tail.replace("[hidden]{display:none!important}","")),
     "[hidden] is the last rule in the stylesheet");
}

/* landscape targets a class, not an id — an id would outrank [hidden] */
{
  ok(/\.round-wrap\{[^}]*display:flex/.test(block), "landscape uses .round-wrap, not #roundView");
  ok(!/#roundView\{/.test(block), "no id selector setting display on the round view");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail?1:0);
