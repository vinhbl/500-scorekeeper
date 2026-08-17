/* Drives the real index.html in jsdom: records hands, switches seat counts,
   and exercises the rescore prompt.  Run: node test/ui.test.js
   Requires jsdom (npm i jsdom).  */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

let pass = 0, fail = 0;
const deferred = [];
function eq(actual, expected, name){
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if(a === b){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + "\n         expected " + b + "\n         got      " + a); }
}
function ok(cond, name){ eq(!!cond, true, name); }
function group(n){ console.log("\n" + n); }

function boot(seedKey, seedValue){
  const html = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/500/" });
  const w = dom.window;
  const store = {};
  if(seedKey) store[seedKey] = seedValue;
  Object.defineProperty(w, "localStorage", {
    value: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    configurable: true
  });
  const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
  w.eval(app);
  return { w, d: w.document, store, API: w.__500 };
}

function click(d, sel){
  const el = typeof sel === "string" ? d.querySelector(sel) : sel;
  if(!el) throw new Error("no element for " + sel);
  el.dispatchEvent(new (el.ownerDocument.defaultView.MouseEvent)("click", {bubbles:true}));
  return el;
}
function chip(d, role, i){
  return d.querySelector('[data-role="'+role+'"][data-i="'+i+'"]');
}

/* ================= boots clean ================= */
group("cold start");
{
  const { d, API } = boot();
  const S = API.state();
  eq(S.version, 2, "starts at schema v2");
  eq(S.game.seats, 2, "defaults to two sides");
  ok(d.querySelectorAll(".side").length === 2, "renders two score cards");
  ok(d.querySelector("#bidTable").innerHTML.includes("440"), "bid table renders");
  ok(d.querySelector("#dialog").hidden, "dialog starts hidden");
  ok(!d.querySelector('[data-rule="defShare"]'), "defShare hidden at two sides");
  ok(d.querySelector('[data-rule="defTricks"]'), "defTricks visible at two sides");
}

/* ================= records a 2-side hand ================= */
group("record a hand — 2 sides");
{
  const { d, API } = boot();
  click(d, '[data-kind="suit"][data-level="7"][data-suit="3"]');   // 7 hearts = 200
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "tricks", 8));
  ok(!d.querySelector("#scoreBtn").disabled, "score button enables");
  click(d, "#scoreBtn");
  const S = API.state();
  eq(S.hands.length, 1, "hand recorded");
  eq(S.hands[0].declaring, [0], "declaring is the bidder alone");
  eq(S.hands[0].trickSplit, [0,2], "single defender auto-assigned the remaining tricks");
  eq(S.hands[0].delta, [200,20], "scored correctly");
  ok(!!S.hands[0].scoredUnder, "hand carries a rules snapshot");
  ok(d.querySelector(".log-row"), "log renders the hand");
}

/* ================= seat lock ================= */
group("seat lock");
{
  const { d, API } = boot();
  ok(!chip(d, "seats", 5).disabled, "seat toggle live before any hand");
  click(d, chip(d, "seats", 5));
  eq(API.state().game.seats, 5, "switched to five players");
  eq(d.querySelectorAll(".side").length, 5, "renders five score cards");

  click(d, '[data-kind="suit"][data-level="6"][data-suit="0"]');
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "partner", 2));
  click(d, chip(d, "tricks", 10));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "five-player hand recorded");
  ok(chip(d, "seats", 3).disabled, "seat toggle locks once a hand exists");
  const before = API.state().game.seats;
  click(d, chip(d, "seats", 3));
  eq(API.state().game.seats, before, "clicking a locked seat toggle does nothing");
}

