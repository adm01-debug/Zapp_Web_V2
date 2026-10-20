# Inventário — violetas soltos fora do Talk X

Base: dia/2026-10-12 · Comando: `git grep -n -e 'badge-new' -e 'dash-violet' -e 'dash-tile-violet'`
Total: 80 ocorrências (58 em `src/`, 22 fora de `src/`).

## 1. Token oficial do t_f3f17002 — INTEGRADO

Conferido em `src/styles/tokens.css` e `tailwind.config.ts` (só leitura).

| papel | nome do token | classe Tailwind |
|---|---|---|
| preenchimento | `--violeta` | `bg-violeta` |
| texto SOBRE o preenchimento | `--violeta-foreground` | `text-violeta-foreground` |
| a cor como TEXTO sobre fundo claro | `--violeta-text` | (sem classe) `hsl(var(--violeta-text))` |

Valores medidos:
- claro (`:root`, `src/styles/tokens.css:394-396`): `--violeta: 265 80% 50%` · `--violeta-foreground: 0 0% 100%` · `--violeta-text: 265 75% 34%`
- escuro (`.dark`, `src/styles/tokens.css:571-573`): `--violeta: 265 80% 74%` · `--violeta-foreground: 265 60% 12%` · `--violeta-text: 265 75% 76%`

Tailwind: `tailwind.config.ts:103-106` (`violeta.DEFAULT`/`violeta.foreground`); o `-text` não vira classe por decisão
declarada em `tailwind.config.ts:100-102` (igual a `--primary-text`/`--warning-text`).

Dependência t_f3f17002 CONFIRMADA — não há bloqueio.

## 2. As 3 variáveis antigas (definições)

`:root` = linhas 3–403; `.dark` = linhas 406–580 · as 3 existem SÓ em `:root` (nenhuma tem override escuro).

| variável | definição | valor (único, sem `.dark`) |
|---|---|---|
| `--badge-new` | `src/styles/tokens.css:202` | `268 83% 63%` |
| `--dash-tile-violet` | `src/styles/tokens.css:357` | `260 69% 37%` |
| `--dash-violet` | `src/styles/tokens.css:362` | `282 95% 66%` |

