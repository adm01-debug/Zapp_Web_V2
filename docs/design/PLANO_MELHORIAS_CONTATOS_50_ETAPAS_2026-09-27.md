# PLANO — Redesign Contatos + remoção de import/export CSV (50 etapas)

> Criado em 2026-09-27 a pedido do Joaquim, a partir de auditoria real do código
> (commit base `e6f9378`). Escopo: (1) auditoria de tipografia do módulo Contatos,
> (2) remoção dos botões e da funcionalidade de importar/exportar CSV do sistema
> INTEIRO, (3) reordenação da barra de tipos de contato (excluindo Lead, Sicoob
> Gifts, Outros e o menu "mais"), (4) redução de ~30% dos botões Sincronizar e
> Novo Contato. **Plano aprovado = executar em 3 PRs sequenciais (A → B → C).**

## Alertas de colisão (verificados em 27/09)

- **PR #958** (`fix(multiplix)`) estava *melhorando* o CSV export do Multiplix
  (`MultiplixMonitor.tsx`) — exatamente um arquivo que este plano manda apagar.
  Resolver (mergear ou fechar) **antes** da Fase 2.
- **PR #936** mexe em testes de contatos (`EditContact`). Conferir sobreposição
  antes da PR B.

## Fatos do código (base do plano)

- Os tipos de contato são o array fixo `CONTACT_TYPES` em
  `src/utils/whatsappFileTypes.ts:191` — **não é enum no banco**; a coluna
  `contacts.contact_type` é `text` livre com default `'cliente'`, sem CHECK.
- O menu "mais" da barra é só um `slice(6)` em
  `src/components/contacts/ContactTypeTabs.tsx` (`VISIBLE_COUNT = 6`).
- Existem **12+ pontos de import/export CSV** espalhados por Contatos, TalkX,
  Multiplix, CRM 360, Dashboard/SLA, Admin e Inbox, cada um com implementação
  própria (não há lib compartilhada, nem papaparse/xlsx no package.json).
- O título "Contatos" usa `text-4xl` vindo de `PageHeader` variante `plain` —
  **só Contatos usa essa variante**, mudar é seguro.
- CI tem catraca de tipografia: `scripts/qa/medir-tipografia.cjs --check` contra
  `scripts/qa/tipografia-budget.json`.

---

## FASE 0 — Preparação e decisões (1–7)

1. **Resolver a colisão com a PR #958** (Multiplix CSV export): mergear ou fechar
   antes da Fase 2, para a remoção não desfazer/conflitar com trabalho paralelo.
2. **Query de censo no banco oficial** (`tnnnlkbymytvtqngbbqh`): contar contatos
   por `contact_type` para saber quantos registros estão como `lead`,
   `sicoob_gifts` e `outros` antes de tirar os chips da tela.
3. **Decisão de dado (Joaquim):** contatos existentes com tipos removidos serão
   remapeados para `cliente` (recomendado — some o tipo, não o contato) ou
   mantidos como estão (ficam invisíveis nos filtros, apenas em "Todos").
4. **Decisão do relatório TalkX (Joaquim):** a edge function `talkx-report`
   anexa um CSV no e-mail de relatório de campanha. Recomendação: **manter o
   e-mail e tirar só o anexo CSV** — remover a função inteira mexe em manifest,
   CI e no botão "Enviar Relatório".
5. **Estratégia de entrega: 3 PRs sequenciais**, não 1 gigante — (A) tipografia
   + botões, (B) barra de tipos + banco, (C) remoção CSV sistema-wide. Cada uma
   testável e reversível sozinha.
6. Criar branch nova por PR a partir de `main` atualizado, conferindo o último
   commit da branch antes de cada push.
7. Rodar `medir-tipografia.cjs` e capturar o baseline atual — a catraca de
   tipografia trava merge se os contadores mudarem sem atualizar o orçamento.

## FASE 1 — Auditoria e correção de tipografia (8–18)

*Diagnóstico: título `text-4xl` (36px) no `PageHeader` plain; números dos KPIs
também `text-4xl`; subtítulo `text-lg`. Três escalas gigantes competindo no topo
— é isso que deixa a página desproporcional.*

