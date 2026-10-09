import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * X184 / TL-169 — card "Atividade recente" do rail da Supressão.
 *
 * A lacuna: o rail não tinha o card (`grep -n "Atividade" TalkXSuppression` = 0) e
 * nenhum evento era lido. O card passa a ler a TRILHA DE SUPRESSÃO dos eventos de
 * entidade de `talkx_campaign_events` (`suppression_add/remove/update/…`, com
 * `campaign_id` nulo, `entity_id` = linha de `talkx_blacklist`) — os 5 últimos no
 * rail, o histórico paginado no "Ver todas".
 *
 * O teste monta a tela de PRODUÇÃO (`TalkXSuppression`) e responde o servidor pelo
 * cliente mockado: o que se prova é o que o usuário vê e o que a tela PEDE ao
 * servidor (tipos, fatia da página e contagem exata).
 */

const cenario = vi.hoisted(() => ({
  /** Eventos da trilha, já na ordem que o servidor devolve (mais recente primeiro). */
  eventos: [] as Array<Record<string, unknown>>,
  /** Contagem exata que o servidor informa no cabeçalho. */
  total: 0,
  erro: null as Error | null,
  /** Cada leitura da trilha: filtro de tipo, fatia pedida. */
  leituras: [] as Array<{ tipos: unknown; tipo: unknown; from: number; to: number }>,
  /** Linhas de `talkx_blacklist` usadas para achar o contato do evento. */
  linhas: [] as Array<Record<string, unknown>>,
  contatos: [] as Array<Record<string, unknown>>,
  /** Contatos oferecidos pelo modal "Adicionar contato". */
  contatosDisponiveis: [] as Array<Record<string, unknown>>,
  insercoes: [] as Array<Record<string, unknown>>,
}));

