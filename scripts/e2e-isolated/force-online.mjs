/**
 * A loopback-only namespace has no default route, so browser engines can report
 * `navigator.onLine === false` even while the isolated HTTPS gateway is healthy.
 * The suite must exercise the real local backend instead of the application's
 * offline queue. This bootstrap is injected only by the isolated Vite config.
 */
export function installIsolatedOnlineState(browserWindow, browserNavigator) {
  Object.defineProperty(browserNavigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
  browserWindow.addEventListener('offline', event => event.stopImmediatePropagation(), true);
}

export const FORCE_ONLINE_SCRIPT =
  `(${installIsolatedOnlineState.toString()})(window, navigator);`;

export function isolatedOnlinePlugin(enabled = process.env.ZAPP_E2E_FORCE_ONLINE === '1') {
  return {
    name: 'zapp-isolated-force-online',
    transformIndexHtml: enabled ? {
      order: 'pre',
      handler: () => [{
        tag: 'script',
        children: FORCE_ONLINE_SCRIPT,
        injectTo: 'head-prepend',
      }],
    } : undefined,
  };
}
