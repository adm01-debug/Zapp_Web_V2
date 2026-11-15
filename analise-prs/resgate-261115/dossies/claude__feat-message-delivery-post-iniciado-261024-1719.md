# claude/feat-message-delivery-post-iniciado-261024-1719 (PR #2238) — INCORPORADA

- tip `3d18fbf142da3db2087aad137990886d078bf374` (1 commit), merge_base `2d97c44c` (2026-10-24)
- Commit: `feat(message-delivery): carimbo do POST iniciado (PD-79) e codigo de erro estavel retryable/ambiguous (PD-80) [C110]`
- O próprio corpo do commit admite o fluxo pela metade: "A edge NAO chama mark_outbound_post_started ainda (ligacao pendente: COMPLETAR)".
- Triagem anterior (2026-11-08) marcou #2238 como `DECISAO_DONO`. **Refutado**: não há custo externo novo nem contradição de regra; o trabalho inteiro já está na `main` e **aplicado em produção**.

## Propósito
Anti-reenvio duplicado quando o lease de 90 s vence depois do POST ao provedor (PD-79): coluna durável
`messages.delivery_post_started_at`, RPC `mark_outbound_post_started(uuid,uuid)` (service_role, fencing por
`(id, token)`), `claim_outbound_message` recusando linha ambígua e guard estendido. Mais o envelope de erro
estável da edge `message-delivery` (`{error, code, retryable, ambiguous}`, PD-80).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261026210300_outbound_post_started.sql` | **Incorporada renumerada e melhorada** em `supabase/migrations/20261111160000_outbound_post_started.sql`. A versão `20261026210300` colidia com `reconcile_team_reactions_force_conversation_id_trig` já aplicada. | `git show origin/main:supabase/migrations/20261111160000_outbound_post_started.sql` (484 linhas vs 328 da branch); `diff` mostra a main como superconjunto: idempotência do mark checada DEPOIS do lease vencido, `claim` recusa POST iniciado **com ou sem** lease vivo (`AND message.delivery_post_started_at IS NULL`), mais seção 5 (`manually_resolved_at` + `resolve_unconfirmed_message`). Produção (`tnnnlkbymytvtqngbbqh`, leitura): `schema_migrations` → `20261111160000 / outbound_post_started` presente; `pg_proc` → `mark_outbound_post_started`, `resolve_unconfirmed_message`; `messages` → `delivery_post_started_at`, `manually_resolved_at`. |
| `supabase/functions/message-delivery/index.ts` | **Incorporada e concluída**. A branch definia o envelope mas NÃO chamava a RPC; a main chama. | `origin/main:supabase/functions/message-delivery/index.ts:770` `service.rpc('mark_outbound_post_started', …)`, `:776/:790/:793` fallback `PGRST202`/`42883`. As 5 linhas "ausentes" são versões pobres do que a main tem: `:703` `.select('agent_id, sender, status, external_id, contact_id, whatsapp_connection_id, delivery_claim_expires_at, delivery_post_started_at')` (superconjunto do `:637` da branch); `:799` `undefined, fetchProvider, instanceToken,` (branch `:686` sem o token por instância E15); comentários PD-79/4xx substituídos por `:805-:815`, onde a main refina o comportamento (`failClaim` só na rejeição definitiva + `recordDeliveryAttempt`). As 2 linhas "removidas que a main ainda tem" (`resolvePrivateBucketUrl(caller, claim.media_url, undefined, supabaseUrl)`) existem **iguais** nos dois lados (branch `:660-661`, main `:730-731`) — falso positivo do casamento mecânico de linhas. |
| `supabase/functions/message-delivery/index.test.ts` | **Incorporada**. Os 39 `Deno.test` da branch estão na main; os 5 "ausentes" são os mesmos testes com título atualizado. | Ex.: branch `:299` `'PD-80: recusa de número pelo provedor vira code=invalid_number, não ambíguo e sem reconciliação'` → main `:350` `'…não ambíguo; POST iniciado chama failClaim'`; idem `:312→:363`, `:325→:376`, `:338→:389`, `:351→:402`. A main acrescenta `:921` `'PD-79: exceção LANÇADA no mark_outbound_post_started é infra (503 …)'` e `:962` `'P1-1: recusa definitiva grava failed_final …'`. |
| `scripts/db-audit/message-delivery-phase1-behavior.test.sh` | **Incorporada**. Arquivo igual exceto o caminho da migration e o SHA da definição do `claim`, ambos superados. | Branch `:703` `…/20261026210300_outbound_post_started.sql` → main `:703` `…/20261111160000_outbound_post_started.sql`; branch `:914` `definition_sha256 === 'f228a9d6…'` → main `:914` `'1ecc1a84…'` (corpo novo do `claim`). Linhas ditas "removidas e ainda na main" (`safe_api_function_count === 6`, `service_delivery_effective_count === 3`) estão idênticas nos dois (`:269`, `:225`). |
| `scripts/db-audit/message-delivery-phase1-runtime.sql` | Idêntico à main. | `status: IDENTICAL_TO_MAIN` / `PRESENT_BYTE`; main cobre `mark_outbound_post_started` em `:27/:203/:296/:307`. |
| `supabase/deployment-manifest.json` | **Artefato gerado, obsoleto.** Os 9 hashes da branch são de 2026-10-24; a main foi regerada várias vezes depois. | `origin/main:supabase/deployment-manifest.json:725` `sha256` de `message-delivery/index.ts` = `275a01a3…`, `:2221` `source_sha256` = `3b70bdea…`, `manifest_sha256` = `def318ea…` — nenhum coincide com os da branch. Reaproveitar qualquer linha daqui quebraria o manifesto. |

## Veredito
`INCORPORADA`. Nada a recuperar: migration renumerada e **aplicada em produção**, edge com a ligação que a
branch deixou pendente, testes e harness de DB presentes, manifest regerado. Branch pode ser apagada.

## Verificação adversarial

Parecer: **concordo com `INCORPORADA`**. Tentei refutar hunk por hunk; nenhum trecho de valor ≥ médio ficou fora da `main` (`origin/main` em `dac285f62`).

| Lacuna alegada pelo JSON | Resultado da refutação |
| --- | --- |
| Migration inteira (292 linhas, `NEW_FILE_ABSENT_IN_MAIN`) | `diff` branch×main: a de `origin/main:supabase/migrations/20261111160000_outbound_post_started.sql` (484 linhas) **contém** a da branch (328) e é mais forte: `claim_outbound_message` recusa com `AND message.delivery_post_started_at IS NULL` (sem depender de lease vencido); `mark_outbound_post_started` checa lease vencido **antes** do retorno idempotente e lança `outbound_post_already_started` para carimbo de lease anterior; seções 5–6 novas (`manually_resolved_at`, `resolve_unconfirmed_message`, guard estendido). Colisão de versão provada: `20261026210300` em produção = `reconcile_team_reactions_force_conversation_id_trig`. |
| 5 testes `PD-80` "ausentes" em `index.test.ts` | São os **mesmos** testes, só renomeados. Corpo byte-a-byte igual (ex.: branch "429 … e não reconcilia" × `origin/main:supabase/functions/message-delivery/index.test.ts:389` "429 … POST iniciado chama failClaim": mesmo `makeClient`, mesmo `jsonOf(429,…)`, mesmos `assertEqual(code/retryable/ambiguous)`, mesmo `assertFailClaim`; muda só o label do último `assertEqual`). Todos os 5 em `:350,:363,:376,:389,:402`. Contagem: main 52 testes × branch 39. `comm -23` dos títulos não achou nenhum caso semântico só da branch. |
| 5 linhas "ausentes" em `index.ts` | 2 são comentários tornados obsoletos pela regra mais forte da main ("POST iniciado + lease vencido … não aqui"); as outras 3 existem na main em versão superior: `:703` seleciona `delivery_claim_expires_at, delivery_post_started_at` além das 6 da branch, e `:799` passa `undefined, fetchProvider, instanceToken` (branch não passa o token por instância, E15). |
| 2 linhas "removidas que a main ainda tem" | Falso positivo mecânico confirmado: `resolvePrivateBucketUrl(caller, claim.media_url, undefined, supabaseUrl)` está nos dois lados — branch `:661`, main `:731`. |
| 2 linhas do `message-delivery-phase1-behavior.test.sh` | A main já aponta para a migration renumerada (`:703 post_started_migration=".../20261111160000_outbound_post_started.sql"`); o `definition_sha256` da branch é hash do corpo antigo da função — reaproveitá-lo faria o guard falhar contra o corpo vigente. |
| 9 linhas do `deployment-manifest.json` | Manifesto da main é **consistente com a própria main**: `sha256sum` de `origin/main:supabase/functions/message-delivery/index.ts` = `275a01a34da3060f40158de10d35e97b7f3ace122e701b66760f107e784dc1cd`, idêntico à entrada `source_files[141]`. Hashes da branch são artefato morto. |

Produção `tnnnlkbymytvtqngbbqh` (SELECT somente): `schema_migrations` tem `20261111160000/outbound_post_started`; `pg_proc` tem `mark_outbound_post_started(p_message_id uuid, p_claim_token uuid)` e `resolve_unconfirmed_message(p_message_id uuid, p_outcome text)`; `messages` tem `delivery_post_started_at` e `manually_resolved_at`; `pg_get_functiondef(claim_outbound_message)` contém `delivery_post_started_at IS NULL`.

Segurança de apagar: `GET /repos/adm01-debug/Zapp_Web_V2/pulls/2238` → `state=closed`, `merged=false`. A PR já está fechada, logo apagar a branch não fecha PR aberta nem perde histórico útil. Único efeito: a triagem anterior `DECISAO_DONO` fica formalmente refutada (não há custo externo nem contradição de regra vigente — só DDL/edge, que o dono já autorizou, e tudo já está aplicado).
