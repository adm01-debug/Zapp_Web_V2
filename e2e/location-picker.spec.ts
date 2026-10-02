import { test, expect, type Page } from '@playwright/test';
import { installFakeSession } from './fixtures/talkx-demo';
import {
  json, mockAppShell, mockMapboxSearchbox, querObjetoUnico, type Registro,
} from './fixtures/mapa-mocks';

/**
 * E71 — E2E do picker de localização do inbox ("Escolher no Mapa").
 *
 * Mapeamento: `e2e/location-picker.spec.ts` não existia (docs/mapa/mapeamento-fase7.md,
 * linha do E71). A spec abre a conversa do contato fixo `04dff4dc-…` ("[E2E] Contato de
 * teste"), abre "Compartilhar localização" (`Enviar localização` no menu "⋯ Mais" desta
 * versão da UI — ver DIVERGÊNCIAS abaixo), digita "avenida paulista 1000", espera o
 * `role=listbox`, seleciona com `ArrowDown` + `Enter` e confere o cartão de confirmação
 * com "Paulista" — SEM enviar a mensagem (nenhum WhatsApp real é gerado).
 *
 * AUTENTICAÇÃO (sem secret): reusa `installFakeSession` de `e2e/fixtures/talkx-demo.ts`
 * (a mesma sessão Supabase falsa do projeto visual do Talk X). Com ela o app shell monta
 * sem login real; o REST do Supabase é interceptado por `mockSupabaseBackend`. É por isso
 * que a spec roda determinística em `chromium-authenticated` — os dados não vêm da
 * produção (nenhum token, nenhuma conta, nenhuma gravação). O token do Mapbox também é
 * mockado (edge `get-mapbox-token`), então a spec nunca toca a API real.
 *
 * REDE DA MAPBOX: interceptada com `page.route` sobre o padrão glob do path
 * `searchbox/v1` (qualquer host, qualquer subpath) e as fixtures de E68
 * (`src/lib/__fixtures__/mapbox/`), exatamente como pede o texto da etapa. O mock de
 * identidade/RPCs/edge e o da Mapbox vivem em `e2e/fixtures/mapa-mocks.ts`, compartilhados
 * com a spec do E73 (cadastro de contato) — extraídos daqui sem mudar comportamento.
 */

const CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001';
const NOW = '2026-10-02T12:00:00.000Z';

// Contato fixo E2E (mesmo id de `e2e/fixtures/e2e-contact.ts`) — row completa do tipo
// `contacts.Row`, para o InboxFilters/list do inbox renderizar o item.
const CONTATO_E2E = {
  id: CONTACT_ID, name: '[E2E] Contato de teste - nao apagar', nickname: null,
  phone: '5511999999999', email: null, avatar_url: null, company: null, job_title: null,
  contact_type: 'individual', conversation_status: 'open', conversation_status_changed_at: NOW,
  assigned_to: FAKE_USER_ID, queue_id: null, tags: [], notes: null, created_at: NOW,
  updated_at: NOW, deleted_at: null, is_lid_legacy: false, channel_type: 'whatsapp',
  channel_connection_id: null, whatsapp_connection_id: null, lead_origin: null, lead_score: null,
  risk_score: null, ai_priority: null, ai_sentiment: null, ai_projection_analysis_id: null,
  ai_projection_updated_at: null, avatar_fetch_attempted_at: null, consent_status: null,
  group_category: null, address: null, address_number: null, city: null, state: null,
  neighborhood: null, postal_code: null, latitude: null, longitude: null, surname: null,
  conversation_sla: null,
};

const MENSAGEM_E2E = {
  id: '11111111-1111-4111-8111-111111111111', contact_id: CONTACT_ID, sender: 'contact',
  content: '[E2E] mensagem de fixture', message_type: 'text', created_at: NOW,
  is_read: false, external_id: null,
};

/**
 * Dados do módulo do inbox: contato fixo e mensagem de fixture. Identidade, RPCs do
 * shell e edge ficam em `mockAppShell` (`e2e/fixtures/mapa-mocks.ts`), chamado antes.
 */
async function mockSupabaseBackend(page: Page, registro: Registro): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => {
    if (route.request().method() !== 'GET') {
      registro.writesApp.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return json(route, { message: 'blocked' }, 403);
    }
    return json(route, querObjetoUnico(route) ? CONTATO_E2E : [CONTATO_E2E]);
  });

  await page.route(/\/rest\/v1\/messages/, (route) => {
    // Enviar localização gravaria uma mensagem: registrar escrita e falhar o teste adiante.
    if (route.request().method() !== 'GET') {
      registro.writesApp.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return json(route, { message: 'blocked' }, 403);
    }
    return json(route, [MENSAGEM_E2E]);
  });
}