/* ================= 5-player partner + alone ================= */
group("five players — partner and alone");
{
  const { d, API } = boot();
  click(d, chip(d, "seats", 5));
  click(d, '[data-kind="suit"][data-level="8"][data-suit="0"]');  // 8 spades = 240
  click(d, chip(d, "bidder", 0));
  ok(d.querySelector('[data-role="partner"][data-i="-1"]'), "Alone option offered");
  ok(!d.querySelector('[data-role="partner"][data-i="0"]'), "bidder is not offered as their own partner");
  click(d, chip(d, "partner", 2));
  click(d, chip(d, "tricks", 8));
  // three defenders: 1, 3, 4 must split 2 tricks
  ok(d.querySelector('[data-role="split"][data-side="1"]'), "defender split shown for three defenders");
  click(d, d.querySelector('[data-role="split"][data-side="1"][data-i="1"]'));
  click(d, d.querySelector('[data-role="split"][data-side="3"][data-i="1"]'));
  click(d, d.querySelector('[data-role="split"][data-side="4"][data-i="0"]'));
  ok(!d.querySelector("#scoreBtn").disabled, "score enables once every trick is assigned");
  click(d, "#scoreBtn");
  const h = API.state().hands[0];
  eq(h.declaring, [0,2], "declaring holds bidder and partner");
  eq(h.delta, [240,20,240,20,20], "bidder and partner both score; defShare on by default");
  ok(d.querySelector(".log-row .amp"), "log shows the partnership");
}
{
  const { d, API } = boot();
  click(d, chip(d, "seats", 5));
  click(d, '[data-kind="suit"][data-level="9"][data-suit="4"]');
  click(d, chip(d, "bidder", 3));
  click(d, chip(d, "partner", -1));
  click(d, chip(d, "tricks", 10));
  click(d, "#scoreBtn");
  const h = API.state().hands[0];
  eq(h.declaring, [3], "alone records a single declaring seat");
  ok(d.querySelector(".log-row").textContent.includes("alone"), "log marks a lone bidder");
}

/* ================= rescore prompt ================= */
group("rescore prompt");
{
  const { d, API } = boot();
  click(d, '[data-kind="suit"][data-level="7"][data-suit="0"]');  // 7 spades = 140
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "tricks", 7));
  click(d, "#scoreBtn");
  eq(API.state().hands[0].delta, [140,30], "baseline: defenders take 3");

  // flipping defTricks changes points -> prompt
  const box = d.querySelector('[data-rule="defTricks"]');
  box.checked = false;
  box.dispatchEvent(new d.defaultView.Event("change", {bubbles:true}));
  ok(!d.querySelector("#dialog").hidden, "prompt opens when points would change");
  ok(d.querySelector("#dlgBody").textContent.includes("1 hand"), "prompt names the affected hand count");
  ok(d.querySelector(".rescore-line"), "prompt shows before/after totals");
  eq(API.state().rules.defTricks, false, "rule applies immediately regardless");
  eq(API.state().hands[0].delta, [140,30], "played hand untouched until confirmed");

  click(d, "#dlgCancel");
  ok(d.querySelector("#dialog").hidden, "dialog closes on keep-as-played");
  eq(API.state().hands[0].delta, [140,30], "keep as played leaves the sheet alone");
  ok(d.querySelector(".log-row.stale"), "log marks the hand as scored under earlier rules");
}
{
  const { d, API } = boot();
  click(d, '[data-kind="suit"][data-level="7"][data-suit="0"]');
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "tricks", 7));
  click(d, "#scoreBtn");
  const box = d.querySelector('[data-rule="defTricks"]');
  box.checked = false;
  box.dispatchEvent(new d.defaultView.Event("change", {bubbles:true}));
  click(d, "#dlgOk");
  eq(API.state().hands[0].delta, [140,0], "rescore rewrites the played hand");
  eq(API.state().hands[0].scoredUnder.defTricks, false, "snapshot updated on rescore");
  ok(!d.querySelector(".log-row.stale"), "stale marker clears after rescoring");
}

