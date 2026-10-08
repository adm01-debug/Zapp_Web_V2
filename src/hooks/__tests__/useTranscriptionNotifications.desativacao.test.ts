import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Defeito #339 (R2-INB-045): a notificação de transcrição pendente escapava à desativação do hook.
 *
 * O callback do canal é assíncrono e espera a busca do contato (`contacts.single()`). Quando o hook
 * era desativado (ou desmontado) com essa busca em voo, o `removeChannel` do cleanup só fechava o
 * canal: a continuação já agendada seguia até o fim e disparava toast/som/notificação do navegador
 * DEPOIS da desativação. Aqui a busca do contato fica presa numa promessa controlada pelo teste,
 * para provar que a notificação pendente é descartada quando o hook sai de cena.
 */
const h = vi.hoisted(() => {
  const callbacks: Array<(payload: unknown) => unknown> = [];
  return {
    toast: vi.fn(),
    playNotificationSound: vi.fn(),
    showBrowserNotification: vi.fn(),
    requestNotificationPermission: vi.fn(),
    removeChannel: vi.fn(),
    callbacks,
    settings: {
      soundEnabled: true,
      browserNotifications: true,
      transcriptionNotificationEnabled: true,
      transcriptionSoundType: 'soft',
      soundVolume: 45,
    },
    isQuietHours: () => false,
    contactsGate: Promise.resolve({ data: { name: 'Fulano' }, error: null }) as Promise<unknown>,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => {
      const canal: Record<string, unknown> = {};
      canal.on = (_evt: string, _cfg: unknown, cb: (payload: unknown) => unknown) => {
        h.callbacks.push(cb);
        return canal;
      };
      canal.subscribe = () => canal;
      return canal;
    },
    removeChannel: (...args: unknown[]) => h.removeChannel(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => h.contactsGate,
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: h.settings,
    isQuietHours: h.isQuietHours,
  }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => h.toast(...args),
  useToast: () => ({ toast: h.toast }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: (...args: unknown[]) => h.playNotificationSound(...args),
  showBrowserNotification: (...args: unknown[]) => h.showBrowserNotification(...args),
  requestNotificationPermission: (...args: unknown[]) => h.requestNotificationPermission(...args),
}));

const { useTranscriptionNotifications } = await import('@/hooks/communication/useTranscriptionNotifications');

const payloadCompleto = {
  new: { id: 'm1', transcription_status: 'completed', transcription: 'olá, tudo bem?', contact_id: 'c1' },
  old: { transcription_status: 'processing' },
};

function gatePreso() {
  let resolver!: (valor: unknown) => void;
  h.contactsGate = new Promise((res) => {
    resolver = res;
  });
  return resolver;
}

describe('useTranscriptionNotifications — desativação com notificação pendente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.callbacks.length = 0;
    h.contactsGate = Promise.resolve({ data: { name: 'Fulano' }, error: null });
  });

  it('não notifica se o hook for desativado com a busca do contato em voo', async () => {
    const liberarContato = gatePreso();

    const { rerender } = renderHook(
      (props: { enabled: boolean }) => useTranscriptionNotifications(props),
      { initialProps: { enabled: true } },
    );

    expect(h.callbacks.length).toBe(1);

    // O evento chega e o handler avança até o `await` da busca do contato, que fica presa.
    const pendente = h.callbacks[0](payloadCompleto) as Promise<void>;

    // Hook desativado com a busca ainda em voo: o cleanup fecha o canal...
    rerender({ enabled: false });
    expect(h.removeChannel).toHaveBeenCalled();

    // ...e a busca só resolve DEPOIS da desativação.
    liberarContato({ data: { name: 'Fulano' }, error: null });
    await pendente;
    await Promise.resolve();

    expect(h.toast).not.toHaveBeenCalled();
    expect(h.playNotificationSound).not.toHaveBeenCalled();
    expect(h.showBrowserNotification).not.toHaveBeenCalled();
  });

  it('continua notificando quando o hook segue ativo (caminho feliz preservado)', async () => {
    const liberarContato = gatePreso();

    renderHook(() => useTranscriptionNotifications());
    expect(h.callbacks.length).toBe(1);

    const pendente = h.callbacks[0](payloadCompleto) as Promise<void>;
    liberarContato({ data: { name: 'Fulano' }, error: null });
    await pendente;

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.playNotificationSound).toHaveBeenCalledWith('message', 'soft', 45);
    expect(h.showBrowserNotification).toHaveBeenCalledTimes(1);
  });
});
