# Veredito das 33 migrations do bloco A1 — 17/11/2026

**O bloco de maior risco do inventário.** São as migrations que a prova byte a byte da #3192
achou em branch e **não** na `main`, em caminho nenhum. Enquanto não tivessem veredito, nenhuma
das branches que as carregam podia ser fechada — e aplicar qualquer uma delas às cegas em
produção seria pior que perdê-la.

## Resultado

**33 de 33 obsoletas. Nenhuma DDL a aplicar. Nenhum objeto faltando em produção.**

Nenhuma DDL foi executada nesta adjudicação: só `SELECT` em catálogo (`pg_proc`, `pg_class`,
`pg_policies`, `pg_constraint`, `pg_indexes`, `information_schema`, `cron.job`).

## O método: duas vias independentes por migration

Comparar texto de migration com texto de migration não decide nada, porque o mesmo trabalho
chega à `main` com outro número, outro nome de arquivo e às vezes outro nome de objeto. Então
cada migration foi julgada por duas perguntas que não dependem de nome de arquivo:

1. **O objeto que ela cria existe no banco oficial?** Tabela, função, policy, trigger, índice,
   coluna, constraint e job de cron, conferidos um a um no catálogo de produção.
2. **A `main` tem o arquivo que define esse objeto?** Se sim, o trabalho está versionado e o
   banco reconstrói; se o objeto vive em produção mas a `main` não o define, é drift e precisa
   aparecer.

As duas vias têm que fechar. Uma só não basta: objeto em produção sem arquivo na `main` é drift,
e arquivo na `main` sem objeto em produção é migration não aplicada.

## Via 2: a renumeração, nomeada par a par

O mecanismo de incorporação é `reserve_migration_version`: o arquivo entra na `main` com número
novo. Isso é visível em 16 pares, vários deles com o **nome idêntico** e só o número diferente:

| Arquivo na branch | Arquivo na `main` |
|---|---|
| `20261113130200_conversation_status_regras_e_so_por_rpc.sql` | `20261113171300_conversation_status_regras_e_so_por_rpc.sql` |
| `20261113130400_varredura_mensagens_presas_em_enviando.sql` | `20261113171400_varredura_mensagens_presas_em_enviando.sql` |
| `20261113130500_transfer_conversation_cas_sem_dono.sql` | `20261113171500_transfer_conversation_cas_sem_dono.sql` |
| `20261113130600_agendadas_conexao_do_contato_caida.sql` | `20261113171600_agendadas_conexao_do_contato_caida.sql` |
| `20261113140000_remove_enum_special_agent.sql` | `20261113172000_remove_enum_special_agent.sql` |
| `20261101223000_talkx_x074_analytics_rpcs.sql` | `20261108201000_talkx_x074_analytics_rpcs.sql` |
| `20261101233000_talkx_x086_template_metrics_rpcs.sql` | `20261108202000_talkx_x086_template_metrics_rpcs.sql` |
| `20261101243000_talkx_x058_campaign_queue_segment.sql` | `20261108203000_talkx_x058_campaign_queue_segment.sql` |
| `20261101223000_talkx_suppression_reasons.sql` | `20261108100000_talkx_suppression_reasons.sql` |
| `20261111180000_resolve_unconfirmed_somente_sending.sql` | `20261112170000_resolve_unconfirmed_somente_sending.sql` |
| `20261026210300` e `20261101133000_outbound_post_started.sql` | `20261111160000_outbound_post_started.sql` |
| `20261031180000_copilot_commit_tick_rpc.sql` | `20261115030000_commit_copilot_tick.sql` |
| `20261101150000_multiplix_cron_retoma_instancia_pausada.sql` | `20261115020000_multiplix_retoma_instance_paused.sql` |
| `20261016193500` e `20261108180200_copilot_retention.sql` | `20261115050000_copilot_retention_aggregates.sql` |
| `20261016193300` e `20261108180000_copilot_tick_trigger.sql` | `20261115010000_copilot_live_motor.sql` |
| `20261026120300_log_search_event_rpc.sql` | `20261031130000_search_event_rpc.sql` |
| `20261101140000_instance_pause_investigation.sql` | `20261112160000_talkx_blacklist_reconcilia_e_higiene.sql` (parte) |
| `20261026200300_fix-talkx-cron-startup-timeout.sql` | `20261006193506_talkx_cron_runs_gate.sql` + `20261009160000_talkx_storage_purge_drain.sql` |
| `20261102012200_rls_department_invitations_admin_only.sql` | `20261108090000_fix_create_department_invite_search_path.sql` |
| `20261026220300_revogar_grants_escrita_anon.sql` | `revoke_anon_write_grants_all_tables.sql` |

**27 funções conferidas: 27 têm arquivo na `main`.** Zero drift de função.

## Via 1: o que existe no banco oficial

