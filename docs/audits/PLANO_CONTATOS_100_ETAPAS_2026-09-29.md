# PLANO — Finalização do Módulo Contatos (100 etapas) — 2026-09-29

> Origem: [`AUDITORIA_MODULO_CONTATOS_2026-09-29.md`](./AUDITORIA_MODULO_CONTATOS_2026-09-29.md)
> (main @ `a0002bb2`, banco `tnnnlkbymytvtqngbbqh` lido ao vivo).
> **Sucede** `docs/design/PLANO_MELHORIAS_CONTATOS_50_ETAPAS_2026-09-27.md` (encerrado — as 24 etapas
> não fechadas dele estão absorvidas aqui, renumeradas) e fecha as pendências residuais de
> `docs/design/PLANO_REDESIGN_CONTATOS_NAVY_100_ETAPAS.md` (concluído em 08/09).
> Formato: `- [ ] **N.** ação — arquivo/camada — DoD`. Marque `[x]` só com evidência (SHA, query, run).
> Regras: CLAUDE.md §1 (DDL: arquivo → PR → merge → apply, ledger na mesma transação, versão via
> `reserve_migration_version`), §3 (escrita só por `GITHUB - MCP - FOREVER`, diff mínimo).
> Um PR por fase (F1 e F5 têm DDL → PR fica aberta para o Joaquim aprovar antes do apply).

## Status por fase

| Fase | Etapas | Tema | Estado |
|---|---|---|---|
| F0 | 1–6 | Decisões e preparação | ⏳ |
| F1 | 7–18 | P0/P1 no banco: exclusão, Sicoob, status, grants | ⏳ |
| F2 | 19–28 | Encerrar o conflito de planos (tipografia/geometria) | ⏳ |
| F3 | 29–40 | Resíduos da Fase 2 (tipos de contato) | ⏳ |
| F4 | 41–50 | Resíduos da Fase 3 (CSV) e limpeza transversal | ⏳ |
| F5 | 51–60 | Legados, telefones sintéticos e RPCs | ⏳ |
| F6 | 61–70 | Ligações erradas, props mortas, tokens de cor | 🟡 61–64, 66, 68–70 feitas; 65 vai com a F3 (`contactTypeConfig`); 67: 2 pares falham no token global `--success` |
| F7 | 71–78 | Código morto e dívida | 🟡 71–75, 77 feitas; 76 desce a baseline após a F4; 78 sem `graphify` no ambiente |
| F8 | 79–90 | Testes unitários e E2E | ⏳ |
| F9 | 91–95 | Documentação e inventário | ⏳ |
| F10 | 96–100 | Entrega, deploy e verificação | ⏳ |

---

## F0 — Decisões e preparação (1–6)

- [ ] **1.** Joaquim decide D1–D6 da auditoria (§6). Sem D1 e D2 a F1 não começa; sem D3 a F2 não começa. — decisão — DoD: as 6 linhas respondidas neste arquivo (coluna "Decisão").
- [ ] **2.** Medir uso real da Sicoob Bridge antes de D2: `SELECT count(*), max(created_at) FROM messages WHERE contact_id IN (SELECT id FROM contacts WHERE channel_type='internal_chat')` e últimas invocações da edge `sicoob-bridge` no dashboard Supabase (Functions → logs, 30 dias). — banco/logs — DoD: números registrados aqui.
- [ ] **3.** Listar PRs abertas tocando `src/components/contacts/**`, `src/hooks/crm/**`, `supabase/migrations/**contact**` (`github_list_pull_requests` + `github_list_pr_files`); em 29/09 nenhuma das 7 abertas toca o módulo. — GitHub — DoD: lista vazia ou colisões nomeadas.
- [ ] **4.** Reservar versões de migration para F1 (3 arquivos) e F5 (2 arquivos) com `SELECT supabase_migrations.reserve_migration_version('contatos-f1', '<motivo>')` — uma por arquivo, no turno em que o arquivo for criado. — banco — DoD: versões anotadas nas etapas 7, 11, 14, 52, 55.
- [ ] **5.** Baseline técnico: `npm run typecheck` (0), `node scripts/ci/lint-ratchet.mjs`, `node scripts/qa/medir-tipografia.cjs --check`, `npx vitest run src/components/contacts src/hooks/crm` (126/126). — CI local — DoD: 4 saídas verdes registradas.
- [ ] **6.** Inserir no topo de `docs/design/PLANO_MELHORIAS_CONTATOS_50_ETAPAS_2026-09-27.md` o callout de encerramento apontando para este plano (feito no mesmo commit desta auditoria). — docs — DoD: callout presente em `main`.

## F1 — P0/P1 no banco (7–18) — PR com DDL, aguarda aprovação

