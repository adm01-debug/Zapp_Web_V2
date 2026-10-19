/**
 * Testes de `src/hooks/system/useGeoBlocking.ts` (bloqueio geográfico).
 *
 * A fronteira dublada é o cliente Supabase (rede/banco). O CÓDIGO REAL do hook
 * é exercitado: o duplo só reproduz o encadeamento do PostgREST
 * (`select().limit().single()`, `update().eq()`, `insert()`, `delete().eq()`)
 * e devolve, por tabela, a resposta que cada teste enfileira.
 *
 * Casos de borda: carga vazia, exceção de rede, erro de RLS (42501),
 * violação de unicidade (23505), releitura depois de escrever e operações
 * sem alvo (settings ausente, país não selecionado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Resposta = { data?: unknown; error?: unknown; throw?: unknown };
type EventoLog = {
  table: string;
  op: string;
  values?: Record<string, unknown>;
  column?: string;
  value?: unknown;
  ascending?: boolean;
};

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  log: [] as EventoLog[],
  filas: {} as Record<string, Resposta[]>,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    auth: { getUser: (...args: unknown[]) => mocks.getUser(...args) },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: {
    error: (...args: unknown[]) => mocks.logError(...args),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useGeoBlocking } from '@/hooks/system/useGeoBlocking';
import type { AvaliacaoTrocaDeModo } from '@/hooks/system/useGeoBlocking';

const SETTINGS = { id: 'cfg-1', mode: 'disabled' as const };
const BRASIL = {
  id: 'ac-1',
  country_code: 'BR',
  country_name: 'Brasil',
  created_at: '2026-10-06T10:00:00.000Z',
};
const EUA = {
  id: 'bc-1',
  country_code: 'US',
  country_name: 'Estados Unidos',
  created_at: '2026-10-07T09:00:00.000Z',
};

/** Enfileira um ciclo de leitura na ordem em que `fetchData` consulta. */
function enfileirarCiclo(
  settings: unknown,
  allowed: unknown[] | null,
  blocked: unknown[] | null,
  extras: { settings?: Resposta; allowed?: Resposta; blocked?: Resposta } = {},
) {
  mocks.filas.geo_blocking_settings = mocks.filas.geo_blocking_settings || [];
  mocks.filas.allowed_countries = mocks.filas.allowed_countries || [];
  mocks.filas.blocked_countries = mocks.filas.blocked_countries || [];
  mocks.filas.geo_blocking_settings.push(extras.settings ?? { data: settings, error: null });
  mocks.filas.allowed_countries.push(extras.allowed ?? { data: allowed, error: null });
  mocks.filas.blocked_countries.push(extras.blocked ?? { data: blocked, error: null });
}

function proximaResposta(table: string): Resposta {
  const fila = mocks.filas[table];
  if (fila && fila.length > 0) return fila.shift() as Resposta;
  return { data: null, error: null };
}

function eventos(table: string, op: string): EventoLog[] {
  return mocks.log.filter((e) => e.table === table && e.op === op);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.length = 0;
  mocks.filas = {};
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

  mocks.from.mockImplementation((table: string) => {
    const registrar = (op: string, extra: Partial<EventoLog> = {}) =>
      mocks.log.push({ table, op, ...extra });

    const responder = () => {
      registrar('resolve');
      const r = proximaResposta(table);
      if (r.throw) return Promise.reject(r.throw);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((_cols?: unknown) => {
      registrar('select');
      return builder;
    });
    builder.limit = vi.fn(() => {
      registrar('limit');
      return builder;
    });
    builder.update = vi.fn((values: Record<string, unknown>) => {
      registrar('update', { values });
      return builder;
    });
    builder.insert = vi.fn((values: Record<string, unknown>) => {
      registrar('insert', { values });
      return builder;
    });
    builder.delete = vi.fn(() => {
      registrar('delete');
      return builder;
    });
    builder.order = vi.fn((column: string, opts?: { ascending?: boolean }) => {
      registrar('order', { column, ascending: opts?.ascending !== false });
      return responder();
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      registrar('eq', { column, value });
      return responder();
    });
    builder.single = vi.fn(() => {
      registrar('single');
      return responder();
    });
    builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      responder().then(res, rej);
    return builder;
  });
});

