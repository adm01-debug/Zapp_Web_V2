# PENDÊNCIAS — Zapp Web V2

Gerado automaticamente pela auditoria de 2026-10-22.
Atualizar conforme as tarefas forem concluídas.

---

## P-001 — Ativar MFA (S8-01) ⚠️ ALTO — REQUER AÇÃO DO JOAQUIM

**O que é:** Nenhum dos 10 usuários do projeto tem MFA ativo. Zero fatores verificados.

**Por que trava:** Ativar MFA para uma conta requer que o próprio usuário faça a configuração
no Supabase Dashboard (Settings → Account → Multi-factor Authentication) ou via e-mail de convite
com link de enrollment. Um agente/script não pode ativar MFA por outra pessoa.

**O que o Joaquim precisa fazer:**
1. Acesse https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/auth/users
2. Para a conta admin, clique no usuário → "Send MFA enrollment link" (ou instrua cada usuário)
3. No mínimo: ativar para as contas com papel admin/supervisor
4. Opcional: habilitar MFA obrigatório em Authentication → Policies → "Enforce MFA"
   (isso bloqueia login de quem não tiver MFA — avisar usuários antes de ligar)

---

## P-002 — Corrigir 61 migrations com statements NULL — BACKLOG

**O que é:** 61 registros em `supabase_migrations.schema_migrations` têm `statements = NULL`,
impossibilitando replay local e auditoria offline.

**Como corrigir (progressivamente):**
Para cada migration com NULL:
```bash
# 1. Verificar se o arquivo existe no repo
ls supabase/migrations/<version>_*.sql

# 2. Confirmar o estado ao vivo do objeto no banco (função, índice, policy)
# Exemplo para função:
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '<nome_da_funcao>';

# 3. Registrar com o script oficial (nunca à mão):
node scripts/db-audit/register-migration.mjs supabase/migrations/<version>_<name>.sql

# 4. O script gera o SQL de INSERT — conferir RETURNING não-vazio antes de aplicar
```

**Migrations com NULL que também têm RPCs ausentes** (alto impacto — resolver primeiro):
- `20261012225242` — warroom_rpcs_agentes_filas (warroom_agent_today, warroom_queue_stats)
- `20261012235745` — dashboard_daily_series
- `20261013230000` — search_email_threads
- `20261013230004` — inbox_unread_total
- `20261013012531` — custom_emoji_use_rpc (increment_custom_emoji_use)
- `20261013210003` — reabre_conversa_com_nova_mensagem (reopen_conversation)
- `20261015221500` — sentiment_trend_rpc (sentiment_trend)
- `20261015223614` — app_bootstrap

**Atenção:** Ao registrar uma migration "ausente", checar se a mesma função não está
registrada sob outra versão (ver CLAUDE.md — lição do incidente de 2026-09-25).

---

## P-003 — RPC log_search_event completamente ausente — INVESTIGAR

**O que é:** A RPC `log_search_event` é chamada no frontend mas não existe no banco nem
em nenhum arquivo de migration no repo.

**Próximo passo:**
```bash
grep -rn 'log_search_event' src/ --include='*.ts'
```
Decidir: criar a função (se necessária) ou remover a chamada no frontend.

---

## P-004 — 7 RPCs em migrations não aplicadas (S2-A1 parcial)

**O que são:** RPCs chamadas no frontend que existem em arquivos .sql no repo
mas nunca foram aplicadas em produção (fazem parte das 129 migrations pendentes):

| RPC | Arquivo |
|-----|---------|
| enqueue_group_outbound_message | 20261011155946_enqueue_group_outbound_message.sql |
| admin_list_cron_jobs | 20261011173000_admin_cron_jobs.sql |
| admin_toggle_cron_job | 20261011173000_admin_cron_jobs.sql |
| talkx_segment_library_stats | 20261009063248_talkx_segment_library_stats.sql |
| talkx_segment_bulk_action | 20261009063730_talkx_segment_bulk_actions.sql |
| talkx_suppression_stats | 20261009071216_talkx_suppression_read_rpcs.sql |
| talkx_campaign_recipients_page | 20261010062941_talkx_campaign_recipients_page.sql |

**Próximo passo:** Aplicar essas migrations no banco local, testar, depois aplicar
em produção pelo fluxo db-migrate.yml. As 129 migrations não aplicadas precisam
de revisão e aplicação em ordem — coordenar com o plano TalkX V4.
