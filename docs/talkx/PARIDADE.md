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


---

## FASE 5 — SUPRESSÃO / OPT-OUT (E51–E59) · tela 06

### Tela 06 — Lista de Supressão (`TalkXSuppression.tsx`)

| Item do mock / plano | Status | Arquivo / evidência |
|---|---|---|
| Campo `phone` avulso (sem contact) | ✅ E51 | `talkx_blacklist.phone text`, nullable `contact_id`, CHECK phone OR contact_id |
| Enum `reason_code` (opt_out/invalid_number/manual/lgpd/no_commercial_permission/bounce) | ✅ E51 | tipo `talkx_blacklist_reason` + migration 20260910090000 |
| Campo `expires_at` (supressão temporária) | ✅ E51 | `expires_at timestamptz`; query ativa filtra expires_at IS NULL OR > now() |
| Unique parcial em `phone` (WHERE removed_at IS NULL) | ✅ E51/CR | `talkx_blacklist_phone_active_unique` |
| Hook `useTalkXSuppression` (isSuppressed 2 passos) | ✅ E51 | `src/hooks/integrations/useTalkXSuppression.ts` |
| UI: phone avulso + reason_code pill + coluna Expira em | ✅ E52 | `TalkXSuppression.tsx` |
| CSV import direto por phone (sem contact lookup) | ✅ E53 | `handleImportCSV` v2 |
| Search digit guard | ✅ E53/CR | `qNum.length > 0` antes de phone.includes |
| Export CSV com fallback `b.phone` | ✅ E53/CR | `b.contacts?.phone ?? b.phone ?? ''` |
| Filtro phone-based no wizard + expires_at | ✅ E54 | `blacklistData.phones` em `useCampaignEditor.ts` |
| Card Motivos (top 3 reason_code) + Card Expiram em breve | ✅ E55 | `TalkXSuppression.tsx` rail |
| Soft-delete removed_by + removed_at | ✅ E56 | migration 20260910080000 + `removeMutation` UPDATE |
| UPDATE RLS com `is_admin_or_supervisor` | ✅ E56/CR | policy `talkx_blacklist_update` |
| removed_at IS NULL nos enforcement paths | ✅ E56/CR | `useCampaignEditor` + `talkx-send` |
| auto_optout no CHECK constraint | ✅ E57 | migration 20260910080000 |
| Opt-out por keyword (SAIR/STOP/CANCELAR/etc.) gateado 30d | ✅ E57/CR | `evolution-webhook-messages.ts` |
| resolvedPhone via bestJid + r.contacts?.phone | ✅ E57/CR | `evolution-webhook-messages.ts` + `talkx-send` |
| Notificação de confirmação ao contato após opt-out | ✅ E59 | `evoFetch` com texto PT-BR |
| Toggle Ativas / Histórico + tabela removed_by profile | ✅ E58 | `TalkXSuppression.tsx` |

### Migrações Fase 5 aplicadas

| Migration | Conteúdo | Status |
|---|---|---|
| `20260910090000` | phone, reason_code enum, expires_at, source_message_id, unique index | ✅ |
| `20260910080000` | removed_by, removed_at, auto_optout constraint, UPDATE RLS | ✅ |

### EFs deployadas (Fase 5)

| EF | Conteúdo |
|---|---|
| `talkx-send` | pickVariant A/B + filtro removed_at + blacklistPhones |
| `evolution-webhook` | opt-out keyword + gate 30d + notificação E59 |