8. Reduzir o título da página: `text-4xl font-extrabold` → `text-2xl font-bold`
   em `src/components/layout/PageHeader.tsx` (variante `plain`).
9. Reduzir o subtítulo: `text-lg mt-2` → `text-sm mt-1`. Trocar o texto
   "Base de clientes e leads" → **"Base de contatos"** (`ContactsView.tsx:84`;
   também `ContactEmptyState.tsx:41`).
10. KPI cards (`src/components/contacts/ContactKpiCard.tsx`): valor `text-4xl` →
    `text-3xl`; tile do ícone 60px → 48px, ícone 26px → 20px; altura do card
    108px → 96px (ajustar skeleton em `ContactStatsCards.tsx`).
11. Rótulos dos KPIs: manter `text-sm`; padronizar delta e legenda
    ("vs. período anterior") em `text-xs` — hoje mistura `text-sm` e
    `text-[13px]` arbitrário.
12. Eliminar os tamanhos arbitrários `text-[13px]` (ContactTypeTabs,
    ContactKpiCard, ContactsTable) → `text-sm` ou `text-xs` da escala oficial.
13. Auditar os 62 usos de `text-3xs` (10px) no módulo: manter só em
    badges/contadores decorativos; texto informativo (datas, telefones, nomes)
    sobe para `text-xs` (12px).
14. Botões do header: `text-base` → `text-sm` (junto com a Fase 4).
15. Adotar as classes semânticas que já existem em `src/styles/utilities.css`
    (`.text-heading`, `.text-body-sm`, `.text-caption`) nos pontos tocados.
16. Consistência entre Cards/Lista/Tabela: nome do contato no mesmo tamanho nas
    três visualizações (hoje Card usa `text-lg` e Tabela `text-[13px]`).
17. Validar contraste WCAG AA (4.5:1) de tudo que mudou, nos modos claro E
    escuro (lição do bug do fundo preto de 25/09 — usar tokens, nunca cor fixa).
18. Regenerar `tipografia-budget.json` e garantir CI verde no check de
    tipografia.

## FASE 2 — Barra de tipos de contato (19–31)

19. Reordenar `CONTACT_TYPES` em `src/utils/whatsappFileTypes.ts` para:
    `cliente, fornecedor, transportadora, colaborador, prestador_servico,
    parceiro` — "Todos" é fixo à esquerda, fora do array.
20. **Excluir** do array: `lead`, `sicoob_gifts`, `outros`. O `type ContactType`
    derivado atualiza sozinho; o TypeScript aponta os usos órfãos.
21. `ContactTypeTabs.tsx`: remover o dropdown "mais" inteiro (linhas ~96–148) e
    o `slice`. Com 6 tipos + Todos, tudo cabe inline em 1366px.
22. Adicionar ícone para `transportadora` no mapa `CONTACT_TYPE_ICONS`
    (`ContactsTable.tsx:27-37`) — sugestão: `Truck` do lucide.
23. Limpar `contactTypeConfig.tsx` (entradas `lead`, `sicoob_gifts`, `outros`;
    conferir cor/ícone de `transportadora`) — esse config alimenta Card, Lista,
    Tabela, DetailPanel, QuickPeek, Analytics e o Inbox.
24. `ContactForm.tsx:167` (select de tipo) usa o mesmo array — atualiza sozinho,
    só validar.
25. `BulkActionsBar.tsx:186`: remover `lead` do menu de mudança de tipo em
    massa.
26. `ContactKanbanView.tsx:35`: remover a coluna "Leads" (o drag-and-drop grava
    `contact_type='lead'`) e reordenar o board pelos tipos novos.
27. **KPI "Leads" morre** (`ContactStatsCards.tsx:52-60` + `useContactsKpi.ts`
    linhas 42-44/55-57/61): substituir o 4º card por **"Fornecedores"**
    (recomendação — o contador por tipo já existe, custo zero).
28. Sanitizar presets salvos no localStorage (`contact-filter-presets`): preset
    com `type:'lead'` aplicaria aba vazia — limpar tipos desconhecidos ao
    carregar (`FilterPresets.tsx:28-38` / `useContactsViewState.ts:27`).
