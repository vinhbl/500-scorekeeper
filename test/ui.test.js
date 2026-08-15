/* Drives the real index.html in jsdom: records hands, switches seat counts,
   and exercises the rescore prompt.  Run: node test/ui.test.js
   Requires jsdom (npm i jsdom).  */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

let pass = 0, fail = 0;
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
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
  click(d, "#confirmBtn");   // bid is confirmed before the hand is played
  click(d, chip(d, "tricks", 8));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand recorded");
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 0, "the next hand starts with a clean table");
}

/* ================= confirm bid → in-round view ================= */
group("in-round view");

{
  const { d } = boot();
  ok(d.getElementById("roundView").hidden, "no in-round view before a bid");
  ok(!d.getElementById("bidSheet").hidden, "bid table visible");
}
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                        // 8 hearts = 300
  ok(d.querySelector("#confirmBtn").disabled, "cannot confirm before a bidder is chosen");
  click(d, chip(d, "bidder", 0));
  ok(!d.querySelector("#confirmBtn").disabled, "confirm enables once the bidder is set");
  click(d, "#confirmBtn");

  ok(d.getElementById("bidSheet").hidden, "bid table is replaced");
  ok(!d.getElementById("roundView").hidden, "in-round view takes its place");
  eq(d.querySelector("#roundView .contract").textContent.trim(), "8\u2665", "contract shown");
  eq(d.querySelector("#roundView .kv .v").textContent.trim(), "Us", "bidder shown");
  ok(d.querySelector("#roundView .pts").textContent.indexOf("300") > -1, "point value shown");
  eq(d.querySelectorAll("#record [data-role=\"bidder\"]").length, 0,
     "the record panel drops the bidder picker once confirmed");
  ok(d.querySelector('#record [data-role="tricks"]'), "record panel moves on to tricks");
}

/* rank reference follows the trump suit */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 3));                        // hearts
  click(d, chip(d, "bidder", 0));
  click(d, "#confirmBtn");
  ok(d.querySelector(".rk-head").textContent.indexOf("Hearts") > -1, "header names the trump suit");
  eq(d.querySelectorAll("#roundView .rcard.bower").length, 2, "both bowers marked");
  const bowers = [...d.querySelectorAll("#roundView .rcard.bower")].map(function(c){
    return c.querySelector(".s").textContent;
  });
  eq(bowers, ["\u2665","\u2666"], "right bower is the trump jack, left bower the same-colour jack");
  eq(d.querySelector(".jk-card .r").textContent, "JKR", "joker chip labelled");
  ok(d.querySelector(".jk-card .jk"), "joker carries the drawn mark");
  ok(d.querySelector(".rk-note").textContent.indexOf("jack of diamonds") > -1,
     "note names the promoted jack");
}
{
  const { d } = boot();
  click(d, cellVal(d, 8, 0));                        // 8 spades
  click(d, chip(d, "bidder", 0));
  click(d, "#confirmBtn");
  const bowers = [...d.querySelectorAll("#roundView .rcard.bower")].map(function(c){
    return c.querySelector(".s").textContent;
  });
  eq(bowers, ["\u2660","\u2663"], "spade trump promotes the club jack");
  eq(d.querySelector(".rcard.tail").textContent.trim(), "6 5", "black trump runs to 5 in a 43-card deck");
}

/* deck tail follows seat count */
{
  const { d } = boot();
  click(d, chip(d, "seats", 3));
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#confirmBtn");
  eq(d.querySelector(".rcard.tail"), null, "33-card deck stops at 7 — no tail");
}
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, chip(d, "partner", 2));
  click(d, "#confirmBtn");
  eq(d.querySelector(".rcard.tail").textContent.trim(), "6 5 4 3 2", "53-card deck runs to 2");
  ok(d.querySelector("#roundView .kv .v").textContent.indexOf("+") > -1, "partner shown beside the bidder");
}
{
  const { d } = boot();
  click(d, chip(d, "seats", 5));
  click(d, cellVal(d, 9, 0));
  click(d, chip(d, "bidder", 3));
  click(d, chip(d, "partner", -1));
  click(d, "#confirmBtn");
  ok(d.querySelector("#roundView .kv .v").textContent.indexOf("alone") > -1, "a lone bidder is marked");
}

/* no-trump and misère both use the no-trump ladder */
{
  const { d } = boot();
  click(d, cellVal(d, 8, 4));                        // 8 no-trumps
  click(d, chip(d, "bidder", 0));
  click(d, "#confirmBtn");
  ok(d.querySelector(".rk-head").textContent.indexOf("no trumps") > -1, "no-trump header");
  eq(d.querySelectorAll("#roundView .rcard.bower").length, 0, "no bowers in no-trumps");
  eq(d.querySelectorAll("#roundView .quad").length, 8, "every rank shows all four suits");
}
{
  const { d } = boot();
  click(d, d.querySelector('[data-id="misere"]'));
  click(d, chip(d, "bidder", 0));
  click(d, "#confirmBtn");
  ok(d.querySelector(".rk-head").textContent.indexOf("no trumps") > -1,
     "mis\u00e8re borrows the no-trump ladder");
  ok(d.querySelector("#roundView .contract").textContent.indexOf("Mis") > -1, "mis\u00e8re contract shown");
}

/* leaving the view */
{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#confirmBtn");
  click(d, '[data-role="cancelHand"]');
  ok(!d.getElementById("bidSheet").hidden, "cancel returns the bid table");
  ok(d.getElementById("roundView").hidden, "in-round view goes away");
  eq(d.querySelectorAll("#bidTable .cell.dead").length, 0, "cancel clears the standing bid");
  eq(API.state().hands.length, 0, "nothing recorded");
}
{
  const { d, API } = boot();
  click(d, cellVal(d, 8, 3));
  click(d, chip(d, "bidder", 0));
  click(d, "#confirmBtn");
  click(d, chip(d, "tricks", 8));
  click(d, "#scoreBtn");
  eq(API.state().hands.length, 1, "hand recorded from the confirmed flow");
  eq(API.state().hands[0].delta, [300,20], "scored correctly");
  ok(!d.getElementById("bidSheet").hidden, "bid table returns for the next hand");
  ok(d.getElementById("roundView").hidden, "in-round view clears");
}

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);


