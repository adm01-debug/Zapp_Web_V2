# Auditoria exaustiva — Módulo Catálogo — 2026-09-29

**Objeto:** `docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md` (100 etapas, gerado em 11/09), validando o que
foi implementado por inteiro, o que ficou pela metade e o que nunca começou.
**Base auditada:** `main` @ `a4d8573` (29/09); banco ZAPP `tnnnlkbymytvtqngbbqh` ao vivo; banco PromoGifts
(MCP `SUPABASE - GESTÃO DE PRODUTOS`) ao vivo; 45 PRs com "catalog" no título (GitHub API, porque o clone é
raso e `git log` local só enxerga 1 commit do módulo).
**Método:** leitura integral do plano (2.022 linhas), do `CHANGELOG_CATALOGO.md`, `QA_E40_F3.md`, `ENVIO_E2E.md`,
`ARQUITETURA.md`, `COMPONENTES.md`; grep de cada critério de aceite contra `src/components/catalog/**`,
`src/hooks/integrations/useCatalog*`/`useExternalCatalog.ts`, `supabase/functions/promogifts-catalog/index.ts`,
`src/styles/components.css`, `scripts/ci/eslint-baseline.json`, `e2e/`, workflows; consultas SQL ao vivo nos dois
bancos. **Não rodei** `tsc`/`vitest` localmente (sem `node_modules` neste container) — os gates citados vêm do
changelog/QA e da CI das PRs mergeadas.

---

## 1. Resultado

| | Etapas |
|---|---|
| **DONE** | **41** |
| **DESCARTADO por decisão** (E54) | **1** |
| **PARCIAL** | **38** |
| **AUSENTE** | **20** |

