# 0004. Ship via Capacitor rather than native rewrites

**Status:** Accepted
**Date:** 2026-07-30

## Context

The app is a dependency-free web app served from GitHub Pages. Shipping to the App Store requires a
native binary, and the planned Dynamic Island feature requires ActivityKit, which is native-only
Swift and unreachable from a web page.

Two options: wrap the existing web app in Capacitor, or rewrite natively.

The native case was genuinely strong at first. The app is small (five sections, one screen), the
scoring engine is pure functions that port mechanically, and 109 tests define correct behaviour —
about the safest conditions a rewrite can have. Native would also dissolve the landscape and
orientation-control friction, and unlock MultipeerConnectivity for the table-sync feature in the
backlog.

**Android changed the calculation.** Native then means two rewrites — Swift/SwiftUI and
Kotlin/Compose — with every future feature built twice and the scoring engine maintained in two
languages. Two of the strongest native arguments also turned out to be iOS-only: MultipeerConnectivity
does not cross to Android, and a Live Activity's UI must be written in SwiftUI inside a Widget
Extension regardless of framework, so native saves only the bridge marshalling, not the extension.

## Decision

Use Capacitor. One codebase serves the web app, iOS, and Android. Write native Swift only where
native capability genuinely requires it — which is the Widget Extension that would be needed under
any approach.

## Consequences

**Gained.** One codebase, three targets. The existing tested scoring engine is kept as-is.
Web-layer changes ship without App Store review. The GitHub Pages version keeps working for people
who never install anything.

**Cost.** The UI is HTML in a WKWebView, not native controls — it will never feel exactly like a
native app, which matters for a project whose stated goal is "a considered object." Orientation
control is weaker than native. Capacitor's `webDir` requirement forced the web assets into a
subfolder (see ADR 0005), adding structural friction that does not go away.

**Revisit if.** The webview's feel becomes the dominant complaint, or a planned feature turns out to
need deep native integration on both platforms rather than one.
