import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: mockRemoveChannel,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { name: 'Contact' }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      browserNotifications: false,
      transcriptionNotificationEnabled: true,
    },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

// O nome do canal passou a ser derivado do usuário (`transcription-notifications:<id>`). Aqui o
// teste prova a inscrição SEM usuário, e por isso o nome base; o nome por usuário e a sua
// estabilidade entre remontagens ficam em
// src/hooks/communication/__tests__/useTranscriptionNotifications.filtros.test.ts.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

// Must import AFTER mocks
const { useTranscriptionNotifications } = await import('@/hooks/communication/useTranscriptionNotifications');
const { renderHook } = await import('@testing-library/react');

describe('useTranscriptionNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    });
  });

  it('subscribes to transcription-notifications channel', () => {
    renderHook(() => useTranscriptionNotifications());
    expect(mockChannel).toHaveBeenCalledWith('transcription-notifications');
  });

  it('does not subscribe when disabled', () => {
    renderHook(() => useTranscriptionNotifications({ enabled: false }));
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('cleans up channel on unmount', () => {
    const { unmount } = renderHook(() => useTranscriptionNotifications());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('listens for UPDATE events on messages table', () => {
    const onMock = vi.fn().mockReturnThis();
    mockChannel.mockReturnValue({
      on: onMock,
      subscribe: vi.fn().mockReturnThis(),
    });
    renderHook(() => useTranscriptionNotifications());
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'UPDATE', table: 'messages' }),
      expect.any(Function)
    );
  });

  it('accepts custom options', () => {
    renderHook(() => useTranscriptionNotifications({
      showToast: false,
      playSound: false,
      showBrowserNotification: false,
    }));
    expect(mockChannel).toHaveBeenCalled();
  });
});
