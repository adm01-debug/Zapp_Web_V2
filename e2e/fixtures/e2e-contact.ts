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

// A lista de conversas NAO renderiza o nome completo do contato: cada item
// mostra `contact.nickname?.trim() || name.split(' ')[0]` — a primeira palavra
// do nome — desde o #816 (ver src/components/inbox/VirtualizedRealtimeList.tsx).
// Sem apelido no fixture, o item exibe exatamente "[E2E]", entao filtrar pelo
// E2E_FIXTURE_CONTACT_NAME completo nunca casa (element(s) not found, run
// 36262158460). Este token e o prefixo exibido — casa tanto com o nome
// truncado quanto com o nome completo, caso a exibicao mude de novo.
export const E2E_FIXTURE_CONTACT_DISPLAY_NAME = E2E_FIXTURE_CONTACT_NAME.split(' ')[0];

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
//
// Usa set_conversation_status (SECURITY DEFINER) em vez do PATCH REST direto:
// o PATCH passa por RLS e auth.uid() pode resolver para NULL em certas
// configurações de PostgREST (ex. token expirado ou role=anon no gateway),
// retornando 0 linhas silenciosamente. A RPC SECURITY DEFINER executa com
// os privilégios do owner da função e bypassa RLS por design — garantindo que
// o fixture reabra independente do estado do JWT ou da política de UPDATE.
// Referência: PR #906 alterou a policy contacts UPDATE para TO authenticated;
// o RPC set_conversation_status também atualiza conversation_status_changed_at
// = NOW(), então o contato aparece no topo do inbox ordenado por data.
export async function ensureFixtureConversationOpen(page: Page): Promise<void> {
  const accessToken = await getAccessToken(page);
  const response = await page.request.post(
    `${SUPABASE_URL}/rest/v1/rpc/set_conversation_status`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        p_contact_id: E2E_FIXTURE_CONTACT_ID,
        p_next: 'open',
      },
    }
  );
  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    // FSM não permite open -> open. Se o contato já está 'open' (p.ex. se o
    // primeiro teste da suíte foi pulado), continua normalmente.
    if (body.includes('invalid transition') || body.includes('invalid_transition')) return;
    throw new Error(
      `Falha ao reabrir o contato fixo de E2E via RPC: HTTP ${response.status()} ${body}`
    );
  }
}
