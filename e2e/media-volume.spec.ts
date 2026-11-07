import { test, expect, type Page } from '@playwright/test';
import {
  MEDIA_VOLUME_LABEL,
  MEDIA_VOLUME_LABEL_MUTED,
  MEDIA_VOLUME_SLIDER_LABEL,
  SOUND_VOLUME_LABEL,
  SOUND_VOLUME_LABEL_MUTED,
} from '../src/lib/volumeLabels';
import { mediaVolumeStorageKeys } from '../src/lib/mediaVolumeStore';
import { E2E_ARQUIVOS } from './fixtures/arquivos-local/dados';
import { SUPABASE_URL, SUPABASE_STORAGE_KEY } from './fixtures/supabase-env';

// E45 — fluxo real do controle de volume das mídias de conversa.
//
// Roda no project `chromium-authenticated` (ver e2e/README.md) do backend
// descartável isolado, mas entra pela UI com o usuário local da fixture de
// Arquivos. `fixtures/arquivos-local/seed.ts` valida Storage/RLS com esse mesmo
// usuário; assim, a assinatura abaixo não depende da visibilidade entre perfis.
//
// O que este spec prova, e o que ele deliberadamente NÃO prova:
// - prova: o controle existe na sidebar, o clique abre o painel, o botão Silenciar
//   alterna o mudo da mídia, o valor persiste no localStorage e sobrevive ao reload,
//   e o botão de ALERTAS fica intocado (critério 3 do plano);
// - prova também: metadados do áudio canônico assinado pelo fluxo real do player e
//   seu volume inicial. Não afirma reprodução audível, play() ou transcrição.
// S28 — o rótulo do fone passou a trazer o volume no fim ("Volume dos áudios e vídeos:
// 80%"), como o do alto-falante; mudo continua com rótulo próprio. `LABEL_VOLUME` casa o
// estado SEM mudo (prefixo, porque o valor muda a cada passo) e `LABEL_CONTROLE` casa os
// dois estados, para achar o botão sem saber em que estado ele está.
const LABEL_VOLUME = new RegExp(`^${MEDIA_VOLUME_LABEL}`);
const LABEL_MUDO = MEDIA_VOLUME_LABEL_MUTED;
const LABEL_CONTROLE = new RegExp(`^(${MEDIA_VOLUME_LABEL}|${MEDIA_VOLUME_LABEL_MUTED})`);
const LABEL_SLIDER = MEDIA_VOLUME_SLIDER_LABEL;
const LABEL_ALERTA = new RegExp(`${SOUND_VOLUME_LABEL}|${SOUND_VOLUME_LABEL_MUTED}`);
const AUDIO_SIGNED_PATH = `/storage/v1/object/sign/whatsapp-media/${E2E_ARQUIVOS.contato.id}/${E2E_ARQUIVOS.mensagens.audio.objeto}`;
const NAV_TIMEOUT = 60_000;

// A prova usa a identidade sintética que possui o contato e o objeto privado.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

async function entrarPelaUI(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60_000;
  });
  await page.goto('/auth');
  await page.locator('#login-email').fill(E2E_ARQUIVOS.usuario.email);
  await page.locator('#login-password').fill(E2E_ARQUIVOS.usuario.senha);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page.locator('#main-navigation')).toBeVisible({ timeout: NAV_TIMEOUT });
}

async function chaveVolumeDoUsuario(page: Page): Promise<string> {
  const userId = await page.evaluate((key) => {
    try {
      const session = JSON.parse(window.localStorage.getItem(key) ?? 'null') as {
        access_token?: unknown; user?: { id?: unknown };
      } | null;
      return typeof session?.access_token === 'string' && session.access_token &&
        typeof session.user?.id === 'string' && session.user.id ? session.user.id : null;
    } catch { return null; }
  }, SUPABASE_STORAGE_KEY);
  if (!userId) throw new Error('Sessão do projeto configurado ausente para a prova de volume');
  return mediaVolumeStorageKeys(userId).volume;
}

async function abrirConversaDoFixture(page: Page): Promise<void> {
  await page.getByTestId('status-chip-all').click();
  await page.getByLabel('Buscar contato pelo nome').fill(E2E_ARQUIVOS.contato.nomeVisivel);
  const name = page.getByText(E2E_ARQUIVOS.contato.nomeVisivel, { exact: true });
  const item = page.getByTestId('conversation-item').filter({ has: name });
  await expect(item).toHaveCount(1);
  const button = item.getByRole('button').filter({ has: name });
  await expect(button).toHaveCount(1);
  await button.click();
}

function controlesRapidos(page: Page) {
  // A conversa semeada contém um player de áudio, que monta outro
  // MediaVolumeControl no balão. Esta spec exercita explicitamente o controle
  // global da navegação lateral; escopar evita confundi-lo com o do player.
  return page.getByRole('navigation', { name: 'Menu de navegação principal' });
}

