# Dossiê — fix__types-rpc-ausentes-261025

- Ref: `origin/fix/types-rpc-ausentes-261025` (tip `9fe3cd8`, merge-base `2d97c44`, 3 commits, 2026-10-25). PRs com o mesmo tip: #2244, #2441.
- Veredito: **INCORPORADA** (confiança alta). `apagar_branch_seguro = true`.

## Propósito
1. `17d22eb48` — adicionar 9 assinaturas de RPC ausentes em `src/integrations/supabase/types.ts`.
2. `9d2ede51e` — aceitar `string | null` nos args opcionais de `transfer_conversation`.
3. `9fe3cd827` — corrigir testes de CI: fila offline por usuário (`userId` + filtro na drenagem + `clear()` no logout) e extensão/contentType real do áudio no upload.

## Arquivo × achado × evidência (tudo contra `origin/main`)

| Arquivo | Lacuna na branch | Estado na main | Evidência |
|---|---|---|---|
| `src/integrations/supabase/types.ts` | 9 RPCs: `admin_list_cron_jobs`, `admin_toggle_cron_job`, `app_bootstrap`, `enqueue_group_outbound_message`, `inbox_unread_total`, `search_email_threads`, `transfer_conversation`, `warroom_agent_today`, `warroom_queue_stats` | Todas presentes, regeneradas pelo codegen (`Args: never` em vez de `Args: Record<PropertyKey, never>` — 63 ocorrências de `never`, 0 de `Record<PropertyKey, never>`; mesma semântica) | `types.ts:12422, 12444, 12511, 13251, 13840, 14760, 15353, 15481, 15482`; commit `21e828e43 chore(db): sincronizar artefatos derivados do banco (#2357)` |
| `types.ts` — `transfer_conversation` com `string \| null` (overload duplo) | Superado: main tem assinatura única com `p_expect_unassigned?: boolean` e `p_expected_agent_id?: string` (`types.ts:15353-15363`). O único call site (`src/lib/inbox/transferConversation.ts:34-48`) usa `Record<string, unknown>` + cast `TransferRpc`, então a tipagem `null` não é necessária. | `git grep "rpc('transfer_conversation'" origin/main -- src` → só `transferConversation.ts` |
| `src/hooks/auth/useAuth.tsx` | `offlineSendQueue.clear()` no SIGNED_OUT e no `signOut` | Presente, em forma mais robusta: `esvaziarFilaDeEnvioOffline()` com try/catch + `log.error` | `useAuth.tsx:12` (import), `:26-32` (função), `:175` e `:249` (chamadas) |
| `src/lib/offlineQueue.ts` | `currentUserId` em `OfflineQueueDrainOptions` + `getCurrentUserId` em `drainOfflineQueueOnReconnect`; filtro `!m.userId \|\| m.userId === currentUserId` | Superado por `shouldDeliver?: (message) => boolean` (predicado genérico) em `drain`, `drainOfflineQueueOnReconnect` e `drainOfflineQueueOnOpen`; campo `userId?: string` existe | `offlineQueue.ts:37, 75, 240-252, 369-375, 399-404`; commit `e1f2ee4dd fix(test): destrava o CI Gate da main` |
| `src/services/outbound-message.service.ts` | `userId: readAuthenticatedUserId()` no enqueue; `getCurrentUserId` no reconnect | Presente e mais estrito: `pertenceAoUsuarioAtual` (item sem dono NUNCA drena; branch drenava), `shouldDeliver` nas duas drenagens, `enqueueOffline` lança erro sem sessão. Import vem de `@/lib/authenticatedUserId` (branch importava de `mediaVolumeStore`) | `outbound-message.service.ts:13, 379-380, 385-401, 405-412`; commit `e1f2ee4dd` |
| `src/services/chat.service.ts` | `uploadAudio` usa extensão/contentType do blob (`mp4 → m4a`) | Presente e mais completo: mapa `extByMime` (webm/ogg/mp4→m4a/mpeg→mp3), contentType real | `chat.service.ts:60-72`; commit `e1f2ee4dd` |

Testes protegendo o comportamento na main: `src/lib/__tests__/offlineQueue.test.ts`, `src/services/__tests__/chat.service.test.ts`, `src/services/__tests__/outbound-message.service.test.ts`.

