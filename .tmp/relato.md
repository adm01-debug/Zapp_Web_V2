Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/settings/AIAutoTagsConfig.tsx` e `src/components/settings/__tests__/AIAutoTagsConfig.recentesErro.test.tsx`: removidos (`git rm`) — o produto não oferece mais etiquetas automáticas de IA.
- `src/components/settings/SettingsView.tsx`: sai a aba (TABS_META + TAB_GROUPS do grupo de IA), o `TabsContent` que montava o painel, o import e o ícone `Tags` (que ficou sem uso).
- `src/hooks/analytics/useAIUsageDashboard.ts`: sai a cor e o rótulo de `ai-auto-tag`. Funções antigas em logs históricos continuam tratadas pelo rótulo/cor genéricos que os painéis admin já usavam (`FUNCTION_LABELS[fn] || fn`, `FUNCTION_COLORS[fn] || '#666'`) — nenhum consumidor quebra.
- `src/components/settings/ai-providers/AIProviderHealthPanel.tsx`: sai `ai-auto-tag` da lista de exemplos do comentário; a regra (não filtrar por `function_name`) continua igual.
- `src/components/reports/useReportsData.ts`: sai a coluna `tags` dos dois `select` de contatos, o estado `selectedTag`, o memo `tags`, a série `byTag` de `contactsChartData` e o `selectedTag` do `queryKey`/do retorno. O recorte dos relatórios passa a ser só período + agente.
- `src/components/reports/AdvancedReportsView.tsx`: sai o destructuring de `selectedTag`/`tags` e o subtítulo deixa de citar tags.
- `src/components/reports/ReportCharts.tsx`: sai o cartão "Contatos por Tag" e o campo `byTag` do tipo `ContactsChartData` (com o `topTag`/`ariaBar` que só ele usava).
- `src/components/docs/featuresSectionsData.ts`: sai o item "Tags/etiquetas em contatos" e, do inventário de banco, `contacts.tags (array — modelo único de etiqueta)` e `ai_conversation_tags`. **Fica** `contact_tags_ext` (contrato externo do CRM), que o cartão manda não tocar.
- `tests/contracts/etiquetas-remocao-residuos.contract.test.ts`: o contrato afirmava o estado antigo (inventário listando `contacts.tags` e `ai_conversation_tags`); passou a exigir a ausência dos dois e a presença só do contrato externo. Não afrouxei: as checagens de ausência das tabelas locais continuam.

## Prova
- vermelho antes (testes escritos primeiro, 22:22:57): `npx vitest run <arquivos tocados>` → `Tests 2 failed | 28 passed (30)` — SettingsView ainda oferecia a aba removida (`expected [ 'Chatbot L1', 'Gestão IA' ] to deeply equal [ Array(3) ]`) e SystemFeaturesView ainda achava "tags" no catálogo (`expect(screen.queryByText(/\btags?\b/i)).toBeNull()`); ReportCharts e useReportsData acusavam `data.byTag`/`tags` ainda expostos.
- verde depois: `npx vitest run src/components/settings/__tests__/SettingsView.test.tsx ... AIProviderHealthPanel.escopo-e-erro.test.tsx` → `Test Files 6 passed (6); Tests 30 passed (30)`
- regressão nas áreas tocadas: `npx vitest run src/components/settings src/components/reports src/components/docs src/hooks/analytics` → `Test Files 59 passed (59); Tests 895 passed | 3 expected fail | 1 todo (899)`
- contrato: `npx vitest run --config vitest.contracts.config.ts tests/contracts/etiquetas-remocao-residuos.contract.test.ts` → `Test Files 1 passed (1); Tests 6 passed (6)`
- grep do critério de pronto: `git grep -nE 'ai-tags|Tags IA' -- src` → 0 resultados.

## O que NÃO fiz e por quê (fora da lista de arquivos do cartão; comentado no cartão)
- `src/components/ai/AutoTicketClassifier.tsx:141-145` lê `ai_conversation_tags` (tabela que o cartão de banco vai derrubar) — não é meu arquivo.
- `src/services/contact.service.ts:216` lê `ai_conversation_tags` — área do worker (hooks).
- Edge `ai-auto-tag` (`supabase/functions/ai-auto-tag/**`) e os contratos que a citam — cartão das edges.
- `src/components/inbox/GlobalSearch.tsx:177` ainda traz o placeholder `# para tags` — cartão do inbox.
