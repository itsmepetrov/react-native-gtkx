// ported from the gtkx tutorial (examples/tutorial/src/components/about.tsx).
import { AdwAboutDialog } from "react-native-gtkx/adw"
import { Gtk } from "react-native-gtkx/gtk"

export const About = ({ onClose }: { onClose: () => void }) => (
  <AdwAboutDialog
    onClosed={onClose}
    applicationName="Tasks"
    applicationIcon="view-list-symbolic"
    version="1.0.0"
    developerName="react-native-gtkx"
    website="https://github.com/itsmepetrov/react-native-gtkx"
    issueUrl="https://github.com/itsmepetrov/react-native-gtkx/issues"
    copyright="© 2026 react-native-gtkx contributors"
    licenseType={Gtk.License.MIT_X11}
    developers={["react-native-gtkx contributors"]}
    comments="A port of the GTKX tutorial's Tasks app to the React Native API — see the README for what it demonstrates."
  />
)
