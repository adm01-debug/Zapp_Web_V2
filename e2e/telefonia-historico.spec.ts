/**
 * T86 do plano de Telefonia — E2E do módulo `?view=voip`.
 *
 * NOME: nasceu como `e2e/telefonia.spec.ts`, mas no rebase sobre a dia de 09/10 esse
 * nome já estava ocupado por OUTRO cartão (Y11, discador/painel/estados sem
 * provedor) — arquivo e projeto `chromium-telefonia` distintos, mesma convenção de
 * nome. Renomeado para `telefonia-historico.spec.ts` para não colidir; as duas
 * specs continuam existindo e rodando, cada uma com seus próprios projetos.
 *
 * Até aqui nenhum spec de `e2e/` abria a Telefonia. Este cobre o essencial do
 * módulo, que é o que o aceite do item pede:
 *   1. abrir o módulo e ver os 5 KPIs do recorte (RPC `my_calls_kpi`);
 *   2. o histórico paginado no servidor: 8 linhas na página 1 e a página 2
 *      pedida com `p_offset=8` (RPC `search_my_calls`);
 *   3. os filtros da URL virando parâmetros da RPC e sobrevivendo ao reload;
 *   4. selecionar uma linha abrir o painel de detalhe, carregar a anotação da
 *      chamada e salvar pelo caminho real (`set_call_agent_notes`).
 *
 * HERMÉTICO POR CONSTRUÇÃO (mesma receita de e2e/onboarding-dispensar.spec.ts e
 * e2e/tarefas-quadro.spec.ts): sessão FALSA (`installFakeSession`), app shell
 * mockado (`mockAppShell`) e a rede real barrada (`bloquearRedeReal`, conferido
 * no afterEach). As três RPCs da tela são respondidas por fixtures DESTE
 * arquivo — nenhum banco, nenhuma credencial, nenhum dado de produção. Por isso
 * o spec roda deslogado, sem E2E_TEST_EMAIL/E2E_TEST_PASSWORD.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { FAKE_USER_ID, installFakeSession } from './fixtures/talkx-demo';

// Deslogado de propósito: a sessão vem de `installFakeSession`, nunca do
// storageState do projeto "setup" (que exigiria login real).
test.use({ storageState: { cookies: [], origins: [] } });

// O dev server frio compila o app inteiro na primeira navegação, bem mais que os
// 30s padrão do Playwright (mesmo ajuste de onboarding-dispensar.spec.ts).
test.setTimeout(120_000);

// ---------------------------------------------------------------------------
// Fixtures das RPCs de Telefonia (nada de banco real)
// ---------------------------------------------------------------------------

/** Itens por página do histórico — o mesmo PAGE_SIZE de src/hooks/calls/useMyCalls.ts. */
const PAGE_SIZE = 8;
/** Total de ligações do recorte: 9 => 2 páginas (8 + 1). */
const TOTAL = 9;

/** O que a RPC `my_calls_kpi` devolve para o recorte pedido. */
const KPI = {
  total: 9,
  answered: 5,
  missed_inbound: 2,
  inbound: 4,
  outbound: 5,
  avg_talk_seconds: 95,
};

/** Linha da RPC `search_my_calls` — mesmos campos do Return do banco gerado. */
interface Ligacao {
  id: string;
  agent_id: string;
  agent_notes: string;
  answered_at: string;
  answered_by: string;
  channel: string;
  contact_avatar_url: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  direction: string;
  end_reason: string;
  ended_at: string;
  notes: string;
  peer_name: string;
  peer_number: string;
  recording_status: string;
  started_at: string;
  status: string;
  talk_seconds: number;
  total_count: number;
}

function ligacao(indice: number, extra: Partial<Ligacao> = {}): Ligacao {
  const sufixo = String(indice).padStart(2, '0');
  const inicio = new Date(Date.UTC(2026, 9, 8, 12, 0, indice)).toISOString();
  const fim = new Date(Date.UTC(2026, 9, 8, 12, 3, indice)).toISOString();
  return {
    id: `11111111-0000-4000-8000-0000000000${sufixo}`,
    agent_id: FAKE_USER_ID,
    agent_notes: '',
    answered_at: inicio,
    answered_by: FAKE_USER_ID,
    channel: 'voip',
    contact_avatar_url: '',
    contact_id: `22222222-0000-4000-8000-0000000000${sufixo}`,
    contact_name: `Contato E2E ${indice}`,
    contact_phone: '',
    direction: 'outbound',
    end_reason: 'normal',
    ended_at: fim,
    notes: '',
    peer_name: '',
    peer_number: `1190000${String(indice).padStart(4, '0')}`,
    recording_status: 'none',
    started_at: inicio,
    status: 'ended',
    talk_seconds: 60 + indice,
    total_count: TOTAL,
    ...extra,
  };
}

