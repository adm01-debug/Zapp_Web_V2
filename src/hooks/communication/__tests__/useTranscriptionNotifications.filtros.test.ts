import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useTranscriptionNotifications,
  sinalDeConclusao,
  decidirAvisoPorResponsabilidade,
  nomeCanalTranscricao,
} from '@/hooks/communication/useTranscriptionNotifications';

/**
 * HZ3-007 — dois filtros que faltavam no aviso de transcrição, e o nome do canal.
 *
 * 1. RECÊNCIA: o gatilho antigo dependia de `payload.old.transcription_status`, que só existe
 *    enquanto `messages` estiver com REPLICA IDENTITY FULL. Com o DEFAULT que o SL-104 traz, `old`
 *    só tem o `id` e qualquer atualização posterior de uma mensagem já transcrita reavisaria. O
 *    carimbo `transcribed_at` gravado pela Edge passa a ser o sinal sólido.
 * 2. RESPONSABILIDADE: todo admin/supervisor recebia aviso de transcrição de QUALQUER conversa. O
 *    aviso só é suprimido quando a conversa tem dono e o dono é outro perfil; informação faltando
 *    mantém o aviso de antes (fallback), com a origem registrada no log.
 */
const h = vi.hoisted(() => {
  const callbacks: Array<(payload: unknown) => unknown> = [];
  return {
    callbacks,
    canais: [] as string[],
    toast: vi.fn(),
    som: vi.fn(),
    navegador: vi.fn(),
    debug: vi.fn(),
    identidade: { user: { id: 'u1' }, profile: { id: 'p1' } } as {
      user: { id: string } | null;
      profile: { id: string } | null;
    },
    contato: { data: { name: 'Fulano', assigned_to: null } } as {
      data: { name?: string; assigned_to?: string | null } | null;
      error: { message: string } | null;
    },
    falhaNaConsulta: false,
    settings: {
      soundEnabled: true,
      browserNotifications: true,
      transcriptionNotificationEnabled: true,
      transcriptionSoundType: 'soft',
      soundVolume: 45,
    },
    // Identidade estável: o hook reassina o canal quando alguma dependência troca de identidade,
    // e um `() => false` novo a cada render reassinaria sem mudança real de configuração.
    isQuietHours: () => false,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (nome: string) => {
      h.canais.push(nome);
      const canal: Record<string, unknown> = {};
      canal.on = (_evt: string, _cfg: unknown, cb: (payload: unknown) => unknown) => {
        h.callbacks.push(cb);
        return canal;
      };
      canal.subscribe = () => canal;
      return canal;
    },
    removeChannel: vi.fn(),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (h.falhaNaConsulta) throw new Error('leitura indisponível');
            return h.contato;
          },
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: h.settings, isQuietHours: h.isQuietHours }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => h.toast(...args),
  useToast: () => ({ toast: h.toast }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: (...args: unknown[]) => h.som(...args),
  showBrowserNotification: (...args: unknown[]) => h.navegador(...args),
  requestNotificationPermission: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => h.identidade,
}));

