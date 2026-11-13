# CONTEXTO PARA AGENTES DE IA — ÍNDICE ÚNICO

> Gerado automaticamente por indice.py · 2026-11-13 05:32 UTC · HEAD `382307ab59` · Não edite à mão.

Um sistema, três fontes de verdade, três produtores independentes. **Leia este arquivo e vá direto à fonte certa.** Cada fato tem um dono: se duas fontes discordarem, vale o dono.

## Onde está cada coisa

| Preciso de… | Fonte (dona do fato) | Onde ler | Estado |
|---|---|---|---|
| Regras que não podem ser quebradas: RLS por operação, estados e transições, validações, fórmulas, prazos, erros de negócio, testes como especificação, inconsistências código×schema (NÃO VERIFICADO) e regras humanas (`manual/`) | **regras de negócio** | `docs/contexto/regras/07-REGRAS-DE-NEGOCIO.md` | ok · 1 min atrás |
| Tabelas, colunas, RLS/políticas, funções, triggers, cron, storage, lints — **como está em produção agora** | **banco real** | `docs/contexto/supabase/README.md` | parcial · 3 min atrás · ⚠️ 1 erro(s) de coleta no manifest (erros); 1 seção(ões) com erro em errors.md |
| Rotas, telas, módulos, hooks, edge functions, grafo de dependências, testes, scripts, convenções | **código** | `docs/contexto/codigo/INDEX.md` | ok · 4 min atrás |

## Ordem de leitura antes de qualquer tarefa ou planejamento

1. **regras de negócio** — Qualquer mudança de comportamento · Antes de criar status/valor/validação · Antes de planejar.
2. **banco real** — Vou tocar tabela/coluna/política/função SQL · Quero saber se algo existe de verdade no banco.
3. **código** — Vou mexer em tela/rota/hook/edge · Preciso saber onde uma coisa vive e quem a usa.

## Regras do protocolo

- Tabela/coluna/política existe? → **banco real**. Migrations do repo são histórico, não estado.
- Onde fica, quem chama, o que importa o quê? → **código**.
- Pode fazer isso? Qual estado vem depois? Qual o limite? → **regras de negócio** (inclui `manual/`, escrito por humanos, prioridade máxima).
- Item listado como **NÃO VERIFICADO** ou **inconsistência** em qualquer fonte: confirme na fonte dona antes de assumir.
- Nada aqui é editado à mão. Para registrar uma regra que só o negócio sabe, escreva em `manual/` da fonte de regras.

<details><summary>Arquivos de <b>banco real</b> (`docs/contexto/supabase/`)</summary>

