# Auditoria exaustiva — Módulo Contatos (2026-09-29)

> Base auditada: `main` @ `a0002bb2` (HEAD em 29/09 10:45 UTC). Banco oficial `tnnnlkbymytvtqngbbqh`
> lido ao vivo via `SUPABASE - ZAPP WEB V2 - MCP` (`db_query`, somente leitura).
> Método: 4 auditores paralelos (Fase 1+4, Fase 2, Fase 3+5, contrato funcional + pendências Navy),
> cada etapa dos planos conferida contra o código real com evidência `arquivo:linha`; banco conferido
> com `pg_policies`, `pg_constraint`, `pg_trigger`, `pg_indexes`, `pg_get_functiondef` e censo de dados.
> Nada foi editado no código durante a auditoria. `npm run typecheck` = 0 erros;
> `vitest run src/components/contacts src/hooks/crm` = 126/126.

**Sucessor executável:** [`PLANO_CONTATOS_100_ETAPAS_2026-09-29.md`](./PLANO_CONTATOS_100_ETAPAS_2026-09-29.md).

---

## 0. Resumo executivo

| Plano | Etapas | ✅ | 🟡 parcial | 🔄 substituída/decisão contrária | ❌ não feita | Sem evidência |
|---|---|---|---|---|---|---|
| Navy Premium 100 etapas (06/09) | 100 | 87 + 5 equivalentes + 5 decisões conscientes | — | — | 0 | — (ledger `REDESIGN_CONTATOS_STATUS.md` completo; PRs #261/#275–#279 mergeadas) |
| Melhorias 50 etapas (27/09) — Fase 0 (1–7) | 7 | 4 | — | 1 (PR #958 mergeada em 27/09) | — | 2 (etapas 2, 7 sem registro) |
| — Fase 1 tipografia (8–18) | 11 | 2 (12, 16) | 2 (11, 18) | 4 (8, 9, 10, 14 — **revertidas** por #1131/#1134/`e14ddeab`) | 3 (13, 15, 17) | — |
| — Fase 2 tipos de contato (19–31) | 13 | 9 | 2 (26, 28) | 2 (22, 30) | 0 | — |
| — Fase 3 remoção CSV (32–44) | 13 | 10 | 3 (33, 42, 43) | 0 | 0 | — |
| — Fase 4 botões −30% (45–46) | 2 | 0 | 0 | 2 (**revertidas** por #1131) | 0 | — |
| — Fase 5 validação (47–50) | 4 | 1 (49) | 0 | 0 | 1 (48) | 2 (47, 50) |
| **Total 50 etapas** | **50** | **26** | **7** | **9** | **4** | **4** |

**Achados fora dos planos que mudam prioridade (ver §3):**

1. **P0 — "Excluir contato" nunca funcionou pela UI.** `public.contacts` tem RLS ligada e **nenhuma policy de DELETE** (só INSERT/SELECT/UPDATE, confirmado em `pg_policies` e em todo o histórico de `supabase/migrations`). O front faz `supabase.from('contacts').delete()` e mostra "Contato excluído com sucesso!" — o PostgREST devolve 0 linhas sem erro. Vale para o item do card, o painel de detalhes e a exclusão em massa.
2. **P0 — O CHECK `chk_contact_type` (28/09) quebrou a Sicoob Bridge.** A edge `sicoob-bridge` insere `contact_type: 'sicoob_gifts'`, agora rejeitado pelo banco; `sicoob-bridge-reply` e o trigger `notify_sicoob_on_reply` só reagem a esse tipo. Ninguém decidiu desligar a bridge — foi efeito colateral.
3. **P1 — Dois planos ativos e contraditórios.** O plano de 50 etapas manda *reduzir* título/botões/KPIs; o plano Navy manda 38px/48px/108px. A PR #970 seguiu o primeiro; #1131, #1134 e `e14ddeab` (28/09) reverteram citando o segundo. O plano de 50 não registra a decisão; o guard de tipografia foi afrouxado (`acima16px` 1→2) e contornado por token (`text-kpi-value`).
4. **P1 — Dois CHECKs conflitantes em `contacts.conversation_status`** (`contacts_conversation_status_check`: open/waiting/resolved/archived; `chk_conversation_status_values`: open/resolved/pending/closed). Interseção = só `open`/`resolved`. O front usa `'pending'` em 14 pontos e `'waiting'` em 3 — todos rejeitados pelo banco. Achado adjacente (Inbox), registrado porque mora na tabela do módulo.
5. **P2 — Dados reais tornam metade das telas do módulo vazias.** Dos 3.104 contatos: 1 com empresa, 3 com e-mail, 3 com tag, 0 com cargo, 0 com cidade/lat-lng, 0 notas, 0 campos customizados, 0 `lead_score`. Mapa, Analytics, agrupamento por empresa, KPI "Empresas", filtros de cargo/tag e aniversários operam sobre nada.

---

## 1. Plano Navy 100 etapas — estado

Ledger `docs/design/REDESIGN_CONTATOS_STATUS.md` fecha CP0–CP12 com evidência numérica; encerramento em 08/09 (SHA `249501ae`). Pendências que o ledger deixou "honestas" (linhas 73–80) e o estado hoje:

| Pendência do ledger | Hoje | Evidência |
|---|---|---|
| Delta % absurdo no KPI Total (`+99900%`) | ✅ resolvido | `src/hooks/crm/useContactsKpi.ts:8` `MIN_PREV = 50`; `:25-26` `pctOrNull` devolve `null` se `prev < 50`; card omite delta (`ContactKpiCard.tsx:119,137`) |
| `deltaNovosPct` sempre +100% | ✅ resolvido | `useContactsKpi.ts:52` `pctOrNull(novos30, novosPrev30)` |
| Sparkline sem dado | ✅ | `ContactKpiCard.tsx:44` retorna `null` com série vazia/zerada |
| "Último contato" = `created_at` | ✅ | `useContactsSearch.ts:122-146` injeta `last_message_at` via RPC `get_last_message_dates`; `ContactCard.tsx:29-32` alterna "Último contato em" / "Cadastrado em" |
| 10 abas rolando em 1672px | 🔄 | Hoje são 7 abas (6 tipos + Todos); `ContactTypeTabs.tsx:51` mantém `overflow-x-auto snap-x`. Não medido em browser desde a redução |
| Sino abre Cmd+K | 🔄 | `ContactsTopActions.tsx` não existe mais; header sem sino. `DashboardTopBar.tsx:12-13` ainda cita o arquivo removido em comentário |
| `is_lid_legacy` não filtrado nas RPCs | ❌ pendente | `search_contacts` e `contacts_count_by_type` ao vivo (`pg_get_functiondef`) não referenciam a coluna; 600 de 3.104 contatos são `is_lid_legacy=true` e aparecem na lista, nas abas e nos KPIs |
| KPI "Empresas" | 🟡 | Valor honesto (`empresasDistinct`, hoje = 1), mas a sparkline usa `seriesEmpresasWeekly12` = contatos/semana com `company` preenchido — série de outra grandeza |

## 2. Plano de 50 etapas (27/09) — etapa por etapa

### Fase 0 — Preparação (1–7)

| Etapa | Status | Evidência |
|---|---|---|
| 1 PR #958 | ✅ | mergeada em 27/09 (CLAUDE.md, seção "Correção de 2026-09-27") |
| 2 Censo por tipo | 🔄 feito só na migration | `20260928180000_add_contact_type_check_constraint.sql:9` cita "3099 registros são 'cliente'"; censo ao vivo em 29/09: cliente 3.099, colaborador 1, fornecedor 1, parceiro 1, prestador_servico 1, transportadora 1 — **zero** `lead`/`sicoob_gifts`/`outros` |
| 3 Decisão destino dos tipos extintos | ✅ moot | não havia linhas a remapear |
| 4 Decisão `talkx-report` | ✅ | e-mail mantido, anexo CSV removido (`supabase/functions/talkx-report/index.ts`, 0 hits `csv`) |
| 5 Entrega em 3 PRs | 🔄 | entrou por PRs #970, #999, #1072, #1075 + pushes diretos em branches de sessão; não em A→B→C |
| 6 Branch nova por PR | ✅ | histórico confirma |
| 7 Baseline `medir-tipografia` | 🔄 | budget regenerado, mas em `ed372fbb` para **afrouxar** (ver 18) |

### Fase 1 — Tipografia (8–18)

| Etapa | Status | Evidência (`main` hoje) | O que falta |
|---|---|---|---|
| 8 título `text-2xl font-bold` | 🔄 revertida | `src/components/layout/PageHeader.tsx:147` `text-[38px] font-extrabold` (#1134) | decisão de produto: 50-etapas ou Navy |
| 9 subtítulo `text-sm mt-1` + "Base de contatos" | 🔄 revertida | `PageHeader.tsx:152` `text-lg mt-2`; `ContactsView.tsx:83` "Base de clientes e leads (N contatos)" — cita **leads**, tipo que não existe mais | idem + texto incoerente com a Fase 2 |
| 10 KPI `text-3xl`, tile 48, ícone 20, card 96 | 🔄 revertida | `ContactKpiCard.tsx:125-134` 108px / 60px / 26px / `text-kpi-value` (34px, token criado em `tailwind.config.ts:51` para escapar do guard) | idem |
| 11 delta/legenda `text-xs` | 🟡 | rótulo `:132` `text-sm` ✅, legenda `:146` `text-xs` ✅, **delta `:138` `text-sm`** ❌ | 1 classe |
| 12 zero `text-[13px]` no módulo | ✅ | `grep` = 0 em `src/components/contacts` | — |
| 13 auditar 62× `text-3xs` | ❌ | 59 usos restam; informativos em 10px: `ContactNotes.tsx:208-209`, `ContactActivityTimeline.tsx:192`, `ContactMapView.tsx:152`, `ContactKanbanView.tsx:232`, `ContactBirthdayPanel.tsx:104`, `ContactPurchaseHistory.tsx:129,143`, `ContactDetailPanel.tsx:195,203`, `ContactQuickPeek.tsx:115`, `ContactSearchWithSuggestions.tsx:128,146`, `ContactForm.tsx:360` | auditoria inteira |
| 14 botões `text-sm` | 🔄 revertida | `ContactsView.tsx:91,101`, `ContactDialogs.tsx:72` `text-base` (#1131) | ver 45 |
| 15 classes semânticas `.text-heading/.text-body-sm/.text-caption` | ❌ | 0 usos no módulo (`src/styles/utilities.css:23-56` existem) | adoção |
| 16 nome igual nas 3 vistas | ✅ | `ContactCard.tsx:100`, `ContactListItem.tsx:65`, `ContactsTable.tsx:171` todos `text-sm` (tabela `font-medium`, demais `font-semibold`) | — |
| 17 WCAG AA claro+escuro, sem cor fixa | ❌ | sem evidência; cores fixas sem `dark:`: `ContactCard.tsx:140` `text-[hsl(215_30%_78%)]` (e-mail — texto claro sobre card claro no light mode, mesmo padrão do bug de 25/09), `contactTypeConfig.tsx:26-67`, `ContactBirthdayPanel.tsx:70-71`, `ContactMapView.tsx:33-37`, `ContactForm.tsx:228,253`; `text-white` em `ContactTypeTabs.tsx:24`, `ContactToolbar.tsx:96`, `ContactViewSwitcher.tsx:67,83`, `ContactDialogs.tsx:72,146`, `ContactEmptyState.tsx:45` | validação + tokens |
| 18 budget + CI verde | 🟡 | `medir-tipografia.cjs --check` exit 0, **mas** `tipografia-budget.json` teve `acima16px` 1→2 para admitir `PageHeader.tsx:147`; `tsxFontSizeInline` teto 2 com live 1 (catraca não desceu); `"commit": "876bd002"` não existe no `git log` | descer a catraca, não subir |

### Fase 2 — Tipos de contato (19–31)

| Etapa | Status | Evidência | O que falta |
|---|---|---|---|
| 19 reordenar `CONTACT_TYPES` | ✅ | `src/utils/whatsappFileTypes.ts:191-198` = cliente, fornecedor, transportadora, colaborador, prestador_servico, parceiro | — |
| 20 excluir lead/sicoob_gifts/outros | ✅ | idem | resíduo em 22 |
| 21 remover dropdown "mais" | ✅ | `ContactTypeTabs.tsx` 83 linhas, sem `slice`/`DropdownMenu` | — |
| 22 ícone `transportadora` | 🔄 | `ContactsTable.tsx:30` `Package` (não `Truck`, que já é fornecedor) — consistente com `contactTypeConfig.tsx:64` e Kanban | `CONTACT_TYPE_ICONS` ainda tem `lead: <Star/>` (`:33`) e `outros: <MoreHorizontal/>` (`:35`) — mapa é `Record<string,…>`, TS não apontou |
| 23 limpar `contactTypeConfig.tsx` | ✅ | 6 chaves (`:20-69`) | — |
| 24 `ContactForm` select | ✅ | `ContactForm.tsx:165-169` | — |
| 25 `BulkActionsBar` sem lead | ✅ | `BulkActionsBar.tsx:189-192` | — |
| 26 Kanban sem Leads | 🟡 | `ContactKanbanView.tsx:34-41` sem lead ✅; ordem ≠ `CONTACT_TYPES`; **cores divergem** do config canônico (parceiro verde vs vermelho, colaborador ciano vs verde, prestador rosa vs âmbar — `:38-40` vs `contactTypeConfig.tsx:37-60`) | ordem + cores |
| 27 KPI Leads → Fornecedores | ✅ | `ContactStatsCards.tsx:52-60`; `useContactsKpi.ts:42-61` | — |
| 28 sanitizar presets | 🟡 | `useContactsViewState.ts:8,27-30` fallback `'all'`; `FilterPresets.tsx:30-44` type guard | preset com tipo extinto continua listado no popover e nunca é limpo do storage; indentação quebrada em `useContactsViewState.ts:27-30` |
| 29 `ContactHeaderSection` sem lead | ✅ | `:26-33` | sem cor para transportadora/prestador/parceiro (fallback `bg-muted`) |
| 30 `UPDATE` no banco | 🔄 | não havia linhas; em vez disso entrou o CHECK `chk_contact_type` (aplicado, no ledger `20260928180000`) — **que quebrou a Sicoob Bridge** (§3.2) | decisão |
| 31 testes sem leads | ✅ | `ContactStatsCards.test.tsx`, `hooks/crm/__tests__/useContactsKpi.test.ts` | `contacts/__tests__/useContactsKpi.test.ts:69` ainda usa fixture `'lead'` e é **duplicata** do teste em `hooks/crm/__tests__` |

Fora de escopo do plano, mas contraditório com ele: `src/hooks/integrations/useTalkXSegments.ts:46` oferece `['cliente','lead','fornecedor','parceiro','sicoob_gifts']` como opções de `contact_type` em segmentos (#1075 **adicionou** `sicoob_gifts` no mesmo dia em que o tipo saiu) — 2 extintos, 3 canônicos ausentes; regra com esses valores nunca casa. `sla_rules` e `talkx_segments` não têm linhas citando tipos extintos.

### Fase 3 — Remoção de CSV (32–44)

| Etapa | Status | Evidência | O que falta |
|---|---|---|---|
| 32 Contatos | ✅ | `ContactImportDialog.tsx` apagado; 0 hits em `ContactsView`/`useContactsViewState` | — |
| 33 empty-states | 🟡 | ações de import removidas | textos `contextConfigs.tsx:29` "…ou importe contatos" e `:37` "…ou importe de uma planilha" prometem import inexistente |
| 34 TalkX exports | ✅ | `talkxExport.ts` apagado; 0 hits | — |
| 35 TalkX imports | ✅ | 0 hits | — |
| 36 edge `talkx-report` | ✅ | só `escHtml`; teste Deno ajustado (`4360c981`) | — |
| 37 Multiplix | ✅ | 0 hits | — |
| 38 CRM 360 | ✅ | 0 hits | — |
| 39 Dashboard/SLA | ✅ | `useExportData.ts` apagado; `useDownloadPermission` mantido | — |
| 40 Admin | ✅ | 0 hits; `jspdf` fica por `MonitoringDiagnosticPanel.tsx:67` | `jspdf-autotable` (`package.json:76`) sem nenhum import — dependência morta |
| 41 Inbox | ✅ | `HistoryTab.tsx` 0 hits | — |
| 42 stubs mortos | 🟡 | `exportReport.ts`, `ExportButton.tsx`, `ExportDropdown*` apagados | `src/hooks/chat/useScheduledReports.ts:191` `{ value: 'csv' }` ainda selecionável em `ScheduledReportsManager.tsx:149` |
| 43 limpeza transversal | 🟡 | i18n limpo; MIMEs de anexo mantidos; manifesto `--check` OK | `featuresSectionsData.ts:89` lista "Importação/Exportação de contatos", `:134-137` seção "Relatórios e Exportação"; `FUNCTIONALITIES_INVENTORY.md:186-187` "Exportar PDF/Excel (xlsx)" — `xlsx` não está no `package.json`; `scripts/ci/eslint-baseline.json` cita 2 arquivos inexistentes (`ContactImportDialog.tsx`, `useTags.test.tsx`) |
| 44 testes de export | ✅ | 0 arquivos | — |

Fora do plano, contra o objetivo "sistema inteiro": `src/components/team-chat/department-management/DepartmentAuditView.tsx:20-62` tem export CSV **funcional** (criado em `0cc4076f`, 27/09, mesmo dia do plano).

### Fase 4 — Botões −30% (45–46)

| Etapa | Status | Evidência |
|---|---|---|
| 45 Sincronizar/Novo Contato `h-9 px-4 text-sm` | 🔄 revertida | `ContactsView.tsx:101-103`, `ContactDialogs.tsx:72-73` `h-12 px-5 text-base` + ícone 18px (#1131 citando Navy 35–37). Houve 3 versões dos mesmos botões em 48h (`481ede55` → `dc7c3743` → `ac805f92`) |
| 46 CRM 360° | 🔄 revertida | `ContactsView.tsx:89-94` idem |

### Fase 5 — Validação (47–50)

| Etapa | Status | Evidência |
|---|---|---|
| 47 checks locais | sem evidência | não registrável em repo |
| 48 screenshot-review 2 temas | ❌ | nenhum print em `docs/`, nenhuma menção em commit |
| 49 merge + deploy edge | ✅ | `deploy-functions.yml` run 36453264732 (28/09 16:44Z, success, head `1b85cb43` ⊇ `47044241`) — `talkx-report` sem CSV está no ar |
| 50 verificação em produção | sem evidência | nenhum registro; censo ao vivo desta auditoria cobre a parte do banco |

---

## 3. Achados críticos fora dos planos

### 3.1 P0 — Exclusão de contato silenciosamente inoperante

- `pg_policies` para `public.contacts`: `Users can insert contacts [INSERT]`, `contacts_select_policy [SELECT]`, `Users can update their assigned contacts [UPDATE]`. **Nenhuma `DELETE`/`ALL`.** `relrowsecurity = true`. Grant `authenticated: DELETE` existe, mas RLS sem policy = deny.
- Histórico: `grep -i "for delete" supabase/migrations/*.sql` nunca criou policy de DELETE em `contacts`. Nunca existiu.
- Front: `src/components/contacts/useContactsCRUD.ts:203-220` (`delete().eq('id')` → `successMessage: 'Contato excluído com sucesso!'`), `BulkActionsBar.tsx:106-117` (`delete().in('id', …)` → `toast.success('N contatos removidos')`). Nenhum dos dois confere linhas afetadas.
- Efeito: usuário vê sucesso, lista recarrega, contato continua lá. Trigger `trg_redact_crm_sync_on_contact_delete` (BEFORE DELETE) nunca disparou em produção pela UI.
- Sem RPC de exclusão/soft-delete (`pg_proc` com `%contact%`: 15 funções, nenhuma de delete).

### 3.2 P0 — Sicoob Bridge quebrada pelo CHECK `chk_contact_type`

- `supabase/functions/sicoob-bridge/index.ts:57` insere `contact_type: 'sicoob_gifts'` → rejeitado pela constraint ao vivo (`CHECK (contact_type = ANY ('cliente','fornecedor','transportadora','colaborador','prestador_servico','parceiro'))`).
- `sicoob-bridge-reply/index.ts:46` exige `contact_type === 'sicoob_gifts'`; trigger `trg_sicoob_reply` em `messages` → `notify_sicoob_on_reply()` só dispara para esse tipo. Dashboard `SicoobBridgeDashboard.tsx` e rota `navigation.service.ts:143` seguem no menu admin.
- `#1075` (`6f066e9e`) no mesmo dia adicionou filtro `phone ilike 'sicoob-%'` em `useTalkXSegments.ts:155,169` e `sicoob_gifts` nas opções de segmento — sinal de que a bridge era considerada viva.
- Decisão necessária: (a) reativar o tipo no CHECK (`sicoob_gifts` como 7º tipo interno, oculto das abas), ou (b) desligar a bridge de vez (edges, trigger, dashboard, rota, filtro de telefone). Recomendação em §6.

### 3.3 P1 — CHECKs conflitantes em `contacts.conversation_status`

- `contacts_conversation_status_check`: `open|waiting|resolved|archived`; `chk_conversation_status_values`: `open|resolved|pending|closed` (ou NULL). Ambos ativos → só `open` e `resolved` passam. Censo: 3.087 `open`, 17 `resolved`, nenhum outro — consistente com a impossibilidade.
- Front: `status: 'pending'` em 14 pontos, `'waiting'` em 3, `'archived'` em 1 (`grep` em `src`). Trigger `trg_contacts_fsm_transition` (`enforce_conversation_status_transition`) valida transições que a constraint bloqueia antes.
- Adjacente ao Inbox; entra no plano como decisão de esquema (uma constraint canônica, FSM e front alinhados), não como trabalho de UI de Contatos.

### 3.4 P1 — Superfície de grants

- `authenticated` tem `TRUNCATE` e `REFERENCES` em `public.contacts` (default do Supabase). RLS **não** cobre `TRUNCATE`: qualquer sessão autenticada com acesso REST pode esvaziar a tabela. Revogar `TRUNCATE` de `authenticated` e `anon` (e auditar as demais tabelas — fora deste escopo, anotado).
- `anon` tem `SELECT` em `contacts` (RLS segura, mas a policy de SELECT é `TO authenticated`, logo o grant é inútil e ruído para auditoria).

### 3.5 P2 — Dados: o módulo está desenhado para um dado que não existe

Censo ao vivo (29/09):

| Métrica | Valor | Impacto |
|---|---|---|
| Total de contatos | 3.104 | — |
| `is_lid_legacy = true` | 600 (19%) | aparecem em lista/abas/KPIs (§1) |
| Telefone não numérico (sintético) | 6 | filtro só em Inbox/busca global, não em Contatos |
| Com `company` | **1** (1 empresa distinta) | KPI "Empresas" = 1; agrupamento por empresa; filtro de empresa; `CompanyLogo` |
| Com `email` | 3 | filtro/links `mailto:`; e-mail duplicado (único E2E do módulo) cobre 3 linhas |
| Com `tags` | 3 | filtro por tag; `idx_contacts_tags_gin` |
| Com `job_title` / `city` / `latitude` | 0 / 0 / 0 | filtro de cargo; `ContactMapView`, `ContactRegionMap`, endereço (migrations de 25–26/09) sem uso |
| `lead_score > 0` | 0 | `ContactEngagementScore`, `LeadRiskScorePanel` |
| `contact_notes` / `contact_custom_fields` | 0 / 0 | `ContactNotes`, `CustomFieldsSection` (órfão) nunca usados |
| Com `avatar_url` | 2.623 (85%) | ok |
| `consent_status` | 100% `unknown` | LGPD sem sinal |
| `created_at` últimos 30d / 30–60d | 2.690 / 414 | base migrada em bloco a partir de 27/08; deltas ainda distorcidos (guarda `MIN_PREV=50` segura) |
| `contact_type` | cliente 3.099 + 1 de cada dos outros 5 (seeds) | abas Fornecedor/Transportadora/… mostram 1 contato de teste cada |

Não é bug de código: é a distância entre o que o módulo promete e o que o WhatsApp entrega (nome + telefone + foto). O CRM externo (`pgxfvjmuubtbowutlide`) tem 4.495 contatos e 57.675 empresas (plano Banco Único, 24/09) — a fonte de enriquecimento existe, não está ligada.

### 3.6 P2 — Ligações erradas e props mortas na UI

- Botão "Conversar" do card/lista/tabela abre o **painel de detalhes**, não o chat: `ContactContentArea.tsx:90,104,117,137` passam `onOpenChat={onContactClick}`; só `ContactDetailPanel.tsx:135` chama `openContactChat` de verdade (`useContactsCRUD.ts:83-96`).
- `ContactContentArea.tsx:92` passa `companyLogo` ao `ContactCard`, que não desestrutura a prop (`ContactCard.tsx:21-23`) — logo de empresa nunca aparece no card.
- `src/components/inbox/contact-details/ContactActionButtons.tsx:138` botão de videochamada é stub (`toast.info('Em breve')`).
- Permissões: nenhum gate de role no front para editar/excluir/bulk (`grep role|isAdmin` em `src/components/contacts` = 0); depende só de RLS — e a RLS de DELETE não existe (§3.1).

### 3.7 P3 — Código morto e dívida

- Órfãos em `src/components/contacts/` (0 importadores): `ContactBirthdayPanel.tsx`, `ContactMergePanel.tsx` (contém `any`; substituído por `ContactMergeDialog`), `ContactPagination.tsx` (pager real em `ContactResultsSummary`), `ContactQuickPeek.tsx`, `CustomFieldsSection.tsx`, `InlineEditCell.tsx`.
- Teste duplicado: `src/components/contacts/__tests__/useContactsKpi.test.ts` ≡ `src/hooks/crm/__tests__/useContactsKpi.test.ts` (fixtures diferentes, mesmo alvo).
- `any` explícito: `ContactDetailPanel.tsx:41`, `ContactMergePanel.tsx`, `useContactIntelligence.ts`, `StoryViewer.tsx:96`.
- `jspdf-autotable` sem import; `xlsx` citado no inventário sem estar instalado.
- `scripts/ci/eslint-baseline.json` com 2 paths inexistentes; `tipografia-budget.json` com `commit` inexistente.
- Comentário obsoleto `DashboardTopBar.tsx:12-13` (cita `ContactsTopActions`).
- Índices: `search_contacts` faz `ILIKE '%x%'` em 7 colunas; só `email` tem índice trigram (`idx_contacts_email_trgm`); `name`/`phone`/`company` fazem seq scan (3k linhas hoje — irrelevante; relevante ao ligar o CRM de 48k).
- `schema-catalog.json` não rastreia CHECK constraints (0 ocorrências de `chk_`) — o guard offline não pega drift em `chk_contact_type` nem nos dois CHECKs de status.

### 3.8 P3 — Testes e E2E

- Unitários: 7 arquivos em `contacts/__tests__` + 6 em `hooks/crm/__tests__`, 126 testes verdes. Nenhum cobre `ContactTypeTabs`, `ContactToolbar`, `ContactViewSwitcher`, `BulkActionsBar`, `useContactsCRUD`, `useContactsViewState`, `ContactDetailPanel`. `ContactStatsCards.test.tsx` não afirma geometria (por isso o flip 96↔108 passou).
- E2E: só `e2e/contact-form-email-duplicate.spec.ts` (2 testes de duplicidade no formulário). Zero E2E para busca, abas, filtros, seleção, bulk, vistas, paginação, KPIs, painel, exclusão. O "QA funcional 20/20" do ledger Navy era script ad-hoc em `/workspace/qa/func.mjs`, fora do repo — não reprodutível em CI.

### 3.9 P3 — Documentação desatualizada

- `docs/COMPLETE_SYSTEM_FEATURES.md:208-222` seção "Gestão de Contatos" cita `contact_tags` (tabela removida em `cc1bb5b1`), `DataImporter.tsx`, `ExportDropdown.tsx`, `DuplicateButton.tsx` (inexistentes) e "tipo de contato (cliente, lead, etc.)".
- `docs/FUNCTIONALITIES_INVENTORY.md`: sem seção do módulo Contatos (índice vai de "Mensagens" a "Talk X" sem Contatos); linha 364 da tabela `contacts` lista 5 colunas (a tabela tem 38); linhas 186–187 citam export PDF/Excel.
- `docs/design/PLANO_MELHORIAS_CONTATOS_50_ETAPAS_2026-09-27.md` sem nenhum checkbox marcado e sem registro da decisão contrária de #1131/#1134 — segundo plano "ativo" contraditório (mesmo problema que o E49 do plano de 20/09 resolveu para os planos de 16/09 e 20/09).

---

## 4. Estado do banco (referência)

- Colunas de `contacts` (38): id, name, phone, email, avatar_url, assigned_to, whatsapp_connection_id, tags[], notes, created_at, updated_at, nickname, surname, job_title, company, queue_id, contact_type, ai_priority, ai_sentiment, channel_type, channel_connection_id, group_category, lead_score, risk_score, lead_origin, consent_status, avatar_fetch_attempted_at, conversation_status, conversation_status_changed_at, is_lid_legacy, postal_code, address, address_number, neighborhood, city, state, latitude, longitude.
- CHECKs: `chk_contact_type`, `chk_conversation_status_values`, `contacts_conversation_status_check`, `contacts_email_format`, `contacts_phone_not_empty`.
- Triggers (9): auto_assign, auto_assign_to_queue_agent, fsm_transition, log_assignment_change, normalize_contact_phone, prevent_assignee_hijack, prevent_queue_hijack, redact_crm_sync_on_delete, updated_at.
- Índices (16): pkey, `phone` unique, btree em assigned_to/queue_id/contact_type/created_at/updated_at/name/whatsapp_connection_id/channel_connection_id, parciais em is_lid_legacy/conv_status/assigned_to_gamif, gin em tags e trigram em email.
- RPCs: `search_contacts` (SECURITY DEFINER, ACL manual, sem `is_lid_legacy`), `contacts_count_by_type` (invoker, sem `is_lid_legacy`), `merge_contacts_atomic`, `is_contact_visible_to_user`, `dashboard_contact_counts`, `get_last_message_dates`.
- Ledger em dia para as migrations de contatos de 26–28/09 (`20260926220000`, `20260927200000`, `20260927360000`, `20260928180000`).

## 5. Contrato funcional (seção 4 do plano Navy) — 23 itens

✅ 19 · 🔄 3 (openContactChat em 2 passos; CompanyLogo prop morta; permissões só via RLS) · ❌ 1 (Excluir — §3.1). Detalhe por item em §3.6 e no relatório do auditor 4 (handlers reais em `ContactToolbar.tsx:72-164`, `useContactsViewState.ts:38-64`, `ContactsView.tsx:123-227`, `ContactViewSwitcher.tsx:10-33`, `useContactsSearch.ts:6-202`).

## 6. Recomendações de decisão (Joaquim)

| # | Decisão | Recomendação | Por quê |
|---|---|---|---|
| D1 | Exclusão de contato: policy de DELETE (hard) ou soft-delete (`deleted_at` + RPC auditada)? | **Soft-delete via RPC** (`delete_contact(id)` SECURITY DEFINER, só admin/supervisor, grava `deleted_at`), filtro em `search_contacts`/`contacts_count_by_type` | contato tem mensagens, notas, links CRM; DELETE físico dispara redação do CRM e perde histórico; plano Banco Único (etapa 72) já pede soft-delete por RPC |
| D2 | Sicoob Bridge: reativar `sicoob_gifts` ou desligar | **Desligar** (remover edges, trigger, dashboard, rota, filtro `sicoob-%`) **se** a bridge não tiver uso em 30 dias — confirmar com `SELECT count(*) FROM messages WHERE … channel 'internal_chat'` antes | manter um tipo oculto no CHECK reabre a ambiguidade que a Fase 2 fechou |
| D3 | Tipografia/geometria: 50-etapas (reduzir) ou Navy (38/48/108) | **Navy**, porque é o que está em produção e foi validado por screenshot; o plano de 50 vira "encerrado, superado" nessas etapas | evitar 4ª versão dos mesmos botões |
| D4 | `is_lid_legacy` e telefones sintéticos: esconder de Contatos? | **Esconder por padrão** com toggle "Mostrar legados" na toolbar; RPCs recebem `include_legacy boolean` | 600 linhas (19%) sem WhatsApp real poluem lista, abas e KPIs |
| D5 | Enriquecimento pelo CRM externo (empresa, cargo, e-mail) | **Sim, somente leitura**, via `crm_contact_links` já existente + job noturno — escopo do plano Banco Único, aqui só a ponte de leitura | sem isso 6 telas do módulo ficam vazias |
| D6 | Órfãos (6 componentes) | **Apagar** | zero importadores; ressuscitar do git se precisar |

---

*Todos os números acima vieram de leitura ao vivo em 29/09/2026. Se o banco ou o código divergirem, este arquivo está errado — corrija-o no mesmo commit do fix.*
