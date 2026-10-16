/**
 * R3-07 (SL-163) — a chave que deduplica a notificação de conquista usa o dia do APP
 * (`appDayKey`, America/Sao_Paulo), o mesmo recorte dos painéis — não o dia do aparelho
 * (`localDayKey`) nem o dia UTC.
 *
 * O período já começa à 00:00 no fuso do app, mas a chave era extraída no fuso do
 * APARELHO: a oeste de São Paulo a 00:00 do app ainda é o dia ANTERIOR no relógio do
 * usuário — em Nova York (UTC-4 em outubro), 30/09/2026 00:00 em SP = 29/09 23:00 local,
 * então `localDayKey(inicio)` devolvia 29/09 enquanto os painéis contavam o dia 30/09 e a
 * conquista ficava deduplicada sob o dia errado. Defeito latente em São Paulo (UTC-3),
 * onde o host roda — por isso o fuso é forçado aqui, como já é feito em
 * `useTodayHourlyVolume.apptz.test.ts` e `WorkItemSheet.fuso.test.tsx`.
 *
 * O teste chama o hook REAL (`useGoalNotifications`) com `appDayKey` espionado (delegando
 * para a implementação real): antes da correção o hook nem passava pelo util do app — usava
 * o dia do aparelho — e a asserção do espelho fica vermelha. A chave vive só num `useRef`
 * do hook, então não há como observá-la de fora: o espelho no colaborador (que EXECUTA o
 * util de verdade, e o valor devolvido é o que vai para a chave) é o que torna a correção
 * visível. A asserção do dia do aparelho sobre o MESMO instante prova que o cenário
 * diverge de verdade (sem ela, aparelho e app coincidiriam e o teste seria vazio).
 */
process.env.TZ = 'America/New_York';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { appDayKey, appDayStart, localDayKey } from '@/lib/localDay';

vi.mock('@/lib/localDay', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/localDay')>();
  return { ...real, appDayKey: vi.fn(real.appDayKey), localDayKey: vi.fn(real.localDayKey) };
});

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

/** 30/09/2026 22:30 no relógio do usuário (Nova York, UTC-4 em outubro). */
const AGORA = new Date(2026, 8, 30, 22, 30, 0);
/** O dia do app (SP) nesse instante: 30/09 22:30 em NY = 30/09 23:30 em SP. */
const DIA_APP = '2026-09-30';
/** O dia do APARELHO no início do período: 30/09 00:00 em SP = 29/09 23:00 em NY. */
const DIA_APARELHO_DO_INICIO = '2026-09-29';

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

describe('useGoalNotifications — chave de conquista pelo dia do app', () => {
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

  it(`a chave sai do dia do APP no início do período (TZ=${TZ})`, async () => {
    renderHook(() => useGoalNotifications());

    // O mount já checa as metas: a conquista do dia é anunciada uma vez.
    await waitFor(() => expect(notificacoesEnviadas).toHaveLength(1));

    const espiao = vi.mocked(appDayKey);
    expect(espiao).toHaveBeenCalled();
    const inicio = espiao.mock.calls[0][0] as Date;

    // O util recebeu o início do período no fuso do APP (00:00 em São Paulo = 29/09 23:00
    // em Nova York) — o mesmo recorte dos painéis; antes era o relógio do aparelho.
    expect(inicio.getTime()).toBe(appDayStart(0, AGORA).getTime());
    // A chave é o dia do APP no INÍCIO do período (R3-07): 30/09 em SP...
    expect(espiao.mock.results[0].value).toBe(DIA_APP);
    // ...enquanto o dia do APARELHO no MESMO instante é o anterior (29/09 em NY): o
    // cenário diverge de verdade, então o teste falha com `localDayKey` e passa com
    // `appDayKey` — sem esta asserção ele seria vazio.
    expect(localDayKey(inicio)).toBe(DIA_APARELHO_DO_INICIO);
    expect(espiao.mock.results[0].value).not.toBe(localDayKey(inicio));
  });

  it('a conquista é anunciada uma vez por dia do app e volta no dia seguinte', async () => {
    const { result } = renderHook(() => useGoalNotifications());
    await waitFor(() => expect(notificacoesEnviadas).toHaveLength(1));

    // Mesma conquista, mesmo dia do app: não repete.
    await act(async () => {
      await result.current.checkGoalProgress();
    });
    expect(notificacoesEnviadas).toHaveLength(1);

    // Vira o dia do APP (01/10 00:30 em São Paulo = 30/09 23:30 em Nova York): nova conquista
    // do período diário é anunciada. O recorte do dia é o do app, o mesmo dos painéis.
    vi.setSystemTime(new Date('2026-10-01T03:30:00.000Z'));
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
