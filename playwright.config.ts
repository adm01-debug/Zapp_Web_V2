import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // auth.spec.ts exercita a tela de login deslogada (tabs, validação de
      // formulário) e nunca deve depender do projeto "setup" — rodar só este
      // projeto (ex: npx playwright test --project=chromium) precisa continuar
      // funcionando mesmo sem E2E_TEST_EMAIL/E2E_TEST_PASSWORD definidas.
      name: 'chromium',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Login real (e2e/auth.setup.ts), executado só quando o projeto
      // "chromium-authenticated" roda (via dependsOn abaixo) — nunca bloqueia
      // o projeto "chromium" acima.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Demais specs assumem uma sessão já logada, produzida pelo projeto
      // "setup" e salva em e2e/.auth/user.json.
      name: 'chromium-authenticated',
      testIgnore: /auth\.spec\.ts|auth\.setup\.ts/,
      dependsOn: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
  webServer: {
    // The application development server intentionally defaults to port 8080.
    // E2E owns an isolated port so Playwright's readiness probe and its browser
    // always exercise the same process, including while a developer is running
    // the app locally on the default port.
    command: 'bun run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