async function montar(opcoes: { country?: string | null } = {}) {
  const { result, unmount } = renderHook(() => useGeoBlocking(opcoes));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return { result, unmount };
}

describe('useGeoBlocking — leitura dos dados', () => {
  it('carrega settings e as duas listas, com ordem decrescente por created_at', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], [EUA]);
    const { result } = await montar();

    expect(result.current.loading).toBe(false);
    expect(result.current.settings).toEqual(SETTINGS);
    expect(result.current.allowedCountries.map((c) => c.id)).toEqual(['ac-1']);
    expect(result.current.blockedCountries.map((c) => c.id)).toEqual(['bc-1']);
    expect(eventos('allowed_countries', 'order')).toEqual([
      { table: 'allowed_countries', op: 'order', column: 'created_at', ascending: false },
    ]);
    expect(eventos('blocked_countries', 'order')).toEqual([
      { table: 'blocked_countries', op: 'order', column: 'created_at', ascending: false },
    ]);
    // Settings é lido pelo caminho `limit(1).single()` (uma linha só).
    expect(eventos('geo_blocking_settings', 'limit')).toHaveLength(1);
    expect(eventos('geo_blocking_settings', 'single')).toHaveLength(1);
  });

  it('lista vazia (data null) não quebra e vira lista vazia', async () => {
    enfileirarCiclo(null, null, null);
    const { result } = await montar();

    expect(result.current.settings).toBeNull();
    expect(result.current.allowedCountries).toEqual([]);
    expect(result.current.blockedCountries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('exceção de rede na primeira leitura avisa e encerra o carregamento', async () => {
    mocks.filas.geo_blocking_settings = [{ throw: new Error('NetworkError') }];
    const { result } = await montar();

    expect(mocks.logError).toHaveBeenCalledWith('Error fetching geo data:', expect.any(Error));
    expect(mocks.toastError).toHaveBeenCalledWith('Erro ao carregar dados');
    expect(result.current.loading).toBe(false);
    // A exceção aborta o ciclo: as outras duas tabelas não são consultadas.
    expect(eventos('allowed_countries', 'resolve')).toHaveLength(0);
  });
});

describe('useGeoBlocking — handleModeChange', () => {
  it('grava o modo com updated_by do usuário logado e updated_at ISO', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], [EUA]);
    // O país do admin vai confirmado: a regra de recusa (PM-32) só deixa ativar
    // whitelist/blacklist com o país do próprio admin fora de risco.
    const { result } = await montar({ country: 'BR' });
    mocks.filas.geo_blocking_settings.push({ data: null, error: null });

    await act(async () => {
      await result.current.handleModeChange('blacklist');
    });

    const updates = eventos('geo_blocking_settings', 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toMatchObject({ mode: 'blacklist', updated_by: 'user-1' });
    expect(String(updates[0].values?.updated_at)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(eventos('geo_blocking_settings', 'eq')).toEqual([
      { table: 'geo_blocking_settings', op: 'eq', column: 'id', value: 'cfg-1' },
    ]);
    expect(result.current.settings?.mode).toBe('blacklist');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Modo alterado para: Blacklist (bloqueados)');
  });

  it('rótulo do modo "disabled" é o do dicionário do hook', async () => {
    enfileirarCiclo({ id: 'cfg-1', mode: 'whitelist' }, [], []);
    const { result } = await montar();

    await act(async () => {
      await result.current.handleModeChange('disabled');
    });

    expect(mocks.toastSuccess).toHaveBeenCalledWith('Modo alterado para: Desativado');
  });

  it('erro do PostgREST (RLS 42501) avisa e NÃO muda o modo na tela', async () => {
    enfileirarCiclo(SETTINGS, [], []);
    const { result } = await montar({ country: 'BR' });
    mocks.filas.geo_blocking_settings.push({
      data: null,
      error: { code: '42501', message: 'permission denied for table geo_blocking_settings' },
    });

    let avaliacao: AvaliacaoTrocaDeModo | null = null;
    await act(async () => {
      avaliacao = await result.current.handleModeChange('blacklist');
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Erro ao alterar modo');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    // Escrita falhou: o retorno não pode dizer que a troca foi permitida.
    expect(avaliacao).toBeNull();
    // Estado otimista não pode mentir: o modo continua o que veio do banco.
    expect(result.current.settings?.mode).toBe('disabled');
  });

  it('sem settings carregado não escreve nada (não inventa id)', async () => {
    enfileirarCiclo(null, [], []);
    const { result } = await montar();

    await act(async () => {
      await result.current.handleModeChange('blacklist');
    });

    expect(eventos('geo_blocking_settings', 'update')).toHaveLength(0);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

describe('useGeoBlocking — handleAddCountry', () => {
  it('na whitelist insere em allowed_countries com added_by e fecha o diálogo', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], []);
    const { result } = await montar();
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    mocks.filas.allowed_countries.push({ data: null, error: null });
    enfileirarCiclo(SETTINGS, [BRASIL, EUA], []);

    await act(async () => {
      result.current.setDialogOpen(true);
      result.current.setSelectedCountry('US');
    });
    await act(async () => {
      await result.current.handleAddCountry('US', 'Estados Unidos');
    });

    const inserts = eventos('allowed_countries', 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual({
      country_code: 'US',
      country_name: 'Estados Unidos',
      added_by: 'user-1',
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Estados Unidos adicionado à whitelist');
    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.selectedCountry).toBe('');
    // Releitura depois de escrever: a lista passa a refletir o banco.
    expect(result.current.allowedCountries.map((c) => c.country_code)).toEqual(['BR', 'US']);
  });

  it('na blacklist insere em blocked_countries com blocked_by', async () => {
    enfileirarCiclo(SETTINGS, [], []);
    const { result } = await montar();
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-7' } }, error: null });
    mocks.filas.blocked_countries.push({ data: null, error: null });
    enfileirarCiclo(SETTINGS, [], []);

    await act(async () => {
      result.current.setActiveTab('blacklist');
    });
    await act(async () => {
      await result.current.handleAddCountry('KP', 'Coreia do Norte');
    });

    const inserts = eventos('blocked_countries', 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual({
      country_code: 'KP',
      country_name: 'Coreia do Norte',
      blocked_by: 'user-7',
    });
    expect(eventos('allowed_countries', 'insert')).toHaveLength(0);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Coreia do Norte adicionado à blacklist');
  });

  it('duplicata (23505) avisa "já está na lista" e mantém o diálogo aberto', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], []);
    const { result } = await montar();
    mocks.filas.allowed_countries.push({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    await act(async () => {
      result.current.setDialogOpen(true);
      result.current.setSelectedCountry('BR');
    });
    await act(async () => {
      await result.current.handleAddCountry('BR', 'Brasil');
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Este país já está na lista');
    expect(mocks.toastError).not.toHaveBeenCalledWith('Erro ao adicionar país');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.selectedCountry).toBe('BR');
    // Duplicata não é exceção: não passa pelo log de erro nem refaz a leitura.
    expect(mocks.logError).not.toHaveBeenCalled();
    expect(eventos('allowed_countries', 'order')).toHaveLength(1);
  });

  it('erro genérico (RLS) vira "Erro ao adicionar país" + log, sem fechar o diálogo', async () => {
    enfileirarCiclo(SETTINGS, [], []);
    const { result } = await montar();
    mocks.filas.allowed_countries.push({
      data: null,
      error: { code: '42501', message: 'permission denied for table allowed_countries' },
    });

    await act(async () => {
      result.current.setDialogOpen(true);
    });
    await act(async () => {
      await result.current.handleAddCountry('US', 'Estados Unidos');
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Erro ao adicionar país');
    expect(mocks.logError).toHaveBeenCalledWith(
      'Error adding country:',
      expect.objectContaining({ code: '42501' }),
    );
    expect(result.current.dialogOpen).toBe(true);
  });
});

describe('useGeoBlocking — handleRemoveCountry', () => {
  it('sem país selecionado para remover não chama o banco', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], []);
    const { result } = await montar();

    await act(async () => {
      await result.current.handleRemoveCountry();
    });

    expect(eventos('allowed_countries', 'delete')).toHaveLength(0);
    expect(eventos('blocked_countries', 'delete')).toHaveLength(0);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('remove da whitelist pelo id, limpa a seleção e relê a lista', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], []);
    const { result } = await montar();
    mocks.filas.allowed_countries.push({ data: null, error: null });
    enfileirarCiclo(SETTINGS, [], []);

    await act(async () => {
      result.current.setCountryToRemove(BRASIL);
    });
    await act(async () => {
      await result.current.handleRemoveCountry();
    });

    expect(eventos('allowed_countries', 'delete')).toHaveLength(1);
    expect(eventos('allowed_countries', 'eq')).toEqual([
      { table: 'allowed_countries', op: 'eq', column: 'id', value: 'ac-1' },
    ]);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Brasil removido');
    expect(result.current.countryToRemove).toBeNull();
    expect(result.current.allowedCountries).toEqual([]);
  });

  it('remove da blacklist usando a tabela da aba ativa', async () => {
    enfileirarCiclo(SETTINGS, [], [EUA]);
    const { result } = await montar();
    mocks.filas.blocked_countries.push({ data: null, error: null });
    enfileirarCiclo(SETTINGS, [], []);

    await act(async () => {
      result.current.setActiveTab('blacklist');
      result.current.setCountryToRemove(EUA);
    });
    await act(async () => {
      await result.current.handleRemoveCountry();
    });

    expect(eventos('blocked_countries', 'delete')).toHaveLength(1);
    expect(eventos('blocked_countries', 'eq')).toEqual([
      { table: 'blocked_countries', op: 'eq', column: 'id', value: 'bc-1' },
    ]);
    expect(eventos('allowed_countries', 'delete')).toHaveLength(0);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Estados Unidos removido');
  });

  it('erro ao remover mantém o alvo selecionado e não relê a lista', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], []);
    const { result } = await montar();
    mocks.filas.allowed_countries.push({
      data: null,
      error: { code: '42501', message: 'permission denied for table allowed_countries' },
    });

    await act(async () => {
      result.current.setCountryToRemove(BRASIL);
    });
    await act(async () => {
      await result.current.handleRemoveCountry();
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Erro ao remover país');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(result.current.countryToRemove).toEqual(BRASIL);
    expect(result.current.allowedCountries.map((c) => c.id)).toEqual(['ac-1']);
    expect(eventos('allowed_countries', 'order')).toHaveLength(1);
  });
});

describe('useGeoBlocking — defeitos encontrados (não corrigidos neste cartão)', () => {
  // BUG: o PostgREST devolve falha de RLS/leitura em `error`, não como exceção.
  // `fetchData` só trata exceção (catch), então uma leitura negada por RLS:
  // (1) não avisa o operador e (2) grava lista vazia por cima da lista já
  // carregada — a tela passa a dizer "nenhum país" quando a leitura foi barrada.
  it.fails('erro de RLS na leitura deveria avisar e preservar a lista já carregada', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], [EUA]);
    const { result } = await montar();
    expect(result.current.allowedCountries.map((c) => c.id)).toEqual(['ac-1']);

    // Escrita funciona e dispara a releitura; a releitura volta negada por RLS.
    mocks.filas.allowed_countries.push({ data: null, error: null });
    enfileirarCiclo(SETTINGS, null, null, {
      allowed: { data: null, error: { code: '42501', message: 'permission denied' } },
      blocked: { data: null, error: { code: '42501', message: 'permission denied' } },
    });

    await act(async () => {
      await result.current.handleAddCountry('US', 'Estados Unidos');
    });

    // Comportamento correto: avisar da falha (soft, para o relato mostrar as
    // DUAS violações) e manter a lista já carregada.
    expect.soft(mocks.toastError).toHaveBeenCalledWith('Erro ao carregar dados');
    expect(result.current.allowedCountries.map((c) => c.id)).toEqual(['ac-1']);
  });
});

