// The real wiring for ./index.ts's installers: pulled in only from the top
// of ../index.ts, never from a unit test, exactly the split ../apis/index.ts
// draws between its create* factories (mock-host-testable) and itself (the
// file that binds them to gtkxHost, "it pulls in the gtkx bridge").
import { Alert } from "../apis/index"
import {
  installAlertGlobal,
  installErrorUtilsGlobal,
  installIdleCallbackGlobals,
  installNavigatorProductGlobal,
  installWindowAndSelfGlobals,
} from "./index"

export const installGlobals = (): void => {
  installWindowAndSelfGlobals()
  installNavigatorProductGlobal()
  installIdleCallbackGlobals()
  installErrorUtilsGlobal()
  installAlertGlobal(Alert.alert)
}
