import { test, expect, type Page } from '@playwright/test';
import { installFakeSession } from './fixtures/talkx-demo';
import { gotoContacts } from './fixtures/contacts-page';
import {
  bloquearRedeReal, json, mockAppShell, mockMapboxSearchbox, type Registro,
} from './fixtures/mapa-mocks';

/**
 * E73 — E2E do CADASTRO de contato com endereço e da edição SEM PERDA.
 *
 * Mapeamento: `e2e/contact-address.spec.ts` não existia (docs/mapa/mapeamento-fase7.md,
 * linha do E73; bloco literal da etapa em docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md).
 *
 * Fluxo da etapa: criar `[E2E] Endereço <timestamp>` com o autocomplete interceptado,
 * salvar, reabrir a edição, mudar SÓ o nome, salvar e conferir via UI que o endereço
 * continua; apagar o contato no `afterEach`. "É o E2E que teria pego C1" — o defeito em
 * que editar um contato pela lista apagava endereço e coordenada
 * (docs/mapa/AUDITORIA_PLANO_50_ETAPAS_2026-09-29.md, achado C1). Este teste é a rede
 * de proteção dessa garantia.
 *
 * AUTENTICAÇÃO (sem secret): reusa `installFakeSession` de `e2e/fixtures/talkx-demo.ts`
 * — mesma sessão Supabase falsa da spec do picker (E71). O backend (REST e RPC) e a edge
 * `get-mapbox-token` são mockados, e a rede da Mapbox é respondida pelas fixtures do E68
 * (`src/lib/__fixtures__/mapbox/`). `bloquearRedeReal` (registrado primeiro) garante que
 * NADA escapa para a internet: qualquer request ao Supabase ou à Mapbox sem mock cai nele
 * e é registrado — o teste falha se `redeBarrada` não estiver vazio.
 *
 * DIVERGÊNCIAS medidas contra o texto da etapa (o código manda mais que o plano):
 *  - A etapa fala do "cadastro de contato" como se fosse a mesma superfície do picker do
 *    inbox. NÃO é: o cadastro usa `src/components/contacts/ContactForm.tsx`
 *    (`id="address"`, `role=combobox`, listbox `contact-form-address-listbox`, hook
 *    `useAddressAutocomplete` com `sessionSource: 'contact-form'` e `types=address,street,place`),
 *    montado por `ContactDialogs.tsx` (Adicionar/Editar) na tela `?view=contacts` — não pelo
 *    diálogo "Compartilhar Localização" do ChatPanel. O mock e o fluxo abaixo seguem o
 *    cadastro real.
 *  - A etapa NÃO existe no texto como "login real": aqui também não há credencial E2E
 *    (E2E_TEST_EMAIL/PASSWORD não existem) — a sessão é a falsa.
 *  - O endereço preenchido vem do `/retrieve` interceptado com a fixture do E68
 *    (`forward-avenida-paulista-1000.json`), que não tem `context`: só `address`
 *    (logradouro) + latitude/longitude são preenchidos — é o que a tela mostra.
 */

const ENDERECO = 'Avenida Paulista, 1000';
/** Mesmo formato de telefone das outras specs de contato (só dígitos, DDI 55). */
const TELEFONE_DDI = '5511';

interface ContatoLinha {
  id: string;
  name: string;
  surname: string | null;
  nickname: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  job_title: string | null;
  contact_type: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_lid_legacy: boolean;
  tags: string[];
  avatar_url: string | null;
  address: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  assigned_to: string | null;
  queue_id: string | null;
}

/** "Banco" falso: a lista/edição/C1 são avaliadas contra o estado real das linhas gravadas. */
interface EstadoBanco {
  contatos: ContatoLinha[];
  /** Corpos dos PATCH em `contacts` — é onde a perda de endereço (C1) apareceria. */
  patches: Record<string, unknown>[];
  /** Escritas em `contacts` (método + path). */
  writes: string[];
}

function linhaBase(): ContatoLinha {
  const agora = new Date().toISOString();
  return {
    id: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '', surname: null, nickname: null, phone: '', email: null, company: null,
    job_title: null, contact_type: 'cliente', created_at: agora, updated_at: agora,
    deleted_at: null, is_lid_legacy: false, tags: [], avatar_url: null,
    address: null, address_number: null, neighborhood: null, city: null, state: null,
    postal_code: null, latitude: null, longitude: null, assigned_to: null, queue_id: null,
  };
}

