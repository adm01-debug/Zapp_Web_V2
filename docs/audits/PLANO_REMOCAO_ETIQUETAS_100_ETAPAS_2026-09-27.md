# Plano de remoção — módulo "Etiquetas" (`view=tags`) — 100 etapas

> Auditoria e plano de execução. **Status: remoção executada** — as Fases 1–7 foram mergeadas e as
> tabelas `tags`/`contact_tags` dropadas por `20260927410000_drop_legacy_tags_tables.sql`. O texto abaixo
> é o plano original de 27/09 (código em `main` @ 2026-09-27 e banco real lido ao vivo na mesma data),
> redigido quando nada havia sido removido.

---

## 1. Sumário executivo

A tela **Etiquetas** (`/?view=tags` → `src/components/tags/TagsView.tsx`) é a UI de um modelo de
etiquetas **legado e relacional** (`tags` + `contact_tags`) que foi substituído, na prática, pelo
modelo em **array no contato** (`contacts.tags text[]`). Os dois convivem hoje e não se falam.

O que o banco diz (leitura ao vivo, 27/09):

| Objeto | Estado real |
|---|---|
| `public.tags` | **3 linhas**, todas geradas pelo sync do WhatsApp: `wa:1:Não lidas`, `wa:2:Favoritos`, `wa:3:Grupos` (criadas 15/09 19:59, cor idêntica `#FF9485`) |
| `public.contact_tags` | **0 linhas** |
| `contacts.tags` (array) | **3 contatos** com valor, de 3.099 |
| `ai_conversation_tags` | modelo independente (IA) — **fora deste plano** |

Consequência prática, hoje, em produção: **o filtro "Etiquetas" do Inbox nunca filtra nada**, porque
ele cruza `contact_tags` (vazia) com a lista vinda de `tags`. E o botão "Nova Etiqueta" da tela cria
registros locais que o WhatsApp não conhece e que o próximo `labels.upsert` pode sobrescrever/apagar.

**Recomendação (Opção B, abaixo): remover a tela, os hooks e o filtro legado, migrar o sync de labels
do WhatsApp para `contacts.tags`, e só então dropar as duas tabelas.** A remoção da tela sozinha é
barata; o que exige cuidado é o pipeline de labels da Evolution, que é a única coisa viva escrevendo
nessas tabelas.

---

## 2. Inventário completo do módulo

### 2.1 Núcleo (some por inteiro)

| Arquivo | Papel |
|---|---|
| `src/components/tags/TagsView.tsx` (308 linhas) | a tela: KPIs, grid de cards, criar/editar/excluir |
| `src/hooks/crm/useTags.ts` (226 linhas) | `useTags()` (CRUD em `tags` + contagem via `contact_tags`) e `useContactTags()` |
| `src/hooks/__tests__/useTags.test.tsx` | testes do hook |

`useContactTags()` **já é código morto**: exportado, zero consumidores no repo.

### 2.2 Pontos de entrada (registro da rota/menu)

| Arquivo | Linha | O que há |
|---|---|---|
| `src/pages/ViewRouter.tsx` | 56 | `'tags': Views.TagsView` |
| `src/pages/lazyViews.ts` | 12 | `TagsView = lazyWithRetry(...)` |
| `src/components/performance/LazyRoutes.tsx` | 12 | `LazyTagsView` (duplicata do lazy, sem consumidor no router) |
| `src/services/navigation.service.ts` | 62 | item de menu `Etiquetas`, `STAFF_ROLES` |
| `src/components/ui/command-palette-data.tsx` | 34 | comando `nav-tags` |
| `src/hooks/ui/usePrefetchOnHover.ts` | 18 | prefetch `tags: [['tags']]` |
| `src/components/mobile/MobileHeader.tsx` | 33 | título `tags: 'Etiquetas'` |

### 2.3 Superfície de UI compartilhada (ajustar, não apagar)

| Arquivo | Observação |
|---|---|
| `src/components/ui/empty-states.tsx:178`, `empty-states/ContextualEmptyState.tsx:9`, `empty-states/ConvenienceExports.tsx:20`, `empty-states/contextConfigs.tsx:62`, `contextual-empty-states.tsx` | contexto `'tags'` + `TagsEmptyState`; só remover se nenhum outro consumidor sobrar |

### 2.4 Consumidores do modelo relacional (o risco real)

