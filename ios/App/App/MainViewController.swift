import Capacitor
import UIKit

/// Capacitor 6+ only auto-discovers plugins that arrive as packages. A plugin
/// living in the app target has to be handed to the bridge by name, or it never
/// appears in `Capacitor.Plugins` and every call from the web layer is a no-op
/// with no error anywhere.
///
/// Main.storyboard points at this class rather than CAPBridgeViewController.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
