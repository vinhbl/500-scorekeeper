# 0007. v0 scope for the App Store

**Status:** Accepted
**Date:** 2026-08-19

## Context

The app has grown a landscape carousel covering every section, a stepper-based record panel, and
a `defShare` house rule that shipped defaulting to *on*. Preparing a first App Store release forced
two questions: how much of the landscape experience is actually ready, and which scoring rule a
stranger downloading the app should get.

The landscape record slide never settled. Two columns left the five-player case cramped; a
three-column version fixed the density but read worse. Recording is also the one task nobody does
while the phone is flat on the table — it happens after a hand, held in one hand.

Separately, research into the documented rules found every source — Pagat, Hoyle's Games
Modernized, Britannica, officialgamerules — states that in three- and five-handed play each
defender scores only the tricks they personally took. The app shipped with the opposite default.

## Decision

**Landscape carries three slides: scores, bid table, card ranks.** Recording a hand and the
hands-played log are portrait tasks for v0. The landscape record CSS is **parked in place**, not
deleted, with instructions for re-enabling it.

**`defShare` defaults to off.** The toggle stays, so tables that pool defensive tricks can turn it
on, but a new game follows the documented rule.

## Consequences

**Gained.** Landscape becomes the thing it was always best at — a shared reference everyone at the
table can read. No cramped five-player layout to solve, because the case no longer exists in
landscape. New users get the rule the sources agree on.

**Cost.** Scoring requires rotating to portrait, which is a real interruption mid-game and the most
likely thing to annoy in play. And because `defShare` now defaults off, the defender split appears
by default at three and five players — the panel is busier out of the box than it was.

**Not affected.** Existing saved games keep whatever rule they were created with; `validate()`
merges stored rules over the defaults, so nobody's in-progress game changes scoring. Hands already
recorded keep their frozen deltas regardless.

## Revisit when

Rotating to score proves annoying in real games, or a later release wants the fourth slide — the
layout is parked and ready.
