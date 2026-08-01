# 0002. Freeze hand scores, prompt before rescoring

**Status:** Accepted
**Date:** 2026-07-29

## Context

The original implementation recomputed every hand on every rule change:

```js
S.hands.forEach(function(h){ h.delta = scoreHand(h); });
```

Toggling a house rule mid-game silently rewrote the entire score sheet, with no warning and no way
back. No card table works this way — a paper sheet does not retroactively change.

The opposite extreme — freezing scores permanently — has its own failure: a group that realises
mid-game they had a rule set wrong cannot correct the sheet without re-entering every hand.

## Decision

Store both the computed result and the raw inputs, deliberately redundantly:

- `delta` — points awarded, frozen at score time
- `trickSplit` + `contract` + `declaring` — the raw inputs, sufficient to recompute
- `scoredUnder` — a snapshot of the rules in force when the hand was scored

When a scoring rule is toggled mid-game, dry-run the new scoring first. If no hand's points change,
apply silently. If some do, show the affected hand count and the before/after totals, and let the
user choose **Rescore** or **Keep as played**.

Only rules that can change points are `rescorable`. `winOnBid` and `backDoor` are win/loss
conditions and never prompt.

## Consequences

**Gained.** Fixes a real bug. The user is never surprised by their score sheet changing. A mixed
sheet — hands scored under different rules — is legitimate and supported; the log marks those rows.
The redundant storage is what makes the choice possible at all: with only `delta`, rescoring would
be unrecoverable.

**Cost.** Two representations of the same fact can drift if a bug writes one and not the other.
Mitigated by a dev-mode assertion that `delta` recomputes from `trickSplit` under `scoredUnder`, and
by test coverage. Also adds a dialog to a UI that previously had none, which pulled `confirm()`
usage into a real dialog component.

**Constraint this imposes.** Any new scoring rule must declare whether it is `rescorable`, and any
new hand field that affects scoring must be part of the frozen snapshot.
