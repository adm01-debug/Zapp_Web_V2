import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../playwright.config';
import { browserEnvironment, ORIGIN } from './runtime-contract.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const browserEnv = browserEnvironment(process.env);

// Keep every existing project, dependency and assertion. The controller owns
// Vite/gateway and mounts only these ephemeral output paths as writable.
export default defineConfig({
  ...base,
  testDir: path.join(root, 'e2e'),
  outputDir: '/output/test-results',
  webServer: undefined,
  updateSnapshots: 'none',
  reporter: [
    ['line'],
    ['json', { outputFile: '/output/results.json' }],
    ['html', { outputFolder: '/output/playwright-report', open: 'never' }],
  ],
  use: {
    ...base.use,
    baseURL: ORIGIN,
    launchOptions: { ...base.use?.launchOptions, env: browserEnv },
  },
  projects: base.projects?.map(project => ({
    ...project,
    use: {
      ...project.use,
      launchOptions: { ...base.use?.launchOptions, ...project.use?.launchOptions, env: browserEnv },
    },
  })),
});
