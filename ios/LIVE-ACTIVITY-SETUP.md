# Live Activity — Xcode setup

The Swift is written. What remains can only be done in Xcode, because target
membership, capabilities and signing are stored in the project file, not in
source. Roughly twenty minutes.

## 0. Raise the deployment target

The app is currently **iOS 15.0**. Live Activities need 16.1, and `.numericText`
animation needs 17.

**Recommended:** set the App target to **iOS 17.0**. Released September 2023, so
adoption is very high by now, and it removes every availability guard from your
own code.

*If you would rather not:* leave the App target where it is and set only the
widget extension to 17.0. The plugin already guards every ActivityKit call with
`#available`, so the app still installs on older devices — it just never shows a
pill. Nothing else needs changing.

## 1. Add the widget extension target

`File ▸ New ▸ Target… ▸ Widget Extension`

- Product name: **FiveHundredWidget**
- **Tick "Include Live Activity"**
- **Untick "Include Configuration App Intent"**
- Do not activate the scheme when prompted

Delete the placeholder files Xcode generates. Then drag these in, with
**FiveHundredWidget** ticked in Target Membership:

- `ios/App/FiveHundredWidget/ScoreboardAttributes.swift`
- `ios/App/FiveHundredWidget/ScoreboardLiveActivity.swift`
- `ios/App/FiveHundredWidget/FiveHundredWidgetBundle.swift`

## 2. Share the attributes with the app

**This is the step that silently breaks everything if missed.**

Select `ScoreboardAttributes.swift` and in the File Inspector tick **both**
`App` and `FiveHundredWidget` under Target Membership.

If only the extension has it, the app cannot compile `Activity.request`. If only
the app has it, the activity starts and then renders nothing at all — no error,
just an empty pill.

## 3. Add the plugin to the app target

Drag `ios/App/App/LiveActivityPlugin.swift` in with **App** ticked (and only App).

Capacitor discovers it automatically through `CAPBridgedPlugin` — there is no
registration list to edit.

## 4. App Group

Both targets need the same group so they share a container.

`Signing & Capabilities ▸ + Capability ▸ App Groups` on **each** target, then add:

```
group.com.vinhbl.fivehundred
```

Not strictly required today, since state passes through the ActivityKit payload
rather than a shared file — but adding it now costs nothing and saves a
provisioning round trip if the widget ever needs to read the score sheet.

## 5. Info.plist

In **App/Info.plist**:

```xml
<key>NSSupportsLiveActivities</key>
<true/>
```

Optional, and worth having:

```xml
<key>NSSupportsLiveActivitiesFrequentUpdates</key>
<true/>
```

Scoring a hand is a user action rather than a background push, so you are
unlikely to hit the budget either way.

## 6. Signing

Both targets need the same team. The widget's bundle ID must be a **child** of
the app's — Xcode does this by default:

```
com.vinhbl.fivehundred
com.vinhbl.fivehundred.FiveHundredWidget
```

## 7. Try it

```
npx cap sync ios
```

Then on a **physical device** — the simulator's Dynamic Island renders but
behaves differently around dismissal:

1. Score a hand in a four-player game
2. Swipe to the home screen — the pill appears
3. Score another — the numbers should roll rather than snap
4. Long-press the island for the expanded view
5. Lock the phone for the full card

## What to expect, and what not to

**While the app is frontmost the island shows nothing.** iOS hides an app's own
Live Activity whenever that app is in front, and there is no API to override it.
Everything here is for the pocketed phone, the lock screen, and a paired watch.

**Five-player games never start one.** Five totals do not fit the compact
presentation, and the app guards on `seats === 2`.

**Nothing starts until the first hand is scored.** An empty scoreboard is not
worth a pill.

## If the pill is blank

Almost always step 2 — `ScoreboardAttributes.swift` missing from the App target.
That is the failure with no error message.