/* ================= no prompt when nothing changes ================= */
group("dry run suppresses pointless prompts");
{
  const { d, API } = boot();
  click(d, '[data-kind="suit"][data-level="7"][data-suit="0"]');
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "tricks", 7));
  click(d, "#scoreBtn");

  // no misère was bid, so flipping misereDef cannot change any delta
  const box = d.querySelector('[data-rule="misereDef"]');
  box.checked = true;
  box.dispatchEvent(new d.defaultView.Event("change", {bubbles:true}));
  ok(d.querySelector("#dialog").hidden, "no prompt for a rule with no effect on played hands");
  eq(API.state().rules.misereDef, true, "rule still applies");

  // win conditions never prompt
  const wb = d.querySelector('[data-rule="winOnBid"]');
  wb.checked = false;
  wb.dispatchEvent(new d.defaultView.Event("change", {bubbles:true}));
  ok(d.querySelector("#dialog").hidden, "no prompt for a non-rescorable rule");
  eq(API.state().rules.winOnBid, false, "win condition still applies");
}

/* ================= migration from a real v1 payload ================= */
group("migration on load");
{
  const v1 = JSON.stringify({
    sides:[{name:"Ellis"},{name:"Ren"}],
    rules:{defTricks:true, slam:true, misereDef:false, winOnBid:true, backDoor:true},
    hands:[{contract:{type:"suit",level:7,suit:"hearts",label:"7 \u2665",value:200},
            bidder:0, tricks:8, defSplit:[0,2], delta:[200,20]}]
  });
  const { d, API, store } = boot("fivehundred:game:v1", v1);
  const S = API.state();
  eq(S.version, 2, "v1 payload migrated on load");
  eq(S.sides.map(s=>s.name), ["Ellis","Ren"], "names survive");
  eq(S.hands[0].declaring, [0], "declaring backfilled");
  eq(S.hands[0].delta, [200,20], "delta preserved exactly");
  ok(store["fivehundred:game:v2"], "migrated state written under the v2 key");
  ok(d.querySelector(".log-row"), "migrated hand renders");
  ok(d.querySelector(".side-total").textContent === "200", "board totals from migrated data");
}

/* ================= corrupt payload ================= */
group("corrupt storage");
{
  const { API } = boot("fivehundred:game:v2", "{not json");
  eq(API.state().hands.length, 0, "garbage JSON falls back to a fresh game");
  eq(API.state().version, 2, "fresh game is v2");
}
{
  const { API } = boot("fivehundred:game:v2", JSON.stringify({version:2, game:{seats:4}, sides:[], hands:[]}));
  eq(API.state().game.seats, 2, "invalid seat count rejected, falls back to default");
}

/* ================= undo ================= */
group("undo");
{
  const { d, API } = boot();
  click(d, '[data-kind="suit"][data-level="6"][data-suit="0"]');
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "tricks", 6));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "one hand in");
  click(d, '[data-role="undo"]');
  eq(API.state().hands.length, 0, "undo removes it");
  ok(!chip(d, "seats", 5).disabled, "seat toggle unlocks when the sheet empties");
}

/* ================= bid eligibility ================= */
group("outbid cells");

function cellVal(d, lv, si){
  return d.querySelector('[data-kind="suit"][data-level="'+lv+'"][data-suit="'+si+'"]');
}

{
  const { d, API } = boot();
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 0, "nothing struck out before a bid");
  eq(d.querySelector("#bidNote").textContent, "Avondale", "header shows the scoring name when no bid stands");
}
{
  const { d } = boot();
  click(d, cellVal(d, 7, 3));                       // 7 hearts = 200
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 8, "everything worth 200 or less is struck out");
  eq(cellVal(d, 7, 3).classList.contains("dead"), false, "the standing bid itself is not struck out");
  eq(cellVal(d, 7, 4).disabled, false, "7 no-trumps at 220 stays available");
  eq(cellVal(d, 6, 0).disabled, true, "an outbid cell is disabled, not merely faded");
  ok(d.querySelector("#bidNote").textContent.indexOf("stands") > -1, "header names the standing bid");
}
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                       // 8 hearts = 300
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 13, "a higher bid strikes out more of the table");
  eq(d.querySelectorAll("#specials .cell.dead").length, 1, "misère at 250 is outbid by 300");
  eq(d.querySelector('[data-id="open"]').disabled, false, "open misère at 500 survives");
}
{
  const { d } = boot();
  click(d, cellVal(d, 7, 3));                       // 200
  eq(d.querySelectorAll("#specials .cell.dead").length, 0, "both misères outrank a 200 bid");
}

