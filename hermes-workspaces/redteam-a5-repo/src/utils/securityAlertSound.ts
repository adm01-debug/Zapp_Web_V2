/**
 * Som de alerta de SEGURANÇA (rate limit / bloqueio de IP / IP suspeito).
 *
 * Fica fora do `mediaVolumeStore` de propósito: alerta não é mídia de conversa, e o atendente
 * não pode silenciá-lo sem querer mexendo no volume das conversas. O volume, porém, obedece ao
 * volume de alerta do painel (`user_settings.sound_volume`, faixa 10-100) — nunca a um valor
 * fixo cravado no código.
 */
export function playAlertSound(volume: number) {
  try {
    const audio = new Audio('/notification.mp3');
    audio.volume = volume / 100;
    audio.play().catch((err) => {
      console.warn('[securityAlertSound] Audio play failed:', err);
    });
  } catch (e) {
    console.warn('[securityAlertSound] Alert sound failed:', e);
  }
}
