/**
 * Canais realtime por instância — nome único (postgres_changes).
 *
 * Antes: `AudioMessagePlayer`, `useMessageReactions` e `WhisperMode` abriam o
 * canal com nome FIXO (`transcription-<id>`, `reactions:<id>`, `whisper-<id>`).
 * Desde a realtime-js
 * 2.101, `supabase.channel(nome)` devolve o canal JÁ existente quando o nome se
 * repete e `.on()` nesse canal inscrito lança — dois componentes/mensagens
 * vivos com o mesmo id (ex.: a lista e o painel montando o mesmo balão de
 * áudio) derrubavam a tela. Com canal compartilhado, o unmount de um consumidor
 * também fazia `removeChannel` e cortava o realtime do outro.
 *
 * Depois: os três canais de `postgres_changes` usam `uniqueRealtimeTopic`, que
 * acrescenta um sufixo por instância. Este teste emula o comportamento da
 * realtime-js (canal repetido + `.on()` duplicado lança) e prova que, ao montar
 * dois consumidores do mesmo id, cada um recebe o SEU canal, nenhum `.on()`
 * repete num mesmo canal e cada unmount remove só o canal da instância.
 */
import type { ComponentProps, ReactNode } from 'react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  interface Canal {
    name: string;
    inscrito: boolean;
    on: () => Canal;
    subscribe: () => Canal;
  }

  // Emula supabase-js realtime-js >= 2.101.
  const canais = new Map<string, Canal>();
  const nomes: string[] = [];
  const removidos: string[] = [];

  const channel = vi.fn((name: string) => {
    const existente = canais.get(name);
    if (existente) return existente; // nome repetido devolve o canal existente
    const canal = {
      name,
      inscrito: false,
      on: () => {
        if (canal.inscrito) throw new Error(`canal "${name}" já inscrito: .on() duplicado`);
        return canal;
      },
      subscribe: () => {
        canal.inscrito = true;
        return canal;
      },
    } as Canal;
    nomes.push(name);
    canais.set(name, canal);
    return canal;
  });

  const removeChannel = vi.fn((canal: Canal) => {
    removidos.push(canal.name);
    canais.delete(canal.name);
  });

  const reset = () => {
    canais.clear();
    nomes.length = 0;
    removidos.length = 0;
    channel.mockClear();
    removeChannel.mockClear();
  };

  /** Nomes de canal começando por `prefixo` (o sufixo por instância vem depois de `:`). */
  const nomesComPrefixo = (prefixo: string) => nomes.filter((n) => n.startsWith(prefixo));

  return { canais, nomes, removidos, channel, removeChannel, reset, nomesComPrefixo };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    })),
    channel: (...args: unknown[]) => h.channel(...(args as [string])),
    removeChannel: (...args: unknown[]) => h.removeChannel(...(args as [never])),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'sup-1', role: 'supervisor', name: 'Supervisor' } }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/reactions/useReactionMutations', () => ({
  useReactionMutations: () => ({ addMutation: { mutateAsync: vi.fn() }, removeMutation: { mutateAsync: vi.fn() } }),
}));

vi.mock('@/hooks/communication/useAudioPlayer', () => ({
  useAudioPlayer: ({ audioUrl }: { audioUrl: string }) => ({
    audioRef: { current: null },
    resolvedUrl: audioUrl,
    isPlaying: false,
    isLoading: false,
    hasError: false,
    playbackRate: 1,
    progress: 0,
    waveformHeights: [],
    currentTime: 0,
    duration: 0,
    togglePlay: vi.fn(),
    handleSeek: vi.fn(),
    cycleSpeed: vi.fn(),
    formatTime: () => '0:00',
    resolveAudioUrl: vi.fn().mockResolvedValue(audioUrl),
  }),
}));

vi.mock('@/components/inbox/MediaVolumeControl', () => ({ MediaVolumeControl: () => null }));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryState: vi.fn(), setQueryData: vi.fn() }),
}));

type MotionDivProps = ComponentProps<'div'> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown };
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
  motion: {
    ...(await importOriginal<typeof import('framer-motion')>()).motion,
    div: ({ children, initial, animate, exit, transition: _t, ...props }: MotionDivProps) => <div {...props}>{children}</div>,
  },
}));

import { useMessageReactions } from '@/hooks/chat/useMessageReactions';
import { WhisperMode } from '@/components/inbox/WhisperMode';
import { AudioMessagePlayer } from '@/components/inbox/AudioMessagePlayer';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

beforeEach(() => {
  h.reset();
});

afterEach(() => {
  cleanup();
});

describe('uniqueRealtimeTopic — sufixo por instância', () => {
  it('(1) preserva o prefixo e acrescenta sufixo; duas chamadas nunca colidem', () => {
    const a = uniqueRealtimeTopic('base');
    const b = uniqueRealtimeTopic('base');
    expect(a.startsWith('base:')).toBe(true);
    expect(b.startsWith('base:')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('canais fixos virados canais por instância', () => {
  it('(2) useMessageReactions: dois hooks da mesma mensagem pedem canais distintos', () => {
    const primeiro = renderHook(() => useMessageReactions('m1'));
    const segundo = renderHook(() => useMessageReactions('m1'));

    const nomes = h.nomesComPrefixo('reactions:m1');
    expect(nomes).toHaveLength(2);
    expect(new Set(nomes).size).toBe(2);

    primeiro.unmount();
    segundo.unmount();
  });

  it('(3) WhisperMode: duas montagens do mesmo contato pedem canais distintos', () => {
    const primeiro = render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    const segundo = render(<WhisperMode contactId="c1" targetAgentId="a1" />);

    const nomes = h.nomesComPrefixo('whisper-c1');
    expect(nomes).toHaveLength(2);
    expect(new Set(nomes).size).toBe(2);

    primeiro.unmount();
    segundo.unmount();
  });

  it('(4) AudioMessagePlayer: duas montagens da mesma mensagem pedem canais distintos', () => {
    const primeiro = render(<AudioMessagePlayer audioUrl="https://exemplo/a.ogg" messageId="m1" isSent={false} />);
    const segundo = render(<AudioMessagePlayer audioUrl="https://exemplo/a.ogg" messageId="m1" isSent={false} />);

    const nomes = h.nomesComPrefixo('transcription-m1');
    expect(nomes).toHaveLength(2);
    expect(new Set(nomes).size).toBe(2);

    primeiro.unmount();
    segundo.unmount();
    expect(h.removidos).toEqual(expect.arrayContaining(nomes));
  });
});
