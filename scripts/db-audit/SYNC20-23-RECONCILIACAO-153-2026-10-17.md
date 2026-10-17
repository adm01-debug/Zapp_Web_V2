# SYNC20-23 — reconciliação das 153 migrations sem ledger (2026-10-17)

Especialista: worker (sql) (area-sql-banco). Cartão t_116908a7. Base: dia/2026-10-17.
Nada foi aplicado no canônico/produção: tudo abaixo saiu de leitura RO do ledger, da árvore de
`origin/main` extraída localmente e de **banco LOCAL descartável** (porta 5499), nunca mock.

## 1. Números reconciliados

| medição | valor | como foi medido |
|---|---|---|
| versões no ledger do canônico | 912 | canal RO (`zapp-db-ler`, só leitura) |
| versões no ledger COM arquivo em origin/main | 911 | cruzamento versão↔nome de arquivo |
| **versões no ledger SEM arquivo** | **1** | `20261016120000` (§7) |
| arquivos `.sql` em origin/main | 1071 | `git ls-tree` + `git archive` |
| arquivos com versão fora do padrão 14 dígitos | 6 | `FILE_NAME_RE` |
| **arquivos SEM linha no ledger** | **153** | 1064 − 911; CSV deste cartão |
| migrations top-level no replay | 1046 (antes) / 1047 (depois) | 1071 − 19 (subpastas `_superseded/`, `_foreign/`) |

Fotos de origem: `SYNC-AG4b-FOTO-CANONICA-2026-10-17.md` (AG4b) e
`SYNC-AG4-F14-PLANO-APLICACAO-2026-10-17.md` (AG4). Os 153 conferem com a F11a da foto.

## 2. Classificação das 153

Regra declarada (heurística, reproduzível por `sync20-23-classifica-153.py`), aplicada **por arquivo**:

- **DESTRUTIVA** — apaga dado/objeto (`drop table`, `drop column`, `truncate`, `delete from`).
- **CONTRATIVA** — muda/tira algo existente (`revoke`, `drop policy/trigger/index/function`,
  `alter column type`, `set not null`, `rename`, `add constraint`, `disable row level security`).
- **ADITIVA** — só acrescenta (`create … if not exists`, `add column`, policy/índice/trigger novos).
- **CORRETIVA** — reescreve definição existente sem destruir nem revogar (`create or replace`,
  nome com `fix|corrig|reconcili|harden|_fecha`).
- **NO-OP** — sem DDL executável.
- sufixo **/ARQUIVADA** — arquivo em `_superseded/` ou `_foreign/` (não entra no replay).

Distribuição (153): CONTRATIVA 108 · DESTRUTIVA 12 · CORRETIVA 10 · ADITIVA 4 · arquivadas 19
(_superseded 9, _foreign 7, _foreign/singu 3). Por área: talkx/campanhas 48, mensagens/inbox 16,
seguranca/rls 12, filas/sla/ops 8, perfis/diretorio 7, storage/midia 7, times/team chat 6 (resto no CSV).

Flags por arquivo: toca dado 102 · mexe ACL 104 · mexe RLS 44 · idempotente 141 ·
rollback presente 139 (**ausente em 14**, prosa 22, linha-SQL 39, bloco executável 78).

CSV: `SYNC20-23-153-CLASSIFICACAO-2026-10-17.csv` (153 linhas, sem truncamento).

## 3. Replay no banco local — antes e depois (prova)

Árvore A = `git archive origin/main` (1046). Árvore B = A + prefixo do SYNC20-09
(`20261011000004_prefixo_reconcilia_janela_talkx_e_team_chat_media_rb.sql`).

| | migrations | ok | falhas | esperadas | INESPERADAS |
|---|---|---|---|---|---|
| ANTES (origin/main) | 1046 | 1022 | 24 | 20 | 4 |
| DEPOIS (+ prefixo SYNC20-09) | 1047 | 1025 | 22 | 20 | 2 |

As 2 INESPERADAS que sobram (`20261013210002_realtime_canais_privados.sql`,
`20261013230007_my_active_sessions.sql`) falham por **objeto de serviço/bancada ausente**
(`relation "realtime.messages" does not exist`, `relation "auth.sessions" does not exist`) — não é
drift do repositório. O prefixo ganhou 3: ele mesmo + `20261011003008_talkx_n102c_window_open.sql`
(antes: `cannot change return type of existing function`) + `20261012192938_team_chat_media_path_sender_conversation.sql`
(antes: `column "media_path" … does not exist`).