- [ ] **7.** Migration `delete_contact` (conforme D1). Recomendado: `ALTER TABLE contacts ADD COLUMN deleted_at timestamptz` + RPC `delete_contact(p_id uuid) RETURNS uuid` SECURITY DEFINER, `SET search_path=public`, permitida a `is_admin_or_supervisor(auth.uid())` OU dono (`assigned_to` = perfil do chamador), grava `deleted_at=now()` e `RETURNING id`; `REVOKE EXECUTE FROM anon`. Se D1 = hard delete: `CREATE POLICY contacts_delete_policy ON contacts FOR DELETE TO authenticated USING (is_admin_or_supervisor(auth.uid()))`. — `supabase/migrations/` — DoD: arquivo + registro no ledger (mesma transação) + `chk`/`RETURNING` não vazio.
- [ ] **8.** `search_contacts` e `contacts_count_by_type`: adicionar `AND c.deleted_at IS NULL` (mesma migration da 7, versão única). — `supabase/migrations/` — DoD: `pg_get_functiondef` mostra o filtro; contagem "Todos" não muda hoje (0 excluídos).
- [ ] **9.** Front: `useContactsCRUD.ts:203-220` passa a chamar `supabase.rpc('delete_contact', { p_id })` e trata `data === null`/erro como falha (nunca sucesso sem linha); `BulkActionsBar.tsx:106-117` idem em loop ou RPC em lote `delete_contacts(p_ids uuid[])` (mesma migration). — front — DoD: excluir contato de teste some da lista; excluir sem permissão mostra erro, não "sucesso".
- [ ] **10.** Índice parcial `idx_contacts_deleted_at ON contacts(deleted_at) WHERE deleted_at IS NOT NULL` + `search_contacts` usa `deleted_at IS NULL` (mesma migration). — DoD: `EXPLAIN` da busca sem seq scan extra.
- [ ] **11.** Sicoob Bridge (conforme D2). Se **desligar**: migration `DROP TRIGGER trg_sicoob_reply ON messages; DROP FUNCTION notify_sicoob_on_reply()`; apagar `supabase/functions/sicoob-bridge/`, `sicoob-bridge-reply/`, `src/components/admin/SicoobBridgeDashboard.tsx` (ou onde estiver), rota em `navigation.service.ts:143`, filtro `phone ilike 'sicoob-%'` em `useTalkXSegments.ts:155,169` e `countAudience`/`resolveAudience`; regenerar `supabase/deployment-manifest.json` (`generate-manifest.mjs`). Se **reativar**: migration `ALTER TABLE contacts DROP CONSTRAINT chk_contact_type; ADD CONSTRAINT chk_contact_type CHECK (contact_type IN (6 tipos, 'sicoob_gifts'))` e `ContactTypeTabs`/`CONTACT_TYPES` continuam com 6 (tipo interno oculto, documentado em `whatsappFileTypes.ts`). — DoD: `sicoob-bridge` invocada de teste responde 2xx (reativar) ou não existe mais no manifesto (desligar).
- [ ] **12.** `useTalkXSegments.ts:46`: opções de `contact_type` = `CONTACT_TYPES` importado de `whatsappFileTypes.ts` (nunca lista própria); remover `'lead'`/`'sicoob_gifts'`. — front — DoD: regra de segmento oferece exatamente os tipos canônicos.
- [ ] **13.** Auditar `talkx_segments.rules` e `sla_rules.contact_type` ao vivo após 12 (hoje 0 linhas com tipos extintos) e registrar. — banco — DoD: query com 0 linhas anotada.
- [ ] **14.** `conversation_status`: migration que **remove** `contacts_conversation_status_check` e redefine `chk_conversation_status_values` com o conjunto canônico do FSM (`enforce_conversation_status_transition` — ler `pg_get_functiondef` antes) — provavelmente `open|pending|waiting|resolved|closed|archived`; alinhar `enforce_conversation_status_transition` e o front (14 usos de `'pending'`, 3 de `'waiting'`). — `supabase/migrations/` + Inbox — DoD: `UPDATE contacts SET conversation_status='pending' WHERE id=<teste>` passa; FSM e front usam o mesmo enum em `src/types`.
- [ ] **15.** `REVOKE TRUNCATE, REFERENCES ON public.contacts FROM authenticated, anon; REVOKE SELECT ON public.contacts FROM anon` (mesma migration da 14 ou separada). — DoD: `information_schema.role_table_grants` sem essas linhas; front continua funcionando (policy SELECT já era `TO authenticated`).
- [ ] **16.** Levantar as demais tabelas com `TRUNCATE` para `authenticated` (`SELECT table_name FROM information_schema.role_table_grants WHERE grantee='authenticated' AND privilege_type='TRUNCATE' AND table_schema='public'`) e registrar em "Próximos passos" do PR — **não** corrigir aqui (fora do módulo). — DoD: lista anexada ao PR.
- [ ] **17.** `scripts/db-audit/`: fazer o catálogo (`schema-catalog.json`) rastrear CHECK constraints (`pg_constraint contype='c'` por tabela) para o guard offline pegar drift em `chk_contact_type`/status. — scripts — DoD: catálogo regenerado contém `chk_contact_type`; `db-guard.yml` verde.
- [ ] **18.** Apply em produção via `db_query` + ledger na mesma transação, na ordem 7/8/10 → 11 → 14/15, **depois** do merge do PR (regra 6); fechar com `supabase-usage-guard.mjs` `novas: 0` e paridade arquivos↔ledger. — DoD: 3–4 versões no ledger com `statements` completos; `db-live-guard` verde no push de `main`.