/** Cadeia da trilha: `select().in().eq().order().order().range()`. */
function cadeiaTrilha() {
  const self: Record<string, unknown> = {};
  const estado: { tipos: unknown; tipo: unknown } = { tipos: null, tipo: null };
  self.select = () => self;
  self.in = (_coluna: string, valores: unknown) => { estado.tipos = valores; return self; };
  self.eq = (_coluna: string, valor: unknown) => { estado.tipo = valor; return self; };
  self.order = () => self;
  self.range = (from: number, to: number) => {
    cenario.leituras.push({ ...estado, from, to });
    if (cenario.erro) return Promise.resolve({ data: null, error: cenario.erro, count: null });
    return Promise.resolve({
      data: cenario.eventos.slice(from, to + 1), error: null, count: cenario.total,
    });
  };
  return self;
}

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (tabela: string) => {
    if (tabela === 'talkx_campaign_events') return cadeiaTrilha();
    if (tabela === 'talkx_blacklist') {
      return {
        select: () => ({ in: () => Promise.resolve({ data: cenario.linhas, error: null }) }),
        insert: (linha: Record<string, unknown>) => {
          cenario.insercoes.push(linha);
          return Promise.resolve({ error: null });
        },
      };
    }
    // contacts — resolução do contato do evento
    return { select: () => ({ in: () => Promise.resolve({ data: cenario.contatos, error: null }) }) };
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  /** Cadeia "thenable": qualquer método encadeado pode terminar a consulta. */
  const cadeia = (tabela: string) => {
    const self: Record<string, unknown> = {};
    const resposta = () => Promise.resolve({
      data: tabela === 'contacts' ? cenario.contatosDisponiveis : [], error: null,
    });
    self.select = () => self;
    self.is = () => self;
    self.eq = () => self;
    self.not = () => self;
    self.or = () => self;
    self.order = () => self;
    self.limit = () => self;
    self.update = () => self;
    self.delete = () => self;
    self.single = () => resposta();
    self.maybeSingle = () => resposta();
    self.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => resposta().then(ok, err);
    return self;
  };
  return { supabase: { from: (tabela: string) => cadeia(tabela) } };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1', full_name: 'QA' }, user: { id: 'auth-1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '../TalkXSuppression';

function montar(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const agora = new Date();
const hoje = new Date(new Date(agora).setHours(14, 32, 0, 0)).toISOString();
const ontem = new Date(new Date(agora.getTime() - 86_400_000).setHours(16, 8, 0, 0)).toISOString();
const antigo = new Date(new Date(agora.getTime() - 20 * 86_400_000).setHours(11, 43, 0, 0)).toISOString();

const contatoDe = (i: number, email: string | null, phone: string) => ({ id: `c${i}`, email, phone });

/** Uma trilha com os 5 tipos de atividade, um por item. */
function trilhaCompleta() {
  cenario.eventos = [
    { id: 'e1', event_type: 'suppression_add', message: null, entity_id: 'b1', created_at: hoje, actor: { name: 'Ana' } },
    { id: 'e2', event_type: 'suppression_remove', message: null, entity_id: 'b2', created_at: ontem, actor: { name: 'Ana' } },
    { id: 'e3', event_type: 'suppression_update', message: null, entity_id: 'b3', created_at: antigo, actor: { name: 'Bruno' } },
    { id: 'e4', event_type: 'suppression_import', message: '12', entity_id: null, created_at: antigo, actor: { name: 'Ana' } },
    { id: 'e5', event_type: 'suppression_export', message: null, entity_id: null, created_at: antigo, actor: { name: 'Ana' } },
  ];
  cenario.total = 5;
  cenario.linhas = [
    { id: 'b1', contact_id: 'c1', phone: '5511987654321' },
    { id: 'b2', contact_id: null, phone: '5511911112222' },
    { id: 'b3', contact_id: 'c3', phone: null },
  ];
  cenario.contatos = [contatoDe(1, 'ana@exemplo.com', '5511987654321'), contatoDe(3, null, '5511933334444')];
}

beforeEach(() => {
  cenario.eventos = [];
  cenario.total = 0;
  cenario.erro = null;
  cenario.leituras = [];
  cenario.linhas = [];
  cenario.contatos = [];
  cenario.contatosDisponiveis = [];
  cenario.insercoes = [];
});

describe('X184 · Atividade recente da supressão (TalkXSuppression)', () => {
  it('rail mostra os 5 últimos itens: título por tipo, contato e data relativa', async () => {
    trilhaCompleta();
    montar(<TalkXSuppression />);

    await screen.findByText('Contato adicionado à lista');
    // Título por tipo, no vocabulário da tela.
    expect(screen.getByText('Contato removido da lista')).toBeTruthy();
    expect(screen.getByText('Motivo atualizado')).toBeTruthy();
    expect(screen.getByText('12 contatos importados')).toBeTruthy();
    expect(screen.getByText('Lista exportada')).toBeTruthy();
    // Contato: e-mail quando existe; telefone quando não há e-mail (contato sem
    // e-mail e supressão de telefone avulso, que não tem contato nenhum).
    expect(screen.getByText('ana@exemplo.com')).toBeTruthy();
    expect(screen.getByText('+5511911112222')).toBeTruthy();
    expect(screen.getByText('+5511933334444')).toBeTruthy();
    // Data relativa: hoje, ontem e, antes disso, dia + mês.
    expect(screen.getByText('Hoje, 14:32')).toBeTruthy();
    expect(screen.getByText('Ontem, 16:08')).toBeTruthy();
    expect(screen.getAllByText(/^\d{1,2} [a-zç]{3}, 11:43$/)).toHaveLength(3);
  });

  it('a leitura da trilha pede os tipos de supressão e só a fatia da página', async () => {
    trilhaCompleta();
    montar(<TalkXSuppression />);
    await screen.findByText('Contato adicionado à lista');

    expect(cenario.leituras).toHaveLength(1);
    expect(cenario.leituras[0].tipos).toEqual([
      'suppression_add', 'suppression_remove', 'suppression_update', 'suppression_import', 'suppression_export',
    ]);
    expect(cenario.leituras[0]).toMatchObject({ from: 0, to: 4, tipo: null });
  });

  it('trilha vazia: "Nenhuma atividade ainda", sem paginação', async () => {
    montar(<TalkXSuppression />);
    await screen.findByText('Nenhuma atividade ainda');
    expect(screen.getByText('Atividade recente')).toBeTruthy();
    expect(screen.queryByText(/Mostrando/)).toBeNull();
  });

  it('erro na trilha: mostra o erro e NÃO o vazio do card', async () => {
    cenario.erro = new Error('trilha fora do ar X184');
    montar(<TalkXSuppression />);
    await screen.findByText('Não foi possível carregar a atividade da lista.');
    expect(screen.queryByText('Nenhuma atividade ainda')).toBeNull();
  });

  it('"Ver todas" abre o histórico paginado e a página 2 pede a fatia seguinte', async () => {
    cenario.eventos = Array.from({ length: 45 }, (_, i) => ({
      id: `m${i + 1}`,
      event_type: i % 2 === 0 ? 'suppression_add' : 'suppression_remove',
      message: null,
      entity_id: `b${i + 1}`,
      created_at: new Date(agora.getTime() - (i + 1) * 3_600_000).toISOString(),
      actor: { name: 'Ana' },
    }));
    cenario.total = 45;
    cenario.linhas = Array.from({ length: 45 }, (_, i) => ({ id: `b${i + 1}`, contact_id: `c${i + 1}`, phone: null }));
    cenario.contatos = Array.from({ length: 45 }, (_, i) => contatoDe(i + 1, `contato${i + 1}@exemplo.com`, '5511900000000'));

    montar(<TalkXSuppression />);
    await screen.findByText('contato1@exemplo.com');

    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    // O total vem da CONTAGEM do servidor, não do tamanho da página.
    await screen.findByText('Mostrando 1 a 20 de 45 atividades');
    expect(cenario.leituras[1]).toMatchObject({ from: 0, to: 19 });
    const noHistorico = () => within(screen.getByRole('dialog'));
    expect(noHistorico().getByText('contato20@exemplo.com')).toBeTruthy();
    expect(noHistorico().queryByText('contato21@exemplo.com')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await screen.findByText('Mostrando 21 a 40 de 45 atividades');
    await waitFor(() => expect(cenario.leituras[2]).toMatchObject({ from: 20, to: 39 }));
    expect(noHistorico().getByText('contato21@exemplo.com')).toBeTruthy();
    expect(noHistorico().queryByText('contato1@exemplo.com')).toBeNull();
  });

  it('mutação concluída na tela recarrega o card', async () => {
    trilhaCompleta();
    cenario.contatosDisponiveis = [{ id: 'c9', name: 'Contato Novo', phone: '5511955556666', company: null }];
    montar(<TalkXSuppression />);
    await screen.findByText('Contato adicionado à lista');
    expect(cenario.leituras).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar contato/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Contato Novo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bloquear/ }));

    await waitFor(() => expect(cenario.insercoes).toHaveLength(1));
    expect(cenario.insercoes[0]).toMatchObject({ contact_id: 'c9', origin: 'manual' });
    // A trilha é relida depois da mutação terminar: o card não fica com o dado velho.
    await waitFor(() => expect(cenario.leituras).toHaveLength(2));
  });
});
