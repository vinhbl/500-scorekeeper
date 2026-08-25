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
  /* pretendToBeVisual gives jsdom a requestAnimationFrame; without it the app
   takes its reduced-motion path and the scroll/count tween never runs */
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/500/",
                                pretendToBeVisual: true });
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
  /* Deterministic by default: report reduced motion so the board paints its
     final values synchronously. Tests that care about the animation override
     matchMedia themselves after booting. */
  w.matchMedia = function(q){
    return { matches: /prefers-reduced-motion/.test(q), media: q,
             addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} };
  };
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
/* tricks are a stepper now \u2014 seeded at the contract level, stepped to a target */
function setTricks(d, target){
  for (let guard = 0; guard < 22; guard++){
    const v = +d.querySelector(".srow .step-val").textContent;
    if (v === target) return;
    const btn = d.querySelector(v < target ? '[data-role="tricks-inc"]' : '[data-role="tricks-dec"]');
    if (!btn || btn.disabled) return;
    click(d, btn);
  }
}
function tricksNow(d){ return +d.querySelector(".srow .step-val").textContent; }
/* every rank on the ladder, high to low */
function ladder(d){
  return [...d.querySelectorAll("#referencePage .rcard")]
    .map(function(c){ return c.querySelector(".r").textContent; });
}
function giveTrick(d, side){ click(d, d.querySelector('[data-role="split-inc"][data-side="'+side+'"]')); }
function splitSides(d){
  return new Set([...d.querySelectorAll('#record [data-role="split-inc"]')].map(b => b.dataset.side)).size;
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
  ok(!d.querySelector('[data-rule="defIndividual"]'), "the defender rule is hidden at four players");
  ok(d.querySelector('[data-rule="defTricks"]'), "defTricks visible at two sides");
}

/* ================= records a 2-side hand ================= */
group("record a hand — 2 sides");
{
  const { d, API } = boot();
  click(d, '[data-kind="suit"][data-level="7"][data-suit="3"]');   // 7 hearts = 200
  click(d, chip(d, "bidder", 0));
  setTricks(d, 8);
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
  setTricks(d, 10);
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "five-player hand recorded");
  ok(!chip(d, "seats", 3).disabled, "the seat toggle stays live mid-game");

  /* changing the table size restarts the game, so it asks first */
  const before = API.state().game.seats;
  click(d, chip(d, "seats", 3));
  ok(!d.querySelector("#dialog").hidden, "it confirms before discarding the sheet");
  eq(API.state().game.seats, before, "and changes nothing until confirmed");
  click(d, "#dlgCancel");
  eq(API.state().game.seats, before, "cancelling leaves the game alone");
  eq(API.state().hands.length, 1, "with its hands intact");

  click(d, chip(d, "seats", 3));
  click(d, "#dlgOk");
  eq(API.state().game.seats, 3, "confirming switches the table");
  eq(API.state().hands.length, 0, "and starts a fresh sheet");
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
  setTricks(d, 8);
  // three defenders: 1, 3, 4 must split 2 tricks
  ok(d.querySelector('[data-role="split-inc"][data-side="1"]'), "defender split shown for three defenders");
  giveTrick(d, 1);
  giveTrick(d, 3);
  /* zero */
  ok(!d.querySelector("#scoreBtn").disabled, "score enables once every trick is assigned");
  click(d, "#scoreBtn");
  const h = API.state().hands[0];
  eq(h.declaring, [0,2], "declaring holds bidder and partner");
  eq(h.delta, [240,10,240,10,0],
     "bidder and partner both score; each defender keeps only their own trick");
  ok(d.querySelector(".log-row .amp"), "log shows the partnership");
}
{
  const { d, API } = boot();
  click(d, chip(d, "seats", 5));
  click(d, '[data-kind="suit"][data-level="9"][data-suit="4"]');
  click(d, chip(d, "bidder", 3));
  click(d, chip(d, "partner", -1));
  setTricks(d, 10);
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
  setTricks(d, 7);
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
  setTricks(d, 7);
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
  setTricks(d, 7);
  click(d, "#scoreBtn");

  // no misère was bid, so flipping the misère rule cannot change any delta
  const box = d.querySelector('[data-rule="misereNoDef"]');
  ok(box.checked, "the misere rule ships on, like every other default");
  box.checked = false;                       // turning a default off
  box.dispatchEvent(new d.defaultView.Event("change", {bubbles:true}));
  ok(d.querySelector("#dialog").hidden, "no prompt for a rule with no effect on played hands");
  eq(API.state().rules.misereNoDef, false, "the toggle still writes through");

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
    rules:{defTricks:true, slam:true, misereNoDef:true, winOnBid:true, backDoor:true},
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
  setTricks(d, 6);
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
  eq(d.querySelector("#bidNote").textContent, "Avondale", "the bid table subtitle is fixed text");
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
  eq(d.querySelector("#bidNote").textContent, "Avondale", "the subtitle never changes");
}