## F2 — Encerrar o conflito de planos (19–28) — PR só front/docs

- [ ] **19.** Registrar D3 no plano de 50 etapas (callout da etapa 6) e neste arquivo. — docs — DoD: uma linha "D3 = Navy" ou "D3 = reduzir".
- [ ] **20.** Se D3 = Navy (recomendado): manter 38/48/108 e **reverter o afrouxamento do guard** de outra forma — mover o `text-[38px]` de `PageHeader.tsx:147` para um token nomeado `text-page-title` em `tailwind.config.ts` (mesmo padrão de `kpi-value`), e devolver `violacoes.acima16px` para teto **1** em `scripts/qa/tipografia-budget.json`. Se D3 = reduzir: reaplicar `481ede55` (título `text-2xl`, subtítulo `text-sm`, KPI 96/48/20, botões `h-9 text-sm`) e apagar o token `kpi-value`. — DoD: `medir-tipografia.cjs --check` exit 0 **com** teto 1.
- [ ] **21.** Fechar a brecha do guard: `scripts/qa/medir-tipografia.cjs` passa a contar tamanhos > 16px também quando vêm de tokens nomeados da escala (`tailwind.config.ts fontSize` com valor > 1rem) e a lista de exceções vira explícita no budget (`allowAbove16: ['page-title','kpi-value']`). — scripts — DoD: criar um `text-huge` de 40px sem exceção falha o check.
- [ ] **22.** `tipografia-budget.json`: `tsxFontSizeInline` teto 2 → 1 (live é 1); `"commit"` = SHA real do `git rev-parse HEAD` no momento da geração. — DoD: check verde; SHA existe em `git log`.
- [ ] **23.** Subtítulo `ContactsView.tsx:83`: "Base de clientes e leads" → **"Base de contatos (N)"** — independe de D3, `lead` não é mais tipo. — DoD: texto novo; `ContactEmptyState.tsx:41` já coerente.
- [ ] **24.** Delta do KPI `ContactKpiCard.tsx:138`: `text-sm` → `text-xs` (etapa 11 do plano antigo, única parte aberta). — DoD: classe trocada; `ContactStatsCards.test.tsx` verde.
- [ ] **25.** Auditoria dos 59 `text-3xs` do módulo: manter só em badges/contadores; subir para `text-xs` as 14 ocorrências informativas listadas na auditoria §2 (etapa 13: `ContactNotes.tsx:208-209`, `ContactActivityTimeline.tsx:192`, `ContactMapView.tsx:152`, `ContactKanbanView.tsx:232`, `ContactBirthdayPanel.tsx:104`*, `ContactPurchaseHistory.tsx:129,143`, `ContactDetailPanel.tsx:195,203`, `ContactQuickPeek.tsx:115`*, `ContactSearchWithSuggestions.tsx:128,146`, `ContactForm.tsx:360`; * = órfão, some na F7). — DoD: `grep -c text-3xs src/components/contacts` ≤ 45 e budget `escala.3xs` atualizado sem afrouxar outro contador.
- [ ] **26.** Adotar `.text-caption`/`.text-body-sm`/`.text-heading` de `src/styles/utilities.css:23-56` nos pontos tocados na 25 (não em varredura geral). — DoD: ≥ 10 usos no módulo.
- [ ] **27.** Peso do nome na tabela: `ContactsTable.tsx:171` `font-medium` → `font-semibold` (igual a Card e Lista). — DoD: 3 vistas iguais.
- [ ] **28.** Medir em browser (Playwright local contra `npm run preview`, receita do Apêndice E do plano Navy) a barra de 7 abas em 1366px de conteúdo: cabe sem scroll? Registrar número. — QA — DoD: `scrollWidth` da `[role=tablist]` anotado aqui.

## F3 — Resíduos da Fase 2, tipos de contato (29–40) — mesma PR da F2

