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

console.log("\n"+pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
