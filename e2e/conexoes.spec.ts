import { expect, type Page } from '@playwright/test';
import { test, qrRequestAction } from './fixtures/isolated-qr';
import { QR_FIXTURE, assertQrImage } from '../scripts/e2e-isolated/qr-contract.mjs';

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
 * local (R1). O QR usa admin e conexão próprios do stack descartável. A Edge,
 * o Vault e a persistência são reais; só o provedor externo e o QR são sintéticos,
 * com payload inofensivo que não permite pareamento de um aparelho.
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

  test('abrir o QR de uma conexão desconectada', async ({ qrAdmin }) => {
    test.setTimeout(60000); // Inclui o polling real e a janela de cancelamento de dois ciclos.
    const { page, access, token, operations } = qrAdmin;
    const config = await mockConnectionCreationFlag(page, false);
    const before = await access.evidence();
    await gotoConexoes(page);
    const main = page.getByRole('main', { name: 'Conteúdo principal' });
    const card = main.getByTestId('connection-card').filter({ hasText: QR_FIXTURE.name });
    await expect(card).toHaveCount(1);
    await expect(card.getByText(QR_FIXTURE.name, { exact: true })).toBeVisible();
    await expect(card.getByText('Desconectado', { exact: true }).first()).toBeVisible();
    const [connected] = await Promise.all([
      page.waitForResponse(response => qrRequestAction(response.request()) === 'connect'),
      card.getByRole('button', { name: 'Conectar', exact: true }).click(),
    ]);
    expect(connected.status()).toBe(200);
    const result = await connected.json();
    expect(result.error).not.toBe(true);
    expect(result.status).toBe('qr_pending');
    expect(result.data?.Name).toBe(QR_FIXTURE.instance);
    expect(result.qrcode?.code).toBe(QR_FIXTURE.payload);
    assertQrImage(result.qrcode?.base64);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Escanear QR Code - ' + QR_FIXTURE.name, exact: true })).toBeVisible();
    const image = dialog.getByRole('img', { name: 'QR Code', exact: true });
    await expect(image).toBeVisible();
    assertQrImage(await image.getAttribute('src'));
    await expect.poll(() => image.evaluate((node, width) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth === width && image.naturalHeight === width;
    }, QR_FIXTURE.imageWidth)).toBe(true);
    await expect(dialog.getByText('Aguardando conexão...', { exact: true })).toBeVisible();
    await expect(dialog.getByText('WhatsApp Conectado!', { exact: true })).toHaveCount(0);
    await access.assertPending(token);
    const polled = await page.waitForResponse(response => qrRequestAction(response.request()) === 'status');
    expect(polled.status()).toBe(200);
    const status = await polled.json();
    expect(status.error).not.toBe(true);
    expect(status.state).toBe('close');
    expect(status.status).toBe('disconnected');
    await access.assertPending(token);
    await expect(image).toBeVisible();
    await expect(dialog.getByText('Aguardando conexão...', { exact: true })).toBeVisible();
    const after = await access.evidence();
    expect(after.generation).toBe(before.generation + 1);
    expect(after.connects).toBe(before.connects + 1);
    expect(after.qr_reads - before.qr_reads).toBeGreaterThanOrEqual(2);
    expect(after.status_reads).toBeGreaterThan(before.status_reads);
    expect(after.delivered).toBe(0);
    await qrAdmin.closeDialog();
    const closed = operations.snapshot();
    // Positive cancellation check: observe more than two real 3 s intervals.
    await page.waitForTimeout(6500);
    expect(operations.snapshot()).toEqual(closed);
    expect(closed.after_close).toBe(0);
    expect(closed.pending).toBe(0);
    await expect(dialog).toBeHidden();
    expect(config.writeAttempts).toEqual([]);
  });
});
