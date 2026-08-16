# 500 Scorekeeper — Backlog

Parked items, to prioritize and cut later. Committed work is tracked separately:

1. 5-player support
2. Landscape bid table
3. iOS / App Store

---

## Bugs

### ~~Misère bids are clipped out of the landscape bid table~~ — fixed
`table.bids` no longer sets `height:100%`; `flex:1;min-height:0` lets it shrink so `.specials`
keeps its own row instead of being pushed past `.sheet{overflow:hidden}`. The landscape suite now
asserts the new rule and guards against `height:100%` returning.

Worth remembering: the bug did **not** reproduce in Chrome. Driving real Chrome under phone-landscape
emulation (so `pointer:coarse` matched) at 667×375, 844×390 and 956×440, `#specials` sat inside the
sheet in every case. It is a WebKit/WKWebView behaviour, which is where the app actually ships.
Blink is not a substitute for device verification here.

### Landscape assertions do not measure geometry
`test/landscape.test.js` asserts *"specials (misère bids) stay visible"* by checking only that no
`display:none` rule targets `#specials` — a claim about CSS source text, not layout. It passed
throughout the clipping bug above. Real coverage means measuring rendered geometry (that `#specials`
sits inside `.sheet`'s box at a phone-landscape viewport), which needs a real browser and therefore a
test dependency this repo deliberately does not have. Until that trade is made, treat the landscape
suite as a lint, not a guarantee. Two landscape bugs have now shipped past it.

---

## Onboarding and in-play clarity

From playing with people new to 500. These are the highest-value items in this file: they address
the actual observed failure — the app records a game correctly but does not help anyone *play* it.

### Grey out ineligible bids once a bid is made — SHIPPED
Struck-out, disabled cells for anything at or below the standing bid; the header names what stands;
tapping the standing bid again clears it. Ranking is by **point value**, so misère (250) and open
misère (500) take part in the ladder rather than sitting outside it.

Point-value ranking is a documented variation but **not the most common one** — see the toggles
below. Left as-is deliberately; revisit if it disagrees with how the table actually plays.

### `misereJokerLow` — joker low in misère
The round reference shows the no-trump ladder for a misère bid with the **joker highest**, which
is the default and what this app assumes. Some tables play the joker *lowest* in misère, which
inverts the top of the ladder. Since the reference now states the order as fact on every misère
hand, a table playing it low sees something wrong.

*Implementation:* a settings toggle, default off (joker high). Only affects `rankCards()` when the
contract is a misère — scoring is untouched.

### Two misère house-rule toggles
The bid table currently ranks every contract by point value. Two conventions are common enough to
be worth offering, and both slot into the existing rules panel with no new machinery.

**`misereUnder8` — "8♠ beats misère"** *(ranking / ceiling)*
The traditional Australian ranking puts misère between 7NT and 8♠, so **any** 8-level bid beats it —
including 8♠ at 240, which is worth less in points but higher in the auction. The app currently
ranks misère at its 250 value, so 8♠ does not beat it. This is the difference people will notice at
the table, and the more common convention of the two orderings.

*Implementation:* an effective bid-rank separate from `value`, used only by the outbid comparison.
Scoring is untouched — misère still pays 250 either way.

**`misereAfter7` — "misère requires a 7-level bid first"** *(availability / floor)*
Many tables forbid opening the bidding with misère; someone must bid at the 7-level first. Stricter
versions also disallow it after only 6-level bids. The app currently allows misère as an opening
bid. This is a **floor**, a genuinely separate rule from ranking, and needs the app to know whether
any 7-level bid has been made this hand — which the current draft model does not track.

*Deliberately not building:* open-misère ranking (unsettled across every source — between 9NT and
10♠, between 10♦ and 10♥, tied with 10♥ or 10NT, or unbeatable; the app's tie behaviour matches the
"whichever is bid first excludes the other" convention) and alternate misère scores (150/210/230/250,
open 330/430/500/520). Both are deep house-rule territory and rarely come up.

*Trigger: the ranking disagrees with how the table actually plays. If everyone plays 8♠-beats-misère,
change the default instead of adding a toggle — one fewer setting.*

*Original entry:*

### ~~Grey out ineligible bids once a bid is made~~
Bidding is ascending, so the moment a bid exists, every lower value in the table is dead. Showing
the full grid was actively misleading for new players. Grey out or strike through anything at or
below the current bid.

Notes: misère sits outside the numeric ladder and needs its own rule (most tables allow it over a
lower suit bid). Needs a clear reset when the hand ends. Pairs naturally with the in-round view
below.

### Card rank reference for the current trump suit
The hardest thing for new players to internalise is that with a trump suit named, the joker and the
left bower *become* that suit — joker highest, right bower second, left bower third, then A K Q 10
9 8 7 down. Nothing in the app communicates this.

A simple ordered display of the trump suit's ranking, plus a note that the left bower has left its
printed suit. Should update to whatever suit was actually bid. No-trump and misère need their own
variants (no bowers; joker's role differs by house rule — check before building).

### ~~In-round view after the bid is confirmed~~ — SHIPPED, THEN REMOVED
**Reverted August 2026.** The confirm step forced the user to name a bidder before they had any
reason to, which is information they can give at scoring time instead. Replaced by an
always-present **Card ranks** section below *Record a hand*, driven by the standing bid alone.
The rank renderer built for it was kept wholesale; only the state machine was removed.

*Original entry:*

### In-round view after the bid is confirmed — shipped, then reverted
A "Confirm bid" button on the bid table begins the hand; the in-round view then **replaces** the
bid table, showing the contract, who bid it (plus partner or "alone" at five players), the point
value, and the card-rank reference for the trump suit. "Cancel this hand" returns to the table.
Landscape splits it into two columns.

Deliberately rough — this was built to test the feel before investing in the surrounding
interaction. Still open:

- The confirm step is a plain button. Item 3 (a more seamless bid-confirm / record-result
  transition) will likely replace it.
- Whether the in-round view should also be reachable *after* recording, to review the hand.
- The record panel still sits below the in-round view rather than being part of it.
- **Misère borrows the no-trump ladder.** Correct as far as trumps go, but the joker's role in
  misère varies by house rule — some tables play it low, which would invert the reference. Confirm
  before treating the displayed order as fact.
- **Deck composition is inferred from seat count**, not from a rule: 3 players → 33 cards (floor
  of 7), 2 sides → 43 cards (red to 4, black to 5), 5 players → 53 cards (to 2). Some tables strike
  the 4 of spades and 4 of diamonds instead of both black fours, which would change the black-suit
  floor. Not yet confirmed against how the table actually deals.

*Original entry:*

### ~~In-round view after the bid is confirmed~~
**The biggest item here.** Observed workaround: keeping the winning bid selected in the table so the
table could remember it, then passing the phone around. It failed on two counts — the score was not
visible, and re-reading the trump suit meant parsing a grid rather than glancing at a fact.

A view shown once a bid is confirmed, holding: the contract and its point value, who bid it, the
running score, and the trump rank reference above. Glanceable, and the natural thing to leave on
screen while the hand is played.

This substantially overlaps with what the Live Activity was scoped to do, and does it better —
in-app, on every platform, visible *while the app is in use*, which the Dynamic Island cannot be.
Worth designing before reviving any Live Activity work.

### Show the running score in the landscape bid table
Landscape currently hides `#board` entirely. That was a deliberate call when landscape was framed as
a bidding-only reference view; the real use includes wanting the score visible at the same time.
Small CSS change. Likely subsumed by the in-round view, but cheap enough to do first.

---

## Prerequisites

Not really backlog — these block committed work and should land first.

### Schema versioning and migration
`load()` currently validates that `sides` and `hands` are arrays and nothing else. There is no
version field and no migration path. Every installed device is carrying a live game in the
current shape. 5-player changes that shape.

- Add a `version` field to persisted state
- Write a migration chain, not a one-off
- Decide the failure mode: migrate, archive-and-reset, or prompt

### Ragged delta arrays on seat change
`scoreHand()` sizes its delta array from `S.sides.length` at the time of scoring, but stored hands
keep their own `delta`. Changing seat count mid-game produces deltas of mixed length. Currently
invisible because the only jump is 2↔3. Going to 5 will surface it.

---

## Architecture

### Split the single file
618 lines of `index.html` with styles, markup, and logic inline. Suggested split: `app.js`,
`styles.css`, and a small state module. Keeps the no-build-step property.

### Replace full re-render with targeted updates
Every interaction calls `renderAll()`, which rebuilds all five sections via `innerHTML`. Nothing
can animate, transition, or acknowledge a tap. Most of the "feels like a considered object"
quality lives in this layer and is currently unreachable.

### Service worker cache busting
Cache invalidation depends on manually bumping the `CACHE` string in `sw.js`. Easy to forget,
and forgetting means installed phones silently serve stale code. Consider deriving it from a
build stamp or content hash.

---

## Model

### Session / multiple games
No concept of a game session. `S.hands` grows until someone clears the sheet. No past games, no
resume. This is the prerequisite for any share or handoff flow — those need a serializable game
with an identity.

### Edit any hand, not just the last
`renderLog()` only renders an Undo button on the final row. A mis-recorded hand three hands back
currently requires undoing everything after it.

---

## Surface

### First run and onboarding
The app opens straight into a populated bid table with "Us" and "Them" pre-filled. There is no
empty state because nothing tells the app it is new. Open question: gate on setup, or let people
start immediately and configure later?

### Surface rules and setup
Five rule toggles — `defTricks`, `slam`, `misereDef`, `winOnBid`, `backDoor` — plus the seat
count live inside a collapsed `<details>` labeled "House rules & setup" at the bottom of the
page. These are exactly the things that get argued about at the table. They are currently the
least visible elements in the app.

### Empty and edge states
No game yet, game in progress, misère and no-trump bids, a blown bid, a slam. The states that
separate a considered scoring app from an amateur one.

### Share / handoff
Pass the phone between players, or a link to resume a game elsewhere. Depends on the session
model above.

### Start-a-new-game button in the win banner
When a side crosses 500 and the win banner shows, put a "Start a new game" action in the banner
itself, so the natural next step is right where the game ends rather than buried in the setup
`<details>`. Surfaced while scoping the Live Activity's linger-then-clear behaviour. Not in the
Live Activity scope — a separate in-app affordance.

### Minimum bid needed to win (expanded Live Activity)
In the Live Activity's expanded view, alongside or instead of distance-to-500, show the smallest
bid that would carry the leading (or trailing) side across 500 — e.g. the lowest contract whose
value closes the gap. Turns "160 to go" into "an 8-club would do it." Surfaced while scoping the
expanded bottom line; v1 ships plain distance-to-500.

### Accessibility
Tap target sizes, contrast on the score bars, Dynamic Type support. Worth an audit pass before
anything ships to the App Store.

---

## App Store

### Native capability
Apple rejects apps that are only a website in a wrapper. Neither 5-player nor landscape counts.
Candidates, strongest first:

- **Sync across phones at the table** — five players means five devices, which makes this a real
  feature rather than a justification. Strengthened considerably by the 5-player work.
- **Share sheet export** of a finished score sheet
- **Live Activity** showing the running score on the lock screen

### Live Activity / Dynamic Island scoreboard — DEPRIORITISED
Full spec at `specs/dynamic-island-scoreboard.md`; M0 is complete and its findings hold. Moved here
from active work in August 2026.

**Why.** The spec's stated goal was glancing at a locked or closed phone. That was never the actual
need — the intent was seeing the score *while the app is in use*, with the bid table in landscape.
iOS does not allow that: the system hides an app's own Live Activity in the Dynamic Island while
that app is frontmost, and there is no API to override it. Confirmed by the M0 spike and by Apple's
documented behaviour.

The feature still has value for the case it genuinely serves — the scorekeeper's phone pocketed or
locked mid-game — but that is a smaller need than the in-round view above, which solves the real
problem on every platform with no native code.

**Before reviving:** design the in-round view first and play a few games with it. If it satisfies
the need, this becomes a nice-to-have. Note it was also the candidate native capability for App
Store review, so deprioritising it leaves that question open — sync/handoff is the stronger
candidate anyway.

### Landscape Dynamic Island (further deferred — requires iOS 27)
Rotating the phone should keep the Live Activity score legible on the Dynamic Island. Requires
**iOS 27**, which is in beta as of August 2026 with general release expected in September. Deferred
by ADR 0006 rather than built against a beta toolchain.

Two open questions to resolve with a short spike on a real iOS 27 device before writing code:

- Is landscape a **distinct presentation** rather than a rotated portrait view? Apple describes a
  new style delivering more information in landscape, which would make the spec's ±90° rotation
  model wrong.
- **Does the widest real score string fit?** Compact views cannot grow in width in landscape. The
  comfortable `−500` fit measured in M0 is a portrait property and does not transfer. This is the
  real risk, not rotation.

*Trigger: iOS 27 general release, plus enough adoption to be worth the work.*

### Forced orientation
Once native, orientation can be locked or forced, which overrides the device rotation lock. This
is the one landscape behavior that cannot be achieved in the PWA. Config change, not rework —
the CSS layout carries over unchanged.

---

## Open questions

- **Do rule toggles become conditional on seat count?** A defender-split rule is meaningless at
  two sides. Hiding it is cleaner, but a settings list that changes shape underneath people reads
  as broken. Decide deliberately.
- Does 6-player ever matter, or is 5 the ceiling? Affects how general the partnership model needs
  to be.

---

## Resolved

- **Defender scoring split** — ships as a toggle. Existing `defSplit` machinery should absorb it.
- **Call-a-card vs name-a-player** — not a design concern. Partner selection is verbal at the
  table; scoring only needs *who the partner was, or nobody*, which is the same input either way.
  Revisit only if a live in-hand view is ever built, since call-a-card keeps the partnership
  secret until that card is played.
- **Bidder alone** — in scope regardless of variant. Legitimate play in both, and under
  call-a-card it can also happen by accident when the called card is in the kitty.