/** Corpo com que `useMyCalls` chama a RPC; só os campos usados nas asserções. */
interface ConsultaMyCalls {
  p_limit?: number;
  p_offset?: number;
  p_channel?: string;
  p_direction?: string;
  p_result?: string;
  p_scope?: string;
  p_q?: string;
}

interface BackendFake {
  /** Todas as chamadas a `search_my_calls`, na ordem — a última é a consulta corrente. */
  consultas: ConsultaMyCalls[];
  /** Anotações gravadas por `set_call_agent_notes`. */
  anotacoes: { p_call_id?: string; p_notes?: string }[];
}

/**
 * Registre DEPOIS de `mockAppShell` — o Playwright casa as rotas na ordem INVERSA
 * de registro, então estas (as específicas da tela) têm prioridade sobre o
 * catch-all de RPC do app shell.
 */
async function mockTelefonia(page: Page, backend: BackendFake): Promise<void> {
  await page.route(/\/rest\/v1\/rpc\/search_my_calls/, (route: Route) => {
    const corpo = route.request().postDataJSON() as ConsultaMyCalls;
    backend.consultas.push(corpo);
    const offset = Number(corpo.p_offset ?? 0);
    // A RPC devolve um ARRAY e cada linha carrega o `total_count` da consulta
    // inteira; fora do intervalo (página 2 com 9 no total) volta só uma linha.
    const linhas = offset >= PAGE_SIZE
      ? [ligacao(TOTAL, { agent_notes: 'Anotação anterior' })]
      : Array.from({ length: PAGE_SIZE }, (_, i) => ligacao(i + 1, i === 0 ? { agent_notes: 'Anotação anterior' } : {}));
    return json(route, linhas);
  });

  await page.route(/\/rest\/v1\/rpc\/my_calls_kpi/, (route: Route) => json(route, [KPI]));

  await page.route(/\/rest\/v1\/rpc\/set_call_agent_notes/, (route: Route) => {
    backend.anotacoes.push(route.request().postDataJSON() as { p_call_id?: string; p_notes?: string });
    return json(route, null);
  });
}

// ---------------------------------------------------------------------------