- [ ] **29.** `ContactsTable.tsx:27-36`: tipar `CONTACT_TYPE_ICONS` como `Record<ContactType, ReactNode>` e remover `lead`/`outros` + imports `Star`/`MoreHorizontal`. — DoD: typecheck aponta qualquer chave fora dos 6.
- [ ] **30.** Fonte única de ícone/cor por tipo: `contactTypeConfig.tsx` exporta `iconNode`/cores e `ContactsTable`, `ContactKanbanView.tsx:34-41`, `ContactHeaderSection.tsx:26-33` consomem de lá (apagar os 3 mapas locais). — DoD: `grep -rn "transportadora:" src/components` só em `contactTypeConfig.tsx` e `whatsappFileTypes.ts`.
- [ ] **31.** `ContactKanbanView.tsx` colunas na ordem de `CONTACT_TYPES` (derivar do array, não literal). — DoD: ordem = cliente, fornecedor, transportadora, colaborador, prestador_servico, parceiro.
- [ ] **32.** `ContactHeaderSection.tsx` (inbox): cor para todos os 6 tipos via etapa 30; sem fallback `bg-muted` para tipo canônico. — DoD: badge de transportadora/prestador/parceiro colorido no painel do inbox.
- [ ] **33.** Presets salvos: `FilterPresets.tsx:44` filtra por `isValidPreset` **e** por `VALID_TAB_TYPES`; preset com tipo extinto é removido do `localStorage` no load (não só ignorado no apply), com `toast.info` uma vez. — DoD: preset `type:'lead'` injetado some após reload.
- [ ] **34.** Corrigir indentação de `useContactsViewState.ts:27-30` (cosmético, mesmo commit). — DoD: prettier limpo.
- [ ] **35.** `contacts/__tests__/useContactsKpi.test.ts`: apagar (duplicata de `hooks/crm/__tests__/useContactsKpi.test.ts`); se algum caso for único, mover. — DoD: 1 arquivo, 0 fixture `'lead'`.
- [ ] **36.** Teste unitário de `ContactTypeTabs` (render 7 abas na ordem, badge só com count>0 exceto Todos, `toLocaleString('pt-BR')`). — DoD: arquivo em `__tests__`, verde.
- [ ] **37.** Teste unitário de `contactTypeConfig` × `CONTACT_TYPES`: `Object.keys(CONTACT_TYPE_CONFIG)` ≡ `CONTACT_TYPES.map(t=>t.value)` (pega drift entre os dois). — DoD: verde; falha ao adicionar tipo só em um lado.
- [ ] **38.** Migration `20260928180000` + `whatsappFileTypes.ts:191`: comentário cruzado já existe; adicionar teste de contrato offline em `scripts/db-audit/` que compara o array TS com o CHECK do catálogo (após etapa 17). — DoD: guard falha se um lado mudar sozinho.
- [ ] **39.** Abas com 1 contato-seed: decidir com o Joaquim se os 5 contatos de teste (1 por tipo, criados 28/09) ficam em produção; se não, `delete_contact` neles após F1. — DoD: decisão + ids.
- [ ] **40.** `docs/FUNCTIONALITIES_INVENTORY.md` linha da tabela `contacts`: 38 colunas reais + CHECKs + nota "tipos canônicos: 6 (CHECK `chk_contact_type`)". — DoD: linha atualizada (também cobre §3.9).

## F4 — Resíduos da Fase 3 (CSV) e limpeza transversal (41–50) — PR própria

- [ ] **41.** `src/ui/empty-states/contextConfigs.tsx:29,37`: remover "…ou importe contatos" / "…ou importe de uma planilha". — DoD: 0 hits `importe`.
- [ ] **42.** `src/hooks/chat/useScheduledReports.ts:191`: remover `{ value: 'csv' }` de `FORMATS`; `ScheduledReportsManager.tsx:13` comentário; conferir no banco `SELECT count(*) FROM scheduled_report_configs WHERE format='csv'` e migrar para `pdf` se houver. — DoD: Select sem CSV; 0 linhas `csv`.
- [ ] **43.** `DepartmentAuditView.tsx:20-62` (team-chat): decisão explícita — remover o export CSV (coerente com "sistema inteiro") ou registrar exceção nomeada no plano de 50. Recomendado: remover. — DoD: uma das duas, com linha aqui.
- [ ] **44.** `src/components/docs/featuresSectionsData.ts:89,134-137`: remover "Importação/Exportação de contatos", seção "Relatórios e Exportação" morta e a linha em branco residual. — DoD: 0 hits `xport` na seção de contatos.
- [ ] **45.** `docs/FUNCTIONALITIES_INVENTORY.md:186-187`: remover "Exportar PDF (jsPDF)"/"Exportar Excel (xlsx)" ou trocar por "PDF de diagnóstico (MonitoringDiagnosticPanel, jspdf)"; `xlsx` não existe no projeto. — DoD: inventário não cita lib ausente.
- [ ] **46.** `package.json:76` remover `jspdf-autotable` (0 imports); `bun install` regenera lockfile. — DoD: build verde; `grep -rn jspdf-autotable src` = 0.
- [ ] **47.** `scripts/ci/eslint-baseline.json`: refrescar pelo procedimento de `scripts/ci/README.md` — remove `ContactImportDialog.tsx` e `useTags.test.tsx`; `lint-ratchet` continua `novas: 0`. — DoD: baseline sem path inexistente (node one-liner = 0).
- [ ] **48.** `docs/COMPLETE_SYSTEM_FEATURES.md:208-222`: reescrever a seção "Gestão de Contatos" (sem `contact_tags`, `DataImporter`, `ExportDropdown`, `DuplicateButton`, sem "lead"); linhas 701-702 idem. — DoD: seção bate com o código.
- [ ] **49.** `docs/design/PLANO_MELHORIAS_CONTATOS_50_ETAPAS_2026-09-27.md`: marcar `[x]` nas 26 etapas que a auditoria deu ✅ (com "ver auditoria 29/09") — só para o histórico ficar legível. — DoD: checkboxes coerentes com a tabela da auditoria.
- [ ] **50.** `DashboardTopBar.tsx:12-13`: comentário que cita `ContactsTopActions` (inexistente) → apontar para `open-command-palette` em `GlobalKeyboardProvider`. — DoD: 0 hits `ContactsTopActions` no repo.