Achado: como não têm par escuro nem par de texto, é o que o comentário de `DashboardCard.tsx:191` admite ("o violeta
não tem par de texto no sistema").
Nota: `docs/design/PLANO_REDESIGN_DASHBOARD_NAVY_100_ETAPAS.md:123` cita `--dash-violet-fg`, que NÃO existe em
`tokens.css` (grep = 0) — é só referência de plano.

## 3. Lista completa (80 ocorrências)

Fonte de produção (24 consumidores + a definição em `tokens.css`):

```
src/styles/tokens.css:202:    --badge-new: 268 83% 63%;
src/styles/tokens.css:357:    --dash-tile-violet: 260 69% 37%;
src/styles/tokens.css:362:    --dash-violet: 282 95% 66%;
src/styles/tokens.css:388:       Reconciliação do roxo: --dash-violet (282°) e --kpi-tile-purple (258°) são
src/components/catalog/CatalogProductCard.tsx:457:  bg-[hsl(var(--badge-new))] text-primary-foreground
src/components/catalog/ProductDetailDialog.tsx:413:  bg-[hsl(var(--badge-new))] text-primary-foreground
src/components/contacts/contactTypeConfig.tsx:51:  'hsl(var(--dash-violet))'
src/components/contacts/contactTypeConfig.tsx:52:  'bg-gradient-to-r from-dash-violet to-dash-violet/80'
src/components/contacts/contactTypeConfig.tsx:53:  'bg-dash-violet'
src/components/contacts/contactTypeConfig.tsx:54:  '...bg-dash-violet/15 dark:bg-dash-violet/10 text-[hsl(var(--dash-tile-violet))] dark:text-[hsl(var(--dash-violet))]'
src/components/dashboard/AIQuickAccess.tsx:30:  transcription: 'bg-dash-tile-violet'
src/components/dashboard/ScheduledReportsManager.tsx:35:  sla: 'bg-dash-tile-violet'
src/components/dashboard/goals/goalsStatus.ts:41:  'resolution-rate': 'bg-dash-tile-violet'
src/components/dashboard/overview/DashboardCard.tsx:51:  violet: 'bg-dash-tile-violet'
src/components/dashboard/overview/DashboardCard.tsx:191:  violet: 'bg-dash-violet/15 text-[hsl(var(--dash-tile-violet))] dark:bg-dash-violet/10 dark:text-dash-violet'
src/components/dashboard/overview/DashboardCard.tsx:213:  avatarHue [... 'bg-dash-tile-violet' ...]
src/components/dashboard/overview/DashboardCard.tsx:298:  fill {... violet: 'bg-dash-violet' ...}
src/components/dashboard/overview/DashboardKpiCard.tsx:37:  violet: 'bg-dash-violet'
src/components/dashboard/overview/DashboardKpiCard.tsx:45:  violet: 'hsl(var(--dash-violet))'
src/components/dashboard/overview/DashboardKpiCard.tsx:147:  violet: 'bg-dash-tile-violet'
src/components/dashboard/overview/NowPanel.tsx:27:  tile: 'bg-dash-tile-violet'
src/components/inbox/tabs/journey/JourneyStatsHero.tsx:22:  (comentário cita `dash-violet`)
src/components/inbox/tabs/journey/JourneyStatsHero.tsx:648:  iconClass="bg-dash-violet/15 text-dash-violet"
src/components/inbox/tabs/journey/JourneyStatsHero.tsx:801:  iconClass="bg-dash-violet/15 text-dash-violet"
src/components/integrations/IntegrationsHub.tsx:30:  color: 'bg-dash-tile-violet'
src/components/omnichannel/OmnichannelManager.tsx:29:  instagram: {... color: 'text-dash-violet', bg: 'bg-dash-violet/10' }
src/components/queues/queueColors.ts:18:  'hsl(var(--dash-violet))'  // violeta
src/components/team-chat/TeamConversationList.tsx:159:  '...text-[hsl(var(--dash-tile-violet))] dark:...dark:text-dash-violet'
src/lib/journey/model.ts:128:  (comentário mede `--dash-violet` 3,38:1)
src/lib/journey/model.ts:130:  (comentário mede `--dash-tile-violet` 1,65:1)
tailwind.config.ts:129:  "tile-violet": "hsl(var(--dash-tile-violet))"
tailwind.config.ts:134:  violet: "hsl(var(--dash-violet))"
```

Fora do Talk X (produção, a migrar): CatalogProductCard, ProductDetailDialog, contactTypeConfig, AIQuickAccess,
ScheduledReportsManager, goalsStatus, DashboardCard, DashboardKpiCard, NowPanel, JourneyStatsHero, IntegrationsHub,
OmnichannelManager, queueColors, TeamConversationList, journey/model.ts, tailwind.config.ts.

Talk X (cartão próprio t_6ea4e0f2 — NÃO tocar): TalkXAnalytics.tsx:210, TalkXSuppression.tsx:221,
analytics/AnalyticsPerformanceChart.tsx:52, kit/cells.tsx:16, kit/primitives.tsx:21, report/talkxReportCharts.ts:31,96,
segments/TalkXSegmentBuilder.tsx:168, tracking/TalkXSentSummaryChart.tsx:26,136, tracking/talkxTimelineCopy.ts:21,116,117.

Testes que pinam as variáveis (vão junto na migração): coresCruasInboxCrm.test.tsx:347,
catalog/__tests__/CT40_badgeTokens.test.tsx:5,11,44,47,48,51,52, dashboard/__tests__/DashboardCard.test.tsx:182,183,227,
integrations/__tests__/corCruaTokens.test.tsx:59, talkx/__tests__/TalkXAnalytics.performance.test.tsx:167,
lib/journey/__tests__/model.test.ts:111,112.

Docs/scripts (não são código): docs/catalogo/PARIDADE.md:119,126,206 · docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md:348,350,353 ·
docs/design/MODULO_TAREFAS_QUADRO_DASHBOARD.md:170 · docs/design/PLANO_REDESIGN_DASHBOARD_NAVY_100_ETAPAS.md:118,123,498,503,512,515 ·
docs/reconciliation/reaudit/2026-10-03/reports/modules/coverage.json:4743,12145,12185 · test-review-notes.json:178 · test-review.json:247 ·
test-review.md:16 · scripts/ia/ensaio-provisionamento.mjs:64.
