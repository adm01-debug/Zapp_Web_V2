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

// Reabre o contato fixo de E2E e garante que ele apareça na inbox.
//
// Dois problemas raiz identificados após PR #906 (ALTER POLICY contacts UPDATE
// TO authenticated):
//
// 1. STATUS: o PATCH REST passou a retornar 0 linhas silenciosamente quando
//    auth.uid() resolve para NULL (token expirado ou role=anon no gateway).
//    Fix: set_conversation_status (SECURITY DEFINER) — executa com privilégios
//    de owner e bypassa RLS completamente. Trata "invalid transition open->open"
//    como no-op (contato já está aberto).
//
// 2. INBOX VISIBILITY: InboxFilters.filteredConversations filtra contacts com
//    c.messages.length === 0 (FSM mode exige mensagens para não inflar a inbox
//    com contatos históricos sem atividade). O único message do fixture é de
//    2026-09-24 e cai fora da janela de 1000 mensagens após um dia de tráfego.
//    Fix: inserir uma message fresca antes de recarregar a página — a policy
//    INSERT de messages não tem WITH CHECK (qualquer authenticated insere).
export async function ensureFixtureConversationOpen(page: Page): Promise<void> {
  const accessToken = await getAccessToken(page);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Reabrir via RPC SECURITY DEFINER (bypassa RLS, atualiza
  //    conversation_status_changed_at = NOW() e updated_at = NOW())
  const rpcResponse = await page.request.post(
    `${SUPABASE_URL}/rest/v1/rpc/set_conversation_status`,
    {
      headers,
      data: { p_contact_id: E2E_FIXTURE_CONTACT_ID, p_next: 'open' },
    }
  );
  if (!rpcResponse.ok()) {
    const body = await rpcResponse.text().catch(() => '');
    // FSM não permite open -> open — contato já está open, continuar.
    if (!body.includes('invalid transition') && !body.includes('invalid_transition')) {
      throw new Error(
        `set_conversation_status falhou: HTTP ${rpcResponse.status()} ${body}`
      );
    }
  }

  // 2. Inserir mensagem fresca para garantir que o contato apareça na inbox
  //    (InboxFilters exige messages.length > 0; janela de 1000 msgs pode deixar
  //    mensagens antigas de fora quando o volume diário ultrapassa esse limite).
  //    A policy INSERT de messages não tem WITH CHECK — authenticated pode inserir.
  const msgResponse = await page.request.post(
    `${SUPABASE_URL}/rest/v1/messages`,
    {
      headers: { ...headers, Prefer: 'return=minimal' },
      data: {
        contact_id: E2E_FIXTURE_CONTACT_ID,
        sender: 'contact',
        content: '[E2E fixture setup]',
        message_type: 'text',
      },
    }
  );
  if (!msgResponse.ok()) {
    throw new Error(
      `Falha ao inserir mensagem de fixture: HTTP ${msgResponse.status()} ` +
        (await msgResponse.text().catch(() => ''))
    );
  }
}
