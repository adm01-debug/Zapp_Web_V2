/**
 * Refazer 1, ponto 2: ouvinte global + `useWarRoomAlerts(false)` montados juntos.
 *
 * Com a War Room ABERTA e mutada, o MESMO INSERT recebido pelos dois ouvintes
 * não pode tocar som (o mudo explícito do painel vale) e o toast sai UMA vez só.
 * Sem a War Room montada, o global anuncia sozinho (prova de que o silêncio do
 * global é deferência, não ouvinte quebrado) — e ao desmontar a tela o global
 * volta a anunciar (o registro de presença não fica preso).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalCrisisAlerts } from '../useGlobalCrisisAlerts';
import { useWarRoomAlerts } from '../useWarRoomAlerts';

const toastError = vi.fn();
const toastWarning = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), warning: (...a: unknown[]) => toastWarning(...a), success: vi.fn() },
}));

const tocarSomGlobal = vi.fn();
const avisoDesktop = vi.fn();
const irParaWarRoom = vi.fn();

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: (...a: unknown[]) => tocarSomGlobal(...a),
  showBrowserNotification: (...a: unknown[]) => avisoDesktop(...a),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({
  useNavigationHistory: () => ({ navigateToConversation: irParaWarRoom }),
}));

vi.mock('@/lib/crossTabSendDedupe', () => ({
  createCrossTabSendDedupe: () => ({
    claim: () => Promise.resolve({ owner: true, clientMessageId: 'x' }),
    release: vi.fn(),
    dispose: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: true }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true, // preferência geral LIGADA: o painel mudo tem de vencer
      soundVolume: 70,
      browserNotifications: true,
      slaSoundType: 'alert' as const,
    },
    isQuietHours: () => false,
  }),
}));

// `new Audio(...)` da tela: registra os toques sem sair do jsdom.
const audiosTocados: string[] = [];
class FakeAudio {
  src: string;
  volume = 0;
  constructor(src: string) { this.src = src; }
  async play(): Promise<void> { audiosTocados.push(this.src); }
  pause(): void { /* nada */ }
}
vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);

// Handlers realtime capturados por canal.
let handlerGlobal: ((payload: { new: Record<string, unknown> }) => void) | null = null;
let handlerTela: ((payload: { new: Record<string, unknown> }) => void) | null = null;

function canalFake(topico: string) {
  return {
    on: (_ev: string, _f: unknown, cb: (p: { new: Record<string, unknown> }) => void) => {
      if (topico.startsWith('warroom-alerts-global')) handlerGlobal = cb;
      else handlerTela = cb;
      return canalFake(topico);
    },
    subscribe: () => ({}) as never,
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (topico: string) => canalFake(topico),
    removeChannel: vi.fn(),
    from: (tabela: string) => {
      if (tabela === 'conversation_sla') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                order: () => ({ range: async () => ({ data: [], error: null }) }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      };
    },
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

function alerta(id: string, tipo = 'critical') {
  return {
    id,
    alert_type: tipo,
    title: 'Crise',
    message: 'fila acima do limite',
    conversation_id: null,
    metadata: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  audiosTocados.length = 0;
  handlerGlobal = null;
  handlerTela = null;
});

describe('ouvinte global com a War Room aberta e mutada', () => {
  it('mesmo INSERT nos dois ouvintes: sem som e com UM toast só', async () => {
    renderHook(() => useGlobalCrisisAlerts(), { wrapper });
    renderHook(() => useWarRoomAlerts(false), { wrapper });

    await waitFor(() => {
      expect(handlerGlobal).not.toBeNull();
      expect(handlerTela).not.toBeNull();
    });

    await act(async () => {
      handlerGlobal?.({ new: alerta('a-1') });
      handlerTela?.({ new: alerta('a-1') });
      await new Promise((r) => setTimeout(r, 0));
    });

    // Mudo do painel venceu: nem o som do global nem o áudio da tela saíram.
    expect(tocarSomGlobal).not.toHaveBeenCalled();
    expect(audiosTocados).toHaveLength(0);
    // Um aviso só, pela tela; o desktop do crítico fica FIXO (requireInteraction).
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(avisoDesktop).toHaveBeenCalledTimes(1);
    expect(avisoDesktop).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ requireInteraction: true }),
    );
  });

  it('alerta de aviso com o painel mudo: toast de aviso único, sem som', async () => {
    renderHook(() => useGlobalCrisisAlerts(), { wrapper });
    renderHook(() => useWarRoomAlerts(false), { wrapper });

    await waitFor(() => {
      expect(handlerGlobal).not.toBeNull();
      expect(handlerTela).not.toBeNull();
    });

    await act(async () => {
      handlerGlobal?.({ new: alerta('a-2', 'warning') });
      handlerTela?.({ new: alerta('a-2', 'warning') });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(tocarSomGlobal).not.toHaveBeenCalled();
    expect(audiosTocados).toHaveLength(0);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
    expect(avisoDesktop).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ requireInteraction: false }),
    );
  });

  it('sem a War Room montada o global anuncia sozinho; ao desmontar a tela ele volta', async () => {
    const global = renderHook(() => useGlobalCrisisAlerts(), { wrapper });
    const tela = renderHook(() => useWarRoomAlerts(false), { wrapper });

    await waitFor(() => {
      expect(handlerGlobal).not.toBeNull();
      expect(handlerTela).not.toBeNull();
    });

    tela.unmount();
    global.unmount();
    handlerGlobal = null; // descarta o handler da montagem desfeita

    // Nova montagem só do global (a anterior foi desmontada): ele anuncia sozinho.
    renderHook(() => useGlobalCrisisAlerts(), { wrapper });
    await waitFor(() => expect(handlerGlobal).not.toBeNull());

    await act(async () => {
      handlerGlobal?.({ new: alerta('a-3') });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(tocarSomGlobal).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(avisoDesktop).toHaveBeenCalledTimes(1);
  });
});
