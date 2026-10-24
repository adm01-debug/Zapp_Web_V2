import { defineConfig, devices } from '@playwright/test';
import 'node:path';

/**
 * Runner LOCAL de agente (não faz parte da entrega).
 *
 * A guarda da fábrica proíbe o agente de rodar o projeto `chromium-authenticated`
 * (usa sessão salva em e2e/.auth); a spec desta entrega é HERMÉTICA (sessão falsa
 * + backend mockado) e não precisa de sessão nenhuma. Este config declara o
 * projeto deslogado equivalente para medir a spec no runtime real.
 */
export default defineConfig({
  testDir: '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/t-6d598fc3-2610071913c226/e2e',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5579',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium-deslogado',
      testMatch: /(busca-global-paleta|zz-explorar[23]?)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
