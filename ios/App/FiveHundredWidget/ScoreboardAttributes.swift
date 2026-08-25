import ActivityKit
import Foundation

/// Shared between the app and the widget extension, so it must be a member of
/// BOTH targets in Xcode. If only one has it, the activity starts and then
/// silently fails to render.
///
/// Two sides only. Five scores do not fit the compact pill, and a Live Activity
/// that is unreadable in its most common presentation is worse than none.
@available(iOS 16.1, *)
struct ScoreboardAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Running totals. Negative is expected — a side can go out the back door.
        var us: Int
        var them: Int
        /// Custom names, shown only where there is room for them.
        var usLabel: String
        var themLabel: String
        /// -1 while the game is live, otherwise the index of the winning side.
        /// The app decides this: the rules for winning involve `winOnBid` and
        /// `backDoor`, and duplicating that here would be a second source of truth.
        var winner: Int
        /// True when the game ended by a side reaching −500 rather than +500.
        var wentOut: Bool

        var isOver: Bool { winner >= 0 }
        var leadingIndex: Int { us >= them ? 0 : 1 }

        /// Distance the leader still needs. Only meaningful while live.
        var toGo: Int { max(0, 500 - max(us, them)) }
    }

    /// Identifies the game, so a stale activity from a previous game can be ended.
    var gameId: String
}
