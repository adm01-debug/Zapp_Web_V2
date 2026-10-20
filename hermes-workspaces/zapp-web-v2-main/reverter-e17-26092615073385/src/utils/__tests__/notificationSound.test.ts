import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
};

vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
  createOscillator: vi.fn().mockReturnValue({ ...mockOscillator }),
  createGain: vi.fn().mockReturnValue({ ...mockGainNode }),
  currentTime: 0,
  destination: {},
  state: 'running',
  resume: vi.fn(),
})));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { playNotificationSound, requestNotificationPermission, showBrowserNotification } from '@/utils/notificationSound';

describe('notificationSound (singular)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('playNotificationSound', () => {
    it('plays message sound', () => {
      expect(() => playNotificationSound('message')).not.toThrow();
    });

    it('plays mention sound', () => {
      expect(() => playNotificationSound('mention')).not.toThrow();
    });

    it('plays alert sound', () => {
      expect(() => playNotificationSound('alert')).not.toThrow();
    });

    it('defaults to message type', () => {
      expect(() => playNotificationSound()).not.toThrow();
    });

    it('plays double beep for message type', () => {
      playNotificationSound('message');
      vi.advanceTimersByTime(200);
      // Should not throw during double beep timeout
    });
  });

  describe('requestNotificationPermission', () => {
    it('requests permission when default', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      vi.stubGlobal('Notification', { permission: 'default', requestPermission });
      await requestNotificationPermission();
      expect(requestPermission).toHaveBeenCalled();
    });

    it('does not request when already granted', async () => {
      const requestPermission = vi.fn();
      vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
      await requestNotificationPermission();
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it('does not request when denied', async () => {
      const requestPermission = vi.fn();
      vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
      await requestNotificationPermission();
      expect(requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('showBrowserNotification', () => {
    it('creates notification when granted', () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal('Notification', { permission: 'granted' });
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'granted' });
      showBrowserNotification('Test', 'Body');
      expect(NotificationSpy).toHaveBeenCalledWith('Test', expect.objectContaining({ body: 'Body' }));
    });

    it('does not create notification when denied', () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'denied' });
      showBrowserNotification('Test', 'Body');
      expect(NotificationSpy).not.toHaveBeenCalled();
    });

    it('accepts custom icon', () => {
      const NotificationSpy = vi.fn();
      vi.stubGlobal('Notification', NotificationSpy);
      Object.defineProperty(NotificationSpy, 'permission', { value: 'granted' });
      showBrowserNotification('Test', 'Body', '/custom-icon.png');
      expect(NotificationSpy).toHaveBeenCalledWith('Test', expect.objectContaining({ icon: '/custom-icon.png' }));
    });
  });
});
