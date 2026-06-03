interface AppConfig {
  apiBaseUrl: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}

export function getConfig(): AppConfig {
  if (typeof window !== "undefined" && window.__APP_CONFIG__?.apiBaseUrl) {
    return window.__APP_CONFIG__;
  }
  return { apiBaseUrl: "/api" };
}