/**
 * Mock do módulo Contatos num store em memória: o POST cria a linha, o PATCH aplica só as
 * chaves enviadas (semântica do PostgREST) e as RPCs que a tela chama são respondidas a
 * partir do store. Nenhum POST/PATCH sai para o Supabase real.
 */
async function mockBackendContatos(page: Page, estado: EstadoBanco): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => {
    const requisicao = route.request();
    const metodo = requisicao.method();
    const url = new URL(requisicao.url());
    if (metodo === 'GET') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const linhas = estado.contatos.filter((linha) => !id || linha.id === id);
      // `.maybeSingle()` do supabase-js converte array de 1 item em objeto no cliente —
      // por isso a leitura sempre devolve array (o cliente decide).
      return json(route, linhas);
    }

    estado.writes.push(`${metodo} ${url.pathname}`);
    if (metodo === 'POST') {
      const corpo = JSON.parse(requisicao.postData() ?? '{}') as Record<string, unknown>;
      const linha = { ...linhaBase(), ...corpo } as ContatoLinha;
      estado.contatos.push(linha);
      return json(route, [linha], 201);
    }
    if (metodo === 'PATCH') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const corpo = JSON.parse(requisicao.postData() ?? '{}') as Record<string, unknown>;
      estado.patches.push(corpo);
      const alvo = estado.contatos.find((linha) => linha.id === id);
      if (alvo) Object.assign(alvo, corpo);
      return json(route, alvo ? [alvo] : []);
    }
    return json(route, { message: 'blocked' }, 403);
  });

  // RPCs da tela de Contatos, todas derivadas do store.
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) => {
    const total = estado.contatos.length;
    return json(route, estado.contatos.map((linha) => ({ ...linha, total_count: total })));
  });
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) => {
    const porTipo = new Map<string, number>();
    for (const linha of estado.contatos) {
      const tipo = linha.contact_type ?? 'cliente';
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
    }
    return json(route, [...porTipo].map(([contact_type, count]) => ({ contact_type, count })));
  });
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, estado.contatos.map((linha) => ({ contact_id: linha.id, can_delete: true }))));
  await page.route(/\/rest\/v1\/rpc\/delete_contact/, (route) => {
    const corpo = JSON.parse(route.request().postData() ?? '{}') as { p_id?: string };
    estado.contatos = estado.contatos.filter((linha) => linha.id !== corpo.p_id);
    return json(route, true);
  });

  // A tela não precisa de mensagens; sem esta rota o catch-all do shell deixaria a
  // requisição escapar (o lookahead dele exclui `messages`).
  await page.route(/\/rest\/v1\/messages/, (route) =>
    route.request().method() === 'GET' ? json(route, []) : json(route, { message: 'blocked' }, 403));
}