29. `inbox/contact-details/ContactHeaderSection.tsx:33`: remover `lead` do mapa
    de cores próprio.
30. **Banco (conforme decisão da etapa 3):** `UPDATE contacts SET
    contact_type='cliente' WHERE contact_type IN
    ('lead','sicoob_gifts','outros')` — DML com `RETURNING`/count de guarda,
    executado **depois** do merge do código. Fora de escopo: `sla_rules` e
    segmentos TalkX que citam `lead` (ver Próximos passos).
31. Atualizar testes que citam leads: `ContactStatsCards.test.tsx`,
    `useContactsKpi.test.ts` (contacts e hooks/crm).

## FASE 3 — Remoção de import/export CSV do sistema inteiro (32–44)

32. **Contatos:** apagar `ContactImportDialog.tsx` (arquivo inteiro); remover os
    botões Importar/Exportar CSV do header (`ContactsView.tsx:98-113`),
    `handleExportCSV` e `isImportOpen` de `useContactsViewState.ts`
    (linhas 19, 50-66, 89, 96), e os imports órfãos (`Upload`, `Download`,
    `format`, `ptBR`).
33. Remover o atalho de import dos empty-states
    (`ui/empty-states/contextConfigs.tsx:31,40` — já estão mortos).
34. **TalkX exports:** apagar `src/lib/talkxExport.ts`; remover botões/fluxos em
    `TalkXOverview.tsx` (139-148, 281), `TalkXLiveMonitor.tsx` (handleExport +
    botão "CSV"), `TalkXAnalytics.tsx` (export E75 + dica na linha 492).
35. **TalkX imports:** remover import da lista de supressão
    (`TalkXSuppression.tsx:124-159, 250-262` — manter a gestão manual da lista)
    e o import de templates JSON/CSV (`TalkXTemplates.tsx:51-54, 91-130,
    198-222`). Remover o stub morto "Importar contatos" do rail
    (`TalkXOverview.tsx:318` — no-op confirmado em `TalkXView.tsx:293`).
36. **Edge `talkx-report`:** conforme etapa 4 — tirar `escCsv`/`buildCsv` e o
    anexo (linhas 11, 30-35, 127-139, 179, 202-205), manter o e-mail HTML.
    Ajustar `index.test.ts` (Deno, roda no `ci.yml:95`) e a dica em
    `TalkXCampaignRunning.tsx:213`.
37. **Multiplix:** remover `exportRecipientsCsv` e o botão CSV de
    `MultiplixMonitor.tsx` (41-64, 149) — **pós-resolução da PR #958**.
38. **CRM 360:** remover `exportToCSV` de `crm360TabsConfig.ts:52-70` e o botão
    em `DataExplorerTable.tsx:14,95-97`.
39. **Dashboard/SLA:** apagar `src/hooks/system/useExportData.ts` (e o
    re-export em `hooks/system/index.ts:10`); remover botões "Exportar" de
    `AgentPerformancePanel.tsx` e `SLAAgentTable.tsx`; remover a prop morta
    `onExport` de `DashboardToolbar.tsx` /
    `ProgressiveDisclosureDashboard.tsx`. **Manter `useDownloadPermission`** —
    também controla download de mídia no inbox (`ImagePreview.tsx`,
    `AdminView.tsx:184`).
40. **Admin:** remover export CSV do `AIUsageDashboard`
    (`useAIUsageDashboard.ts:141-165`) e exports CSV **e PDF** do
    `AdminTelemetriaPage.tsx` (72-109, 132-133). Se o PDF sair, avaliar se
    `jspdf` ainda é usado (resta `MonitoringDiagnosticPanel.tsx:65-67`).
41. **Inbox:** remover "Exportar histórico" de
    `inbox/tabs/HistoryTab.tsx:74-88, 111-120`.
