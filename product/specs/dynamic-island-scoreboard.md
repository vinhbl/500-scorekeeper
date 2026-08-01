# Spec — Live Activity scoreboard (Dynamic Island)

| | |
|---|---|
| **Status** | Reviewed — decisions locked, ready to build (M0 first) |
| **Feature** | A Live Activity that shows the running 2-side score on the Lock Screen and Dynamic Island |
| **Depends on** | iOS app build (Capacitor + Xcode); a Live Activities Capacitor plugin or a hand-rolled bridge |
| **Related** | `BACKLOG.md` (native-capability item), `SCHEMA.md` (state model this reads from) |

A note on how to read this: sections 1–4 are the *what* and could be reviewed by anyone. Sections 5–7 are the *how* and are written for whoever implements the Swift. Section 8 records the decisions made in review and the one small confirmation the M0 spike still owes.

---

## 1. Summary

When a 2-side game has a score, the app publishes a Live Activity: **Us** on the left of the
Dynamic Island, **Them** on the right. It updates as hands are recorded, animates each score
rolling up or down by the amount that changed, and — on a phone held in landscape — rotates the
numbers so they stay legible. It is a glanceable read-out, not a control surface.

## 2. Goals

- A player can glance at the closed phone (lock screen or island) and read the score without opening the app.
- The score is always current with what's on the sheet inside the app.
- The motion of a score changing communicates *which way* and *by how much* — the roll is information, not decoration.
- It looks like it belongs to the same object as the app: felt navy, gold, tabular figures.

## 3. Scope

**In scope (this version)**
- 2-side games only.
- Compact Dynamic Island (Us left / Them right), plus the minimal, expanded, and Lock Screen presentations the system requires you to supply.
- Rolling number animation, direction driven by the sign of the change.
- Orientation-aware rotation of the score in the Dynamic Island.

**Explicitly out of scope (deferred, not forgotten)**
- 3-player and 5-player games — no activity is published for them.
- Any interactivity (buttons, tap-to-increment). Read-only.
- Multiple phones staying in sync — this shows *one* device's sheet. Depends on the live-sync backlog item.
- Push-driven updates. All updates happen while the app is foreground (see §6.3), so no server or APNs work is needed.

Scoping to 2 sides is not just simplification — it removes the hardest layout problem (five scores do not fit a pill), so this version can be genuinely good rather than universally mediocre.

## 4. Behaviour

### 4.1 When it appears and disappears

| Trigger | Behaviour |
|---|---|
| First hand recorded in a 2-side game (`hands` goes 0 → 1) | **Start** the activity |
| Any later change to the totals — hand added, undo, rescore, side renamed | **Update** the activity (animated) |
| Device rotates while the activity is live (iOS 26+ only, §8.1) | **Update** the activity with the new orientation |
| A side crosses 500 | **Keep lingering** — show the real final totals (e.g. `560` / `300`), not a value clamped at 500 |
| **Start a new game** — the setup button, or a seat-count change | **End** the activity |
| User swipes the activity away | **End** it (the finished game stays intact in the app) |

No activity exists before the first score (nothing to show) or for non-2-side games.

**"Start a new game" means the score sheet is cleared to zero hands**, which happens two ways in
the app: the *Start a new game* button in setup, and *changing the seat count* (which spins up a
fresh game). Both end a lingering activity.

**What does not end it:**
- **Undo on the winning hand** — the total drops back below 500, the activity keeps lingering and simply reverts to the pre-win score. It reverts, it doesn't clear.
- **Backgrounding, locking, or reopening** — lingering persists across all of these; only a new game or a manual swipe clears it.

**After a manual swipe:** if the user dismisses the activity and then keeps playing the *same*
game (e.g. undoes the win and records more hands), the activity **stays gone** until a genuinely
new game starts. Swiping it away is read as "I don't want this on screen"; re-summoning it would
be intrusive.

### 4.2 The four presentations the system asks for

The system decides which of these to show; you must supply all four.

**Compact** — the default island pill. *This is the primary experience.*
- Leading (left): the **Us** total.
- Trailing (right): the **Them** total.
- Leader shown in gold, trailing side in bone. Tabular figures.
- Width is tight: totals run to three digits and can be negative (`−500`). At the extremes, show the number alone and lean on the fixed left = Us / right = Them convention rather than a label. (See §8 — confirm the widest string fits.)

**Minimal** — a single glyph's worth of space, shown when another app is also using the island.
- Show the **leading side's** total, tinted gold. When tied, show `Us`.