- `docs/contexto/supabase/CHANGELOG.md`
- `docs/contexto/supabase/README.md`
- `docs/contexto/supabase/auth.md`
- `docs/contexto/supabase/cron-runs.md`
- `docs/contexto/supabase/cron.md`
- `docs/contexto/supabase/edge-functions.md`
- `docs/contexto/supabase/errors.md`
- `docs/contexto/supabase/extensions.md`
- `docs/contexto/supabase/foreign-servers.md`
- `docs/contexto/supabase/functions.md`
- `docs/contexto/supabase/grants.md`
- `docs/contexto/supabase/indexes.md`
- `docs/contexto/supabase/lints.md`
- `docs/contexto/supabase/manifest.json`
- `docs/contexto/supabase/migrations.md`
- `docs/contexto/supabase/policies.md`
- `docs/contexto/supabase/project-config.md`
- `docs/contexto/supabase/queues.md`
- `docs/contexto/supabase/realtime.md`
- `docs/contexto/supabase/relationships.md`
- `docs/contexto/supabase/roles.md`
- `docs/contexto/supabase/schemas.md`
- `docs/contexto/supabase/sequences.md`
- `docs/contexto/supabase/snapshot.json`
- `docs/contexto/supabase/stats.json`
- `docs/contexto/supabase/stats.md`
- `docs/contexto/supabase/storage.md`
- `docs/contexto/supabase/tables.md`
- `docs/contexto/supabase/tables/_supabase_internal_triggers.md`
- `docs/contexto/supabase/tables/bkp_261023/agent_stats.md`
- `docs/contexto/supabase/tables/bkp_261023/contacts.md`
- `docs/contexto/supabase/tables/bkp_261023/csat_surveys.md`
- `docs/contexto/supabase/tables/bkp_261023/functions_before.md`
- `docs/contexto/supabase/tables/bkp_261023/global_settings.md`
- `docs/contexto/supabase/tables/bkp_261023/policies_before.md`
- `docs/contexto/supabase/tables/bkp_261023/schema_migrations.md`
- `docs/contexto/supabase/tables/bkp_261023/team_messages.md`
- `docs/contexto/supabase/tables/bkp_261023/user_settings.md`
- `docs/contexto/supabase/tables/ops/hermes_change_log.md`
- `docs/contexto/supabase/tables/public/agent_achievements.md`
- `docs/contexto/supabase/tables/public/agent_mini_game_xp_daily.md`
- `docs/contexto/supabase/tables/public/agent_presence.md`
- `docs/contexto/supabase/tables/public/agent_skills.md`
- `docs/contexto/supabase/tables/public/agent_stats.md`
- `docs/contexto/supabase/tables/public/agent_visibility_grants.md`
- `docs/contexto/supabase/tables/public/ai_budget_reservations.md`
- `docs/contexto/supabase/tables/public/ai_conversation_tags.md`
- `docs/contexto/supabase/tables/public/ai_jobs.md`
- `docs/contexto/supabase/tables/public/ai_model_prices.md`
- `docs/contexto/supabase/tables/public/ai_providers.md`
- `docs/contexto/supabase/tables/public/ai_usage_logs.md`
- `docs/contexto/supabase/tables/public/ai_usage_outbox.md`
- `docs/contexto/supabase/tables/public/allowed_countries.md`
- `docs/contexto/supabase/tables/public/app_settings.md`
- `docs/contexto/supabase/tables/public/audio_meme_favorites.md`
- `docs/contexto/supabase/tables/public/audio_memes.md`
- `docs/contexto/supabase/tables/public/audit_logs.md`
- `docs/contexto/supabase/tables/public/auto_close_config.md`
- `docs/contexto/supabase/tables/public/automations.md`
- `docs/contexto/supabase/tables/public/away_messages.md`
- `docs/contexto/supabase/tables/public/blocked_countries.md`
- `docs/contexto/supabase/tables/public/blocked_ips.md`
- `docs/contexto/supabase/tables/public/business_hours.md`
- `docs/contexto/supabase/tables/public/calls.md`
- `docs/contexto/supabase/tables/public/campaign_ab_variants.md`
- `docs/contexto/supabase/tables/public/campaign_contacts.md`
- `docs/contexto/supabase/tables/public/campaigns.md`
- `docs/contexto/supabase/tables/public/catalog_favorites.md`
- `docs/contexto/supabase/tables/public/catalog_rate_limit_hits.md`
- `docs/contexto/supabase/tables/public/catalog_rate_limits.md`
- `docs/contexto/supabase/tables/public/catalog_send_events.md`
- `docs/contexto/supabase/tables/public/channel_connections.md`
- `docs/contexto/supabase/tables/public/channel_routing_rules.md`
- `docs/contexto/supabase/tables/public/chatbot_executions.md`
- `docs/contexto/supabase/tables/public/chatbot_flows.md`
- `docs/contexto/supabase/tables/public/client_wallet_rules.md`
- `docs/contexto/supabase/tables/public/connection_alert_preferences.md`
- `docs/contexto/supabase/tables/public/connection_health_logs.md`
- `docs/contexto/supabase/tables/public/contact_block_audit.md`
- `docs/contexto/supabase/tables/public/contact_custom_fields.md`
- … +175

</details>

<details><summary>Arquivos de <b>código</b> (`docs/contexto/codigo/`)</summary>

- `docs/contexto/codigo/GRAPH_REPORT.md`
- `docs/contexto/codigo/INDEX.md`
- `docs/contexto/codigo/banco.json`
- `docs/contexto/codigo/baseline.json`
- `docs/contexto/codigo/componentes.json`
- `docs/contexto/codigo/convencoes.json`
- `docs/contexto/codigo/edge-functions.json`
- `docs/contexto/codigo/ferramentas.json`
- `docs/contexto/codigo/grafo-arestas.json`
- `docs/contexto/codigo/grafo-graphify.json`
- `docs/contexto/codigo/grafo.json`
- `docs/contexto/codigo/hooks.json`
- `docs/contexto/codigo/logica.json`
- `docs/contexto/codigo/manifest.json`
- `docs/contexto/codigo/modulos.json`
- `docs/contexto/codigo/rotas.json`
- `docs/contexto/codigo/scripts.json`
- `docs/contexto/codigo/testes.json`

</details>

<details><summary>Arquivos de <b>regras de negócio</b> (`docs/contexto/regras/`)</summary>

- `docs/contexto/regras/07-REGRAS-DE-NEGOCIO.md`
- `docs/contexto/regras/10-ACESSO-E-SEGURANCA.md`
- `docs/contexto/regras/11-GLOSSARIO-E-LACUNAS.md`
- `docs/contexto/regras/context.json`
- `docs/contexto/regras/manifest.json`
- `docs/contexto/regras/manual/README.md`
- `docs/contexto/regras/manual/TEMPLATE-regras-de-negocio.md`
- `docs/contexto/regras/manual/regras.md`

</details>
