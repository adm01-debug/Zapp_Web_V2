/**
 * Single source of truth for capabilities that require an active Service Worker.
 *
 * Keep these disabled while VitePWA is intentionally absent from vite.config.ts
 * and useServiceWorker removes legacy registrations.
 */
export const SERVICE_WORKER_ENABLED = false;
export const PUSH_NOTIFICATIONS_ENABLED = SERVICE_WORKER_ENABLED;
