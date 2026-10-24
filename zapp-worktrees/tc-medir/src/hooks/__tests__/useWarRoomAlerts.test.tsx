import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Handlers do canal realtime (`postgres_changes`): é o INSERT em warroom_alerts que
// invalidava a query da página e rearmava o monitor de SLA (R2-MOD-074).
const handlersRealtime: Array<(payload: { new: unknown }) => void> = [];

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: vi.fn().mockReturnValue({
      on: vi.fn((_evento: unknown, _filtro: unknown, handler: (payload: { new: unknown }) => void) => {
        handlersRealtime.push(handler);
        return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) };
      }),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({
    showNotification: vi.fn(),
    permission: 'granted',
  }),
}));

// --- Volume do alerta: vem do painel (achado: era 0.5 fixo no codigo) ---
const audiosCriados: Array<{ volume: number; src?: string; play: ReturnType<typeof vi.fn> }> = [];

vi.stubGlobal(
  'Audio',
  class FakeAudio {
    volume = 1;
    currentTime = 0;
    play = vi.fn().mockResolvedValue(undefined);
    constructor(public src?: string) {
      audiosCriados.push(this as never);
    }
  },
);

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundVolume: 40, soundEnabled: true },
    isQuietHours: () => false,
  }),
}));

import { useWarRoomAlerts } from '@/hooks/business/useWarRoomAlerts';

let cliente: QueryClient | null = null;
function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  cliente = qc;
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useWarRoomAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlersRealtime.length = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'warroom_alerts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [
                  { id: 'a1', alert_type: 'sla_breach', title: 'SLA Alert', message: 'Breach!', is_read: false, source: null, created_at: new Date().toISOString() },
                ], error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'conversation_sla') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });
  });

  it('fetches unread alerts', async () => {
    const { result } = renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.alerts).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith('warroom_alerts');
  });

  it('exposes dismissAlert function', () => {
    const { result } = renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    expect(typeof result.current.dismissAlert).toBe('function');
  });

  it('accepts soundEnabled parameter', () => {
    const { result } = renderHook(() => useWarRoomAlerts(false), { wrapper: createWrapper() });
    expect(result.current).toBeDefined();
  });

  it('alerts is an array', () => {
    const { result } = renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    expect(Array.isArray(result.current.alerts)).toBe(true);
  });
});


