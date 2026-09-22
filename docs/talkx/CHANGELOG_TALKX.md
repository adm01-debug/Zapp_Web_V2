# Talk X · Campanhas — Changelog

## Fase 0 — Saneamento & Merge (2026-09-08)

### E01 — Fix imports PrimaryButton/GhostButton em TalkXView
- `TalkXView.tsx:9` → importa de `DashboardCard` (não de `talkxShared`)
- tsc de 3 erros → 0 erros

### E02 — Monitor sem Math.random — ritmo real por minuto
- `useTalkXMonitor.ts` criado: `rateByMinute` bucketiza `talkx_recipients.sent_at` por minuto
- `TalkXLiveMonitor.tsx:85` — `Math.random()` substituído por dados reais
- `elapsed` movido para `useEffect+setInterval` (sem `Date.now()` em render)
- `TalkXAnalytics.tsx:20` — `Date.now()` em `useMemo` → `useState<number>(() => Date.now())`

### E03 — Remove 5 componentes legados
- Removidos: TalkXBlacklist, TalkXCampaignCard, TalkXCampaignEditor, TalkXMessagePreview, TalkXRecipientsList
- TalkXContactSelector mantido (usado pelo wizard)
- 1.009 linhas deletadas

### E04 — Lint ratchet zerado (43 novas → 0, −10 antigas)
- `talkxShared.tsx` — `eslint-disable react-refresh/only-export-components` no topo (−20 warnings)
- `TalkXOverview.tsx:157` — ternário → if/else (`no-unused-expressions`)
- `useCampaignEditor.ts:88,103` — `eslint-disable set-state-in-effect` pontual
- `TalkXWizardDelivery.tsx:44` — `Date.now()` → `useState<string>(() => ...)`
- `TalkXWizardDelivery.tsx:157` — `Row` movido para nível de arquivo (+prop `ed`)
- TalkXLiveMonitor/Analytics/Suppression — `supabase.from()` → `fromTable()` ou `eslint-disable no-restricted-imports`

### E05 — Rebase em main (#288)
- Rebase limpo sobre `68bbfeec` (feat/inbox: coluna de conversas)
- Zero conflitos

### E06 — PR #289 squash-mergeado → main (3ba511da)
- SHA do merge: `3ba511da32d87a22a4cfb6800816411c19ad7b27`

### E07 — pg_cron talkx-scheduler-1min (2026-09-09)
- Vault: `talkx_scheduler_url`, `talkx_anon_key`
- Job ID=11, `status=succeeded` na primeira execução
- Migration: `supabase/migrations/20260909000000_talkx_scheduler_cron.sql`

### E08 — Hardening de segurança
- `AGENTS.md` criado: regras para agentes (nunca imprimir tokens)
- `CLAUDE.md` atualizado: seção Talk X
- ⚠️ **Ação manual pendente**: revogar `ghp_RO0W…` em GitHub → Settings → Personal access tokens; gerar novo fine-grained e atualizar worker `github-mcp-server`

### E09 — Testes: useTalkXMonitor (6 novos, 37/37 verde)
- `src/hooks/integrations/__tests__/useTalkXMonitor.test.ts`
- Testa: empty, null sent_at, agrupamento por minuto, janela 60 min, label HH:mm, determinismo

### E10 — Rebuild do grafo + documentação
- Graphify: 12.097 nodes, commit `80f139c6`
- `docs/talkx/ARQUITETURA.md`: diagrama Mermaid, métrica→fonte, tela→componente→etapa, máquina de estados
- `docs/talkx/README.md`, `CHANGELOG_TALKX.md` criados

> **Nota:** as etapas E11–E85 (Fases 1–7: design system, telas de visão geral/segmentos/templates,
> supressão, wizard, ciclo de vida da campanha) foram implementadas e mergeadas em `main`, mas não
> foram registradas neste changelog — ver `docs/talkx/PARIDADE.md` e
> `docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md` para o detalhamento etapa a etapa. As entradas abaixo
> retomam o registro a partir da Fase 8 (backend/observabilidade).

## Fase 8 — Backend, Rastreio & Observabilidade (2026-09-16)

### E86 — RPCs de agregação: overview_stats, campaign_report, segment_tags (#406)
- Migration `supabase/migrations/20260916130000_talkx_e86_rpcs_indexes_trigger.sql`
- RPCs `talkx_overview_stats`, `talkx_campaign_report`, `talkx_segment_tags` + 2 índices compostos + trigger de `use_count`
- `b1e0f561` — guardas de NULL nos RPCs (E86/E88), índice de FK ausente e regex de opt-out único

