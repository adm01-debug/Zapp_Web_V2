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
