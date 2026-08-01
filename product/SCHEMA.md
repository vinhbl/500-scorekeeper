# 500 Scorekeeper — Persisted State Schema (v2 draft)

Target: one model that covers 2-side partnership, 3-player cutthroat, and 5-player with
per-hand partnerships — without mode-specific branches in the scoring path.

---

## Shape

```js
{
  version: 2,

  game: {
    id: "g_k3n9x2",          // stable identity; needed later for share/resume
    startedAt: 1753800000000,
    seats: 5                 // 2 | 3 | 5. LOCKED once hands.length > 0 (see below)
  },

  // The things that score. A "side" is a team in partnership play and a single
  // person in cutthroat or 5-player. Keeping the v1 name — it reads correctly
  // in both cases and keeps migration churn down.
  sides: [
    { id: "s_a1", name: "Vinh" },
    { id: "s_b2", name: "Dan"  },
    // ...
  ],

  rules: {
    defTricks: true,
    slam:      true,
    misereDef: false,
    winOnBid:  true,
    backDoor:  true,
    defShare:  true          // new; see RULES table
  },

  hands: [
    {
      id: "h_01",

      contract: { type: "suit", level: 8, suit: "hearts", label: "8 Hearts", value: 300 },
      // or      { type: "misere", id: "open", label: "Open misère", value: 500 }

      bidder: 2,             // index into sides

      declaring: [2, 4],     // every side on the bidder's side this hand.
                             // [2]    = bidder alone
                             // [2, 4] = bidder + called partner
                             // In 2-side and 3-player modes this is always [bidder].

      tricks: 8,             // tricks taken by the declaring side

      trickSplit: [0,1,0,0,1],   // raw tricks per side index; declaring entries are 0.
                                 // Sums to (10 - tricks).

      delta:      [0,0,300,0,300],   // points awarded, FROZEN at score time

      scoredUnder: { defTricks:true, slam:true, misereDef:false,
                     winOnBid:true, backDoor:true, defShare:true }
    }
  ]
}
```

---

## The five decisions worth arguing about

### 1. `declaring` dissolves "bidder alone"

There is no `alone: true` flag. A lone bidder is just `declaring: [bidder]`. Scoring becomes
seat-count-agnostic:

```js
// everyone in `declaring` gets ± contract value
// everyone else is a defender and scores per the trick rules
```

That single field is what removes the mode branching. 2-side, 3-player, and 5-player all run
the same function.

### 2. Store raw inputs *and* the frozen delta

`trickSplit` is the source of truth for **display, editing, and rescoring**. `delta` is the source
of truth for **totals**. They are deliberately redundant.

Deltas are frozen at score time, so a rule change never silently rewrites the sheet. But because
the raw inputs are still there, a rescore is always *possible* — which is what the prompt below
depends on. Storing only `delta` would make it unrecoverable.

`scoredUnder` records which rules were in force for each hand. Once rescoring is user-optional it
stops being diagnostic and becomes load-bearing: a sheet can legitimately contain hands scored
under different rules, and the log needs to be able to say so.

Worth a dev-mode assertion that `delta` recomputes from `trickSplit` under `scoredUnder`. The two
can drift if a bug writes one and not the other.

### 2b. Rescore prompt on toggle

Flipping a scoring rule mid-game asks the user whether to apply it to hands already played.

```
on toggle of rule R:
  if hands.length === 0        -> apply silently
  if !R.rescorable             -> apply silently
  dryRun = hands.map(h => rescore(h, newRules))
  if dryRun deltas === current -> apply silently
  else                         -> prompt
```

**Dry-run first.** Toggling `misereDef` when nobody bid misère changes nothing; so does `slam`
when nobody took all ten. Prompting anyway trains people to dismiss the dialog that matters.

**Show the consequence, not the question.** Rewriting every delta in the game is too large an
operation to confirm blind:

> Rescoring changes 3 hands.
> Us 340 → 280 · Them 190 → 220
> [Rescore] [Keep as played]

**On "yes":** every hand's `delta` and `scoredUnder` are rewritten to current rules. Normalizes
the whole sheet, including hands scored under two or more prior regimes.

**On "no":** the sheet is now mixed. That's legitimate and matches paper, but the log should mark
those rows — otherwise someone sees a hand whose points don't match the current rules and assumes
a bug.

