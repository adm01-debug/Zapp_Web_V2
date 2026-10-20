import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConnectionInfo } from './types';

function playAlertSound() {
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
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* audio not available */ }
}

export function useMonitoringNotifications() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('monitoring_sound') !== 'false'; } catch { return true; }
  });
  const prevRef = useRef<ConnectionInfo[]>([]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') setNotificationsEnabled(true);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('monitoring_sound', String(soundEnabled)); } catch { /* */ }
  }, [soundEnabled]);

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
          if (soundEnabled) playAlertSound();
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
  }, [notificationsEnabled, soundEnabled]);

  return { notificationsEnabled, soundEnabled, setSoundEnabled, requestNotifications, checkDisconnections };
}