Dentro das 153: **133 aplicam sem tocar em nada, 1 passa depois do prefixo
(`20261011003008`), 19 não entram (subpasta)**; nenhuma das 22 falhas finais é das 153.

## 4. Lote 1 — pronto para autorização nominal

Critério: replay ok **e** ADITIVA/CORRETIVA **e** idempotente **e** não escreve dado **e**
não mexe ACL **e** não mexe RLS **e** rollback existente. Isso deixa 4 (CSV `SYNC20-23-LOTE1-2026-10-17.csv`).

| versão | o que faz | classe |
|---|---|---|
| 20261010180000 | `create index idx_conversation_tasks_owner_status_completed` | ADITIVA |
| 20261010180001 | `create index idx_conversation_tasks_owner_status_position` | ADITIVA |
| 20261011140613 | 2 colunas anuláveis em `messages` (`sender_participant_jid`, `sender_display_name`) | ADITIVA |
| 20261011003025 | `get_profile_role_for_check` passa a exigir `p_user_id = auth.uid()` ou admin | CORRETIVA |

**Rollback provado um a um no banco local do replay** (`sync20-23-prova-rollback-lote1.sh`,
executado dentro do mesmo run do replay, container ainda de pé): aplicado → rollback → reaplicado,
com invariante medido:

```
OK  20261010180000 …_completed_idx.sql      indice presente=1  rollback->0  reaplicado->1
OK  20261010180001 …_position_idx.sql       indice presente=1  rollback->0  reaplicado->1
OK  20261011140613 messages_group_sender   2 colunas          rollback->0  reaplicadas=2
OK  20261011003025 fecha_get_profile_role   corpo com auth.uid()=1 rollback->0 reaplicado=1
PROVA_LOTE1=VERDE
```

**Fica FORA do lote 1 — achado real (P2):** `20261009062323_sec_p2_definer_storage.sql` era o 5º
candidato e **o rollback dele não é executável hoje**: o bloco chama
`alter function public.update_own_profile(text, text, text, text, text, text)`, mas a migration
posterior `20261014023945_update_own_profile_sem_email.sql` **removeu `p_email` da assinatura**
(passou a 5 parâmetros com `create or replace`). Medido no banco local:
`ERROR: function public.update_own_profile(text, text, text, text, text, text) does not exist`.
Regra que isso confirma: rollback de migration antiga pode ser invalidado por migration posterior —
por isso o lote só entra com rollback **executado**, não com rollback declarado.

Segunda fila (ADITIVA/CORRETIVA com replay ok, barradas por um flag): `20261006222858`,
`20261007010129`, `20261009011641`, `20261010130000`, `20261011000017`, `20261011003005`,
`20261011003006`, `20261011003015`, `20261011003027` — todas **movem dado** (`toca_dado=sim`) ou não
são idempotentes; precisam de plano de dados (janela, `AND NOT EXISTS`, gatilho de `updated_at`
desligado no backfill) antes de virar lote.

## 5. Migrations de IA (insumo do coordenador, SYNC20-17)

Medido, não presumido: **2 das 4 citadas não estão nas 153 porque já estão no ledger do canônico**:

- `20261015211127_chatbot_flows_ai_l1.sql` — arquivo existe, versão **no ledger** ⇒ sem drift de ledger (bloqueio por CHECK 23514 é tema de aplicação, não de reconciliação).
- `20261013213816_ai_sentiment_summary.sql` — arquivo existe, versão **no ledger** ⇒ idem (RPC sem consumidor é tema de paridade).
- `20261006203249_ai_replace_tags_preserva_humana.sql` — **nas 153**, `DESTRUTIVA` (reescreve a função `replace_ai_conversation_tags` e faz `delete`/`insert` em `ai_conversation_tags`): **não pode ir no lote 1**, mexe em dado de conversa.
- `20261011150527_feature_flags_rollout.sql` — **nas 153**, `CONTRATIVA` (`revoke`, `drop policy` ×2, `create policy`, `insert` em `feature_flags`, `create or replace` de `evaluate_feature_flags`): **não pode ir sozinha** — sem o consumidor de `evaluate_feature_flags` a troca de RLS/seed pode desligar flags em silêncio. Dependência explícita: entra junto com o consumidor (Edge/front) e com o teste de flag ligada/desligada.

## 6. As 9 tabelas com RLS ligada e nenhuma policy (ler, não estava no CSV)