/* misère participates in the ladder rather than sitting outside it */
{
  const { d } = boot();
  click(d, d.querySelector('[data-id="misere"]'));  // 250
  /* 5 at level 6, 5 at level 7, plus 8 spades at 240 */
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 11,
     "selecting misère strikes out every suit bid worth 250 or less");
  eq(cellVal(d, 8, 1).disabled, false, "8 clubs at 260 still outranks misère");
}

/* the way back from a mis-tap */
{
  const { d } = boot();
  click(d, cellVal(d, 10, 4));                      // 520 — strikes out everything
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 24, "a top bid strikes out the rest of the table");
  click(d, cellVal(d, 10, 4));                      // tap it again
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 0, "tapping the standing bid again clears it");
  eq(d.querySelector("#bidNote").textContent, "Avondale", "header returns to its resting state");
  eq(d.querySelector("#scoreBtn"), null, "clearing the contract returns the record panel to idle");
}

/* an outbid cell cannot be selected even if a click reaches it */
{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));                       // 300 stands
  click(d, cellVal(d, 6, 0));                       // 40 — outbid
  eq(API.state().hands.length, 0, "no hand recorded");
  eq(d.querySelector("#bidNote").textContent.indexOf("8") > -1, true, "the standing bid is unchanged");
}

/* scoring a hand resets eligibility for the next one */
{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "tricks", 8));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand recorded");
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 0, "the next hand starts with a clean table");
}

/* ================= round reference ================= */
group("round reference");

{
  const { d } = boot();
  ok(d.getElementById("reference"), "the reference section always exists");
  ok(d.getElementById("reference").className.indexOf("idle") > -1, "it sits idle before a bid");
  ok(d.getElementById("reference").textContent.indexOf("Pick a contract") > -1, "and prompts for one");
  eq(d.querySelectorAll("#reference .rcard").length, 0, "no ladder without a trump suit");
}

/* the bid alone drives it — no confirmation, no bidder needed */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                      // 8 hearts = 300
  ok(!d.getElementById("bidSheet").hidden, "the bid table is never replaced");
  eq(d.querySelector("#reference .contract").textContent.trim(), "8\u2665", "contract shown");
  ok(d.querySelector(".ref-pts").textContent.indexOf("300") > -1, "point value shown");
  ok(d.querySelector(".rk-head").textContent.indexOf("Hearts") > -1, "ladder names the trump suit");
  eq(d.querySelectorAll("#reference .rcard.bower").length, 2, "both bowers marked");
  eq(d.querySelector(".jk-card .r").textContent, "JKR", "joker chip labelled");
  ok(d.querySelector(".jk-card .jk"), "joker carries the drawn mark");
  ok(d.querySelector(".rk-note").textContent.indexOf("jack of diamonds") > -1, "note names the promoted jack");
  eq(d.querySelectorAll("#record [data-role=\"bidder\"]").length, 2,
     "the record panel keeps its bidder picker");
  ok(d.querySelector('#record [data-role="tricks"]'), "and its trick buttons");
}

/* changing the bid re-renders everything below it */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                      // hearts
  click(d, cellVal(d, 9, 0));                      // 9 spades — higher, so selectable
  ok(d.querySelector(".rk-head").textContent.indexOf("Spades") > -1, "ladder follows the new suit");
  const bowers = [...d.querySelectorAll("#reference .rcard.bower")].map(function(c){
    return c.querySelector(".s").textContent;
  });
  eq(bowers, ["\u2660","\u2663"], "spade trump promotes the club jack");
  eq(d.querySelector(".rcard.tail").textContent.trim(), "6 5", "black trump runs to 5 in a 43-card deck");
}