| Arquivo | Linha | Uso | Impacto da remoção |
|---|---|---|---|
| `src/components/inbox/InboxFilters.tsx` | 75, 99–101, 283–300, 391 | `useTags()` alimenta os chips do filtro | **quebra** — precisa migrar para `contacts.tags` |
| `src/hooks/inbox/useInboxFilters.ts` | 50–66, 159–162 | mapa `contact_id → tag_id[]` via `contact_tags` | **quebra** — idem |
| `src/components/inbox/useGlobalSearchData.ts` | 61 | busca global lê `tags` | degrada (some a seção de etiquetas da busca) |
| `src/components/reports/useReportsData.ts` | 16 | `useTags()` para relatórios | **quebra** build/TS |
| `src/hooks/crm/useContactCrm360.ts` | 184 | `contact_tags → tags(name)` no CRM 360 | degrada (tags do contato ficam vazias na aba) |
| `src/hooks/crm/index.ts` | 18 | `export * from './useTags'` | ajustar barril |

### 2.5 Backend (edge functions)

| Arquivo | Linha | Uso |
|---|---|---|
| `supabase/functions/_shared/evolution-webhook-handlers.ts` | 194–228 | `labels.upsert` cria/atualiza/apaga em `tags`; `labels.association` escreve em `contact_tags` — **único produtor vivo** |
| `supabase/functions/_shared/evolution-sync-actions.ts` | 224, 244 | limpeza de `contact_tags` de contatos mock |
| `supabase/functions/ai-auto-tag/index.ts` | 145–149 | escreve em `ai_conversation_tags` — **não é este módulo, não tocar** |

### 2.6 Banco

- Policies RLS: 6 (`tags`: view/insert/admin-manage; `contact_tags`: select/insert/delete).
- FKs: `contact_tags.contact_id → contacts(id) CASCADE`, `contact_tags.tag_id → tags(id) CASCADE`,
  `tags.created_by → profiles(id)`. **Nenhuma outra tabela referencia `tags`.**
- Índices: 7 (2 PK, 2 UNIQUE, `idx_tags_created_by`, `idx_contact_tags_tag_id`, `idx_contact_tags_contact_id`).
- Funções `public.*` que citam `contact_tags`: **nenhuma**.
- Realtime (`supabase_realtime`): **não publica** `tags` nem `contact_tags`.
- `contacts.tags` **não tem índice GIN** — criar antes de migrar o filtro do Inbox.

### 2.7 O que já substitui a tela

| Função da tela Etiquetas | Substituto vigente |
|---|---|
| ver/editar etiquetas do WhatsApp | `Conexões → Configurações da instância → aba Etiquetas` (`InstanceSettingsDialog.tsx:87`), que lê os labels ao vivo da Evolution |
| etiquetar contatos em massa | `Contatos → ContactBulkTagDialog` (escreve em `contacts.tags`) |
| ver etiquetas de um contato | `ContactDetailPanel`, `ContactAccordionSections` (seção Tags), `ContactsTable` — todos em `contacts.tags` |
| segmentar por etiqueta | Talk X → Segmentos (`useTalkXSegments`, campo `tags`) |
| importar etiquetas | `zappSchemas` (coluna `tags`, `cliente,vip`) |

---

## 3. Opções e decisão

| Opção | O que faz | Risco | Ganho |
|---|---|---|---|
| **A — só a tela** | apaga `TagsView` + rota/menu; mantém hooks, tabelas e filtro | baixo | cosmético; o filtro morto do Inbox continua lá |
| **B — recomendada** | apaga tela + hooks + filtro legado, migra sync de labels para `contacts.tags`, dropa as 2 tabelas | médio (mexe em edge function de webhook) | um único modelo de etiqueta no sistema; filtro do Inbox volta a funcionar |
| **C — tudo agora** | B + remove também `ai_conversation_tags` | alto | não recomendado: é outro produto (classificação por IA), vivo |

**Decisão proposta: B**, em 7 fases, cada uma mergeável sozinha e reversível.

---

## 4. Matriz de riscos