/* scoring a hand resets eligibility for the next one */
{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  setTricks(d, 8);
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand recorded");
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 0, "the next hand starts with a clean table");
}

/* ================= round reference ================= */
group("round reference");

{
  const { d } = boot();
  ok(d.getElementById("referencePage"), "the reference rides in the bid pager");
  ok(d.getElementById("reference"), "and has a standalone mount for landscape");
  eq(d.querySelector("#referencePage .contract").textContent.trim(), "6\u2660",
     "with no bid it falls back to the lowest contract rather than an empty state");
  ok(d.querySelector("#referencePage .ref-pts").textContent.indexOf("40") > -1, "showing its value");
  ok(d.querySelectorAll("#referencePage .rcard").length > 0, "the ladder is drawn straight away");
  ok(d.querySelector("#referencePage .rk-head").textContent.indexOf("Spades") > -1,
     "spades, being the lowest suit");
}

/* the bid alone drives it — no confirmation, no bidder needed */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                      // 8 hearts = 300
  ok(!d.getElementById("bidSheet").hidden, "the bid table is never replaced");
  eq(d.querySelector("#referencePage .contract").textContent.trim(), "8\u2665", "contract shown");
  ok(d.querySelector(".ref-pts").textContent.indexOf("300") > -1, "point value shown");
  ok(d.querySelector(".rk-head").textContent.indexOf("Hearts") > -1, "ladder names the trump suit");
  eq(d.querySelectorAll("#referencePage .rcard.bower").length, 2, "both bowers marked");
  eq(d.querySelector(".jk-card .r").textContent, "JKR", "joker chip labelled");
  ok(d.querySelector(".jk-card .jk"), "joker carries the drawn mark");
  ok(d.querySelector(".rk-note").textContent.indexOf("jack of diamonds") > -1, "note names the promoted jack");
  eq(d.querySelectorAll("#record [data-role=\"bidder\"]").length, 2,
     "the record panel keeps its bidder picker");
  ok(d.querySelector('#record .srow .step-val'), "and its trick stepper");
}

/* changing the bid re-renders everything below it */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                      // hearts
  click(d, cellVal(d, 9, 0));                      // 9 spades — higher, so selectable
  ok(d.querySelector(".rk-head").textContent.indexOf("Spades") > -1, "ladder follows the new suit");
  const bowers = [...d.querySelectorAll("#referencePage .rcard.bower")].map(function(c){
    return c.querySelector(".s").textContent;
  });
  eq(bowers, ["\u2660","\u2663"], "spade trump promotes the club jack");
  eq(ladder(d).slice(-3), ["7","6","5"], "black trump runs down to the five in a 43-card deck");
}

/* clearing the bid returns the reference to its default, not to nothing */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  eq(d.querySelector("#referencePage .contract").textContent.trim(), "8\u2665", "follows the bid");
  click(d, cellVal(d, 8, 3));                      // tap again to clear
  eq(d.querySelector("#referencePage .contract").textContent.trim(), "6\u2660",
     "and falls back to 6 spades when the bid is cleared");
  ok(d.querySelectorAll("#referencePage .rcard").length > 0, "the ladder stays on screen");
}

/* both mounts render the same thing from one source */
{
  const { d } = boot();
  click(d, cellVal(d, 9, 2));
  eq(d.querySelector("#reference .rk-head").textContent,
     d.querySelector("#referencePage .rk-head").textContent,
     "the landscape slide and the pager page agree");
}

/* the pager and its dots */
{
  const { d } = boot();
  eq(d.querySelectorAll("#bidPager .page").length, 2, "two pages: bid table then ranks");
  eq(d.getElementById("bidDots").children.length, 2, "one dot each");
  eq([...d.getElementById("bidDots").children].findIndex(b => b.className === "on"), 0,
     "starting on the bid table");
  ok(d.querySelector("#bidPager .page #bidSheet"), "the bid table is the first page");
  ok(d.querySelector("#bidPager .page-ref #referencePage"), "the reference is the second");
  eq(d.querySelectorAll("#refHead").length, 0, "the card ranks heading is gone");
}

