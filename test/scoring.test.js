/* Node test harness. Loads app-v2.js against DOM stubs and exercises the
   scoring engine and the v1 -> v2 migration.  Run: node test/scoring.test.js */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------- DOM stubs ---------- */
function fakeEl(){
  return {
    innerHTML:"", textContent:"", className:"", hidden:true, value:"",
    dataset:{}, classList:{contains:()=>false},
    focus(){}, closest(){ return null; }
  };
}
const els = {};
const store = {};

const sandbox = {
  console,
  document: {
    getElementById(id){ return els[id] || (els[id] = fakeEl()); },
    addEventListener(){}
  },
  localStorage: {
    getItem(k){ return k in store ? store[k] : null; },
    setItem(k,v){ store[k] = v; },
    removeItem(k){ delete store[k]; }
  },
  navigator: {},
  window: {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const API = sandbox.window.__500;
if(!API) { console.error("app-v2.js did not expose its test hook"); process.exit(1); }

/* ---------- harness ---------- */
let pass = 0, fail = 0;
function eq(actual, expected, name){
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if(a === b){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + "\n         expected " + b + "\n         got      " + a); }
}
function group(n){ console.log("\n" + n); }

const R = (over={}) => Object.assign({}, API.DEFAULT_RULES, over);

/* contract helpers */
const suit  = (level, value, label="bid") => ({type:"suit", level, value, label});
const mis   = (value=250) => ({type:"misere", id:"misere", label:"Misère", value});
const open  = () => ({type:"misere", id:"open", label:"Open misère", value:500});

function hand(o){
  return Object.assign({contract:suit(7,140), bidder:0, declaring:[0], tricks:7, trickSplit:[0,0]}, o);
}

/* ================= 2-side partnership ================= */
group("2 sides — partnership");

eq(API.scoreHandWith(hand({contract:suit(7,140), tricks:7, trickSplit:[0,3]}), R(), 2),
   [140,30], "made 7 bid, defenders take 3");

eq(API.scoreHandWith(hand({contract:suit(7,140), tricks:5, trickSplit:[0,5]}), R(), 2),
   [-140,50], "failed 7 bid loses the bid value");

eq(API.scoreHandWith(hand({contract:suit(7,140), tricks:7, trickSplit:[0,3]}), R({defTricks:false}), 2),
   [140,0], "defTricks off — only the bidder scores");

eq(API.scoreHandWith(hand({contract:suit(6,40), tricks:10, trickSplit:[0,0]}), R(), 2),
   [250,0], "slam floor lifts a 40 bid to 250");

eq(API.scoreHandWith(hand({contract:suit(6,40), tricks:10, trickSplit:[0,0]}), R({slam:false}), 2),
   [40,0], "slam off — 40 bid pays 40");

eq(API.scoreHandWith(hand({contract:suit(10,440), tricks:10, trickSplit:[0,0]}), R(), 2),
   [440,0], "slam floor never lowers a bid above 250");

/* ================= misère ================= */
group("misère");

eq(API.scoreHandWith(hand({contract:mis(), tricks:0, trickSplit:[0,10]}), R(), 2),
   [250,0], "misère made on zero tricks, defenders silent by default");

eq(API.scoreHandWith(hand({contract:mis(), tricks:1, trickSplit:[0,9]}), R(), 2),
   [-250,0], "misère broken on one trick");

eq(API.scoreHandWith(hand({contract:mis(), tricks:0, trickSplit:[0,10]}), R({misereDef:true}), 2),
   [250,100], "misereDef on — defenders score their tricks");

eq(API.scoreHandWith(hand({contract:open(), tricks:0, trickSplit:[0,10]}), R(), 2),
   [500,0], "open misère pays 500");

eq(API.scoreHandWith(hand({contract:mis(), tricks:0, trickSplit:[0,10]}), R({slam:true}), 2),
   [250,0], "slam floor never applies to misère");

/* ================= 3-player cutthroat ================= */
group("3 players — cutthroat");

eq(API.scoreHandWith(hand({contract:suit(8,240), tricks:8, declaring:[0], trickSplit:[0,1,1]}), R({defShare:false}), 3),
   [240,10,10], "defShare off — each defender scores only their own tricks");

eq(API.scoreHandWith(hand({contract:suit(8,240), tricks:8, declaring:[0], trickSplit:[0,1,1]}), R({defShare:true}), 3),
   [240,20,20], "defShare on — each defender scores the team's two tricks");

eq(API.scoreHandWith(hand({contract:suit(8,240), tricks:6, declaring:[0], trickSplit:[0,3,1]}), R({defShare:false}), 3),
   [-240,30,10], "failed bid, defenders keep their own tricks");

/* ================= 5-player ================= */
group("5 players — called partners");

eq(API.scoreHandWith(hand({contract:suit(8,240), tricks:8, declaring:[0,2], trickSplit:[0,1,0,1,0]}), R({defShare:false}), 5),
   [240,10,240,10,0], "bidder and partner both take the contract value");

eq(API.scoreHandWith(hand({contract:suit(8,240), tricks:8, declaring:[0,2], trickSplit:[0,1,0,1,0]}), R({defShare:true}), 5),
   [240,20,240,20,20], "defShare on — all three defenders score the team's tricks");

eq(API.scoreHandWith(hand({contract:suit(8,240), tricks:6, declaring:[0,2], trickSplit:[0,2,0,1,1]}), R({defShare:false}), 5),
   [-240,20,-240,10,10], "failed bid costs bidder and partner alike");

eq(API.scoreHandWith(hand({contract:suit(9,340), tricks:9, declaring:[3], trickSplit:[0,1,0,0,0]}), R({defShare:false}), 5),
   [0,10,0,340,0], "bidder alone — declaring is a single seat");

eq(API.scoreHandWith(hand({contract:suit(9,340), tricks:9, declaring:[3], trickSplit:[1,0,0,0,0]}), R({defShare:true}), 5),
   [10,10,10,340,10], "alone with defShare — four defenders share the one trick");

eq(API.scoreHandWith(hand({contract:suit(6,40), tricks:10, declaring:[1,4], trickSplit:[0,0,0,0,0]}), R(), 5),
   [0,250,0,0,250], "slam floor applies to both declaring seats");

/* ================= defShare degenerates at 2 sides ================= */
group("defShare is inert with a single defender");

eq(API.scoreHandWith(hand({contract:suit(7,140), tricks:7, trickSplit:[0,3]}), R({defShare:true}), 2),
   API.scoreHandWith(hand({contract:suit(7,140), tricks:7, trickSplit:[0,3]}), R({defShare:false}), 2),
   "same result either way when only one defender exists");

/* ================= migration ================= */
group("migration v1 -> v2");

const v1 = {
  sides:[{name:"Us"},{name:"Them"}],
  rules:{defTricks:true, slam:true, misereDef:false, winOnBid:true, backDoor:true},
  hands:[
    {contract:suit(7,140), bidder:0, tricks:7, defSplit:[0,3], delta:[140,30]},
    {contract:suit(8,240), bidder:1, tricks:6, defSplit:[4,0], delta:[40,-240]}
  ]
};

const m = API.v1_to_v2(JSON.parse(JSON.stringify(v1)));
eq(m.version, 2, "sets version 2");
eq(m.game.seats, 2, "derives seat count from sides");
eq(m.sides.map(s=>s.name), ["Us","Them"], "preserves side names");
eq(m.sides.every(s=>!!s.id), true, "assigns stable side ids");
eq(m.hands.map(h=>h.declaring), [[0],[1]], "backfills declaring as the bidder alone");
eq(m.hands.map(h=>h.trickSplit), [[0,3],[4,0]], "renames defSplit to trickSplit");
eq(m.hands.map(h=>h.delta), [[140,30],[40,-240]], "preserves deltas exactly as scored");
eq(m.rules.defShare, false, "adds the new defShare rule at its default \u2014 off, per the documented rule");
eq(m.hands.every(h=>!!h.id && !!h.scoredUnder), true, "assigns hand ids and a rules snapshot");

/* 3-side v1 */
const v1three = {
  sides:[{name:"A"},{name:"B"},{name:"C"}],
  rules:{defTricks:true},
  hands:[{contract:suit(7,140), bidder:2, tricks:7, defSplit:[2,1,0], delta:[20,10,140]}]
};
const m3 = API.v1_to_v2(JSON.parse(JSON.stringify(v1three)));
eq(m3.game.seats, 3, "migrates a 3-side game");
eq(m3.hands[0].declaring, [2], "declaring follows the bidder index");

/* empty v1 */
const m0 = API.v1_to_v2({sides:[{name:"Us"},{name:"Them"}], rules:{}, hands:[]});
eq(m0.hands, [], "migrates a game with no hands");

/* garbage */
eq(API.v1_to_v2({}), null, "rejects a shapeless object");
eq(API.v1_to_v2({sides:"nope", hands:[]}), null, "rejects bad sides");
eq(API.migrate({version:9, game:{seats:2}, sides:[], hands:[]}), null, "rejects an unknown future version");

/* idempotence */
const once = API.migrate(JSON.parse(JSON.stringify(v1)));
const twice = API.migrate(JSON.parse(JSON.stringify(once)));
eq(twice.version, 2, "migrate is idempotent — version stays 2");
eq(twice.hands.map(h=>h.delta), once.hands.map(h=>h.delta), "migrate is idempotent — deltas unchanged");
eq(twice.hands.map(h=>h.declaring), once.hands.map(h=>h.declaring), "migrate is idempotent — declaring unchanged");

/* ================= rules table ================= */
group("rules table");

const byKey = k => API.RULES.find(r => r.key === k);
eq(byKey("defShare").seats, [3,5], "defShare hidden at 2 sides, shown at 3 and 5");
eq(byKey("winOnBid").rescorable, false, "winOnBid is a win condition, not a scoring rule");
eq(byKey("backDoor").rescorable, false, "backDoor is a loss condition, not a scoring rule");
eq(API.RULES.filter(r=>r.rescorable).map(r=>r.key),
   ["defTricks","slam","misereDef","defShare"], "exactly four rules can rescore");

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
