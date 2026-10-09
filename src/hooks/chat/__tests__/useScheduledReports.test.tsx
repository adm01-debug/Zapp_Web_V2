import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/** Y07 — relatórios agendados (`useScheduledReports`): o stub registra insert/update/
 * delete e o `next_send_at` é conferido sob relógio congelado. */

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  erroLeitura: null as { message: string; code?: string } | null,
  erroEscrita: null as { message: string } | null,
  ops: [] as Array<{ tipo: string; payload?: unknown; eq?: { col: string; val: unknown }; tabela: string }>,
  chamadas: [] as Array<{ tipo: string; valor?: unknown; opts?: unknown }>,
  leituras: 0,
  ordens: [] as Array<{ col: string; opts?: unknown }>,
  freioEscrita: undefined as undefined | { release: () => void },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => {
  type Cadeia = {
    eq: (col: string, val: unknown) => Promise<unknown>;
    then?: (resolve: (v: unknown) => unknown) => unknown;
  };
  type Construtor = {
    select: () => Construtor;
    order: (col: string, opts?: unknown) => Construtor;
    insert: (payload: unknown) => Promise<unknown>;
    update: (payload: unknown) => Cadeia;
    delete: () => Cadeia;
    then: (resolve: (v: unknown) => unknown) => unknown;
  };

  const escrita = () =>
    h.freioEscrita ? new Promise<{ data: null; error: null }>((r) => {
      h.freioEscrita!.release = () => r({ data: null, error: null });
    }).then(() => ({ data: null, error: h.erroEscrita })) : Promise.resolve({ data: null, error: h.erroEscrita });

  const builder = (tabela: string) => {
    const b: Construtor = {
      select: () => b,
      order: (col: string, opts?: unknown) => { h.leituras += 1; h.ordens.push({ col, opts }); return b; },
      insert: (payload: unknown) => {
        h.ops.push({ tipo: 'insert', payload, tabela });
        return escrita();
      },
      update: (payload: unknown) => {
        const op = { tipo: 'update', payload, tabela } as { tipo: string; payload: unknown; tabela: string; eq?: { col: string; val: unknown } };
        h.ops.push(op);
        const chain: Cadeia = {
          eq: (col: string, val: unknown) => { op.eq = { col, val }; return escrita(); },
          then: (resolve: (v: unknown) => unknown) => escrita().then(resolve),
        };
        return chain;
      },
      delete: () => {
        const op = { tipo: 'delete', tabela } as { tipo: string; tabela: string; eq?: { col: string; val: unknown } };
        h.ops.push(op);
        return { eq: (col: string, val: unknown) => { op.eq = { col, val }; return escrita(); } };
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: h.rows, error: h.erroLeitura }).then(resolve),
    };
    return b;
  };

  return {
    supabase: {
      from: (tabela: string) => builder(tabela),
      functions: {
        invoke: (nome: string, opts?: unknown) => {
          h.chamadas.push({ tipo: nome, ...(opts as object) });
          return Promise.resolve({ data: null, error: h.erroEscrita });
        },
      },
    },
  };
});

import { toast } from 'sonner';
import { log } from '@/lib/logger';
import {
  useScheduledReports,
  REPORT_TYPES,
  FREQUENCIES,
  FORMATS,
  type ScheduledReport,
} from '@/hooks/chat/useScheduledReports';

const toastError = toast.error as ReturnType<typeof vi.fn>;
const toastSuccess = toast.success as ReturnType<typeof vi.fn>;
const toastInfo = toast.info as ReturnType<typeof vi.fn>;
const logError = log.error as ReturnType<typeof vi.fn>;

const RELATORIO: ScheduledReport = {
  id: 'rel-1',
  name: 'Resumo semanal',
  report_type: 'dashboard_summary',
  frequency: 'weekly',
  recipients: ['chefe@empresa.com'],
  format: 'pdf',
  is_active: true,
  next_send_at: '2026-10-12T11:00:00.000Z',
  last_sent_at: null,
  created_by: 'user-1',
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
};