**Make it undoable**, or make the prompt the undo — a single confirm that rewrites the entire
game is the highest-stakes action in the app.

### 3. Rule applicability is data, not render logic

```js
var RULES = [
  // seats      — which seat counts this rule applies to (progressive disclosure)
  // rescorable — whether flipping it can change points on hands already played

  { key:"defTricks", seats:[2,3,5], rescorable:true,  label:"Defenders score 10 a trick",
    note:"Off means only the bidding side ever scores." },
  { key:"slam",      seats:[2,3,5], rescorable:true,  label:"All ten tricks pays 250 minimum" },
  { key:"misereDef", seats:[2,3,5], rescorable:true,  label:"Defenders score during a misère" },

  { key:"winOnBid",  seats:[2,3,5], rescorable:false, label:"You must be the bidder to win" },
  { key:"backDoor",  seats:[2,3,5], rescorable:false, label:"−500 loses outright" },

  { key:"defShare",  seats:[3,5],   rescorable:true,  label:"Each defender scores the team's tricks",
    note:"Off means each defender scores only the tricks they took." }
];
```

Render filters on `seats.includes(game.seats)`. Nothing conditional lives in the render function.

`rescorable:false` on `winOnBid` and `backDoor` because they are win and loss *conditions* — they
change when the game ends, not what any hand is worth. Prompting on them would fire a dialog that
does nothing.

Note `defShare` is `[3, 5]`, not `[5]` — cutthroat has two defenders and the same question
applies. Easy to miss.

**Hidden rules keep their stored values.** Do not delete a rule from `state.rules` when it stops
applying. Someone who sets up a 5-player game, drops to 3, and comes back should find their
toggles as they left them. Progressive disclosure should hide state, never destroy it.

### 4. Lock seat count once a hand exists

This dissolves the ragged-delta bug rather than handling it. `scoreHand()` currently sizes its
delta array from the live seat count while stored hands carry their own — mixing lengths within
one game is not a state worth supporting.

So: `game.seats` is editable while `hands` is empty and frozen after the first hand. Changing it
means starting a new game. That is also the smallest possible version of the session model from
the backlog — you get a `game.id` and a lifecycle almost for free.

### 5. Naming collision to fix now

The v1 rule `defTricks` ("defenders score 10 a trick") and the hand field that holds per-side
trick counts want the same name. The field is `trickSplit` above for exactly this reason. Pick
whichever pair you prefer, but do not ship `h.defTricks` alongside `rules.defTricks`.

---

## Migration v1 → v2

v1 has no `version` field, so detect by absence.

```js
function migrate(raw){
  var s = raw;
  if (s.version == null) s = v1_to_v2(s);
  // future: if (s.version === 2) s = v2_to_v3(s);
  return s;
}

function v1_to_v2(v1){
  return {
    version: 2,
    game: {
      id: newId("g"),
      startedAt: Date.now(),        // unknown; best available
      seats: v1.sides.length        // 2 or 3 in all v1 data
    },
    sides: v1.sides.map(function(x){ return { id: newId("s"), name: x.name }; }),
    rules: Object.assign({ defShare: true }, v1.rules),
    hands: v1.hands.map(function(h, i){
      return {
        id: newId("h"),
        contract: h.contract,
        bidder: h.bidder,
        declaring: [h.bidder],      // v1 had no partnerships — always correct
        tricks: h.tricks,
        trickSplit: h.defSplit || [],
        delta: h.delta,             // preserved as scored; never recompute
        scoredUnder: Object.assign({ defShare: true }, v1.rules)
      };
    })
  };
}
```

Two honest gaps: `startedAt` is unrecoverable for existing games, and `scoredUnder` backfills
from *current* rules rather than the rules in force when each hand was played — v1 didn't record
that. Both are acceptable for a one-time migration; neither affects totals.

**Test before shipping:** a v1 game with hands mid-flight, a v1 game with zero hands, a 3-side v1
game, corrupt JSON, and a v2 payload passed through `migrate()` twice (must be idempotent).

---

## What this does not solve

- Multiple concurrent games. `game` is singular here. The `id` is groundwork, not the feature.
- Sync or handoff. The shape is serializable, which is the prerequisite, but there's no conflict
  model.
- Editing a hand other than the last. The `id` fields make it addressable; the UI is the work.