/* deck floor follows seat count */
{
  const { d } = boot();
  click(d, chip(d, "seats", 3));
  click(d, cellVal(d, 8, 3));
  eq(ladder(d).slice(-1), ["7"], "33-card deck stops at the seven");
  eq(d.querySelector(".rcard.tail"), null, "and needs no tail \u2014 every rank is shown");
}
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  eq(ladder(d).slice(-5), ["6","5","4","3","2"], "53-card deck runs all the way to the two");
  eq(d.querySelectorAll("#referencePage .rcard").length, 15, "fifteen chips, joker and both bowers included");
}

/* no-trump and mis\u00e8re share the no-trump ladder */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 4));
  ok(d.querySelector(".rk-head").textContent.indexOf("no trumps") > -1, "no-trump header");
  eq(d.querySelectorAll("#referencePage .rcard.bower").length, 0, "no bowers in no-trumps");
  eq(d.querySelectorAll("#referencePage .quad").length, 11, "every no-trump rank carries its suits");
}
{
  const { d } = boot();
  click(d, d.querySelector('[data-id="misere"]'));
  ok(d.querySelector(".rk-head").textContent.indexOf("no trumps") > -1,
     "mis\u00e8re borrows the no-trump ladder");
  ok(d.querySelector("#referencePage .contract").textContent.indexOf("Mis") > -1, "mis\u00e8re contract shown");
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

/* ---- which ground each surface is drawn for ----
   The score sheet is on bone: bid table, card ranks, hands played, score cards.
   Record a hand is app chrome and sits on navy, so its children use the on-ink
   half of the palette. jsdom drops `background:var(...)` but keeps
   `color:var(...)` verbatim, so the text colour is what we assert. */
{
  const { d, w } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  const col = function(sel){ return w.getComputedStyle(d.querySelector(sel)).color; };

  eq(col(".sheet"),         "var(--ink)",  "the bid table is drawn for bone");
  eq(col("#referencePage"), "var(--ink)",  "so is the card ranks reference");
  eq(col("#reference"),     "var(--ink)",  "including its landscape mount");
  eq(col(".log"),           "var(--ink)",  "and the hands played log");
  eq(col(".side"),          "var(--ink)",  "and the score cards");

  eq(col("#record"),        "var(--bone)", "record a hand is drawn for navy");
  eq(col(String.raw`#record .chip[aria-pressed="false"]`), "var(--bone)",
     "its unselected chips are bone on navy");
  eq(col(String.raw`#record .chip[aria-pressed="true"]`),  "var(--ink)",
     "and selected chips invert to ink on bone");
  eq(col("#record .step"),  "var(--bone)", "its steppers match");
}

/* the reference reuses .panel, so it must keep overriding back to bone */
{
  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  ok(/\.panel\{background:var\(--ink-2\)/.test(src), ".panel is navy by default");
  ok(/\.panel\.ref\{background:var\(--bone\)/.test(src),
     "and .ref puts the reference back on bone \u2014 its chips are drawn for it");
  ok(/\.pager\{[\s\S]*?gap:14px/.test(src),
     "a gap separates the pages mid-swipe without moving where they settle");
  ok(/\.page-ref > section\{flex:1/.test(src),
     "the reference stretches to the bid table's height rather than floating");
  ok(/\.pager-dots b\{[\s\S]*?width:5px;height:5px/.test(src), "the bullets are smaller");
}


/* ================= landscape carousel dots ================= */
group("carousel dots");

function bootLandscape(){
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8"),
                        { runScripts:"outside-only", url:"https://example.com/", pretendToBeVisual:true });
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
  Object.defineProperty(wrap, "clientHeight", { value: 393, configurable: true });
  wrap.scrollTop = 393 * 2;
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

/* picking tricks before a bidder used to render a split between both sides,
   which is a question with no meaning yet */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  setTricks(d, 8);
  eq(splitSides(d), 0, "no defender split before a bidder is chosen");
  eq([...d.querySelectorAll("#record .label")].map(l => l.textContent),
     ["Who bid it", "Tricks won"],
     "only the two inputs are shown");
  ok(d.querySelector("#scoreBtn").disabled, "score stays disabled");
}
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  setTricks(d, 8);
  click(d, chip(d, "bidder", 0));
  eq(splitSides(d), 0, "2 sides never needs a split \u2014 one defender");
  ok(!d.querySelector("#scoreBtn").disabled, "score enables once both inputs are given");
  eq(tricksNow(d), 8, "the trick count survives choosing the bidder afterwards");
}

/* 3 players: split appears with the bidder, not before */
{
  const { d } = boot();
  click(d, chip(d, "seats", 3));
  click(d, cellVal(d, 8, 3));
  setTricks(d, 8);
  eq(splitSides(d), 0, "3 players: nothing before a bidder");
  click(d, chip(d, "bidder", 0));
  eq(splitSides(d), 2, "3 players: two defenders once the bidder is known");
}

/* 5 players: the partner completes the declaring side, so the split waits for it */
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  setTricks(d, 8);
  eq(splitSides(d), 0, "5 players: nothing before a bidder");
  click(d, chip(d, "bidder", 0));
  eq(splitSides(d), 0, "5 players: still nothing while the partner is unknown");
  click(d, chip(d, "partner", 2));
  eq(splitSides(d), 3, "5 players: three defenders once bidder and partner are set");
  ok(d.querySelector("#scoreBtn").disabled, "score waits for the tricks to be assigned");
}

/* ---- the ladder shows every rank, so no tail is needed ---- */
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  eq(d.querySelector("#referencePage .rcard.tail"), null,
     "no tail at five players \u2014 the whole deck is on the ladder");
  eq(ladder(d).join(" "), "JKR J J A K Q 10 9 8 7 6 5 4 3 2",
     "fifteen chips, right down to the two");
}

/* the tail survives only as a third-row fallback, which nothing reaches today */
{
  const { API } = boot();
  const cards = "JKR J J A K Q 10 9 8 7 6 5 4 3 2".split(" ")
    .map(function(r){ return r === "JKR" ? {joker:true} : {r:r}; });
  eq(API.fitLadder(cards, 10).tail, null, "fifteen chips fit two rows of ten");
  eq(API.fitLadder(cards, 9).tail,  null, "and two rows of nine");
  const squeezed = API.fitLadder(cards, 5);
  eq(squeezed.cards.length, 9, "but at five per row it keeps nine");
  eq(squeezed.tail, "7 6 5 4 3 2", "and folds the remaining six ranks into a tail");
}

/* ---- the seat toggle lives on navy, so it needs on-ink colours ---- */
{
  const { d, w } = boot();
  const seat = d.querySelector('.seat-toggle .chip[aria-pressed="false"]');
  ok(seat, "an unselected seat option exists");
  eq(w.getComputedStyle(seat).color, "var(--bone)",
     "unselected seat options are legible on the navy ground");
}

/* ================= the board reads toward 500, always ================= */
group("negative scores");

function boardCells(d){
  return [...d.querySelectorAll("#board .side")].map(function(sd){
    return {
      total: sd.querySelector(".side-total").textContent,
      neg:   sd.querySelector(".side-total").className.indexOf("neg") > -1,
      width: sd.querySelector(".track span").getAttribute("style"),
      target: sd.querySelectorAll(".meta span")[0].textContent,
      togo:  sd.querySelector(".togo").textContent
    };
  });
}

{
  const { d } = boot();
  /* 7 spades bid and blown badly: bidder loses 140, defenders take the rest */
  click(d, cellVal(d, 7, 0));
  click(d, chip(d, "bidder", 0));
  setTricks(d, 2);
  click(d, "#scoreBtn");
  const cells = boardCells(d);
  eq(cells[0].total, "-140", "a failed contract goes negative");
  ok(cells[0].neg, "and is styled as negative");
  ok(/width:0%/.test(cells[0].width), "the bar empties rather than filling toward \u2212500");
  eq(cells[0].target, "TO 500", "the target is still 500, never \u2212500");
  eq(cells[0].togo, "640 TO GO", "distance to 500 counts the deficit \u2014 500 minus \u2212140");
}
{
  const { d } = boot();
  click(d, cellVal(d, 7, 0));
  click(d, chip(d, "bidder", 0));
  setTricks(d, 7);
  click(d, "#scoreBtn");
  const cells = boardCells(d);
  eq(cells[0].total, "140", "a made contract scores");
  eq(cells[0].width, "width:28%", "the bar fills proportionally, with a clean value");
  eq(cells[0].togo, "360 TO GO", "and counts down to 500");
}

/* ---- scoring brings the board back, then counts ---- */

/* reduced motion: no tween, straight to the answer */
{
  const { d, w } = boot();
  const calls = [];
  w.scrollTo = function(){ calls.push([].slice.call(arguments)); };
  w.matchMedia = function(q){ return { matches: /reduce/.test(q), media: q,
    addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }; };

  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  setTricks(d, 8);
  click(d, "#scoreBtn");

  eq(calls.length, 1, "one jump, not a tween");
  eq(calls[0], [0, 0], "straight to the top");
  eq(d.querySelector("#board .side-total").textContent, "300",
     "and the total lands immediately rather than counting");
}

/* normal motion: the scroll is scripted, and the count waits for it to finish */
{
  const { d, w } = boot();
  const calls = [];
  w.scrollTo = function(){ calls.push([].slice.call(arguments)); };
  w.matchMedia = function(q){ return { matches: false, media: q,
    addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }; };
  Object.defineProperty(w, "pageYOffset", { value: 640, configurable: true });

  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  setTricks(d, 8);
  click(d, "#scoreBtn");

  eq(d.querySelector("#board .side-total").textContent, "0",
     "the board still shows the old total the instant the hand is scored");

  deferred.push(function(){
    ok(calls.length > 3, "the scroll is tweened over many frames, not a single jump");
    eq(calls[calls.length - 1], [0, 0], "and finishes at the top");
    ok(+d.querySelector("#board .side-total").textContent > 0,
       "the count starts only after the scroll has finished");
  });
}

/* ================= settings chips ================= */
group("settings");

{
  const { d } = boot();
  eq([...d.querySelectorAll(".schip-txt b")].map(b => b.textContent),
     ["New game", "Player count", "House rules"], "three chips, in order");
  eq(d.getElementById("newGameSub").textContent, "", "no game yet, so no status line");
  eq(d.getElementById("playersSub").textContent, "4-player mode", "the table is described in players");
  eq(d.getElementById("rulesSub").textContent, "Default", "and the rules start untouched");
}
{
  const { d } = boot();
  eq([...d.querySelectorAll('[data-role="seats"]')].map(b => b.textContent),
     ["3-player", "4-player", "5-player"],
     "player counts run in table order, and two sides now reads as four players");
  click(d, chip(d, "seats", 5));
  eq(d.getElementById("playersSub").textContent, "5-player mode", "the subtitle follows the choice");
}
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  eq(d.getElementById("newGameSub").textContent, "Game in progress",
     "the new-game chip reports a game underway");
}
{
  const { d } = boot();
  eq(d.getElementById("rulesSub").textContent, "Default", "default to begin with");
  const box = d.querySelector('[data-rule="slam"]');
  box.checked = !box.checked;
  box.dispatchEvent(new d.defaultView.Event("change", { bubbles: true }));
  eq(d.getElementById("rulesSub").textContent, "Custom", "and custom once a rule is changed");
}

/* disclosure: the two expandable chips, and the one that is not */
{
  const { d } = boot();
  const players = d.querySelector('[data-target="playersPanel"]');
  eq(players.getAttribute("aria-expanded"), "false", "player count starts collapsed");
  ok(d.getElementById("playersPanel").className.indexOf("open") < 0, "its panel is closed");
  click(d, players);
  eq(players.getAttribute("aria-expanded"), "true", "and opens on tap");
  ok(d.getElementById("playersPanel").className.indexOf("open") > -1, "revealing the panel");
  click(d, players);
  eq(players.getAttribute("aria-expanded"), "false", "and closes again");

  ok(!d.querySelector('[data-role="reset"]').hasAttribute("aria-expanded"),
     "start a new game is an action, not a disclosure");
  ok(d.querySelector('[data-role="reset"] .schip-chev.fixed'),
     "so its chevron points right and never rotates");
}
{
  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  ok(/\.disclosure\{display:grid;grid-template-rows:0fr\}/.test(src),
     "panels animate from a zero-height grid row rather than snapping open");
  ok(/\.disclosure\.open\{grid-template-rows:1fr\}/.test(src), "to full height");
  ok(/\.pager-dots b\{[\s\S]*?opacity:\.16/.test(src), "the page bullets are quieter");
}

/* ---- a scored hand stays on screen until the next bid ---- */
{
  const { d, API } = boot();
  ok(d.getElementById("record").className.indexOf("idle") > -1,
     "the prompt shows before the first hand");

  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");

  eq(API.state().hands.length, 1, "hand recorded");
  eq(d.querySelector("#record .submit").textContent, "Undo this hand",
     "the button becomes Undo rather than resetting the panel");
  ok(d.querySelector("#record .contract-line").textContent.indexOf("300") > -1,
     "the hand that was just played is still on screen");
  ok([...d.querySelectorAll("#record .chip")].every(c => c.disabled),
     "its inputs are locked");
  eq(d.querySelectorAll("#record .step").length, 0, "and the stepper is a plain readout");
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 0,
     "the bid table clears \u2014 the auction is over");

  click(d, "#undoBtn");
  eq(API.state().hands.length, 0, "undo removes the hand");
  eq(d.querySelector("#record .submit").textContent, "Score this hand", "and hands the panel back");
  ok([...d.querySelectorAll("#record .chip")].some(c => !c.disabled), "inputs editable again");
}
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  click(d, cellVal(d, 9, 2));
  eq(d.querySelector("#record .submit").textContent, "Score this hand",
     "picking the next bid replaces the recorded hand");
  ok(d.querySelector("#record .contract-line").textContent.indexOf("380") > -1, "with the new contract");
}

