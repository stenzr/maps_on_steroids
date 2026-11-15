/** Runtime config inlined by Expo from EXPO_PUBLIC_* variables (see apps/mobile/.env.example). */
export const env = {
  proxyUrl: process.env.EXPO_PUBLIC_PROXY_URL ?? '',
  proxySecret: process.env.EXPO_PUBLIC_PROXY_SECRET ?? '',
} as const;