async function volumeDoAudioCarregado(page: Page): Promise<number> {
  const audio = page.locator(`audio[src*="${AUDIO_SIGNED_PATH}"]`);
  if (await audio.count() !== 1) return Number.NaN;
  return audio.evaluate((elemento, { origin, path }) => {
    const element = elemento as HTMLAudioElement;
    try {
      const src = new URL(element.currentSrc);
      if (!element.isConnected || !element.currentSrc ||
          src.origin !== origin || src.pathname !== path) return Number.NaN;
      return element.volume;
    } catch { return Number.NaN; }
  }, { origin: new URL(SUPABASE_URL).origin, path: AUDIO_SIGNED_PATH });
}

test.describe('Volume das mídias de conversa', () => {
  test.beforeEach(async ({ page }) => {
    await entrarPelaUI(page);
    await abrirConversaDoFixture(page);
  });

  test('o controle da sidebar muda o volume e o valor sobrevive ao reload', async ({ page, browserName }) => {
    // O slider abre pelo teclado (`Enter` = equivalente de teclado do clique comum,
    // documentado em `useVolumeRocker`). O clique longo com `mouse.down()/up()` reais
    // era instável no CI: o timer de 400 ms é cancelado por qualquer `pointerleave`
    // (`VolumeTriggerButton.tsx:40-42`), e as runs do `e2e-logado` de 30/09 e 01/10
    // apareciam como *flaky* (1ª tentativa vermelha, retry verde).
    test.skip(browserName !== 'chromium', 'spec roda no project chromium-authenticated');

    const controle = controlesRapidos(page).getByRole('button', { name: LABEL_CONTROLE });
    await expect(controle).toBeVisible();

    await controle.focus();
    await controle.press('Enter');

    const slider = page.getByRole('slider', { name: LABEL_SLIDER });
    await expect(slider).toBeVisible();

    // Determinismo (o teste era flaky e só passava no retry):
    // 1) o store hidrata do localStorage num efeito; ler `aria-valuenow` antes disso
    //    pega valor velho. A expectativa abaixo re-tenta até a hidratação acontecer.
    const chaveVolume = await chaveVolumeDoUsuario(page);
    let persistido = await page.evaluate((chave) => window.localStorage.getItem(chave), chaveVolume);
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

    persistido = await page.evaluate((chave) => window.localStorage.getItem(chave), chaveVolume);
    expect(persistido).toBe(String(valorEsperado));

    await page.reload();
    await abrirConversaDoFixture(page);

    const controleDepois = controlesRapidos(page).getByRole('button', { name: LABEL_CONTROLE });
    await controleDepois.focus();
    await controleDepois.press('Enter');

    await expect(page.getByRole('slider', { name: LABEL_SLIDER })).toHaveAttribute(
      'aria-valuenow',
      String(valorEsperado),
    );
  });

  test('mudo da mídia não silencia os alertas e persiste no reload', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'spec roda no project chromium-authenticated');

    const controles = controlesRapidos(page);
    const alerta = controles.getByRole('button', { name: LABEL_ALERTA });
    const rotuloAlertaAntes = await alerta.getAttribute('aria-label');

    await controles.getByRole('button', { name: LABEL_VOLUME }).click();
    await page.getByRole('button', { name: 'Silenciar' }).click();

    await expect(controles.getByRole('button', { name: LABEL_MUDO })).toBeVisible();
    // Critério 3 do plano: o canal dos alertas não muda de estado com a mídia muda.
    expect(await alerta.getAttribute('aria-label')).toBe(rotuloAlertaAntes);

    await page.reload();
    await abrirConversaDoFixture(page);

    const controlesDepois = controlesRapidos(page);
    await expect(controlesDepois.getByRole('button', { name: LABEL_MUDO })).toBeVisible();

    // desfaz para não deixar a mídia muda na sessão de quem rodar depois
    await controlesDepois.getByRole('button', { name: LABEL_MUDO }).click();
    await page.getByRole('button', { name: 'Ativar som' }).click();
    await expect(controlesDepois.getByRole('button', { name: LABEL_VOLUME })).toBeVisible();
  });

  // A fixture isolada garante objeto/linha únicos e valida os bytes baixados do Storage.
  // Aqui a assinatura vem de useAudioPlayer e a prova se limita ao contrato desta spec:
  // URL canônica aplicada ao elemento real e ganho global inicial, sem exigir reprodução.
  test('se a conversa do fixture tiver áudio, o elemento nasce no volume escolhido', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'spec roda no project chromium-authenticated');

    const chaveVolume = await chaveVolumeDoUsuario(page);
    await page.evaluate((chave) => window.localStorage.setItem(chave, '40'), chaveVolume);
    await page.reload();
    await abrirConversaDoFixture(page);

    // 40% → ganho perceptual (40/100)² = 0.16
    await expect
      .poll(() => volumeDoAudioCarregado(page), {
        timeout: 10_000,
      })
      .toBeCloseTo(0.16, 2);
  });
});
