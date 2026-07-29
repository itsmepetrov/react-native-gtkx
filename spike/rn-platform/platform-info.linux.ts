// Platform-specific module: Metro must pick this file over platform-info.ts
// when bundling with --platform linux (the RN platform-extension mechanism).
export const platformLabel = (): string =>
  "platform-info.linux.ts (linux extension resolved)"
