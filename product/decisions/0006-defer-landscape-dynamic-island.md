# 0006. Defer landscape Dynamic Island to iOS 27 general release

**Status:** Accepted
**Date:** 2026-08-01
**Supersedes:** §4.4, §6.1 (`orientation`), §6.4, §8.1, M4, and the landscape acceptance criterion
of `product/specs/dynamic-island-scoreboard.md`

## Context

The spec required that when the phone is held in landscape, the Live Activity's scores rotate ±90°
so they stay legible. It described this as a progressive enhancement gated to **iOS 26+**, with the
system presenting Live Activities in the Dynamic Island in landscape natively.

**That version number was wrong, and the error originated in the spec, not in the spike.** The
underlying research said iOS **27**. When the deployment decision was discussed as "iOS 26+," the
spec was rewritten to match without flagging the discrepancy. Every downstream section inherited it.

The M0 spike then tested faithfully against what the spec said — an iOS 26.5 simulator — and found:

- No orientation API exists in the iOS 26.5 WidgetKit or ActivityKit interfaces.
- At runtime nothing is exposed: size classes are `nil`, `UIDevice.current.orientation` is
  `.unknown` in the extension process.
- The Dynamic Island rendered **nothing at all** in landscape; rotating back to portrait restored
  the activity immediately.

The spike's own conclusion — that no supported mechanism exists — is correct *for iOS 26* and wrong
as a general claim. A blank pill on 26.5 is precisely what a correct spike should find, because the
feature ships in iOS 27.

Apple's iOS 27 announcement lists "Live Activities in Dynamic Island in landscape," and the WWDC26
Live Activities session states that in iOS 27 the Dynamic Island compact and minimal views are
visible in both portrait and landscape. As of this decision iOS 27 is in developer beta, with
general release expected in September 2026.

## Decision

**Defer landscape support for the Dynamic Island until iOS 27 is generally released.** M4 is removed
from the current milestone set and moved to the backlog.

Specifically:

- The iOS **17.0 floor stands**. Nothing else in the spec changes.
- iOS 26 devices now behave like iOS 17–25: the activity works fully, the score does not rotate.
- The `orientation` field is **dropped from `ContentState` for v1.** A field no shipping code reads
  is dead weight; ActivityKit content state is not long-lived, so reintroducing it later is cheap.
- M1–M3 and M5 proceed unchanged.

Rationale for waiting on general release rather than building against the beta: verification would
require the Xcode 27 beta alongside the current 26.6 toolchain, the behaviour may still change
before GA, and the feature is a glanceable nicety rather than core function. The score is fully
legible unrotated.

## Consequences

**Gained.** The one milestone carrying real unknowns is removed, so M1–M3 can proceed against
findings that are now confirmed. No beta toolchain dependency. The graceful-degradation shape
chosen earlier absorbed this almost entirely — iOS 26 simply joins the existing non-rotating
bucket, and the floor, data model, and every other decision stand.

**Cost.** Landscape was one of the three original feature requests and is the one most tied to the
app's physical use — rotating the phone and setting it on the table so everyone can see. That
remains unserved on the island until iOS 27 adoption is meaningful. The in-app landscape bid table
still works and is unaffected.

**Two findings that change the eventual implementation.** Both should be treated as inputs when M4
is revived, not as settled design:

1. **The rotation model may be wrong.** Apple describes a *new style* delivering more information in
   landscape, which suggests a distinct presentation to implement rather than a portrait view
   rotated ±90°. §4.4's rotation table should be re-derived, not resumed.
2. **Landscape compact views cannot grow in width.** The spike found the island elastic in portrait
   — `−500` fit comfortably, and even six glyphs rendered before clipping at seven. That elasticity
   is a *portrait* property. Apple's session notes compact views have no room to grow in width in
   landscape, so the width headroom measured in M0 does not transfer. **This, not rotation, is the
   real risk in the deferred work.**

Portrait Orientation Lock must also be off for landscape to engage at all — an unavoidable user-side
condition, and the same caveat that applies to the in-app landscape bid table.

## M0 findings retained for M1–M3

Confirmed on iOS 26.5 (iPhone 17 Pro, Xcode 26.6), and unaffected by this deferral:

- **`.numericText` animates inside a Live Activity, by default.** Transitions ran ~1.2 s with no
  explicit `.animation` modifier; an explicit `.linear(duration: 3)` stretched it to ~2.4 s. M3 can
  tune the curve. Digit-level slide and crossfade were captured mid-roll, including across a
  widening `300 → −500` transition.
- **`−500` fits the compact island comfortably** in portrait: 39.0 × 19.33 pt at 16 pt rounded
  semibold monospaced digits, against `560` at 31.67 pt.
- **Integer interpolation localizes.** `Text("\(value)")` inserts grouping separators — `-5000`
  rendered as `−5,000`. Totals can exceed 999 in a lingering finished game, so M2 must use
  `String(value)` or `.formatted(.number.grouping(.never))`.
- **The island hides a Live Activity while its own app is frontmost.** Any test harness needs a
  second app or a backgrounded owner. Updates from a backgrounded app work under a
  `beginBackgroundTask` assertion; `areActivitiesEnabled` is true on the simulator.

## Revisit when

iOS 27 reaches general release **and** adoption is high enough to be worth the work. At that point
re-run a short spike against a real iOS 27 device — not the simulator — to answer two questions
before writing any code: is landscape a distinct presentation or a rotation, and does the widest
real score string fit a pill that cannot widen.
