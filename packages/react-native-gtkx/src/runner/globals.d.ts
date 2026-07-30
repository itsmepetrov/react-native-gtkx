// Runtime globals shared by the release host (host.ts), the dev host
// (host-dev.ts) and the DevSettings bridge (../apis/dev-settings.ts).
// Declared once — the hosts are self-contained executables and cannot
// share runtime code, but they may share ambient types.
type HostModuleRecord = Record<string, unknown>

declare global {
  var __hostModules: Record<string, HostModuleRecord>
  var __hostRequire: NodeJS.Require
  var __ReactRefresh: Record<string, unknown>
  var $RefreshReg$: (type?: unknown, id?: unknown) => void
  var $RefreshSig$: () => (type: unknown) => unknown
  // Dev Menu contract: the app (DevSettings.addMenuItem) writes items, the
  // dev host's menu reads them; the dev host installs the reload hook that
  // DevSettings.reload calls. Absent in release — every call is a no-op.
  var __rnGtkxDevMenuItems: { title: string; handler: () => void }[] | undefined
  var __rnGtkxDevHost: { reload: (reason?: string) => void } | undefined
}

export {}