| # | Risco | Prob. | Impacto | Mitigação (etapa) |
|---|---|---|---|---|
| R1 | Filtro de Etiquetas do Inbox some ou quebra no build | alta | alto | migrar antes de remover (E19–E34) |
| R2 | `useReportsData` quebra o typecheck ao remover `useTags` | alta | médio | E67–E70 na mesma PR |
| R3 | Webhook `labels.*` da Evolution começa a dar erro 500 ao escrever em tabela inexistente | alta se ordem errada | alto (trava o webhook inteiro) | reescrever o handler e **deployar** antes do DDL (E35–E50, E79) |
| R4 | CRM 360 mostra tags vazias | média | baixo | E29–E31 |
| R5 | Busca global perde a seção "etiquetas" | alta | baixo | E32–E33 |
| R6 | Perda de dados ao dropar `tags` | baixa (3 linhas, todas recriáveis pelo sync) | baixo | backup em `_superseded` + export JSON (E05, E82) |
| R7 | Drift banco↔Git por aplicar DDL fora do fluxo | média | alto | regra 6 do CLAUDE.md: arquivo → PR → merge → deploy → apply (E79–E90) |
| R8 | Sessão paralela mexendo nos mesmos arquivos | média | médio | checar PRs abertas antes de cada fase (E02) |
| R9 | Filtro por array sem índice degrada o Inbox | média | médio | índice GIN antes (E21) |
| R10 | `talkx.spec`/e2e logado vermelho por seletor de menu | baixa | médio | E57, E93 |

---

## 5. As 100 etapas

### Fase 0 — Congelamento e evidência (E01–E10)
1. Confirmar com o Joaquim a Opção B (este documento) — é a única decisão de negócio do plano.
2. Listar PRs abertas e confirmar que nenhuma toca `src/components/inbox/InboxFilters.tsx`, `useInboxFilters.ts`, `useTags.ts` ou `evolution-webhook-handlers.ts`.
3. Criar branch única da fase a partir de `main` atualizado.
4. Snapshot do grafo: `graphify update .` e guardar `GRAPH_REPORT.md` do commit base.
5. Export JSON de `tags` e `contact_tags` (3 + 0 linhas) para `docs/audits/evidencias/`.
6. Registrar `count(*)` de `contacts` com `tags` não vazio (hoje: 3/3.099).
7. Registrar os 6 policies e 7 índices atuais (já transcritos na seção 2.6).
8. Confirmar que `pg_publication_tables` não publica as duas tabelas.
9. Confirmar que nenhuma função `public.*` referencia `contact_tags`.
10. Abrir issue-guarda no GitHub linkando este plano, para rastrear as 7 PRs.

### Fase 1 — Contrato do modelo único (E11–E18)
11. Definir o formato canônico da etiqueta no array: texto livre, `trim`, case preservado.
12. Definir o prefixo reservado `wa:<labelId>:<nome>` para labels espelhados do WhatsApp.
13. Documentar que etiqueta `wa:*` é **read-only** na UI (vem do WhatsApp, não se edita no Zapp).
14. Escrever helper `src/lib/tags.ts`: `isWhatsAppTag`, `parseWhatsAppTag`, `normalizeTag`.
15. Testes unitários do helper (prefixo, acento, espaço, duplicata, vazio).
16. Definir o contrato do filtro: Inbox filtra por **nome** de etiqueta, não por UUID.
17. Mapear a quebra de URL: `?tags=<uuid>` vira `?tags=<nome>` — decidir se aceita ambos por 1 release.
18. PR da Fase 1 (só helper + testes, sem efeito visível). Merge.

### Fase 2 — Migrar o filtro do Inbox para `contacts.tags` (E19–E34)
19. Arquivo de migration: índice GIN `idx_contacts_tags_gin ON contacts USING gin (tags)`.
20. PR do arquivo; merge; **depois** aplicar via `db_query` + registro no ledger (regra 6/CLAUDE.md).
21. `register-migration.mjs` para gerar o `INSERT` do ledger com o SQL real.
22. Validar `supabase-usage-guard.mjs` (`novas: 0`) e paridade arquivos↔ledger.
23. Em `useInboxFilters.ts`: remover a query `contact-tags-map`.
24. Trocar a filtragem (linhas ~159–162) para `c.contact.tags` × `filters.tags` por nome.
25. Remover `contactTagsMap` das dependências do `useMemo`.
26. Em `InboxFilters.tsx`: trocar `useTags()` por uma lista distinta de nomes vinda dos contatos carregados.
27. Ajustar chips ativos (`filters.tags.map`) para renderizar nome, com cor derivada (hash) quando não houver cor.
28. Ajustar `useUrlFilters` e seu teste (`useUrlFilters.test.tsx` já usa `tags=vip,urgent` — passa a bater com a realidade).
29. `useContactCrm360.ts:184`: trocar o join `contact_tags → tags(name)` por `contacts.tags`.
30. Ajustar a aba Tags do CRM 360 (`crm360TabsData.ts`) se ela apontar para a tabela legada.
31. Testar CRM 360 com um contato que tenha tags no array.
32. `useGlobalSearchData.ts:61`: trocar a origem (tabela `tags`) por nomes distintos de `contacts.tags`.
33. Ajustar o agrupamento de resultados da busca global (a entidade deixa de ter `id`/`color`).
34. PR da Fase 2 + testes. Merge. **Checkpoint: filtro do Inbox funcionando de verdade pela primeira vez.**

