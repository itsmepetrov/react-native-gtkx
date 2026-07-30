// Platform-specific module: Metro picks this file over platform-info.ts
// when bundling with --platform linux (the standard RN extension mechanism).
export const platformDescription = (): string =>
  "platform-info.linux.ts — resolved by the .linux file extension"