## Lacunas a recuperar
Nenhuma. Toda intenção da branch está na main em forma equivalente ou superior.

## Verificação adversarial

Parecer: **CONCORDO** com INCORPORADA. `apagar_branch_seguro = true`. Tentei refutar hunk por hunk do `git diff 2d97c44 origin/fix/types-rpc-ausentes-261025` (5 arquivos, 157+/5-); nenhum hunk de valor ≥ médio ficou fora da `main`.

Conferências próprias (todas contra `origin/main`, git somente leitura):

1. **9 RPCs em `types.ts`** — todas presentes: `admin_list_cron_jobs:12422`, `admin_toggle_cron_job:12444`, `app_bootstrap:12511`, `enqueue_group_outbound_message:13251`, `inbox_unread_total:13840`, `search_email_threads:14760`, `transfer_conversation:15353`, `warroom_agent_today:15481`, `warroom_queue_stats:15482`. Comparei assinatura por assinatura: `search_email_threads` e `enqueue_group_outbound_message` idênticas aos Args/Returns da branch; `Args: never` ≡ `Args: Record<PropertyKey, never>`.
2. **Única divergência real encontrada em `types.ts`**: a branch tipava `last_return_message/last_run_at/last_status` como `string | null`; a main (codegen) tipa `string`. Valor desprezível — o consumidor `src/components/admin/useTarefasAgendadas.ts:45` nem usa os tipos gerados (cast `supabase.rpc as unknown as …` + interface própria `TarefaAgendada`) e `src/components/admin/CronJobsTab.tsx:128` já guarda com `tarefa.last_return_message &&`. Nada quebra, nada se perde.
3. **`transfer_conversation` com `string | null`** — desnecessário na main: assinatura única em `types.ts:15353-15363` (`p_expect_unassigned?`, `p_expected_agent_id?`), e o único caminho de escrita (`src/lib/inbox/transferConversation.ts:34-48`, 3 chamadas) passa `Record<string, unknown>` por um cast `TransferRpc` que ignora os tipos gerados. `git grep "rpc('transfer_conversation'" origin/main -- src` (fora de testes) → só esse arquivo.
4. **`useAuth.tsx`** — `offlineSendQueue` importado em `:12`; `esvaziarFilaDeEnvioOffline()` (`:26-28`, com try/catch) chamada nos DOIS pontos da branch: `:175` (`SIGNED_OUT`, bloco `:160`) e `:249` (`signOut`, inclusive no caminho de falha documentado em `:237-244`). Cobertura superior à do `void offlineSendQueue.clear()` da branch.
5. **`offlineQueue.ts`** — `userId?: string` em `:37`; `shouldDeliver?: (message) => boolean` em `:75`, `:369`, `:399`; filtro na drenagem em `:252` (`continue`) e contagem de snapshot só do dono em `:240-242`, `:272`. O `currentUserId` da branch é um caso particular desse predicado.
6. **`outbound-message.service.ts`** — `readAuthenticatedUserId` importado de `@/lib/authenticatedUserId` (`:13`; a branch importava de `mediaVolumeStore`), `pertenceAoUsuarioAtual` (`:378-380`) ligado às duas drenagens (`:391`, `:398`), `userId` gravado no enqueue (`:412`) com recusa se não houver sessão (`:405-406`). Mais estrito que a branch (item sem dono não drena nunca, em vez de drenar por compatibilidade).
7. **`chat.service.ts` `uploadAudio`** — main usa `mimeType` real do blob no `contentType` e mapa `extByMime` (webm/ogg/mp4→m4a/mpeg→mp3) com fallback `webm`. Única diferença: para um mime fora do mapa (ex. `audio/aac`) a branch derivaria a extensão do subtipo e a main grava `.webm` — mas o `contentType` gravado continua o real, e `MediaRecorder` nos navegadores suportados só produz os 4 do mapa. Valor baixo, não é lacuna.

Nenhuma lacuna adicional. A branch não traz testes (diffstat sem arquivo de teste); a main tem `src/lib/__tests__/offlineQueue.test.ts`, `src/services/__tests__/chat.service.test.ts` e `src/services/__tests__/outbound-message.service.test.ts` protegendo o comportamento.