## F5 — Legados, telefones sintéticos e RPCs (51–60) — PR com DDL (conforme D4)

- [ ] **51.** Se D4 = esconder: `search_contacts(... include_legacy boolean DEFAULT false)` e `contacts_count_by_type(include_legacy boolean DEFAULT false)` filtrando `is_lid_legacy = false AND phone ~ '^[0-9]{10,15}$'` quando `false`. Mesma migration da 7? **Não** — versão própria (reservada na etapa 4). — DoD: `pg_get_functiondef` com o parâmetro; contagem "Todos" cai de 3.104 para ≈2.498.
- [ ] **52.** Índice trigram em `name` (`idx_contacts_name_trgm gin (name gin_trgm_ops)`) e em `phone` — `CREATE INDEX` simples (regra 5). — DoD: `EXPLAIN` da busca por nome usa o índice.
- [ ] **53.** `useContactsSearch.ts` e `ContactService.searchContacts/getCountsByType` passam `include_legacy` a partir de um toggle `showLegacy` em `useContactsViewState` (persistido em `localStorage` `contact-show-legacy`). — DoD: toggle na toolbar; KPI Total = badge Todos em ambos os estados.
- [ ] **54.** `useContactsKpi.ts`: receber `includeLegacy` e aplicar o mesmo critério (hoje `filterLidLegacy=false` hardcoded em `ContactStatsCards.tsx:11`). — DoD: KPI Total == badge Todos com toggle off e on.
- [ ] **55.** `get_last_message_dates`: confirmar que respeita ACL (é SECURITY DEFINER em `20260924221209`) e que aceita até 50 ids por chamada; adicionar índice `messages(contact_id, created_at DESC)` se `EXPLAIN` mostrar seq scan. — DoD: EXPLAIN anotado; migration só se necessário.
- [ ] **56.** Sparkline "Empresas": trocar `seriesEmpresasWeekly12` por série de **empresas distintas acumuladas** por semana (ou omitir sparkline até D5). — `useContactsKpi.ts:60` — DoD: série e valor medem a mesma grandeza; teste do `aggregateKpi` cobre.
- [ ] **57.** Reintroduzir `deltaTotalPct` honesto: comparar `count(created_at < now()-30d)` real (já disponível nas rows) em vez do proxy `max(total-novos30,1)`. Guarda `MIN_PREV` continua. — DoD: teste com dataset sintético de 60 dias dá o % correto.
- [ ] **58.** Apply das migrations 51/52 (+55) após merge, ledger na mesma transação. — DoD: `db-live-guard` verde.
- [ ] **59.** Regenerar `supabase/schema-catalog.json`, `types.ts` (types-sync) e manifesto se assinatura de RPC mudou. — DoD: `db-guard.yml` verde na PR de front.
- [ ] **60.** Registrar em `CLAUDE.md` (seção nova, 5 linhas) o critério "contato visível em Contatos = `is_lid_legacy=false` e telefone numérico; RPCs recebem `include_legacy`". — DoD: linha em `CLAUDE.md`.

## F6 — Ligações erradas, props mortas, tokens de cor (61–70) — PR própria

