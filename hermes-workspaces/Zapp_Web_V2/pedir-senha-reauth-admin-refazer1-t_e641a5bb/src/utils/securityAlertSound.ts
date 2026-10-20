/**
 * Som de alerta de SEGURANÇA (rate limit / bloqueio de IP / IP suspeito).
 *
 * Fica fora do `mediaVolumeStore` de propósito: alerta não é mídia de conversa, e o atendente
 * não pode silenciá-lo sem querer mexendo no volume das conversas. O volume, porém, obedece ao
 * volume de alerta do painel (`user_settings.sound_volume`, faixa 10-100) — nunca a um valor
 * fixo cravado no código.
 *
 * O arquivo PRECISA existir em `public/` (o Vite copia `public/*` para `dist/`): antes apontava
 * para `/notification.mp3`, que nunca existiu no repositório, e o alerta era mudo. O teste
 * `securityAlertSound.asset.test.ts` falha se o arquivo sumir do `public/`.
 */
export const SECURITY_ALERT_SOUND_URL = '/notification.mp3';

export function playAlertSound(volume: number) {
  try {
    const audio = new Audio(SECURITY_ALERT_SOUND_URL);
    audio.volume = volume / 100;
    audio.play().catch((err) => {
      console.warn('[securityAlertSound] Audio play failed:', err);
    });
  } catch (e) {
    console.warn('[securityAlertSound] Alert sound failed:', e);
  }
}