### Fase 3 — Sync de labels do WhatsApp → `contacts.tags` (E35–E50)
35. Ler `evolution-webhook-handlers.ts` 180–240 e mapear os 2 eventos: `labels.upsert`, `labels.association`.
36. Decidir o destino: `labels.upsert` deixa de persistir catálogo (não há mais catálogo) — vira no-op logado.
37. `labels.association` passa a fazer `array_append`/`array_remove` em `contacts.tags` com `wa:<id>:<nome>`.
38. Tratar o caso "label renomeado no WhatsApp": trocar o elemento com mesmo `wa:<id>:` no array.
39. Tratar "label apagado": remover todos os elementos `wa:<id>:*` dos contatos.
40. Escrever RPC `SECURITY DEFINER` para o append/remove atômico (evita race de leitura-escrita do array).
41. Arquivo de migration da RPC + grants (`service_role` apenas).
42. Testes unitários do handler com payload real de `labels.association` (add e remove).
43. Testes do caminho de rename e delete de label.
44. Ajustar `evolution-sync-actions.ts:224,244`: limpeza de mocks passa a limpar o array.
45. PR da Fase 3 (arquivo de migration + edge). Merge.
46. Aplicar a migration da RPC em produção (`db_query` + ledger na mesma transação).
47. **Deploy da edge function**: `deploy-functions.yml` via `workflow_dispatch` + aprovação no environment `producao-edge-functions` (merge não deploya edge).
48. Confirmar o deploy pelo run do workflow, não pela merge.
49. Disparar um evento real de label no WhatsApp e conferir o array do contato no banco.
50. Backfill: copiar as associações de `contact_tags` para `contacts.tags` (hoje: 0 linhas — backfill é no-op, mas rodar mesmo assim e registrar).

### Fase 4 — Remover a tela e seus pontos de entrada (E51–E66)
51. `git rm src/components/tags/TagsView.tsx`.
52. Remover `'tags'` de `ViewRouter.tsx:56`.
53. Remover `TagsView` de `lazyViews.ts:12`.
54. Remover `LazyTagsView` de `LazyRoutes.tsx:12`.
55. Remover o item de menu em `navigation.service.ts:62`.
56. Remover `nav-tags` de `command-palette-data.tsx:34`.
57. Conferir se algum e2e clica em "Etiquetas" no menu (`e2e/`), ajustar seletores.
58. Remover `tags` de `usePrefetchOnHover.ts:18`.
59. Remover `tags: 'Etiquetas'` de `MobileHeader.tsx:33`.
60. Adicionar redirect: `?view=tags` → `?view=contacts` por 1 release (link antigo não dá tela branca).
61. Conferir favoritos/atalhos salvos do usuário que apontem para `view=tags` (sidebar de favoritos).
62. Remover `TagsEmptyState` e o contexto `'tags'` dos 4 arquivos de empty-state **se** não sobrar consumidor.
63. Rodar `grep -rn "view=tags\|TagsView"` e provar zero ocorrências fora do redirect.
64. `bun run lint && bun run typecheck && bun run test`.
65. PR da Fase 4. Merge → Vercel redeploya `main` sozinho (front é deploy automático).
66. Conferir em produção: menu sem "Etiquetas", link velho redirecionando.