/* ---- chip layout: one line, even spacing, matching buttons ---- */
{
  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  ok(/\.schip-txt\{[^}]*white-space:nowrap/.test(src),
     "the label and its state share one line");
  ok(/\.schip-txt\{[^}]*text-overflow:ellipsis/.test(src),
     "and clip rather than wrapping, so chip height never changes");
  ok(/\.schip-sub:not\(:empty\)\{margin-left:6px\}/.test(src),
     "the state is spaced off the label, with no separator");
  ok(!/schip-sub[^}]*::before/.test(src), "and no dot");
  ok(!/\.settings\{[^}]*gap:/.test(src),
     "no flex gap on the container \u2014 a collapsed panel would double the spacing");
  ok(/\.schip\{[^}]*margin-top:9px/.test(src), "the chips space themselves evenly instead");
  ok(/\.submit\{[^}]*border:1px solid transparent/.test(src),
     "the score button reserves a border so Undo is exactly the same height");
  ok(/\.submit\.undo-hand\{[^}]*border-color:var\(--line-lt\)/.test(src),
     "Undo only recolours that border rather than adding one");
  ok(!/\.submit\.undo\{/.test(src),
     "and is not called .undo \u2014 that class belongs to the log link and would win on order");
}

/* every rule ships on, so the panel reads as a list of things you can turn off */
{
  const { d, API } = boot();
  click(d, chip(d, "seats", 5));
  const boxes = [...d.querySelectorAll("#rules input")];
  const off = boxes.filter(function(b){ return !b.checked; }).map(function(b){ return b.dataset.rule; });
  eq(off, [], "every rule now ships enabled, so the panel is a list of things to turn off");
}

