import ActivityKit
import SwiftUI
import WidgetKit

/// The palette, kept in step with docs/index.html by hand. Four values only —
/// if this list grows, it wants a shared asset catalogue instead.
private enum Ink {
    static let bone  = Color(red: 0.937, green: 0.914, blue: 0.863)   // #EFE9DC
    static let gold  = Color(red: 0.722, green: 0.569, blue: 0.184)   // #B8912F
    static let red   = Color(red: 0.725, green: 0.231, blue: 0.180)   // #B93B2E
    static let muted = Color(red: 0.937, green: 0.914, blue: 0.863).opacity(0.45)
}

@available(iOS 17.0, *)
private struct Total: View {
    let value: Int
    let leading: Bool
    var size: CGFloat = 16

    var body: some View {
        // String(value), never "\(value)" — interpolating an Int into a
        // SwiftUI Text applies the locale's grouping separator, so 1,000
        // shows up where 1000 was meant. Scores here stay under 1000, but
        // the habit is the thing worth keeping.
        Text(String(value))
            .font(.system(size: size, weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .contentTransition(.numericText())
            .foregroundStyle(value < 0 ? Ink.red : (leading ? Ink.gold : Ink.bone))
    }
}

@available(iOS 17.0, *)
struct ScoreboardLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ScoreboardAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(Ink.bone)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded — the first presentation with room for names.
                DynamicIslandExpandedRegion(.leading) {
                    SideBlock(name: context.state.usLabel,
                              value: context.state.us,
                              leading: context.state.leadingIndex == 0,
                              alignment: .leading)
                        // the expanded view runs to the rounded corners, which
                        // clip a name that starts hard against the edge
                        .padding(.leading, 10)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SideBlock(name: context.state.themLabel,
                              value: context.state.them,
                              leading: context.state.leadingIndex == 1,
                              alignment: .trailing)
                        .padding(.trailing, 10)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(footnote(context.state))
                        .font(.system(size: 12))
                        .foregroundStyle(Ink.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 2)
                }
            } compactLeading: {
                Total(value: context.state.us, leading: context.state.leadingIndex == 0)
                    .padding(.leading, 2)
            } compactTrailing: {
                Total(value: context.state.them, leading: context.state.leadingIndex == 1)
                    .padding(.trailing, 2)
            } minimal: {
                // One glyph of space, so only the side in front.
                Total(value: max(context.state.us, context.state.them), leading: true, size: 14)
            }
            // Tapping opens the app plainly — there is no deeper place to land.
            .widgetURL(URL(string: "fivehundred://scoreboard"))
            .keylineTint(Ink.gold)
        }
    }

    private func footnote(_ s: ScoreboardAttributes.ContentState) -> String {
        guard s.isOver else {
            return "\(s.winner == 0 ? s.usLabel : s.themLabel) needs \(s.toGo) to reach 500"
        }
        let winnerName = s.winner == 0 ? s.usLabel : s.themLabel
        let loserName  = s.winner == 0 ? s.themLabel : s.usLabel
        return s.wentOut ? "\(winnerName) wins — \(loserName) went out the back door"
                         : "\(winnerName) wins!"
    }
}

@available(iOS 17.0, *)
private struct SideBlock: View {
    let name: String
    let value: Int
    let leading: Bool
    let alignment: HorizontalAlignment

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(name)
                .font(.system(size: 11, weight: .bold))
                .textCase(.uppercase)
                .kerning(0.5)
                .foregroundStyle(Ink.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .truncationMode(.tail)
            Total(value: value, leading: leading, size: 30)
        }
        .frame(maxWidth: .infinity,
               alignment: alignment == .leading ? .leading : .trailing)
    }
}

/// Also used for the banner and, scaled up, for StandBy.
@available(iOS 17.0, *)
private struct LockScreenView: View {
    let state: ScoreboardAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                Text("Five Hundred")
                    .font(.system(size: 15, design: .serif))
                    .foregroundStyle(Ink.bone)
                Spacer()
                Text(state.isOver ? "FINAL" : "IN PROGRESS")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .kerning(0.8)
                    .foregroundStyle(Ink.muted)
            }
            row(state.usLabel, state.us, state.leadingIndex == 0)
            row(state.themLabel, state.them, state.leadingIndex == 1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func row(_ name: String, _ value: Int, _ leading: Bool) -> some View {
        VStack(spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Ink.bone)
                    .lineLimit(1)
                Spacer(minLength: 12)
                Total(value: value, leading: leading, size: 20)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Ink.bone.opacity(0.13))
                    Capsule()
                        .fill(value < 0 ? Ink.red : (leading ? Ink.gold : Ink.bone.opacity(0.55)))
                        // Progress toward winning, so a negative score is simply
                        // no progress rather than progress the other way.
                        .frame(width: geo.size.width * min(1, max(0, Double(value) / 500)))
                }
            }
            .frame(height: 4)
        }
    }
}
