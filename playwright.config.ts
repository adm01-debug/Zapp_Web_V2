import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// E87: quarentena formal. Schema em e2e/quarantine.json; a validacao da forma e a cobranca
// do prazo vivem em scripts/ci/check-quarantine.mjs.
// Um spec em quarentena NAO roda -- o comportamento real do Playwright e "did not run", que
// e o efeito equivalente ao `fixme` pedido no plano, sem editar o spec para silencia-lo
// (test.fixme() tocaria arquivos que nao sao da etapa e esconderia o motivo dentro do teste).
// Caminho relativo à raiz, como o testDir abaixo: o Playwright roda a partir da raiz do repo.
function specsEmQuarentena(): string[] {
  try {
    const cru = JSON.parse(readFileSync('e2e/quarantine.json', 'utf8')) as {
      quarentena?: { spec?: string }[];
    };
    return (cru.quarentena ?? []).map((i) => i.spec).filter((s): s is string => Boolean(s));
  } catch {
    // Sem arquivo (ou com JSON invalido) nada e ignorado -- quem reclama disso e o
    // verificador, nao o runner de teste.
    return [];
  }
}

export default defineConfig({
  testDir: './e2e',
  // E87: specs em quarentena ficam fora da execucao.
  testIgnore: specsEmQuarentena(),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The Email fixture boots a full Vite app and captures visual artifacts. A
  // bounded local pool prevents cold-start starvation that made otherwise
  // independent specs observe the module-loading fallback after five seconds.
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  // Screenshots de referência: caminho fixo pedido pela etapa 90 do
  // PLANO_CONTATOS_100_ETAPAS_2026-09-29 — `e2e/__screenshots__/contacts-*.png`
  // (o padrão do Playwright jogaria tudo em `<spec>.ts-snapshots/` com sufixo de
  // projeto). `{platform}` fica no nome de propósito: uma baseline gerada em
  // outro SO não pode ser comparada com o render do Linux do `e2e-logado.yml`.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{platform}{ext}',
  expect: {
    // Tolerância da etapa 90 (0,2%). `animations: disabled` congela CountUp,
    // pills de layoutId e transições antes da foto.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' },
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
      // Tema e acessibilidade na tela deslogada: o teste precisa de navegador real (a
      // disputa é entre estilo INLINE no `<html>` e a classe `.high-contrast`) e não de
      // sessão — então roda no job de PR, sem `setup` e sem secrets.
      name: 'chromium-theme',
      testMatch: /theme-alto-contraste\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Login real (e2e/auth.setup.ts), executado só quando o projeto
      // "chromium-authenticated" ou "chromium-e2e-core" roda (via dependencies
      // abaixo) — nunca bloqueia o projeto "chromium" acima.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // conversation.spec.ts / messaging.spec.ts: specs autenticados do
      // e2e-logado.yml. Projeto dedicado (em vez de rodar via path de arquivo
      // no CLI sob "chromium-authenticated") para que uma única invocação do
      // Playwright resolva "setup" sozinha via dependencies — ver e2e/README.md.
      name: 'chromium-e2e-core',
      testMatch: [/conversation\.spec\.ts/, /messaging\.spec\.ts/],
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      // Demais specs assumem uma sessão já logada, produzida pelo projeto
      // "setup" e salva em e2e/.auth/user.json.
      // As specs do módulo MAPA (E71-E74) ficam de fora: usam sessão FALSA e não
      // podem depender do login real — ver o projeto `chromium-mapa` abaixo.
      name: 'chromium-authenticated',
      testIgnore: /auth\.spec\.ts|auth\.setup\.ts|conversation\.spec\.ts|messaging\.spec\.ts|location-picker\.spec\.ts|contact-address\.spec\.ts|contact-map-pin\.spec\.ts|contacts-snapshots\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      // Módulo MAPA (E71/E72 picker, E73 cadastro, E74 mapa com pino): sessão
      // FALSA injetada por `installFakeSession` (e2e/fixtures/talkx-demo.ts) com
      // REST/RPC do Supabase e a API da Mapbox 100% mockados — NÃO usam
      // E2E_TEST_EMAIL/E2E_TEST_PASSWORD nem o storageState do projeto "setup".
      // Projeto dedicado (mesmo padrão de `chromium-e2e-core` para
      // conversation/messaging e de `chromium-talkx-visual` para a régua visual)
      // para que as specs do mapa entrem EXPLICITAMENTE no `e2e-logado.yml` sem
      // arrastar a dependência do login real (etapa E75 do plano MAPA).
      name: 'chromium-mapa',
      testMatch: [/location-picker\.spec\.ts/, /contact-address\.spec\.ts/, /contact-map-pin\.spec\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Etapa 90 do plano de Contatos: screenshots de referência com sessão FALSA e
      // backend mockado (sem setup, sem secrets) — roda no job E2E de PR do ci.yml.
      name: 'chromium-contacts-visual',
      testMatch: /contacts-snapshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // talkx.spec.ts on Chromium — cobertura focada do Talk X usada pelo
      // workflow e2e-talkx.yml (PR), espelhando firefox-talkx/webkit-talkx.
      // Reusa o storageState gerado pelo projeto "setup".
      name: 'chromium-talkx',
      testMatch: /talkx\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      // talkx-visual.spec.ts — régua visual (X004): captura 1672×941, tema
      // escuro, com a sessão falsa + fixture de X003 (mockTalkXVisual). Roda
      // DESLOGADO (sem setup, sem secrets) no e2e-talkx.yml — a sessão é
      // injetada no localStorage pelo próprio spec.
      name: 'chromium-talkx-visual',
      testMatch: /talkx-visual\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1672, height: 941 },
        colorScheme: 'dark',
      },
    },
    {
      // talkx.spec.ts on Firefox — cross-browser coverage of the Talk X module.
      // Reuses the storageState generated by the "setup" project (auth cookies are
      // browser-agnostic; the same user.json works for all engine projects).
      name: 'firefox-talkx',
      testMatch: /talkx\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      // talkx.spec.ts on WebKit (Safari engine) — cross-browser coverage of the
      // Talk X module. Uses the same storageState as the other auth projects.
      name: 'webkit-talkx',
      testMatch: /talkx\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Safari'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      name: 'chromium-email-navy',
      testMatch: /email-navy-visual\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1672, height: 941 },
        colorScheme: 'dark',
      },
    },
    {
      // auth.spec.ts on Firefox — cross-browser login UI coverage.
      // No dependencies, no storageState: runs without E2E_TEST_EMAIL/E2E_TEST_PASSWORD,
      // safe to include in ci.yml (PR checks cannot reference those secrets).
      name: 'firefox-auth',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      // auth.spec.ts on WebKit (Safari engine) — cross-browser login UI coverage.
      // No dependencies, no storageState: safe to include in ci.yml.
      name: 'webkit-auth',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      // conversation.spec.ts / messaging.spec.ts on Firefox — cross-browser
      // coverage of the authenticated inbox. Reuses the storageState from setup.
      name: 'firefox-conversation',
      testMatch: [/conversation\.spec\.ts/, /messaging\.spec\.ts/],
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      // conversation.spec.ts / messaging.spec.ts on WebKit (Safari engine) —
      // cross-browser coverage of the authenticated inbox.
      name: 'webkit-conversation',
      testMatch: [/conversation\.spec\.ts/, /messaging\.spec\.ts/],
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Safari'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      // catalog.spec.ts (CT-82) no Firefox — paridade cross-browser do fluxo de
      // envio do catálogo (o aceite pede verde nos 3 browsers). O Chromium é
      // coberto pelo project `chromium-authenticated` (catch-all que já coleta
      // este spec); estes dois projects completam Firefox e WebKit. Reusa o
      // storageState do `setup` (sessão browser-agnostic).
      //
      // Só entram no `e2e-logado.yml` (login real) — NUNCA no `ci.yml`, que
      // lista explicitamente os projects deslogados.
      name: 'firefox-catalog',
      testMatch: /catalog\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      // catalog.spec.ts (CT-82) no WebKit (Safari engine).
      name: 'webkit-catalog',
      testMatch: /catalog\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Safari'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
  webServer: (() => {
    // A porta vem do proprio ambiente quando PLAYWRIGHT_BASE_URL e' definida.
    // Sem isso, a suite e' fixa em 5173 e, com `reuseExistingServer` fora do CI,
    // ela ADOTA o dev server que estiver la -- inclusive o de outro chat, o que
    // fazia o e2e de um workspace exercitar o codigo de outro (medido 02/10).
    const alvo = process.env.PLAYWRIGHT_BASE_URL;
    const url = alvo ?? 'http://127.0.0.1:5173';
    const porta = new URL(url).port || '5173';
    return {
      // O app de desenvolvimento usa 8080 por padrao; o E2E tem porta propria
      // para que a sonda do Playwright e o navegador exercitem o MESMO processo.
      // Fixture tests exercise both sides of the runtime kill switch.  This is
      // test-server-only; production still requires the build env and the
      // feature flag.  Without it, a complete CRM fixture can never reach the
      // panel and falsely validates only the disabled state.
      command: `VITE_CRM_INTEGRATION_ENABLED=true bun run dev -- --host 127.0.0.1 --port ${porta} --strictPort`,
      url,
      // Fora do CI o desenvolvedor costuma ja' ter o dev server no ar: reusar
      // a propria porta e' o comportamento util. O que nao pode acontecer e'
      // olhar para uma porta que nao e' a sua -- e isso o `url` acima resolve.
      reuseExistingServer: !process.env.CI,
    };
  })(),
});