/* clearing the bid returns the section to idle */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, cellVal(d, 8, 3));                      // tap again to clear
  ok(d.getElementById("reference").className.indexOf("idle") > -1, "reference goes idle again");
  eq(d.querySelectorAll("#reference .rcard").length, 0, "ladder cleared");
}

/* deck floor follows seat count */
{
  const { d } = boot();
  click(d, chip(d, "seats", 3));
  click(d, cellVal(d, 8, 3));
  eq(d.querySelector(".rcard.tail"), null, "33-card deck stops at 7 \u2014 no tail");
}
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  eq(d.querySelector(".rcard.tail").textContent.trim(), "6 5 4 3 2", "53-card deck runs to 2");
}

/* no-trump and mis\u00e8re share the no-trump ladder */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 4));
  ok(d.querySelector(".rk-head").textContent.indexOf("no trumps") > -1, "no-trump header");
  eq(d.querySelectorAll("#reference .rcard.bower").length, 0, "no bowers in no-trumps");
  eq(d.querySelectorAll("#reference .quad").length, 8, "every rank shows all four suits");
}
{
  const { d } = boot();
  click(d, d.querySelector('[data-id="misere"]'));
  ok(d.querySelector(".rk-head").textContent.indexOf("no trumps") > -1,
     "mis\u00e8re borrows the no-trump ladder");
  ok(d.querySelector("#reference .contract").textContent.indexOf("Mis") > -1, "mis\u00e8re contract shown");
}

/* ---- the ladder must actually be styled ----
   These rules were once written inside the in-round CSS block and were deleted
   wholesale with it. Every structural test still passed while the section
   rendered as unstyled text and a full-page joker mark. Assert computed style,
   not markup. */
{
  const { d, w } = boot();
  click(d, cellVal(d, 8, 3));
  const chip = d.querySelector("#reference .rcard");
  const cs = w.getComputedStyle(chip);
  eq(cs.display, "grid", "a rank chip is laid out as a grid, not raw text");
  eq(cs.width, "32px", "and has an explicit width");
  const mark = d.querySelector("#reference .jk");
  ok(mark, "the joker mark is present");
  eq(w.getComputedStyle(mark).width, "15px",
     "the joker svg is boxed \u2014 unboxed it renders at its intrinsic size");
  const cards = d.querySelector("#reference .cards");
  eq(w.getComputedStyle(cards).display, "flex", "the ladder is a flex row");
}

/* ---- every content section sits on bone ----
   The record panel was the last surface on ink, which left its chips and the
   rank ladder drawn with the wrong half of the palette.
   jsdom drops `background:var(...)` but keeps `color:var(...)` verbatim, so
   assert the text colour \u2014 which is what says which ground a surface is drawn
   for anyway. */
{
  const { d, w } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  const ink = function(sel){ return w.getComputedStyle(d.querySelector(sel)).color === "var(--ink)"; };
  ok(ink("#record"),    "the record panel is drawn for bone");
  ok(ink("#reference"), "the card ranks panel is drawn for bone");
  ok(ink(".sheet"),     "the bid table is drawn for bone");
  ok(ink(".log"),       "the hands played log is drawn for bone");
  ok(ink(".side"),      "the score cards are drawn for bone");
  ok(ink(String.raw`#record .chip[aria-pressed="false"]`), "unselected chips are ink on bone");

  /* selected chips invert rather than lightening */
  const sel = d.querySelector('#record .chip[aria-pressed="true"]');
  ok(sel, "a chip is selected");
  eq(w.getComputedStyle(sel).color, "var(--bone)", "selected chips invert to bone on ink");
}

