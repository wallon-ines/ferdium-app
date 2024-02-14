export const DEFAULT_APP_SETTINGS_VANILLA = {
  autoLaunchInBackground: false,
  runInBackground: true,
  enableSystemTray: true,
  minimizeToSystemTray: false,
  showDisabledServices: true,
  showMessageBadgeWhenMuted: true,
  enableSpellchecking: true,
  spellcheckerLanguage: 'en-US',
  darkMode:
    process.type === 'renderer'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
      : false,
  locale: '',
  fallbackLocale: 'en-US',
  beta: false,
  isAppMuted: false,
  enableGPUAcceleration: true,
  serviceLimit: 5,
};
