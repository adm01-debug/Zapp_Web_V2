import type { Page } from '@playwright/test';

// Mesmos valores de src/config/supabase.ts / src/integrations/supabase/client.ts —
// ambos públicos por design (URL do projeto + anon key). Duplicados aqui porque o
// runner do Playwright não resolve o alias de bundler "@/" usado no app.
const SUPABASE_URL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubm5sa2J5bXl0dnRxbmdiYnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjU0MDEsImV4cCI6MjEwMzMwMTQwMX0.4kDVowXzo3yBVboLOFn1bsij-vBKncJXVoPot3iknC0';

// Contato fixo em produção, atribuído ao usuário de teste E2E
// (e2e.zapp@promobrindes.com.br, perfil agente) — é o único contato que esse
// usuário enxerga no inbox (sem fila, sem grants de visibilidade extra), então
// qualquer teste que abra "o primeiro item da lista" cai sempre nele.
export const E2E_FIXTURE_CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
export const E2E_FIXTURE_CONTACT_NAME = '[E2E] Contato de teste - nao apagar';

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

// trg_contacts_fsm_transition (enforce_conversation_status_transition) permite
// resolved -> open, então reabrir antes de cada teste é seguro mesmo que a run
// anterior tenha encerrado a conversa via close_conversation_atomic — esta suíte
// roda contra produção (e2e-logado.yml), não um banco descartável por execução.
export async function ensureFixtureConversationOpen(page: Page): Promise<void> {
  const accessToken = await getAccessToken(page);
  const response = await page.request.patch(
    `${SUPABASE_URL}/rest/v1/contacts?id=eq.${E2E_FIXTURE_CONTACT_ID}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      data: { conversation_status: 'open' },
    }
  );
  if (!response.ok()) {
    throw new Error(
      `Falha ao reabrir o contato fixo de E2E antes do teste: HTTP ${response.status()} ` +
        (await response.text())
    );
  }
}
