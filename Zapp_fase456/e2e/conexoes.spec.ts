import { test, expect } from '@playwright/test';

import { gotoConexoes } from './fixtures/conexoes';

/**
 * Conexões — esboço de e2e (a V2 não tinha NENHUM).
 *
 * Cobre a navegação e os estados honestos da tela contra o banco do conjunto
 * local (R1). O passo de QR fica como `test.fixme`: o fluxo exige o provedor
 * Evolution (resposta real de QR), que não existe no ambiente local — sem ele
 * um teste “verde” de QR estaria fingindo.
 */
test.describe('Conexões — tela e estados honestos', () => {
  test.beforeEach(async ({ page }) => {
    await gotoConexoes(page);
  });

  test('mostra os cartões de estatística e a ação de nova conexão', async ({ page }) => {
    await expect(page.getByText('Total de Conexões')).toBeVisible();
    await expect(page.getByText('Conectadas', { exact: true })).toBeVisible();
    await expect(page.getByText('Desconectadas', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nova Conexão' })).toBeVisible();
  });

  test('a lista tem conexões OU o vazio é explicado — nunca os dois ao mesmo tempo', async ({ page }) => {
    const vazio = page.getByText('Nenhuma conexão configurada');
    const seloConectado = page.getByText('Conectado', { exact: true }).first();
    const seloDesconectado = page.getByText('Desconectado', { exact: true }).first();

    // Espera o primeiro sinal real (lista OU vazio) ANTES de decidir: ler
    // isVisible() crua media a tela ainda carregando e oscilava.
    await expect(vazio.or(seloConectado).or(seloDesconectado)).toBeVisible();

    const temVazio = await vazio.isVisible();
    const temCartao = (await seloConectado.isVisible()) || (await seloDesconectado.isVisible());

    // Exatamente uma das duas leituras é verdadeira.
    expect(temVazio).not.toBe(temCartao);
  });

  test('abre o diálogo de nova conexão e o Cancelar fecha sem criar nada', async ({ page }) => {
    await page.getByRole('button', { name: 'Nova Conexão' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText('Adicionar Nova Conexão')).toBeVisible();
    await expect(dialogo.getByPlaceholder('Ex: WhatsApp Vendas')).toBeVisible();
    await expect(dialogo.getByPlaceholder('+55 11 99999-0000')).toBeVisible();

    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
  });

  test.fixme('abrir o QR de uma conexão desconectada', async () => {
    // Exige o provedor Evolution (QR real) e uma conexão desconectada no banco
    // local. Sem o serviço no ambiente local o passo não roda — deixado
    // explícito para não fingir cobertura (regra R1).
  });
});
