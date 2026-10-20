// Notification sound utilities
import { log } from '@/lib/logger';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

// Generate a pleasant notification beep
export const playNotificationSound = (type: 'message' | 'mention' | 'alert' = 'message') => {
  try {
    const ctx = getAudioContext();
    
    // Resume context if suspended (required by browsers)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Different sounds for different notification types
    const sounds = {
      message: { freq: 880, duration: 0.15, type: 'sine' as OscillatorType },
      mention: { freq: 1200, duration: 0.2, type: 'sine' as OscillatorType },
      alert: { freq: 660, duration: 0.3, type: 'triangle' as OscillatorType },
    };

    const sound = sounds[type];
    oscillator.type = sound.type;
    oscillator.frequency.setValueAtTime(sound.freq, ctx.currentTime);

    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + sound.duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + sound.duration);

    // Double beep for message
    if (type === 'message') {
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1100, ctx.currentTime);
        gain2.gain.setValueAtTime(0, ctx.currentTime);
        gain2.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.1);
      }, 100);
    }
  } catch (error) {
    log.warn('Could not play notification sound:', error);
  }
};

// Request notification permission
export const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};

// Show browser notification
export const showBrowserNotification = (title: string, body: string, icon?: string) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'new-message',
    });
  }
};