/* ---- a scored hand must not keep blocking the next auction ----
   The table drew every cell as live, but outbid() still measured against the
   contract sitting in the record panel, so taps below it silently did nothing. */
{
  const { d, API } = boot();
  click(d, cellVal(d, 7, 2));                 // 7 diamonds, 180
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand scored");

  const lower = cellVal(d, 7, 1);             // 7 clubs, 160 — below the scored bid
  ok(!lower.disabled, "a lower bid is enabled");
  ok(lower.className.indexOf("dead") < 0, "and not struck through");
  click(d, lower);
  ok(d.querySelector("#record .contract-line").textContent.indexOf("160") > -1,
     "and tapping it actually selects it");
  eq(d.querySelector("#record .submit").textContent, "Score this hand",
     "which starts a fresh hand");
}
{
  /* the lowest bid on the board is the sharpest case */
  const { d } = boot();
  click(d, cellVal(d, 10, 4));                // 10 no-trumps, 520
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  click(d, cellVal(d, 6, 0));                 // 6 spades, 40
  ok(d.querySelector("#record .contract-line").textContent.indexOf("40") > -1,
     "even 6 spades is selectable after a 520 hand is scored");
}
{
  /* but a live bid still blocks, which is the point of the rule */
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                 // 8 hearts, 300 — not scored
  const lower = cellVal(d, 7, 0);             // 7 spades, 140
  ok(lower.disabled, "while a bid stands, lower ones stay disabled");
}
{
  /* misere is on the same footing */
  const { d } = boot();
  click(d, cellVal(d, 9, 4));                 // 9 no-trumps, 420
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  const mis = d.querySelector('[data-id="misere"]');   // 250, below 420
  ok(!mis.disabled, "misere is live again after a bigger hand is scored");
  click(d, mis);
  ok(d.querySelector("#record .contract-line").textContent.indexOf("250") > -1,
     "and selectable");
}