**Expanded** — long-press of the island.
- Leading region: the Us side name above the Us total.
- Trailing region: the Them side name above the Them total.
- Bottom region: distance to 500 for whoever is ahead (e.g. `Ellis need 160`). Once a side has crossed 500, this switches to the won state: `{winner name} wins!` — the custom side name plus `wins!` (e.g. `Ellis wins!`), since distance-to-500 is meaningless once passed.
- Side names are the custom names from state (default `Us` / `Them`), capped at the app's existing 19–20 character limit; no separate truncation unless testing shows it's needed.

**Lock Screen / StandBy** — the banner form.
- Two side names with their scores, a thin progress bar toward 500 per side, felt-navy background, gold keyline.
- Names as in the expanded view: custom names from state, same 19–20 character cap.

### 4.3 The rolling number (requirement 4)

When a total changes, the digits roll — up when the side gained points, down when it lost them
(a failed contract or back-door −500 moves a score down). The distance rolled corresponds to the
size of the change, so a big swing reads as a big roll.

- Native mechanism: SwiftUI `.contentTransition(.numericText(...))`, which rolls digits between
  values and takes direction from the value change.
- The animation plays on each activity update, so it rides the same update that changes the number.

### 4.4 Orientation rotation (requirement 3)

Intent: when the phone is held in landscape and a score is showing, the two numbers rotate ±90°
so they read correctly for someone looking at the phone in that orientation. The scores keep
their sides — Us stays leading, Them stays trailing — they are **not** swapped; only rotated.

**This is a progressive enhancement, not a baseline requirement.** On iOS 26+ the system presents
Live Activities in the Dynamic Island in landscape, so the rotation happens through supported
platform behaviour. On iOS 17–25 the island does not reorient and the score simply stays as-is
when the phone turns — still fully legible, just not rotated. No device gets a broken experience;
newer devices get a nicer one. See §6.4 and §8.1.

| Device orientation | Score rotation (iOS 26+) |
|---|---|
| Portrait | 0° |
| Landscape (rotated counter-clockwise) | +90° |
| Landscape (rotated clockwise) | −90° |

The exact sign per landscape direction is provisional and must be confirmed on device (§8.1).

## 5. Architecture

Three layers, each with one job:

```
  app.js  (web)              Capacitor plugin (bridge)        Widget Extension (native)
  ─────────────              ─────────────────────────        ──────────────────────────
  computes totals            start / update / end             ActivityKit + SwiftUI
  detects orientation   ──▶  marshals JS → Swift        ──▶   renders the 4 presentations
  calls start/update/end     guards areActivitiesSupported    owns the animation + rotation
```

The web app already computes `totals()` and already knows orientation (the landscape CSS added
earlier keys off it). So the web layer is the source of truth for *what to show*; the widget
extension owns *how it looks and moves*.

## 6. Technical design

### 6.1 Data model

```swift
struct ScoreboardAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var us: Int          // Us total — real value, not clamped at 500
        var them: Int        // Them total
        var usLabel: String  // side name, default "Us"
        var themLabel: String
        var orientation: ScoreOrientation   // .portrait | .landscapeCW | .landscapeCCW
    }
    var gameId: String       // static for the life of the game
}
```

State stays far under ActivityKit's 4 KB ceiling. Labels carry the app's custom side names
(§4.2). `orientation` is only consumed on iOS 26+; on the iOS 17–25 floor it's ignored (§8.1).
Totals are the true running scores, so a finished game lingers showing e.g. `560` / `300`.

### 6.2 Bridge surface (JS → native)

```
Scoreboard.isSupported() -> { supported, dynamicIsland }
Scoreboard.start({ gameId, us, them, usLabel, themLabel, orientation })
Scoreboard.update({ us, them, usLabel, themLabel, orientation })
Scoreboard.end({ gameId })
```

Every call is a no-op unless `areActivitiesSupported()` is true **and** the game is 2-side.

### 6.3 Web integration points (`app.js`)

- After a 2-side game's first `save()`, call `start`.
- On any subsequent totals change (the existing render path already fires on all of them), call `update`.
- Detect orientation with `screen.orientation.type` (`landscape-primary` / `landscape-secondary`) and map to `landscapeCW` / `landscapeCCW`; on change, call `update` with the new value.
- On reset or a seat-count change away from 2, call `end`.

Because scores only change on user input — which happens with the app foreground — every update
originates foreground. That's why no push infrastructure is needed. The one consequence:
orientation changes while the app is **backgrounded** are not captured until the app is
reopened (§8.1).

### 6.4 Native setup checklist

