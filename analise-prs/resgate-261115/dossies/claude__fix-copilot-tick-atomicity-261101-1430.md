# Dossiê — claude__fix-copilot-tick-atomicity-261101-1430 (PR #2500)

**Branch** `origin/claude/fix-copilot-tick-atomicity-261101-1430` · tip `3f68240b9` · merge-base `1252bb5a4` · 6 commits (01/11/2026).
**PR #2500** "fix: CV-052 — commit atômico session+insights via RPC commit_copilot_tick" — CLOSED sem merge em 2026-11-01T23:49Z pelo congelamento de features (#2545). Triagem anterior (2804): DECISAO_DONO.

## Propósito
Tornar o tick do Copiloto RADAR (`copilot-tick.ts`) atômico: UPDATE de `copilot_sessions` (cursor `last_processed_message_at` + `state_version`) e INSERT em `copilot_insights` numa só transação, via RPC `public.commit_copilot_tick` (SECURITY DEFINER, só `service_role`). Sem isso, se o INSERT falhar após o UPDATE, o cursor já avançou e o retry devolve `stale_state` — insights perdidos para sempre.

## Arquivo × achado × evidência

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `supabase/functions/_shared/copilot-tick.ts` | BOTH_CHANGED / CONFLICT | **~90% INCORPORADA** (handler inteiro, schemas, prompts, momentos-chave) via #2828 `11841dba9` e #3127 `f369f88b2`; **PERDIDO**: passo 5 (commit atômico via RPC); **OBSOLETO**: `import { parseModelOutput } from "./ai-response-contracts.ts"` | main L514-533 ainda faz 2 escritas separadas (`.from("copilot_sessions").update(patch)…` L514-519 e `.from("copilot_insights").insert(insights)` L531). main substituiu `parseModelOutput` por `JSON.parse` + `Schema.safeParse` de propósito (comentário "safeParse evita TS2589", L468-469 e L500-501). |
| `supabase/migrations/20261031180000_copilot_commit_tick_rpc.sql` | NEW_FILE_ABSENT_IN_MAIN | **PERDIDO** | `git grep commit_copilot_tick origin/main` → 0 ocorrências em `supabase/`. Produção: `select proname from pg_proc where proname='commit_copilot_tick'` → 0 linhas; `schema_migrations` não tem `20261031180000`. |

## Verificações de produção (só leitura, `tnnnlkbymytvtqngbbqh`)
- `copilot_sessions` tem TODAS as colunas que o RPC atualiza: `state_version, last_tick_at, last_processed_message_at, sale_stage, temperature, intent, sentiment, comm_style (text — não text[]), decision_role, occasion, stakeholders (jsonb), brinde_budget/responsible/intention/quantity(int)/deadline(date)/delivery, brinde_meter (int), brinde_evidence (jsonb)`.
- `copilot_insights` tem `tier (smallint), latency_ms (int), data (jsonb)` (migration `20261031160000` aplicada).
- → Os achados Qodo #2, #3 e #9 (colunas ausentes / comm_style array) **não valem mais**; o SQL da branch aplica como está.
- Handler já registrado no worker: `supabase/functions/ai-jobs-worker/index.ts` L259-287 (`"copilot.tick": handleCopilotTickJob`), e `CopilotTickError` vira `AiJobHandlerError` (L278) — o bug de janela não-atômica está **vivo em produção** (motor nasce desligado pela capability `ai.capability.copilot_live`, mas o código é o que roda quando ligar).

## Veredito
**PERDIDA_PARCIAL** — o handler entrou na main por outra PR; a correção de atomicidade (RPC + troca das 2 escritas por 1 chamada) não entrou e continua válida sobre o código atual. `apagar_branch_seguro = false`.

Não é DECISAO_DONO: é migration + edge (backend já autorizado), sem custo externo novo (nenhuma chamada de LLM a mais) e não contradiz regra de negócio.

## O que falta para portar (2 arquivos)

### 1. Nova migration `supabase/migrations/<versão nova>_copilot_commit_tick_rpc.sql`
Renumerar (a main já tem `20261115010000`; use timestamp atual). Conteúdo integral da branch (`git show origin/claude/fix-copilot-tick-atomicity-261101-1430:supabase/migrations/20261031180000_copilot_commit_tick_rpc.sql`) — 79 linhas; trechos essenciais:

```sql
CREATE OR REPLACE FUNCTION public.commit_copilot_tick(
  p_session_id uuid, p_state_version int, p_patch jsonb, p_insights jsonb DEFAULT '[]'::jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE copilot_sessions SET
    state_version = (p_patch->>'state_version')::int,
    last_tick_at = (p_patch->>'last_tick_at')::timestamptz,
    last_processed_message_at = (p_patch->>'last_processed_message_at')::timestamptz,
    sale_stage = COALESCE(p_patch->>'sale_stage', sale_stage),
    temperature = COALESCE((p_patch->>'temperature')::int, temperature),
    intent = COALESCE(p_patch->>'intent', intent),
    sentiment = COALESCE(p_patch->>'sentiment', sentiment),
    comm_style = COALESCE(p_patch->>'comm_style', comm_style),
    decision_role = COALESCE(p_patch->>'decision_role', decision_role),
    occasion = COALESCE(p_patch->>'occasion', occasion),
    stakeholders = COALESCE(p_patch->'stakeholders', stakeholders),
    brinde_budget = COALESCE(p_patch->>'brinde_budget', brinde_budget),
    brinde_responsible = COALESCE(p_patch->>'brinde_responsible', brinde_responsible),
    brinde_intention = COALESCE(p_patch->>'brinde_intention', brinde_intention),
    brinde_quantity = COALESCE((p_patch->>'brinde_quantity')::int, brinde_quantity),
    brinde_deadline = COALESCE((p_patch->>'brinde_deadline')::date, brinde_deadline),
    brinde_delivery = COALESCE(p_patch->>'brinde_delivery', brinde_delivery),
    brinde_meter = COALESCE((p_patch->>'brinde_meter')::int, brinde_meter),
    brinde_evidence = CASE WHEN p_patch ? 'brinde_evidence' THEN p_patch->'brinde_evidence' ELSE brinde_evidence END
  WHERE id = p_session_id AND state_version = p_state_version;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RETURN false; END IF;
  IF jsonb_array_length(p_insights) > 0 THEN
    INSERT INTO copilot_insights (session_id, profile_id, insight_type, content, source, model_version, state_version, tier, latency_ms, data)
    SELECT (elem->>'session_id')::uuid, (elem->>'profile_id')::uuid, elem->>'insight_type', elem->>'content', elem->>'source',
           elem->>'model_version', (elem->>'state_version')::int, (elem->>'tier')::smallint, (elem->>'latency_ms')::int,
           COALESCE(elem->'data','{}'::jsonb)
    FROM jsonb_array_elements(p_insights) AS elem;
  END IF;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION public.commit_copilot_tick(uuid,int,jsonb,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_copilot_tick(uuid,int,jsonb,jsonb) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.commit_copilot_tick(uuid,int,jsonb,jsonb) TO service_role;
```
Observação: a main tem `20261113170000_fix_search_path_funcoes_ai_copilot.sql` — o `SET search_path = public` já está no corpo; manter.

### 2. `supabase/functions/_shared/copilot-tick.ts` — substituir main L511-533 (passo 5)
Trocar o bloco `update(...).eq("state_version"...)` + `insert(insights)` por:
```ts
  // 5. Commit atômico via RPC commit_copilot_tick (CV-052): sessão + insights em 1 transação —
  // se o INSERT falhar, o cursor NÃO avança e o próximo tick reprocessa as mensagens.
  const lastAt = fresh[fresh.length - 1].created_at;
  const patch = buildSessionPatch(s, out1, lastAt);
  const stateVersion = s.state_version + 1;
  const insights = [
    ...buildTier1Insights(s, out1, { model: gen1.model, latencyMs: lat1, stateVersion }),
    ...(out2 ? buildTier2Insights(s, out2, { model: model2, latencyMs: lat2, stateVersion, keyMoments: allMoments }) : []),
  ];
  const { data: committed, error: cErr } = await deps.supabase
    .rpc("commit_copilot_tick", { p_session_id: s.id, p_state_version: s.state_version, p_patch: patch, p_insights: insights });
  if (cErr) throw new CopilotTickError("COPILOT_WRITE_FAILED", cErr.message);
  if (!committed) {
    return { status: "succeeded", result: { skipped: "stale_state", state_version: s.state_version } };
  }
```
Manter o resto da main (imports `npm:@supabase/supabase-js`, `DECISION_ROLES`, `isRealDate`, `safeParse`) — NÃO reintroduzir `parseModelOutput`.

### 3. Teste a ajustar
`supabase/functions/_shared/__tests__/copilot-tick.test.ts` (main) mocka `.from("copilot_sessions").update` / `.from("copilot_insights").insert`; passa a mockar `supabase.rpc("commit_copilot_tick")` devolvendo `true` / `false` (stale) / erro. (Não verifiquei o conteúdo do teste linha a linha — NÃO VERIFICADO.)