function estado(rows: unknown[] = []) {
  h.rows = rows;
  h.erroLeitura = null;
  h.erroEscrita = null;
  h.ops = [];
  h.chamadas = [];
  h.leituras = 0;
  h.ordens = [];
  h.freioEscrita = undefined;
  vi.clearAllMocks();
}

async function montar() {
  const hook = renderHook(() => useScheduledReports());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

type HookMontado = { result: { current: ReturnType<typeof useScheduledReports> } };

async function preencher(hook: HookMontado, campos: Partial<ScheduledReport>, destinatarios: string[] = []) {
  await act(async () => hook.result.current.setEditingReport(campos));
  for (const email of destinatarios) {
    await act(async () => hook.result.current.setRecipientInput(email));
    await act(async () => hook.result.current.addRecipient());
  }
}

function ultimaEscrita(tipo: string) {
  return [...h.ops].reverse().find((o) => o.tipo === tipo);
}

describe('useScheduledReports — leitura', () => {
  beforeEach(() => estado());

  it('carrega os relatórios do mais recente para o mais antigo', async () => {
    estado([RELATORIO]);
    const { result } = await montar();

    expect(result.current.reports).toEqual([RELATORIO]);
    expect(result.current.isDialogOpen).toBe(false);
    expect(h.leituras).toBe(1);
    // "do mais recente para o mais antigo" é a ordenação PEDIDA ao banco:
    // coluna `created_at` em ordem decrescente (useScheduledReports.ts:54).
    expect(h.ordens).toEqual([{ col: 'created_at', opts: { ascending: false } }]);
  });

  it('erro de leitura (RLS/rede) avisa o usuário e encerra o carregamento', async () => {
    estado();
    h.erroLeitura = { message: 'permission denied', code: '42501' };

    const { result } = await montar();
    expect(toastError).toHaveBeenCalledWith('Erro ao carregar relatórios agendados');
    expect(result.current.reports).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(logError).toHaveBeenCalled();
  });
});

describe('useScheduledReports — destinatários', () => {
  beforeEach(() => estado());

  it('aceita e-mail válido, sem espaços em volta, e limpa o campo', async () => {
    const hook = await montar();

    await act(async () => hook.result.current.setRecipientInput('  chefe@empresa.com  '));
    await act(async () => hook.result.current.addRecipient());

    expect(hook.result.current.editingReport.recipients).toEqual(['chefe@empresa.com']);
    expect(hook.result.current.recipientInput).toBe('');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('recusa entrada vazia ou sem arroba', async () => {
    const hook = await montar();

    for (const entrada of ['', '   ', 'sem-arroba']) {
      await act(async () => hook.result.current.setRecipientInput(entrada));
      await act(async () => hook.result.current.addRecipient());
    }

    expect(toastError).toHaveBeenCalledTimes(3);
    expect(toastError).toHaveBeenCalledWith('Digite um email válido');
    expect(hook.result.current.editingReport.recipients ?? []).toEqual([]);
  });

  it('não duplica o mesmo destinatário', async () => {
    const hook = await montar();

    await act(async () => hook.result.current.setRecipientInput('a@b.com'));
    await act(async () => hook.result.current.addRecipient());
    await act(async () => hook.result.current.setRecipientInput('a@b.com'));
    await act(async () => hook.result.current.addRecipient());

    expect(hook.result.current.editingReport.recipients).toEqual(['a@b.com']);
    expect(toastError).toHaveBeenCalledWith('Email já adicionado');
  });

  it('remove apenas o destinatário pedido', async () => {
    const hook = await montar();

    await preencher(hook, { name: 'x' }, ['a@b.com', 'c@d.com']);
    await act(async () => hook.result.current.removeRecipient('a@b.com'));

    expect(hook.result.current.editingReport.recipients).toEqual(['c@d.com']);
  });
});

describe('useScheduledReports — gravação', () => {
  beforeEach(() => estado());

  it('sem nome não grava nada e avisa', async () => {
    const hook = await montar();
    await preencher(hook, { name: '   ' }, ['a@b.com']);

    await act(async () => { await hook.result.current.handleSave(); });

    expect(toastError).toHaveBeenCalledWith('Nome é obrigatório');
    expect(ultimaEscrita('insert')).toBeUndefined();
    expect(ultimaEscrita('update')).toBeUndefined();
    expect(hook.result.current.isDialogOpen).toBe(false);
  });

  it('sem destinatário não grava nada e avisa', async () => {
    const hook = await montar();
    await preencher(hook, { name: 'Resumo' }, []);

    await act(async () => { await hook.result.current.handleSave(); });

    expect(toastError).toHaveBeenCalledWith('Adicione pelo menos um destinatário');
    expect(ultimaEscrita('insert')).toBeUndefined();
  });

  it('cria o agendamento com os padrões e o criador do usuário logado', async () => {
    const hook = await montar();
    await preencher(hook, { name: '  Resumo diário  ', recipients: ['a@b.com'] });

    await act(async () => { await hook.result.current.handleSave(); });

    const insert = ultimaEscrita('insert');
    expect(insert?.payload).toMatchObject({
      name: 'Resumo diário',
      report_type: 'dashboard_summary',
      frequency: 'weekly',
      recipients: ['a@b.com'],
      format: 'pdf',
      is_active: true,
      created_by: 'user-1',
    });
    expect(typeof (insert?.payload as { next_send_at?: string }).next_send_at).toBe('string');
    expect(toastSuccess).toHaveBeenCalledWith('Relatório agendado!');
    expect(hook.result.current.isDialogOpen).toBe(false);
    expect(hook.result.current.editingReport.recipients).toEqual([]);
  });

  it('atualiza o agendamento existente pela linha certa', async () => {
    estado([RELATORIO]);
    const hook = await montar();

    await act(async () => hook.result.current.openEditDialog(RELATORIO));
    expect(hook.result.current.isDialogOpen).toBe(true);

    await act(async () => hook.result.current.setEditingReport({ ...RELATORIO, name: 'Resumo mensal', frequency: 'monthly' }));
    await act(async () => { await hook.result.current.handleSave(); });

    const update = ultimaEscrita('update');
    expect(update?.eq).toEqual({ col: 'id', val: 'rel-1' });
    expect(update?.payload).toMatchObject({ name: 'Resumo mensal', frequency: 'monthly', recipients: ['chefe@empresa.com'] });
    expect(toastSuccess).toHaveBeenCalledWith('Relatório atualizado!');
    expect(ultimaEscrita('insert')).toBeUndefined();
  });

  it('relê a lista depois de gravar', async () => {
    const hook = await montar();
    const leiturasAntes = h.leituras;

    await preencher(hook, { name: 'Resumo', recipients: ['a@b.com'] });
    await act(async () => { await hook.result.current.handleSave(); });

    await waitFor(() => expect(h.leituras).toBeGreaterThan(leiturasAntes));
  });

  it('erro ao gravar avisa, não fecha o diálogo aberto e libera o botão', async () => {
    const hook = await montar();
    await act(async () => hook.result.current.openCreateDialog());
    await preencher(hook, { name: 'Resumo', recipients: ['a@b.com'] });
    h.erroEscrita = { message: 'new row violates row-level security policy' };

    await act(async () => { await hook.result.current.handleSave(); });

    expect(toastError).toHaveBeenCalledWith('Erro ao salvar relatório');
    expect(hook.result.current.isDialogOpen).toBe(true);
    expect(hook.result.current.isSaving).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('sinaliza "salvando" enquanto a gravação não responde', async () => {
    const hook = await montar();
    await preencher(hook, { name: 'Resumo', recipients: ['a@b.com'] }, []);
    h.freioEscrita = { release: () => {} };

    let salvar: Promise<void> | undefined;
    await act(async () => { salvar = hook.result.current.handleSave(); });
    await waitFor(() => expect(hook.result.current.isSaving).toBe(true));

    await act(async () => { h.freioEscrita?.release(); await salvar; });
    expect(hook.result.current.isSaving).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith('Relatório agendado!');
  });

  it('remover exclui a linha pedida e relê a lista', async () => {
    estado([RELATORIO]);
    const hook = await montar();
    const leiturasAntes = h.leituras;

    await act(async () => { await hook.result.current.handleDelete('rel-1'); });

    const del = ultimaEscrita('delete');
    expect(del?.eq).toEqual({ col: 'id', val: 'rel-1' });
    expect(toastSuccess).toHaveBeenCalledWith('Relatório removido!');
    // "relê a lista": a releitura é disparada depois do delete (handleDelete →
    // fetchReports), então a leitura nova chega em um tick seguinte.
    await waitFor(() => expect(h.leituras).toBeGreaterThan(leiturasAntes));
  });

  it('erro ao remover avisa o usuário', async () => {
    estado([RELATORIO]);
    const hook = await montar();
    h.erroEscrita = { message: 'permission denied' };

    await act(async () => { await hook.result.current.handleDelete('rel-1'); });

    expect(toastError).toHaveBeenCalledWith('Erro ao remover relatório');
    expect(logError).toHaveBeenCalled();
  });

  it('ativar/desativar grava só o campo is_active na linha pedida', async () => {
    estado([RELATORIO]);
    const hook = await montar();

    await act(async () => { await hook.result.current.toggleActive('rel-1', false); });

    const update = ultimaEscrita('update');
    expect(update?.payload).toEqual({ is_active: false });
    expect(update?.eq).toEqual({ col: 'id', val: 'rel-1' });
  });

  it.todo(
    'falha ao ativar/desativar não avisa o usuário (useScheduledReports.ts: toggleActive engole o erro, diferente dos outros handlers) — candidato a cartão de correção',
  );

  it('enviar agora chama a Edge Function com o id e avisa o começo e o fim', async () => {
    estado([RELATORIO]);
    const hook = await montar();

    await act(async () => { await hook.result.current.handleSendNow(RELATORIO); });

    expect(toastInfo).toHaveBeenCalledWith('Enviando relatório...');
    expect(h.chamadas[0]).toEqual({ tipo: 'send-scheduled-report', body: { reportId: 'rel-1' } });
    expect(toastSuccess).toHaveBeenCalledWith('Relatório enviado!');
  });

  it('falha ao enviar avisa o usuário e não reporta sucesso', async () => {
    estado([RELATORIO]);
    const hook = await montar();
    h.erroEscrita = { message: 'Function returned 500' };

    await act(async () => { await hook.result.current.handleSendNow(RELATORIO); });

    expect(toastError).toHaveBeenCalledWith('Erro ao enviar relatório');
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('useScheduledReports — diálogo', () => {
  beforeEach(() => estado());

  it('abrir para criar parte de um formulário limpo com os padrões', async () => {
    estado([RELATORIO]);
    const hook = await montar();

    await act(async () => hook.result.current.openEditDialog(RELATORIO));
    await act(async () => hook.result.current.setRecipientInput('rascunho@b.com'));
    await act(async () => hook.result.current.openCreateDialog());

    expect(hook.result.current.isDialogOpen).toBe(true);
    expect(hook.result.current.editingReport).toMatchObject({
      name: '',
      report_type: 'dashboard_summary',
      frequency: 'weekly',
      recipients: [],
      format: 'pdf',
      is_active: true,
    });
    expect(hook.result.current.editingReport.id).toBeUndefined();
    expect(hook.result.current.recipientInput).toBe('');
  });

  it('abrir para editar carrega o relatório escolhido', async () => {
    estado([RELATORIO]);
    const hook = await montar();

    await act(async () => hook.result.current.openEditDialog(RELATORIO));

    expect(hook.result.current.editingReport).toEqual(RELATORIO);
    expect(hook.result.current.isDialogOpen).toBe(true);
  });
});

describe('useScheduledReports — agendamento da próxima execução', () => {
  beforeEach(() => {
    estado();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => { vi.useRealTimers(); });

  async function proximoEnvioEm(agoraLocal: Date, frequency: string) {
    vi.setSystemTime(agoraLocal);
    const hook = await montar();
    await preencher(hook, { name: 'Resumo', recipients: ['a@b.com'], frequency }, []);
    await act(async () => { await hook.result.current.handleSave(); });
    const payload = ultimaEscrita('insert')?.payload as { next_send_at: string };
    return new Date(payload.next_send_at);
  }

  it('diário às 8h do dia seguinte', async () => {
    const proximo = await proximoEnvioEm(new Date(2026, 9, 7, 17, 30, 0), 'daily');
    expect(proximo.getTime()).toBe(new Date(2026, 9, 8, 8, 0, 0).getTime());
  });

  it('semanal na próxima segunda-feira às 8h', async () => {
    const proximo = await proximoEnvioEm(new Date(2026, 9, 7, 17, 30, 0), 'weekly'); // quarta
    expect(proximo.getDay()).toBe(1);
    expect(proximo.getHours()).toBe(8);
    expect(proximo.getTime()).toBe(new Date(2026, 9, 12, 8, 0, 0).getTime());
  });

  it('semanal agendado numa segunda vai para a segunda seguinte (nunca "hoje às 8h")', async () => {
    const proximo = await proximoEnvioEm(new Date(2026, 9, 12, 17, 30, 0), 'weekly'); // segunda
    expect(proximo.getDay()).toBe(1);
    expect(proximo.getTime()).toBe(new Date(2026, 9, 19, 8, 0, 0).getTime());
  });

  it('mensal no primeiro dia do mês seguinte às 8h', async () => {
    const proximo = await proximoEnvioEm(new Date(2026, 9, 7, 17, 30, 0), 'monthly');
    expect(proximo.getDate()).toBe(1);
    expect(proximo.getHours()).toBe(8);
    expect(proximo.getTime()).toBe(new Date(2026, 10, 1, 8, 0, 0).getTime());
  });

  it('frequência desconhecida mantém o instante atual como próximo envio', async () => {
    const agora = new Date(2026, 9, 7, 17, 30, 0);
    const proximo = await proximoEnvioEm(agora, 'a_cada_minuto');
    // Não é "amanhã às 8h": o valor fica no instante corrente.
    expect(proximo.getDate()).toBe(agora.getDate());
    expect(proximo.getHours()).toBe(agora.getHours());
    expect(Math.abs(proximo.getTime() - agora.getTime())).toBeLessThan(1000);
  });
});

describe('useScheduledReports — catálogos do formulário', () => {
  it('tipos, frequências e formatos são os que o banco/Edge e o agendador conhecem', () => {
    expect(REPORT_TYPES.map((t) => t.value)).toEqual([
      'dashboard_summary',
      'agent_performance',
      'conversation_analytics',
      'sla_compliance',
    ]);
    expect(REPORT_TYPES.every((t) => t.label.length > 0 && t.description.length > 0 && t.icon.length > 0)).toBe(true);
    expect(FREQUENCIES.map((f) => f.value)).toEqual(['daily', 'weekly', 'monthly']);
    expect(FREQUENCIES.map((f) => f.description)).toEqual([
      'Todos os dias às 8h',
      'Toda segunda-feira às 8h',
      'Primeiro dia do mês às 8h',
    ]);
    expect(FORMATS.map((f) => f.value)).toEqual(['pdf', 'excel']);
  });
});