Lista medida no canônico (RO): `ai_budget_reservations`, `ai_jobs`, `catalog_rate_limit_hits`,
`catalog_rate_limits`, `edge_rate_limits`, `gmail_oauth_states`, `link_preview_cache`,
`talkx_storage_purge_queue`, `talkx_test_send_claims`.

Onde cada uma é acessada (evidência em `git grep origin/main`), **sem julgar pelo acesso**:

| tabela | front (`src/`) | Edge (`supabase/functions/`) | SQL (`supabase/migrations/`) |
|---|---|---|---|
| ai_budget_reservations | só `types.ts` | — | `20261002361230` (funções `ai_budget_reserve`/`ai_budget_reconcile`) |
| ai_jobs | só `types.ts` | `_shared/ai-jobs.ts` + 8 funções de IA | `20261002361230` |
| catalog_rate_limit_hits | só `types.ts` | — | `20261003122707` (função `catalog_rate_limit_hit`) |
| catalog_rate_limits | só `types.ts` | 1 arquivo (via RPC) | `20261003122707` |
| edge_rate_limits | só `types.ts` | 7 arquivos (RPC `ai_rate_limit_hit`) | `20261002361230` |
| gmail_oauth_states | só `types.ts` | `gmail-oauth/index.ts` | migrations do Gmail |
| link_preview_cache | só `types.ts` | 2 arquivos (RPC de limpeza) | migrations de link preview |
| talkx_storage_purge_queue | só `types.ts` | `talkx-storage-purge/index.ts` | migrations talkx |
| talkx_test_send_claims | só `types.ts` | `talkx-send/index.ts` | migrations talkx |

Fato medido: **nenhuma é lida pelo front**; todas são fila/limite/cache/estado interno acessado por
Edge com `service_role` ou por função `SECURITY DEFINER` — postura "negar por padrão" (RLS ligada,
zero policy ⇒ `anon`/`authenticated` enxergam zero linhas). **Decisão proposta: manter deny** em todas
as 9 e registrar como contrato; só a Edge/definer consome. Nenhuma policy nova sem consumidor.

## 7. `20261016120000` — reconciliação (o que o nosso banco tem a mais)

Número: 1 versão no ledger sem arquivo — `20261016120000`, name `security_fixes_passkey_purge_gmail_search_events`,
`statements` **vazio** (`array_length=0`, 0 comandos no ledger).

Busca de recuperação (todas vazias): pathspec `*20261016120000*` em **5669 refs** = 0;
nome/slug `security_fixes_passkey_purge_gmail_search_events` em qualquer `.sql` de qualquer ref de
migrations = 0. Conclusão: **conteúdo irrecuperável** e não inventável (regra dura).

Objetos citados pelo nome, que o canônico tem e são de migrations posteriores/anteriores:
`passkey_credentials` (+ índice único), `purge_gmail_account_data`, `purge_old_search_events`,
`talkx_storage_purge_queue` — nenhum deles prova o conteúdo do arquivo ausente.

**Exceção formal: não é possível registrá-la hoje.** `migration-evidence.json` (schema_version 2)
exige, para os três `kind` permitidos (`ledger-only/comment-only`, `ledger-only/name-and-file-pinned`,
`ledger-divergence/pinned-replay`), os campos `filename` válido contra
`^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$` **e** `file_sha256` (check-migration-drift.mjs, linhas
174-190 e 205-214). Ou seja: **exceção pressupõe arquivo**. A mensagem do próprio checker
(linha 792) manda "crie excecao em migration-evidence.json" — mas o schema não tem `kind` para
"ledger sem arquivo". Duas saídas, e **nenhuma é minha**:
(a) quem tiver o SQL real registra o arquivo (aí a exceção cabe);
(b) adicionar um `kind` (ex.: `ledger-only/no-file`) ao checker + seus testes — cartão de mudança do
`check-migration-drift.mjs` (não é migration).

## 8. Aberto (precisa de decisão/outro cartão)

1. `20261016120000`: escolher (a) ou (b) do §7.
2. 14 migrations das 153 **sem linha de rollback** e 22 só com prosa — antes de qualquer aplicação.
3. 2 INESPERADAS restantes dependem de objeto de serviço (`realtime.messages`, `auth.sessions`):
   bancada, não repositório.
4. Lote 1 (4 migrations) aguarda **autorização nominal**; nada foi aplicado no canônico.
