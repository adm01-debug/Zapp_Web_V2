import { useState, useCallback, useRef } from 'react';
import type { ConnectionInfo } from './types';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';

// Alerta de conexão perdida: WebAudio fora do `mediaVolumeStore` (é ALERTA, não mídia de
// conversa). O volume vem do painel (`user_settings.sound_volume`, 10-100) — nunca de um
// ganho fixo cravado no código.
function playAlertSound(volume: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.setValueAtTime(420, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(520, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3 * (volume / 100), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* audio not available */ }
}

export function useMonitoringNotifications() {
  // Estado inicial derivado da permissão do navegador (sem setState dentro de efeito).
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try { return 'Notification' in window && Notification.permission === 'granted'; } catch { return false; }
  });
  const { settings, updateSettings, isQuietHours } = useNotificationSettings();
  const prevRef = useRef<ConnectionInfo[]>([]);

  // Volume e mudo vêm das preferências do usuário (`user_settings`), não de `localStorage`
  // nem de constante: o mesmo controle do painel de notificações passa a valer no monitoramento.
  const soundEnabled = settings.soundEnabled;
  const setSoundEnabled = useCallback((enabled: boolean) => {
    void updateSettings({ soundEnabled: enabled });
  }, [updateSettings]);

  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotificationsEnabled(perm === 'granted');
  }, []);

  const checkDisconnections = useCallback((connections: ConnectionInfo[]) => {
    const prev = prevRef.current;
    if (prev.length > 0) {
      connections.forEach(conn => {
        const p = prev.find(x => x.id === conn.id);
        if (p && p.status === 'connected' && conn.status !== 'connected') {
          if (soundEnabled && !isQuietHours()) playAlertSound(settings.soundVolume);
          if (notificationsEnabled) {
            try {
              new Notification('⚠️ Conexão Perdida', {
                body: `Instância ${conn.instance_id} desconectada.`,
                icon: '/favicon.ico',
                tag: `dc-${conn.instance_id}`,
              });
            } catch { /* */ }
          }
        }
      });
    }
    prevRef.current = connections;
  }, [notificationsEnabled, soundEnabled, settings.soundVolume, isQuietHours]);

  return { notificationsEnabled, soundEnabled, setSoundEnabled, requestNotifications, checkDisconnections };
}