test.describe('E71 · picker de localização (combobox de endereço, sem enviar)', () => {
  test('digita, escolhe por teclado e confirma o cartão — sem gerar WhatsApp', async ({ page }) => {
    const registro: Registro = { writesApp: [], mapbox: [] };

    // Mocks ANTES da navegação (precisam estar registrados quando o app faz as chamadas).

    await mockAppShell(page, registro);
    await mockSupabaseBackend(page, registro);
    await mockMapboxSearchbox(page, registro);
    await installFakeSession(page);

    // Abre a conversa do contato fixo (o único que o usuário E2E enxerga).
    await page.goto('/');
    const conversa = page.locator('[data-testid="conversation-item"]').filter({ hasText: '[E2E]' });
    await expect(conversa).toBeVisible();
    await conversa.click();

    // Abre o picker. DIVERGÊNCIA: a etapa fala em "Compartilhar localização", mas o
    // ChatPanel renderiza ChatInputArea → QuickActionChips → popover "⋯ Mais"
    // (data-testid="chip-more") → TertiaryToolsMenu, cujo botão tem aria-label
    // "Enviar localização". O botão "Compartilhar localização" (InputExtraTools) só é
    // montado por ChatMessageInput, que o ChatPanel não usa.
    await page.getByTestId('chip-more').click();
    await page.getByRole('button', { name: 'Enviar localização' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('Compartilhar Localização')).toBeVisible();

    // O combobox de endereço só existe na aba "Escolher no Mapa".
    await dialogo.getByRole('tab', { name: /Escolher no Mapa/ }).click();
    const combo = dialogo.getByRole('combobox');
    await combo.click();
    await combo.fill('avenida paulista 1000');

    // Lista de sugestões veio da Mapbox interceptada (role=listbox, passo 1 da etapa).
    const listbox = dialogo.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const opcao = dialogo.getByRole('option', { name: /Avenida Paulista, 1000/ });
    await expect(opcao).toBeVisible();

    // ArrowDown destaca a primeira opção; Enter a seleciona (passo 1 da etapa).
    await combo.press('ArrowDown');
    await expect(opcao).toHaveAttribute('aria-selected', 'true');
    await combo.press('Enter');

    // Cartão de confirmação com "Paulista" (o nome vem do /retrieve interceptado).
    await expect(dialogo.getByText('Avenida Paulista, 1000', { exact: true })).toBeVisible();

    // Passo 2 da etapa: NÃO enviar. Fecha o diálogo pelo "Cancelar".
    await expect(dialogo.getByRole('button', { name: 'Enviar Localização' })).toBeEnabled();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();

    // Prova de que nada foi enviado: nenhum POST (insert) em /rest/v1/messages —
    // o único PATCH que aparece é o `is_read` do markAsRead ao abrir a conversa.
    expect(registro.writesApp.filter((w) => w.startsWith('POST /rest/v1/messages'))).toEqual([]);

    // Passo 3 da etapa: a rota da Mapbox foi de fato exercitada e interceptada.
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/suggest')).length).toBeGreaterThan(0);
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/retrieve/')).length).toBeGreaterThan(0);
    expect(registro.mapbox.every((u) => u.startsWith('https://api.mapbox.com/'))).toBe(true);
  });

  // E72 — mesmo setup do E71, com o `/suggest` devolvendo 500. O caso prova o FALLBACK:
  // `/suggest` cai por rota (http → FORWARD_FALLBACK_KINDS) e o `/forward` resolve (200),
  // então a lista NÃO fica vazia nem em erro — mostra o resultado do forward e o Enter
  // seleciona. É a diferença de um caso "só /suggest 200": aqui o caminho exercitado é a
  // cascata de fallback, não a busca normal.
  test('E72 · /suggest 500 → lista mostra o resultado do /forward e Enter seleciona', async ({ page }) => {
    const registro: Registro = { writesApp: [], mapbox: [] };

    await mockAppShell(page, registro);
    await mockSupabaseBackend(page, registro);
    // Única diferença do E71: `failSuggest` responde 500 no /suggest (inline, sem fixture).
    await mockMapboxSearchbox(page, registro, { failSuggest: true });
    await installFakeSession(page);

    await page.goto('/');
    const conversa = page.locator('[data-testid="conversation-item"]').filter({ hasText: '[E2E]' });
    await expect(conversa).toBeVisible();
    await conversa.click();

    await page.getByTestId('chip-more').click();
    await page.getByRole('button', { name: 'Enviar localização' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('Compartilhar Localização')).toBeVisible();

    await dialogo.getByRole('tab', { name: /Escolher no Mapa/ }).click();
    const combo = dialogo.getByRole('combobox');
    await combo.click();
    await combo.fill('avenida paulista 1000');

    // O /suggest responde 500, mas a lista aparece com o resultado do /forward (fallback):
    // se o fallback não existisse, aqui seria o estado de erro "Falha ao buscar sugestões.".
    const listbox = dialogo.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const opcao = dialogo.getByRole('option', { name: /Avenida Paulista, 1000/ });
    await expect(opcao).toBeVisible();

    // Enter seleciona o item do forward (passo 1 da etapa). A sugestão do /forward já traz
    // coordenada, então a seleção NÃO dispara um /retrieve.
    await combo.press('ArrowDown');
    await expect(opcao).toHaveAttribute('aria-selected', 'true');
    await combo.press('Enter');

    // Cartão de confirmação com o nome vindo do próprio /forward.
    await expect(dialogo.getByText('Avenida Paulista, 1000', { exact: true })).toBeVisible();

    // Não envia: fecha sem gerar WhatsApp (mesma prova do E71).
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
    expect(registro.writesApp.filter((w) => w.startsWith('POST /rest/v1/messages'))).toEqual([]);

    // Prova do fallback: o /suggest foi chamado (e respondeu 500), o /forward foi chamado e
    // alimentou a lista, e NENHUM /retrieve ocorreu — a coordenada veio junto do /forward (E15).
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/suggest')).length).toBeGreaterThan(0);
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/forward')).length).toBeGreaterThan(0);
    expect(registro.mapbox.filter((u) => u.includes('/searchbox/v1/retrieve/')).length).toBe(0);
  });
});