test.describe('E73 · cadastro de contato com endereço e edição sem perda', () => {
  const stamp = Date.now().toString().slice(-9);
  const nome = `[E2E] Endereço ${stamp}`;
  const nomeEditado = `${nome} (editado)`;
  const telefone = `${TELEFONE_DDI}${stamp}`;

  let estado: EstadoBanco | null = null;
  let registro: Registro | null = null;

  test.afterEach(async ({ page }) => {
    if (!estado || !registro) return;
    // Limpeza da etapa: apaga o contato pela MESMA UI do operador (menu → Excluir →
    // confirmar, que chama a RPC de soft-delete `delete_contact`).
    const cartao = page.getByTestId('contact-card').filter({ hasText: '[E2E] Endereço' });
    if (await cartao.count()) {
      await cartao.first().locator('button[aria-haspopup="menu"]').click({ timeout: 5_000 });
      await page.getByRole('menuitem', { name: /Excluir/ }).click({ timeout: 5_000 });
      await page.getByRole('alertdialog').getByRole('button', { name: /Excluir/ }).click({ timeout: 5_000 });
      await expect(cartao).toHaveCount(0, { timeout: 10_000 });
    }
    // Rede de segurança: não sobra contato `[E2E]` no backend falso.
    expect(estado.contatos.filter((linha) => linha.name.startsWith('[E2E] Endereço'))).toEqual([]);
  });

  test('cria com autocomplete, edita só o nome e o endereço continua', async ({ page }) => {
    estado = { contatos: [], patches: [], writes: [] };
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };

    // Ordem de registro importa: o Playwright casa as rotas na ordem INVERSA (a última
    // vence), então o guarda entra primeiro e os mocks específicos depois.
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await mockBackendContatos(page, estado);
    await mockMapboxSearchbox(page, registro);
    await installFakeSession(page);

    // ── 1. Cadastro com endereço ────────────────────────────────────────────────
    await gotoContacts(page);
    await page.getByTestId('contact-create-fab').click();
    const dialogoCriar = page.getByRole('dialog', { name: 'Adicionar Contato' });
    await expect(dialogoCriar).toBeVisible();
    await dialogoCriar.locator('#name').fill(nome);
    await dialogoCriar.locator('#phone').fill(telefone);

    // O combobox de endereço só busca depois que o token do Mapbox chega (invoke
    // interceptada). O `toPass` reexecuta a digitação caso o token ainda não tenha
    // resolvido — sem depender de tempo fixo.
    const combo = dialogoCriar.locator('#address');
    const lista = dialogoCriar.getByRole('listbox');
    const opcao = dialogoCriar.getByRole('option', { name: /Avenida Paulista, 1000/ });
    await expect(async () => {
      await combo.click();
      await combo.fill('avenida paulista 1000');
      await expect(lista).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(opcao).toBeVisible();

    // Seleção por teclado (mesmo caminho do picker do E71).
    await combo.press('ArrowDown');
    await expect(opcao).toHaveAttribute('aria-selected', 'true');
    await combo.press('Enter');
    await expect(combo).toHaveValue(ENDERECO);

    await dialogoCriar.getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByText('Contato Adicionado!')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(dialogoCriar).toBeHidden();

    // O que foi gravado no "banco" carrega endereço E coordenada.
    await expect.poll(() => estado?.contatos[0]?.address ?? null).toBe(ENDERECO);
    expect(estado.contatos[0]?.latitude).toBeCloseTo(-23.5613, 4);
    expect(estado.contatos[0]?.longitude).toBeCloseTo(-46.6565, 4);

    // ── 2. Edição mudando SÓ o nome ─────────────────────────────────────────────
    const cartao = page.getByTestId('contact-card').filter({ hasText: nome });
    await expect(cartao).toBeVisible({ timeout: 15_000 });
    await cartao.getByTitle('Editar').click();

    const dialogoEditar = page.getByRole('dialog', { name: 'Editar Contato' });
    await expect(dialogoEditar).toBeVisible();
    // E05/C1: o form abre com a LINHA COMPLETA (`getById`), então o endereço carrega.
    await expect(dialogoEditar.locator('#address')).toHaveValue(ENDERECO);

    await dialogoEditar.locator('#name').fill(nomeEditado);
    await dialogoEditar.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogoEditar).toBeHidden({ timeout: 15_000 });

    // Prova no arame: o UPDATE mandou o endereço (não `null`) e não zerou a coordenada.
    // O bug C1 era justamente o PATCH com `address: null` depois de editar pela lista.
    const patch = estado.patches.at(-1) ?? {};
    expect(estado.patches).toHaveLength(1);
    expect(patch.name).toBe(nomeEditado);
    expect(patch.address).toBe(ENDERECO);
    expect(patch.latitude).not.toBeNull();
    expect(patch.longitude).not.toBeNull();

    // ── 3. Conferência via UI: o endereço continua ──────────────────────────────
    const cartaoEditado = page.getByTestId('contact-card').filter({ hasText: nomeEditado });
    await expect(cartaoEditado).toBeVisible({ timeout: 15_000 });
    await cartaoEditado.getByTitle('Editar').click();
    const dialogReaberto = page.getByRole('dialog', { name: 'Editar Contato' });
    await expect(dialogReaberto.locator('#address')).toHaveValue(ENDERECO);
    await dialogReaberto.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogReaberto).toBeHidden();

    // ── Provas de escopo: nada real saiu da máquina ─────────────────────────────
    expect(estado.writes).toEqual(
      expect.arrayContaining(['POST /rest/v1/contacts', 'PATCH /rest/v1/contacts']),
    );
    // Nenhuma mensagem/WhatsApp foi gerada.
    expect(registro.writesApp.filter((w) => w.includes('/messages'))).toEqual([]);
    // A busca da Mapbox foi exercitada e interceptada (fixtures do E68, host da API).
    expect(registro.mapbox.length).toBeGreaterThan(0);
    expect(registro.mapbox.every((url) => url.startsWith('https://api.mapbox.com/'))).toBe(true);
    expect(registro.mapbox.some((url) => url.includes('/searchbox/v1/suggest'))).toBe(true);
    expect(registro.mapbox.some((url) => url.includes('/searchbox/v1/retrieve/'))).toBe(true);
    // Nenhuma requisição escapou dos mocks (Supabase/Mapbox reais).
    expect(registro.redeBarrada ?? []).toEqual([]);
  });
});
