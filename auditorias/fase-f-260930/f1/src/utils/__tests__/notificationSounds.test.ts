import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AudioContext
const mockOscillator = {
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  type: 'sine',
  frequency: { setValueAtTime: vi.fn() },
};

const mockGainNode = {
  connect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
};

const mockAudioContext = {
  createOscillator: vi.fn().mockReturnValue(mockOscillator),
  createGain: vi.fn().mockReturnValue(mockGainNode),
  currentTime: 0,
  destination: {},
};

vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => mockAudioContext));

import {
  playNotificationSound,
} from '@/utils/notificationSounds';

describe('notificationSounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('playNotificationSound', () => {
    it('plays default message sound without error', () => {
      expect(() => playNotificationSound('message')).not.toThrow();
    });

    it('plays with chime sound type', () => {
      expect(() => playNotificationSound('message', 'chime')).not.toThrow();
    });

    it('plays with bell sound type', () => {
      expect(() => playNotificationSound('mention', 'bell')).not.toThrow();
    });

    it('plays with alert sound type', () => {
      expect(() => playNotificationSound('sla_breach', 'alert')).not.toThrow();
    });

    it('plays with beep sound type', () => {
      expect(() => playNotificationSound('message', 'beep')).not.toThrow();
    });

    it('plays with soft sound type', () => {
      expect(() => playNotificationSound('message', 'soft')).not.toThrow();
    });

    it('plays achievement sound', () => {
      expect(() => playNotificationSound('achievement')).not.toThrow();
    });

    it('plays goal_achieved sound', () => {
      expect(() => playNotificationSound('goal_achieved')).not.toThrow();
    });

    it('plays sla_warning sound', () => {
      expect(() => playNotificationSound('sla_warning')).not.toThrow();
    });

    it('respects custom volume', () => {
      expect(() => playNotificationSound('message', 'chime', 0.5)).not.toThrow();
    });

    it('handles zero volume', () => {
      expect(() => playNotificationSound('message', 'chime', 0)).not.toThrow();
    });

    it('all notification types are playable', () => {
      const types = ['message', 'mention', 'sla_breach', 'sla_warning', 'achievement', 'goal_achieved'] as const;
      types.forEach(type => {
        expect(() => playNotificationSound(type)).not.toThrow();
      });
    });

    it('all sound types work with message', () => {
      const sounds = ['beep', 'chime', 'bell', 'alert', 'soft'] as const;
      sounds.forEach(sound => {
        expect(() => playNotificationSound('message', sound)).not.toThrow();
      });
    });
  });
});