/* ---- the card splits into two groups pushed apart ---- */
{
  const { d } = boot();
  const ranks = d.querySelector("#referencePage .ranks");
  eq([...ranks.children].map(function(c){ return c.className; }), ["rk-top","rk-bottom"],
     "ladder on top, note at the bottom \u2014 not one centred block");
  ok(ranks.querySelector(".rk-top .cards"), "the ladder is in the top group");
  ok(ranks.querySelector(".rk-bottom .rk-note"), "the note is in the bottom group");

  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  ok(/\.ranks\{[\s\S]*?justify-content:space-between/.test(src),
     "so the slack pools between them rather than above and below");
  ok(/\.rk-bottom\{[^}]*border-top/.test(src),
     "the divider belongs to the bottom group, not to the note's margin");
}

/* ---- a rank that exists in only some suits shows only those ---- */
{
  const { d } = boot();
  click(d, cellVal(d, 9, 4));                 // no-trumps at four players
  const chips = [...d.querySelectorAll("#referencePage .rcard")];
  const four = chips[chips.length - 1];
  eq(four.querySelector(".r").textContent, "4", "the four is the lowest no-trump rank");
  eq([...four.querySelectorAll(".quad span")].map(function(s){ return s.textContent; }),
     ["\u2665","\u2666"],
     "and shows only the red suits, because black stops at the five");
  const ace = chips[1];
  eq(ace.querySelectorAll(".quad span").length, 4, "while the ace carries all four");
}
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 9, 4));
  const chips = [...d.querySelectorAll("#referencePage .rcard")];
  eq(chips[chips.length - 1].querySelectorAll(".quad span").length, 4,
     "at five players every rank exists in every suit, right down to the two");
}

