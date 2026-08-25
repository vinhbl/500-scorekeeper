import ActivityKit
import Capacitor
import Foundation

/// Bridges the web app to ActivityKit. Every method resolves rather than
/// rejecting when Live Activities are unavailable — the scoreboard is the
/// feature, this is a garnish, and a rejected promise in the middle of scoring
/// a hand would be worse than a missing pill.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end",         returnType: CAPPluginReturnPromise)
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *),
              ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false]); return
        }
        // Never run two at once. A seat-count change or a new game ends the old
        // one first; this is the belt to that braces.
        endAll()
        do {
            let activity = try Activity.request(
                attributes: ScoreboardAttributes(gameId: call.getString("gameId") ?? "game"),
                content: .init(state: state(from: call), staleDate: nil),
                pushType: nil
            )
            call.resolve(["started": true, "id": activity.id])
        } catch {
            call.resolve(["started": false, "error": error.localizedDescription])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else { call.resolve(); return }
        let next = state(from: call)
        Task {
            for activity in Activity<ScoreboardAttributes>.activities {
                await activity.update(.init(state: next, staleDate: nil))
            }
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else { call.resolve(); return }
        // A finished game lingers with its real totals rather than vanishing the
        // instant someone crosses 500 — the last thing you want is the score
        // disappearing exactly when the table wants to look at it.
        let linger = call.getBool("linger") ?? false
        let final = state(from: call)
        Task {
            for activity in Activity<ScoreboardAttributes>.activities {
                await activity.end(
                    linger ? .init(state: final, staleDate: nil) : nil,
                    dismissalPolicy: linger ? .after(.now.addingTimeInterval(4 * 60 * 60))
                                            : .immediate
                )
            }
            call.resolve()
        }
    }

    @available(iOS 17.0, *)
    private func endAll() {
        Task {
            for activity in Activity<ScoreboardAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    @available(iOS 16.1, *)
    private func state(from call: CAPPluginCall) -> ScoreboardAttributes.ContentState {
        .init(
            us:         call.getInt("us") ?? 0,
            them:       call.getInt("them") ?? 0,
            usLabel:    call.getString("usLabel") ?? "Us",
            themLabel:  call.getString("themLabel") ?? "Them",
            winner:     call.getInt("winner") ?? -1,
            wentOut:    call.getBool("wentOut") ?? false
        )
    }
}
