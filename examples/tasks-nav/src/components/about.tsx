import { AdwAboutDialog } from "react-native-gtkx/adw"
import { Gtk } from "react-native-gtkx/gtk"

export const About = ({ onClose }: { onClose: () => void }) => (
  <AdwAboutDialog
    onClosed={onClose}
    applicationName="Tasks (nav)"
    applicationIcon="view-list-symbolic"
    version="1.0.0"
    developerName="react-native-gtkx"
    website="https://github.com/itsmepetrov/react-native-gtkx"
    issueUrl="https://github.com/itsmepetrov/react-native-gtkx/issues"
    copyright="© 2026 react-native-gtkx contributors"
    licenseType={Gtk.License.MIT_X11}
    developers={["react-native-gtkx contributors"]}
    comments="The same task manager as examples/tasks-app, built entirely through createSidebarNavigator — see the README for what that proves."
  />
)
