# PARIDADE.md — Talk X / Campanhas

Criado em 2026-09-09 | Sessão 10

---

## Telas 01, 02, 03 — Fases 1-3

Cobertas nas sessões anteriores (PRs #289–#307). Ver HANDOFF_SESSAO_03.md.

---

## FASE 4 — TEMPLATES · telas 04 e 05 (E41–E50)

### Tela 04 — Galeria de Templates (`TalkXTemplates.tsx`)

| Item do mock / plano | Status | Arquivo / evidência |
|---|---|---|
| KPI Aprovados | ✅ | `DashboardKpiCard` com `status=approved` count |
| KPI Mais usado | ✅ | `most[0].use_count` + nome do template |
| KPI Total | ✅ | `templates.length` |
| KPI Taxa de resposta | ⏳ E89 | oculto até integração de analytics |
| Filtro por categoria | ✅ | `FilterBar` com `TEMPLATE_CATEGORIES` |
| Filtro por status | ✅ | select draft/review/approved |
| Grid de cards | ✅ | `grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3` |
| Card: preview WhatsApp | ✅ | `WhatsAppBubble` com `personalizePreview(content)` |
| Card: chips categoria/tags | ✅ | chips de categoria e tags no card |
| Card: variáveis extraídas | ✅ | `"N variáveis"` via `extractVariables` |
| Card: StatusPill | ✅ | `StatusPill` com cor por status |
| Card: N usos | ✅ | `use_count` exibido |
| Card: botão Usar template | ✅ | `onUseTemplate(t)` propagado ao wizard |
| Card: ⋮ menu (Editar, Duplicar, Testar, Arquivar, Excluir) | ✅ | menu contextual via `TalkXTemplateEditor` |
| Ordenação (mais usados / recentes / nome) | ✅ | `sortBy` state + `useMemo` |
| Paginação 12/24 | ✅ | `TalkXPagination` com pageSize toggle |
| Toggle grade/lista | ⏳ E41 | não implementado (só grade) |
| Rail: Ações rápidas (Criar, Duplicar, Importar) | ✅ | `RailAction` × 3 |
| Rail: Importar CSV/JSON | ✅ E48 | `handleImport` + parser quoted-field + limite 1024 chars |
| Rail: Mais convertidos (top 3 por use_count) | ✅ E42 | `most` array derivado de `useMemo` |
| Rail: Biblioteca inteligente (ilustração) | ✅ E42 | `HeroCard` estático |
| Rail: Sugestões | ⏳ E92 | oculto até E92 |

### Tela 05 — Editor de Template (`TalkXTemplateEditor.tsx`)

| Item do mock / plano | Status | Arquivo / evidência |
|---|---|---|
| 3 colunas (biblioteca, editor, preview) | ✅ E43 | `TalkXTemplateEditor` 522L |
| Coluna esq: biblioteca filtrável | ✅ E43 | `libSearch` + `libCat` + lista com dot status |
| `activeTemplateId` sincroniza seleção | ✅ E43 | `activeTemplateId` state + `activeTemplate` derivado |
| Toolbar WA (Bold, Italic, Lista) | ✅ E43 | botões `*`, `_`, `- ` com `insertAtCursor` |
| Contador 1024 chars (vermelho >980) | ✅ E43 | `eContent.length` com classe condicional |
| Dirty-check (todos os campos) | ✅ E43 | inclui `custom_variables`, `media_url`, `tags` |
| Confirmação ao sair com edição suja | ✅ E43/CR | `window.confirm` no `loadTemplate` |
| ⌘S / ⌘Enter para salvar | ✅ E43 | `keydown` listener |
| Preview WhatsApp em tempo real (PhoneFrame) | ✅ E44 | moldura 272×540, bolha, hora real |
| Guard XSS no mediaUrl do preview | ✅ E44 | `/^https?:///i.test()` antes do `<img>` |
| `custom_variables`: chips + input | ✅ E45 | `eCustomVars` state + UI com input |
| `custom_variables` resolvidas no `talkx-send` | ✅ E45/CR | `personalize()` aceita `customVars[]` |
| Histórico de versões (snapshot, listagem 10, restore) | ✅ E46 | `talkx_template_versions` + `fetchVersionHistory` |
| Snapshot só quando content muda | ✅ E46/CR | `eContent !== activeTemplate?.content` |
| Versões limpas ao trocar template | ✅ E46/CR | `setVersions([])` em `loadTemplate` |
| Botão Testar (Dialog a11y, input número) | ✅ E47 | `Dialog` shadcn + `testTemplate()` hook |
| Testar envia `customVariables` | ✅ E47/CR | payload inclui `customVariables` |
| Importar templates (E48) | ✅ E48 | `handleImport` + CSV parser + JSON array |
| Limite 1024 chars por template importado | ✅ E48/CR | `row.content.length > 1024` |
| Variações A/B (sub-tab + peso + sorteio) | ✅ E49 | `talkx_template_variants` + `pickVariant()` + sub-seção |
| `duplicateTemplate` copia `custom_variables` | ✅ CR | campo presente no `insert` do `duplicateTemplate` |
| `evoFetch` args corretos no action=test | ✅ CR | `/message/sendText/${conn.instance_id}` como 3º arg |
| RLS versions: JOIN por `user_id` (não `id`) | ✅ CR | `prof.user_id = auth.uid()` na migration 20260909130000 |
| Enum `app_role`: `manager` substituído por `supervisor` | ✅ CR | `talkx-send/index.ts` |

### Migrações aplicadas (banco Cloud `tnnnlkbymytvtqngbbqh`)

| Migration | Conteúdo | Status |
|---|---|---|
| `20260909130000` | `custom_variables` + `talkx_template_versions` + RLS | ✅ aplicada |
| `20260909150000` | `talkx_template_variants` + `variant_id` em recipients | ✅ aplicada |

### Itens pendentes de fases futuras

| Item | Fase |
|---|---|
| Toggle grade/lista | E41 remanescente |
| Taxa de resposta real | E89 |
| Sugestões IA | E92 |
| Relatório por variante | E84 |
| Análise de resposta por variante A/B | após E88 |

