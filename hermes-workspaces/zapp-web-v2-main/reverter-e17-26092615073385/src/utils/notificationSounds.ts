import { log } from '@/lib/logger';
import { SOUND_CONFIGS } from './soundConfigs';
import type { SoundType, NotificationType } from './soundConfigs';

// Re-export types
export type { SoundType, NotificationType } from './soundConfigs';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
};

export const playNotificationSound = (
  notificationType: NotificationType,
  soundType: SoundType = 'chime',
  volume: number = 70
) => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const config = SOUND_CONFIGS[soundType][notificationType];
    const volumeMultiplier = volume / 100;

    config.frequencies.forEach((freq, index) => {
      setTimeout(() => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = config.waveform;
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

        const baseGain = config.gains[index] * volumeMultiplier;
        const duration = config.durations[index];
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(baseGain, ctx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
      }, config.delays[index] * 1000);
    });
  } catch (error) {
    log.warn('Could not play notification sound:', error);
  }
};

export const previewSound = (soundType: SoundType, volume: number = 70) => {
  playNotificationSound('message', soundType, volume);
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) { log.warn('Notifications not supported'); return false; }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
};

export const showBrowserNotification = (
  title: string,
  body: string,
  options?: { icon?: string; tag?: string; onClick?: () => void }
) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body, icon: options?.icon || '/favicon.ico', badge: '/favicon.ico', tag: options?.tag || 'notification',
    });
    if (options?.onClick) {
      notification.onclick = () => { window.focus(); options.onClick?.(); notification.close(); };
    }
    setTimeout(() => notification.close(), 5000);
  }
};