### Fase 5 — Remover hooks, tipos e testes órfãos (E67–E78)
67. `git rm src/hooks/crm/useTags.ts`.
68. `git rm src/hooks/__tests__/useTags.test.tsx`.
69. Remover `export * from './useTags'` em `hooks/crm/index.ts:18` e o comentário do cabeçalho (linha 3).
70. `useReportsData.ts:16`: remover `useTags()` e a dependência de `tags` no relatório (ou apontar para o array).
71. Provar que `useContactTags` não tinha consumidor (já verificado) e que nada quebrou.
72. Remover do `types.ts` gerado? **Não manualmente** — sai sozinho no `types-sync` depois do DDL.
73. Rodar `grep -rn "useTags\|useContactTags"` — esperado: zero.
74. Rodar `grep -rn "contact_tags"` no `src/` — esperado: zero (só `supabase/` e `types.ts` até o DDL).
75. `bun run test` completo + cobertura dos arquivos tocados.
76. Rodar o e2e logado local/CI contra preview.
77. PR da Fase 5. Merge.
78. Conferir bundle: a remoção deve reduzir o chunk lazy; anotar o delta no `performance-budget.json` se aplicável.

### Fase 6 — DDL: dropar as tabelas (E79–E90)
79. **Pré-requisito rígido**: Fases 3, 4 e 5 mergeadas E edge function deployada (senão o webhook quebra).
80. Confirmar de novo, ao vivo, que `contact_tags` está em 0 e `tags` só tem `wa:*`.
81. Salvar o dump final das 3 linhas em `docs/audits/evidencias/`.
82. Arquivo `supabase/migrations/<version>_drop_tags_contact_tags.sql`: `DROP TABLE public.contact_tags; DROP TABLE public.tags;` (CASCADE não é necessário — só FKs internas).
83. Conferir `max(version)` no ledger e usar version estritamente maior.
84. PR do arquivo (só o arquivo). Merge em `main`.
85. `register-migration.mjs <arquivo.sql>` para gerar o SQL exato do ledger.
86. Aplicar DDL + `INSERT` no ledger **na mesma chamada** de `db_query` (1 transação), com `RETURNING` não-vazio como guarda.
87. `supabase-usage-guard.mjs` → `novas: 0`; paridade arquivos↔ledger (count + md5 dos prefixos).
88. Disparar `types-sync` e mergear o PR automático (remove `tags`/`contact_tags` de `types.ts`, catálogo e manifesto).
89. Conferir `db-live-guard` verde no push da `main` (ele roda pós-merge e agendado, não em PR).
90. Atualizar `scripts/db-audit/known-violations.json` se algum guard mudar de contagem.

### Fase 7 — Validação, documentação e fechamento (E91–E100)
91. Smoke em produção: abrir Inbox, aplicar filtro por etiqueta, confirmar que filtra.
92. Smoke: etiquetar contato em massa em Contatos e ver o chip no Inbox.
93. Rodar o e2e logado completo no CI da `main`.
94. Disparar um `labels.association` real no WhatsApp e confirmar o array atualizado (log da edge + query).
95. Conferir logs da edge por 24h procurando `relation "tags" does not exist`.
96. Conferir Sentry/telemetria por erro novo em `InboxFilters` e `useContactCrm360`.
97. Atualizar `CLAUDE.md`: seção curta registrando que o modelo de etiqueta é único (`contacts.tags`) e que `tags`/`contact_tags` não existem mais.
98. Atualizar `docs/` (featuresSectionsData lista `tags`/`contact_tags` como tabelas do sistema — corrigir).
99. Fechar a issue-guarda com o link das 7 PRs e o hash do DDL aplicado.
100. Retro de 5 linhas no plano: o que o inventário não previu, para o próximo módulo obsoleto da fila.

---

## 6. Ordem inegociável

```
Fase 1 → Fase 2 → Fase 3 (+ DEPLOY da edge) → Fase 4 → Fase 5 → Fase 6 (DDL) → Fase 7
```

Dropar as tabelas antes do deploy da edge function derruba o webhook de labels da Evolution — é o
mesmo erro do drift de 04/09 (REVOKE aplicado antes do código), já documentado no `CLAUDE.md`.

## 7. Rollback por fase

| Fase | Rollback |
|---|---|
| 1–2 | `git revert` da PR; front redeploya sozinho |
| 3 | `git revert` + **redeploy** da edge (revert sozinho não desfaz o deploy) |
| 4–5 | `git revert` da PR |
| 6 | irreversível na prática — as 3 linhas `wa:*` são recriáveis pelo sync, mas a tabela precisa ser recriada por migration nova |