/* ---- the note now names the joker and reinforces the ladder ---- */
{
  const { d } = boot();
  click(d, cellVal(d, 9, 2));
  const note = d.querySelector("#referencePage .rk-note").textContent;
  eq(note, "The joker and the jack of hearts are considered as diamonds this hand.",
     "trump note names the joker and the promoted jack");
  eq([...d.querySelectorAll("#referencePage .rk-note b")].map(function(b){ return b.textContent; }),
     ["joker", "jack of hearts", "diamonds"], "with the three nouns emphasised");
}
{
  const { d } = boot();
  click(d, cellVal(d, 9, 4));
  ok(d.querySelector("#referencePage .rk-note").textContent.indexOf("Every rank counts") === 0,
     "no-trumps opens on the rank, not on the absent bowers");
  ok(d.querySelector("#referencePage .rk-note").textContent.indexOf("No bowers") < 0,
     "the old opening is gone");
}

/* ---- a scored hand ends the hand; the next bid starts a clean one ---- */
group("the next hand starts empty");

function pressedIn(d, role){
  return [...d.querySelectorAll('#record [data-role="' + role + '"]')]
    .filter(function(b){ return b.getAttribute("aria-pressed") === "true"; })
    .map(function(b){ return b.textContent; });
}

{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand scored");

  click(d, cellVal(d, 9, 2));                    // the next bid
  eq(pressedIn(d, "bidder"), [], "the previous bidder is cleared");
  ok(d.querySelector("#scoreBtn").disabled, "so the hand cannot be scored until someone is named");
  ok(d.querySelector("#record .contract-line").textContent.indexOf("380") > -1,
     "while the new contract is in place");
}
{
  /* changing your mind mid-auction is not a new hand */
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 1));
  click(d, cellVal(d, 9, 2));
  eq(pressedIn(d, "bidder"), ["Them"], "picking a different bid keeps the bidder");
}
{
  /* five players: the partner goes too */
  const { d, API } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "partner", 2));
  giveTrick(d, 1);
  giveTrick(d, 3);
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "five-player hand scored");
  click(d, cellVal(d, 9, 2));
  eq(pressedIn(d, "bidder"), [], "bidder cleared");
  eq(pressedIn(d, "partner"), [], "and so is the partner");
}
{
  /* misere is the same story */
  const { d } = boot();
  click(d, cellVal(d, 6, 0));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  click(d, d.querySelector('[data-id="misere"]'));
  eq(pressedIn(d, "bidder"), [], "a misere after a scored hand starts clean too");
}

/* ---- chip rows fill the width when they fit on one line ---- */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));
  const row = d.querySelector("#record .chips");
  ok(row.className.indexOf("fill") > -1, "a row that fits gets the fill class");

  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
  ok(/\.chips\.fill \.chip\{flex:1 1 auto\}/.test(src),
     "which grows the chips from their natural widths");
  ok(!/\.chips\.fill \.chip\{flex:1 1 0/.test(src),
     "not from zero \u2014 a long name must never be squeezed below its text");
}
{
  /* jsdom has no layout, so every chip reports offsetTop 0 and the row always
     looks single. Stub the offsets to stage a wrap and re-run the fitter. */
  const { d, API } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  const row = d.querySelector("#record .chips");
  ok(row.className.indexOf("fill") > -1, "unstubbed, the row looks single and fills");

  [...row.children].forEach(function(c, i){
    Object.defineProperty(c, "offsetTop", { value: i < 3 ? 0 : 44, configurable: true });
  });
  API.fitChipRows();
  ok(row.className.indexOf("fill") < 0,
     "once the chips sit on two rows the fill is removed, so a wrapped row keeps natural widths");

  [...row.children].forEach(function(c){
    Object.defineProperty(c, "offsetTop", { value: 0, configurable: true });
  });
  API.fitChipRows();
  ok(row.className.indexOf("fill") > -1, "and comes back when they fit again");
}

