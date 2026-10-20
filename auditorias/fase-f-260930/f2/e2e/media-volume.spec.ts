import { test, expect } from '@playwright/test';
import {
  MEDIA_VOLUME_LABEL,
  MEDIA_VOLUME_LABEL_MUTED,
  MEDIA_VOLUME_SLIDER_LABEL,
  SOUND_VOLUME_LABEL,
  SOUND_VOLUME_LABEL_MUTED,
} from '../src/lib/volumeLabels';
import { MEDIA_VOLUME_STORAGE_KEYS } from '../src/lib/mediaVolumeStore';
import {
  E2E_FIXTURE_CONTACT_DISPLAY_NAME,
  ensureFixtureConversationOpen,
  cleanupFixtureMessages,
} from './fixtures/e2e-contact';

// E45 — fluxo real do controle de volume das mídias de conversa.
//
// Roda no project `chromium-authenticated` (ver e2e/README.md): depende de
// `setup` e da sessão salva em `e2e/.auth/user.json`. Contra produção, então
// nada aqui cria dado além do que `ensureFixtureConversationOpen` já cria (uma
// mensagem `[E2E fixture setup]`, removida no afterAll).
//
// O que este spec prova, e o que ele deliberadamente NÃO prova:
// - prova: o controle existe na sidebar, o clique curto alterna o mudo da mídia,
//   o clique longo abre o slider, o valor persiste no localStorage e sobrevive ao
//   reload, e o botão de ALERTAS fica intocado (critério 3 do plano);
// - não prova: a aplicação do volume no `<audio>` do balão. O contato de fixture
//   do E2E não tem mensagem de áudio (e semear uma aqui seria dado de mídia
//   inventado em produção). Essa parte é coberta por
//   `src/components/inbox/__tests__/MediaVolume.test.tsx` (E07/E12/E44) e pelo
//   teste do elemento em `src/lib/__tests__/mediaVolumeElement.test.ts`.
const LABEL_VOLUME = MEDIA_VOLUME_LABEL;
const LABEL_MUDO = MEDIA_VOLUME_LABEL_MUTED;
const LABEL_SLIDER = MEDIA_VOLUME_SLIDER_LABEL;
const LABEL_ALERTA = new RegExp(`${SOUND_VOLUME_LABEL}|${SOUND_VOLUME_LABEL_MUTED}`);
const CHAVE_VOLUME = MEDIA_VOLUME_STORAGE_KEYS.volume;