describe('useWarRoomAlerts — volume do alerta', () => {
  it('aplica o volume persistido do painel (40 -> 0.4) em vez do 0.5 fixo', async () => {
    audiosCriados.length = 0;

    const { result } = renderHook(() => useWarRoomAlerts(true), { wrapper: createWrapper() });

    await waitFor(() => expect(audiosCriados.length).toBeGreaterThan(0));
    expect(audiosCriados[0].volume).toBeCloseTo(0.4, 5);
    expect(result.current).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// R2-MOD-074 — "Monitor do War Room recria alertas continuamente quando
// violações superam a página de 50". O monitor de SLA decidia pela CONTAGEM de
// alertas visíveis numa página de 50 linhas de apresentação: acima de 50
// violações a condição voltava a ser verdadeira a cada republicação da página
// (realtime/refetch) e cada cliente gravava outro alerta do mesmo incidente.
//
// O banco falso abaixo tem o índice único parcial ux_warroom_alerts_dedupe_key
// (dedupe_key nula não colide, como na migration) e a tabela conversation_sla
// paginada em 1000 linhas, o teto do PostgREST.
// ---------------------------------------------------------------------------

type LinhaAlerta = {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean;
  created_at: string;
  dedupe_key?: string | null;
};

const PAGINA_ALERTAS = 50;
const TETO_POSTGREST = 1000;

function idsDeViolacao(quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => `sla-${String(i).padStart(4, '0')}`);
}

describe('useWarRoomAlerts — monitor de SLA (R2-MOD-074)', () => {
  let alertas: LinhaAlerta[];
  let violacoes: string[];
  let erroDeLeitura: { code: string; message: string } | null;
  let erroDeInsert: { code: string; message: string } | null;
  let chavesNoBanco: Set<string>;
  let criados: LinhaAlerta[];
  let tentativas: Array<Record<string, unknown>>;
  let erroNoConsole: ReturnType<typeof vi.spyOn>;

  function instalarBanco() {
    mockFrom.mockImplementation((tabela: string) => {
      if (tabela === 'warroom_alerts') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: alertas.slice(0, PAGINA_ALERTAS), error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            tentativas.push(payload);
            const chave = typeof payload.dedupe_key === 'string' ? payload.dedupe_key : null;
            if (erroDeInsert) return Promise.resolve({ error: erroDeInsert });
            if (chave !== null && chavesNoBanco.has(chave)) {
              return Promise.resolve({
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint "ux_warroom_alerts_dedupe_key"',
                },
              });
            }
            if (chave !== null) chavesNoBanco.add(chave);
            const nova: LinhaAlerta = {
              id: `alerta-${criados.length + 1}`,
              alert_type: String(payload.alert_type ?? 'critical'),
              title: String(payload.title ?? ''),
              message: String(payload.message ?? ''),
              source: (payload.source as string | null) ?? null,
              is_read: false,
              created_at: new Date(2026, 9, 6, 12, criados.length).toISOString(),
              dedupe_key: chave,
            };
            criados.push(nova);
            // A linha nova entra entre as mais recentes da página de 50 — é o que
            // empurrava o monitor antigo de volta para o INSERT.
            alertas.unshift(nova);
            return Promise.resolve({ error: null });
          },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (tabela === 'conversation_sla') {
        const pagina = (de: number, ate: number) => ({
          data: erroDeLeitura ? null : violacoes.slice(de, ate + 1).map((id) => ({ id })),
          error: erroDeLeitura,
        });
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ range: (de: number, ate: number) => Promise.resolve(pagina(de, ate)) }),
              // O monitor antigo esperava a resposta direto no `.eq()` (teto do
              // PostgREST, uma página só). O thenable mantém esse caminho vivo
              // para o vermelho falhar pelo motivo certo: INSERT repetido.
              then: (resolver: (valor: unknown) => unknown) =>
                Promise.resolve(pagina(0, TETO_POSTGREST - 1)).then(resolver),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    handlersRealtime.length = 0;
    alertas = Array.from({ length: PAGINA_ALERTAS }, (_, i) => ({
      id: `outro-${i}`,
      alert_type: 'warning',
      title: `Outro alerta ${i}`,
      message: 'sem relação com SLA',
      source: null,
      is_read: false,
      created_at: new Date(2026, 9, 6, 11, i).toISOString(),
    }));
    violacoes = idsDeViolacao(60);
    erroDeLeitura = null;
    erroDeInsert = null;
    chavesNoBanco = new Set();
    criados = [];
    tentativas = [];
    erroNoConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    instalarBanco();
  });

  afterEach(() => {
    erroNoConsole.mockRestore();
  });

  it('não recria o alerta quando as violações passam de 50 e a página é republicada', async () => {
    const { unmount } = renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });

    await waitFor(() => expect(criados).toHaveLength(1));

    // Dois ciclos do que a tela fazia: o INSERT realtime invalida a query e a
    // página de 50 é republicada (já com o alerta recém-criado dentro dela).
    for (let ciclo = 0; ciclo < 2; ciclo += 1) {
      await act(async () => {
        handlersRealtime.forEach((handler) =>
          handler({ new: { id: `rt-${ciclo}`, alert_type: 'critical', title: 'novo', message: 'novo' } }),
        );
        await cliente!.invalidateQueries({ queryKey: ['warroom-alerts'] });
        await cliente!.refetchQueries({ queryKey: ['warroom-alerts'] });
      });
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });

    expect(alertas.slice(0, PAGINA_ALERTAS)).toHaveLength(PAGINA_ALERTAS);
    expect(criados).toHaveLength(1);
    expect(
      tentativas.every((p) => typeof p.dedupe_key === 'string' && p.dedupe_key.startsWith('sla-monitor:v1:')),
    ).toBe(true);
    unmount();
  });

  it('continua alertando quando o conjunto de violações muda', async () => {
    const primeiro = renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(criados).toHaveLength(1));
    primeiro.unmount();

    violacoes = idsDeViolacao(61);
    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(criados).toHaveLength(2));

    expect(tentativas[0].dedupe_key).not.toBe(tentativas[1].dedupe_key);
    expect(criados[1].title).toBe('61 SLA(s) Violado(s)');
  });

  it('conta o conjunto inteiro de violações, não só a primeira página de 1000', async () => {
    violacoes = idsDeViolacao(1200);

    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(criados).toHaveLength(1));

    expect(criados[0].title).toBe('1200 SLA(s) Violado(s)');
    expect(criados[0].message).toContain('1200 conversas');
  });

  it('falha de leitura das violações não vira alerta', async () => {
    erroDeLeitura = { code: '42501', message: 'permission denied for table conversation_sla' };

    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });

    expect(criados).toHaveLength(0);
    expect(erroNoConsole).toHaveBeenCalled();
  });

  it('erro real de gravação não é engolido e não cria alerta', async () => {
    erroDeInsert = { code: '42501', message: 'new row violates row-level security policy' };

    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(tentativas).toHaveLength(1));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });

    expect(criados).toHaveLength(0);
    expect(erroNoConsole).toHaveBeenCalled();
  });
});