vi.mock('@/lib/logger', () => ({
  log: {
    debug: (...args: unknown[]) => h.debug(...args),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

const agora = () => new Date().toISOString();
const haUmaHora = () => new Date(Date.now() - 60 * 60_000).toISOString();

function evento(extra: Record<string, unknown> = {}, antigo: Record<string, unknown> = { id: 'm1' }) {
  return {
    new: {
      id: 'm1',
      transcription_status: 'completed',
      transcription: 'olá, tudo bem?',
      contact_id: 'c1',
      ...extra,
    },
    old: antigo,
  };
}

function entregar(payload: Record<string, unknown>) {
  return h.callbacks[0](payload) as Promise<void>;
}

function ultimoDebug(): string {
  const chamadas = h.debug.mock.calls;
  return String(chamadas[chamadas.length - 1]?.[0]);
}

describe('sinalDeConclusao — não depende de payload.old', () => {
  it('sem sinal de recência, evento com old só de id não é conclusão', () => {
    expect(sinalDeConclusao({ id: 'm1' }, { id: 'm1' } as never, Date.now())).toBe('ausente');
  });

  it('carimbo antigo não passa; carimbo de agora passa', () => {
    expect(sinalDeConclusao({ id: 'm1', transcribed_at: haUmaHora() }, undefined, Date.now())).toBe('ausente');
    expect(sinalDeConclusao({ id: 'm1', transcribed_at: agora() }, undefined, Date.now())).toBe('carimbo_recente');
  });

  it('fronteira da janela (~30 s): 45 s já é antigo; 5 s ainda é recente', () => {
    const ha45s = new Date(Date.now() - 45_000).toISOString();
    const ha5s = new Date(Date.now() - 5_000).toISOString();
    expect(sinalDeConclusao({ id: 'm1', transcribed_at: ha45s }, undefined, Date.now())).toBe('ausente');
    expect(sinalDeConclusao({ id: 'm1', transcribed_at: ha5s }, undefined, Date.now())).toBe('carimbo_recente');
  });

  it('transição de status ainda vale enquanto o old trouxer a coluna', () => {
    expect(sinalDeConclusao({ id: 'm1' }, { transcription_status: 'processing' }, Date.now())).toBe('transicao_de_status');
    expect(sinalDeConclusao({ id: 'm1' }, { transcription_status: 'completed' }, Date.now())).toBe('ausente');
  });
});

describe('decidirAvisoPorResponsabilidade — só aperta, com a origem do fallback', () => {
  it('conversa de outro responsável é o único caso que suprime', () => {
    expect(decidirAvisoPorResponsabilidade('p2', 'p1', true)).toEqual({ avisar: false, motivo: 'outro_responsavel' });
  });

  it('dona da conversa recebe', () => {
    expect(decidirAvisoPorResponsabilidade('p1', 'p1', true)).toEqual({ avisar: true, motivo: 'responsavel_proprio' });
  });

  it('informação faltando mantém o aviso e registra a origem', () => {
    expect(decidirAvisoPorResponsabilidade(null, 'p1', true)).toEqual({ avisar: true, motivo: 'sem_responsavel' });
    expect(decidirAvisoPorResponsabilidade('p2', null, true)).toEqual({ avisar: true, motivo: 'responsavel_desconhecido' });
    expect(decidirAvisoPorResponsabilidade(undefined, 'p1', false)).toEqual({ avisar: true, motivo: 'consulta_sem_resposta' });
  });
});

describe('useTranscriptionNotifications — recência e responsabilidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.callbacks.length = 0;
    h.canais.length = 0;
    h.identidade = { user: { id: 'u1' }, profile: { id: 'p1' } };
    h.contato = { data: { name: 'Fulano', assigned_to: null }, error: null };
    h.falhaNaConsulta = false;
  });

  it('não avisa quando a conclusão é antiga e o payload antigo só traz o id', async () => {
    renderHook(() => useTranscriptionNotifications());

    await entregar(evento({ transcribed_at: haUmaHora() }));

    expect(h.som).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.navegador).not.toHaveBeenCalled();
  });

  it('avisa uma única vez quando o carimbo é recente', async () => {
    renderHook(() => useTranscriptionNotifications());

    await entregar(evento({ transcribed_at: agora() }));

    expect(h.som).toHaveBeenCalledWith('message', 'soft', 45);
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.navegador).toHaveBeenCalledTimes(1);

    // Segunda atualização da MESMA mensagem (carimbo ainda recente) não reavisa.
    await entregar(evento({ transcribed_at: agora() }));

    expect(h.som).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('não avisa quando a conversa é de outro responsável', async () => {
    h.contato = { data: { name: 'Fulano', assigned_to: 'p9' }, error: null };
    renderHook(() => useTranscriptionNotifications());

    await entregar(evento({ transcribed_at: agora() }));

    expect(h.som).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.navegador).not.toHaveBeenCalled();
    expect(ultimoDebug()).toContain('outro_responsavel');
  });

  it('avisa quando a conversa é do próprio perfil', async () => {
    h.contato = { data: { name: 'Fulano', assigned_to: 'p1' }, error: null };
    renderHook(() => useTranscriptionNotifications());

    await entregar(evento({ transcribed_at: agora() }));

    expect(h.som).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('mantém o aviso (com o nome genérico) quando a consulta do contato não responde', async () => {
    h.contato = { data: null, error: { message: 'falha na leitura' } };
    renderHook(() => useTranscriptionNotifications());

    await entregar(evento({ transcribed_at: agora() }));

    expect(h.som).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('Contato:') }));
    expect(ultimoDebug()).toContain('consulta_sem_resposta');
  });

  it('segue avisando quando a consulta do contato LANÇA (erro de rede)', async () => {
    h.falhaNaConsulta = true;
    renderHook(() => useTranscriptionNotifications());

    await entregar(evento({ transcribed_at: agora() }));

    expect(h.som).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('Contato:') }));
    expect(ultimoDebug()).toContain('consulta_sem_resposta');
  });

  it('usa o perfil VIGENTE quando ele chega depois do mount', async () => {
    const { rerender } = renderHook(() => useTranscriptionNotifications());

    // O perfil só é conhecido depois do mount; a conversa está atribuída a ele.
    h.identidade = { user: { id: 'u1' }, profile: { id: 'p9' } };
    rerender();
    h.contato = { data: { name: 'Fulano', assigned_to: 'p9' }, error: null };

    await entregar(evento({ transcribed_at: agora() }));

    expect(h.som).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('nome do canal é estável por usuário e muda só com o usuário', () => {
    const primeiro = renderHook(() => useTranscriptionNotifications());
    primeiro.unmount();
    const segundo = renderHook(() => useTranscriptionNotifications());
    segundo.unmount();

    expect(h.canais).toEqual([
      'transcription-notifications:u1',
      'transcription-notifications:u1',
    ]);

    h.identidade = { user: { id: 'u2' }, profile: { id: 'p2' } };
    const outroUsuario = renderHook(() => useTranscriptionNotifications());
    outroUsuario.unmount();

    expect(h.canais[2]).toBe('transcription-notifications:u2');
    expect(nomeCanalTranscricao(null)).toBe('transcription-notifications');
  });
});