O plano tem **0 checkbox marcado** (396 abertos) — o arquivo nunca foi atualizado; o estado real está espalhado
pelo changelog (só até a F5) e por notas de fechamento das Fases 6 e 7. As Fases 0–5 foram executadas de verdade
(30 PRs mergeadas entre 12/09 e 25/09); as Fases 6 e 7 foram **encerradas com escopo reduzido** por decisão do dono
do produto (PRs #583, #591, #614, #666); as Fases 8 e 9 **não começaram** — e é nelas que mora o objetivo do
módulo: **enviar produto pelo WhatsApp de ponta a ponta**.

| Fase | Etapas | ✅ | ⊘ | ◐ | ✗ |
|---|---|---|---|---|---|
| 0 Saneamento & base | E01–E10 | 7 | – | 3 | 0 |
| 1 Design system | E11–E20 | 10 | – | 0 | 0 |
| 2 Backend | E21–E30 | 7 | – | 2 | 1 |
| 3 Tela principal | E31–E40 | 7 | – | 3 | 0 |
| 4 Grid e lista | E41–E50 | 3 | – | 5 | 2 |
| 5 Rail + responsivo | E51–E58 | 4 | 1 | 1 | 2 |
| 6 Detalhes | E59–E68 | 0 | – | 8 | 2 |
| 7 Enviar produto | E69–E80 | 3 | – | 7 | 2 |
| 8 Contato & envio real | E81–E90 | 0 | – | 4 | 6 |
| 9 Chat, QA, e2e, release | E91–E100 | 0 | – | 5 | 5 |

---

## 2. Os 5 fatos que mudam a prioridade (medidos ao vivo em 29/09)

| # | Fato | Prova | Consequência |
|---|---|---|---|
| F1 | **O envio de produto nunca aconteceu em produção.** `catalog_send_events` = **0 linhas**; `messages` com `imagedelivery.net` = **0**; textos de template = **0**. Mesmo número do diagnóstico de 11/09 (seção 0 do plano). | SQL ZAPP | 18 dias de módulo em produção sem 1 envio real. A "prova de vida" do fluxo (E08/E85/E90) continua em aberto. |
| F2 | **O PromoGifts não sincroniza desde 05/09.** `max(products.last_sync_at)` = 2026-09-05 15:40 — 24 dias. | SQL PromoGifts | O chip "Sincronizado há…" do header (E32) mostra isso ao usuário; o alerta "sync > 3 dias" (E57) que avisaria não existe. Fora do escopo do ZAPP (é o importador do PromoGifts), mas o catálogo está servindo dado velho. |
| F3 | **`order_count` é 0 em 100% dos 7.722 produtos.** | SQL PromoGifts | A opção "Mais pedidos" do "Ordenar por" (`ExternalProductManagement.tsx:282`) é botão morto — o plano (E48.3) mandava ocultá-la se não houvesse dado. |
| F4 | **Tabelas do ZAPP com grants perigosos.** `catalog_favorites` e `catalog_send_events`: `anon` tem os 7 privilégios (SELECT…TRUNCATE) e `authenticated` tem `TRUNCATE/TRIGGER/REFERENCES`. RLS está ligada e as policies estão certas (PR #679), mas **`TRUNCATE` ignora RLS**. | `role_table_grants` | Mesmo achado do hardening do Team Chat (E09/E10 de lá). Qualquer JWT autenticado esvazia o log de envios e os favoritos. |
| F5 | **Números da seção 0 do plano envelheceram**: produtos ativos 7.576 → **7.722**; `new_30d` = 349; `low_stock` = 304; preço 0,32–1.776,80. | `zapp_catalog_stats()` | Não é bug (a RPC é viva), mas o plano e o `ARQUITETURA.md` citam os valores de 11/09 como se fossem fixos. |

---

## 3. Por etapa

Legenda: ✅ DONE · ◐ PARCIAL · ✗ AUSENTE · ⊘ DESCARTADO. Caminhos relativos a `src/components/catalog/` salvo indicação.

### Fase 0 — Saneamento & base (E01–E10) — 7 ✅ · 3 ◐
| E | St | Evidência |
|---|---|---|
| E01 | ✅ | `ESTADO_INICIAL.md`; PR #366 |
| E02 | ✅ | `docs/catalogo/*`, `scripts/catalog/validate-plan.mjs`, `catalog` em `COMPACT_GUTTER_VIEWS` (`src/pages/ViewRouter.tsx`) |
| E03 | ✅ | 7 legados + `useShoppingCart` ausentes; `LazyProductManagement` = 0; `useRecommendedProducts` segue em `products` local (decisão registrada); PR #367 |
| E04 | ✅ | `catalogShared.tsx`; 1 `formatPrice`; `ContactResult` em `useSendProduct.ts` + reexport |
| E05 | ✅ | `useExternalCatalog.ts` exporta `useExternalCatalog/useExternalProduct/useCatalogStats/useCatalogFavorites`; `invalidate()`/`isFetching` |
| E06 | ◐ | `useReducer` só em `ExternalProductCatalog.tsx`; `ExternalProductManagement.tsx` com 6 `useEffect` e 4 `eslint-disable`; `ExternalProductCatalog.tsx` **ainda no `eslint-baseline.json`**. O changelog admite: "reescrita completa com `useReducer` fica para a F3" — e a F3 não a fez |
| E07 | ✅ | 164 `it` em 9 arquivos de `__tests__/` + 94 do hook + 5 de favoritos |
| E08 | ◐ | `ENVIO_E2E.md` prova por leitura de código; **envio real nunca executado** (F1); apikey do MCP EVO inválida na época |
| E09 | ✅ | PR #367 mergeada 12/09 |
| E10 | ◐ | `ARQUITETURA.md` feito só na E25 (retroativo, admitido no arquivo); `graphify-out/` **não existe** no repo; mapa métrica→fonte ✓ |

### Fase 1 — Design system (E11–E20) — 10 ✅
16 classes `.catalog-*` em `components.css`; `catalogShared.tsx` exporta `resolveProductBadge/ProductBadge/
ColorSwatch/ColorChips/PriceTag/StockPill/LowStockPill/ProductThumb/FavoriteButton/CatalogKpiStrip/CategoryChips/
CatalogFilterBar/MetaTile/SectionCard` (+ `countAdvancedFilters/AdvancedFilterChips/TagMultiSelectChips` da E36);
`KpiCard compact` no Talk X (5 ocorrências); `COMPONENTES.md` completo; PR #370. **Ressalva:** `MetaTile`,
`SectionCard` e `ColorSwatch` foram entregues mas **ninguém os usa** (ver E62–E64) e `.catalog-phone`/
`.catalog-gallery-thumb` **não têm consumidor** (ver E74).

### Fase 2 — Backend (E21–E30) — 7 ✅ · 2 ◐ · 1 ✗
| E | St | Evidência |
|---|---|---|
| E21 | ✅ | `PRODUCT_FIELDS` com images/flags/swatches/expirações; `compact`; deployada (run 34661069952) |
| E22 | ✅ | 11 filtros no schema zod; `category.path like`; PRs #383/#577/#582/#621/#632 |
| E23 | ✅ | `textSearch('search_vector')` + `stripDiacritics`; `ilike` só em cor/material; `search_vector` 0 nulos ao vivo |
| E24 | ✅ | `zapp_catalog_stats()` SECDEF no PromoGifts (chamada ao vivo ok); ação `catalog_stats` com cache 60 s; `useCatalogStats` (dentro de `useExternalCatalog.ts`, não em arquivo próprio) |
| E25 | ✅ | categorias/fornecedores enriquecidos; achado "0 fornecedores com logo" registrado |
| E26 | ◐ | `bootstrap` ✓, `placeholderData: keepPreviousData` ✓; **rate limit continua 60/min para tudo** (`RATE_LIMIT = 60`, sem 120 para `list_products`) |
| E27 | ✅ | tabela, `UNIQUE(user_id, product_id)`, policy `FOR ALL TO authenticated` (#679), hook |
| E28 | ✅ | tabela, 2 policies, 5 índices, `logCatalogSendEvent` (6 refs), `useCatalogRecentSends` (3 consumidores) |
| E29 | ✗ | `catalogExport.ts` não existe; `grep -i csv src/components/catalog` vazio |
| E30 | ◐ | PR #383 mergeada; **testes Deno só de `buildTagOrExpr`** (`index.test.ts`, 87 linhas) — nenhuma das 6 ações tem teste |

### Fase 3 — Tela principal (E31–E40) — 7 ✅ · 3 ◐
| E | St | Evidência |
|---|---|---|
| E31 | ✅ | `grid-cols-[1fr_300px]/[1fr_320px]`, `catalog-rail sticky`, sem `ScrollArea`/`max-w-7xl`; PR #405 |
| E32 | ✅ | `ModuleHeader` + `SyncStatusChip` + "Gerenciar no PromoGifts"; "Novo Produto" omitido conforme regra (sem rota pública) |
| E33 | ✅ | `CatalogKpiStrip` ligado a `useCatalogStats`; 3 KPIs clicáveis, 3 informativos (decisão registrada) |
| E34 | ✅ | `CategoryChips` + deep link `cat=` + ícones curados (`catalogCategoryIcons.ts`); PRs #412/#415 |
| E35 | ◐ | `localStorage catalog.view` + `sessionStorage` ✓; **sem select em árvore com contagem, sem logo de fornecedor, sem atalho `/`** |
| E36 | ✅ | `CatalogAdvancedFilters.tsx` (Sheet, `Slider` de preço real, cor/material array, chips removíveis); #422/#577/#582 |
| E37 | ✅ | 7 opções; `relevance` cancelado com justificativa; **mas "Mais pedidos" é morto (F3)** |
| E38 | ✅ | `useCatalogQuickSearch.ts` com `product=`/`send=1` (#422/#680) |
| E39 | ◐ | vazio com/sem filtros + `AlertCard` erro + "Tentar" ✓; **sem estados para `CATALOG_UPSTREAM_ERROR`/`NOT_CONFIGURED`/`CREDENTIALS_INVALID` nem tratamento de 429** (grep vazio) |
| E40 | ◐ | `QA_E40_F3.md` ✓ (3.143 testes, bundle 336 KB); **`PARIDADE.md` não existe** (o README aponta para ele), sem prints |

### Fase 4 — Grid e lista (E41–E50) — 3 ✅ · 5 ◐ · 2 ✗
| E | St | Evidência |
|---|---|---|
| E41 | ✅ | `CatalogProductCard.tsx` com `.catalog-card/.catalog-media`, badge, coração, chips, `LowStockPill`, Kit, esgotado; `ExternalProductCard` é wrapper; #468/#470 |
| E42 | ◐ | modo `compact` + `Checkbox` ✓; **sem `RowActionsMenu`, sem cabeçalho sticky de colunas** |
| E43 | ✅ | `useCatalogFavorites` Supabase com otimista + rollback + toast; #471/#474 |
| E44 | ◐ | `CatalogProductCardSkeleton` ✓; **CLS nunca medido**; sem `opacity-60` + barra de progresso na paginação |
| E45 | ✅ | `TalkXPagination` + `pageSizes [24,48,96]` + `page=` + scroll-top; #472 |
| E46 | ✗ | zero `useVirtualizer`/`react-virtual` no módulo |
| E47 | ✗ | card sem menu de ações (só "Copiar SKU" no detalhe e "Copiar link" no envio); sem `Enter`/`e` no teclado |
| E48 | ◐ | expirações na edge ✓ (`is_*_expires_at`); **"Mais pedidos" exposto com `order_count` = 0 em todos** (F3); `new_or_recent` ✗ |
| E49 | ◐ | `CatalogBulkBar.tsx` só "Enviar (N)" + "Limpar"; **sem Exportar CSV, sem Favoritar, sem limite 10 explícito** |
| E50 | ◐ | PRs #468–#492 mergeadas; sem `PARIDADE.md`, sem Lighthouse |

### Fase 5 — Rail + responsivo (E51–E58) — 4 ✅ · 1 ⊘ · 1 ◐ · 2 ✗
| E | St | Evidência |
|---|---|---|
| E51 | ✅ | `CatalogRail.tsx`: banner com foto de destaque real, `CATALOG_RAIL_COPY`, CTA novidades; #563 |
| E52 | ✅ | `BarChart` `by_month`, delta condicional, paleta carvão |
| E53 | ✅ | 4 `MetaRow` reais, 3 clicáveis |
| E54 | ⊘ | descartado em 24/09 (edge não tem sync) — registrado no plano |
| E55 | ✗ | rail sem "Exportar catálogo / Importar planilha / Gerenciar categorias" (grep vazio) |
| E56 | ✅ | `RecentList` + top 3 de `catalog_send_events` (oculto com 0 linhas — hoje sempre oculto, F1); #563/#573 |
| E57 | ✗ | sem `AlertCard` de sync (>3 dias — hoje 24!), sem alerta de estoque baixo, sem `TipCard` |
| E58 | ◐ | rail `hidden xl:block` ✓; **sem `Accordion` < xl, sem `Drawer` em mobile, sem prints 1280/1024/768/390** |

### Fase 6 — Detalhes (E59–E68) — 0 ✅ · 8 ◐ · 2 ✗ · *encerrada com escopo reduzido (PR #583)*
| E | St | Evidência |
|---|---|---|
| E59 | ✗ | decisão: `Sheet` lateral em vez de modal 2 colunas (registrado no plano) |
| E60 | ◐ | contador "N / M", setas, zoom ✓; thumbs com `.catalog-gallery-thumb` ✗ (classe sem uso) |
| E61 | ◐ | "Copiar SKU" ✓; pills de tags/categoria ✗ |
| E62 | ✗ | `MetaTile` **nunca importado** por `ProductDetailDialog.tsx`; Qtd. mínima/Prazo/Origem aparecem como texto simples |
| E63 | ◐ | só dimensão/peso/origem/prazo/qtd/NCM; `SectionCard` **nunca importado**; sem material/capacidade/gravação/embalagem |
| E64 | ◐ | cores como texto; `ColorSwatch` **nunca importado**; sem estoque por cor nem clique→galeria |
| E65 | ◐ | lista estática + "previsão de entrada" ✓; sem agrupamento por cor nem seleção que troca o CTA |
| E66 | ◐ | fornecedor + "Enviar produto" no rodapé ✓; sem "Fechar" padrão do mock |
| E67 | ◐ | deep link `product=` ✓ (`ExternalProductManagement.tsx`); **sem ‹ › entre produtos** |
| E68 | ◐ | PR #583 mergeada; PARIDADE ✗; auditoria de 5 agentes (24/09) substituiu o QA |

### Fase 7 — Enviar produto (E69–E80) — 3 ✅ · 7 ◐ · 2 ✗ · *encerrada (PRs #591, #614, #666)*
| E | St | Evidência |
|---|---|---|
| E69 | ✗ | `SendProductDialog.tsx` sem `[1fr_380px]`; `CatalogSendDialog.tsx` não existe |
| E70 | ◐ | toggle "Variação" existe; sem card de info do mock |
| E71 | ◐ | seleção de variação por lista, não cards com foto/cor/estoque |
| E72 | ◐ | strip de fotos + contador (#591); "Adicionar fotos" ✗ |
| E73 | ✅ | tabs Formal/Informal/Promoção + contador 2000 + Editar |
| E74 | ◐ | preview existe **com cores literais** (`#075E54`, `#dcf8c6`, `#e5ddd5`, `bg-white`) em vez de `.catalog-phone`/`PhonePreview` (classe criada na E11, nunca usada) |
| E75 | ◐ | "Copiar link" ✓ (#666 corrigiu `send=1`); "Baixar" ✗; "Selecionar contato ▾" ✗ |
| E76 | ✗ | `ChatDialogs.tsx:60` continua chamando `ExternalProductCatalog` com o callback antigo `onSendProduct` — o chat **não usa** `SendProductDialog` |
| E77 | ✅ | rascunho em `sessionStorage` com `readDraft` validado + `key` por produto (#614, #666) |
| E78 | ✅ | `send=1&variant=` (#614), `deepLinkVariant` corrigido (#666), ⌘K com `send=1` (#680) |
| E79 | ◐ | `CatalogBulkSendDialog.tsx` (#490/#492) envia N produtos em sequência com progresso; **não é o fluxo multi do mock C** (sem seleção de fotos/modelo por produto) e não passa pelo passo D |
| E80 | ◐ | 5 achados críticos corrigidos (#666); PARIDADE ✗ |

### Fase 8 — Contato & envio real (E81–E90) — 0 ✅ · 4 ◐ · 6 ✗
| E | St | Evidência |
|---|---|---|
| E81 | ✗ | `ContactSelectionStep.tsx` (122 linhas) sem 2 colunas nem card-resumo; `CatalogContactStep.tsx` não existe |
| E82 | ◐ | busca + recentes existem (pré-plano); sem normalização de telefone, sem `InitialsAvatar`/radio, sem "Criar contato", sem "Enviados recentemente" |
| E83 | ✗ | nenhum "Resumo do envio" |
| E84 | ◐ | "Voltar" + "Enviando…" ✓; **sem checagem de conexão WhatsApp, sem opt-out/blacklist, sem `Ctrl+Enter`** |
| E85 | ◐ | `useSendProduct.ts:80-106`: **imagens com `content: ''` e texto separado (N+1 mensagens), sem caption, sem throttle** (`setTimeout` 1 só para UI); status `sent/partial/failed` ✓; `catalog_send_events` ✓ — mas **nunca exercitado** (F1) |
| E86 | ✗ | `sendProductUtils.ts` sem `{{nome}}`/`personalizePreview` |
| E87 | ◐ | 3 toasts via `use-toast` (não `sonner`); **sem "Abrir conversa", sem "Tentar de novo"**, sem invalidar recentes |
| E88 | ✗ | nenhum "Enviar produto" em contatos/CRM 360 |
| E89 | ✗ | view `catalog_send_stats` inexistente (0 refs) |
| E90 | ✗ | sem e2e real, sem PARIDADE |

### Fase 9 — Chat, QA, e2e, release (E91–E100) — 0 ✅ · 5 ◐ · 5 ✗
| E | St | Evidência |
|---|---|---|
| E91 | ◐ | `Tabs` (ui) com "Produtos/Favoritos" (`CatalogFavoritesTab.tsx`, #492); **sem aba "Enviados", sem `tab=` na URL, sem contagem nas abas** |
| E92 | ◐ | `ExternalProductCatalog.tsx` usa `CatalogFilterBar` mas mantém `ScrollArea`, `ExternalProductCard` antigo, sem paginação nova, sem chip "Meus favoritos"; ainda com `eslint-disable` e no baseline |
| E93 | ✗ | 0 `jest-axe`/`axe`; 0 `aria-live` no módulo |
| E94 | ◐ | bundle inicial 336 KB (#443) ✓; **modais não são `lazy`**, sem `content-visibility`, sem `PERF.md`, sem Lighthouse |
| E95 | ◐ | 263 testes no módulo (164 + 94 + 5); cobertura nunca medida; Deno só `buildTagOrExpr`; `Date.now()` em render (`ExternalProductManagement.tsx:54`, `SendProductDialog.tsx:147`) |
| E96 | ✗ | `e2e/catalog.spec.ts` não existe; `e2e-logado.yml` sem catálogo |
| E97 | ✗ | sem `CatalogHelpSheet` |
| E98 | ✗ | sem `PARIDADE.md`; 15 cores literais no módulo (`text-white` ×9, `violet-500` ×2, 3 hex do preview WhatsApp, `bg-white`) — só `bg-white` da mídia era exceção prevista |
| E99 | ◐ | RLS `TO authenticated` (#679) e bypass de `anon` (#684→#714) corrigidos; **grants `anon`/`TRUNCATE` continuam (F4)**; sem `SECURITY.md`; 429 não tratado na UI; Sentry sem breadcrumbs `catalog.*` |
| E100 | ✗ | sem tag `catalog-v1.0.0`, sem `HANDOFF_v1.md` |

---

## 4. Achados fora do plano

1. **Primitivos órfãos do design system**: `MetaTile`, `SectionCard`, `ColorSwatch` (código) e `.catalog-phone`,
   `.catalog-gallery-thumb` (CSS) foram entregues na F1 e nunca ligados nas F6/F7 — o mesmo padrão "cria e não liga"
   visto no Team Chat, em menor escala.
2. **Dois caminhos de envio coexistem**: a tela do catálogo usa `SendProductDialog` → `useSendProduct` → `catalog_send_events`;
   o chat (`ChatDialogs.tsx`) usa `ExternalProductCatalog` → `onSendProduct` do inbox, **sem log, sem rascunho, sem
   deep link** — tudo que a F7 corrigiu não vale para quem envia pelo chat.
3. **`use-toast` vs `sonner`**: `useSendProduct.ts` usa `@/hooks/ui/use-toast`; o resto do módulo usa `sonner`.
4. **Grants de `anon`/`TRUNCATE`** nas 2 tabelas (F4).
5. **`zapp_catalog_stats()` no PromoGifts tem `GRANT EXECUTE` para `authenticated`** — o plano (E24.2) pedia só o
   role da service key. Como o `anon` do PromoGifts é negado nas tabelas, o risco é baixo, mas é superfície a mais.
6. **Doc desatualizada**: `README.md` do módulo aponta para `PARIDADE.md` (inexistente); `CHANGELOG_CATALOGO.md`
   para em E56 (F5) — as PRs #577–#714 (F6, F7, correções) não estão nele; o plano tem 0/396 checkboxes.
7. **Sync do PromoGifts parado há 24 dias** (F2) — problema do importador, mas o catálogo não avisa.

---

## 5. O que falta (consolidado) → plano novo

`docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md` (100 etapas, prefixo `CT-`). Ordem:

1. **Provar o envio** (F1): hardening dos grants, e2e real com número de teste, caption + throttle, log verificado.
   Sem isso o módulo é uma vitrine.
2. **Unificar o envio do chat** com o fluxo do catálogo (achado 2) — hoje metade dos envios sairia sem log.
3. **Fechar a Fase 8** (contato, resumo, personalização, pós-envio com link, CRM 360, métricas).
4. **Ligar os órfãos da F1** nas telas de detalhe e envio (achado 1) e limpar cores literais.
5. Pendências pequenas das F2–F5 (CSV, rail de ações/alertas, virtualização, menu do card, responsivo).
6. Fase 9 (abas, chat, a11y, perf, testes, e2e, ajuda, paridade, hardening, release).

---

## 6. Evidências (comandos, 29/09)

```
GitHub search: repo:adm01-debug/Zapp_Web_V2 is:pr catalog in:title → 45 PRs (30 feat/fix mergeadas 12–25/09)
grep -c '^\s*- \[x\]' PLANO_IMPLEMENTACAO_CATALOGO_100.md → 0 ; '- \[ \]' → 396
SELECT count(*) FROM catalog_send_events → 0 ; FROM catalog_favorites → 0
SELECT count(*) FROM messages WHERE media_url ILIKE '%imagedelivery.net%' → 0
role_table_grants catalog_* p/ anon → 7 privilégios ; p/ authenticated → inclui TRUNCATE/TRIGGER/REFERENCES
PromoGifts: max(last_sync_at) → 2026-09-05 15:40 ; count(order_count > 0) → 0 ; products ativos → 7722
pg_proc zapp_catalog_stats → SECDEF, acl {postgres, authenticated, service_role}
grep -o "^\.catalog-[a-z-]*" src/styles/components.css | sort -u | wc -l → 16
grep -rl "useVirtualizer\|react-virtual" src/components/catalog → vazio
grep -rn "catalog-phone\|MetaTile\|SectionCard\|ColorSwatch" ProductDetailDialog.tsx SendProductDialog.tsx → vazio
grep -n "SendProductDialog" src/components/inbox/chat/ChatDialogs.tsx → vazio (usa ExternalProductCatalog + onSendProduct)
grep -rno "#[0-9a-fA-F]{6}|bg-white|text-white|violet-500" src/components/catalog --include=*.tsx | grep -v __tests__ | wc -l → 15
grep -o '"src/[^"]*catalog[^"]*"' scripts/ci/eslint-baseline.json → ExternalProductCatalog.tsx
ls e2e | grep -i catal → vazio ; ls docs/catalogo/PARIDADE.md → não existe
```