### Fluxo
Migration = DDL em produção → PR fica aberta para o dono (regra `banco.md`); edge só sai pelo `deploy-functions.yml` após o apply (código novo chama RPC inexistente → `COPILOT_WRITE_FAILED` em todo tick até o apply; ordem: apply da migration primeiro, depois deploy da edge, ou deploy com fallback).

## Verificação adversarial

Verificado contra `origin/main` = `dac285f62` (15/11/2026) e produção `tnnnlkbymytvtqngbbqh` (só leitura).

**Parecer: CONCORDO com PERDIDA_PARCIAL. `apagar_branch_seguro = false`.** Tentei refutar por 4 vias; nenhuma derrubou a triagem.

1. **A lacuna está na main?** Não. `git grep commit_copilot_tick origin/main` → 0 ocorrências (todos os paths, não só `supabase/`). `git grep -n "\.rpc(" origin/main -- supabase/functions/_shared/copilot-tick.ts` → 0. A main ainda faz duas escritas separadas: `copilot-tick.ts` L510-511 (comentário "5. Sessão com trava otimista"), L514-519 (`.from("copilot_sessions").update(patch).eq("id").eq("state_version").select("id")`), L520-523 (`stale_state`), L531 (`.from("copilot_insights").insert(insights)`) — sem transação entre as duas.
2. **Foi removida de propósito?** Não: `git log -S'commit_copilot_tick' --oneline origin/main` → vazio (nunca existiu na main). `copilot-tick.ts` só foi tocado por `11841dba9` (#2828) e `f369f88b2` (#3127), ambos `feat`, nenhum `revert`/`remove` da atomicidade.
3. **Ainda encaixa no código atual?** Sim, encaixa exatamente. `buildSessionPatch` (main L192-227) emite as 20 chaves que o RPC atualiza (`state_version, last_tick_at, last_processed_message_at, sale_stage, temperature, intent, sentiment, comm_style, occasion, decision_role, stakeholders`, os 6 `brinde_*` de `BRINDE_COLUMNS` main L143-150, `brinde_meter`, `brinde_evidence`) — nenhuma chave da main fica fora do RPC, logo nenhum campo seria silenciosamente descartado; a semântica "campo omitido não apaga o que já se sabia" é preservada pelos `COALESCE`. `InsightRow` (main L230-241) tem exatamente as 10 colunas do `INSERT` do RPC. Produção: `pg_proc` sem `commit_copilot_tick` (0), `schema_migrations` sem `20261031180000` (0), `copilot_sessions` com 19/19 colunas do RPC, `copilot_insights` com 10/10 → o SQL da branch aplica como está.
4. **É DECISAO_DONO (triagem 2804)?** Não. É migration + edge, sem custo externo novo (zero chamadas de LLM a mais) e sem contradizer regra vigente — o próprio motor do RADAR entrou depois do congelamento (#3127 + `20261115010000_copilot_live_motor.sql` na main). Pela regra, DDL/edge sozinhos não justificam DECISAO_DONO → fica PERDIDA_PARCIAL.

**Correções de precisão na triagem (não mudam o veredito):**
- O mecanismo da perda não é `stale_state` no retry: o handler relê a sessão a cada tentativa (main L431-436) e, com o cursor já avançado, `lerMensagens` não devolve mensagem nova de contato → o retry sai por `skipped: "no_new_contact_messages"` (main L440-442). Perda igualmente definitiva, e o custo de LLM do tick já foi pago.
- A lacuna do teste deixa de ser "NÃO VERIFICADO": `supabase/functions/_shared/__tests__/copilot-tick.test.ts` (main) espiona `update`/`insert` (L22, L37-51) e afirma sobre eles em L114, L132, L139-147, L165, L173-174, L182 — ~8 asserções a reescrever para `rpc("commit_copilot_tick")`.

**Lacuna adicional encontrada:** o RPC é SECURITY DEFINER e entra nos artefatos gerados do banco (`supabase/schema-manifest.json` e `supabase/schema-catalog.json` listam `f:merge_brinde_state(...)` e seus grants; `scripts/db-audit/check-manifest-fresh.mjs` cobra frescor). Depois do apply, manifest/catalog/`grants-baseline.json` precisam refletir `f:commit_copilot_tick(p_session_id uuid, p_state_version integer, p_patch jsonb, p_insights jsonb)` — normalmente pelo `types-sync.yml` (L326-409), mas conte com esse passo no plano de deploy para não travar o guard de drift.
