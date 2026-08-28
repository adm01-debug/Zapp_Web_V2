import { useEffect, useRef } from 'react';
import { log } from '@/lib/logger';

const LEGACY_CACHE_PREFIXES = ['whatsapp-crm-v'];
const LEGACY_SW_RESET_FLAG = 'legacy-sw-reset-done';

async function cleanupLegacyServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return false;

  const cacheKeys = await caches.keys();
  const legacyCacheKeys = cacheKeys.filter((key) =>
    LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );

  if (legacyCacheKeys.length === 0) {
    sessionStorage.removeItem(LEGACY_SW_RESET_FLAG);
    return false;
  }

  log.info('[ServiceWorker] Cleaning legacy caches that can restore stale UI', legacyCacheKeys);

  const registrations = navigator.serviceWorker.getRegistrations
    ? await navigator.serviceWorker.getRegistrations()
    : [];

  await Promise.all(registrations.map((registration) => registration.unregister()));
  await Promise.all(legacyCacheKeys.map((key) => caches.delete(key)));

  if (sessionStorage.getItem(LEGACY_SW_RESET_FLAG) !== '1') {
    sessionStorage.setItem(LEGACY_SW_RESET_FLAG, '1');
    window.location.reload();
    return true;
  }

  return false;
}

export function useServiceWorker() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    if (!('serviceWorker' in navigator)) return;

    const unregisterAll = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          log.info('[ServiceWorker] Unregistered existing worker');
        }
        
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
            log.info('[ServiceWorker] Deleted cache:', key);
          }
        }
      } catch (error) {
        log.error('[ServiceWorker] Unregistration failed:', error);
      }
    };

    void unregisterAll();
  }, []);

}
