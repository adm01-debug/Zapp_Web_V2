import { getLogger } from '@/lib/logger';

declare const __ZAPP_BUILD_ID__: string;

const log = getLogger('DeploymentUpdate');
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
let updateAlreadyAnnounced = false;

async function checkForDeploymentUpdate() {
  if (updateAlreadyAnnounced || document.visibilityState !== 'visible') return;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const payload = await response.json() as { buildId?: string };
    if (!payload.buildId || payload.buildId === __ZAPP_BUILD_ID__) return;

    updateAlreadyAnnounced = true;
    const { toast } = await import('sonner');
    toast.info('Uma nova versão do Zapp está disponível', {
      description: 'Atualize para evitar usar conexões ou URLs temporárias de uma versão antiga.',
      duration: Infinity,
      action: {
        label: 'Atualizar agora',
        onClick: () => window.location.reload(),
      },
    });
  } catch (error) {
    log.debug('Deployment version check unavailable', error);
  }
}

export function startDeploymentUpdateMonitor() {
  const interval = window.setInterval(() => { void checkForDeploymentUpdate(); }, CHECK_INTERVAL_MS);
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') void checkForDeploymentUpdate();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  window.setTimeout(() => { void checkForDeploymentUpdate(); }, 30_000);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

export const APP_BUILD_ID = __ZAPP_BUILD_ID__;
