import { useEffect, useRef } from 'react';
import { log } from '@/lib/logger';
import { SERVICE_WORKER_ENABLED } from '@/config/service_worker';

const LEGACY_CACHE_PREFIXES = ['whatsapp-crm-v'];

export function useServiceWorker() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    if (SERVICE_WORKER_ENABLED) return;
    if (!('serviceWorker' in navigator)) return;

    const unregisterAll = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          log.info('[ServiceWorker] Unregistered existing worker');
        }
        
        // Do not delete unrelated Cache Storage entries. Only caches created
        // by the retired PWA implementation belong to this cleanup.
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          const legacyKeys = keys.filter((key) =>
            LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
          );
          for (const key of legacyKeys) {
            await caches.delete(key);
            log.info('[ServiceWorker] Deleted legacy cache:', key);
          }
        }
      } catch (error) {
        log.error('[ServiceWorker] Unregistration failed:', error);
      }
    };

    void unregisterAll();
  }, []);

}
