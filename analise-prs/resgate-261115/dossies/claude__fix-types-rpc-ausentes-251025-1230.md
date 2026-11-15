# Dossiê — claude__fix-types-rpc-ausentes-251025-1230 (PR #2250)

**Ref:** `origin/claude/fix-types-rpc-ausentes-251025-1230` (tip `ef39213ef`, merge-base `fb57b4a5c`, 2026-10-30)
**Propósito:** commit `59025be7b` "fix: adiciona 9 assinaturas de RPC ausentes em types.ts" — adiciona manualmente em
`src/integrations/supabase/types.ts` as assinaturas `admin_list_cron_jobs`, `admin_toggle_cron_job`, `app_bootstrap`,
`enqueue_group_outbound_message`, `inbox_unread_total`, `search_email_threads`, `transfer_conversation` (overload duplo),
`warroom_agent_today`, `warroom_queue_stats`. Único arquivo tocado (+123 linhas).

## Arquivo × achado × evidência (origin/main `dac285f62`, 2026-11-15)

| RPC (branch) | Na main? | Evidência (`origin/main:src/integrations/supabase/types.ts`) |
|---|---|---|
| admin_list_cron_jobs | SIM | L12422 — `Args: never`, mesmos 6 campos de retorno (gerador novo omite `\| null`) |
| admin_toggle_cron_job | SIM | L12444 — `Args: { p_ativo: boolean; p_jobname: string }; Returns: Json` idêntico |
| app_bootstrap | SIM | L12511 — `{ Args: never; Returns: Json }` |
| enqueue_group_outbound_message | SIM | L13251 — mesmos 8 args, retorno `messages` |
| inbox_unread_total | SIM | L13840 — `{ Args: never; Returns: number }` |
| search_email_threads | SIM | L14760 — args e retorno idênticos |
| transfer_conversation | SIM (superada) | L15353 — assinatura única com `p_expected_agent_id` **e** `p_expect_unassigned` (branch tinha só overload sem `p_expect_unassigned`); consumidor real `src/lib/inbox/transferConversation.ts:41-48` usa ambos |
| warroom_agent_today | SIM | L15481 — `{ Args: { p_date?: string }; Returns: Json }` |
| warroom_queue_stats | SIM | L15482 — `{ Args: never; Returns: Json }` |

As 20 linhas "missing_in_main" do line_check são só diferença de formato do gerador do Supabase
(`Record<PropertyKey, never>` → `Args: never`; `string | null` → `string`; overload duplo → assinatura única), não conteúdo.

Origem na main: `21e828e43` 2026-10-30 "chore(db): sincronizar artefatos derivados do banco (#2357)" introduziu as 9 RPCs via
regeneração automática do banco; `ff0a5dbca` 2026-11-14 (#3070) acrescentou `p_expect_unassigned` a `transfer_conversation`.
Ou seja, a main regenera `types.ts` a partir do banco ao vivo — patch manual na branch ficou redundante.

## Veredito
**INCORPORADA** (confiança alta). Nenhuma lacuna a recuperar. Branch segura para apagar.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. Resultado: **não refutado — concordo**.

Escopo real da branch (confirmado, não reaproveitado da triagem):
- `git log fb57b4a5c..origin/claude/fix-types-rpc-ausentes-251025-1230` → 2 commits (`59025be7b` + merge `ef39213ef`).
- `git diff --name-status fb57b4a5c origin/...` → **um único arquivo**, `src/integrations/supabase/types.ts`, `123 insertions(+), 0 deletions(-)`. Nenhum hunk fora de types.ts; nenhuma remoção a resgatar.

As 9 RPCs, conferidas uma a uma em `git show origin/main:src/integrations/supabase/types.ts` (main `dac285f62`):
`admin_list_cron_jobs` L12422 · `admin_toggle_cron_job` L12444 · `app_bootstrap` L12511 · `enqueue_group_outbound_message` L13251 · `inbox_unread_total` L13840 · `search_email_threads` L14760 · `transfer_conversation` L15353 · `warroom_agent_today` L15481 · `warroom_queue_stats` L15482. Todas presentes.

Onde a main é **superior** à branch (não há regressão a recuperar):
- `transfer_conversation` (main L15353-15362): assinatura única com todos os parâmetros opcionais, incluindo `p_expect_unassigned?: boolean` que a branch não tinha. Os dois overloads da branch são subconjuntos dela; as duas chamadas reais de `src/lib/inbox/transferConversation.ts:41-48` (com e sem `p_expect_unassigned`) satisfazem a assinatura da main.
- `enqueue_group_outbound_message` (main L13251-13311): retorno com 6 colunas que a branch não tinha (`delivery_post_started_at`, `manually_resolved_at`, `sender_display_name`, `sender_participant_jid`, `whatsapp_group_id`) — a branch estava desatualizada.
- `search_email_threads`, `admin_toggle_cron_job`, `app_bootstrap`, `inbox_unread_total`, `warroom_*`: idênticas em conteúdo (só `Record<PropertyKey, never>` → `Args: never`, mudança de formato do gerador).

Único delta da branch que a main não tem (avaliado e descartado, valor < médio):
`admin_list_cron_jobs` tem na branch `last_return_message/last_run_at/last_status: string | null`; na main os três são `string`. Dois motivos para não resgatar:
1. **Não é consumido pelo tipo gerado**: `src/components/admin/useTarefasAgendadas.ts:45` chama via `(supabase.rpc as unknown as (fn: string) => …)` e declara seu próprio tipo com `last_return_message: string | null` (L20), com `?? null` em L56. O teste `src/components/admin/__tests__/CronJobsTab.tarefas.test.tsx:47` já exercita `last_return_message: null`. A nulidade está tratada fora de types.ts.
2. **types.ts é artefato gerado**: `scripts/supabase_snapshot/README.md:29-30` — `GEN_TYPES=false` no snapshot porque "`types.ts` já vem do `types-sync.yml`". Editar a nulidade à mão seria desfeito na próxima sincronização (padrão do gerador para `RETURNS TABLE`: colunas não-anuláveis; para `SETOF <tabela>` ele mantém `| null`, como se vê em `enqueue_group_outbound_message`).

Origem na main, confirmada por `git log -S`:
- `git log -S'admin_list_cron_jobs' origin/main -- src/integrations/supabase/types.ts` → **apenas** `21e828e43` "chore(db): sincronizar artefatos derivados do banco (#2357)".
- `git log -S'p_expect_unassigned' origin/main -- src/integrations/supabase/types.ts` → **apenas** `ff0a5dbca` "chore(db): sincronizar artefatos do banco e contagens do inventário (#3070)".
Nenhum commit de `remove`/`revert`/`desativa` tocou essas assinaturas — não houve remoção deliberada a reverter.

Veredito final: **INCORPORADA**. Branch segura para apagar.
