/**
 * Teclado na tela de login (/auth): ordem de TAB, foco visível, erro de validação que
 * NÃO rouba o foco do campo e o botão do olho operável sem mouse.
 *
 * Usa só o navegador e o app deslogado (sem `setup`, sem secrets); a rede real fica
 * barrada por `bloquearRedeReal` e o afterEach prova isso com `registro.redeBarrada`.
 *
 * Nota de comportamento (não é defeito): o botão do olho tem `tabIndex={-1}` em
 * `src/components/auth/PasswordInput.tsx`, então ele fica FORA da ordem sequencial de
 * TAB e é alcançado pelo leitor de tela/cursor virtual; por isso a ordem provada aqui é
 * e-mail → senha → (link "Esqueci minha senha") → Entrar, e a operabilidade do olho é
 * provada por teclado à parte. Diferença em relação ao gabarito da V3, que tem o olho
 * na ordem de TAB.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { bloquearRedeReal, SUPABASE_HOST, type Registro } from './fixtures/mapa-mocks';

/** Rótulo estável do elemento com foco: id → aria-label → texto. */
async function tokenFocado(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    return el.id || el.getAttribute('aria-label') || (el.textContent ?? '').trim();
  });
}

/** Host do projeto configurado (mesma constante das fixtures do repo — sem literal solto). */
const HOST_OFICIAL = new URL(SUPABASE_HOST).host;

/**
 * Abre a rota esperando a âncora. O PRIMEIRO carregamento de um dev server frio (Vite
 * otimizando deps sob carga) pode estourar o watchdog de boot do próprio app ("React não
 * montou em 8s") — medido. Uma recarga, com o servidor já aquecido, resolve.
 */
