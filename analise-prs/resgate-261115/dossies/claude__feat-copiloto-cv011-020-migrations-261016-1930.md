# claude/feat-copiloto-cv011-020-migrations-261016-1930 (PR #1997)

- tip `e1c08eba4e0b7ea8671de5cd86e786e2472489f0` · merge_base `b94be0a2cfd530a1cf66b6cb3c58ae7824ae7cbd` · 26 commits
- Veredito: **PERDIDA_PARCIAL** · apagar branch: **não**
- Triagem anterior (2026-11-08) dizia `DECISAO_DONO`: **não se sustenta**. A regra vigente exclui banco/edge/workflow
  como motivo de DECISAO_DONO, e a lacuna que sobrou (presença + retenção) **reduz** custo de LLM e cobre LGPD,
  não cria custo nem contradiz regra da main.

## Propósito
Fase 2 do Copiloto RADAR (CV-011 a CV-020) só em banco + docs: 6 migrations (sessões, insights, feedback,
gatilho "cliente falou" com debounce, presença, retenção/LGPD) e 3 docs. Zero `src/`, zero edge, zero workflow
(`git diff --stat` = 9 arquivos, 469 inserções).

## Estado real da produção (`tnnnlkbymytvtqngbbqh`, leitura)
```
table   copilot_sessions | copilot_insights | copilot_feedback
func    enqueue_copilot_tick_on_contact_message
trigger trg_copilot_tick_on_contact_message
AUSENTES: copilot_insight_feedback, copilot_presence, copilot_retention_aggregates,
          run_copilot_retention, upsert_copilot_presence, copilot_has_presence,
          touch_copilot_sessions_updated_at, guard_copilot_insight_feedback_retained_at
migrations 2026101619xxxx: NENHUMA aplicada
cron.job com 'copilot': nenhum
publication supabase_realtime: copilot_insights (presente)
flag ai.capability.copilot_live = false · copilot_sessions/insights/feedback = 0 linhas
copilot_sessions (prod) = conversation_id, brinde_budget..brinde_delivery, brinde_meter, sale_stage, temperature(0-100), state_version, started_at, last_tick_at, closed_at, brinde_state, intent, sentiment, …
copilot_insights  (prod) = session_id, profile_id, insight_type, content, source, model_version, state_version, shown_at, used_at, dismissed_at, tier, latency_ms, data
```

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261016193000_copilot_sessions.sql` | **OBSOLETA** — a main implementou CV-011 com schema próprio e incompatível (prod bate com a main, não com a branch) | `origin/main:supabase/migrations/20261030100000_copilot_sessions.sql` (`conversation_id`, `brinde_*` colunas, `sale_stage` em nomes, `temperature 0-100`, `profile_id → auth.users(id)`); branch usa `whatsapp_connection_id`, `brinde_state jsonb`, `stage E1..E6`, `temperature 0-10`, `profile_id → public.profiles(id)` |
| `supabase/migrations/20261016193100_copilot_insights.sql` | **OBSOLETA** — CV-012 já existe na main com outro schema; realtime já publicado | `origin/main:supabase/migrations/20261030110000_copilot_insights.sql` (`insight_type` + `source` + `shown_at/used_at/dismissed_at`; `ALTER PUBLICATION supabase_realtime ADD TABLE`); prod confirma colunas e publicação |
| `supabase/migrations/20261016193200_copilot_feedback.sql` (`copilot_insight_feedback`) | **OBSOLETA no formato** — a main resolveu feedback com `copilot_feedback` (CV-065/066) e hook próprio | `origin/main:supabase/migrations/20261026130300_copilot_feedback.sql`; `origin/main:src/hooks/copilot/useCopilotFeedback.ts` (+ teste em `__tests__/useCopilotFeedback.test.ts`). Ressalva: a tabela da main tem RLS `WITH CHECK (true)` / `USING (true)` e guarda `suggestion_text`/`sent_text` sem prazo — ver lacuna de retenção |
| `supabase/migrations/20261016193300_copilot_tick_trigger.sql` | **INCORPORADA por outra via** — mesma intenção (CV-014/015) entrou depois na main | `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql:48-126`: mesma função/trigger, debounce 4 s (bucket `floor(epoch/4)` + `available_at = now()+4s`), flag `ai.capability.copilot_live`, guardas `deleted_at`/`is_lid_legacy`/`contact_type='cliente'`/`assigned_to`, upsert em `copilot_sessions`, `EXCEPTION WHEN OTHERS → WARNING`. Só não tem a validação de telefone 10-15 dígitos da branch (a main filtra por `contact_type`, cobertura equivalente para o caso de uso) |
| `supabase/migrations/20261016193400_copilot_presence.sql` | **PERDIDA** — nada equivalente na main nem na produção | `git grep -l 'copilot_presence' origin/main -- supabase/ src/` = vazio (só dossiês em `docs/_arquivo/`); `supabase/functions/copilot-live/` não tem nenhuma menção a presence/visibilidade |
| `supabase/migrations/20261016193500_copilot_retention.sql` | **PERDIDA** — sem retenção de dados do copiloto na main nem cron em produção | `git grep -il 'run_copilot_retention' origin/main -- supabase/` = vazio; `select … from cron.job where jobname ilike '%copilot%'` = 0 linhas |
| `docs/LGPD-RETENTION-POLICY.md` (seção 4.6) | **PERDIDA** — doc na main segue v1.0 sem nenhuma linha sobre copiloto | `git show origin/main:docs/LGPD-RETENTION-POLICY.md` → `**Versão:** 1.0`, seções 4.1–4.5 apenas, histórico termina em 1.0 |
| `docs/REALTIME-CHANNELS-INVENTORY.md` | **PERDIDA (parcial, texto precisa correção)** — inventário da main não lista o canal do copiloto, embora ele exista no front e na publication | `git show origin/main:docs/REALTIME-CHANNELS-INVENTORY.md` seções 2 e 5 sem `copilot`; o canal real na main é `copilot_insights:${sessionId}` (underscore) em `origin/main:src/hooks/copilot/useLiveSuggestions.ts:121-124`, não `copilot-insights:{sessionId}` / `useCopilotInsights` como a branch escreveu |
| `docs/copiloto/CV-016-coalescencia-delegada.md` | **PERDIDA de valor baixo** — doc de 15 linhas marcando a etapa como delegada a IA-048; contrato descrito (`state_version` da sessão aborta INSERT antigo) não é o que a main faz hoje | arquivo ausente: `git ls-tree origin/main docs/copiloto/` lista só CV-001..CV-008 |

## Lacunas a recuperar

### 1. CV-017 — presença (porteiro de custo do RADAR) — valor médio
Serve para o worker só gastar LLM quando alguém está com a conversa aberta (TTL 90 s). A main não tem nada disso
e `copilot-live` processa toda mensagem de contato com a flag ligada. **Precisa adaptação**: em produção
`copilot_sessions.profile_id` referencia `auth.users(id)` (não `public.profiles(id)`), então as subconsultas
`SELECT id FROM public.profiles WHERE user_id = auth.uid()` devem virar `auth.uid()` direto.

Hunk da branch (`supabase/migrations/20261016193400_copilot_presence.sql`):
```sql
CREATE TABLE IF NOT EXISTS public.copilot_presence (
  session_id  uuid        NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  profile_id  uuid        NOT NULL REFERENCES public.profiles(id),   -- ADAPTAR: auth.users(id)
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '90 seconds',
  PRIMARY KEY (session_id, profile_id)
);
CREATE INDEX copilot_presence_session ON public.copilot_presence (session_id);
ALTER TABLE public.copilot_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY copilot_presence_own ON public.copilot_presence
  FOR ALL TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND session_id IN (
      SELECT id FROM public.copilot_sessions
      WHERE profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    AND expires_at <= now() + interval '5 minutes'   -- cap: cliente não estica o TTL
  );
