import { test, expect } from '@playwright/test';

test.describe('Auth flows', () => {
  test('a seta do botão Entrar fica na mesma linha do rótulo em 360/768/1280', async ({ page }) => {
    await page.goto('/auth');
    const botao = page.getByRole('button', { name: /^entrar$/i });
    await expect(botao).toBeVisible();
    // Congela animação para a geometria não mudar durante a medição.
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });

    for (const largura of [360, 768, 1280]) {
      await page.setViewportSize({ width: largura, height: 900 });
      const geo = await botao.evaluate((el) => {
        const svg = el.querySelector('svg');
        const rotulo = Array.from(el.childNodes).find(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
        );
        if (!svg || !rotulo) throw new Error('botão Entrar sem rótulo ou sem ícone');
        const range = document.createRange();
        range.selectNodeContents(rotulo);
        const t = range.getBoundingClientRect();
        const s = svg.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return {
          rotulo: { top: Math.round(t.top), bottom: Math.round(t.bottom) },
          seta: { top: Math.round(s.top), bottom: Math.round(s.bottom) },
          desvioCentro: Math.round((Math.min(t.left, s.left) + Math.max(t.right, s.right)) / 2 - (b.left + b.right) / 2),
        };
      });

      // Mesma linha = a caixa da seta cruza verticalmente a caixa do rótulo.
      const sobreposicao =
        Math.min(geo.seta.bottom, geo.rotulo.bottom) - Math.max(geo.seta.top, geo.rotulo.top);
      expect(sobreposicao, `[${largura}px] seta fora da linha do rótulo: ${JSON.stringify(geo)}`).toBeGreaterThanOrEqual(4);
      // E o par rótulo+seta continua centralizado no botão (o alinhamento da V3 não mudou).
      expect(Math.abs(geo.desvioCentro), `[${largura}px] conteúdo descentralizado: ${JSON.stringify(geo)}`).toBeLessThanOrEqual(2);

      // Regra de design da V2: nada de rolagem horizontal.
      const rolagem = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(rolagem, `[${largura}px] rolagem horizontal`).toBeLessThanOrEqual(1);
    }
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^entrar$/i })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible();
  });

  test('login form validates email format', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /e-?mail/i }).fill('notanemail');
    await page.getByRole('button', { name: /entrar|login/i }).click();
    await expect(page.getByText(/e-?mail inv|e-?mail obr/i)).toBeVisible();
  });

  test('login email input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByRole('textbox', { name: /e-?mail/i }).first();
    await expect(emailInput).toHaveAttribute('maxlength', '255');
  });

  test('login password input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toHaveAttribute('maxlength', '200');
  });

  test('signup tab switches to registration form', async ({ page }) => {
    await page.goto('/');
    const signupTab = page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i });
    await signupTab.click();
    await expect(page.getByRole('textbox', { name: /nome/i })).toBeVisible();
  });

  test('signup name input respects maxLength', async ({ page }) => {
    await page.goto('/');
    const signupTab = page.getByRole('tab', { name: /criar conta|cadastro|sign.?up/i });
    await signupTab.click();
    const nameInput = page.getByRole('textbox', { name: /nome/i });
    await expect(nameInput).toHaveAttribute('maxlength', '100');
  });
});