test.describe('Telefonia (T86)', () => {
  let registro: Registro;
  let backend: BackendFake;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    backend = { consultas: [], anotacoes: [] };

    // O guarda vai PRIMEIRO: o Playwright casa as rotas na ordem inversa, então
    // ele é o último a valer — só pega o que nenhum mock específico cobriu.
    await bloquearRedeReal(page, registro);
    // O WebSocket do Realtime NÃO passa por `page.route`; sem esta linha o
    // navegador abriria um socket para o host real do Supabase ao montar a tela
    // (o KPI assina `calls` por Realtime). O canal simplesmente não conecta.
    await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
    await mockAppShell(page, registro);
    await installFakeSession(page);
    // Leituras que o catch-all de `mockAppShell` deixa de fora de propósito.
    await page.route(/\/rest\/v1\/contacts/, (route: Route) => json(route, []));
    await page.route(/\/rest\/v1\/messages/, (route: Route) => json(route, []));
    await mockTelefonia(page, backend);
  });

  test.afterEach(() => {
    // Nada escapou para a rede real durante o teste.
    expect(registro.redeBarrada).toEqual([]);
  });

  test('abre o módulo e mostra os 5 KPIs do período', async ({ page }) => {
    await page.goto('/?view=voip');

    await expect(page.getByTestId('tel-view')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Telefonia' })).toBeVisible();

    await expect(page.getByTestId('tel-kpi-card')).toHaveCount(5);
    // Os números são os da RPC (tiles na ordem: Total, Atendidas, Perdidas,
    // Realizadas, Tempo médio). Se a tela não lesse o dado, aqui viria 0/—.
    await expect(page.getByTestId('tel-kpi-value')).toHaveText(['9', '5', '2', '5', '1:35']);
    // A contagem do histórico é o `total_count` do servidor, não a página.
    await expect(page.getByTestId('tel-history-total')).toHaveText('9');
  });

  test('o histórico pagina no servidor: 8 linhas e a página 2 vem de p_offset=8', async ({ page }) => {
    await page.goto('/?view=voip');

    // A 1ª asserção de cada teste espera a view montar: com o dev server frio o
    // Playwright compila o app inteiro e os 5s padrão não bastam (mesmo motivo do
    // `test.setTimeout` acima).
    await expect(page.getByTestId('tel-view')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tel-row')).toHaveCount(PAGE_SIZE, { timeout: 20_000 });
    await expect(page.getByTestId('tel-pagination')).toBeVisible();

    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect(page).toHaveURL(/page=2/);
    // Página 2 = a nona ligação (o TOTAL é 9), buscada com o offset da página.
    await expect(page.getByTestId('tel-row')).toHaveCount(TOTAL - PAGE_SIZE);
    await expect.poll(() => backend.consultas.at(-1)?.p_offset).toBe(PAGE_SIZE);
  });

  test('os filtros da URL viram parâmetros da RPC e sobrevivem ao reload', async ({ page }) => {
    await page.goto('/?view=voip&channel=voip&dir=inbound&result=missed&q=ana&scope=all');

    await expect(page.getByTestId('tel-view')).toBeVisible({ timeout: 20_000 });
    // A consulta saiu com o recorte da URL (não com os defaults).
    await expect.poll(() => backend.consultas.at(-1)).toMatchObject({
      p_channel: 'voip',
      p_direction: 'inbound',
      p_result: 'missed',
      p_q: 'ana',
      p_scope: 'all',
    });

    // E a tela mostra o mesmo recorte.
    await expect(page.getByTestId('tel-history-search')).toHaveValue('ana');
    await expect(page.getByTestId('tel-channel-tab').filter({ hasText: 'VoIP' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('tel-history-direction')).toContainText('Recebidas');
    await expect(page.getByTestId('tel-history-result')).toContainText('Perdida');
    await expect(page.getByTestId('tel-history-scope')).toContainText('Todas as ligações');

    // O link compartilhado/reload mantém o recorte. Depois do reload a view
    // remonta do zero: sem esperar por ela, os 5s padrão não bastam no dev
    // server frio/sob carga (WebKit mediu >5s uma vez).
    await page.reload();
    await expect(page.getByTestId('tel-view')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tel-history-search')).toHaveValue('ana', { timeout: 20_000 });
    await expect.poll(() => backend.consultas.at(-1)?.p_q, { timeout: 20_000 }).toBe('ana');
  });

  test('selecionar uma ligação abre o painel de detalhe e a anotação salva', async ({ page }) => {
    await page.goto('/?view=voip');

    // Mesma razão dos outros testes: a 1ª asserção espera a view montar no dev server frio.
    await expect(page.getByTestId('tel-view')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tel-row').first()).toBeVisible({ timeout: 20_000 });

    // Antes de selecionar, o painel lateral é o discador.
    await expect(page.getByTestId('tel-new-call-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tel-selected-panel')).toHaveCount(0);

    await page.getByTestId('tel-row').first().click();

    // A seleção vive na URL (T36/T47): o painel abre lendo o histórico.
    await expect(page).toHaveURL(/call=/);
    await expect(page.getByTestId('tel-selected-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tel-selected-panel')).toContainText('Detalhe da chamada');
    await expect(page.getByTestId('tel-selected-panel')).toContainText('Contato E2E 1');

    // A anotação do agente vem do registro (`agent_notes`), não de metadado do provedor.
    const notes = page.getByTestId('tel-notes');
    await expect(notes).toHaveValue('Anotação anterior');

    await notes.fill('Ligação confirmou o pedido');
    await page.getByTestId('tel-save-notes').click();

    // O caminho real de gravação é a RPC, com o id da LINHA selecionada.
    await expect.poll(() => backend.anotacoes.at(-1)).toMatchObject({
      p_call_id: '11111111-0000-4000-8000-000000000001',
      p_notes: 'Ligação confirmou o pedido',
    });

    // Fechar o detalhe limpa o parâmetro da URL e volta o discador.
    await page.getByRole('button', { name: 'Fechar detalhe' }).click();
    await expect(page.getByTestId('tel-selected-panel')).toHaveCount(0);
    await expect(page.getByTestId('tel-new-call-panel')).toBeVisible();
  });
});