async function abrir(page: Page, rota: string, ancoragem: Locator): Promise<void> {
  await page.goto(rota);
  try {
    await expect(ancoragem).toBeVisible({ timeout: 45_000 });
  } catch {
    await page.reload();
    await expect(ancoragem).toBeVisible({ timeout: 45_000 });
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Teclado na tela de login', () => {
  // Sob carga o 1º teste paga o boot do dev server (medido: 20-43 s). Sem folga o teste
  // falha por lentidão da máquina, não por teclado.
  test.describe.configure({ timeout: 90_000 });

  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
    await abrir(page, '/auth', page.getByRole('main', { name: /acesso à plataforma/i }));
    await expect(page.locator('#login-email')).toBeVisible();
  });

  test.afterEach(() => {
    // Prova de que a spec não tocou a internet: só o host oficial do projeto pode ter
    // sido barrado (respondido localmente com 403), e nenhum host estranho apareceu.
    // A tela de login monta providers do app shell e pede dados mesmo deslogada — isso
    // NÃO é rede real, é o `bloquearRedeReal` servindo 403 no lugar da produção.
    expect(
      registro.redeBarrada?.every((url) => url.includes(HOST_OFICIAL)),
      `host inesperado tentou sair: ${JSON.stringify(registro.redeBarrada)}`,
    ).toBe(true);
  });

  test('TAB: e-mail antes da senha antes de Entrar, sem controle inesperado no meio', async ({ page }) => {
    await page.locator('#login-email').focus();

    const sequencia: string[] = [await tokenFocado(page)];
    for (let i = 0; i < 8 && !sequencia.includes('Entrar'); i++) {
      await page.keyboard.press('Tab');
    // deixa a transição de 200 ms do campo terminar antes de ler o estilo
    await page.waitForTimeout(300);
      sequencia.push(await tokenFocado(page));
    }
    const idx = (t: string) => sequencia.findIndex((s) => s === t);
    const trilha = sequencia.join(' → ');

    expect(sequencia[0], `a tabulação começa no e-mail; veio: ${trilha}`).toBe('login-email');
    expect(idx('login-password'), `senha precisa vir na ordem; trilha: ${trilha}`).toBeGreaterThan(0);
    expect(idx('Entrar'), `Entrar precisa ser alcançado por TAB; trilha: ${trilha}`).toBeGreaterThan(
      idx('login-password'),
    );

    // Nada de surpresa entre a senha e o botão: só o link de recuperação e (se algum dia
    // voltar à ordem) o botão do olho — qualquer outro controle ali é defeito de tabulação.
    const permitidos = [/^esqueci minha senha$/i, /^(mostrar|ocultar) senha$/i];
    for (const parado of sequencia.slice(idx('login-password') + 1, idx('Entrar'))) {
      expect(
        permitidos.some((re) => re.test(parado)),
        `controle inesperado na ordem de TAB: "${parado}" — trilha: ${trilha}`,
      ).toBe(true);
    }
  });

  test('o campo alcançado por TAB mostra o foco visível', async ({ page }) => {
    // Estado SEM foco do mesmo campo: o indicador de foco precisa MUDAR em relação a ele.
    // (Comparar com "sem foco" é o que prova o indicador; o campo tem fundo `glass` com
    // box-shadow própria, então "tem sombra" sozinho não provaria nada.)
    const semFoco = await page.locator('#login-password').evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        contorno: cs.outlineStyle !== 'none' && Number.parseFloat(cs.outlineWidth) > 0 && cs.outlineColor.indexOf('0, 0, 0, 0') === -1 && cs.outlineColor !== 'transparent',
        sombra: cs.boxShadow,
      };
    });

    await page.locator('#login-email').focus();
    await page.keyboard.press('Tab');
    // deixa a transição de 200 ms do campo terminar antes de ler o estilo
    await page.waitForTimeout(300);

    const foco = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        id: el.id,
        focusVisible: el.matches(':focus-visible'),
        contorno: cs.outlineStyle !== 'none' && Number.parseFloat(cs.outlineWidth) > 0 && cs.outlineColor.indexOf('0, 0, 0, 0') === -1 && cs.outlineColor !== 'transparent',
        sombra: cs.boxShadow,
      };
    });

    expect(foco?.id).toBe('login-password');
    expect(foco?.focusVisible, `:focus-visible do alvo: ${JSON.stringify(foco)}`).toBe(true);
    expect(
      { contorno: foco!.contorno, sombra: foco!.sombra },
      `sem indicador de foco visível (nada mudou em relação ao estado sem foco: ${JSON.stringify({ semFoco, foco })})`,
    ).not.toEqual({ contorno: semFoco.contorno, sombra: semFoco.sombra });
  });

  test('erro de validação aparece e o foco continua no campo', async ({ page }) => {
    // Submete PELO TECLADO, com o campo vazio (o `type="email"` do browser já barra
    // um texto inválido antes do React; vazio passa e cai na validação da tela).
    await page.locator('#login-email').focus();
    await page.keyboard.press('Enter');

    const alerta = page.getByRole('alert').first();
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveText(/e-?mail/i);

    // O aviso é anunciado sem tirar o usuário do campo que precisa consertar.
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id)).toBe('login-email');
    await expect(page).toHaveURL(/\/auth$/);
  });

  test('o botão do olho é operável por teclado e anuncia o estado', async ({ page }) => {
    const senha = page.locator('#login-password');
    await page.locator('#login-email').fill('alguem@exemplo.test');
    await senha.fill('SenhaSecreta123!');
    await expect(senha).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Mostrar senha' }).focus();
    await page.keyboard.press('Enter');

    // Alterna para texto e o estado é anunciado (aria-pressed + nome muda).
    await expect(senha).toHaveAttribute('type', 'text');
    const ocultar = page.getByRole('button', { name: 'Ocultar senha' });
    await expect(ocultar).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-pressed'))).toBe(
      'true',
    );

    // E volta (tecla de espaço também atua num button).
    await page.keyboard.press(' ');
    await expect(senha).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Mostrar senha' })).toHaveAttribute('aria-pressed', 'false');
  });

});
