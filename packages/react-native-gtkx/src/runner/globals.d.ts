// Runtime globals shared by the release host (host.ts) and the dev host
// (host-dev.ts). Declared once — the hosts are self-contained executables
// and cannot share runtime code, but they may share ambient types.
type HostModuleRecord = Record<string, unknown>

declare global {
  var __hostModules: Record<string, HostModuleRecord>
  var __hostRequire: NodeJS.Require
  var __ReactRefresh: Record<string, unknown>
  var $RefreshReg$: (type?: unknown, id?: unknown) => void
  var $RefreshSig$: () => (type: unknown) => unknown
}

export {}