describe('useGeoBlocking — ativação que trancaria o próprio admin (recusada)', () => {
  const COREA = {
    id: 'bc-2',
    country_code: 'KP',
    country_name: 'Coreia do Norte',
    created_at: '2026-10-08T08:00:00.000Z',
  };

  async function tentarTrocar(
    result: { current: ReturnType<typeof useGeoBlocking> },
    modo: 'disabled' | 'whitelist' | 'blacklist',
  ): Promise<AvaliacaoTrocaDeModo> {
    const caixa: { valor: AvaliacaoTrocaDeModo | null } = { valor: null };
    await act(async () => {
      caixa.valor = await result.current.handleModeChange(modo);
    });
    if (!caixa.valor) throw new Error('handleModeChange não devolveu avaliação');
    return caixa.valor;
  }

  it('(a) país do próprio admin não confirmado: recusa ativar e não grava nada', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], []);
    const { result } = await montar();

    const avaliacao = await tentarTrocar(result, 'whitelist');

    expect(avaliacao.permitido).toBe(false);
    expect(avaliacao.motivo).toBe('pais-nao-detectado');
    expect(mocks.toastError).toHaveBeenCalledWith(avaliacao.mensagem);
    expect(eventos('geo_blocking_settings', 'update')).toHaveLength(0);
    expect(result.current.settings?.mode).toBe('disabled');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('(b) whitelist sem o país do admin: recusa ativar e não grava', async () => {
    enfileirarCiclo(SETTINGS, [EUA], []);
    const { result } = await montar({ country: 'BR' });

    const avaliacao = await tentarTrocar(result, 'whitelist');

    expect(avaliacao.permitido).toBe(false);
    expect(avaliacao.motivo).toBe('whitelist-sem-pais-do-admin');
    expect(mocks.toastError).toHaveBeenCalledWith(avaliacao.mensagem);
    expect(eventos('geo_blocking_settings', 'update')).toHaveLength(0);
    expect(result.current.settings?.mode).toBe('disabled');
  });

  it('(c) blacklist com o país do admin: recusa ativar e não grava (código em minúsculas conta)', async () => {
    enfileirarCiclo(SETTINGS, [], [EUA, BRASIL]);
    const { result } = await montar({ country: 'br' });

    const avaliacao = await tentarTrocar(result, 'blacklist');

    expect(avaliacao.permitido).toBe(false);
    expect(avaliacao.motivo).toBe('blacklist-com-pais-do-admin');
    expect(mocks.toastError).toHaveBeenCalledWith(avaliacao.mensagem);
    expect(eventos('geo_blocking_settings', 'update')).toHaveLength(0);
    expect(result.current.settings?.mode).toBe('disabled');
  });

  it('permitido: whitelist com o país do admin ativa e grava', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], []);
    const { result } = await montar({ country: 'BR' });
    mocks.filas.geo_blocking_settings.push({ data: null, error: null });

    const avaliacao = await tentarTrocar(result, 'whitelist');

    expect(avaliacao).toEqual({ permitido: true, motivo: null, mensagem: null });
    expect(eventos('geo_blocking_settings', 'update')).toHaveLength(1);
    expect(result.current.settings?.mode).toBe('whitelist');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Modo alterado para: Whitelist (apenas permitidos)');
  });

  it('permitido: blacklist sem o país do admin ativa e grava', async () => {
    enfileirarCiclo(SETTINGS, [], [EUA]);
    const { result } = await montar({ country: 'BR' });
    mocks.filas.geo_blocking_settings.push({ data: null, error: null });

    const avaliacao = await tentarTrocar(result, 'blacklist');

    expect(avaliacao.permitido).toBe(true);
    expect(eventos('geo_blocking_settings', 'update')).toHaveLength(1);
    expect(result.current.settings?.mode).toBe('blacklist');
  });

  it('desativar nunca é recusado, mesmo sem país confirmado', async () => {
    enfileirarCiclo({ id: 'cfg-1', mode: 'whitelist' }, [BRASIL], []);
    const { result } = await montar();
    mocks.filas.geo_blocking_settings.push({ data: null, error: null });

    const avaliacao = await tentarTrocar(result, 'disabled');

    expect(avaliacao.permitido).toBe(true);
    expect(result.current.settings?.mode).toBe('disabled');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Modo alterado para: Desativado');
  });

  it('o motivo da recusa não revela os países das listas', async () => {
    enfileirarCiclo(SETTINGS, [BRASIL], [EUA, COREA]);
    const { result } = await montar({ country: 'KP' });

    const avaliacao = await tentarTrocar(result, 'blacklist');

    expect(avaliacao.motivo).toBe('blacklist-com-pais-do-admin');
    for (const revelador of ['Brasil', 'BR', 'Estados Unidos', 'US', 'Coreia do Norte', 'KP']) {
      expect(avaliacao.mensagem).not.toContain(revelador);
    }
  });
});