/* ================= Live Activity bridge ================= */
group("live activity");

/* The plugin only exists inside the iOS shell, so stub it and watch the calls. */
function withLA(seats){
  const b = boot();
  const calls = [];
  b.w.Capacitor = { Plugins: { LiveActivity: {
    start:  function(p){ calls.push(["start", p]);  return Promise.resolve({started:true}); },
    update: function(p){ calls.push(["update", p]); return Promise.resolve(); },
    end:    function(p){ calls.push(["end", p]);    return Promise.resolve(); }
  }}};
  if(seats && seats !== 2) click(b.d, chip(b.d, "seats", seats));
  calls.length = 0;
  return Object.assign(b, { calls: calls });
}

{
  const { d, calls } = withLA();
  click(d, cellVal(d, 8, 3));
  eq(calls.length, 0, "picking a bid starts nothing \u2014 no hand has been played");

  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  eq(calls.length, 1, "the first scored hand starts it");
  eq(calls[0][0], "start", "with a start");
  eq(calls[0][1].us, 300, "carrying the running totals");
  eq(calls[0][1].them, 20, "for both sides");
  eq(calls[0][1].usLabel, "Us", "and the side names");
  eq(calls[0][1].winner, -1, "with no winner yet");
}
{
  const { d, calls } = withLA();
  click(d, cellVal(d, 6, 0));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  calls.length = 0;
  click(d, cellVal(d, 7, 0));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  eq(calls.map(function(c){ return c[0]; }), ["update"], "later hands update rather than restart");
  eq(calls[0][1].us, 180, "with the new total");
}
{
  /* five players cannot be shown in a pill, so it never starts */
  const { d, calls } = withLA(5);
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "partner", 2));
  giveTrick(d, 1);
  giveTrick(d, 3);
  click(d, "#scoreBtn");
  eq(calls.filter(function(c){ return c[0] === "start"; }).length, 0,
     "no activity at five players");
}
{
  /* a hand can start the activity and win the game at once, so the end has to
     wait for the start to resolve — otherwise there is nothing to end yet */
  const { d, calls } = withLA();
  click(d, cellVal(d, 10, 4));           // 520 — enough to win outright
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  eq(calls.map(function(c){ return c[0]; }), ["start"], "it starts first");
  deferred.push(function(){
    const ends = calls.filter(function(c){ return c[0] === "end"; });
    eq(ends.length, 1, "then ends once the activity exists");
    eq(ends[0][1].linger, true, "letting it linger");
    eq(ends[0][1].winner, 0, "naming the winner");
    eq(ends[0][1].us, 520, "with the real final totals, not a placeholder");
  });
}
{
  /* winning on a later hand ends it directly */
  const { d, calls } = withLA();
  click(d, cellVal(d, 9, 4));            // 420
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  calls.length = 0;
  click(d, cellVal(d, 6, 3));            // 6 hearts, +100 takes it past 500
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  const ends = calls.filter(function(c){ return c[0] === "end"; });
  eq(ends.length, 1, "crossing 500 on a later hand ends it");
  eq(ends[0][1].linger, true, "with a linger");
  eq(ends[0][1].us, 520, "showing the real total");
}
{
  /* undo takes the game back under 500, so it starts again */
  const { d, calls } = withLA();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  calls.length = 0;
  click(d, "#undoBtn");
  eq(calls.map(function(c){ return c[0]; }), ["end"], "removing the only hand ends it");
  eq(calls[0][1].linger, false, "without lingering \u2014 there is no result to show");
}
{
  /* the win rules live in the app, never in the widget */
  const { d, calls } = withLA();
  const box = d.querySelector('[data-rule="backDoor"]');
  ok(box, "the back-door rule exists");
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#scoreBtn");
  ok(Object.prototype.hasOwnProperty.call(calls[0][1], "wentOut"),
     "the payload states whether the game ended out the back door");
}

/* a full hand still records, with no confirm step in the way */
{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  setTricks(d, 8);
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand recorded");
  eq(API.state().hands[0].delta, [300,20], "scored correctly");
  ok(d.querySelector("#referencePage .contract").textContent.indexOf("8") > -1,
     "the reference still shows the hand that was just scored, until the next bid");
}

/* long enough for the scroll tween (900ms) plus the pause and count (1350ms) */
setTimeout(function(){
  deferred.forEach(function(f){ f(); });
  console.log("\n" + pass + " passed, " + fail + " failed\n");
  process.exit(fail ? 1 : 0);
}, 2600);