42. **Stubs já bloqueados (código morto):** apagar `utils/exportReport.ts`,
    `reports/ExportButton.tsx` (+ 3 montagens em SLADashboard,
    SLAHistoryDashboard, AdvancedReportsView), `ExportDropdown.tsx` órfão e a
    opção `csv` de `useScheduledReports.ts:188-192`. O card LGPD
    "Portabilidade — Bloqueada" fica (informativo de compliance).
43. Limpeza transversal: chaves `actions.export`/`actions.import` do i18n
    (`src/i18n/index.ts`), `featuresSectionsData.ts:137,369`,
    `docs/FUNCTIONALITIES_INVENTORY.md:186`; refresh do
    `scripts/ci/eslint-baseline.json` (cita arquivos deletados) e do
    `supabase/deployment-manifest.json`/`ci.yml` se a edge mudar.
    **Manter** os MIME `.csv` de anexo do WhatsApp/team-chat
    (`whatsappFileTypes.ts:51,64,136`, `TeamFileUploader.tsx:21`) — é anexo de
    conversa, não import/export.
44. Apagar/ajustar testes de export: `talkxExport.unit.test.ts`,
    `useExportData.test.tsx`, `ExportDropdownPermission.test.tsx`,
    `exportReport.test.ts`, `AIUsageDashboard.test.tsx`,
    `security-and-performance.test.ts:133-135`,
    `supabase/functions/talkx-report/index.test.ts`.

## FASE 4 — Botões Sincronizar e Novo Contato −30% (45–46)

45. Reduzir os dois botões: `h-12 px-5 text-base` + ícone 18px →
    **`h-9 px-4 text-sm` + ícone 16px** (48px → 36px de altura, ~30% em área
    visual). Sincronizar em `ContactsView.tsx:114-122`; Novo Contato em
    `ContactDialogs.tsx:69-77` (manter a sombra verde proporcional).
46. Aplicar a MESMA medida ao botão "CRM 360°" do mesmo header
    (`ContactsView.tsx:88-96`) e conferir o alinhamento com o título reduzido.

## FASE 5 — Validação e entrega (47–50)

47. Antes de cada push: lint, typecheck, testes unitários e build locais — os 7
    required checks da `main` precisam passar, incluindo a catraca de
    tipografia.
48. Screenshot-review nos dois temas (claro/escuro) das 3 visualizações +
    formulário de contato + Kanban, comparando com os prints de referência.
49. Merge das 3 PRs em sequência (Vercel deploya `main` sozinho); a mudança na
    edge `talkx-report` exige `workflow_dispatch` do `deploy-functions.yml` +
    aprovação no environment `producao-edge-functions` — **merge não coloca
    edge no ar**.
50. Verificação real em produção: abrir `?view=contacts`, confirmar barra na
    ordem pedida sem "mais", sem botões CSV, tamanhos novos; re-rodar a query
    de tipos confirmando zero `lead`/`sicoob_gifts`/`outros`; fechar com
    `db-live-guard` e `supabase-usage-guard` verdes.

---

## Decisões pendentes do Joaquim (com recomendação)

| Etapa | Decisão | Recomendação |
|---|---|---|
| 3 | Destino dos contatos `lead`/`sicoob_gifts`/`outros` no banco | Remapear para `cliente` |
| 4 | Edge `talkx-report` | Manter e-mail, tirar só o anexo CSV |
| 27 | 4º card de KPI (no lugar de "Leads") | "Fornecedores" |
| 40 | Export PDF do AdminTelemetria | Sai junto com o CSV |
| 1 | PR #958 (Multiplix CSV) | Mergear antes da Fase 2 |

## Fora de escopo (anotado, não executar junto)

- `settings/sla/sla-utils.ts:13` tem `CONTACT_TYPES` próprio com `lead` e `vip`
  (usado por `SLARuleFormDialog`); `sla_rules.contact_type` pode ter linhas
  `'lead'` no banco.
- `hooks/integrations/useTalkXSegments.ts:46`: regras de segmento com `'lead'`;
  segmentos salvos no banco podem referenciar o tipo extinto.
- "Lead Score"/"Origem do lead"/Bitrix `entityType 'lead'`/estágio "Novo Lead"
  do pipeline são conceitos de CRM, **não** o tipo de contato — não tocar.