CREATE POLICY copilot_presence_service ON public.copilot_presence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.upsert_copilot_presence(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE v_profile_id uuid;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.copilot_sessions
                  WHERE id = p_session_id AND profile_id = v_profile_id) THEN RETURN; END IF;
  INSERT INTO public.copilot_presence (session_id, profile_id, expires_at)
  VALUES (p_session_id, v_profile_id, now() + interval '90 seconds')
  ON CONFLICT (session_id, profile_id) DO UPDATE SET expires_at = now() + interval '90 seconds';
END; $$;

CREATE OR REPLACE FUNCTION public.copilot_has_presence(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
  -- service_role (worker): auth.uid() NULL → qualquer presença ativa basta.
  SELECT EXISTS (
    SELECT 1 FROM public.copilot_presence cp
     WHERE cp.session_id = p_session_id AND cp.expires_at > now()
       AND (auth.uid() IS NULL
            OR cp.profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())));
$$;
```
Para ficar ponta a ponta falta ainda: heartbeat no front (chamar `upsert_copilot_presence` no painel do RADAR) e
checagem de `copilot_has_presence` em `supabase/functions/copilot-live/index.ts` antes de chamar o modelo.

### 2. CV-019 — retenção/LGPD dos dados do copiloto — valor médio (pré-requisito antes de ligar a flag)
Hoje não há prazo nem purge para `copilot_insights.content` (texto derivado da conversa) nem para
`copilot_feedback.suggestion_text/sent_text`. Com a flag desligada e 0 linhas o risco é latente, não ativo —
mas precisa existir antes de `ai.capability.copilot_live = true`.

**Precisa adaptação ao schema real**: `copilot_insights` tem `insight_type` (não `type`) e já traz `profile_id`
(dispensa o JOIN com `copilot_sessions`); não existe `copilot_insight_feedback` — a tabela de feedback da main é
`copilot_feedback` e **não tem** `profile_id` nem `retained_at` (tem `conversation_id`, `contact_id`,
`feedback_type`, `suggestion_text`, `sent_text`). Portar exige decidir a chave de agregação do feedback
(ou adicionar `retained_at` em `copilot_feedback`).

Hunk da branch (`supabase/migrations/20261016193500_copilot_retention.sql`):
```sql
CREATE TABLE IF NOT EXISTS public.copilot_retention_aggregates (
  period_start    date        NOT NULL,
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  insight_type    text        NOT NULL DEFAULT '',   -- '' = dimensão ausente
  feedback_action text        NOT NULL DEFAULT '',
  count           integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (period_start, profile_id, insight_type, feedback_action)
);
ALTER TABLE public.copilot_retention_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "copilot_retention_aggregates_service" ON public.copilot_retention_aggregates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.run_copilot_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
BEGIN
  -- 1. agrega insights > 90 dias (JOIN sessions só porque a versão da branch não tinha profile_id)
  INSERT INTO public.copilot_retention_aggregates (period_start, profile_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', i.created_at)::date, cs.profile_id, i.type, '', count(*)
  FROM public.copilot_insights i JOIN public.copilot_sessions cs ON cs.id = i.session_id
  WHERE i.created_at < now() - interval '90 days' GROUP BY 1,2,3,4
  ON CONFLICT (period_start, profile_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;
  -- 2. apaga insights > 90 dias
  DELETE FROM public.copilot_insights WHERE created_at < now() - interval '90 days';
  -- 3. agrega feedback > 30 dias ainda não retido (retained_at IS NULL = sentinel de idempotência)
  INSERT INTO public.copilot_retention_aggregates (period_start, profile_id, insight_type, feedback_action, count)
  SELECT date_trunc('day', f.created_at)::date, f.profile_id, '', f.action, count(*)
  FROM public.copilot_insight_feedback f
  WHERE f.created_at < now() - interval '30 days' AND f.retained_at IS NULL GROUP BY 1,2,3,4
  ON CONFLICT (period_start, profile_id, insight_type, feedback_action)
    DO UPDATE SET count = copilot_retention_aggregates.count + EXCLUDED.count;
  -- 4. anonimiza o texto, preserva a ação
  UPDATE public.copilot_insight_feedback SET retained_at = now(), final_text = NULL
   WHERE created_at < now() - interval '30 days' AND retained_at IS NULL;
END; $$;

REVOKE EXECUTE ON FUNCTION public.run_copilot_retention() FROM PUBLIC, authenticated;
SELECT cron.schedule('copilot-retention-daily', '35 2 * * *', $$SELECT public.run_copilot_retention()$$);
```
Também vale portar o guard de `retained_at` (de `20261016193200_copilot_feedback.sql`) se `copilot_feedback`
ganhar a coluna: trigger `BEFORE INSERT OR UPDATE` que força `retained_at := OLD.retained_at` e zera o texto
quando o contexto é cliente (`current_setting('request.jwt.claims', true) IS NOT NULL AND current_user = 'authenticated'`).

> Atenção para o fluxo: é DELETE recorrente de dado de produção por cron — o dono precisa confirmar os prazos
> (90 d insights / 30 d texto de feedback) antes do apply.

### 3. `docs/LGPD-RETENTION-POLICY.md` seção 4.6 — valor baixo (acompanha a lacuna 2)
Portar junto com a retenção, corrigindo nomes para o schema real (`copilot_insights.insight_type`,
`copilot_feedback` em vez de `copilot_insight_feedback`) e bumpando `**Versão:** 1.0 → 1.1` + linha no
histórico de revisões. Texto da branch (tabela de prazos + "Mecanismo: `run_copilot_retention()` + pg_cron
diário às 02:35 UTC") está no diff `git diff b94be0a2 origin/claude/feat-copiloto-cv011-020-migrations-261016-1930 -- docs/LGPD-RETENTION-POLICY.md`.
Obs.: a branch também trocava `|--------|---------------|----------|` por `|-----------|` na seção 7.1 — churn, não portar.

### 4. `docs/REALTIME-CHANNELS-INVENTORY.md` — valor baixo
O canal do copiloto existe de verdade e não está no inventário. Portar **corrigido**:
linha na seção 2 → `` | `copilot_insights:{sessionId}` | `copilot_insights` | `session_id=eq.{sessionId}` | sessão | `src/hooks/copilot/useLiveSuggestions.ts:121` | ``
e linha na seção 5 → `` | `copilot_insights` | `20261030110000_copilot_insights.sql` | ``.
Não portar o bloco "## copilot_insights — painel ao vivo do RADAR (CV-018)" nem "## Regras gerais (desde CV-018)"
como estão: citam `copilot-insights:{sessionId}`, hook `useCopilotInsights` "a criar em CV-041" e a migration
`20261016193100` que nunca foi aplicada.

### 5. `docs/copiloto/CV-016-coalescencia-delegada.md` — valor nenhum
Doc de 15 linhas que delega coalescência ao IA-048 e descreve um contrato (`state_version` menor aborta o INSERT)
que a main não implementa (o motor atual usa bucket de 4 s e `ON CONFLICT DO NOTHING`). Portar só criaria doc
divergente da realidade.

## Por que não apagar a branch
As lacunas 1 e 2 (presença e retenção) existem só aqui — são ~117 linhas de SQL com decisões já revisadas
(14 commits de `fix:` em cima, incluindo RLS, re-identificabilidade LGPD, idempotência de agregação e
`search_path`). Apagar antes de portar perde esse histórico de correções.

## Verificação adversarial

Parecer: **CONCORDO** com PERDIDA_PARCIAL. Tentei refutar por três vias (main cobre presença por outro
nome; retenção genérica cobre o copiloto; remoção deliberada) e nenhuma se sustentou.

### 1. Presença (CV-017) — lacuna confirmada, não coberta
- `git grep -lE 'copilot_presence|upsert_copilot_presence|copilot_has_presence' origin/main` só retorna
  dossiês arquivados (`docs/_arquivo/...`, `analise/dossies/...`) — nenhum arquivo de `supabase/` ou `src/`.
- Candidato mais forte a substituto: `origin/main:supabase/migrations/20260924195600_agent_presence_server_side.sql`
  + `20260925100542_agent_presence_server_ttl.sql` + `src/hooks/crm/useAgentPresence.ts:13`. **Não cobre**:
  `agent_presence` é online/offline global do agente (status + heartbeat 25 s, expira em 90 s), sem
  `session_id`/conversa. O porteiro do CV-017 é por conversa (`PRIMARY KEY (session_id, profile_id)`).
- Prova de que a main gasta IA sem porteiro: `origin/main:supabase/migrations/20261115010000_copilot_live_motor.sql:60-110`
  — as únicas guardas antes do `INSERT INTO ai_jobs` são flag, `deleted_at`, `is_lid_legacy`,
  `contact_type='cliente'` e `assigned_to IS NOT NULL`. Nenhuma checagem de presença/aba aberta.
- `git grep -nE 'presence|heartbeat' origin/main -- supabase/functions/copilot-live` → nada.

### 2. Retenção (CV-019) — lacuna confirmada e maior do que a triagem descreveu
- `git log -S'run_copilot_retention' --oneline origin/main -- supabase/` → vazio; idem `-S'copilot_presence'`.
  Nunca entrou na main, logo **não foi removido de propósito**.
- Nenhuma retenção genérica cobre o copiloto: os crons de limpeza da main são de outros domínios
  (`20260826210100_cron_cleanup_link_preview_cache.sql`, `talkx-storage-purge`, `cleanup-rate-limit-logs`).
- Agravante não citado na triagem: a tabela de feedback que está em produção,
  `origin/main:supabase/migrations/20261026130300_copilot_feedback.sql:2-14`, guarda **`suggestion_text` e
  `sent_text`** (texto do cliente/vendedor) sem prazo, sem `retained_at` e sem `final_text_hash`. A
  retenção a portar precisa cobrir essas duas colunas, não só o `final_text` do desenho da branch.

### 3. Estado de produção (MCP, leitura)
`t_presence=0, t_retention=0, t_insight_feedback=0, fns=0, cron_copilot=0, flag=false,
n_sessions=0, n_insights=0, n_feedback=0, feedback_ret_cols=0` — confere com a triagem: nada vaza hoje,
mas também não existe prazo nem purge para quando a flag subir.

### 4. Correções ao dossiê (encaixe no código atual)
- **`docs/copiloto/CV-016-coalescencia-delegada.md` é obsoleto**, não lacuna: a garantia que o doc descreve
  (descartar resultado de versão antiga) já está implementada na main com trava otimista —
  `origin/main:supabase/functions/_shared/copilot-tick.ts:518-522` (`.eq("state_version", s.state_version)`
  → `skipped: "stale_state"`) e idempotência por versão na linha 447. Portar o doc só valeria reescrito
  apontando para esse mecanismo.
- `supabase/migrations/20261016193500_copilot_retention.sql` **não aplica como está**: referencia
  `copilot_insight_feedback` (inexistente) e `i.type` (em produção é `insight_type`,
  `origin/main:supabase/migrations/20261030110000_copilot_insights.sql:10`). É reescrita, não cherry-pick.
- O guard `guard_copilot_insight_feedback_retained_at()` (branch, `20261016193200_copilot_feedback.sql:63-88`)
  só faz sentido junto com a retenção portada — não é lacuna independente.
- Adaptação de RLS confirmada: em produção `copilot_sessions.profile_id` referencia `auth.users(id)`
  (`origin/main:supabase/migrations/20261030100000_copilot_sessions.sql:8`) e a política de insights é
  `profile_id = auth.uid()`; as subconsultas `SELECT id FROM public.profiles WHERE user_id = auth.uid()`
  da branch viram `auth.uid()`.

### 5. Não rebaixo para DECISAO_DONO, mas há um ponto para o dono
A triagem de 28/04 marcou a PR 1997 como DECISAO_DONO; DDL sozinho não justifica (o dono autorizou banco).
O que exige o dono é só o **prazo**: a retenção é `DELETE`/anonimização recorrente em produção (90 d
insights, 30 d texto de feedback). Portar o mecanismo é execução; confirmar os dois prazos é uma pergunta
de uma linha no momento do apply.

Branch: **não apagar** até presença e retenção estarem portadas e aplicadas.