/* nothing inside a bone section may reach for the on-ink half of the palette */
{
  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  const css = src.slice(src.indexOf("<style>"), src.indexOf("</style>"));
  const panelBlock = css.slice(css.indexOf("  .panel{"), css.indexOf("  /* ---------- log ---------- */"));
  const strays = panelBlock.split("\n").filter(function(l){
    return /239,\s*233,\s*220/.test(l) && !/aria-pressed|\.panel\{/.test(l);
  });
  eq(strays, [], "no on-ink colours left among the record panel's children");
}

/* ================= landscape carousel dots ================= */
group("carousel dots");

function bootLandscape(){
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8"),
                        { runScripts:"outside-only", url:"https://example.com/" });
  const w = dom.window; const store = {};
  Object.defineProperty(w, "localStorage", {value:{
    getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=v}, removeItem:k=>{delete store[k]}
  }, configurable:true});
  w.matchMedia = q => ({ matches:/landscape/.test(q), media:q,
    addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
  w.eval(fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8"));
  return { w, d: w.document };
}

{
  const { d } = boot();
  ok(d.getElementById("dots").hidden, "no dots in portrait");
  eq(d.getElementById("dots").children.length, 0, "and none built");
}
{
  const { w, d } = bootLandscape();
  const dots = d.getElementById("dots");
  ok(!dots.hidden, "dots appear in landscape");
  eq(dots.children.length, 3, "one dot per landscape slide, not per section");
  eq([...dots.children].findIndex(b => b.className === "on"), 0,
     "the first slide is marked before any scroll");

  const wrap = d.querySelector("main.wrap");
  Object.defineProperty(wrap, "clientWidth", { value: 852, configurable: true });
  wrap.scrollLeft = 852 * 2;
  wrap.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  /* the listener defers a frame; drain it synchronously rather than returning
     a promise, which at module scope would exit before the remaining tests */
  const raf = w.requestAnimationFrame;
  deferred.push(function(){
    eq([...dots.children].findIndex(b => b.className === "on"), 2,
       "the dot follows the scroll position");
  });
}

/* ================= the defender split waits for a declarer ================= */
group("split appears only once the bidder's side is known");

const splitSides = d => new Set([...d.querySelectorAll('#record [data-role="split"]')]
  .map(b => b.dataset.side)).size;

/* picking tricks before a bidder used to render a split between both sides,
   which is a question with no meaning yet */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "tricks", 8));
  eq(splitSides(d), 0, "no defender split before a bidder is chosen");
  eq([...d.querySelectorAll("#record .label")].map(l => l.textContent),
     ["Who bid it", "Tricks won by the bidder"],
     "only the two inputs are shown");
  ok(d.querySelector("#scoreBtn").disabled, "score stays disabled");
}
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "tricks", 8));
  click(d, chip(d, "bidder", 0));
  eq(splitSides(d), 0, "2 sides never needs a split \u2014 one defender");
  ok(!d.querySelector("#scoreBtn").disabled, "score enables once both inputs are given");
  eq(d.querySelector('[data-role="tricks"][data-i="8"]').getAttribute("aria-pressed"), "true",
     "the trick count survives choosing the bidder afterwards");
}

/* 3 players: split appears with the bidder, not before */
{
  const { d } = boot();
  click(d, chip(d, "seats", 3));
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "tricks", 8));
  eq(splitSides(d), 0, "3 players: nothing before a bidder");
  click(d, chip(d, "bidder", 0));
  eq(splitSides(d), 2, "3 players: two defenders once the bidder is known");
}

/* 5 players: the partner completes the declaring side, so the split waits for it */
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "tricks", 8));
  eq(splitSides(d), 0, "5 players: nothing before a bidder");
  click(d, chip(d, "bidder", 0));
  eq(splitSides(d), 0, "5 players: still nothing while the partner is unknown");
  click(d, chip(d, "partner", 2));
  eq(splitSides(d), 3, "5 players: three defenders once bidder and partner are set");
  ok(d.querySelector("#scoreBtn").disabled, "score waits for the tricks to be assigned");
}

/* a full hand still records, with no confirm step in the way */
{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "tricks", 8));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand recorded");
  eq(API.state().hands[0].delta, [300,20], "scored correctly");
  ok(d.getElementById("reference").className.indexOf("idle") > -1, "reference resets for the next hand");
}

setTimeout(function(){
  deferred.forEach(function(f){ f(); });
  console.log("\n" + pass + " passed, " + fail + " failed\n");
  process.exit(fail ? 1 : 0);
}, 80);


