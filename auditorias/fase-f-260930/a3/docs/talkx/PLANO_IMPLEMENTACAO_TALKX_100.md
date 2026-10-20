# Talk X · Campanhas — Plano de Implementação em 100 Etapas

**Repo:** `adm01-debug/Zapp_Web_V2` · **Branch de trabalho:** `feat/talkx-campanhas-ui` (HEAD `c4ac1a1`, 20 commits à frente de `main`; `main` = `68bbfee` #288)
**DB:** Supabase Cloud `tnnnlkbymytvtqngbbqh` · **Deploy:** Vercel `juca1/zapp_web_v2` (branch `main`)
**Referência visual:** pacote "ZAPP — Campanhas / Talk X" (17 PNG 1672×941, telas 01–17)
**Gerado:** 2026-09-08 · **Autor:** Claude (sessão REDESIGN - CAMPANHAS - 02)

---

## 0. Estado real verificado em 2026-09-08 (base do plano)

| # | Fato verificado | Onde |
|---|---|---|
| 1 | `tsc --noEmit -p tsconfig.app.json` → **3 erros** no branch: `TalkXView.tsx:9` importa `PrimaryButton`/`GhostButton` de `./talkxShared` (não exportados; vivem em `@/components/dashboard/overview/DashboardCard`); `TalkXCampaignEditor.tsx:44` (legado, `onClick` tipado errado) | VPS `/workspace/repos/Zapp_Web_V2` |
| 2 | ESLint (react-compiler) → **20 erros**: `TalkXAnalytics.tsx:20` `Date.now` em render; `TalkXLiveMonitor.tsx:69,71,80,85` (`Date.now`, `Math.random`, memo não preservado); `TalkXOverview.tsx:157` `no-unused-expressions`; `TalkXWizardDelivery.tsx:44` `Date.now`, `:172–181` componentes `Section`/`Row` criados dentro do render; `useCampaignEditor.ts:88,103` `set-state-in-effect` | idem |
| 3 | **`TalkXLiveMonitor.tsx:85` gera o gráfico "Ritmo de entrega" com `Math.random()`** — dado fabricado | idem |
| 4 | Legados ainda no branch: `TalkXBlacklist.tsx`, `TalkXCampaignCard.tsx` (staged `D` no VPS, não commitado — lint ratchet bloqueou), `TalkXCampaignEditor.tsx`, `TalkXMessagePreview.tsx`, `TalkXRecipientsList.tsx`. `TalkXContactSelector.tsx` **ainda é importado** por `TalkXCampaignWizard.tsx:18` (mantém) | `git status`, grep |
| 5 | DB: 6 tabelas `talkx_*` (`campaigns`, `recipients`, `blacklist`, `segments`, `templates`, `campaign_events`), **0 linhas em todas**; nenhuma função `talkx*`; **nenhum job em `cron.job`** → `talkx-scheduler` ("Called by pg_cron every minute") nunca roda | `db_batch_query` |
| 6 | `talkx-send/index.ts` não persiste `sendResult.key.id` → impossível casar `DELIVERY_ACK`/`READ` com o destinatário; `delivered_at`/`delivered_count` nunca preenchem | `talkx-send/index.ts:225-252` |
| 7 | `_shared/evolution-webhook-msg-handlers.ts:83` já mapeia `DELIVERY_ACK→delivered`, `READ→read` por `messages.external_id` → ponto de gancho para `talkx_recipients` | idem |
| 8 | `talkx_recipients` não tem `read_at`, `replied_at`, `clicked_at`, `external_id`; `talkx_blacklist` não tem `phone`/`expires_at` → "Respostas", "Lidas", "Cliques", "Conversões", "Opt-outs 30 dias" das telas 07/11/14 **não têm backend** | schema |
| 9 | Header atual do módulo é "Talk X"; mock (01) é "Campanhas · Conecte. Engaje. Converta." com botões Ajuda + Nova campanha | `TalkXView.tsx:84` |
| 10 | `graphify-out/GRAPH_REPORT.md` é de 2026-09-07; HEAD é de 08/09 → grafo velho | `graphify-out/` |
| 11 | PAT `ghp_RO0W…` foi colado no transcript do chat anterior (REDESIGN - CAMPANHAS - 01) → **rotacionar** | segurança |
| 12 | Tokens do tema carvão (`.dark`): `--background 240 6% 6%`, `--card 240 5% 10%`, `--card-elevated 240 5% 13%`, `--border 240 4% 18%`, `--primary 221 83% 53%`, `--primary-glow 230 83% 63%`, `--success 142 71% 45%`, `--warning 40 91% 60%`, `--destructive 354 100% 68%`, `--info 213 94% 62%`; glows `--glow-primary-sm/md/lg`, `--shadow-glow-*` | `src/styles/tokens.css:323-404` |
| 13 | Primitivos disponíveis: `DashboardCard`, `SectionHeader`, `StatusChip`, `Pill`, `InitialsAvatar`, `PrimaryButton`, `GhostButton`, `ProgressBar` (`dashboard/overview/DashboardCard.tsx`); `talkxShared.tsx` com `IconTile`, `ModuleHeader`, `RailCard`, `RailAction`, `MetaRow`, `WhatsAppBubble`, `FilterBar`, `TalkXPagination`, `Th/Td`, `StatusPill`, estados vazio/erro/skeleton; libs `recharts`, `framer-motion`, `@tanstack/react-virtual`, `@hello-pangea/dnd`, `date-fns`, `zod`, `vaul`, `cmdk` | repo |
| 14 | Testes: `src/components/talkx/__tests__/TalkX.test.tsx` (32 `it`) mocka a cadeia `.from().select().order()` de `useTalkX` | repo |
| 15 | Workflows: `ci.yml`, `deploy-functions.yml` (deploya edge functions no push em `main`), `db-migrate.yml`, `db-guard.yml`, `types-sync.yml` | `.github/workflows` |

---

## Regras do plano (valem para todas as 100 etapas)

1. **Carvão fica.** Fundo/superfícies usam só `--background`, `--card`, `--card-elevated`, `--border`, `--input`. Onde o mock usa navy `#08111c`/`#0d1927`, aqui é carvão. **Nenhum token novo de cor de fundo.**
2. **O "azul" do mock vira acento, não fundo:** `--primary` + `--primary-glow` em tiles de ícone (gradiente), botões primários, tabs ativas, barras de progresso, anéis de foco, sparklines e glows (`--glow-primary-*`, `--shadow-glow-primary`). Tiles coloridos: `blue|green|violet|amber|red` = `primary|success|violet-500|warning|destructive`.
3. **Zero número fabricado.** Toda métrica renderizada vem de `talkx_*`, `contacts`, `messages` ou de RPC. Métrica sem backend → a etapa de backend vem **antes** da etapa de UI (Fase 8). Enquanto não existir, o card não renderiza (não mostra "—" decorativo em KPI hero).
4. **Diff mínimo.** Componentes existentes em `talkxShared.tsx`/`DashboardCard.tsx` são estendidos com props opcionais; não renomear, não mover.
5. **Cada etapa = 1 commit** `feat(talkx): E<nn> <título>` no branch `feat/talkx-campanhas-ui` (até E10) e depois em `feat/talkx-<fase>` por fase, PR pequeno para `main`.
6. **Gate de conclusão de toda etapa:** `npx tsc --noEmit -p tsconfig.app.json` = 0 erros · `npx eslint src/components/talkx src/hooks/integrations/useTalkX*.ts` = 0 erros · `npx vitest run src/components/talkx` verde · checklist da etapa 100% marcado.
7. **Escrita no GitHub:** `GITHUB - MCP - FOREVER` (`github_push_files`) ou `code_commit` no VPS. **DDL:** `db_query` no MCP `SUPABASE - ZAPP WEB V2` + arquivo em `supabase/migrations/` + `schema-catalog.json`/`schema-manifest.json` atualizados (o `db-guard.yml` falha se divergir).
8. **Shell dos containers é `dash`**; sem Python no `claude-code`; tarefa pesada → `claude -p '...' --model sonnet` via `portainer_exec_container`.
9. Nomes de arquivo novos seguem `src/components/talkx/TalkX<Nome>.tsx`, hooks em `src/hooks/integrations/useTalkX<Nome>.ts`, RPC `public.talkx_<verbo>_<objeto>`, edge functions `talkx-<verbo>`.
10. Antes de grep estrutural: `graphify explain "TalkXView.tsx"` / `graphify path "TalkXOverview.tsx" "public.talkx_campaigns"` (após E10 rebuild).

---

## Mapa de fases

| Fase | Etapas | Entrega | Tela(s) de referência |
|---|---|---|---|
| 0 · Saneamento & merge | E01–E10 | branch compila, lint limpo, sem dado fake, merge em `main`, cron, PAT rotacionado | — |
| 1 · Design system Talk X (carvão) | E11–E20 | primitivos visuais alinhados ao mock sem mudar tokens de fundo | 01, 17 |
| 2 · Visão geral | E21–E30 | tela 01 completa com rail direito | 01 |
| 3 · Segmentos | E31–E40 | biblioteca + detalhes + construtor | 02, 03 |
| 4 · Templates | E41–E50 | galeria + editor + preview | 04, 05 |
| 5 · Supressão | E51–E60 | lista + centro de proteção + atividade | 06 |
| 6 · Nova campanha (wizard) | E61–E70 | 4 passos + revisão + confirmação | 08, 09, 10 |
| 7 · Ciclo de vida da campanha | E71–E85 | agendada, monitor, andamento, pausada, relatório | 10, 11, 12, 13, 14 |
| 8 · Backend, rastreio & observabilidade | E86–E93 | entregue/lido/resposta/clique reais, cron, RLS, realtime | 07, 11, 14 |
| 9 · Importação, ajuda, estados, QA & release | E94–E100 | CRM 360/CSV, ajuda, estados, a11y, e2e, release | 15, 16, 17 |

---

# FASE 0 — SANEAMENTO & MERGE (E01–E10)

### E01 · Corrigir os 3 erros de tipo que quebram o build do branch
**Objetivo:** `tsc` em 0 erros antes de qualquer trabalho visual.
**Arquivos:** `src/components/talkx/TalkXView.tsx`, `src/components/talkx/TalkXCampaignEditor.tsx`
1. `git checkout feat/talkx-campanhas-ui && git pull` no VPS; confirmar HEAD `c4ac1a1`.
2. Em `TalkXView.tsx:9` trocar o import de `PrimaryButton, GhostButton` para `@/components/dashboard/overview/DashboardCard` (mesma origem usada por `TalkXCampaignWizard.tsx:14`).
3. Manter `ModuleHeader, IconTile` vindo de `./talkxShared`.
4. Não recriar `PrimaryButton` em `talkxShared` (evita duplicar primitivo).
5. `TalkXCampaignEditor.tsx` é legado (E03 remove); nesta etapa apenas confirmar que nenhum arquivo o importa (`grep -rn TalkXCampaignEditor src/`).
6. Rodar `npx tsc --noEmit -p tsconfig.app.json | grep -i talkx` → esperar só o erro do Editor.
7. Se sobrar erro em `TalkXView`, verificar a assinatura de `PrimaryButton` (`icon`, `onClick`, `size`) contra o uso.
8. Rodar `npx vitest run src/components/talkx` para garantir que o mock de `useTalkX` continua batendo.
9. Commit `feat(talkx): E01 fix imports PrimaryButton/GhostButton em TalkXView`.
10. Registrar no `docs/talkx/CHANGELOG_TALKX.md` (criado nesta etapa) a linha da E01.
**Checklist**
- [ ] `TalkXView.tsx` importa botões de `DashboardCard`
- [ ] `tsc` só acusa `TalkXCampaignEditor.tsx`
- [ ] vitest talkx verde
- [ ] commit no branch
- [ ] `docs/talkx/CHANGELOG_TALKX.md` criado

### E02 · Remover dado fabricado do Monitor ao Vivo (`Math.random`)
**Objetivo:** gráfico "Ritmo de entrega" só com `talkx_recipients.sent_at` real, bucketizado por minuto.
**Arquivos:** `src/components/talkx/TalkXLiveMonitor.tsx`, `src/hooks/integrations/useTalkXMonitor.ts` (novo)
1. Criar `useTalkXMonitor(campaignId)` que consulta `talkx_recipients` (`select sent_at, delivered_at, status`) da campanha, `refetchInterval: 5_000`.
2. No hook, calcular `rateByMinute`: agrupar `sent_at` em buckets de 1 min nos últimos 60 min (chave `HH:mm`), série `Enviadas`; `delivered_at` → `Entregues` (vai ficar 0 até E87; não inventar).
3. Expor `elapsedSeconds` calculado com `useEffect` + `setInterval(1000)` e `useState` (remove `Date.now()` do render → resolve lint `purity` em `:71`).
4. Remover o `chartData` com `Math.random` (`:80-86`); consumir `rateByMinute` do hook.
5. Trocar `useMemo` que o compilador não preserva (`:69`, `:80`) por valores derivados simples (o React Compiler memoiza sozinho).
6. Mostrar `Previsto` (linha tracejada) só como `total_recipients / minutos estimados` a partir de `speed_profile` — é projeção declarada, rotulada "previsto".
7. Estado vazio do gráfico quando `sent_at` ainda não existe: `TalkXEmptyState` pequeno "Aguardando primeiros envios".
8. `TalkXAnalytics.tsx:20` — mover `Date.now()` para `useState(() => Date.now())` no topo do componente (ou receber `now` por prop).
9. Testar com `INSERT` de 3 recipients fictícios em campanha de teste no DB → gráfico reflete; depois `DELETE` deles.
10. Commit `feat(talkx): E02 monitor sem Math.random — ritmo real por minuto`.
**Checklist**
- [ ] Nenhum `Math.random`/`Date.now` em render em `talkx/`
- [ ] `useTalkXMonitor.ts` criado e testado com dados reais
- [ ] Linha "Previsto" rotulada como projeção
- [ ] eslint sem `react-hooks/purity` em LiveMonitor/Analytics
- [ ] commit

### E03 · Excluir componentes legados órfãos
**Objetivo:** só o módulo novo no branch.
**Arquivos:** `TalkXBlacklist.tsx`, `TalkXCampaignCard.tsx`, `TalkXCampaignEditor.tsx`, `TalkXMessagePreview.tsx`, `TalkXRecipientsList.tsx`
1. `grep -rn "TalkXBlacklist\|TalkXCampaignCard\|TalkXCampaignEditor\|TalkXMessagePreview\|TalkXRecipientsList" src/` → confirmar que só se referenciam entre si.
2. Confirmar `TalkXContactSelector.tsx` é usado pelo wizard → **mantém**.
3. Verificar `src/pages/lazyViews.ts` e `ViewRouter.tsx` não apontam para os legados.
4. Verificar `__tests__/TalkX.test.tsx` não importa legados; se importar, remover só esses `describe`.
5. `git rm` dos 5 arquivos no VPS (o `D` de `TalkXCampaignCard` já está staged).
6. `tsc` → 0 erros no escopo talkx.
7. Rodar o ratchet de lint que bloqueou o commit anterior (`git commit` dispara hook) — se falhar por E04, fazer E04 antes e commitar junto.
8. Atualizar `schema-catalog.json` só se algum legado estivesse listado como consumidor de tabela.
9. Commit `feat(talkx): E03 remove 5 componentes legados (Blacklist, Card, Editor, MessagePreview, RecipientsList)`.
10. `git push origin feat/talkx-campanhas-ui`.
**Checklist**
- [ ] 5 arquivos removidos do branch remoto
- [ ] `TalkXContactSelector.tsx` preservado
- [ ] `tsc` 0 erros
- [ ] hook de lint passou
- [ ] push feito

### E04 · Zerar erros do React Compiler (`static-components`, `set-state-in-effect`, `no-unused-expressions`)
**Objetivo:** ESLint 0 erros em `talkx/` e `useTalkX*`.
**Arquivos:** `TalkXWizardDelivery.tsx`, `useCampaignEditor.ts`, `TalkXOverview.tsx`
1. `TalkXWizardDelivery.tsx:172-181` — mover `Section` e `Row` para fora de `TalkXWizardReview` (top-level do arquivo, `function Section(...)`, `function Row(...)`).
2. `TalkXWizardDelivery.tsx:44` — `Date.now()` → `useState(() => Date.now())` ou calcular dentro de handler.
3. `useCampaignEditor.ts:88` — o `setState` síncrono no `useEffect` que hidrata `campaign` → converter para inicialização lazy no `useState(() => hydrate(campaign))` + `key` no componente pai quando `campaign.id` muda.
4. `useCampaignEditor.ts:103` — idem para `initial.segmentId/templateId`: aplicar no `useState` inicial, não em effect.
5. `TalkXOverview.tsx:157` — `n.has(c.id) ? n.delete(c.id) : n.add(c.id)` → `if (n.has(c.id)) n.delete(c.id); else n.add(c.id);`.
6. Warnings `no-restricted-imports` (`@/integrations/supabase/client` em componentes): mover chamadas diretas de `TalkXLiveMonitor` (export CSV), `TalkXSegments`, `TalkXSuppression`, `TalkXTemplates` para os hooks correspondentes (só as funções; sem mudar comportamento).
7. Warnings `react-refresh/only-export-components` em `talkxShared.tsx` — mover constantes (`CAMPAIGN_STATUS`, `RECIPIENT_STATUS`, `OBJECTIVES`, `SPEED_PROFILES`, `SUPPRESSION_ORIGIN`, `TEMPLATE_*`, `VARIABLE_KEYS`) para `src/components/talkx/talkxConstants.ts` e re-exportar? **Não** — re-export mantém o warning. Atualizar imports nos consumidores (é o único churn aceito nesta etapa).
8. `npx eslint src/components/talkx src/hooks/integrations/useTalkX*.ts` → 0 erros, 0 warnings.
9. `vitest` verde; ajustar mocks se o hook mudou a cadeia de chamadas.
10. Commit `feat(talkx): E04 lint react-compiler zerado`.
**Checklist**
- [ ] 0 erros eslint no escopo
- [ ] `Section`/`Row` top-level
- [ ] `useCampaignEditor` sem setState em effect
- [ ] constantes em `talkxConstants.ts`
- [ ] vitest verde

### E05 · Rebase em `main` e resolver conflitos
**Objetivo:** branch aplicável em cima de `68bbfee` (#288).
1. `git fetch origin main && git rebase origin/main` no VPS (branch tem 20 commits pequenos; conflitos prováveis só em `schema-catalog.json`, `schema-manifest.json`, `ViewRouter.tsx`).
2. Em conflito de `schema-catalog.json`: regenerar com o script do repo (`scripts/db-audit/*` — ver `check-migration-drift.mjs`) em vez de editar à mão.
3. Em conflito de `ViewRouter.tsx`: manter a linha `talkx` em `COMPACT_GUTTER_VIEWS` + as mudanças de #288.
4. Após rebase: `npm ci` (lockfile pode ter mudado em main), `tsc`, `eslint`, `vitest run`.
5. `npm run build` (vite) para garantir que o chunk lazy de `TalkXView` gera.
6. Verificar `scripts/db-audit/check-migration-drift.mjs` contra a migration `20260908120000` (o `db-guard.yml` roda isso no PR).
7. `git push --force-with-lease origin feat/talkx-campanhas-ui`.
8. Abrir PR `feat/talkx-campanhas-ui → main` com corpo = resumo das E01–E04 + link deste plano.
9. Esperar `ci.yml`, `db-guard.yml`, `codeql.yml`; corrigir o que falhar dentro do branch.
10. Registrar SHA final no CHANGELOG.
**Checklist**
- [ ] rebase sem commits duplicados
- [ ] `npm run build` OK
- [ ] PR aberto com CI verde
- [ ] `--force-with-lease` (não `--force`)
- [ ] CHANGELOG atualizado

### E06 · Squash-merge do PR em `main` e verificação do deploy Vercel
1. `github_merge_pull_request` com `merge_method: squash`, título `feat(talkx): módulo Campanhas — wizard, segmentos, templates, supressão, analytics, monitor`.
2. Confirmar `deploy-functions.yml` disparou (deploya `talkx-send` e `talkx-scheduler`).
3. Confirmar `db-migrate.yml`: a migration já foi aplicada manualmente no chat anterior; o workflow deve detectar `schema_migrations` e pular (não reaplicar).
4. Vercel: `get_deployment` do commit de merge → `READY`.
5. Abrir `https://zapp-web-v2.vercel.app/?view=talkx` via `CLOUDFLARE - BROWSER` (`br_screenshot`) autenticado se houver sessão; senão só checar 200 + bundle contém `TalkXOverview`.
6. `version.json` do deploy bate com o SHA.
7. Sentry: nenhum evento novo com `talkx` nos 30 min seguintes.
8. Deletar branch remoto `feat/talkx-campanhas-ui` após merge (o VPS cria `feat/talkx-f1` na E11).
9. Atualizar memória do projeto (`/areas/zapp-web-v2-hostinger-migration.md`) com o SHA de merge.
10. CHANGELOG: "E06 merged <sha>".
**Checklist**
- [ ] PR mergeado (squash)
- [ ] edge functions deployadas
- [ ] Vercel READY no SHA
- [ ] Sentry limpo
- [ ] branch antigo removido

### E07 · Agendar `talkx-scheduler` no pg_cron
**Objetivo:** campanhas `scheduled` iniciam sozinhas.
**Arquivos:** `supabase/migrations/20260909_talkx_scheduler_cron.sql`
1. Confirmar extensões `pg_cron` e `pg_net` ativas (`select extname from pg_extension`).
2. Guardar a URL da function e a service key em `vault.secrets` (`talkx_scheduler_url`, `talkx_service_key`) — nunca em texto na migration.
3. `select cron.schedule('talkx-scheduler-1min', '* * * * *', $$ select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='talkx_scheduler_url'), headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='talkx_service_key'),'Content-Type','application/json'), body := '{}'::jsonb) $$);`
4. Aplicar via `db_query` + `INSERT` em `supabase_migrations.schema_migrations` (workaround do `apply_migration`).
5. Arquivo da migration commitado + `schema-catalog.json`.
6. Criar campanha de teste `scheduled_at = now()+2min` com 1 recipient próprio; confirmar que vira `sending` sem clique.
7. Verificar `cron.job_run_details` sem erro nas 3 primeiras execuções.
8. Confirmar que `talkx-send` aceita a service key (fix do chat anterior) — status 200 no log da function.
9. Cancelar/limpar a campanha de teste.
10. Commit `feat(talkx): E07 cron do scheduler (1 min) via pg_cron + vault`.
**Checklist**
- [ ] job `talkx-scheduler-1min` em `cron.job`
- [ ] segredos no vault (não na migration)
- [ ] campanha agendada iniciou sozinha
- [ ] `job_run_details` sem erro
- [ ] migration versionada

### E08 · Rotacionar o PAT exposto e endurecer o fluxo de escrita no GitHub
1. GitHub → Settings → Developer settings → revogar `ghp_RO0W…` (o token que o chat anterior colou no transcript).
2. Gerar fine-grained token só para `adm01-debug/Zapp_Web_V2` (+ repos usados pelo MCP FOREVER), permissão Contents RW, expiração 90 dias.
3. Atualizar o segredo do worker `github-mcp-server` (`cf_secret_put`) e `/workspace/.git-credentials` no container `claude-code`.
4. Testar `github_get_file` + `github_push_files` num arquivo `docs/talkx/.token-check` e apagar.
5. Adicionar ao `AGENTS.md`/`CLAUDE.md` do repo: "nunca imprimir conteúdo de `.git-credentials` ou tokens em output".
6. Grep no histórico do repo por `ghp_` (`git log -p | grep -c ghp_`) → esperado 0.
7. Habilitar secret scanning + push protection no repo (`github_request` PATCH `/repos/.../` `security_and_analysis`).
8. Registrar a rotação em `docs/talkx/CHANGELOG_TALKX.md` (sem o token).
9. Atualizar memória `/areas/self-hosted-infrastructure.md` com a data da rotação.
10. Sem commit de código nesta etapa além do doc.
**Checklist**
- [ ] token antigo revogado
- [ ] novo token nos 2 lugares (worker + VPS)
- [ ] push de teste OK
- [ ] push protection ativa
- [ ] doc atualizado

### E09 · Suíte de testes base do módulo
**Objetivo:** cobrir os hooks novos e a lógica pura antes do redesign.
**Arquivos:** `src/components/talkx/__tests__/*.test.ts(x)`, `src/hooks/integrations/__tests__/useTalkXSegments.test.ts`
1. Teste unitário de `buildFilter` em `useTalkXSegments.ts` (AND/OR, `contains`, `is_set`, `in_range`) — exportar a função.
2. Teste de `countAudience` com `supabase` mockado (verifica que `.or()` recebe as expressões geradas).
3. Teste de `personalizePreview`, `extractVariables`, `estimateSeconds`, `fmtDurationShort` de `talkxShared`.
4. Teste de `useCampaignEditor` (renderHook): hidratação por `campaign`, `initial.segmentId`, validação por passo.
5. Teste de `useTalkXMonitor.rateByMinute` com 5 `sent_at` sintéticos → buckets corretos.
6. Teste de render de `TalkXOverview` com 3 campanhas mock → 5 KPIs, tabela, paginação.
7. Teste de `TalkXView` navegando tabs (já parcialmente coberto).
8. Manter os 32 testes existentes verdes.
9. Cobertura mínima do diretório `talkx/` ≥ 60% (vitest `--coverage`), registrada no CHANGELOG.
10. Commit `test(talkx): E09 suíte base hooks + shared`.
**Checklist**
- [ ] ≥ 8 arquivos de teste novos/atualizados
- [ ] cobertura ≥ 60% em `talkx/`
- [ ] nenhum teste depende de rede
- [ ] CI verde
- [ ] commit

### E10 · Rebuild do grafo e documentação de arquitetura do módulo
1. `. /workspace/.local/env.sh && cd /workspace/repos/Zapp_Web_V2 && graphify update . --force`.
2. Confirmar commit de origem no `GRAPH_REPORT.md` = `git rev-parse HEAD`.
3. `graphify explain "TalkXView.tsx"` e `graphify path "TalkXOverview.tsx" "public.talkx_campaigns"` — colar saída em `docs/talkx/ARQUITETURA.md`.
4. Diagrama Mermaid (texto) em `ARQUITETURA.md`: View → tabs → hooks → tabelas → edge functions → Evolution.
5. Tabela "métrica → fonte de dado" (enviadas=`recipients.sent_at`, entregues=`delivered_at`, falhas=`status=failed`, …; "sem backend" onde for o caso, apontando E86–E92).
6. Tabela "tela do mock → componente → etapa".
7. Documentar convenção de commit/branch por fase (regras 5–7).
8. Adicionar `docs/talkx/README.md` linkando plano, arquitetura, changelog.
9. Commit `docs(talkx): E10 arquitetura + grafo atualizado`.
10. Criar branch `feat/talkx-f1-design-system` a partir de `main` para a Fase 1.
**Checklist**
- [ ] grafo com HEAD atual
- [ ] `ARQUITETURA.md` com mapa métrica→fonte
- [ ] mapa tela→componente→etapa
- [ ] branch da Fase 1 criado
- [ ] commit

---

# FASE 1 — DESIGN SYSTEM TALK X SOBRE CARVÃO (E11–E20)

Princípio: reproduzir a **hierarquia visual** das telas (tiles com gradiente, glow, KPIs com mini-barras, rail direito 320px, pills, tabelas densas, tabs com ícone) usando **exclusivamente** os tokens já existentes do tema carvão. Tudo desta fase vive em `src/components/talkx/talkxShared.tsx`, `src/components/talkx/talkxConstants.ts` e `src/styles/components.css` (classes `.talkx-*`).

### E11 · Camada de utilitários visuais `.talkx-*` em `components.css`
**Arquivos:** `src/styles/components.css`
1. `.talkx-tile` — quadrado arredondado `--radius-lg` com `background: linear-gradient(135deg, hsl(var(--tile-from)), hsl(var(--tile-to)))` e `box-shadow: var(--shadow-glow-primary)`; variáveis `--tile-from/--tile-to` setadas por classe de cor.
2. `.talkx-tile--blue|green|violet|amber|red` mapeando para `--primary/--primary-glow`, `--success`, `--accent-violet` (usar `262 83% 58%` só como variável local de acento, não de fundo), `--warning`, `--destructive`.
3. `.talkx-card` — `bg-card border border-border/70 rounded-[var(--radius-lg)]` + `hover:border-primary/30 hover:shadow-[var(--glow-primary-sm)]` transição 150 ms.
4. `.talkx-card--hero` — `bg-card-elevated` + `background-image: radial-gradient(ellipse at top right, hsl(var(--primary)/0.12), transparent 60%)` (o "brilho" do card Talk X do mock 01 sem mudar o fundo).
5. `.talkx-kpi-bars` — 7 barrinhas verticais (`flex items-end gap-[3px]`), altura por `--h1..--h7`, cor `hsl(var(--primary)/0.35)` com a última em `--primary`.
6. `.talkx-pill` + tons `success|danger|warning|info|violet|muted` (usa `Pill` existente; só adiciona o `dot` pulsante para `sending`).
7. `.talkx-table` — `text-[12.5px]`, `thead` `text-muted-foreground uppercase tracking-wide text-[11px]`, linhas `h-[60px]`, hover `bg-muted/20`.
8. `.talkx-rail` — coluna direita `w-[320px] xl:w-[340px] space-y-4 sticky top-4`.
9. `.talkx-glow-ring` — anel de foco `ring-2 ring-primary/40 ring-offset-2 ring-offset-background`.
10. Commit `feat(talkx): E11 utilitários .talkx-* (tiles, hero, kpi-bars, table, rail)`.
**Checklist**
- [ ] nenhuma cor de fundo nova (só `--card`, `--card-elevated`, `--background`)
- [ ] classes documentadas em comentário curto no CSS
- [ ] Tailwind não purga (`safelist` se usar classes dinâmicas)
- [ ] tsc/eslint ok
- [ ] commit

### E12 · `IconTile` com gradiente + glow e tamanhos do mock
**Arquivos:** `talkxShared.tsx`
1. `IconTile` ganha prop `glow?: boolean` (default `true` em headers, `false` em tabela).
2. Tamanhos: `32` (tabela), `36` (rail), `40` (KPI), `48` (header de aba), `56` (header do módulo) — já existem; ajustar `rounded` para `--radius-md` em ≤36 e `--radius-lg` em ≥40.
3. Aplicar `.talkx-tile .talkx-tile--{color}`.
4. Ícone `lucide` em `text-primary-foreground`, `strokeWidth 2`.
5. Variante `soft` (fundo `hsl(var(--primary)/0.12)` + ícone `text-primary`) para linhas de tabela (mock 01 usa thumbnail; quando não há mídia, usa tile soft).
6. Storybook não existe → criar `src/components/talkx/__dev__/TalkXKit.tsx` (rota dev `?view=talkx-kit`, só em `import.meta.env.DEV`) exibindo todos os primitivos.
7. Testar contraste ícone/tile ≥ 4.5:1 nas 5 cores (`--warning` com `--warning-foreground` escuro).
8. Snapshot test do `IconTile` nas 5 cores.
9. Atualizar usos existentes (`ModuleHeader`, `RailCard`, KPIs) sem mudar props.
10. Commit `feat(talkx): E12 IconTile gradiente+glow`.
**Checklist**
- [ ] 5 cores × 5 tamanhos renderizam
- [ ] variante `soft`
- [ ] `TalkXKit` acessível em DEV
- [ ] contraste ok
- [ ] commit

### E13 · `KpiCard` hero com mini-barras, delta e ícone (mock 01/02/04/06/07)
**Arquivos:** `talkxShared.tsx` (novo `KpiCard`)
1. Props: `icon`, `color`, `label`, `value` (string formatada), `delta?: { value: number; suffix?: '%'|'p.p.'; tone?: 'up'|'down' }`, `bars?: number[]` (7 valores reais), `hint?`.
2. Layout: tile 40 à esquerda, label 12px `text-muted-foreground`, valor 26px `font-semibold tracking-tight`, delta à direita do valor com seta (`ArrowUpRight`/`ArrowDownRight`), barras no canto inferior direito.
3. `bars` vem de `barsByDay()` (já existe em `talkxShared`) — só dado real; sem `bars` → não renderiza a área (sem placeholder).
4. `delta` só quando há período anterior comparável; caso contrário não renderiza.
5. Grid: `grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4`.
6. Animação de entrada `framer-motion` `variants.fadeUp` com `delay = index*40ms` (usar `src/components/ui/motion/variants.ts`).
7. Skeleton `KpiCardSkeleton` mesma altura (96px).
8. Tooltip no `hint` (`@/components/ui/tooltip`).
9. Teste de render com/sem `bars` e `delta`.
10. Commit `feat(talkx): E13 KpiCard`.
**Checklist**
- [ ] altura fixa 96px, sem CLS
- [ ] barras só com dado real
- [ ] delta condicional
- [ ] skeleton
- [ ] commit

### E14 · Cabeçalho do módulo "Campanhas" + barra de tabs com ícones (mock 01)
**Arquivos:** `TalkXView.tsx`, `talkxShared.tsx` (`ModuleHeader`, novo `ModuleTabs`)
1. `ModuleHeader`: tile 56 `Zap` azul, título "Campanhas" 28px, subtítulo "Conecte. Engaje. Converta. Comunicação em escala, com resultado real."
2. À direita: `GhostButton icon={CircleHelp}` "Ajuda" (abre E96) + `PrimaryButton icon={Plus}` "Nova campanha" com `shadow-glow-primary`.
3. `ModuleTabs`: chips retangulares `h-10 px-4 rounded-lg border border-border/60 bg-input/40`, ativa = `bg-primary/12 border-primary/40 text-foreground`, ícone 16px, chevron opcional (`Templates ▾`, `Analytics ▾`).
4. Tabs: Visão geral (`LayoutDashboard`), Segmentos (`Users`), Templates (`FileText`, chevron), Lista de supressão (`ShieldBan`), Analytics (`BarChart3`, chevron).
5. Chevron abre `DropdownMenu` com subitens (Templates: Biblioteca / Criar; Analytics: Campanhas / Segmentos / Comparativo) — subitens ligam a estado interno da aba.
6. Sincronizar aba com query param `?view=talkx&tab=segments` (deep link) via `useSearchParams` já usado no `ViewRouter`.
7. Manter `Tabs` do Radix por baixo (a11y, teclado) — só troca o `TabsTrigger` visual.
8. Breadcrumb compacto `Talk X › Campanhas › <aba>` acima do header nas telas internas (mock 03/05/09).
9. Responsivo: tabs em `overflow-x-auto` com fade nas bordas em < 1024px.
10. Commit `feat(talkx): E14 header Campanhas + ModuleTabs`.
**Checklist**
- [ ] título/subtítulo iguais ao mock 01
- [ ] 5 tabs com ícone, 2 com chevron
- [ ] deep link `tab=` funciona
- [ ] teclado navega tabs
- [ ] commit

### E15 · Botões: Primary com glow, Ghost bordado, Danger, IconButton de ações `⋮`
**Arquivos:** `DashboardCard.tsx` (props opcionais), `talkxShared.tsx`
1. `PrimaryButton` ganha `glow?: boolean` → `shadow-[var(--shadow-glow-primary)] hover:shadow-[var(--glow-primary-md)]`.
2. `PrimaryButton` ganha `tone?: 'primary'|'danger'|'success'` (mock 12/13: "Sim, pausar agora" vermelho, "Retomar campanha" azul, "Confirmar envio" verde).
3. `GhostButton`: borda `border-border/70`, fundo `bg-input/40`, hover `bg-muted/50`; tamanhos `sm|md|lg` já existem.
4. Novo `RowActionsMenu` (`⋮` 32×32) com `DropdownMenu`: itens recebidos por prop `[{label, icon, onSelect, danger?}]`.
5. Novo `SegmentedToggle` (lista/grade — mock 01/02/04/06) com `ToggleGroup` do Radix.
6. Estados `disabled`/`loading` (spinner `Loader2` 14px) nos 3 botões.
7. Foco visível `.talkx-glow-ring`.
8. Altura padrão 40px (md), 36px (sm), 48px (lg) — bater com inputs.
9. Atualizar `TalkXKit`.
10. Commit `feat(talkx): E15 botões glow/tone + RowActionsMenu + SegmentedToggle`.
**Checklist**
- [ ] `tone` e `glow` funcionam
- [ ] `RowActionsMenu` acessível por teclado
- [ ] loading state
- [ ] sem mudança visual em usos fora do talkx
- [ ] commit

### E16 · `FilterBar` v2: busca + selects com ícone + "Limpar filtros" + toggle lista/grade
**Arquivos:** `talkxShared.tsx`
1. Busca: `Search` 16px à esquerda, input `h-10 rounded-lg bg-input/40 border-border/70`, `⌘K` hint à direita quando `onCommandK` for passado.
2. Selects: `CardSelect` existente com ícone à esquerda e label como placeholder ("Todos os status", "Todos os canais", …).
3. Mock 06 usa label acima do select (Origem/Motivo/Campanha/Data/Status) → prop `labeled?: boolean`.
4. Date range: `Calendar` do repo em `Popover` ("Todos os períodos").
5. Botão "Limpar filtros" só aparece quando há filtro ativo (`hasActive`), estilo link azul.
6. `SegmentedToggle` lista/grade à direita (prop `view` / `onView`).
7. Chips de filtro ativo abaixo da barra (`Pill` com `×`), opcional.
8. Debounce 250 ms na busca (hook `useDebounce` já existe? — checar `src/hooks`; senão criar em `src/hooks/useDebouncedValue.ts`).
9. Responsivo: selects viram `Sheet` (vaul) em < 768px com botão "Filtros".
10. Commit `feat(talkx): E16 FilterBar v2`.
**Checklist**
- [ ] 5 modos (busca, selects, labeled, date, toggle)
- [ ] limpar só com filtro ativo
- [ ] mobile em sheet
- [ ] debounce
- [ ] commit

### E17 · Tabela densa: `DataTable` talkx com seleção, avatar/thumb, pills, progresso, paginação
**Arquivos:** `talkxShared.tsx` (`TalkXTable`, `TalkXPagination` v2)
1. `TalkXTable<T>` genérica: `columns: [{key, header, width?, align?, render}]`, `rows`, `getId`, `selectable?`, `onSelectionChange`, `rowActions?`, `stickyHeader`.
2. Checkbox de cabeçalho com estado indeterminado.
3. Célula "entidade": thumb 40×40 (`media_url`) ou `IconTile soft` + nome `font-medium` + descrição `text-muted-foreground text-[11.5px]` (mock 01).
4. Célula "segmento": `Pill` com nome + linha "1.248 contatos".
5. Célula "canal": ícone WhatsApp verde em círculo `bg-success/15`.
6. Célula "progresso": `%` + `ProgressBar` 6px tom por status (`sending`=info, `completed`=success, `paused`=warning).
7. Célula "resultados": `850 enviados` / `821 entregues (96,6%)` — entregues só quando `delivered_count>0` (E87), senão só enviados.
8. `TalkXPagination` v2: "Mostrando 1 a 8 de 24 campanhas" + botões numerados + "10 por página" select.
9. Virtualização com `@tanstack/react-virtual` quando `rows.length > 200`.
10. Commit `feat(talkx): E17 TalkXTable + paginação v2`.
**Checklist**
- [ ] genérica e tipada
- [ ] seleção múltipla
- [ ] célula entidade/segmento/canal/progresso/resultados
- [ ] virtualização > 200
- [ ] commit

### E18 · Rail direito: `HeroCard`, `RailCard` com glow, `RailAction`, `RecentList`, `TipCard`
**Arquivos:** `talkxShared.tsx`
1. `HeroCard` (mock 01 "Talk X — Campanhas que geram conversas e resultados"): `.talkx-card--hero`, tile 48, título 18px, subtítulo, área ilustrativa = 3 `IconTile` flutuantes (WhatsApp/Send/BarChart) com `framer-motion` float suave; **sem os números "+32% / -45% / +28%"** (não há fonte) — no lugar, 3 métricas reais: campanhas ativas, contatos alcançados (distinct `recipients.contact_id` com `sent_at`), taxa de sucesso.
2. `RailCard` ganha `glow` (já existe) + `action?` ("Ver todas").
3. `RailAction` (Nova campanha / Usar template / Criar segmento / Importar contatos) — tile 36, título, subtítulo; hover `border-primary/30`.
4. `RecentList` de campanhas: thumb 36, nome, `StatusPill` + `%`, `⋮`.
5. `TipCard` ("Dica do dia") — fundo `bg-success/10 border-success/30`, ícone lâmpada; texto vem de `talkxConstants.TIPS[]` rotacionado por dia (conteúdo estático, não métrica).
6. `AlertCard` amarelo (mock 06 "Contatos suprimidos são automaticamente excluídos…") tom `warning`.
7. `ProtectionGauge` (mock 06): anel SVG `stroke-dasharray` com `--success`, valor central = campanhas com `respectSuppression` (E63 grava flag) — até lá não renderiza.
8. `InsightCard` (mock 02/07 "Sugestão da IA") — tom `violet`, fonte = heurística de E92; até lá não renderiza.
9. Larguras: rail `320px` (≥1280), oculta em < 1280 (vira seção abaixo do conteúdo).
10. Commit `feat(talkx): E18 rail: Hero/RailAction/RecentList/Tip/Alert/Gauge`.
**Checklist**
- [ ] `HeroCard` sem número fabricado
- [ ] 6 componentes de rail
- [ ] responsivo < 1280
- [ ] `TalkXKit` atualizado
- [ ] commit

### E19 · Modais críticos padronizados (mock 17) + estados do sistema
**Arquivos:** `talkxShared.tsx` (`TalkXConfirmDialog`), `TalkXStates` já existente
1. `TalkXConfirmDialog` sobre `AlertDialog`: `icon` em tile colorido 48, `title`, `description`, `entityName` em negrito, `confirmLabel`, `tone` (`danger|primary|violet|success`), `checks?: {id,label}[]` (as 3 confirmações do mock 09), `details?: {label,value}[]` (mock 17 "Confirmar disparo").
2. Botão confirmar desabilitado até todos os `checks` marcados.
3. 6 presets exportados: `excluirCampanha`, `duplicarCampanha`, `removerSupressao`, `cancelarCampanha`, `confirmarDisparo`, `pausarCampanha`, `retomarCampanha`.
4. Estados: revisar `TalkXEmptyState` (ícone 64, título, descrição, CTA), `TalkXSkeletonRows` (linhas 60px com tile), `TalkXErrorState` (`Tentar novamente` + `Ver detalhes` colapsável com `error.message`), `TalkXDataUnavailableState` ("CRM 360 indisponível" → `Ver status dos serviços` linka `?view=connections`), `TalkXWhatsAppDisconnectedState` (CTA `Conectar WhatsApp` → `?view=connections`), `TalkXNoPermissionState`.
5. Detectar "sem permissão": `useAuth().role` fora de `admin|supervisor|agent` → estado.
6. Detectar "WhatsApp desconectado": `whatsapp_connections.status !== 'connected'` para a conexão da campanha.
7. Todos com `role="status"`/`aria-live` corretos.
8. Prancha em `TalkXKit` com os 6 estados + 7 modais.
9. Testes de `TalkXConfirmDialog` (checks bloqueiam confirmar).
10. Commit `feat(talkx): E19 modais críticos + estados do sistema`.
**Checklist**
- [ ] 7 presets de modal
- [ ] checks bloqueiam confirmar
- [ ] 6 estados com CTA real
- [ ] a11y (`aria-live`, foco inicial)
- [ ] commit

### E20 · Motion, densidade e responsividade do módulo
**Arquivos:** `src/components/ui/motion/variants.ts` (adições), `talkxShared.tsx`
1. Variantes `talkxFadeUp`, `talkxStagger(40ms)`, `talkxScaleIn` (modais), `talkxFloat` (hero).
2. `prefers-reduced-motion` respeitado (variantes viram `duration: 0`).
3. Escala de espaçamento fixa: página `p-6`, gap entre blocos `gap-5`, dentro de card `p-5`, entre KPIs `gap-4`, entre linhas de tabela `h-[60px]`.
4. Tipografia: título módulo 28/600, título de card 15/600, label 12/500 `muted`, valor KPI 26/600, corpo 12.5/400.
5. Breakpoints: `<768` 1 coluna + rail abaixo; `768–1279` 2 colunas sem rail; `≥1280` conteúdo + rail 320; `≥1536` rail 340.
6. Scroll interno da tabela com header sticky quando altura > viewport.
7. Verificar `COMPACT_GUTTER_VIEWS` no `ViewRouter` mantém `talkx`.
8. Lighthouse local (Chrome MCP `br_screenshot` 1280/1672/390) — salvar 3 prints em `docs/talkx/screens/f1/`.
9. Comparar lado a lado com mock 01 e listar diferenças residuais no CHANGELOG.
10. PR `feat/talkx-f1-design-system → main`, squash, deploy; criar `feat/talkx-f2-overview`.
**Checklist**
- [ ] reduced-motion ok
- [ ] 4 breakpoints testados com print
- [ ] escala de espaçamento documentada em `ARQUITETURA.md`
- [ ] PR mergeado
- [ ] branch F2 criado

---

# FASE 2 — VISÃO GERAL (E21–E30) · tela 01

### E21 · KPIs reais da Visão geral
**Arquivos:** `TalkXOverview.tsx`, `src/hooks/integrations/useTalkXStats.ts` (novo)
1. `useTalkXStats()` → 1 query agregada via RPC `talkx_overview_stats()` (E86) ou, até lá, `select status, sent_count, failed_count, delivered_count, total_recipients, created_at from talkx_campaigns`.
2. KPI 1 "Total de campanhas" = count; barras = campanhas criadas por dia (7 dias).
3. KPI 2 "Em andamento" = `status in ('sending','scheduled','paused')`; barras = por dia.
4. KPI 3 "Concluídas" = `completed`; delta vs 30 dias anteriores.
5. KPI 4 "Taxa de sucesso" = `sum(sent)/sum(sent+failed)`; delta em p.p. vs período anterior.
6. KPI 5 "Contatos alcançados" = `count(distinct contact_id) where sent_at is not null` (query separada em `talkx_recipients`).
7. Sem delta quando o período anterior tem 0 campanhas.
8. `refetchInterval: 30_000` só quando há campanha `sending`.
9. Testes do cálculo com fixtures.
10. Commit `feat(talkx): E21 KPIs reais`.
**Checklist**
- [ ] 5 KPIs com fonte real documentada
- [ ] delta condicional
- [ ] refetch só com campanha ativa
- [ ] testes
- [ ] commit

### E22 · Filtros da lista (status, canal, segmento, criador) + busca + lista/grade
**Arquivos:** `TalkXOverview.tsx`
1. `FilterBar` v2 com 4 selects: status (`CAMPAIGN_STATUS`), canal (só `WhatsApp` hoje — select desabilitado com 1 opção), segmento (`useTalkXSegments`), criador (`profiles` via `creators`).
2. Busca por `name`/`description` (client-side; server-side quando > 500 campanhas).
3. Persistir filtros em `sessionStorage` chave `talkx.overview.filters`.
4. Toggle lista/grade: grade reutiliza card compacto (thumb, nome, status, progresso).
5. "Limpar filtros" reseta tudo.
6. Contador "Mostrando X a Y de Z campanhas".
7. Ordenação por coluna (nome, status, progresso, agendada em) — `aria-sort`.
8. Estado vazio filtrado: "Nenhuma campanha com esses filtros" + "Limpar".
9. Testes de filtro combinado.
10. Commit `feat(talkx): E22 filtros + busca + grade`.
**Checklist**
- [ ] 4 selects + busca
- [ ] persistência de filtro
- [ ] grade/lista
- [ ] ordenação acessível
- [ ] commit

### E23 · Tabela de campanhas conforme mock 01
**Arquivos:** `TalkXOverview.tsx`
1. Colunas: `☐` · Campanha (thumb+nome+descrição) · Segmento/Público (pill + n contatos) · Canal · Status · Progresso · Resultados · Agendada em (data + "por <criador>") · Ações.
2. Thumb = `media_url` da campanha (imagem) ou tile soft por objetivo (`OBJECTIVES[objective].icon`).
3. Segmento: `segment_id` → nome; sem segmento → "Segmento personalizado" + `total_recipients`.
4. Status via `StatusPill` (`CAMPAIGN_STATUS`), `sending` com dot pulsante.
5. Progresso `pct(sent+failed, total)`; `draft` mostra "—".
6. Resultados: `sent_count enviados` + (E87) `delivered_count entregues (x%)`.
7. "Agendada em": `scheduled_at` ou `started_at`; "Hoje, 10:00" / "15 set. 2026, 09:00" via `date-fns` `ptBR`.
8. Ações `⋮`: Ver monitor, Editar (draft/scheduled), Duplicar, Iniciar, Pausar, Cancelar, Excluir — visibilidade por status.
9. Seleção em massa → barra flutuante "3 selecionadas: Pausar · Cancelar · Excluir".
10. Commit `feat(talkx): E23 tabela de campanhas`.
**Checklist**
- [ ] 9 colunas
- [ ] ações por status
- [ ] barra de seleção em massa
- [ ] datas em pt-BR
- [ ] commit

### E24 · Rail direito da Visão geral
**Arquivos:** `TalkXOverview.tsx`
1. `HeroCard` (E18) com 3 métricas reais.
2. `RailCard` "Ações rápidas" com 4 `RailAction`: Nova campanha (wizard), Usar template (aba templates), Criar segmento (aba segmentos, modo criar), Importar contatos (E94).
3. `RailCard` "Últimas campanhas" (5 mais recentes por `updated_at`) com `RecentList` + "Ver todas" (limpa filtros).
4. `TipCard` "Dica do dia".
5. Rail some em < 1280 e vira `Accordion` "Mais" abaixo da tabela.
6. Clique em item recente abre monitor/relatório conforme status.
7. Skeleton do rail.
8. Testes de navegação das 4 ações.
9. Print 1672×941 comparado ao mock 01 em `docs/talkx/screens/f2/`.
10. Commit `feat(talkx): E24 rail Visão geral`.
**Checklist**
- [ ] 4 ações rápidas navegam
- [ ] últimas 5 reais
- [ ] responsivo
- [ ] print salvo
- [ ] commit

### E25 · Ações de linha com confirmação e feedback (pausar, cancelar, excluir, duplicar)
**Arquivos:** `TalkXOverview.tsx`, `useTalkX.ts`
1. Cada ação destrutiva abre `TalkXConfirmDialog` preset (E19).
2. `pauseCampaign`/`cancelCampaign` chamam `talkx-send` com `action` (já suportado) e registram evento em `talkx_campaign_events` via `useTalkXEventLogger`.
3. `deleteCampaign` só para `draft|cancelled|completed`; senão item desabilitado com tooltip.
4. `duplicateCampaign` cria **rascunho no banco** (insert) em vez de só abrir wizard com id vazio (hoje `TalkXView.tsx:43` cria objeto sem id).
5. Optimistic update na lista (`setQueryData`) + rollback em erro.
6. Toasts `sonner`: sucesso/erro com nome da campanha.
7. Loading por linha (spinner no `⋮`).
8. Auditoria: `actor_id` sempre preenchido.
9. Testes de cada ação (mutation chamada com id certo).
10. Commit `feat(talkx): E25 ações de linha + eventos`.
**Checklist**
- [ ] 4 ações com modal
- [ ] duplicar persiste rascunho
- [ ] eventos gravados
- [ ] optimistic + rollback
- [ ] commit

### E26 · Busca global `⌘K` do módulo (mock 01 topo)
**Arquivos:** `src/components/ui/command-palette-data.tsx` (registro), `TalkXOverview.tsx`
1. Registrar provider no `command-palette` existente: grupo "Talk X" com campanhas, segmentos, templates.
2. Fonte: caches do react-query (`talkx-campaigns`, `talkx-segments`, `talkx-templates`) — sem query extra.
3. Selecionar campanha → abre monitor/relatório; segmento → aba com detalhe aberto; template → editor.
4. Atalho `⌘K`/`Ctrl+K` já global; input da `FilterBar` mostra hint.
5. Ícones por tipo.
6. Máx. 8 resultados por grupo.
7. Fuzzy via `cmdk` nativo.
8. Teste de integração do provider.
9. Documentar em `ARQUITETURA.md`.
10. Commit `feat(talkx): E26 ⌘K`.
**Checklist**
- [ ] 3 tipos pesquisáveis
- [ ] navegação correta
- [ ] sem query extra
- [ ] teste
- [ ] commit

### E27 · Realtime na lista de campanhas
**Arquivos:** `useTalkX.ts`, migration `20260910_talkx_realtime.sql`
1. Adicionar `talkx_campaigns`, `talkx_recipients`, `talkx_campaign_events` à publicação `supabase_realtime` (`alter publication supabase_realtime add table …`) — migration + catálogo.
2. `useTalkX` assina `postgres_changes` em `talkx_campaigns` (UPDATE) e faz `setQueryData` pontual.
3. Canal único por módulo (`talkx:campaigns`), removido no unmount.
4. Debounce 500 ms para rajadas de update durante envio.
5. Indicador "ao vivo" (dot verde) no header quando canal conectado.
6. Fallback: se realtime cair, `refetchInterval 15s`.
7. Teste com campanha de 5 recipients: progresso atualiza sem refresh.
8. Verificar RLS não bloqueia o canal (policies `select` existem).
9. Documentar.
10. Commit `feat(talkx): E27 realtime campanhas`.
**Checklist**
- [ ] publicação inclui 3 tabelas
- [ ] progresso ao vivo sem refresh
- [ ] fallback polling
- [ ] canal limpo no unmount
- [ ] commit

### E28 · Grade de campanhas (visualização alternativa)
**Arquivos:** `TalkXOverview.tsx` (`CampaignGridCard`)
1. Card 100% carvão `.talkx-card`: thumb 16:9 (ou gradiente soft), nome, descrição 2 linhas, `StatusPill`, `ProgressBar`, 3 números (enviados/entregues/falhas), rodapé com criador + data.
2. Grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`.
3. Mesmas ações `⋮`.
4. Hover eleva (`--elev-3`) + borda `primary/30`.
5. Seleção com checkbox no canto.
6. Skeleton de card.
7. Mesmo dataset/filtros da lista (estado compartilhado).
8. Animação stagger.
9. Teste de troca lista↔grade preserva seleção.
10. Commit `feat(talkx): E28 grade`.
**Checklist**
- [ ] card com 3 números reais
- [ ] ações iguais à lista
- [ ] seleção preservada
- [ ] skeleton
- [ ] commit

### E29 · Exportar lista e relatório rápido da Visão geral
**Arquivos:** `TalkXOverview.tsx`, `src/lib/talkxExport.ts` (novo)
1. `exportCampaignsCsv(rows, filters)` — colunas da tabela + `objective`, `speed_profile`, `scheduled_at`.
2. Botão "Exportar" no `FilterBar.right` (ícone `Download`), respeita filtros/seleção.
3. Nome do arquivo `talkx-campanhas-YYYYMMDD-HHmm.csv`, BOM UTF-8 para Excel.
4. Limite 10k linhas; acima disso, avisar e cortar.
5. Toast com contagem exportada.
6. Reutilizar em E60 (supressão) e E84 (relatório).
7. Sem lib nova (CSV manual com escape).
8. Teste unitário do escape de vírgula/aspas/quebra.
9. Documentar.
10. Commit `feat(talkx): E29 exportar CSV`.
**Checklist**
- [ ] CSV abre no Excel com acentos
- [ ] respeita filtros/seleção
- [ ] limite 10k
- [ ] teste de escape
- [ ] commit

### E30 · QA visual da Fase 2 + merge
1. Prints 1672×941 e 1280×800 da Visão geral (vazia, com 3 campanhas, com filtro, grade) em `docs/talkx/screens/f2/`.
2. Checklist de paridade com mock 01 (header, tabs, KPIs, filtros, tabela, paginação, rail) — marcar item a item em `docs/talkx/PARIDADE.md`.
3. Diferenças aceitas (ex.: sem "canal e-mail", sem "+32%") registradas com motivo.
4. `tsc`/`eslint`/`vitest`/`build` verdes.
5. Teste manual de teclado (Tab pela tabela, `⋮`, modais).
6. Sentry sem erro novo.
7. PR `feat/talkx-f2-overview → main`, squash.
8. Deploy Vercel READY; smoke em produção.
9. Atualizar memória do projeto.
10. Criar `feat/talkx-f3-segments`.
**Checklist**
- [ ] `PARIDADE.md` seção "01" completa
- [ ] 4 prints
- [ ] PR mergeado
- [ ] smoke prod ok
- [ ] branch F3

---

# FASE 3 — SEGMENTOS (E31–E40) · telas 02 e 03

### E31 · KPIs e biblioteca de segmentos (mock 02)
**Arquivos:** `TalkXSegments.tsx`, `useTalkXSegments.ts`
1. KPIs: Total de segmentos; Ativos este mês (`last_used_at >= now()-30d`); CRM 360 conectados (`origin='crm360'`); Conversão média — **sem backend** até E89 (não renderiza).
2. Filtros: origem (`zapp|crm360|custom`), tags (E36), status, proprietário (`created_by`).
3. Tabela: Segmento (tile+nome+descrição) · Origem (pill `CRM 360°`/`ZAPP`/`Segmentado`) · Principais critérios (até 3 chips de regra legíveis) · Público estimado · Último uso (data + criador) · Desempenho (E89; até lá coluna oculta) · Ações.
4. Chips de regra: `RULE_FIELDS[field].label + op label + value` (ex.: "Última compra ≤ 180 dias").
5. Linha clicável abre painel de detalhes (E32).
6. Favoritos (`is_favorite`) com estrela, ordenados primeiro.
7. Ações `⋮`: Usar em campanha, Editar, Duplicar, Favoritar, Ativar/Inativar, Excluir.
8. Paginação 10/25/50.
9. Estado vazio "Crie seu primeiro segmento" com CTA.
10. Commit `feat(talkx): E31 biblioteca de segmentos`.
**Checklist**
- [ ] 3 KPIs reais (4º oculto até E89)
- [ ] chips de critério legíveis
- [ ] favoritos
- [ ] ações completas
- [ ] commit

### E32 · Painel "Detalhes do segmento" no rail (mock 02 direita)
**Arquivos:** `TalkXSegments.tsx` (`SegmentDetailsRail`)
1. Header: tile amarelo/azul por origem, nome, `StatusPill Ativo`, descrição.
2. "Principais critérios" com chips (todas as regras) + botão Editar.
3. "Origem e sincronização": `ZAPP` = "Sincronizado em tempo real"; `crm360` = último `synced_at` (E95).
4. "Composição do público": `estimated_count` + barras por `contacts.status`/`company IS NOT NULL` (empresas) — só campos existentes; o "Homens/Mulheres" do mock **não existe** → não renderiza.
5. "Principais tags": top 5 tags do público (`contacts.tags` agregadas via RPC `talkx_segment_tags(segment_id)` E86).
6. Botões: `Usar em campanha` (primary, glow) e `Editar segmento` (ghost).
7. `InsightCard` só após E92.
8. Fecha com `×`; `Esc`; foco retorna à linha.
9. Skeleton do painel.
10. Commit `feat(talkx): E32 detalhes do segmento`.
**Checklist**
- [ ] critérios completos
- [ ] composição só com campos reais
- [ ] 2 CTAs
- [ ] a11y foco
- [ ] commit

### E33 · Construtor de regras: grupos AND/OR com colchete visual (mock 03)
**Arquivos:** `TalkXSegments.tsx` → extrair `TalkXSegmentBuilder.tsx`
1. Layout 3 colunas: lista "Meus Segmentos" (esq., 280px) · construtor (centro) · "Resumo do Segmento" (dir., 320px).
2. Header do construtor: nome editável inline (lápis), "Rascunho salvo há X min" (autosave E37), `Salvar`, `Publicar Segmento` (glow), `⋮`.
3. Sub-tabs: Construtor · Prévia e Contatos · Sobreposição (E38) · Insights (E92).
4. Card "Regras do Segmento" com desfazer/refazer (pilha em `useReducer`) e "Limpar tudo".
5. Grupo: badge `E`/`OU` colorido, "Grupo 1", texto "Todas as condições devem ser atendidas (AND)"; linha vertical à esquerda ligando as condições (colchete).
6. Condição: 3 selects (campo com ícone de categoria, operador, valor) — valor muda de widget por `kind` (text/number/date/boolean/enum/tags-multi).
7. `+ Adicionar condição` dentro do grupo; `+ Adicionar grupo (AND)` / `Adicionar grupo (OR)` abaixo; divisor "OU" entre grupos.
8. Remover condição (`×`/lixeira) e grupo (`⋮`).
9. Validação: condição incompleta fica com borda `warning` e bloqueia Publicar.
10. Commit `feat(talkx): E33 builder visual`.
**Checklist**
- [ ] 3 colunas
- [ ] colchete/linha de grupo
- [ ] undo/redo
- [ ] validação bloqueia publicar
- [ ] commit

### E34 · Catálogo de "Filtros Disponíveis" com categorias e drag-to-add (mock 03 inferior)
**Arquivos:** `TalkXSegmentBuilder.tsx`, `useTalkXSegments.ts` (`RULE_FIELDS`)
1. Categorias com contagem: Básicos · Comportamento · Comercial · CRM 360 · LGPD (só campos que existem em `contacts`/`talkx_*`; CRM 360 vazio até E95 → aba desabilitada com tooltip).
2. Cards de filtro: ícone, nome, descrição curta ("Cond. de origem do contato").
3. Busca de filtro.
4. Clique adiciona condição ao grupo ativo; drag (`@hello-pangea/dnd`) para um grupo específico.
5. Novos campos reais: `contacts.state`, `contacts.city`, `contacts.assigned_to` (vendedor), `contacts.pipeline_stage`, `contacts.lead_score` — validar existência no `schema-catalog.json` antes de adicionar cada um.
6. Operadores por `kind` já em `RULE_OPS`; adicionar `in`/`not_in` para enum multi.
7. `buildFilter` cobre os novos operadores (+ testes).
8. Scroll horizontal dos cards com setas.
9. Teclado: Enter adiciona.
10. Commit `feat(talkx): E34 catálogo de filtros`.
**Checklist**
- [ ] só campos existentes
- [ ] drag & click
- [ ] `in`/`not_in` testados
- [ ] CRM 360 desabilitado com motivo
- [ ] commit

### E35 · Resumo do Segmento em tempo real (rail do mock 03)
**Arquivos:** `TalkXSegmentBuilder.tsx`, `useTalkXSegments.ts`
1. "Audiência Estimada" = `countAudience(rules)` debounced 400 ms; badge "Estimativa em tempo real"; delta vs `estimated_count` salvo.
2. "% da base total" = estimativa / `count(contacts)`.
3. "Média de X" **não existe** → não renderiza.
4. "Risco de Entrega": heurística real = % do público em `talkx_blacklist` + % sem telefone + % com `talkx_sent_days_ago < 7` → Baixo/Médio/Alto, com as 3 linhas de checagem (base qualificada / baixo risco de bloqueio / engajamento) derivadas desses números.
5. "Sobreposição" (E38) e "Última atualização" (`updated_at`).
6. "Amostra de Contatos (5)": `resolveAudience` com `limit 5` **respeitando as regras** (hoje o sample ignora regras — corrigir).
7. Botão "Ver todos" abre sub-tab Prévia e Contatos.
8. Cancelar query anterior ao digitar (react-query `keepPreviousData` + `signal`).
9. Teste da heurística de risco.
10. Commit `feat(talkx): E35 resumo do segmento`.
**Checklist**
- [ ] estimativa com regras aplicadas
- [ ] sample respeita regras
- [ ] risco calculado, não fixo
- [ ] debounce/cancel
- [ ] commit

### E36 · Tags, favoritos, status e descrição do segmento
**Arquivos:** migration `20260911_talkx_segments_tags.sql`, `useTalkXSegments.ts`, `TalkXSegments.tsx`
1. `alter table talkx_segments add column tags text[] not null default '{}'` + índice GIN.
2. Editor de tags (chips + input) no header do builder e no painel de detalhes.
3. Filtro por tag na biblioteca.
4. Favoritar (estrela) com optimistic update.
5. Status `active|inactive` com toggle + confirmação ao inativar segmento em uso por campanha `scheduled`.
6. Descrição com contador 160.
7. RLS: manter policies existentes (colunas novas herdam).
8. Catálogo/manifest atualizados; `db-guard` verde.
9. Testes de mutation.
10. Commit `feat(talkx): E36 tags/favoritos/status`.
**Checklist**
- [ ] migration + catálogo
- [ ] tags filtram
- [ ] inativar protege campanha agendada
- [ ] db-guard verde
- [ ] commit

### E37 · Autosave de rascunho + versões do segmento
**Arquivos:** migration `20260911_talkx_segment_versions.sql`, `useTalkXSegments.ts`
1. Tabela `talkx_segment_versions(id, segment_id, rules jsonb, estimated_count, created_by, created_at)` + RLS espelhando `talkx_segments`.
2. Autosave a cada 30 s de mudança (`updated_at`), status "Rascunho salvo há X" no header.
3. "Publicar" grava versão + `status='active'` + recalcula `estimated_count`.
4. Sub-tab "Histórico" listando versões com diff textual das regras e "Restaurar".
5. Máx. 20 versões por segmento (trigger que apaga as mais antigas).
6. Conflito de edição simultânea: `updated_at` como token otimista; aviso se divergir.
7. Testes do reducer de versões.
8. Catálogo atualizado.
9. Documentar.
10. Commit `feat(talkx): E37 autosave + versões`.
**Checklist**
- [ ] tabela + RLS + trigger
- [ ] autosave visível
- [ ] restaurar versão
- [ ] conflito detectado
- [ ] commit

### E38 · Sobreposição entre segmentos
**Arquivos:** migration `20260912_talkx_segment_overlap_rpc.sql`, `TalkXSegmentBuilder.tsx`
1. RPC `talkx_segment_overlap(a_rules jsonb, b_rules jsonb) returns table(a int, b int, both int)` — SQL traduz o JSON de regras (mesma semântica de `buildFilter`) usando `jsonb` → `where` dinâmico via `format()` com whitelist de campos/operadores (nunca concatenar valor sem `quote_literal`).
2. Sub-tab "Sobreposição": select de até 3 outros segmentos; diagrama de Venn em SVG (2–3 círculos, opacidade `primary/30`, `success/30`, `violet/30`).
3. "12% com outros segmentos" no rail = média das interseções.
4. Cache 5 min por par.
5. Testes SQL (`select talkx_segment_overlap(...)`) com contatos de fixture.
6. Limite 5000 contatos por lado (mesmo do `resolveAudience`).
7. RLS: `security invoker`.
8. Catálogo.
9. Documentar.
10. Commit `feat(talkx): E38 sobreposição`.
**Checklist**
- [ ] RPC com whitelist (sem SQL injection)
- [ ] Venn 2–3
- [ ] % no rail real
- [ ] teste SQL
- [ ] commit

### E39 · Prévia e Contatos do segmento (sub-tab)
**Arquivos:** `TalkXSegmentBuilder.tsx`
1. `TalkXTable` com contatos resolvidos (avatar, nome, telefone, empresa, tags, última interação, "na supressão?").
2. Paginação server-side (`range`) sobre a mesma `buildFilter`.
3. Coluna "Elegível" (fora da supressão e com telefone).
4. Ordenação por nome/última interação.
5. Exportar CSV (E29).
6. Contagem no cabeçalho bate com "Audiência Estimada".
7. Clique no contato abre `?view=contacts&id=` em nova aba.
8. Loading/vazio/erro.
9. Teste de paginação.
10. Commit `feat(talkx): E39 prévia de contatos`.
**Checklist**
- [ ] paginação server-side
- [ ] coluna elegível
- [ ] export
- [ ] contagem consistente
- [ ] commit

### E40 · QA visual Fase 3 + merge
1. Prints das telas 02 e 03 (biblioteca vazia/cheia, detalhes, builder com 2 grupos).
2. `PARIDADE.md` seções "02" e "03".
3. Teste manual: criar segmento com 2 grupos, publicar, usar em campanha (wizard pré-preenchido).
4. Performance: `countAudience` < 800 ms com 20k contatos (EXPLAIN em `db_explain`; criar índices GIN em `contacts.tags` e btree em `contacts.updated_at` se faltarem — migration).
5. `tsc`/`eslint`/`vitest`/`build`.
6. Sentry limpo.
7. PR `feat/talkx-f3-segments → main`, squash.
8. Deploy + smoke.
9. Memória.
10. Branch `feat/talkx-f4-templates`.
**Checklist**
- [ ] paridade 02/03
- [ ] índices verificados
- [ ] PR mergeado
- [ ] smoke prod
- [ ] branch F4

---

# FASE 4 — TEMPLATES (E41–E50) · telas 04 e 05

### E41 · KPIs e galeria de templates (mock 04)
**Arquivos:** `TalkXTemplates.tsx`, `useTalkXTemplates.ts`
1. KPIs: Total; Aprovados (`status='approved'`); Mais usado (`max(use_count)` → nome); Taxa média de resposta — E89 (oculto).
2. Filtros: categoria, canal (WhatsApp fixo), status, equipe (E36-like `team_id` se existir em `profiles`; senão oculto).
3. Card de template: bolha WhatsApp com preview (`WhatsAppBubble`, mídia se houver, hora fake **não** — usar `updated_at HH:mm`), nome, chips de categoria/tags, "N variáveis: {{nome}}, …" (via `extractVariables`), "Atualizado em", `StatusPill`, `N usos`, botão `Usar template` (primary sm) + `⋮`.
4. Grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`.
5. Toggle grade/lista (lista = `TalkXTable`).
6. `⋮`: Editar, Duplicar, Testar (E47), Arquivar, Excluir.
7. `use_count` incrementa quando campanha é lançada com `template_id` (trigger no DB — E86).
8. Ordenação: mais usados / recentes / nome.
9. Paginação 12/24.
10. Commit `feat(talkx): E41 galeria`.
**Checklist**
- [ ] 3 KPIs reais
- [ ] card com preview real
- [ ] variáveis extraídas
- [ ] ações
- [ ] commit

### E42 · Rail: Biblioteca inteligente, Mais convertidos, Sugestões, Ações rápidas (mock 04 direita)
**Arquivos:** `TalkXTemplates.tsx`
1. `HeroCard` "Biblioteca inteligente" — ilustração de 3 cards flutuantes; texto estático.
2. "Mais convertidos" — top 3 por **taxa de resposta** (E89); até lá top 3 por `use_count` com rótulo "Mais usados".
3. "Sugestões" — E92 (oculto até lá).
4. "Ações rápidas": Criar template (do zero), Duplicar template (pede origem), Importar templates (CSV/JSON — E48).
5. Responsivo.
6. Skeleton.
7. Teste de navegação.
8. Print.
9. `PARIDADE.md` 04.
10. Commit `feat(talkx): E42 rail templates`.
**Checklist**
- [ ] hero
- [ ] top 3 real (rótulo honesto)
- [ ] 3 ações
- [ ] responsivo
- [ ] commit

### E43 · Editor de template: layout 3 colunas (mock 05)
**Arquivos:** `TalkXTemplates.tsx` → `TalkXTemplateEditor.tsx`
1. Coluna esquerda: "Biblioteca de Templates" com busca, chips por categoria com contagem, lista de cards compactos (tile por categoria, nome, descrição, tags, `StatusPill`).
2. Centro: header "Editar Template" + `Duplicar`, `Testar`, `Salvar Template` (glow); sub-tabs Conteúdo · Variações A/B (E49) · Histórico de Versões (E46).
3. Campos: Nome, Categoria (select), Status (select com dot).
4. Mensagem: textarea com toolbar (B, I, lista, emoji, link, "Inserir variável") — formatação WhatsApp (`*bold*`, `_italic_`, `- item`), contador `186/1024`.
5. "Variáveis disponíveis" chips clicáveis (`VARIABLE_KEYS` + custom E45).
6. Mídia (opcional): dropzone + preview com nome/dimensões/tamanho; upload para bucket `talkx-media` (E44).
7. Direita: preview em telefone (E44) + Tags + Dica.
8. Atalhos: `⌘S` salva, `⌘Enter` salva e fecha.
9. Dirty-check ao sair.
10. Commit `feat(talkx): E43 editor 3 colunas`.
**Checklist**
- [ ] 3 colunas
- [ ] toolbar gera markup WhatsApp
- [ ] contador 1024
- [ ] dirty-check
- [ ] commit

### E44 · Pré-visualização WhatsApp em moldura de telefone + upload de mídia
**Arquivos:** `talkxShared.tsx` (`PhonePreview`), migration `20260913_talkx_media_bucket.sql`
1. `PhonePreview`: moldura 320×640, status bar (hora real), header (avatar Z, nome da conexão, "Online"), fundo padrão do WhatsApp em carvão (`bg-[hsl(var(--background))]` com pattern SVG 6% opacidade), bolha da mensagem com `personalizePreview` usando um contato real de exemplo (primeiro do público) ou `{{nome}}` literal.
2. Mídia: imagem (`object-cover` no topo da bolha), vídeo (poster + play), documento (chip com ícone), áudio (barra).
3. "Ver em tela cheia" → `Dialog` com a mesma moldura em 2×.
4. Bucket `talkx-media` (privado, 16 MB, `image/*, video/mp4, application/pdf, audio/*`) + policies por `created_by`.
5. Upload via `supabase.storage` no hook `useTalkXTemplates.uploadMedia` (não no componente).
6. URL assinada 7 dias para preview; `media_url` guarda o `path`, não a URL.
7. Barra de progresso no upload.
8. Validação de tipo/tamanho antes do upload.
9. Teste de `personalizePreview` com mídia.
10. Commit `feat(talkx): E44 PhonePreview + bucket`.
**Checklist**
- [ ] moldura fiel ao mock 05
- [ ] 4 tipos de mídia
- [ ] bucket + policies
- [ ] `media_url` = path
- [ ] commit

### E45 · Variáveis: inserção, validação e variáveis customizadas
**Arquivos:** `TalkXTemplateEditor.tsx`, `talkxConstants.ts`, `useCampaignEditor.ts`
1. Inserir variável na posição do cursor (`selectionStart`).
2. Highlight de `{{var}}` no textarea via overlay (`contenteditable` **não**; usar backdrop com `<mark>` alinhado).
3. Variáveis padrão: `nome`, `nome_completo`, `apelido`, `empresa`, `saudacao` (existentes) + `telefone`, `data_atual`, `vendedor` (de `contacts.assigned_to → profiles.name`), `link` (E90).
4. Validação: variável desconhecida → borda `warning` + tooltip.
5. Fallback por variável (`{{nome|cliente}}`) — `personalizePreview` suporta `|`.
6. Preview alterna entre 3 contatos reais de amostra.
7. Contagem "3 variáveis: {{nome}}, {{empresa}}, …" no card.
8. Testes de `personalizePreview` com fallback e novas variáveis.
9. `talkx-send` aplica as mesmas variáveis (mesma função em `_shared/talkx-personalize.ts` — mover lógica para `_shared` e importar nos dois lados? Edge e front não compartilham import; **duplicar com teste de paridade** que compara saídas).
10. Commit `feat(talkx): E45 variáveis`.
**Checklist**
- [ ] inserção no cursor
- [ ] highlight
- [ ] fallback `|`
- [ ] paridade front/edge testada
- [ ] commit

### E46 · Histórico de versões do template
**Arquivos:** migration `20260913_talkx_template_versions.sql`, `useTalkXTemplates.ts`, `TalkXTemplateEditor.tsx`
1. Tabela `talkx_template_versions(id, template_id, content, media_url, media_type, variables text[], created_by, created_at, note)` + RLS + limite 30 por trigger.
2. Salvar cria versão quando `content` mudou.
3. Sub-tab "Histórico de Versões": lista com autor, data, diff (linhas +/−) e "Restaurar".
4. Restaurar cria nova versão (não sobrescreve histórico).
5. Badge "v7" no header.
6. Catálogo/manifest.
7. Testes.
8. Documentar.
9. Print.
10. Commit `feat(talkx): E46 versões de template`.
**Checklist**
- [ ] tabela + RLS + trigger
- [ ] diff visível
- [ ] restaurar
- [ ] badge de versão
- [ ] commit

### E47 · "Testar" template: envio de teste para o próprio número
**Arquivos:** `supabase/functions/talkx-send/index.ts` (ação `test`), `useTalkXTemplates.ts`
1. Ação `test` em `talkx-send`: body `{ templateId | content, mediaPath, connectionId, toPhone }`; envia 1 mensagem sem criar campanha; registra em `talkx_campaign_events` com `campaign_id null`? → não (FK). Criar tabela `talkx_test_sends(id, template_id, to_phone, status, error, created_by, created_at)`.
2. Modal "Testar template": select da conexão, telefone (pré-preenchido com `profiles.phone` se existir), preview, botão Enviar.
3. Rate limit: 5 testes/10 min por usuário (contar em `talkx_test_sends`).
4. Resultado na modal (enviado/erro) + toast.
5. Mídia: URL assinada gerada na edge com service key.
6. Log estruturado na function.
7. Deploy via `deploy-functions.yml`.
8. Teste manual com número próprio.
9. Catálogo.
10. Commit `feat(talkx): E47 envio de teste`.
**Checklist**
- [ ] ação `test` na edge
- [ ] rate limit
- [ ] tabela de testes
- [ ] mensagem recebida no celular
- [ ] commit

### E48 · Importar/exportar templates (CSV/JSON) e duplicar
**Arquivos:** `useTalkXTemplates.ts`, `TalkXTemplates.tsx`
1. Exportar seleção como JSON (`{name, category, content, tags, media_type}`) e CSV.
2. Importar: dropzone, parse (JSON nativo / CSV manual com o parser de E94), preview em tabela com validação por linha (nome duplicado, conteúdo > 1024, variável desconhecida).
3. Conflitos: "pular / sobrescrever / criar cópia".
4. Insert em lote (`upsert` por `name`).
5. Duplicar = copia com sufixo " (cópia)", status `draft`.
6. Toast com contagem.
7. Testes do parser.
8. Limite 500 templates por importação.
9. Documentar formato em `docs/talkx/IMPORT_TEMPLATES.md`.
10. Commit `feat(talkx): E48 import/export/duplicar templates`.
**Checklist**
- [ ] JSON e CSV
- [ ] validação por linha
- [ ] conflitos
- [ ] doc de formato
- [ ] commit

### E49 · Variações A/B do template
**Arquivos:** migration `20260914_talkx_template_variants.sql`, `useTalkXTemplates.ts`, `TalkXTemplateEditor.tsx`, `talkx-send`
1. Tabela `talkx_template_variants(id, template_id, label 'A'|'B'|'C', content, media_url, media_type, weight int, created_at)`; `talkx_recipients.variant_id uuid null`.
2. Sub-tab "Variações A/B": até 3 variantes com peso (%), editor por variante, preview lado a lado.
3. `talkx-send`: se campanha usa template com variantes, sorteia por peso e grava `variant_id` no recipient.
4. Relatório (E84) mostra respostas por variante quando E88 existir.
5. Validação: soma dos pesos = 100.
6. Catálogo/manifest; RLS.
7. Testes do sorteio ponderado (edge, unit em Deno test).
8. Deploy da function.
9. Documentar.
10. Commit `feat(talkx): E49 A/B`.
**Checklist**
- [ ] tabela + coluna no recipient
- [ ] sorteio ponderado testado
- [ ] UI 3 variantes
- [ ] deploy
- [ ] commit

### E50 · QA visual Fase 4 + merge
1. Prints 04/05 (galeria vazia/cheia, editor com mídia, tela cheia do preview).
2. `PARIDADE.md` 04/05.
3. Fluxo manual: criar template com variável e mídia → testar → usar em campanha.
4. Performance: galeria com 200 templates < 100 ms de render (virtualizar se necessário).
5. `tsc`/`eslint`/`vitest`/`build`.
6. Sentry.
7. PR `feat/talkx-f4-templates → main`.
8. Deploy + smoke.
9. Memória.
10. Branch `feat/talkx-f5-suppression`.
**Checklist**
- [ ] paridade 04/05
- [ ] fluxo manual ok
- [ ] PR mergeado
- [ ] smoke
- [ ] branch F5

---

# FASE 5 — LISTA DE SUPRESSÃO (E51–E60) · tela 06

### E51 · Schema da supressão: telefone avulso, motivo, expiração, campanha de origem
**Arquivos:** migration `20260915_talkx_blacklist_v2.sql`, `useTalkXSuppression.ts` (novo, extraído de `TalkXSuppression.tsx`)
1. `talkx_blacklist`: `add column phone text`, `reason_code text check (reason_code in ('opt_out','invalid_number','manual','lgpd','no_commercial_permission','bounce'))`, `expires_at timestamptz`, `source_message_id uuid references messages(id)`; `contact_id` vira nullable (telefone sem contato).
2. Índice único parcial `(coalesce(contact_id::text, phone))`.
3. Backfill: `reason_code` a partir de `reason` textual existente (mapa simples).
4. View `talkx_blacklist_active` = `expires_at is null or expires_at > now()`.
5. `talkx-send` e `resolveAudience` passam a usar a view.
6. RLS: policies espelhando as atuais + `phone` visível só para `admin|supervisor`.
7. Catálogo/manifest; `db-guard`.
8. Hook `useTalkXSuppression` com list/add/remove/import/export.
9. Testes do hook.
10. Commit `feat(talkx): E51 blacklist v2`.
**Checklist**
- [ ] 4 colunas novas + view
- [ ] backfill de motivo
- [ ] send/resolve usam a view
- [ ] RLS revisada
- [ ] commit

### E52 · KPIs e tabela da supressão (mock 06)
**Arquivos:** `TalkXSuppression.tsx`
1. KPIs: Contatos suprimidos (ativos); Opt-outs 30 dias (`reason_code='opt_out' and created_at>=now()-30d`); Bloqueios manuais (`manual`); Campanhas protegidas (E63 flag `respect_suppression=true`, contagem distinta).
2. Filtros com label (Origem, Motivo, Campanha, Data, Status) + busca por contato/telefone/e-mail.
3. Tabela: Contato (avatar iniciais colorido + nome + e-mail) · Telefone `+55 …` formatado · Origem (ícone: Opt-out ✕ vermelho, Sistema monitor, Manual pessoa, LGPD escudo, Lista) · Motivo (pill colorida por `reason_code`) · Campanha · Data · Status (`Suprimido` vermelho / `Expirado` cinza) · Ações.
4. Ações `⋮`: Remover da supressão (modal E19), Editar motivo, Ver contato, Ver campanha.
5. Seleção em massa: remover/exportar.
6. Paginação 10/25/50.
7. Estado vazio "Nenhum contato suprimido".
8. Ordenação por data.
9. Testes.
10. Commit `feat(talkx): E52 tabela supressão`.
**Checklist**
- [ ] 4 KPIs reais
- [ ] 5 filtros com label
- [ ] origem com ícone + motivo com pill
- [ ] ações
- [ ] commit

### E53 · Rail "Centro de proteção" + Ações da lista + Atividade recente
**Arquivos:** `TalkXSuppression.tsx`
1. `HeroCard` "Centro de proteção" com `ProtectionGauge` (E18) = campanhas protegidas / total; 4 mini-números (Suprimidos, Opt-outs, Manuais, Protegidas).
2. "Ações da lista": Importar contatos (E54), Exportar lista (CSV), Adicionar contato (E55), Gerenciar motivos (E56).
3. `AlertCard` amarelo com texto do mock + "Saiba mais" (abre Ajuda E96 no tópico LGPD).
4. "Atividade recente": últimos 5 eventos `talkx_campaign_events` com `event_type in ('suppression_add','suppression_remove')` (novos tipos, E51 amplia o check) — ícone +/− verde/vermelho, e-mail, "Hoje, 14:32".
5. "Ver todas" → sub-tab Atividade com paginação.
6. Responsivo.
7. Skeleton.
8. Print.
9. `PARIDADE.md` 06.
10. Commit `feat(talkx): E53 rail supressão`.
**Checklist**
- [ ] gauge real
- [ ] 4 ações
- [ ] atividade de eventos reais
- [ ] alerta LGPD linka ajuda
- [ ] commit

### E54 · Importar contatos para a supressão (CSV/XLSX/TXT)
**Arquivos:** `useTalkXSuppression.ts`, `src/lib/talkxCsv.ts` (novo, compartilhado com E94)
1. Parser CSV robusto (delimitador `,`/`;`, aspas, BOM) sem lib; XLSX via `xlsx` **só se já estiver no `package.json`** (não está) → aceitar `.csv`/`.txt`; XLSX fica documentado como "converta para CSV".
2. Mapeamento de colunas (telefone obrigatório; nome/e-mail/motivo opcionais).
3. Normalização E.164 (`+55DDDNNNNNNNNN`) e validação.
4. Match com `contacts.phone` → `contact_id`; sem match → `phone` avulso.
5. Preview com contagem: válidos / inválidos / já suprimidos.
6. Insert em lotes de 500 com `on conflict do nothing`.
7. Evento `suppression_add` por lote (1 evento com contagem).
8. Limite 50k linhas.
9. Testes do parser e do normalizador.
10. Commit `feat(talkx): E54 importar supressão`.
**Checklist**
- [ ] parser testado
- [ ] E.164
- [ ] match/avulso
- [ ] lotes + evento
- [ ] commit

### E55 · Adicionar contato manualmente + editar motivo + expiração
**Arquivos:** `TalkXSuppression.tsx`
1. Modal "Adicionar contato": busca de contato (`cmdk`) ou telefone avulso; motivo (select `reason_code`); observação; expiração (nunca / 30d / 90d / data).
2. Modal "Editar motivo".
3. Validação E.164.
4. Evento `suppression_add`/`suppression_update`.
5. Toasts.
6. Foco/teclado.
7. Testes.
8. Documentar motivos em `docs/talkx/SUPRESSAO.md`.
9. Print.
10. Commit `feat(talkx): E55 adicionar/editar supressão`.
**Checklist**
- [ ] 2 modais
- [ ] expiração
- [ ] eventos
- [ ] doc
- [ ] commit

### E56 · Gerenciar motivos (categorias personalizadas)
**Arquivos:** migration `20260915_talkx_suppression_reasons.sql`, `TalkXSuppression.tsx`
1. Tabela `talkx_suppression_reasons(code pk, label, tone, is_system bool, active bool)` com os 6 códigos de sistema semeados.
2. `talkx_blacklist.reason_code` passa a FK para `talkx_suppression_reasons(code)`.
3. Modal "Gerenciar motivos": lista, criar (code slug + label + tom), ativar/desativar (sistema não apaga).
4. Pills da tabela usam `tone` da tabela.
5. RLS: leitura todos; escrita `admin`.
6. Catálogo/manifest.
7. Testes.
8. Doc.
9. Print.
10. Commit `feat(talkx): E56 motivos personalizados`.
**Checklist**
- [ ] tabela semeada
- [ ] FK
- [ ] CRUD admin
- [ ] pills dinâmicas
- [ ] commit

### E57 · Opt-out automático por palavra-chave (SAIR/PARAR/STOP) via webhook
**Arquivos:** `supabase/functions/_shared/evolution-webhook-msg-handlers.ts`, `_shared/talkx-optout.ts` (novo), migration `20260916_talkx_optout_keywords.sql`
1. Tabela `talkx_optout_keywords(keyword text pk, active bool)` semeada com `sair, parar, stop, cancelar, remover, descadastrar`.
2. No handler de mensagem recebida (`sender='contact'`), se o texto normalizado (sem acento, lower, trim) for **exatamente** uma keyword → insert em `talkx_blacklist(contact_id, reason_code='opt_out', origin='opt_out', source_message_id)`.
3. Só quando o contato recebeu campanha nos últimos 30 dias (`talkx_recipients.sent_at`) — evita falso positivo em conversa normal.
4. Resposta automática opcional "Você foi removido das nossas listas." (flag em `talkx_settings`, E93).
5. Evento `suppression_add` com `actor_id null` e `message='opt-out automático'`.
6. Idempotente (`on conflict do nothing`).
7. Testes Deno do normalizador e da regra.
8. Deploy.
9. Teste real: enviar "SAIR" de número de teste → aparece na lista.
10. Commit `feat(talkx): E57 opt-out automático`.
**Checklist**
- [ ] keywords em tabela
- [ ] regra dos 30 dias
- [ ] idempotente
- [ ] teste real
- [ ] commit

### E58 · Remover da supressão com trilha e reversão
**Arquivos:** `useTalkXSuppression.ts`, `TalkXSuppression.tsx`
1. Modal preset `removerSupressao` (E19).
2. Soft delete: `expires_at = now()` + `removed_by`, `removed_at` (migration mínima) em vez de `delete` — mantém histórico LGPD.
3. Evento `suppression_remove`.
4. "Desfazer" no toast por 10 s (volta `expires_at` a null).
5. Status "Expirado" aparece na tabela com filtro Status.
6. Bloqueio: opt-out com < 24h não pode ser removido (aviso).
7. Testes.
8. Doc.
9. Print.
10. Commit `feat(talkx): E58 remover com trilha`.
**Checklist**
- [ ] soft delete
- [ ] desfazer
- [ ] bloqueio 24h
- [ ] evento
- [ ] commit

### E59 · Supressão aplicada em todo o funil (segmento, wizard, envio)
**Arquivos:** `useTalkXSegments.ts`, `useCampaignEditor.ts`, `talkx-send/index.ts`
1. `resolveAudience`/`countAudience` recebem `excludeSuppressed=true` por padrão (usa `talkx_blacklist_active`).
2. Wizard mostra "Bloqueados por supressão: N (x%)" no rail (mock 08) com número real.
3. `talkx-send` re-checa a view **por recipient** no momento do envio (não só ao criar).
4. `respect_suppression` (E63) `false` só para `admin` e exige confirmação.
5. Evento `campaign_skipped_suppressed` agregado ao final.
6. Testes: contato suprimido nunca recebe.
7. Deploy.
8. Doc em `SUPRESSAO.md`.
9. Print.
10. Commit `feat(talkx): E59 supressão end-to-end`.
**Checklist**
- [ ] segmento exclui
- [ ] wizard mostra bloqueados reais
- [ ] send re-checa
- [ ] teste negativo
- [ ] commit

### E60 · QA Fase 5 + merge
1. Prints 06 (vazia, cheia, modal remover, importação).
2. `PARIDADE.md` 06.
3. Fluxo manual: importar 3 telefones → aparecem → enviar "SAIR" → opt-out → remover com desfazer.
4. Exportar CSV (E29) da supressão.
5. `tsc`/`eslint`/`vitest`/`build`; testes Deno das functions.
6. Sentry.
7. PR `feat/talkx-f5-suppression → main`.
8. Deploy + smoke.
9. Memória.
10. Branch `feat/talkx-f6-wizard`.
**Checklist**
- [ ] paridade 06
- [ ] fluxo manual completo
- [ ] PR mergeado
- [ ] smoke
- [ ] branch F6

---

# FASE 6 — NOVA CAMPANHA / WIZARD (E61–E70) · telas 08, 09, 10

### E61 · Stepper de 4 passos e layout `[1fr_400px]` (mock 08)
**Arquivos:** `TalkXCampaignWizard.tsx`
1. Header: tile `Zap`, "Nova campanha" / "Configure público, mensagem e entrega com segurança."; à direita stepper horizontal 1 Público · 2 Mensagem · 3 Entrega · 4 Revisão (círculo numerado; concluído = check verde; linha entre passos preenche).
2. Grid `xl:grid-cols-[1fr_400px]`; rail direito sticky com "Resumo da campanha" + "Prévia da mensagem" (E66).
3. Rodapé fixo: `Salvar rascunho` (ghost) + `Continuar →` (primary, glow); no passo 4 vira `Lançar campanha`.
4. Navegação por clique no stepper só para passos já válidos.
5. `useCampaignEditor.step` já existe — manter API.
6. Breadcrumb `Talk X › Campanhas › Nova Campanha › <passo>`.
7. Deep link `?view=talkx&wizard=<id|new>&step=2`.
8. `beforeunload` se dirty.
9. Responsivo: rail vira `Sheet` "Resumo" em < 1280.
10. Commit `feat(talkx): E61 stepper + layout`.
**Checklist**
- [ ] stepper com estados
- [ ] rail sticky
- [ ] rodapé fixo
- [ ] deep link
- [ ] commit

### E62 · Passo 1 — Informações + Origem do público (3 cards)
**Arquivos:** `TalkXCampaignWizard.tsx`, `useCampaignEditor.ts`
1. Card "Informações da campanha": Nome, Objetivo (select com ícone `OBJECTIVES`), Responsável (`profiles`, default usuário).
2. Card "Origem do público" com 3 opções em cards selecionáveis (radio no canto): **Contatos ZAPP** (filtros avançados), **CRM 360°** (Bitrix24 — E95; até lá card desabilitado com tooltip "Conecte o CRM 360°"), **Segmento salvo** (select de `talkx_segments` ativos).
3. `audience_source` já existe na tabela (`zapp|crm360|segment`).
4. Validação: nome ≥ 3, objetivo, origem.
5. Autosave de rascunho (E68) a partir daqui.
6. Descrição opcional (colapsável).
7. Ao escolher segmento: `selectedSegment` + estimativa no rail.
8. Testes de validação.
9. Print.
10. Commit `feat(talkx): E62 passo 1`.
**Checklist**
- [ ] 3 cards de origem
- [ ] CRM 360 desabilitado com motivo
- [ ] validação
- [ ] rail atualiza
- [ ] commit

### E63 · Passo 1 — Filtros de audiência (Contatos ZAPP) + flag de supressão
**Arquivos:** `TalkXCampaignWizard.tsx`, `TalkXContactSelector.tsx`, migration `20260917_talkx_campaign_flags.sql`
1. Card "Filtros de audiência": Tags (multi), Status do contato, Empresa, Estágio no funil (`pipeline_stage`), Vendedor (`assigned_to`), Localização (`state`/`city`) — só campos existentes; "RFM" do mock **não existe** → omitido.
2. Reaproveitar `buildFilter` (mesma semântica dos segmentos; `audience_filters` guarda o JSON de regras).
3. "Limpar filtros".
4. Lista de contatos resultante (`TalkXContactSelector`, virtualizada) com seleção manual opcional.
5. Migration: `talkx_campaigns add column respect_suppression bool not null default true, confirm_consent bool not null default false, launched_by uuid, launched_at timestamptz`.
6. Rail: Público total (estimado) / Elegíveis (x%) / Bloqueados por supressão (n, %) / Início estimado / Duração estimada / Canal.
7. Debounce + cancel nas contagens.
8. Catálogo/manifest.
9. Testes.
10. Commit `feat(talkx): E63 filtros de audiência + flags`.
**Checklist**
- [ ] 6 filtros reais
- [ ] `audience_filters` = regras
- [ ] 4 colunas novas
- [ ] rail com números reais
- [ ] commit

### E64 · Passo 2 — Mensagem: tipos, editor, variáveis, templates, mídia
**Arquivos:** `TalkXCampaignWizard.tsx`, `useCampaignEditor.ts`
1. Chips de tipo: Texto · Imagem · Vídeo · Documento · Áudio (`MEDIA_TYPES`).
2. Editor igual ao do template (E43: toolbar, contador `162/4096`, highlight de variáveis).
3. Painel "Variáveis" à direita do editor (chips clicáveis).
4. Link "Templates" abre `Sheet` com a galeria (E41) em modo seleção; aplicar copia `content`/`media` e grava `template_id`.
5. "Adicionar mídia (opcional) — Máx. 16 MB" com o mesmo uploader (E44).
6. Prévia no rail atualiza ao digitar (E66).
7. Validação: conteúdo ≥ 1 char ou mídia; variáveis conhecidas.
8. Aviso de boas práticas (link/emoji excessivo) — heurística simples, não bloqueante.
9. Testes.
10. Commit `feat(talkx): E64 passo 2`.
**Checklist**
- [ ] 5 tipos
- [ ] editor compartilhado com template
- [ ] seleção de template grava `template_id`
- [ ] validação
- [ ] commit

### E65 · Passo 3 — Entrega: conexão, velocidade, janela, horário comercial, supressão
**Arquivos:** `TalkXWizardDelivery.tsx`, `useCampaignEditor.ts`
1. Conexão WhatsApp: select de `whatsapp_connections` `status='connected'` com número; estado desconectado (E19) quando nenhuma.
2. Velocidade: `SPEED_PROFILES` (Lenta/Moderada/Rápida) com texto "Intervalos entre mensagens de 8 a 20 s" calculado dos `send_interval_min/max` reais.
3. "Throttle / Simulação humana": toggle que liga `typing_delay_*` (já existe) — card explicativo azul do mock 10.
4. Janela de envio (início/fim) + "Envios apenas neste período" card informativo.
5. "Limitar por horário comercial" (toggle) — lê `company_settings.business_hours` se existir; senão 08–18 fixo com aviso.
6. "Confirmação e supressão": 2 checks (não enviar para supressão · respeitar opt-outs/bloqueados) — gravam `respect_suppression`.
7. Estimativa de duração = `estimateSeconds(count, …)` no rail.
8. Validação: conexão obrigatória.
9. Testes.
10. Commit `feat(talkx): E65 passo 3`.
**Checklist**
- [ ] conexão real
- [ ] textos derivados dos intervalos reais
- [ ] janela/horário comercial
- [ ] checks gravam flag
- [ ] commit

### E66 · Rail do wizard: Resumo + Prévia da mensagem em telefone
**Arquivos:** `TalkXCampaignWizard.tsx`
1. "Resumo da campanha": 6 mini-cards 2×3 (Público total, Elegíveis %, Bloqueados, Início estimado, Duração, Canal) — valores de E63/E65.
2. "Prévia da mensagem" com `PhonePreview` (E44) e "Ver no celular" (E47 envio de teste).
3. Atualização ao digitar (debounce 150 ms).
4. Contato de amostra real (primeiro elegível) para personalizar.
5. Skeleton enquanto conta.
6. Rail sticky; scroll interno.
7. < 1280: `Sheet`.
8. Testes.
9. Print vs mock 08.
10. Commit `feat(talkx): E66 rail wizard`.
**Checklist**
- [ ] 6 mini-cards reais
- [ ] preview ao vivo
- [ ] envio de teste
- [ ] responsivo
- [ ] commit

### E67 · Passo 4 — Revisão final + modal "Confirmar disparo?" (mock 09)
**Arquivos:** `TalkXWizardDelivery.tsx` (`TalkXWizardReview`)
1. Stepper com 3 checks verdes + "4 Revisão".
2. Coluna 1 "Resumo da Campanha": 10 linhas com ícone, label, valor, sub-linha e botão `Editar` (volta ao passo) — já existem `Row`s; ajustar visual (tile 32 à esquerda, `Editar` ghost sm).
3. Coluna 2 "Prévia da Mensagem no WhatsApp": `PhonePreview` grande.
4. Coluna 3 "Resumo Operacional": Público total (contatos qualificados), Tempo estimado de entrega (a N msg/min), Taxa de resposta projetada — **sem backend** → omitir; Risco de opt-out (heurística: opt-outs 30d / enviados 30d, "Baixo" < 1%).
5. "Recomendações da IA" — E92 (oculto).
6. Card verde "Tudo pronto para lançar!" só quando todas as validações passam; senão card âmbar listando pendências.
7. Botão `Lançar campanha` (glow) abre `TalkXConfirmDialog` preset `confirmarDisparo` com 3 checks (consentimento, conteúdo revisado, supressão aplicada) e texto "será enviada para N contatos. Esta ação não pode ser desfeita."
8. Confirmar → `launch()`: cria recipients (excluindo supressão), `status='scheduled'|'sending'`, evento `started`/`scheduled`, `launched_by/at`; abre monitor (E73) ou tela agendada (E71).
9. Testes de `launch` (mock).
10. Commit `feat(talkx): E67 revisão + confirmação`.
**Checklist**
- [ ] 3 colunas
- [ ] risco de opt-out real
- [ ] modal com 3 checks
- [ ] `launch` grava flags/eventos
- [ ] commit

### E68 · Rascunhos: autosave, retomar, lista de rascunhos
**Arquivos:** `useCampaignEditor.ts`, `useTalkX.ts`
1. Ao sair do passo 1 válido → `insert` rascunho (`status='draft'`) se ainda não tem id.
2. Autosave a cada 20 s de mudança (`update`), indicador "Rascunho salvo há X".
3. Reabrir rascunho pela lista (ação Editar) restaura passo e campos (`audience_filters`, `segment_id`, `template_id`, `send_window_*`, `speed_profile`, flags).
4. `duplicateCampaign` (E25) usa o mesmo caminho.
5. Conflito: `updated_at` otimista.
6. Excluir rascunho da lista.
7. Testes de hidratação completa.
8. Doc.
9. Print.
10. Commit `feat(talkx): E68 rascunhos`.
**Checklist**
- [ ] insert no passo 1
- [ ] autosave
- [ ] hidratação completa
- [ ] conflito
- [ ] commit

### E69 · Agendamento: data, horário, fuso, repetição (mock 10)
**Arquivos:** `TalkXWizardDelivery.tsx`, migration `20260918_talkx_recurrence.sql`
1. Toggle "Agendar para depois" → Data (`Calendar` popover), Horário (select 15 min), Fuso (`(UTC-03:00) Brasília` fixo com opção de mudar).
2. Migration: `talkx_campaigns add column recurrence jsonb` (`{type:'none'|'daily'|'weekly'|'custom', days:[...], until:date}`), `timezone text default 'America/Sao_Paulo'`.
3. "Repetição": Não repetir / Diariamente / Semanalmente / Personalizado (dias da semana).
4. `talkx-scheduler`: após concluir campanha recorrente, clona como `scheduled` na próxima ocorrência (respeita `until`).
5. Card "Resumo da Programação" (timeline vertical: configurada → início → janela → previsão de conclusão) — calculado.
6. Validação: `scheduled_at > now()+2min`.
7. Catálogo/manifest; deploy scheduler.
8. Testes da função `nextOccurrence`.
9. Print vs mock 10.
10. Commit `feat(talkx): E69 agendamento + recorrência`.
**Checklist**
- [ ] colunas `recurrence`/`timezone`
- [ ] scheduler clona
- [ ] timeline calculada
- [ ] validação
- [ ] commit

### E70 · QA Fase 6 + merge
1. Prints 08/09/10 (cada passo, modal, agendada).
2. `PARIDADE.md` 08/09/10.
3. Fluxo manual completo: novo → segmento → template com mídia → moderada + janela → revisar → lançar → monitor.
4. Fluxo agendado: 2 min no futuro → cron inicia.
5. Fluxo rascunho: sair no passo 2 → voltar → tudo restaurado.
6. `tsc`/`eslint`/`vitest`/`build`; testes Deno.
7. Sentry.
8. PR `feat/talkx-f6-wizard → main`; deploy; smoke.
9. Memória.
10. Branch `feat/talkx-f7-lifecycle`.
**Checklist**
- [ ] paridade 08/09/10
- [ ] 3 fluxos manuais
- [ ] PR mergeado
- [ ] smoke
- [ ] branch F7

---

# FASE 7 — CICLO DE VIDA DA CAMPANHA (E71–E85) · telas 10, 11, 12, 13, 14

### E71 · Tela "Campanha Agendada" (mock 10)
**Arquivos:** `src/components/talkx/TalkXCampaignScheduled.tsx` (novo), `TalkXView.tsx`
1. Rota interna `topView='scheduled'` para campanhas `status='scheduled'`.
2. Header: tile WhatsApp verde, "Talk X · Agendamento de campanha"; card de status verde "Agendada para 27/11 · 09:00 — Campanha pronta para ser enviada."; botões `Editar` (volta ao wizard passo 3) e `Salvar agendamento`.
3. Coluna 1: "Configurações de Agendamento" (edição inline dos campos de E69), Repetição, Janela de envio, Horário comercial, Throttle, Confirmação e supressão.
4. Coluna 2: "Selecionar Data" (`Calendar` inline com dia marcado) + "Resumo da Programação" (timeline).
5. Coluna 3: "Resumo da Campanha" com banner da mídia (`media_url`) ou gradiente soft, Nome, Público-alvo (segmento + n), Mensagem (3 linhas), Linha WhatsApp (nome + número + `Conectada`), Duração estimada, Responsável (avatar), card azul "Tudo pronto para o envio!".
6. Ações: `Iniciar agora` (confirmação), `Cancelar agendamento`.
7. Evento `scheduled_updated` ao salvar.
8. Testes.
9. Print.
10. Commit `feat(talkx): E71 tela agendada`.
**Checklist**
- [ ] 3 colunas
- [ ] edição inline salva
- [ ] calendário sincronizado
- [ ] iniciar agora / cancelar
- [ ] commit

### E72 · Roteamento por status: qual tela abre cada campanha
**Arquivos:** `TalkXView.tsx`
1. `draft` → wizard; `scheduled` → E71; `sending` → E73 (monitor) ou E76 (andamento) conforme tab; `paused` → E79; `completed|cancelled|failed` → E82 (relatório).
2. Deep link `?view=talkx&campaign=<id>` resolve para a tela certa.
3. Botão "Voltar às campanhas" padronizado (breadcrumb + `←`).
4. Transições animadas (`talkxFadeUp`).
5. Preservar aba/filtros ao voltar.
6. Tratamento de id inexistente → `TalkXErrorState`.
7. Testes de roteamento por status.
8. Doc em `ARQUITETURA.md`.
9. Print.
10. Commit `feat(talkx): E72 roteamento por status`.
**Checklist**
- [ ] 5 status → 5 telas
- [ ] deep link
- [ ] voltar preserva estado
- [ ] id inválido tratado
- [ ] commit

### E73 · Monitor ao Vivo — header, KPIs e "Ritmo de Entrega" (mock 11)
**Arquivos:** `TalkXLiveMonitor.tsx`, `useTalkXMonitor.ts`
1. Header: tile WhatsApp, "Monitor ao Vivo"; controles: data (hoje), segmentação (select), status (select), refresh; badge "Em andamento · Talk X · Iniciada às HH:mm".
2. Sub-tabs: Campanhas · **Monitor** · Segmentos · Templates · Supressão · Analytics (mesma `ModuleTabs`, ativa = Monitor).
3. KPIs: Enviadas (`sent`), Entregues (`delivered_at` — E87), Respondidas (`replied_at` — E88), Falhas (`failed`), Opt-outs (`talkx_blacklist.campaign_id` = esta). Deltas "vs. previsto" = `sent/total`; "vs. ontem" **não** (sem histórico comparável) → omitir.
4. "Ritmo de Entrega": `AreaChart` recharts com `rateByMinute` (E02), tooltip "Término estimado Hoje, 16:12 em 54 min" calculado de `remaining / taxa dos últimos 10 min`.
5. Select "Últimos 60/30/15 minutos".
6. Legenda Enviadas · Entregues · Previsto.
7. Cores: `--primary`, `--success`, tracejado `muted`.
8. Realtime (E27) + polling 5 s.
9. Testes de `eta`.
10. Commit `feat(talkx): E73 monitor header+KPIs+ritmo`.
**Checklist**
- [ ] 5 KPIs (2 dependem de E87/E88, ocultos até lá)
- [ ] ETA calculado
- [ ] realtime
- [ ] sub-tabs
- [ ] commit

### E74 · Monitor — Saúde da Campanha, Fila por Segmento, ações Pausar/Cancelar
**Arquivos:** `TalkXLiveMonitor.tsx`
1. "Saúde da Campanha": Status atual (`Enviando normalmente` / `Pausada` / `Falhas acima de 5%`), Conexão WhatsApp (`whatsapp_connections.status` da campanha, realtime), Taxa de envio (msg/min dos últimos 5 min), Término estimado; "Recomendação da IA" — E92 (oculta); até lá "Recomendação" heurística: falhas > 5% → "Reduza a velocidade".
2. Botões `Pausar Campanha` (primary) e `Cancelar Campanha` (danger) com modais.
3. "Fila por Segmento": se `segment_id` → 1 linha; se `audience_filters` → agrupar recipients por `contacts.tags[0]`? **Não inventar** — mostrar por **status** (Enviados/Entregues/Falhas/Pendentes) com barra, e por segmento só quando campanha tem `segment_id` (E75 amplia para multi-segmento).
4. "Ver todos" → aba Destinatários.
5. Skeleton/vazio.
6. Testes.
7. Print.
8. `PARIDADE.md` 11 (parcial).
9. Doc de heurísticas em `ARQUITETURA.md`.
10. Commit `feat(talkx): E74 saúde + fila + ações`.
**Checklist**
- [ ] saúde com 4 linhas reais
- [ ] pausar/cancelar com modal
- [ ] fila por status
- [ ] heurística documentada
- [ ] commit

### E75 · Campanha multi-segmento (`talkx_campaign_segments`)
**Arquivos:** migration `20260919_talkx_campaign_segments.sql`, `useCampaignEditor.ts`, wizard, monitor
1. Tabela `talkx_campaign_segments(campaign_id, segment_id, position, total, sent, failed)` PK composta; RLS.
2. Wizard passo 1 "Segmento salvo" aceita múltiplos (chips); `segment_id` legado continua = primeiro.
3. `talkx_recipients add column segment_id uuid` para atribuição.
4. `launch()` resolve união dos segmentos sem duplicar contato.
5. Monitor "Fila por Segmento" real (Total/Enviadas/Restante/Progresso) e tela Pausada "Segmentos da Campanha" (mock 13).
6. Relatório "Segmentos com melhor desempenho" (E84).
7. Catálogo/manifest.
8. Testes de união.
9. Deploy send (grava `segment_id` no recipient).
10. Commit `feat(talkx): E75 multi-segmento`.
**Checklist**
- [ ] tabela + coluna
- [ ] união sem duplicata
- [ ] fila real por segmento
- [ ] send grava segment
- [ ] commit

### E76 · Monitor — Destinatários em tempo real + Linha do Tempo Operacional
**Arquivos:** `TalkXLiveMonitor.tsx`, `useTalkXEvents.ts`
1. "Destinatários em tempo real": `TalkXTable` (avatar, nome + telefone, Origem (`contacts.source` se existir; senão oculto), Segmento, Status pill (`RECIPIENT_STATUS` + `replied` E88), Horário, Ações: abrir conversa (`?view=chat&contact=`), reenviar (falha) → `talkx-send` ação `retry` (E91)).
2. Filtro "Todos os status" + busca.
3. Realtime `talkx_recipients` (E27) — inserção no topo com animação.
4. "Linha do Tempo Operacional": eventos `talkx_campaign_events` + eventos derivados (resposta recebida E88, opt-out E57, falha de conexão E91) — ícone colorido, hora, título, subtítulo.
5. "Ver todos" → `Sheet` com paginação.
6. "Insights da IA — Campanha saudável" — E92 (oculto).
7. Virtualização > 200.
8. Testes.
9. Print vs mock 11.
10. Commit `feat(talkx): E76 destinatários + timeline`.
**Checklist**
- [ ] tabela realtime
- [ ] ações abrir conversa/reenviar
- [ ] timeline de eventos reais
- [ ] virtualização
- [ ] commit

### E77 · Tela "Campanha em Andamento" (mock 12) — visão geral com donut e pico de respostas
**Arquivos:** `src/components/talkx/TalkXCampaignRunning.tsx` (novo)
1. Header: tile WhatsApp, "Campanha em Andamento" + descrição; controles: campanha (select das `sending`), início, `Ver monitor`, refresh.
2. Sub-tabs: Visão Geral · Destinatários · Mensagens · Configurações · Resultados · Logs em Tempo Real.
3. KPIs: Enviadas (`vs. previsto`), Entregues (E87), Respostas (E88), Falhas, Destinatários Restantes (barra `de N contatos`).
4. "Progresso da Campanha": donut SVG (`sent+failed / total`) com legenda Enviados / Entregues / Respondidos / Falhas / Pendentes (números reais; linhas sem backend omitidas).
5. "Ritmo de Envio": mesmo `AreaChart` de E73.
6. "Pico de Respostas": só com E88 — variação de respostas nos últimos 10 min vs 10 anteriores; até lá oculto.
7. Card "Ações da Campanha": Pausar, Cancelar, Editar Limites (E78), Ver Monitor; "Configurações Atuais" (limite msg/min, horário, dias, DND) — dos campos reais.
8. Modal "Pausar Campanha?" preset.
9. Testes.
10. Commit `feat(talkx): E77 em andamento`.
**Checklist**
- [ ] donut real
- [ ] 6 sub-tabs (2 podem ser placeholders honestos "em breve")
- [ ] ações
- [ ] configurações reais
- [ ] commit

### E78 · Editar limites de uma campanha em andamento
**Arquivos:** `TalkXCampaignRunning.tsx`, `talkx-send/index.ts`
1. Modal "Editar Limites": velocidade (`speed_profile`), intervalos min/max, janela, horário comercial.
2. `talkx-send` lê os parâmetros **a cada lote** (não só no início) — refatorar loop para reler `talkx_campaigns` a cada 20 envios.
3. Evento `limits_updated` com diff.
4. Validação (min < max, janela válida).
5. Toast.
6. Testes Deno do reload.
7. Deploy.
8. Doc.
9. Print.
10. Commit `feat(talkx): E78 editar limites ao vivo`.
**Checklist**
- [ ] send relê parâmetros
- [ ] evento com diff
- [ ] validação
- [ ] deploy
- [ ] commit

### E79 · Tela "Campanha Pausada" (mock 13) — banner, KPIs, progresso, segmentos, checklist
**Arquivos:** `src/components/talkx/TalkXCampaignPaused.tsx` (novo)
1. Header: tile pausa âmbar, "Campanha Pausada · <nome>", "pausada manualmente por <ator>" (do evento `paused`), cards "Pausada em" e "Tipo de campanha"; botões `Retomar campanha` (primary) e `Encerrar campanha` (danger outline).
2. Banner âmbar com motivo (campo `pause_reason` — migration mínima `talkx_campaigns add column pause_reason text`) e "Nenhum novo contato será processado…".
3. KPIs: Destinatários Totais, Processados (sent+failed, % da audiência), Restantes na Fila, Segmentos Pendentes (E75).
4. "Progresso da Campanha": donut 3 tons (concluídos/restantes/falhas).
5. "Segmentos da Campanha": tabela `talkx_campaign_segments` com status (Concluído/Em execução/Pendente) e barra.
6. "Checklist para Retomar": 5 itens com estado real (segmentação revisada = evento `segments_reviewed`; templates OK = template `approved`; limites dentro da conta = E93; agendamentos válidos = `scheduled_at` futuro ou null; respostas automáticas = E93 flag) — itens sem fonte ficam como checkbox manual persistido em `talkx_campaign_events`.
7. "Linha do Tempo da Campanha" (eventos) e "Resumo de Enviados" (`LineChart` por hora das últimas 24 h de `sent_at`/`delivered_at`, marcador da pausa).
8. "Principais Métricas": Taxa de Entrega (E87), Resposta (E88), Falha, Tempo Médio de Resposta (E88) — "vs. média" só com E89.
9. Modal "Retomar campanha?" preset.
10. Commit `feat(talkx): E79 tela pausada`.
**Checklist**
- [ ] banner com motivo real
- [ ] checklist com fontes reais/manual persistido
- [ ] segmentos reais
- [ ] gráfico 24 h real
- [ ] commit

### E80 · Pausar com motivo + retomar de onde parou (backend)
**Arquivos:** `talkx-send/index.ts`, `useTalkX.ts`
1. `pause` recebe `reason`; grava `paused_at`, `pause_reason`, evento `paused` com ator.
2. Loop de envio verifica `status` a cada mensagem (já faz? — auditar `talkx-send:150-252`) e sai limpo em `paused`/`cancelled`, sem marcar o recipient em voo como `failed`.
3. `resume` retoma só `pending` (não reenvia `sent`), evento `resumed`.
4. `cancel` marca pendentes como `cancelled` (novo status em `RECIPIENT_STATUS`) e evento.
5. Idempotência: `resume` em campanha `sending` = no-op.
6. Testes Deno com 5 recipients: pausar no 3º → 2 sent, 3 pending; retomar → 5 sent.
7. Deploy.
8. UI: modal de pausa pede motivo (textarea opcional).
9. Doc.
10. Commit `feat(talkx): E80 pausa/retomada robustas`.
**Checklist**
- [ ] `pause_reason` gravado
- [ ] retomar não duplica
- [ ] cancelar marca pendentes
- [ ] teste de 5 recipients
- [ ] commit

### E81 · Encerrar campanha (cancel definitivo) + estados terminais
**Arquivos:** `TalkXCampaignPaused.tsx`, `TalkXLiveMonitor.tsx`, `useTalkX.ts`
1. Modal preset `cancelarCampanha` ("O envio será interrompido imediatamente e os contatos pendentes não receberão…").
2. Após cancelar → relatório (E82) com badge `Cancelada`.
3. `completed` automático quando `pending=0` (já existe em `talkx-send:176`) + evento `completed`.
4. `failed` da campanha quando > 50% falhas consecutivas? → não automático; apenas alerta na Saúde.
5. Lista: `cancelled` aparece com pill vermelha; filtro.
6. Testes.
7. Doc de máquina de estados em `ARQUITETURA.md` (draft → scheduled → sending ⇄ paused → completed | cancelled).
8. Diagrama Mermaid.
9. Print.
10. Commit `feat(talkx): E81 encerrar + máquina de estados`.
**Checklist**
- [ ] modal
- [ ] estados terminais consistentes
- [ ] diagrama
- [ ] filtro na lista
- [ ] commit

### E82 · Relatório de campanha concluída — header, KPIs, desempenho ao longo do tempo (mock 14)
**Arquivos:** `src/components/talkx/TalkXCampaignReport.tsx` (novo), `useTalkXReport.ts` (novo)
1. Header: tile WhatsApp, "Relatório · <nome>" + pill `Concluída`; Período (`started_at`–`completed_at`), `Exportar relatório` (E85), `Compartilhar` (E85), `⋯`.
2. Sub-tabs: Visão Geral · Mensagens · Segmentos · Links (E90) · Audiência · Conversões (E90) · Respostas (E88) · Logs.
3. KPIs (6): Enviados, Entregues (E87), Respostas (E88), Cliques (E90), Conversões (E90), Opt-outs — cada um com `% de` base real; os dependentes ficam ocultos até sua etapa.
4. "Desempenho da Campanha": `LineChart` diário/horário (select) com Enviados/Entregues/Respostas/Conversões (séries só quando existem).
5. Tooltip por ponto com os 4 números.
6. `useTalkXReport(campaignId)` — 1 RPC `talkx_campaign_report(id)` (E86) devolvendo agregados por dia/hora/segmento/link.
7. Cache 5 min (campanha concluída não muda).
8. Skeleton/erro.
9. Testes do hook.
10. Commit `feat(talkx): E82 relatório base`.
**Checklist**
- [ ] header + 8 sub-tabs
- [ ] KPIs só reais
- [ ] gráfico temporal real
- [ ] RPC única
- [ ] commit

### E83 · Relatório — Funil de Conversão + Mapa de Calor de Respostas
**Arquivos:** `TalkXCampaignReport.tsx`
1. "Funil de Conversão": 5 degraus (Enviados → Entregues → Responderam → Clicaram → Converteram) — trapézios SVG com cores `primary/success/violet/warning/amber`; degraus sem backend são omitidos (funil de 2 ou 3 degraus é válido).
2. Select "Todos os segmentos" filtra o funil (E75).
3. "Mapa de Calor de Respostas": grade dia-da-semana × hora com `replied_at` (E88); até lá o heatmap usa `sent_at` rotulado "Envios" (não "Respostas").
4. Legenda menor/maior volume.
5. Tooltip por célula.
6. Acessibilidade: tabela oculta equivalente (`sr-only`).
7. Testes da agregação.
8. Print.
9. `PARIDADE.md` 14 (parcial).
10. Commit `feat(talkx): E83 funil + heatmap`.
**Checklist**
- [ ] funil com degraus reais
- [ ] heatmap rotulado pela fonte real
- [ ] filtro por segmento
- [ ] a11y
- [ ] commit

### E84 · Relatório — Segmentos com melhor desempenho, Resumo, Links clicados, Insights
**Arquivos:** `TalkXCampaignReport.tsx`
1. "Segmentos com Melhor Desempenho": tabela (Segmento, Enviados, Respostas, Conversões, Taxa Conv.) de `talkx_campaign_segments` + E88/E90.
2. "Resumo da Campanha": Objetivo, Audiência, Segmentos, Template (com `Visualizar`), Duração, Responsável, Investimento (campo novo `talkx_campaigns.investment numeric` opcional, editável), Receita gerada (E90 conversões com valor), ROI (calc) — os 2 últimos só com E90.
3. "Principais Links Clicados": E90.
4. "Insights da IA (Beta)": E92 — até lá 4 cards heurísticos: desempenho vs média das campanhas (real), melhor horário (do heatmap real), segmento em destaque (E75), oportunidade (clicaram sem converter — E90).
5. Botão "Ver campanha" → wizard somente leitura.
6. Skeletons.
7. Testes.
8. Print.
9. `PARIDADE.md` 14.
10. Commit `feat(talkx): E84 relatório completo`.
**Checklist**
- [ ] segmentos reais
- [ ] resumo com campo investimento
- [ ] insights heurísticos reais
- [ ] blocos dependentes ocultos
- [ ] commit

### E85 · Exportar relatório (PDF/CSV) e compartilhar link + QA Fase 7 + merge
**Arquivos:** `src/lib/talkxReportExport.ts`, `TalkXCampaignReport.tsx`
1. CSV: recipients com status/horários (E29 lib).
2. PDF: `window.print()` com CSS `@media print` dedicado (fundo branco, gráficos SVG preservados) — sem lib nova.
3. "Compartilhar": copia deep link `?view=talkx&campaign=<id>` (interno; sem link público).
4. Prints 10/11/12/13/14.
5. `PARIDADE.md` 10–14.
6. Fluxo manual: lançar → pausar com motivo → retomar → concluir → relatório → exportar.
7. `tsc`/`eslint`/`vitest`/`build`; Deno tests.
8. Sentry.
9. PR `feat/talkx-f7-lifecycle → main`; deploy; smoke.
10. Branch `feat/talkx-f8-backend`.
**Checklist**
- [ ] CSV + PDF
- [ ] paridade 10–14
- [ ] fluxo manual completo
- [ ] PR mergeado
- [ ] branch F8

---

# FASE 8 — BACKEND, RASTREIO & OBSERVABILIDADE (E86–E93)

### E86 · RPCs de agregação (`talkx_overview_stats`, `talkx_campaign_report`, `talkx_segment_tags`) + trigger de `use_count`
**Arquivos:** migration `20260920_talkx_rpcs.sql`
1. `talkx_overview_stats(p_from timestamptz, p_to timestamptz)` → json com totais, por status, por dia (7), contatos alcançados, taxa de sucesso, período anterior.
2. `talkx_campaign_report(p_campaign uuid)` → json com KPIs, série por hora/dia, por segmento, por variante, heatmap, links (E90).
3. `talkx_segment_tags(p_segment uuid)` → top 10 tags do público.
4. Todas `security invoker`, `stable`, `search_path = public`.
5. Trigger `talkx_templates.use_count` incrementa em `insert` de `talkx_campaigns` com `template_id` quando `status` sai de `draft`.
6. Índices: `talkx_recipients(campaign_id, status)`, `(campaign_id, sent_at)`, `(contact_id)`, `talkx_campaign_events(campaign_id, created_at desc)`, `talkx_blacklist(phone)`.
7. `EXPLAIN ANALYZE` de cada RPC com 50k recipients sintéticos (fixture em schema `talkx_test`, apagado depois) < 300 ms.
8. Hooks passam a usar as RPCs (E21, E82, E32).
9. Catálogo/manifest; `db-guard`.
10. Commit `feat(talkx): E86 RPCs + índices + trigger`.
**Checklist**
- [ ] 3 RPCs
- [ ] 5 índices
- [ ] trigger `use_count`
- [ ] EXPLAIN < 300 ms
- [ ] commit

### E87 · Entregue/Lido reais: `external_id` no recipient + gancho no webhook
**Arquivos:** migration `20260920_talkx_recipients_tracking.sql`, `talkx-send/index.ts`, `_shared/evolution-webhook-msg-handlers.ts`
1. `talkx_recipients add column external_id text, read_at timestamptz, replied_at timestamptz, clicked_at timestamptz, variant_id uuid, segment_id uuid` + índice `(external_id)`.
2. `talkx-send`: após `sendResponse.ok`, gravar `external_id = sendResult.key.id` (formato Evolution) junto com `status='sent'`.
3. No handler de `messages.update` (`:83-145`), após atualizar `messages`, `update talkx_recipients set delivered_at = coalesce(delivered_at, now()) where external_id = key.id` para `delivered`; `read_at` para `read`.
4. Trigger em `talkx_recipients` que mantém `talkx_campaigns.delivered_count` (contagem incremental).
5. Backfill impossível para envios antigos (sem `external_id`) — documentar.
6. Testes Deno: webhook sintético `DELIVERY_ACK` → `delivered_at` preenchido.
7. Deploy `talkx-send` + `evolution-webhook`.
8. Teste real com 1 envio.
9. UI: KPIs "Entregues" e "Lidas" passam a renderizar (E21/E73/E77/E82).
10. Commit `feat(talkx): E87 delivered/read reais`.
**Checklist**
- [ ] 6 colunas + índice
- [ ] `key.id` persistido
- [ ] webhook atualiza recipient
- [ ] trigger `delivered_count`
- [ ] teste real

### E88 · Respostas reais: detectar resposta do contato após campanha + tempo médio de resposta
**Arquivos:** `_shared/evolution-webhook-msg-handlers.ts`, `_shared/talkx-reply.ts` (novo), migration `20260921_talkx_replies.sql`
1. Ao inserir `messages` com `sender='contact'`: buscar o último `talkx_recipients` do contato com `sent_at >= now()-72h and replied_at is null` → `replied_at = now()`, `reply_message_id`.
2. Coluna `talkx_recipients.reply_message_id uuid` + `talkx_campaigns.replied_count` (trigger).
3. Janela de atribuição (72 h) configurável em `talkx_settings` (E93).
4. Tempo médio de resposta = `avg(replied_at - sent_at)` na RPC de relatório.
5. Excluir respostas que são keywords de opt-out (E57) da contagem de "respostas".
6. Testes Deno.
7. Deploy.
8. Teste real.
9. UI: "Respondidas", "Taxa de resposta", "Pico de Respostas", heatmap de respostas, "Tempo Médio de Resposta" passam a renderizar.
10. Commit `feat(talkx): E88 respostas reais`.
**Checklist**
- [ ] atribuição 72 h
- [ ] `replied_count` trigger
- [ ] opt-out não conta como resposta
- [ ] teste real
- [ ] UI liberada

### E89 · Métricas comparativas: média das campanhas, "vs. média", desempenho por segmento/template
**Arquivos:** migration `20260921_talkx_benchmarks.sql`, hooks
1. View materializada `talkx_campaign_metrics` (por campanha: enviados, entregues, respostas, cliques, taxa_entrega, taxa_resposta, duração) refresh por trigger ao `completed`.
2. RPC `talkx_benchmarks()` → médias globais (últimos 90 dias).
3. "Conversão média" (Segmentos KPI), "Taxa média de resposta" (Templates KPI), "Desempenho (última campanha)" na tabela de segmentos, "vs. média" nas Principais Métricas, "Mais convertidos" por taxa de resposta — todos liberados.
4. Delta em p.p. vs média.
5. Índices.
6. Testes SQL.
7. Catálogo/manifest.
8. UI: remover os `hidden` condicionais dessas métricas.
9. Print das telas afetadas (02, 04, 13).
10. Commit `feat(talkx): E89 benchmarks`.
**Checklist**
- [ ] matview + refresh
- [ ] RPC
- [ ] 5 métricas liberadas
- [ ] prints
- [ ] commit

### E90 · Links rastreáveis: encurtador `talkx-link`, cliques e conversões
**Arquivos:** `supabase/functions/talkx-link/index.ts` (nova), migration `20260922_talkx_links.sql`, `talkx-send`, `TalkXCampaignReport.tsx`
1. Tabelas `talkx_links(id, campaign_id, label, target_url, slug unique)` e `talkx_link_clicks(id, link_id, recipient_id, clicked_at, ua, ip_hash)`; `talkx_conversions(id, campaign_id, recipient_id, value numeric, source text, created_at)`.
2. Variável `{{link}}` (E45): ao enviar, `talkx-send` gera slug por recipient (`/l/<slug>?r=<recipient>`) apontando para o worker.
3. Edge `talkx-link`: registra clique (`clicked_at` no recipient + `talkx_link_clicks`) e redireciona 302; domínio via `VITE_TALKX_LINK_BASE` (Cloudflare Worker `talkx-link` como proxy curto — opcional).
4. Conversão: endpoint `talkx-link?convert=<recipient>` para webhooks externos (Bitrix negócio ganho) — E95 liga.
5. Relatório: "Principais Links Clicados" (cliques, taxa, barra), KPIs Cliques/Conversões, funil completo, Receita gerada/ROI.
6. RLS; rate limit no worker.
7. Testes Deno.
8. Deploy.
9. Teste real (clicar no link do celular).
10. Commit `feat(talkx): E90 links rastreáveis + conversões`.
**Checklist**
- [ ] 3 tabelas
- [ ] `{{link}}` funciona
- [ ] clique registra e redireciona
- [ ] relatório mostra links
- [ ] teste real

### E91 · Resiliência do envio: retry, falha de conexão, reconexão, dead-letter
**Arquivos:** `talkx-send/index.ts`, `talkx-scheduler/index.ts`
1. Retry com backoff (3 tentativas: 30 s, 2 min, 10 min) para erros transitórios (5xx, timeout); `attempts int` no recipient (migration).
2. Falha de conexão (`whatsapp_connections.status != 'connected'`): pausa automática com `pause_reason='connection_lost'` + evento `connection_failed`; scheduler retoma quando reconectar (evento `resumed_auto`).
3. Ação `retry` para recipient `failed` (E76).
4. Dead-letter: após 3 falhas → `failed` definitivo com `error_message`.
5. Timeout por envio 20 s.
6. Log estruturado (`Logger`) com `campaign_id`, `recipient_id`, `attempt`.
7. Testes Deno com Evolution mockada (500 → retry → 200).
8. Deploy.
9. Timeline mostra "Falha de conexão — tentativa de reenvio em 30 s" (mock 11).
10. Commit `feat(talkx): E91 retry + auto-pausa`.
**Checklist**
- [ ] backoff 3×
- [ ] auto-pausa por conexão
- [ ] retry manual
- [ ] logs estruturados
- [ ] commit

### E92 · Insights heurísticos (e IA opcional via `ai-proxy`)
**Arquivos:** `src/hooks/integrations/useTalkXInsights.ts` (novo), `talkxShared.tsx` (`InsightCard`)
1. Heurísticas reais: (a) melhor horário = janela de 2 h com maior taxa de resposta nos últimos 90 dias (E88/E89); (b) segmentos > 1000 contatos têm taxa X vs Y (E89); (c) template com melhor taxa; (d) segmento com > 30% inativos há 180 d (dados de `contacts.updated_at`) → sugerir reativação; (e) resumo "se aplicar as N recomendações" **não** (é promessa) → omitir.
2. Cada insight tem `apply()` real (ex.: pré-preencher janela no wizard, abrir template).
3. Cards nas telas 02 (Sugestão da IA), 07 (Insights), 09 (Recomendações), 11 (Insights), 14 (Insights) — rótulo "Insights" (não "IA") quando heurístico.
4. Opcional: `ai-proxy` (já existe) para redigir o texto do insight a partir dos números — flag `talkx_settings.ai_insights`; sem a flag, texto template.
5. Cache 1 h.
6. Testes das heurísticas com fixtures.
7. Doc das regras em `ARQUITETURA.md`.
8. Prints.
9. `PARIDADE.md` atualizado (blocos "IA").
10. Commit `feat(talkx): E92 insights`.
**Checklist**
- [ ] 4 heurísticas reais
- [ ] `apply()` funcional
- [ ] rótulo honesto
- [ ] IA só com flag
- [ ] commit

### E93 · Configurações do Talk X, RLS audit, realtime, alertas e limites
**Arquivos:** migration `20260923_talkx_settings.sql`, `src/components/talkx/TalkXSettings.tsx` (novo), Sentry/N8N
1. Tabela `talkx_settings(key pk, value jsonb)` semeada: `reply_window_hours=72`, `optout_autoreply`, `ai_insights=false`, `daily_limit_per_connection`, `default_speed_profile`, `business_hours`.
2. Tela Configurações (dentro de Analytics ▾ ou `⋯` do header): editar chaves com validação.
3. Auditoria RLS: `db_rls_audit`-like query — todas as `talkx_*` com RLS ativa, policies para os 4 verbos, `anon` sem grants; corrigir o que faltar.
4. Realtime: confirmar publicação (E27) e que `replica identity full` só onde necessário.
5. Alertas: N8N workflow "talkx-alerts" (falhas > 10% em 15 min, conexão caiu, campanha travada > 30 min sem `sent_at`) → WhatsApp `wpp2`/Slack.
6. Limite diário por conexão aplicado no `talkx-send` (contar `sent_at` do dia).
7. Sentry: `talkx` como tag nas edge functions e no front (`Sentry.setTag`).
8. Dashboard Grafana (se existir para o Supabase Cloud — senão pular) com `talkx_recipients` por status.
9. Testes.
10. Commit `feat(talkx): E93 settings + RLS + alertas`; PR `feat/talkx-f8-backend → main`; deploy; branch `feat/talkx-f9-release`.
**Checklist**
- [ ] settings + tela
- [ ] RLS 100% coberta
- [ ] alertas N8N ativos
- [ ] limite diário
- [ ] PR mergeado

---

# FASE 9 — IMPORTAÇÃO, AJUDA, ESTADOS, QA & RELEASE (E94–E100) · telas 15, 16, 17

### E94 · Importar contatos via CSV com regras de correspondência e detecção de duplicados (mock 15 esquerda)
**Arquivos:** `src/components/talkx/TalkXImport.tsx` (novo), `src/hooks/integrations/useTalkXImport.ts` (novo), `src/lib/talkxCsv.ts` (E54)
1. Tela "Talk X · Importar contatos e resolver vínculos"; sub-tabs Importar CSV · CRM 360 (E95) · Resolver Conflitos.
2. KPIs: Contatos Importados, Vinculados, Pendentes de Vínculo, Conflitos — de `talkx_imports` (tabela nova: `id, file_name, total, imported, linked, pending, conflicts, created_by, created_at`) + `talkx_import_rows` (`import_id, row jsonb, status, contact_id, suggestion jsonb, confidence`).
3. Dropzone `.csv` (10 MB), preview do arquivo ("1.250 contatos · 2.4 MB · Arquivo carregado").
4. "Regras de Correspondência": E-mail (prioritário), Telefone (com DDD), Documento (CPF/CNPJ — só se `contacts.document` existir), Nome + Empresa (similaridade `pg_trgm`).
5. "Detecção de Duplicados": verificar na importação, agrupar por e-mail, por telefone, mostrar só possíveis duplicados.
6. `Iniciar Importação e Vinculação` → RPC `talkx_import_match(import_id)` (E95) calcula `confidence` por linha.
7. Linhas com `confidence ≥ 90` vinculam automaticamente; 60–89 → pendentes; sem match → "criar novo contato".
8. Insert em `contacts` para novos (lotes).
9. Testes do matcher.
10. Commit `feat(talkx): E94 importação CSV`.
**Checklist**
- [ ] 2 tabelas de importação
- [ ] 4 regras de match
- [ ] confidence por linha
- [ ] novos contatos criados em lote
- [ ] commit

### E95 · CRM 360° = Bitrix24: vínculo, pendentes, sugestões e conversões (mock 15 direita)
**Arquivos:** `supabase/functions/bitrix-api/index.ts` (existente — auditar), `useTalkXImport.ts`, `TalkXImport.tsx`, migration `20260924_talkx_crm_links.sql`
1. Tabela `talkx_crm_links(contact_id pk, crm text default 'bitrix24', crm_entity text, crm_id text, synced_at, confidence)`.
2. "Contatos pendentes de vínculo": tabela (avatar, nome/e-mail, empresa, telefone, Origem CRM (`Bitrix24`), Sugestão de vínculo (nome + empresa do CRM ou "Nenhuma sugestão · Criar novo contato"), Confiança (pill verde/amarela), Ações: vincular 🔗 / criar ➕ / ignorar ⊘).
3. Sugestão via `bitrix-api` `crm.contact.list` filtrando por telefone/e-mail (cache 24 h).
4. Vincular grava `talkx_crm_links`; segmentos ganham origem `crm360` real e filtros "CRM 360" (E34) liberados: estágio do negócio, responsável, valor.
5. Conversão (E90): webhook Bitrix `ONCRMDEALUPDATE` (negócio ganho) → `talkx_conversions` para o recipient vinculado.
6. Wizard passo 1 card "CRM 360°" liberado (E62): filtros por estágio/responsável.
7. Estado "CRM 360 indisponível" (E19) quando `bitrix-api` retorna erro.
8. Testes.
9. Doc `docs/talkx/CRM360.md`.
10. Commit `feat(talkx): E95 CRM 360 (Bitrix24)`.
**Checklist**
- [ ] tabela de vínculos
- [ ] tabela de pendentes com 3 ações
- [ ] filtros CRM liberados
- [ ] conversão por negócio ganho
- [ ] commit

### E96 · Ajuda do Talk X (mock 16)
**Arquivos:** `src/components/talkx/TalkXHelp.tsx` (novo), `docs/talkx/help/*.md`
1. Tela "Ajuda do Talk X": busca (`⌘K`), exemplos clicáveis, "Tópicos mais buscados" (8 cards com contagem real de artigos), "Guias recomendados" (5 passos com duração e nível), rail: "Checklist antes de enviar" (5 itens ✓), "Vídeos e tutoriais" (3 — só se houver vídeo real; senão bloco oculto), "Contato com especialista" → abre chat interno/WhatsApp do suporte (`talkx_settings.support_phone`).
2. Conteúdo em Markdown em `docs/talkx/help/` importado no build (`import.meta.glob`), com frontmatter (título, tópico, nível, minutos).
3. Renderizador Markdown já existente no repo? (checar `src/lib/markdown` / `react-markdown`) — senão renderizar com conversão simples.
4. Botão `Ajuda` do header (E14) abre esta tela; `Saiba mais` do alerta LGPD abre tópico correto.
5. Busca client-side (título + corpo).
6. Escrever os 8 artigos iniciais (1 por tópico, 300–500 palavras, PT-BR).
7. Testes de busca.
8. Print.
9. `PARIDADE.md` 16.
10. Commit `feat(talkx): E96 ajuda`.
**Checklist**
- [ ] 8 tópicos com artigo real
- [ ] busca
- [ ] checklist
- [ ] deep link do alerta
- [ ] commit

### E97 · Estados do sistema e modais críticos — auditoria final (mock 17)
**Arquivos:** todos os `TalkX*.tsx`
1. Matriz tela × estado (vazio / skeleton / erro / CRM indisponível / WhatsApp desconectado / sem permissão) em `docs/talkx/ESTADOS.md`, marcada por componente.
2. Forçar cada estado via query param DEV `?talkxState=error` (só `DEV`) e tirar print.
3. Todos os modais críticos (excluir, duplicar, remover supressão, cancelar, confirmar disparo, pausar, retomar) usam `TalkXConfirmDialog` — grep por `AlertDialog` direto em `talkx/` = 0.
4. Foco inicial e retorno de foco em todos os modais.
5. `Esc` fecha; `Enter` confirma só quando não há checks pendentes.
6. Textos iguais ao mock 17 (nomes de entidade em negrito).
7. Loading nos botões de confirmação.
8. Testes de cada preset.
9. Prancha em `TalkXKit`.
10. Commit `feat(talkx): E97 estados + modais auditados`.
**Checklist**
- [ ] matriz completa
- [ ] 0 `AlertDialog` direto
- [ ] foco/teclado
- [ ] prints dos 6 estados
- [ ] commit

### E98 · Acessibilidade, responsividade e performance
1. `axe` (Playwright + `@axe-core/playwright` se já no repo; senão `npx @axe-core/cli` local) em 10 telas → 0 violações sérias.
2. Contraste de todas as pills/tiles ≥ 4.5:1 (script que lê `tokens.css` e calcula).
3. Navegação por teclado completa (wizard, tabelas, builder, modais).
4. `aria-live` em KPIs do monitor (polite).
5. Mobile 390 px: wizard, lista, monitor usáveis (rail em `Sheet`, tabelas com scroll horizontal + coluna fixa).
6. Bundle: chunk `talkx` < 250 kB gz (analisar com `vite-bundle-visualizer`); lazy em `TalkXCampaignReport`, `TalkXSegmentBuilder`, `TalkXImport`, `TalkXHelp`.
7. Render: lista com 1000 campanhas < 16 ms/frame (virtualização).
8. Queries: nenhuma acima de 300 ms (`db_slow_queries`).
9. Lighthouse ≥ 90 performance/a11y na Visão geral.
10. Commit `perf(talkx): E98 a11y + responsivo + bundle`.
**Checklist**
- [ ] axe 0 sérias
- [ ] mobile 390 ok
- [ ] chunk < 250 kB gz
- [ ] slow queries 0
- [ ] Lighthouse ≥ 90

### E99 · Testes E2E (Playwright) e suíte de regressão
**Arquivos:** `e2e/talkx/*.spec.ts`, `.github/workflows/ci.yml`
1. Fixtures: usuário de teste, conexão WhatsApp mock (Evolution stub via `PLAYWRIGHT - MCP` ou MSW), 50 contatos.
2. Specs: criar segmento → publicar; criar template → testar; wizard completo → lançar → monitor mostra progresso; pausar/retomar; supressão bloqueia envio; importar CSV; relatório abre e exporta.
3. Screenshots de referência (`toHaveScreenshot`) nas 17 telas em 1672×941 — comparação visual com tolerância 0.5%.
4. Rodar no CI em PRs que tocam `src/components/talkx/**` ou `supabase/functions/talkx-*` (path filter).
5. Tempo total < 8 min.
6. Flakiness: retries 1, traces on failure.
7. Cobertura unitária `talkx/` ≥ 75%.
8. Testes Deno das 4 edge functions no CI.
9. Doc `docs/talkx/TESTES.md`.
10. Commit `test(talkx): E99 e2e + regressão visual`.
**Checklist**
- [ ] 7 specs
- [ ] 17 screenshots de referência
- [ ] CI com path filter
- [ ] cobertura ≥ 75%
- [ ] commit

### E100 · Release, documentação final e handoff
1. `PARIDADE.md` 100% (17 telas) com prints finais lado a lado (mock vs app) em `docs/talkx/screens/final/`.
2. `docs/talkx/CHANGELOG_TALKX.md` consolidado por fase; `ARQUITETURA.md` revisado (tabelas, RPCs, functions, eventos, máquina de estados, heurísticas).
3. `docs/talkx/OPERACAO.md`: como agendar, pausar, tratar falha de conexão, rotacionar limites, ler alertas N8N.
4. Migrations: `check-migration-drift` limpo; `schema-manifest.json` atualizado; `db-live-guard` verde.
5. Tag `talkx-v1.0.0` no repo; release notes (GitHub Release) com prints.
6. Deploy final; smoke em produção com campanha real de 5 contatos internos.
7. Rebuild `graphify` e commit do `GRAPH_REPORT.md`.
8. Memória do projeto atualizada (`/areas/zapp-web-v2-hostinger-migration.md`: "Talk X v1.0 em produção <sha>"; `/areas/zapp-web-v3.md` se aplicável).
9. Backlog v1.1 em `docs/talkx/BACKLOG.md`: canal e-mail/SMS, IA generativa de templates, XLSX nativo, link público de relatório, multi-tenant.
10. PR `feat/talkx-f9-release → main`, squash, branch removido.
**Checklist**
- [ ] paridade 17/17
- [ ] tag `talkx-v1.0.0`
- [ ] smoke prod com campanha real
- [ ] docs (4 arquivos) completas
- [ ] memória atualizada

---

## Apêndice A — Mapa tela → etapas

| Tela | Etapas |
|---|---|
| 01 Visão geral | E13, E14, E17, E18, E21–E30 |
| 02 Segmentos biblioteca/detalhes | E31, E32, E36, E89, E92 |
| 03 Segmentos criar/editar | E33–E35, E37–E39 |
| 04 Templates biblioteca | E41, E42, E48, E89 |
| 05 Templates criar/editar | E43–E47, E49 |
| 06 Lista de supressão | E51–E59 |
| 07 Analytics | E21, E86, E89, E90, E92 (+ `TalkXAnalytics` recebe os mesmos blocos do relatório: E82–E84 reaproveitados no agregado) |
| 08 Nova campanha | E61–E64, E66, E68 |
| 09 Revisão final | E67 |
| 10 Campanha agendada | E69, E71 |
| 11 Monitor ao vivo | E02, E73–E76, E91, E92 |
| 12 Em andamento | E77, E78 |
| 13 Pausada/retomada | E79–E81 |
| 14 Relatório concluída | E82–E85, E90 |
| 15 Importação/CRM 360 | E94, E95 |
| 16 Ajuda | E96 |
| 17 Estados e modais | E19, E97 |

## Apêndice B — Métrica → fonte de dado (o que existe hoje vs. o que a etapa cria)

| Métrica no mock | Fonte real | Etapa que libera |
|---|---|---|
| Enviadas / Falhas / Progresso | `talkx_recipients.status`, `sent_at`; `talkx_campaigns.sent_count/failed_count` | existe |
| Entregues / Lidas | `talkx_recipients.delivered_at/read_at` via `external_id` + webhook | E87 |
| Respondidas / Taxa de resposta / Tempo médio | `talkx_recipients.replied_at` | E88 |
| Cliques / Conversões / Receita / ROI | `talkx_links`, `talkx_link_clicks`, `talkx_conversions` | E90 |
| Opt-outs (30 d) / Suprimidos / Manuais / LGPD | `talkx_blacklist_active.reason_code` | E51, E57 |
| Campanhas protegidas | `talkx_campaigns.respect_suppression` | E63 |
| Contatos alcançados | `count(distinct contact_id) where sent_at is not null` | existe |
| "vs. média" / Conversão média / Mais convertidos | `talkx_campaign_metrics` + `talkx_benchmarks()` | E89 |
| Fila por segmento / Segmentos pendentes | `talkx_campaign_segments` | E75 |
| Sugestão/Insights/Recomendações "da IA" | heurísticas reais (rótulo "Insights"); IA só com flag | E92 |
| Homens/Mulheres, RFM, "+32% engajamento", "Média de 8.1k" | **não existe fonte** | não implementar |

## Apêndice C — Comando de validação por etapa

```sh
cd /workspace/repos/Zapp_Web_V2 \
 && npx tsc --noEmit -p tsconfig.app.json \
 && npx eslint src/components/talkx src/hooks/integrations/useTalkX*.ts \
 && npx vitest run src/components/talkx src/hooks/integrations \
 && npm run build
```
