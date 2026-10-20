import { dispensarOnboarding } from './fixtures/onboarding';
import { test, expect, type Page } from '@playwright/test';
import {
  E2E_CATALOG_FIXTURE_MARKER,
  E2E_CATALOG_MESSAGES_TABLE,
  E2E_CATALOG_PATH,
  E2E_CATALOG_PRODUCT_SKU,
  E2E_CATALOG_PRODUCT_SKU_VERIFIED,
  E2E_CATALOG_SEND_EVENTS_TABLE,
  E2E_CATALOG_TEMPLATE_INFORMAL,
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  E2E_FIXTURE_CONTACT_ID,
} from './fixtures/catalog';

// A URL do projeto é pública (aparece em todo o repo, inclusive nos workflows).
const SUPABASE_URL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

// A chave pública do projeto NÃO é literal neste arquivo: vem do ambiente —
// `VITE_SUPABASE_PUBLISHABLE_KEY` (o mesmo secret que o `ci.yml` entrega ao app)
// ou `E2E_SUPABASE_ANON_KEY`. Literal de chave no diff é barrado pelo scanner do
// `hermes-tarefa-fechar`, e esconder segredo da guarda não é opção; sem a var o
// spec PULA com mensagem explícita (nunca um passe falso).
//
// ACHADO (não corrigido aqui): `e2e/fixtures/e2e-contact.ts:7` e
// `e2e/fixtures/contacts-page.ts:5` ainda mantêm o literal da anon key.
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.E2E_SUPABASE_ANON_KEY ?? '';

// `Record<string, string>` (em vez de interface fechada) porque o tipo de
// `headers` do `page.request` é `{ [key: string]: string }`.
type RestHeaders = Record<string, string>;

interface SendEventRow {
  id: string;
  status: string | null;
  template: string | null;
  product_sku: string | null;
  contact_id: string | null;
  message_ids: unknown;
}

interface MessageRow {
  id: string;
  content: string | null;
  message_type: string | null;
  is_deleted: boolean | null;
}

/** Access token do supabase-js guardado no localStorage do contexto logado. */
async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // entrada que não é o storage do supabase-js
      }
    }
    return null;
  });
  if (!token) {
    throw new Error(
      'Sessão do Supabase não encontrada no localStorage — o project "setup" ' +
        '(e2e/auth.setup.ts) deveria ter rodado antes (o project que coleta este spec tem ' +
        '`dependencies: [\'setup\']`).'
    );
  }
  return token;
}

