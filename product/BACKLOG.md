# 500 Scorekeeper — Backlog

Parked items, to prioritize and cut later. Committed work is tracked separately:

1. 5-player support
2. Landscape bid table
3. iOS / App Store

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

### Landscape Dynamic Island (deferred from the Live Activity spec)
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