test.describe('Volume das mídias de conversa', () => {
  test.beforeEach(async ({ page }) => {
    // A navegação precisa vir antes de `ensureFixtureConversationOpen` (ele lê o
    // token do Supabase no localStorage, e em about:blank isso lança SecurityError).
    await page.goto('/');
    await ensureFixtureConversationOpen(page);
    await page.reload();
    // Chip "Todas": o padrão ("Em atendimento") depende de feature flag e de
    // `assigned_to` — "Todas" é o único filtro determinístico para o fixture.
    await page.getByTestId('status-chip-all').click();
    await page.locator('[data-testid="conversation-item"]').first().click();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    await page.goto('/');
    await cleanupFixtureMessages(page);
    await context.close();
  });

  test('o controle da sidebar muda o volume e o valor sobrevive ao reload', async ({ page, browserName }) => {
    // O clique longo (`pointerdown` + 400 ms) é o caminho não-visual do slider;
    // no CI ele é estável no Chromium (mouse real). Firefox/WebKit não rodam este
    // spec (project `chromium-authenticated`), a guarda é só documental.
    test.skip(browserName !== 'chromium', 'spec roda no project chromium-authenticated');

    const controle = page.getByRole('button', { name: new RegExp(`${LABEL_VOLUME}|${LABEL_MUDO}`) });
    await expect(controle).toBeVisible();

    await controle.hover();
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();

    const slider = page.getByRole('slider', { name: LABEL_SLIDER });
    await expect(slider).toBeVisible();

    // Determinismo (o teste era flaky e só passava no retry):
    // 1) o store hidrata do localStorage num efeito; ler `aria-valuenow` antes disso
    //    pega valor velho. A expectativa abaixo re-tenta até a hidratação acontecer.
    let persistido = await page.evaluate((chave) => window.localStorage.getItem(chave), CHAVE_VOLUME);
    const valorInicial = persistido === null ? 80 : Number(persistido);
    expect(Number.isFinite(valorInicial)).toBe(true);
    await expect(slider).toHaveAttribute('aria-valuenow', String(valorInicial));

    // 2) andar para o lado que nunca encosta no clamp...
    const desce = valorInicial >= 10;
    const tecla = desce ? 'ArrowDown' : 'ArrowUp';
    const passo = desce ? -5 : 5;
    const valorEsperado = valorInicial + passo * 2;

    // 3) ...e conferir cada passo: sem esperar entre as teclas, a 2ª podia ser
    //    engolida pelo re-render e o valor final ficava um passo atrás.
    await slider.focus();
    await slider.press(tecla);
    await expect(slider).toHaveAttribute('aria-valuenow', String(valorInicial + passo));
    await slider.press(tecla);
    await expect(slider).toHaveAttribute('aria-valuenow', String(valorEsperado));
    await expect(page.getByTestId('media-volume-value')).toHaveText(`${valorEsperado}%`);

    persistido = await page.evaluate((chave) => window.localStorage.getItem(chave), CHAVE_VOLUME);
    expect(persistido).toBe(String(valorEsperado));

    await page.reload();
    await page.getByTestId('status-chip-all').click();
    await page.locator('[data-testid="conversation-item"]').first().click();

    const controleDepois = page.getByRole('button', { name: new RegExp(`${LABEL_VOLUME}|${LABEL_MUDO}`) });
    await controleDepois.hover();
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();

    await expect(page.getByRole('slider', { name: LABEL_SLIDER })).toHaveAttribute(
      'aria-valuenow',
      String(valorEsperado),
    );
  });

  test('mudo da mídia não silencia os alertas e persiste no reload', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'spec roda no project chromium-authenticated');

    const alerta = page.getByRole('button', { name: LABEL_ALERTA });
    const rotuloAlertaAntes = await alerta.getAttribute('aria-label');

    await page.getByRole('button', { name: LABEL_VOLUME }).click();

    await expect(page.getByRole('button', { name: LABEL_MUDO })).toBeVisible();
    // Critério 3 do plano: o canal dos alertas não muda de estado com a mídia muda.
    expect(await alerta.getAttribute('aria-label')).toBe(rotuloAlertaAntes);

    await page.reload();
    await page.getByTestId('status-chip-all').click();
    await page.locator('[data-testid="conversation-item"]').first().click();

    await expect(page.getByRole('button', { name: LABEL_MUDO })).toBeVisible();

    // desfaz para não deixar a mídia muda na sessão de quem rodar depois
    await page.getByRole('button', { name: LABEL_MUDO }).click();
    await expect(page.getByRole('button', { name: LABEL_VOLUME })).toBeVisible();
  });

  test('se a conversa do fixture tiver áudio, o elemento nasce no volume escolhido', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'spec roda no project chromium-authenticated');

    await page.evaluate((chave) => window.localStorage.setItem(chave, '40'), CHAVE_VOLUME);
    await page.reload();
    await page.getByTestId('status-chip-all').click();
    await page.locator('[data-testid="conversation-item"]').first().click();

    const audio = page.locator('audio').first();
    if ((await audio.count()) === 0) {
      test.skip(
        true,
        'conversa do fixture não tem mensagem de áudio — a aplicação no elemento é coberta por ' +
          'src/components/inbox/__tests__/MediaVolume.test.tsx e src/lib/__tests__/mediaVolumeElement.test.ts',
      );
    }

    // 40% → ganho perceptual (40/100)² = 0.16
    await expect
      .poll(async () => audio.evaluate((elemento) => (elemento as HTMLAudioElement).volume), {
        timeout: 10_000,
      })
      .toBeCloseTo(0.16, 2);
  });
});
