import type { Locator, Page } from '@playwright/test';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-env';
// ambos públicos por design (URL do projeto + anon key). Duplicados aqui porque o
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

// Sessao do Supabase no localStorage: token + id do usuario logado.
// O id e' o que permite resolver o PROFILE do caller — `message_reactions.user_id`
// guarda `profiles.id`, nao `auth.users.id`.
async function getSession(page: Page): Promise<{ accessToken: string; userId: string | null }> {
  const session = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string; user?: { id?: string } };
        if (parsed.access_token) {
          return { access_token: parsed.access_token, user_id: parsed.user?.id ?? null };
        }
      } catch {
        // ignora entrada que não é o storage do supabase-js
      }
    }
    return null;
  });
  if (!session?.access_token) {
    throw new Error(
      'Sessão do Supabase não encontrada no localStorage — e2e/auth.setup.ts deveria ' +
        'ter rodado antes (project "chromium-authenticated" depende de "setup").'
    );
  }
  return { accessToken: session.access_token, userId: session.user_id };
}

async function getAccessToken(page: Page): Promise<string> {
  return (await getSession(page)).accessToken;
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

// Remove as mensagens "[E2E fixture setup]" inseridas por ensureFixtureConversationOpen.
// Chamar dentro de test.afterAll para manter o histórico do contato limpo entre runs.
export async function cleanupFixtureMessages(page: Page): Promise<void> {
  const accessToken = await getAccessToken(page);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  await page.request.delete(
    `${SUPABASE_URL}/rest/v1/messages?contact_id=eq.${E2E_FIXTURE_CONTACT_ID}&content=eq.[E2E%20fixture%20setup]`,
    { headers }
  );
}

// Perfil do usuario de teste NO CI (e2e.zapp@promobrindes.com.br). Mantido so como
// referencia historica: NAO serve para limpeza — o profile muda com quem esta logado.
export const E2E_FIXTURE_PROFILE_ID_CI = '2264678e-17f4-4b4e-b89b-5fc4852bfa86';

// Profile de QUEM ESTA LOGADO. `message_reactions.user_id` guarda `profiles.id`
// (nao `auth.users.id`): o usuario do CI tem um profile diferente do usuario de QA
// local (qa.*). Enquanto o cleanup usava um valor FIXO, no QA o DELETE batia em 0
// linhas, as reacoes se acumulavam entre runs e o clique em `quick-reaction-emoji`
// passava a REMOVER em vez de ADICIONAR (hasReacted=true) — as falhas :53 e :88
// ("element(s) not found" no badge), medidas em 02/10/2026.
async function getCurrentProfileId(page: Page): Promise<string | null> {
  const { accessToken, userId } = await getSession(page);
  if (!userId) return null;
  const resp = await page.request.get(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=id&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok()) return null;
  const rows = (await resp.json()) as Array<{ id?: string }>;
  return Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
}

// Remove as reacoes do usuario LOGADO **no contato de teste** (item 96 / R2-INF-006).
// Chamar em beforeEach E afterAll de reactions.spec.ts.
//
// ESCOPO OBRIGATORIO: a policy de DELETE ('Users can delete their own reactions')
// so conhece `user_id = profile do caller`, sem olhar contato/mensagem. Um filtro
// apenas por `user_id` apagava TODAS as reacoes do usuario logado — em qualquer
// conversa, nao so as escritas por este E2E (numa conta de QA real isso e perda de
// dado). `contact_id` e o mesmo vinculo gravado pelo app no upsert
// (useReactionMutations.addMutation), entao escopar por ele cobre exatamente o que
// esta suite escreve e nada mais.
// Sem limpeza: hasReacted de emoji retorna true em runs seguintes → clique REMOVE
// em vez de ADICIONAR → badge desaparece → toBeVisible falha (root cause das falhas :41 :65).
// RLS: policy 'Users can delete their own reactions' cobre user_id = profile.id do caller.
//
// `Prefer: return=representation` existe para o cleanup nao ser silencioso: com RLS o
// DELETE pode responder 200 apagando 0 linhas, e era esse silencio que escondia o
// profile errado. O teste nao depende disto — o alvo e normalizado pela UI em
// `ensureReactionAbsent` —, mas o aviso aparece no log/trace quando nada foi apagado.
export async function cleanupE2EReactions(page: Page): Promise<void> {
  const { accessToken } = await getSession(page);
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const profileId = await getCurrentProfileId(page);
  if (!profileId) {
    console.warn('[e2e-contact] cleanupE2EReactions: profile do usuario logado nao resolvido');
    return;
  }
  const resp = await page.request.delete(
    `${SUPABASE_URL}/rest/v1/message_reactions?user_id=eq.${profileId}&contact_id=eq.${E2E_FIXTURE_CONTACT_ID}`,
    { headers }
  );
  if (!resp.ok() && resp.status() !== 404) {
    console.warn(
      `[e2e-contact] cleanupE2EReactions: HTTP ${resp.status()} ${await resp.text().catch(() => '')}`
    );
    return;
  }
  const apagadas = (await resp.json().catch(() => [])) as unknown[];
  if (Array.isArray(apagadas) && apagadas.length === 0) {
    console.warn('[e2e-contact] cleanupE2EReactions: 0 reacoes apagadas (RLS ou ja limpo)');
  }
}

// Garante que o alvo NAO tem a reacao do usuario logado — pela propria UI, entao
// independe de RLS, de cleanup por API e de qual profile esta logado.
// Deterministico por medicao: com a reacao presente, clicar no emoji da barra rapida
// REMOVE (hasReacted=true) e o teste que espera "adicionar" falha. Tirar o hover antes
// do clique e obrigatorio — com hover ativo a barra fica por cima do badge e intercepta.
export async function ensureReactionAbsent(
  page: Page,
  message: Locator,
  emoji: string
): Promise<void> {
  const badge = message.locator(`[data-testid="reaction-badge"][data-emoji="${emoji}"]`);
  if ((await badge.count()) === 0) return;
  await page.mouse.move(0, 0);
  await badge.click();
  await badge.waitFor({ state: 'detached', timeout: 8_000 });
}

// `true` quando o contato fixture ja tem encerramento registrado HOJE.
//
// Medido (run local com o usuario de QA): `close_conversation_atomic` insere em
// `conversation_closures`, que tem indice unico
// `conversation_closures_contact_day_uidx (contact_id, conversation_closure_day(created_at))`
// — ou seja, **um encerramento por contato por dia** (migration
// 20260927590000_conversation_closures_dedupe_and_unique_per_day.sql, com
// `conversation_closure_day = (created_at AT TIME ZONE 'America/Sao_Paulo')::date`).
// Consequencias medidas:
//   - o 2o encerramento do dia devolve HTTP 409 / code 23505 e o app mostra
//     "Nao foi possivel encerrar a conversa...". Confirmado no trace do Playwright
//     (CONSOLE warning [CloseConversationDialog] Falha no encerramento atomico
//     {code: 23505, details: Key (contact_id, conversation_closure_day(created_...)}).
//   - o token do usuario NAO consegue limpar a linha: DELETE com RLS devolve 200 e
//     remove 0 linhas (confirmado com `Prefer: return=representation`). O teardown
//     do e2e-logado.yml limpa com service role apenas ENTRE RUNS, nunca entre
//     tentativas do mesmo run.
// Por isso um retry do Playwright depois de um encerramento bem-sucedido nunca
// podia passar. Os testes usam esta checagem para validar o comportamento correto
// nos dois cenarios (encerra quando o dia esta livre; recusa quando ja encerrou).
export async function fixtureHasClosureToday(page: Page): Promise<boolean> {
  const accessToken = await getAccessToken(page);
  const response = await page.request.get(
    `${SUPABASE_URL}/rest/v1/conversation_closures` +
      `?contact_id=eq.${E2E_FIXTURE_CONTACT_ID}&select=created_at&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.ok()) return false; // indisponivel nao bloqueia o caminho feliz
  const rows = (await response.json()) as Array<{ created_at?: string }>;
  const criadoEm = Array.isArray(rows) ? rows[0]?.created_at : null;
  if (!criadoEm) return false;
  // Mesma regra do indice unico: o dia do encerramento e o dia em America/Sao_Paulo.
  const diaSp = (iso: string | Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(typeof iso === 'string' ? new Date(iso) : iso);
  return diaSp(criadoEm) === diaSp(new Date());
}