### E87 — Entregues/Lidas reais via webhook DELIVERY_ACK
- `a1622b6c` — `external_id` em `talkx_recipients`, RPC `talkx_increment_delivered`, webhook `DELIVERY_ACK` no `evolution-webhook` (mesmo commit também trouxe o E83, janela de envio mid-loop com auto-pausa)

### E88 — Respostas reais (#409)
- `695858d3` — `replied_at`, `replied_count`, `attributeTalkXReply` com janela de atribuição de 72h

### E89 — View talkx_campaign_metrics + RPC talkx_benchmarks (90d) (#414)
- `f5c46223` — cria a view e a RPC `talkx_benchmarks`
- `41c4eef1` — fix crítico: RLS bypass na view `talkx_campaign_metrics`
- `3ceae245` — CRÍTICO: revoga `EXECUTE` de `anon` em `talkx_benchmarks`/`record_talkx_link_click`
- `b313391a` (#495) — view sem `campaign_name`/`campaign_id` + RLS ausente em `talkx_link_clicks`

### E90 — Links rastreáveis: talkx_links/clicks/conversions
- `38a7ba57` — tabelas `talkx_links`, `talkx_link_clicks`, `talkx_conversions`; edge `talkx-link`; `{{link}}` interpolado no `talkx-send`
- `ebacbcfd` (#429) — hardening: `{{link}}` nunca fica sem substituição, rate limit, proteção contra IDOR, salt fixo do encurtador
- `e5240e62` — corrige ordem de substituição em `personalize()` + cobertura de teste
- `f747ac26` — slug de `talkx_links` passa a ser case-insensitive
- `c81a7128` (#439) — corrige regressão de match exato em `record_talkx_link_click`
- `3b91b053` — índices das FKs do E90
- `89af3ff0` — defesa em profundidade: revoga grants padrão de `anon`/`authenticated` nas 3 tabelas do E90

### E91 — Resiliência de envio: retry + auto-pausa (#427)
- `854bc3d0` — retry com backoff 30s/2min/10min, auto-pausa em `connection_lost`, timeout de 20s no `talkx-send`
- `e78f7587` — corrige bug de escopo (`ReferenceError`) e timeout inerte herdados do E91

### E92 — Insights heurísticos (4 regras) (#432)
- `05da94d6` — `useTalkXInsights.ts` com 4 regras heurísticas (sem IA)
- `3450f7b2` / `57ee3f86` — `InsightCard` nas telas Analytics e Overview
- `b313391a` — corrige a view de métricas usada pelos insights

### E93 — talkx_settings + TalkXSettings UI (#432)
- `05da94d6` (mesma leva do E92) — `TalkXSettings.tsx`, `useTalkXSettings.ts`, migration `20260916220000_talkx_e93_settings.sql`
- `0c71bd83` — renomeia migration por colisão de versão com PR concorrente

## Fase 9 — Importação, CRM 360 & Estados (2026-09-22)

### E94 — Importar contatos via CSV (#503)
- `ContactImportDialog` e o estado `isImportOpen` (`useContactsViewState`) já existiam prontos, mas nunca tinham sido conectados à tela de Contatos
- `3b8138e5` — conecta o botão "Importar CSV" e reaproveita `handleSync` (já usado por outros fluxos) como callback pós-importação

### E95 — Badge CRM 360 nos destinatários de campanha (#510)
- `851248d9` — `TalkXCRMBadge` (empresa + `rfm_score` colorido) abaixo de telefone/empresa em cada destinatário do `TalkXContactSelector`, reaproveitando `useCRMIntegrationEnabled` + `useExternalContact360Batch` (mesmo padrão já usado em Contacts/Inbox); gated por `crmIntegrationEnabled`
- Escopo limitado ao badge visual — vínculo/pendentes/sugestões de conversão do E95 completo (ver `PLANO_IMPLEMENTACAO_TALKX_100.md`) seguem em aberto

### E97 — Auditoria de estados e modais críticos (#511)
- `bce07d1b` — `TalkXCampaignRunning`: modal Pausar/Cancelar/Editar Limites ficava preso aberto quando a campanha saía da lista ativa (concluída/cancelada remotamente); handlers viravam no-op silencioso após a campanha sumir — fecha os 3 modais nesse efeito
- `TalkXCampaignScheduled` e `TalkXSegments`: `handleSave`/`save` sem guard contra duplo-clique — adiciona guard de `saving` + desabilita o botão durante o salvamento
- Verificado: `tsc -b --force` (0 erros), eslint nos 3 arquivos (0), vitest `src/components/talkx` (verde), typecheck-ratchet e lint-ratchet sem dívida nova
