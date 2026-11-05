import { test, expect, type Page } from '@playwright/test';

import { gotoConexoes } from './fixtures/conexoes';

/** Controla somente a leitura da flag deste cenário e impede criação acidental. */
async function mockConnectionCreationFlag(page: Page, enabled: boolean) {
  let reads = 0;
  const writeAttempts: string[] = [];
  await page.route(/\/rest\/v1\/global_settings(?:\?|$)/, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname !== '/rest/v1/global_settings' || request.method() !== 'GET' || [...url.searchParams].length !== 2 ||
        url.searchParams.get('select') !== 'value' ||
        url.searchParams.get('key') !== 'eq.multi_connection_enabled') return route.fallback();
    reads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ value: String(enabled) }]) });
  });
  await page.route(/\/(?:functions\/v1\/evolution-api\/create-(?:connection|instance)|rest\/v1\/whatsapp_connections)(?:\?|$)/, (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!['/rest/v1/whatsapp_connections', '/functions/v1/evolution-api/create-connection',
      '/functions/v1/evolution-api/create-instance'].includes(pathname)) return route.fallback();
    if (pathname === '/rest/v1/whatsapp_connections' && ['GET', 'HEAD'].includes(request.method())) return route.fallback();
    writeAttempts.push(pathname);
    return route.abort('blockedbyclient');
  });
  return { reads: () => reads, writeAttempts };
}

/**
 * Conexões — esboço de e2e (a V2 não tinha NENHUM).
 *
 * Cobre a navegação e os estados honestos da tela contra o banco do conjunto
 * local (R1). O passo de QR fica como `test.fixme`: o fluxo exige o provedor
 * Evolution (resposta real de QR), que não existe no ambiente local — sem ele
 * um teste “verde” de QR estaria fingindo.
 */
test.describe('Conexões — tela e estados honestos', () => {
  test('mostra os cartões de estatística e a ação de nova conexão', async ({ page }) => {
    await gotoConexoes(page);
    await expect(page.getByText('Total de Conexões')).toBeVisible();
    await expect(page.getByText('Conectadas', { exact: true })).toBeVisible();
    await expect(page.getByText('Desconectadas', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova Conexão' })).toBeVisible();
  });

  test('a lista tem conexões OU o vazio é explicado — nunca os dois ao mesmo tempo', async ({ page }) => {
    await gotoConexoes(page);
    const main = page.getByRole('main', { name: 'Conteúdo principal' });
    const vazio = main.getByRole('heading', { name: 'Nenhuma conexão configurada', exact: true });
    const cartao = main.getByTestId('connection-card').first();

    // Espera o primeiro sinal real (lista OU vazio) ANTES de decidir: ler
    // isVisible() crua media a tela ainda carregando e oscilava.
    await expect(vazio.or(cartao).first()).toBeVisible();

    const temVazio = await vazio.isVisible();
    const temCartao = await cartao.isVisible();

    // Exatamente uma das duas leituras é verdadeira.
    expect(temVazio).not.toBe(temCartao);
  });

  test('abre o diálogo de nova conexão e o Cancelar fecha sem criar nada', async ({ page }) => {
    const config = await mockConnectionCreationFlag(page, true);
    await gotoConexoes(page);
    await expect(page.getByRole('button', { name: 'Nova Conexão' })).toBeEnabled();
    expect(config.reads()).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Nova Conexão' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText('Adicionar Nova Conexão')).toBeVisible();
    await expect(dialogo.getByPlaceholder('Ex: WhatsApp Vendas')).toBeVisible();
    await expect(dialogo.getByPlaceholder('+55 11 99999-0000')).toBeVisible();

    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
    expect(config.writeAttempts).toEqual([]);
  });

  test('mantém nova conexão bloqueada quando a flag está desabilitada', async ({ page }) => {
    const config = await mockConnectionCreationFlag(page, false);
    await gotoConexoes(page);
    const nova = page.getByRole('button', { name: 'Nova Conexão' });
    await expect(nova).toBeDisabled();
    await expect(nova).toHaveAttribute('title', 'Múltiplas conexões ainda não estão habilitadas neste sistema');
    expect(config.reads()).toBeGreaterThan(0);
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(config.writeAttempts).toEqual([]);
  });

  test.fixme('abrir o QR de uma conexão desconectada', async () => {
    // Exige o provedor Evolution (QR real) e uma conexão desconectada no banco
    // local. Sem o serviço no ambiente local o passo não roda — deixado
    // explícito para não fingir cobertura (regra R1).
  });
});
