import type { Page } from '@playwright/test';

const SUPABASE_URL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubm5sa2J5bXl0dnRxbmdiYnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjU0MDEsImV4cCI6MjEwMzMwMTQwMX0.4kDVowXzo3yBVboLOFn1bsij-vBKncJXVoPot3iknC0';

// Conexão WhatsApp existente em produção, visível ao usuário de teste (supervisor).
// Pode estar disconnected — o wizard só exige selecionar, não que esteja conectada.
export const E2E_TALKX_CONNECTION_ID = '3b0f7f2e-887a-4c00-97de-012313649f9b';
export const E2E_TALKX_CONNECTION_LABEL = 'Promo Brindes WhatsApp (551146375517)';

// Segmento fixo semeado em produção para o usuário de teste E2E (supervisor).
// Criado via db_query: INSERT INTO talkx_segments ... (2026-09-27).
// NUNCA apagar este segmento do banco.
export const E2E_TALKX_SEGMENT_ID = '621521f3-e9c9-49c2-834e-cea07545d476';
export const E2E_TALKX_SEGMENT_NAME = '[E2E] Segmento de Teste';
// Regex pre-escaped para uso em getByRole({ name: ... }) — o accessible name do botão
// inclui status e contagem além do nome, então partial match é obrigatório.
export const E2E_TALKX_SEGMENT_REGEX = /\[E2E\] Segmento de Teste/;

async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // ignora entrada que não é o storage do supabase-js
      }
    }
    return null;
  });
  if (!token) {
    throw new Error(
      'Sessão do Supabase não encontrada no localStorage — e2e/auth.setup.ts deveria ' +
        'ter rodado antes (project "chromium-authenticated" depende de "setup").'
    );
  }
  return token;
}

// Remove rascunhos de campanha criados pelo usuário de teste durante os testes.
// Chamado em afterAll para evitar acúmulo de drafts em produção a cada run de CI.
// A policy RLS de DELETE em talkx_campaigns exige: created_by = auth.uid() AND status = 'draft'.
export async function cleanupE2EDraftCampaigns(page: Page): Promise<void> {
  const accessToken = await getAccessToken(page);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  // Filtra por name com prefixo [E2E] e status draft — só apaga o que os testes criaram.
  const resp = await page.request.delete(
    `${SUPABASE_URL}/rest/v1/talkx_campaigns?name=like.*%5BE2E%5D*&status=eq.draft`,
    { headers }
  );
  if (!resp.ok() && resp.status() !== 404) {
    // Loga mas não lança — falha de cleanup não deve quebrar o resultado do teste.
    console.warn(`[e2e-talkx] cleanup draft campaigns: HTTP ${resp.status()}`);
  }
}