- [x] **61.** "Conversar" vai ao chat: `ContactContentArea.tsx:90,104,117,137` passam `onOpenChat={openContactChat}` (de `useContactsCRUD`), não `onContactClick`; clique no corpo do card continua abrindo o painel. — DoD: botão do card leva ao inbox com o contato aberto (evento `open-contact-chat`). — ✅ `ContactContentArea` recebe `onOpenChat={openContactChat}` e repassa `onOpenDetails={onContactClick}` (corpo) / `onOpenChat` (botão) a card, lista, lista agrupada e tabela; teste `ContactOpenChat.test.tsx`.
- [x] **62.** `ContactCard.tsx:21-23`: consumir `companyLogo` (renderizar `CompanyLogo` ao lado da empresa quando existir) ou remover a prop de `ContactContentArea.tsx:92` e do tipo. Recomendado: remover até D5. — DoD: sem prop morta. — ✅ `companyLogo` removida de `ContactItemProps` e dos chamadores (D5 fora do escopo).
- [x] **63.** `ContactCard.tsx:140` e-mail `text-[hsl(215_30%_78%)]` → `text-muted-foreground` (token, vale nos 2 temas). — DoD: contraste ≥ 4.5:1 no light (calcular com o script de contraste de `c7bd695c`). — ✅ e-mail em `text-muted-foreground`: 5.08:1 (claro) / 9.32:1 (escuro) via `scripts/qa/contraste-contatos.mjs`.
- [x] **64.** `text-white` → `text-primary-foreground`/`text-success-foreground` em `ContactTypeTabs.tsx:24`, `ContactToolbar.tsx:96`, `ContactViewSwitcher.tsx:67,83`, `ContactDialogs.tsx:72,146`, `ContactEmptyState.tsx:45`. — DoD: 0 `text-white` no módulo. — ✅ 0 `text-white` em `src/components/contacts` (`text-primary-foreground`/`text-success-foreground`).
- [ ] **65.** `contactTypeConfig.tsx:26-67` badges: as 6 receitas `rgba()`/`hsl(…80%)` ganham variante `dark:` ou passam a tokens `--type-<x>` em `tokens.css` definidos por tema (mesma lição do `--inbox-panel-bg`). — DoD: badge legível no light (contraste ≥ 4.5:1) e no dark (mantém ΔE do CP8). — ⏳ fica com a F3 (PR #1353 mexe em `contactTypeConfig.tsx`).
- [x] **66.** `ContactForm.tsx:228,253`, `ContactMapView.tsx:33-37`: cores fixas → tokens (`text-warning`, `--kpi-tile-*`). — DoD: 0 `hsl(` literal fora de `contactTypeConfig`/tokens. — ✅ `ContactForm` aviso em `text-foreground` + ícone `text-warning` sobre `bg-warning/10`; `ContactMapView` com fundos `bg-<token>/15` e ícone `text-foreground`. `hsl(` literal restante: `contactTypeConfig`/`ContactTypeTabs`/`ContactKanbanView` (F3, PR #1353) e `ContactEngagementScore` (já tem variante `dark:` e contraste documentado).
- [ ] **67.** Validação WCAG AA dos itens 63–66 nos 2 temas com script reprodutível em `scripts/qa/` (não em `/workspace/qa`). — DoD: tabela de contraste no PR, todos ≥ 4.5:1. — 🟡 `scripts/qa/contraste-contatos.mjs` (claro/escuro, `--check`): 18 de 20 pares ≥ 4.5:1; `text-success-foreground` sobre `bg-success` dá 2.60/2.30:1 — exige escurecer `--success` em `tokens.css` (afeta o app todo, fora desta PR).
- [x] **68.** Permissões no front: botões Excluir (card, painel, bulk) e "Alterar tipo em massa" só para `is_admin_or_supervisor` (via `usePermissions`/`useUserRole` existentes) — espelha a RPC da etapa 7. — DoD: agente comum não vê "Excluir"; RLS continua sendo a barreira real. — ✅ Excluir já segue `can_delete` do servidor (#1187); "Tipo" em massa só com `canChangeType={isSupervisor}` (`useUserRole`); teste `BulkActionsBarPermissions.test.tsx`.
- [x] **69.** `ContactActionButtons.tsx:138` (inbox) videochamada stub: esconder o botão atrás de feature flag `video_call` desligada, em vez de `toast('Em breve')`. — DoD: botão ausente por padrão. — ✅ tile de vídeo só com `useFeatureFlag('video_call', false)`; testes no `ContactActionButtons.test.tsx`.
- [x] **70.** `ContactDetailPanel.tsx:41` `onEdit: (contact: any)` → `Contact`; `useContactIntelligence.ts` `any` → tipo real; `StoryViewer.tsx:96` `window as any` → `declare global`. — DoD: 0 `any` explícito no módulo (excl. `ContactMergePanel`, que morre na F7). — ✅ `ContactDetailPanel` genérico (`onEdit: (contact: T)`), `risk_factors: Record<string, unknown>`, `Window.__activeInstance__` em `vite-env.d.ts`, RPCs `delete_contact(s)` sem `as any` (já estão no `types.ts`).

## F7 — Código morto e dívida (71–78) — mesma PR da F6

- [x] **71.** Apagar `ContactBirthdayPanel.tsx`, `ContactMergePanel.tsx`, `ContactPagination.tsx`, `ContactQuickPeek.tsx`, `CustomFieldsSection.tsx`, `InlineEditCell.tsx` (0 importadores; D6). — DoD: build verde; `git log` guarda. — ✅ 5 arquivos apagados; `ContactMergePanel.tsx` já não existia. `tsc -b` e build verdes.
- [x] **72.** Se `CustomFieldsSection` sair, decidir o destino de `contact_custom_fields` (0 linhas, 4 policies, `ContactService.fetchCustomFields/upsertCustomField/deleteCustomField:127-140`): manter tabela e service (barato) ou anotar remoção no plano Banco Único. Recomendado: manter, remover só o service morto. — DoD: decisão + código coerente. — ✅ mantidos tabela `contact_custom_fields` e `useContactCustomFields`/service (ainda têm consumidores).
- [x] **73.** `ContactService` (`contact.service.ts`): apagar métodos sem consumidor após 71 (verificar `fetchEnrichedData`, `fetchAITags`, `fetchSLA`, `fetchStats` com `grep -rn "ContactService\.<m>"`). — DoD: cada método restante tem ≥ 1 chamador. — ✅ `ContactService.update` removido (0 chamadores); os demais métodos têm ≥ 1 chamador.
- [x] **74.** `useContactsKpi` e `ContactKpiCard`: `data-testid` (`kpi-card`, `kpi-tile`, `kpi-value`, `tab-count`, `contact-card`, `contact-avatar`, `view-switcher`) que o Apêndice E do Navy pedia e que o E2E da F8 vai usar — conferir quais já existem. — DoD: lista de testids presente. — ✅ `view-switcher` adicionado; `kpi-card`, `kpi-tile`, `kpi-value`, `tab-count`, `contact-card`, `contact-avatar` já existiam.
- [x] **75.** `ContactStatsCards.test.tsx`: afirmar geometria (classe `h-[108px]`, tile 60, `text-kpi-value`) conforme D3 — trava o flip 96↔108. — DoD: teste falha se alguém mudar a altura. — ✅ teste de geometria em `ContactStatsCards.test.tsx` (108px / 60px / `text-kpi-value`, D3 = Navy).
- [ ] **76.** Lint-ratchet: rodar após 71–73; se a remoção de arquivos zerar violações legadas, **descer** a baseline (nunca só manter). — DoD: `baseline` ≤ anterior. — 🟡 ratchet `novas=0` (atual 942 < 971); a baseline desce depois do merge da F4 (PR #1354 também reescreve o arquivo).
- [x] **77.** Bundle: `node scripts/ci/bundle-budget.mjs` antes/depois da F7; registrar Δ do chunk `ContactsView-*.js`. — DoD: Δ ≤ 0 KB gzip. — ✅ `ContactsView-*.js` 38 269 → 38 154 B gzip (Δ −115 B); JS inicial 332.6 KB (budget 340).
- [ ] **78.** `graphify update .` e conferir que os 6 órfãos sumiram do grafo. — DoD: `GRAPH_REPORT.md` com commit = HEAD. — ⏳ `graphify` não está instalado no ambiente e `graphify-out/` não existe no repo.

## F8 — Testes unitários e E2E (79–90) — PR própria (só testes + fixtures)

- [ ] **79.** Unit `useContactsViewState`: Ctrl+A ignora inputs, Ctrl+N abre form, Esc fecha painel, sanitização de aba. — DoD: verde.
- [ ] **80.** Unit `useContactsCRUD`: add/edit/delete chamam RPC/insert corretos, invalidam `contacts-kpi`, delete sem linha → erro (cobre a regressão P0). — DoD: verde; mock do `rpc` devolvendo `null` falha o fluxo.
- [ ] **81.** Unit `BulkActionsBar`: tag/assign/type/delete; delete em massa usa RPC. — DoD: verde.
- [ ] **82.** Unit `ContactToolbar` + `ContactViewSwitcher`: 5 sorts, 6 vistas, colunas 3–6, Comparar só com ≥2. — DoD: verde.
- [ ] **83.** Unit `FilterPresets`: preset inválido removido no load (etapa 33). — DoD: verde.
- [ ] **84.** E2E `e2e/contacts-view.spec.ts` (projeto `chromium-authenticated`): abre `?view=contacts`, KPI Total == badge Todos, 7 abas na ordem, busca "a" retorna, limpar, aba Cliente filtra, sort "Mais recentes", Filtros abre/fecha, Filtros Salvos abre. — DoD: verde no `e2e-logado.yml`.
- [ ] **85.** E2E `e2e/contacts-selection.spec.ts`: selecionar todos → BulkActionsBar; Comparar (2); Mesclar dialog abre (não confirmar); Tags em massa dialog abre. — DoD: verde.
- [ ] **86.** E2E `e2e/contacts-views.spec.ts`: Cards/Lista/Tabela/Pipeline/Mapa/Analytics renderizam sem erro de console; Colunas 3; Agrupar por empresa; página 2 e volta. — DoD: verde, 0 console errors.
- [ ] **87.** E2E `e2e/contacts-crud.spec.ts` com fixture própria (prefixo `[E2E]`, padrão de `e2e/fixtures/e2e-contact.ts`): criar → editar → **excluir** → confirmar que sumiu da lista e do banco. — DoD: verde; é o teste que teria pegado o P0.
- [ ] **88.** E2E `e2e/contacts-detail.spec.ts`: abrir painel, Esc fecha, "Conversar" leva ao inbox com o contato (etapa 61). — DoD: verde.
- [ ] **89.** E2E light mode + mobile 390px em `contacts-view.spec.ts` (`scrollWidth <= innerWidth`, header sem sobreposição — lição do CP11). — DoD: verde nos 2 viewports.
- [ ] **90.** Screenshot de referência (light/dark) das 3 vistas em `e2e/__screenshots__/contacts-*.png` com `toHaveScreenshot` tolerância 0,2% (o que a etapa 48 do plano antigo nunca entregou). — DoD: PNGs versionados; CI compara.

## F9 — Documentação e inventário (91–95) — junto da PR da F8

- [ ] **91.** `docs/FUNCTIONALITIES_INVENTORY.md`: nova seção "Gestão de Contatos" (componentes reais de `src/components/contacts/` após F7, hooks `useContactsSearch/useContactsKpi/useContactsCRUD/useContactsViewState`, RPCs, atalhos, vistas, permissões) + entrada no índice. — DoD: seção existe e bate com `ls`.
- [ ] **92.** `docs/FUNCTIONALITIES_INVENTORY.md` §17: tabela `contacts` com 38 colunas, 5 CHECKs, 9 triggers, 16(+3) índices, `deleted_at` se D1. — DoD: linha completa.
- [ ] **93.** `docs/design/REDESIGN_CONTATOS_STATUS.md`: adicionar bloco "Pós-encerramento (29/09)" com o estado das pendências (§1 da auditoria) — 5 resolvidas, 1 pendente (`is_lid_legacy` → F5). — DoD: bloco presente.
- [ ] **94.** `CLAUDE.md`: 6 linhas em "Contatos" — tipos canônicos (6 + decisão Sicoob), exclusão via RPC, `include_legacy`, onde vive a verdade de ícone/cor (`contactTypeConfig.tsx`). — DoD: seção presente.
- [ ] **95.** Runbook curto `docs/runbooks/contatos-exclusao-e-legados.md`: como restaurar um contato soft-deleted (`UPDATE … SET deleted_at=NULL`), como reclassificar um `is_lid_legacy`. — DoD: arquivo com 2 receitas SQL testadas.

## F10 — Entrega, deploy e verificação (96–100)

- [ ] **96.** Ordem de merge: F1 (após approve + apply) → F2+F3 → F4 → F5 (após apply) → F6+F7 → F8+F9. Cada PR: 6 required checks verdes + `strict=false` conferido (CLAUDE.md 27/09). — DoD: 6 SHAs de merge aqui.
- [ ] **97.** Edge functions: se a F1 apagar/alterar `sicoob-bridge*` ou `talkx-*`, disparar `deploy-functions.yml` (`workflow_dispatch`) + aprovação em `producao-edge-functions`; **merge não deploya edge**. — DoD: run id + `success`.
- [ ] **98.** Verificação em produção (Playwright contra `https://zapp-web-v2.vercel.app/?view=contacts`, usuário QA): excluir contato `[E2E]` some do banco (`SELECT deleted_at FROM contacts WHERE id=…`); Total == Todos; toggle legados muda de 3.104 para ≈2.498; "Conversar" abre o chat. — DoD: 4 evidências (query + screenshot) aqui.
- [ ] **99.** Guards pós-merge: `db-live-guard` verde no push de `main`; `supabase-usage-guard.mjs` `novas: 0`; paridade arquivos↔ledger (count + md5). — DoD: 3 saídas.
- [ ] **100.** Fechamento: preencher a tabela "Status por fase" acima, apagar as 6 branches mergeadas, e escrever `docs/audits/FECHAMENTO_PLANO_CONTATOS_2026-XX-XX.md` com o diff entre esta auditoria e o estado final (mesmo formato do §0). Só então este plano vira "concluído". — DoD: arquivo de fechamento em `main`.

---

## Decisões (preencher)

| # | Decisão | Resposta | Data |
|---|---|---|---|
| D1 | Exclusão: soft-delete via RPC (rec.) ou policy DELETE | | |
| D2 | Sicoob Bridge: desligar (rec., após etapa 2) ou reativar tipo | | |
| D3 | Tipografia/geometria: Navy 38/48/108 (rec.) ou reduzir | | |
| D4 | Legados/sintéticos: esconder por padrão com toggle (rec.) | | |
| D5 | Enriquecimento via CRM externo (leitura) — fora deste plano, entra no Banco Único | | |
| D6 | Apagar os 6 componentes órfãos (rec.) | | |

## Mapa de origem (para rastreabilidade)

| Etapa antiga (50) não fechada | Etapa aqui |
|---|---|
| 8, 9, 10, 14, 45, 46 (revertidas) | 19–20, 23 |
| 11 | 24 |
| 13 | 25 |
| 15 | 26 |
| 17 | 63–67 |
| 18 | 20–22 |
| 22 | 29 |
| 26 | 30–31 |
| 28 | 33 |
| 29 | 32 |
| 33 | 41 |
| 42 | 42 |
| 43 | 44–47 |
| 48 | 90 |
| 50 | 98–99 |
| Navy pendência `is_lid_legacy` | 51–54 |
| Navy contrato "Excluir" | 7–9, 80, 87 |