Existem em produção, conferidos no catálogo: as 27 funções acima; as tabelas `copilot_sessions`,
`copilot_insights`, `copilot_retention_aggregates`, `talkx_suppression_reasons`; as colunas
`messages.delivery_post_started_at`, `messages.manually_resolved_at` e
`instance_pauses.investigated_at`; as constraints `chk_conversation_status_values`,
`message_reactions_one_per_agent`, `talkx_blacklist_reason_code_fk`,
`instance_pauses_investigacao_completa`, `instance_pauses_notas_sem_html`; os jobs
`copilot-retention-daily` e `outbound-sending-sweeper`; e as policies de
`team_message_receipts`, `department_invitations`, `copilot_conversation_scores` e
`copilot_learning_moments`.

### Os 7 que NÃO existiam com o nome da branch

Cada um foi perseguido até o fim, e nenhum é funcionalidade faltando:

| Objeto da branch | O que produção tem no lugar |
|---|---|
| função `touch_copilot_sessions_updated_at` | O trigger existe em `copilot_sessions` com outro nome: **`trg_copilot_sessions_updated_at`**. |
| job `cleanup-login-attempts-pii` | **`login-attempts-retention-90d @ 41 4 * * *`**, que faz o expurgo: `DELETE FROM public.login_attempts WHERE coalesce(last_attempt_at, updated_at, created_at) < now() - interval '90 days' AND (locked_until IS NULL OR locked_until < now())`. O objetivo de LGPD está cumprido. |
| job `cleanup-cron-run-details-7d` | **`cron-historico-retencao-7d @ 17 3 * * *`**: `delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days'`. Mesma função, outro nome. |
| constraint `user_roles_no_special_agent` | O rótulo `special_agent` **não existe mais em enum nenhum** do banco (conferido em `pg_enum`). Uma constraint que proíbe um valor inexistente no tipo não tem o que proibir. |
| tabela `copilot_insight_feedback` | **`copilot_feedback`**, com `feedback_type`, `rating`, `reason`, `suggestion_id`, `suggestion_text`, `sent_text`, `edit_level`, `created_by` — o mesmo papel. Nenhum código da `main` menciona `copilot_insight_feedback`: as 8 menções são todas em documento de análise. |
| tabela `copilot_presence` | **`agent_presence`**, com o job `expire-stale-agent-presence` cuidando do vencimento. Nenhum código da `main` menciona `copilot_presence`. |
| função `e2e_fixture_message` | Não existe em produção, e **nenhum código da `main` a chama** — as menções são todas em documento de análise. É `SECURITY DEFINER` que insere em `messages`: recuperá-la adicionaria superfície de escrita privilegiada **sem consumidor**. Obsoleta por ausência de uso, não por descuido. |

### O ínicio índice que a branch criava e que não serviria

`20261026110300_login_attempts_ttl_lgpd.sql` criava `idx_login_attempts_updated_at`. Ele não
existe em produção — e **não ajudaria**: o expurgo que de fato roda filtra por
`coalesce(last_attempt_at, updated_at, created_at)`, uma **expressão**, que um índice simples em
`updated_at` não atende. Obsoleto por mudança de critério, não por esquecimento.

## Dois achados laterais, nenhum é falha

**1. `anon` ainda tem escrita numa tabela.** A migration `20261026220300_revogar_grants_escrita_anon.sql`
queria revogar INSERT/UPDATE/DELETE de `anon` em todas as tabelas. Medido: resta **exatamente
uma** — `password_reset_requests`, e só **INSERT**. É por desenho: RLS está habilitado e a policy
se chama `Anon can file a password reset request [INSERT] roles=anon`. Sem isso, quem esqueceu a
senha não consegue pedir a redefinição. **Não mexer.**

**2. A colisão de número de versão do ledger segue valendo.** As 5 versões colididas que a #3192
nomeou continuam constando como aplicadas com conteúdo de outro arquivo. Como nenhuma das 33
precisa ser recuperada, a colisão **não bloqueia nada agora** — mas segue sendo a razão de
qualquer recuperação futura de migration precisar de número novo por `reserve_migration_version`,
nunca do número original.

## O que isto libera, e o que não

**Libera:** as 33 migrations deixam de ser impedimento para fechar as branches que as carregam.
O bloco A1 sai da fila.

**Não libera a branch inteira.** Cada uma dessas branches tem outros arquivos (código, teste,
script) com veredito próprio a dar. Este documento julga as migrations, não as branches.

**NÃO VERIFICADO:** se o **corpo** de cada função em produção é linha a linha o da versão da
branch. A prova aqui é que o objeto existe e que a `main` tem o arquivo que o define — e o
arquivo da `main` é, por ordem de número, **posterior** ao da branch em todos os 16 pares
nomeados. Onde a `main` é posterior, ela é a versão corrente por construção. Um caso de drift
conhecido entre arquivo e produção já está registrado no próprio repositório, em
`scripts/db-audit/migration-evidence.json`, para o RPC de evento de busca.