- Widget Extension target with `NSSupportsLiveActivities = YES`.
- App Group shared between app and extension.
- `ActivityConfiguration` registered in the extension's `WidgetBundle`, supplying all four presentations.
- Deployment target **iOS 17.0** (floor — required for `.numericText` content transitions and near-universal now).
- **Orientation rotation gated to iOS 26+** at runtime; on 17–25 the score renders without rotation (§8.1).
- Tapping the island **launches the app to wherever it was** — a plain launch, no `widgetURL` deep-link. Keeps the activity read-only.

## 7. Milestones

| # | Milestone | Done when |
|---|---|---|
| **M0** | **Spike** (§8.1) — confirmation | Orientation exposure confirmed on an iOS 26+ device; `numericText` confirmed in a Live Activity; widest compact string (`−500`) confirmed to fit |
| M1 | Scaffolding | Extension target, attributes, App Group, plugin skeleton, `isSupported` returns correctly on device |
| M2 | Static scoreboard | start/update/end drive the compact + Lock Screen views from real hands; custom names in expanded/Lock Screen; win lingers with real totals |
| M3 | Animation | Scores roll, correct direction, on every update |
| M4 | Orientation (iOS 26+) | On iOS 26+, numbers rotate with device orientation; on the 17–25 floor, they render unrotated with no regression |
| M5 | Polish | App palette; minimal + expanded states; extremes (`−500`, `500+`, tie); linger-then-clear verified across new-game and swipe |

M0 is no longer gating exploration — the orientation approach is decided (§8.1). It's kept as a
short confirmation pass because verifying `numericText` and the landscape exposure on a real
device before M1 is still cheaper than discovering a surprise mid-build.

## 8. Resolved decisions and remaining risk

### 8.1 Orientation — approach settled *(spike now confirmation-only)*

The decision to make rotation a **progressive enhancement** removed the risk this section
originally carried. There is no pushed-orientation fallback and no backgrounded-staleness problem,
because the app no longer tries to force rotation on devices that don't support it natively.

- **iOS 17–25 (floor):** the Dynamic Island doesn't reorient; the score stays put when the phone
  turns. Fully legible, just unrotated. No extra code.
- **iOS 26+:** the system presents the Live Activity in the Dynamic Island in landscape natively.
  The view reads `orientation` from state (or the system's presentation context) and rotates ±90°.

**Remaining spike work (M0), confirmation not exploration:** on an iOS 26+ device, confirm how
the landscape presentation exposes orientation to the view, and nail down the ±90° sign per
landscape direction (§4.4). Also confirm `.numericText` animates inside a Live Activity and that
the widest compact string (`−500`) fits. None of these is expected to block; they're verification.

### 8.2 Decisions — all resolved

| Question | Decision |
|---|---|
| Labels | **Custom side names** in expanded + Lock Screen (default `Us`/`Them`), capped at the app's existing 19–20 char limit; no separate truncation until testing shows a need. Compact/minimal are numbers-only regardless. |
| Minimum iOS target | **iOS 17** floor; orientation rotation as an **iOS 26+** enhancement. Older devices work fully minus rotation. |
| After a win | **Linger** showing the real final totals; clear only on a new game or a manual swipe (§4.1). |
| Expanded bottom line | **Distance to 500** for the leader while the game is live; switches to `{winner} wins!` once a side crosses 500. (A "minimum bid needed to win" variant is in the backlog.) |
| Tap behaviour | **Plain launch** to wherever the app was — no deep-link. Keeps it read-only. |


## 9. Acceptance criteria

- [ ] No activity exists until the first score of a 2-side game; none ever for 3/5-player games.
- [ ] Compact island shows Us left, Them right, matching the sheet exactly after every hand, undo, and rescore.
- [ ] A score increase rolls up; a decrease (failed bid, −500) rolls down.
- [ ] On iOS 26+, landscape shows the score rotated and legible, sides not swapped; on iOS 17–25 it shows unrotated with no regression.
- [ ] Expanded and Lock Screen show the custom side names (default Us/Them); compact and minimal are numbers-only.
- [ ] A win lets the activity linger showing the real final totals (e.g. 560/300), not a value clamped at 500.
- [ ] Once a side crosses 500, the expanded bottom line reads `{winner} wins!` with the custom name, replacing distance-to-500.
- [ ] Undo of a winning hand reverts the lingering score below 500 without clearing the activity.
- [ ] The activity clears on a new game (setup button or seat-count change) and on a manual swipe; a swipe keeps it gone for the same game.
- [ ] Tapping the island launches the app (plain launch, no deep-link).
- [ ] Three-digit and negative totals render without clipping in the compact view.
- [ ] Colours, type, and keyline read as the same object as the app.
```
