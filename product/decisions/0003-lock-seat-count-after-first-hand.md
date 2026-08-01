# 0003. Lock seat count once a hand exists

**Status:** Accepted
**Date:** 2026-07-29

## Context

`scoreHand()` sized its delta array from the *live* seat count, while stored hands carried their
own `delta` arrays from when they were scored. Changing seat count mid-game therefore produced
deltas of mixed length within one game. The bug was invisible while the only jump was 2↔3; adding
5-player would have surfaced it.

The options were to handle ragged arrays defensively throughout the scoring and totalling code, or
to make the state unreachable.

## Decision

`game.seats` is editable while `hands` is empty and frozen after the first hand is recorded.
Changing seat count starts a new game. Undoing back to zero hands unlocks it again.

## Consequences

**Gained.** The bug is dissolved rather than handled — no defensive code, no ragged-array cases to
test. As a side effect it forces a `game.id` and a start/end lifecycle, which delivers a meaningful
portion of the session model from the backlog for free and makes a future share/resume feature
cheaper.

**Cost.** The "we started four-handed and someone else showed up" case now means starting a new
game and losing the sheet. This is a real scenario at a card table and the decision accepts it.

**Revisit if.** Mid-game seat changes turn out to be common in practice. The correct fix then is a
session model that can carry multiple games, not relaxing the lock.
