# 0001. Model partnerships as a per-hand `declaring` array

**Status:** Accepted
**Date:** 2026-07-29

## Context

The app originally modelled play as fixed sides — `sides: [{name:"Us"}, {name:"Them"}] ` — with
each hand recording a single `bidder`. Adding 5-player 500 broke that assumption: score is kept per
player, and the declarer's partner is determined per hand by who holds a called card. Partnerships
re-form every hand, and the bidder may end up playing alone.

The obvious implementations were a `partner` field alongside `bidder`, or a boolean `alone` flag,
with scoring branching on seat count.

## Decision

Each hand stores `declaring` — an array of seat indices on the bidder's side for that hand.

- 2-side and 3-player: always `[bidder]`
- 5-player with a partner: `[bidder, partner]`
- 5-player alone: `[bidder]`

Scoring reads `declaring` and never branches on seat count. `scoreHandWith()` runs unchanged for
all three configurations.

## Consequences

**Gained.** One scoring function instead of three. "Bidder alone" needs no special case — it is
simply a single-element array. Adding a hypothetical 6-player variant would require no scoring
changes. The 109-assertion test suite exercises all three seat counts through the same code path.

**Cost.** The array is slightly less self-documenting than a named `partner` field; a reader has to
learn what `declaring` means. Requires a schema migration for existing stored games (backfilled as
`[bidder]`, which is always correct for v1 data).

**Constraint this imposes.** Any future scoring logic must express itself in terms of "declaring
side vs defenders" rather than seat positions. `if (seats === 5)` inside scoring is a signal that
something has been modelled wrong.
