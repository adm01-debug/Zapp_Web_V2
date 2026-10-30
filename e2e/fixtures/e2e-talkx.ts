import type { Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-env';
// Conexão WhatsApp dedicada para E2E, semeada em produção (2026-09-28).
// DEVE ter status='connected' e instance_id preenchido — useCampaignEditor filtra
// por .eq('status','connected') e !instance_id; conexão disconnected não aparece no dropdown
// e o 7º spec (wizard avança para step 2) falharia com "Continuar" desabilitado.
// Ver supabase/migrations/_foreign/seed-talkx-connection.sql para reproduzir.
// NUNCA apagar esta linha do banco.
export const E2E_TALKX_CONNECTION_ID = 'e2e0e2e0-0000-4000-a000-e2e000000001';
export const E2E_TALKX_CONNECTION_LABEL = '[E2E] Conexão WhatsApp Teste (00000000000)';

// Segmento fixo semeado em produção para o usuário de teste E2E (supervisor).
// Criado via db_query: INSERT INTO talkx_segments ... (2026-09-27).
// NUNCA apagar este segmento do banco.
export const E2E_TALKX_SEGMENT_ID = '621521f3-e9c9-49c2-834e-cea07545d476';
export const E2E_TALKX_SEGMENT_NAME = '[E2E] Segmento de Teste';
// Regex pre-escaped para uso em getByRole({ name: ... }) — o accessible name do botão
// inclui status e contagem além do nome, então partial match é obrigatório.
export const E2E_TALKX_SEGMENT_REGEX = /\[E2E\] Segmento de Teste/;

function createExecutionId(): string {
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;

  // Stable across Playwright worker restarts/retries in the same GitHub run. Include
  // workflow/job so parallel workflows cannot clean one another's campaign drafts.
  if (runId && /^\d+$/.test(runId) && runAttempt && /^\d+$/.test(runAttempt)) {
    const workflow = process.env.GITHUB_WORKFLOW ?? '';
    const job = process.env.GITHUB_JOB ?? '';
    const digest = createHash('sha256')
      .update([runId, runAttempt, workflow, job].join('\0'))
      .digest('hex')
      .slice(0, 32);
    return `gha-${digest}`;
  }

  // Local runs have no stable CI execution boundary, so use a collision-resistant ID.
  return `local-${randomUUID()}`;
}

export const E2E_TALKX_EXECUTION_ID = createExecutionId();
const DRAFT_NAME_PATTERN = /^\[E2E TalkX:(gha-[a-f0-9]{32}|local-[0-9a-f-]{36}):[a-f0-9]{24}\] Campanha de Teste$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createE2ETalkXDraftName(projectName: string, testId: string): string {
  if (!projectName.trim() || !testId.trim()) {
    throw new Error('Recusado: projeto e ID do teste são obrigatórios para nomear um draft E2E.');
  }
  const testDigest = createHash('sha256')
    .update([E2E_TALKX_EXECUTION_ID, projectName, testId].join('\0'))
    .digest('hex')
    .slice(0, 24);
  return `[E2E TalkX:${E2E_TALKX_EXECUTION_ID}:${testDigest}] Campanha de Teste`;
}

function assertSafeDraftName(campaignName: string): void {
  const match = DRAFT_NAME_PATTERN.exec(campaignName);
  if (!match || !campaignName.startsWith(`[E2E TalkX:${E2E_TALKX_EXECUTION_ID}:`)) {
    throw new Error('Recusado: nome de draft não corresponde a esta execução E2E.');
  }
}

interface AuthIdentity {
  accessToken: string;
  userId: string;
}

async function getAuthIdentity(page: Page): Promise<AuthIdentity> {
  const identity = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as {
          access_token?: string;
          user?: { id?: string };
        };
        if (parsed.access_token && parsed.user?.id) {
          return { accessToken: parsed.access_token, userId: parsed.user.id };
        }
      } catch {
        // ignora entrada que não é o storage do supabase-js
      }
    }
    return null;
  });
  if (!identity?.accessToken || !UUID_PATTERN.test(identity.userId)) {
    throw new Error(
      'Sessão autenticada válida (token e UUID do usuário) não encontrada no localStorage — ' +
        'e2e/auth.setup.ts deveria ter rodado antes (projeto autenticado depende de "setup").'
    );
  }
  return identity;
}

/**
 * Build a fail-closed PostgREST DELETE URL for exactly one run-owned draft name.
 * No substring, LIKE, OR, or wildcard filter is allowed here.
 */
export function buildE2EDraftCleanupUrl(
  baseUrl: string,
  campaignName: string,
  userId: string,
): URL {
  assertSafeDraftName(campaignName);
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('Recusado: UUID do usuário inválido para cleanup de draft E2E.');
  }

  const url = new URL('/rest/v1/talkx_campaigns', baseUrl);
  url.searchParams.set('name', `eq.${campaignName}`);
  url.searchParams.set('created_by', `eq.${userId}`);
  url.searchParams.set('status', 'eq.draft');
  return url;
}

// Remove apenas drafts do usuário de teste com nome EXATO e marcador exclusivo
// desta execução. A policy RLS ainda exige created_by = auth.uid() e status = 'draft'.
export async function cleanupE2EDraftCampaigns(page: Page, campaignName: string): Promise<void> {
  assertSafeDraftName(campaignName);
  const identity = await getAuthIdentity(page);
  const url = buildE2EDraftCleanupUrl(SUPABASE_URL, campaignName, identity.userId);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${identity.accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  const response = await page.request.delete(url.toString(), {
    headers,
    maxRedirects: 0,
  });
  if (!response.ok()) {
    throw new Error(`[e2e-talkx] cleanup exato do draft falhou: HTTP ${response.status()}`);
  }
}
