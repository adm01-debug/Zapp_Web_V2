/**
 * R3-07 (SL-163) — a chave que deduplica a notificação de conquista é do dia **do usuário**,
 * não do dia UTC.
 *
 * Em fuso a LESTE de UTC o dia UTC de `startOfDay(agora)` é o dia ANTERIOR: em Berlin
 * (UTC+2 em outubro), 30/09/2026 00:00 local = 29/09 22:00 UTC, então
 * `start.toISOString().split('T')[0]` montava a chave com 29/09 enquanto o dia do usuário era
 * 30/09. Defeito latente em São Paulo (UTC-3), onde o host roda — por isso o fuso é forçado
 * aqui, como já é feito em `useTodayHourlyVolume.apptz.test.ts` e `WorkItemSheet.fuso.test.tsx`.
 *
 * O teste chama o hook REAL (`useGoalNotifications`) com `localDayKey` espionado (delegando para
 * a implementação real): antes da correção o hook nem passava pelo util — fatiaba o ISO em UTC
 * direto — e a asserção do espelho fica vermelha. A chave vive só num `useRef` do hook, então
 * não há como observá-la de fora: o espelho no colaborador (que EXECUTA o util de verdade, e o
 * valor devolvido é o que vai para a chave) é o que torna a correção visível.
 */
process.env.TZ = 'Europe/Berlin';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { startOfDay } from 'date-fns';

vi.mock('@/lib/localDay', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/localDay')>();
  return { ...real, localDayKey: vi.fn(real.localDayKey) };
});
import { localDayKey } from '@/lib/localDay';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: false,
      browserNotifications: false,
      goalSoundType: 'default',
      soundVolume: 1,
    },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock do PostgREST: o hook lê perfil, metas, agent_stats e conta o progresso
// (`head: true`) em `messages`. As notificações gravadas ficam guardadas para a
// asserção de quantas conquistas foram anunciadas.
// ---------------------------------------------------------------------------
const PERFIL = 'perfil-1';

type Notificacao = { title?: string; message?: string; type?: string };

const notificacoesEnviadas: Notificacao[] = [];
let metas: Array<Record<string, unknown>> = [];
let contagem = 0;

type Chamada = { metodo: string; args: unknown[] };

function resultadoQuery(table: string) {
  if (table === 'profiles') return { data: { id: PERFIL }, error: null };
  if (table === 'goals_configurations') return { data: metas, error: null };
  if (table === 'agent_stats') return { data: null, error: null };
  // contagens de progresso (`count: 'exact', head: true`)
  return { count: contagem, data: null, error: null };
}

function makeBuilder(table: string) {
  const chamadas: Chamada[] = [];
  const builder: Record<string, unknown> = {};
  for (const metodo of [
    'select',
    'eq',
    'neq',
    'gte',
    'lte',
    'or',
    'not',
    'is',
    'in',
    'limit',
    'order',
    'maybeSingle',
    'single',
  ]) {
    builder[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return builder;
    };
  }
  builder.insert = (linhas: Notificacao[]) => {
    if (table === 'notifications') notificacoesEnviadas.push(linhas[0]);
    return builder;
  };
  builder.then = (
    resolve: (valor: unknown) => unknown,
    reject?: (erro: unknown) => unknown
  ) => Promise.resolve(resultadoQuery(table)).then(resolve, reject);
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

import { useGoalNotifications } from '@/hooks/analytics/useGoalNotifications';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** 30/09/2026 22:30 no relógio do usuário (Berlin, UTC+2 em outubro). */
const AGORA = new Date(2026, 8, 30, 22, 30, 0);
/** O dia do usuário nesse instante... */
const DIA_LOCAL = '2026-09-30';
/** ...e o dia UTC do MESMO instante (o que a chave fatiava antes da correção). */
const DIA_UTC_DO_MESMO_INSTANTE = '2026-09-29';

const metaDiaria = {
  id: 'meta-1',
  goal_type: 'messages_sent',
  daily_target: 3,
  weekly_target: 0,
  monthly_target: 0,
  profile_id: null,
  queue_id: null,
  is_active: true,
};

describe('useGoalNotifications — chave de conquista pelo dia local', () => {
  beforeEach(() => {
    // Só o relógio é falso: os timers seguem reais (`waitFor` e o intervalo de
    // 5 min do hook não são afetados).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
    vi.clearAllMocks();
    notificacoesEnviadas.length = 0;
    metas = [metaDiaria];
    contagem = 3; // == daily_target
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`a chave sai do dia LOCAL do início do período (TZ=${TZ})`, async () => {
    renderHook(() => useGoalNotifications());

    // O mount já checa as metas: a conquista do dia é anunciada uma vez.
    await waitFor(() => expect(notificacoesEnviadas).toHaveLength(1));

    const espiao = vi.mocked(localDayKey);
    expect(espiao).toHaveBeenCalled();
    const inicio = espiao.mock.calls[0][0] as Date;

    // O util recebeu o início do período (00:00 local de hoje)...
    expect(inicio.getTime()).toBe(startOfDay(AGORA).getTime());
    // ...cujo dia UTC é o ANTERIOR (era a chave antiga)...
    expect(inicio.toISOString().split('T')[0]).toBe(DIA_UTC_DO_MESMO_INSTANTE);
    // ...e cujo dia local é o dia do usuário (a chave correta).
    expect(espiao.mock.results[0].value).toBe(DIA_LOCAL);
  });

  it('a conquista é anunciada uma vez por dia local e volta no dia seguinte', async () => {
    const { result } = renderHook(() => useGoalNotifications());
    await waitFor(() => expect(notificacoesEnviadas).toHaveLength(1));

    // Mesma conquista, mesmo dia local: não repete.
    await act(async () => {
      await result.current.checkGoalProgress();
    });
    expect(notificacoesEnviadas).toHaveLength(1);

    // Vira o dia LOCAL: nova conquista do período diário é anunciada.
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));
    await act(async () => {
      await result.current.checkGoalProgress();
    });
    expect(notificacoesEnviadas).toHaveLength(2);
  });

  it('meta não batida não anuncia nada (a prova dos outros testes não é vazia)', async () => {
    contagem = 2; // < daily_target 3

    const { result } = renderHook(() => useGoalNotifications());
    await act(async () => {
      await result.current.checkGoalProgress();
    });

    expect(notificacoesEnviadas).toHaveLength(0);
  });
});