async function restHeaders(page: Page): Promise<RestHeaders> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${await accessToken(page)}`,
    'Content-Type': 'application/json',
  };
}

/** Último envio registrado para o contato E2E + SKU do produto de teste. */
async function getSendEvents(page: Page): Promise<SendEventRow[]> {
  const res = await page.request.get(
    `${SUPABASE_URL}/rest/v1/${E2E_CATALOG_SEND_EVENTS_TABLE}` +
      '?select=id,status,template,product_sku,contact_id,message_ids' +
      `&contact_id=eq.${E2E_FIXTURE_CONTACT_ID}` +
      `&product_sku=eq.${encodeURIComponent(E2E_CATALOG_PRODUCT_SKU)}` +
      '&order=created_at.desc&limit=1',
    { headers: await restHeaders(page) }
  );
  if (!res.ok()) {
    throw new Error(
      `consulta de ${E2E_CATALOG_SEND_EVENTS_TABLE} falhou: HTTP ${res.status()} ` +
        (await res.text().catch(() => ''))
    );
  }
  return (await res.json()) as SendEventRow[];
}

/** Mensagens criadas para o contato E2E a partir de `sinceIso`. */
async function getMessagesSince(page: Page, sinceIso: string): Promise<MessageRow[]> {
  const res = await page.request.get(
    `${SUPABASE_URL}/rest/v1/${E2E_CATALOG_MESSAGES_TABLE}` +
      '?select=id,content,message_type,is_deleted' +
      `&contact_id=eq.${E2E_FIXTURE_CONTACT_ID}` +
      `&created_at=gte.${encodeURIComponent(sinceIso)}` +
      '&order=created_at.asc',
    { headers: await restHeaders(page) }
  );
  if (!res.ok()) {
    throw new Error(
      `consulta de ${E2E_CATALOG_MESSAGES_TABLE} falhou: HTTP ${res.status()} ` +
        (await res.text().catch(() => ''))
    );
  }
  return (await res.json()) as MessageRow[];
}

/**
 * Limpeza do que o teste criou em `messages`: SOFT delete (`is_deleted = true`),
 * o mesmo mecanismo que o próprio app usa (ex.: `src/services/chat.service.ts`) —
 * nunca DELETE físico. `catalog_send_events` é append-only (o `authenticated` só
 * tem SELECT/INSERT depois do CT-02), então a limpeza dele é feita no teardown do
 * `e2e-logado.yml` com a service role.
 */
async function softDeleteMessagesSince(page: Page, sinceIso: string): Promise<number> {
  const res = await page.request.patch(
    `${SUPABASE_URL}/rest/v1/${E2E_CATALOG_MESSAGES_TABLE}` +
      `?contact_id=eq.${E2E_FIXTURE_CONTACT_ID}&created_at=gte.${encodeURIComponent(sinceIso)}`,
    {
      headers: { ...(await restHeaders(page)), Prefer: 'return=representation' },
      data: { is_deleted: true },
    }
  );
  if (!res.ok()) {
    throw new Error(
      `soft delete de ${E2E_CATALOG_MESSAGES_TABLE} falhou: HTTP ${res.status()} ` +
        (await res.text().catch(() => ''))
    );
  }
  return ((await res.json()) as MessageRow[]).length;
}


test.describe('Catálogo — envio de produto no chat (CT-82)', () => {
  test.describe.configure({ timeout: 150_000 });

  // CT-81: o SKU do produto de teste (default `PO-13153`) aparece na doc do repo
  // mas NÃO foi confirmado no catálogo PromoGifts (sistema EXTERNO). Enquanto
  // `E2E_CATALOG_PRODUCT_SKU_VERIFIED` for falso este spec fica SKIPADO com uma
  // mensagem explícita — nunca um passe falso (o fluxo de envio é real e grava
  // no banco). A verificação do SKU é de outro dono (ver o fixture).
  test.skip(
    !E2E_CATALOG_PRODUCT_SKU_VERIFIED || !SUPABASE_ANON_KEY,
    `Pendência CT-81: o SKU "${E2E_CATALOG_PRODUCT_SKU}" ainda NÃO foi verificado no catálogo ` +
      'PromoGifts (sistema externo, fora deste repo). Enquanto E2E_CATALOG_PRODUCT_SKU_VERIFIED ' +
      'for false, este spec fica explicitamente SKIPADO. Para ligar: confirme que o SKU existe e é ' +
      'buscável e exporte E2E_CATALOG_PRODUCT_SKU_VERIFIED=true (e, se o SKU real for outro, ' +
      'E2E_CATALOG_PRODUCT_SKU=<sku>). ' +
      'Além disso, sem a chave pública no ambiente (VITE_SUPABASE_PUBLISHABLE_KEY ou ' +
      'E2E_SUPABASE_ANON_KEY) os asserts por API não têm como autenticar — então o spec também pula.'
  );

  let runId = '';
  let sinceIso = '';
  let marker = '';

  test.beforeEach(async ({ page }) => {
    runId = crypto.randomUUID().slice(0, 8);
    // 5s de folga contra diferença de relógio entre o runner e o banco: a
    // consulta/limpeza por `created_at >= sinceIso` não pode passar por cima do
    // relógio do Postgres.
    sinceIso = new Date(Date.now() - 5_000).toISOString();
    marker = `${E2E_CATALOG_FIXTURE_MARKER} ${runId}`;

    await page.goto(E2E_CATALOG_PATH);
    // Se o usuário de teste não enxergasse a view, o ViewRouter cairia em
    // RestrictedView e o heading não existiria — falha explícita aqui.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Catálogo de Produtos' })
    ).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ page }) => {
    // Best-effort: uma falha de limpeza nunca derruba o veredito do teste.
    try {
      const removed = await softDeleteMessagesSince(page, sinceIso);
      if (removed > 0) {
        console.warn(`[catalog.e2e] ${removed} mensagem(ns) de fixture marcada(s) is_deleted=true`);
      }
    } catch (err) {
      console.warn('[catalog.e2e] limpeza de messages falhou (best-effort):', err);
    }
  });

  test('busca → card → detalhes → cor → Enviar → fotos → Informal → contato E2E → Enviar agora', async ({
    page,
  }) => {
    // 1) busca o produto pelo SKU de teste
    const search = page.getByPlaceholder(/Buscar por nome, SKU ou marca/);
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill(E2E_CATALOG_PRODUCT_SKU);

    // 2+3) abre o card → detalhes. O nome do produto não é conhecido a priori
    // (só o SKU), então o alvo é o botão "Ver" do card do 1º resultado — o card
    // renderiza `product.name`, não o SKU.
    const ver = page.getByRole('button', { name: 'Ver', exact: true }).first();
    await expect(ver).toBeVisible({ timeout: 30_000 });
    await ver.click();

    // 4) escolhe a cor no Sheet de detalhes (botão com aria-label `Cor <nome>`)
    const detailSheet = page.getByRole('dialog');
    // O Sheet chega a FECHAR depois de abrir (medido em 02/10: em algumas rodadas o
    // dialog some entre o "Ver" e o clique da cor). O bloco reabre o Sheet e clica na
    // cor, repetindo a acao inteira ate valer — sem afrouxar nenhum assert.
    await expect(async () => {
      if ((await page.getByRole('dialog').count()) === 0) {
        await ver.click({ timeout: 5_000 });
        await expect(page.getByRole('dialog')).toHaveCount(1);
      }
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^Cor / })
        .first()
        .click({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });

    // 5) aciona "Enviar variação (<cor>)" no rodapé do Sheet
    const enviarVariacao = detailSheet.getByRole('button', { name: /^Enviar variação \(/ });
    await expect(enviarVariacao).toBeEnabled();
    await enviarVariacao.click();

    // O Sheet fecha e o SendProductDialog abre: espera sobrar 1 único dialog.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const sendDialog = page.getByRole('dialog');
    await expect(sendDialog.getByText('Modelo de mensagem', { exact: true })).toBeVisible({ timeout: 20_000 });

    // 6) escolhe as fotos (garante todas marcadas) e confere a contagem
    const selecionarTodas = sendDialog.getByRole('button', {
      name: 'Selecionar todas',
      exact: true,
    });
    if ((await selecionarTodas.count()) > 0) await selecionarTodas.click();
    await expect(sendDialog.getByText(/fotos selecionadas/)).toBeVisible();

    // 7) modelo Informal (label ↔ MessageTemplate 'informal')
    await sendDialog
      .getByRole('button', { name: E2E_CATALOG_TEMPLATE_INFORMAL, exact: true })
      .click();

    // Marcador de fixture no texto: base determinística do assert em `messages`
    // e da limpeza. Mantém o texto do modelo Informal e prefixa o marcador.
    await sendDialog.getByRole('button', { name: 'Editar', exact: true }).click();
    const textarea = sendDialog.getByPlaceholder('Escreva sua mensagem personalizada...');
    await expect(textarea).toBeVisible();
    const base = await textarea.inputValue();
    await textarea.fill(`${marker}\n${base}`);

    // 8) avança para o passo de contato e seleciona o contato E2E
    await sendDialog.getByRole('button', { name: 'Selecionar Contato', exact: true }).click();
    const buscaContato = sendDialog.getByPlaceholder(/Buscar contato por nome ou telefone/);
    await expect(buscaContato).toBeVisible();
    await buscaContato.fill(E2E_FIXTURE_CONTACT_DISPLAY_NAME);
    const contato = sendDialog
      .getByRole('radio')
      .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
      .first();
    await expect(contato).toBeVisible({ timeout: 20_000 });
    await contato.click();

    // 9) "Enviar agora" — o rótulo real é "Enviar para <contato>". O botão só
    // habilita depois da checagem de prontidão (conexão WhatsApp ativa + contato
    // fora da lista de supressão).
    const enviarAgora = sendDialog.getByRole('button', { name: /^Enviar para / });
    await expect(enviarAgora).toBeEnabled({ timeout: 30_000 });
    await enviarAgora.click();

    // 10) toast de sucesso (o envio com fotos é humanizado: ~1-2s por foto)
    await expect(page.getByText(/Produto enviado/)).toBeVisible({ timeout: 60_000 });

    // ── asserts por API (o log do envio é fire-and-forget: poll) ──
    await expect
      .poll(async () => (await getSendEvents(page))[0] ?? null, {
        timeout: 30_000,
        message:
          `nenhuma linha em ${E2E_CATALOG_SEND_EVENTS_TABLE} para contact_id=${E2E_FIXTURE_CONTACT_ID} ` +
          `e product_sku=${E2E_CATALOG_PRODUCT_SKU}`,
      })
      .toMatchObject({
        status: 'sent',
        product_sku: E2E_CATALOG_PRODUCT_SKU,
        contact_id: E2E_FIXTURE_CONTACT_ID,
        // MessageTemplate 'informal' ↔ label 'Informal' (TEMPLATE_LABELS)
        template: E2E_CATALOG_TEMPLATE_INFORMAL.toLowerCase(),
      });

    await expect
      .poll(
        async () => {
          const rows = await getMessagesSince(page, sinceIso);
          return rows.find((r) => (r.content ?? '').includes(marker)) ?? null;
        },
        { timeout: 30_000, message: `nenhuma mensagem em ${E2E_CATALOG_MESSAGES_TABLE} com o marcador "${marker}"` }
      )
      .not.toBeNull();
  });
});
