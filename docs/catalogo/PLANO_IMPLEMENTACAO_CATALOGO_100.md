# Catálogo · ZAPP Web V2 — Plano de Implementação em 100 Etapas

**Repo:** `adm01-debug/Zapp_Web_V2` · **main na geração:** `9c99b164` · **Deploy:** Vercel `zapp-web-v2.vercel.app/?view=catalog`
**DB canônico:** Supabase Cloud `tnnnlkbymytvtqngbbqh` (MCP `SUPABASE - ZAPP WEB V2 - MCP`) · **DB externo (PromoGifts):** MCP `SUPABASE - GESTÃO DE PRODUTOS`
**Referência visual:** `docs/catalogo/screens/` — A = catálogo, B = detalhes, C = enviar produto, D = selecionar contato, 00 = estado atual em produção
**Design:** carvão (tokens de `src/styles/tokens.css:323+`); o mock navy é só composição
**Gerado:** 2026-09-11 · **Autor:** Claude (sessão CATÁLOGO - 01)

---

## 0. Estado real verificado em 2026-09-11

| # | Fato verificado | Onde |
|---|---|---|
| 1 | **Nenhum trabalho de sessão anterior existe no repo.** Não há branch `catalog*`, nenhum `docs/catalogo/`, e o último commit de design em `src/components/catalog/` é de junho (era Lovable). Commits recentes na pasta são fixes transversais (a11y alt, TS baseline, `useSendProduct` parcial). O plano parte de `main`. | `github_list_branches`, `github_list_commits path=src/components/catalog` |
| 2 | `?view=catalog` → `lazyViews.ProductManagement` → `ExternalProductManagement.tsx`. Os params `wizard=new&step=1` na URL são resíduo do deep link do Talk X; o catálogo não os lê. | `ViewRouter.tsx:39`, `lazyViews.ts:13` |
| 3 | 16 arquivos em `src/components/catalog/`: fluxo externo real (`ExternalProductManagement`, `ExternalProductCatalog` [dialog do chat], `ExternalProductCard`, `ProductDetailDialog`, `SendProductDialog`, `ContactSelectionStep`, `sendProductUtils`, `useSendProduct`) + legado de produtos locais (`ProductManagement`, `ProductCatalog`, `ProductCard`, `ProductForm`, `ShoppingCart`, `ProductMessage`, `useProductManagement`) + `WhatsAppTemplatesManager` (view `wa-templates`, fora do escopo). **Grafo verificado na E01** (`ESTADO_INICIAL.md`): nenhum componente importa os legados; `ProductCard`/`ShoppingCart` só exportam tipos para `src/hooks/business/useShoppingCart.ts`, que só é re-exportado em `hooks/business/index.ts` e testado — cadeia inteira removível. `LazyRoutes.tsx` exporta `LazyProductManagement` sem consumidor. `src/hooks/chat/useRecommendedProducts.ts` (AiTab) lê a tabela **local** `products` do ZAPP — a tabela local fica. | árvore de `main`, grep no VPS |
| 4 | Fonte de dados: edge `promogifts-catalog` com 4 ações (`list_products`, `get_product`, `list_categories`, `list_suppliers`), auth por JWT do usuário, rate limit 60/min/usuário, busca `ilike` em `name/sku/brand`, ordenação só por `name` na UI. `PRODUCT_FIELDS` **não** traz `images[]`, `is_featured`, `is_new`, `is_bestseller`, `materials`, `tags`, `color_swatches`, `engraving_type`, `created_at`, `last_sync_at`, `order_count` — todos os badges/ficha/galeria do mock dependem disso. | `supabase/functions/promogifts-catalog/index.ts:38-44` |
| 5 | DB externo (`products`): **7.576 ativos** (bate com a UI), 6.040 em estoque, 2.147 `is_featured`, 252 `is_new` (178 criados em 30 d), 596 `is_bestseller`, 0 `is_on_sale`, 978 kits, 5.750 com >1 imagem, 7.243 com `color_swatches`, 7.386 com `materials`, 3.531 com `engraving_type`, 308 com estoque 1–10, `max(last_sync_at)`=2026-09-05 15:40, `max(updated_at)`=2026-09-11 10:20. 478 categorias (28 raiz; têm `icon`, `image_url`, `color_hex`, `products_count`, `level`, `path`, `full_path_readable`), 5 fornecedores (4 com produto ativo; têm `logo_url`, `low_stock_threshold`), 19.635 variantes ativas (`images`, `color_hex`, `selected_thumbnail`, `next_entry_date/quantity`). `search_vector` tsvector existe e não é usado. Existem `product_images`, `v_catalog_stats`, `user_favorites`, `product_views` (colunas ainda não lidas). | `execute_sql` no MCP GESTÃO DE PRODUTOS |
| 6 | **Tudo do mock tem backend real** exceto: "Importar planilha" e "Novo Produto" (catálogo é somente-leitura no ZAPP — viram links para o PromoGifts), o banner de marketing (conteúdo estático, não é métrica) e o "+12%" (só entra se calculado de `created_at` por mês). | idem |
| 7 | DB ZAPP: **não** há tabela de favoritos nem de log de envio de produto. `messages` tem **0** imagens `imagedelivery.net` e **0** textos do template informal → o fluxo "Enviar produto" nunca foi usado em produção (ou nunca funcionou ponta a ponta). 1.968 contatos com telefone. | `db_batch_query` |
| 8 | `useExternalCatalog.ts`: filtros em `useState` + react-query com `enabled: ready`; `fetchCategories/fetchSuppliers` só fazem `setReady(true)`. Componentes têm `useEffect` sem deps completas → dívida de `react-hooks/exhaustive-deps`/`set-state-in-effect`. `formatPrice` duplicado 3×, `ProductImage`+`handleImageError` duplicados 2×, `ContactResult` duplicado em `sendProductUtils.ts` e `useSendProduct.ts`. | leitura dos arquivos |
| 9 | Layout atual: `max-w-7xl mx-auto` + `ScrollArea h-[calc(100vh-320px)]` dentro do `ViewContainer` (scroll duplo); `catalog` não está em `COMPACT_GUTTER_VIEWS`; header é `<h1>` cru; grid `xl:grid-cols-5` sem rail; badges shadcn genéricos; sem favoritos, KPIs, chips de categoria, ordenação ou filtros avançados. | `ExternalProductManagement.tsx` |
| 10 | Primitivos prontos para reuso: `talkxShared.tsx` (`IconTile`, `ModuleHeader`, `KpiCard`+skeleton, `HeroCard`, `RailCard`, `RailAction`, `RecentList`, `TipCard`, `AlertCard`, `FilterBarV2`, `SegmentedToggle`, `TalkXPrimaryButton`, `RowActionsMenu`, `TalkXTable`, `TalkXPagination`, `TalkXConfirmDialog`, `StatusPill`, `WhatsAppBubble`, `MetaRow`, estados vazio/erro) e `dashboard/overview/DashboardCard.tsx` (`DashboardCard`, `SectionHeader`, `Pill`, `InitialsAvatar`, `PrimaryButton`, `GhostButton`, `ProgressBar`, `StatusChip`, `CardSelect`); `DashboardKpiCard`, `DashboardTabs`. Libs: framer-motion, recharts, @tanstack/react-virtual, @hello-pangea/dnd, cmdk, vaul, sonner, zod, date-fns. | repo |
| 11 | Tokens carvão (`.dark`): `--background 240 6% 6%`, `--card 240 5% 10%`, `--card-elevated 240 5% 13%`, `--border 240 4% 18%`, `--primary 221 83% 53%`, `--primary-glow 230 83% 63%`, `--success 142 71% 45%`, `--warning 40 91% 60%`, `--destructive 354 100% 68%`, `--info 213 94% 62%`; glows `--glow-primary-*`; radius `md .5rem / lg .75rem / xl 1rem`. Classes `.talkx-*` em `components.css:154+`. | `src/styles/tokens.css`, `components.css` |
| 12 | **Infra:** o container `claude-code` estava com `replicas=0` — pausado às 16:28Z de 11/09 pelo `disk-actioner` (tier `important`, disco a 84%). Reativado (replicas 1) e `docker image prune -a --filter until=48h` liberou 8,6 GB → **79%**, 40,5 GB livres. O actioner volta a pausar o container se o disco cruzar 80% (HIRES) e a próxima faixa. **Gates na E01** (main `33d02292`): `tsc` 0 · lint-ratchet 1189→1129, novas 0 · `useExternalCatalog.test.ts` 94/94 · eslint no catálogo 17 (exhaustive-deps 8, set-state-in-effect 5, no-restricted-imports 3, immutability 1); `useExternalCatalog.ts` já em 0. | Portainer `kivlbow1a5mx…`, logs `disk-actioner`/`disk-monitor` |
| 13 | Guarda de CI `scripts/db-audit/supabase-usage-guard` + `catalog.sql`/`manifest.sql` + `schema-catalog.json`/`schema-manifest.json`: tabela nova no DB ZAPP quebra o CI se não for catalogada. `src/hooks/__tests__/useExternalCatalog.test.ts` (47 KB) precisa continuar verde ao mexer no hook. | `scripts/db-audit/`, handoff Talk X |

---

## Regras do plano (valem para as 100 etapas)

1. **Carvão fica.** Fundos só com `--background`, `--card`, `--card-elevated`, `--border`, `--input`. Onde o mock é navy, aqui é carvão. Nenhum token novo de fundo. Área da foto do produto pode ser branca (`bg-white`) — foto de produto tem fundo branco por natureza e já é assim hoje.
2. **Azul do mock = acento:** `--primary`/`--primary-glow` em tiles, botão primário, chip de categoria ativa, anel de seleção, barras do gráfico, glows. Badges: Em estoque `success`, Mais vendido `primary`, Novidade `violet-500`, Destaque `warning`, Esgotado `destructive`.
3. **Zero número fabricado.** Toda métrica vem de `products`/`categories`/`suppliers` (externo), `catalog_favorites`/`catalog_send_events`/`messages`/`contacts` (ZAPP) ou de RPC. Métrica sem backend → a etapa de backend (Fase 2) vem antes; até lá o componente não renderiza.
4. **Diff mínimo.** Estender `talkxShared`/`DashboardCard` com props opcionais; primitivos novos do catálogo vivem em um único `catalogShared.tsx`. Não renomear/mover o que já existe; `ExternalProductCatalog` (dialog do chat) continua funcionando durante toda a migração.
5. **1 etapa = 1 commit** `feat(catalog): E<nn> <título>`; branches `feat/catalog-f<N>-<nome>`, PR pequeno para `main`, squash.
6. **Gate de toda etapa:** `npx tsc --noEmit -p tsconfig.app.json` = 0 · `node scripts/ci/lint-ratchet.mjs` = 0 novas · `npx vitest run src/components/catalog src/hooks/__tests__/useExternalCatalog.test.ts` verde · checklist 100%.
7. **Escrita:** `GITHUB - MCP - FOREVER` (`github_push_files`) ou `git` no VPS. **DDL no ZAPP:** `db_apply_migration` do MCP `SUPABASE - ZAPP WEB V2` (aplica e registra em `supabase_migrations.schema_migrations` **atomicamente** — sem workaround manual, essa pane é só do self-hosted AtomicaBR) + arquivo espelho em `supabase/migrations/`. **Cadastro no guard:** `scripts/db-audit/catalog.sql` e `manifest.sql` são consultas geradoras (não listas para editar à mão) — rodar o conteúdo de cada uma via `db_batch_query` (mesmo MCP) e commitar o resultado em `supabase/schema-catalog.json`/`schema-manifest.json`. **DDL no externo (PromoGifts):** só objetos aditivos read-only (`view`/`function` `security definer` com `search_path` fixo) via `apply_migration` do MCP GESTÃO DE PRODUTOS; nunca alterar `products`.
8. Shell `dash`; sem Python no `claude-code`; tarefa pesada via `claude -p '…' --model sonnet`. Antes de rodar gates, checar `df -h /workspace` — se ≥ 80%, rodar `docker image prune -a -f --filter until=48h` no host, senão o actioner pausa o container no meio do build.
9. Nomes: componentes `src/components/catalog/Catalog<Nome>.tsx`, primitivos em `catalogShared.tsx`, hooks `src/hooks/integrations/useCatalog<Nome>.ts`, CSS `.catalog-*`, RPC externa `public.zapp_catalog_<verbo>`, tabelas ZAPP `catalog_<objeto>`.
10. Antes de grep estrutural: `graphify explain "ExternalProductManagement.tsx"` (após rebuild da E10).

---

## Mapa de fases

| Fase | Etapas | Entrega | Mock |
|---|---|---|---|
| 0 · Saneamento & base | E01–E10 | gates verdes, legado removido, hook sem dívida, helpers únicos, testes base, branch, grafo | — |
| 1 · Design system do catálogo (carvão) | E11–E20 | `catalogShared.tsx` + `.catalog-*` alinhados ao mock sem tokens novos | A, B |
| 2 · Backend | E21–E30 | edge v2 (campos, filtros, ordenação, stats, FTS), favoritos e log de envio no ZAPP, RLS, guardas de CI | — |
| 3 · Tela principal: header, KPIs, chips, filtros | E31–E40 | topo da tela A completo com dados reais | A |
| 4 · Grid e lista de produtos | E41–E50 | card e linha iguais ao mock, badges reais, favoritos, paginação/ordenação | A |
| 5 · Rail direito + responsivo | E51–E58 | banner, Resumo do catálogo (gráfico real), Ações rápidas, colapso < 1280 | A |
| 6 · Modal de detalhes | E59–E68 | galeria, ficha técnica, cores, variantes, rodapé | B |
| 7 · Enviar Produto | E69–E80 | 2 colunas, fotos, modelo, preview WhatsApp, variação | C |
| 8 · Selecionar contato & envio real | E81–E90 | lista, resumo do envio, envio via fila atômica, log, toasts | D |
| 9 · Chat, favoritos, QA, a11y, e2e, release | E91–E100 | dialog do chat unificado, aba Favoritos, PARIDADE, e2e, tag v1.0.0 | A–D |

---

# FASE 0 — SANEAMENTO & BASE (E01–E10)

### E01 · Diagnóstico de gates e disco no VPS
**Objetivo:** saber de onde parte; nada de patch antes disso.
**Arquivos:** —
1. `cd /workspace/repos/Zapp_Web_V2 && git fetch && git checkout main && git pull` → confirmar HEAD `9c99b164`+.
2. `df -h /workspace` → registrar %; se ≥ 80% rodar `docker image prune -a -f --filter until=48h` no host e registrar ganho.
3. `npx tsc --noEmit -p tsconfig.app.json | grep -c "error TS"` → anotar.
4. `node scripts/ci/lint-ratchet.mjs` → anotar violações em `src/components/catalog` e `src/hooks/integrations/useExternalCatalog.ts`.
5. `npx vitest run src/hooks/__tests__/useExternalCatalog.test.ts` → anotar.
6. `npx eslint src/components/catalog src/hooks/integrations/useExternalCatalog.ts` → listar regras por arquivo.
7. `grep -rn "components/catalog/" src/ --include=*.ts --include=*.tsx | grep -v "^src/components/catalog"` → mapa de importadores.
8. Verificar edge deployada: `deployment-manifest.json` contém `promogifts-catalog`.
9. Registrar tudo em `docs/catalogo/ESTADO_INICIAL.md`.
10. Commit `docs(catalog): E01 estado inicial verificado`.
**Checklist**
- [ ] disco < 80% ou prune feito
- [ ] contagens de tsc/ratchet/vitest anotadas
- [ ] mapa de importadores da pasta catalog
- [ ] `ESTADO_INICIAL.md` commitado

### E02 · Branch de trabalho e estrutura de docs
**Objetivo:** isolar o trabalho e criar o índice do módulo.
**Arquivos:** `docs/catalogo/README.md`, `docs/catalogo/CHANGELOG_CATALOGO.md`
1. `git checkout -b feat/catalog-f0-base origin/main`.
2. Criar `docs/catalogo/` com `README.md` (índice), `CHANGELOG_CATALOGO.md` e este plano.
3. Salvar os PNGs em `docs/catalogo/screens/`.
4. Adicionar `catalog` em `COMPACT_GUTTER_VIEWS` do `ViewRouter.tsx` (mesma densidade do dashboard/talkx).
5. Verificar visualmente que o gutter reduziu e nada quebrou.
6. Adicionar seção "Catálogo" no `docs/README.md` apontando para `docs/catalogo/`.
7. Script `scripts/catalog/validate-plan.mjs` que conta 100 etapas × 10 sub-etapas × checklist.
8. Rodar o script → 100/100.
9. `tsc`/ratchet.
10. Commit `feat(catalog): E02 branch f0, docs e gutter compacto`.
**Checklist**
- [ ] branch criado
- [ ] plano e prints no repo
- [ ] validate-plan 100/100
- [ ] gates verdes

### E03 · Remover legado órfão de produtos locais
**Objetivo:** só o fluxo externo na pasta.
**Arquivos:** `ProductManagement.tsx`, `ProductCatalog.tsx`, `ProductCard.tsx`, `ProductForm.tsx`, `ShoppingCart.tsx`, `ProductMessage.tsx`, `useProductManagement.ts`, `src/hooks/business/useShoppingCart.ts` (+ teste e barrel), `src/components/performance/LazyRoutes.tsx`
1. Grafo já verificado na E01 (`ESTADO_INICIAL.md`): remover os 7 legados da pasta + `src/hooks/business/useShoppingCart.ts`, `src/hooks/__tests__/useShoppingCart.test.ts` e a linha `export * from './useShoppingCart'` em `src/hooks/business/index.ts`; remover `LazyProductManagement` de `LazyRoutes.tsx`.
2. Confirmar que `WhatsAppTemplatesManager.tsx` **fica** (view `wa-templates`).
3. Manter `src/hooks/chat/useRecommendedProducts.ts` (AiTab lê a tabela local `products`); registrar em `ARQUITETURA.md` que migrá-lo para o PromoGifts é etapa extra fora desta E03.
4. `git rm` dos órfãos; grep final zero.
5. Manter `products` em `catalog.sql`/`manifest.sql` (ainda lida por `useRecommendedProducts`); `usage-guard` continua verde.
6. `tsc` 0; ratchet 0 novas (remoção reduz dívida — atualizar baseline).
7. `vitest` geral rápido: `npx vitest run src/components/catalog src/hooks`.
8. Atualizar os 3 testes "GAP" tautológicos em `useExternalCatalog.test.ts:1099-1106` (não citar arquivos removidos) e `FUNCTIONALITIES_INVENTORY.md` se listar os legados.
9. CHANGELOG.
10. Commit `chore(catalog): E03 remove legado de produtos locais`.
**Checklist**
- [ ] zero imports dos removidos
- [ ] `WhatsAppTemplatesManager` intacto
- [ ] usage-guard passa
- [ ] commit

### E04 · Unificar helpers duplicados
**Objetivo:** um lugar para `formatPrice`, `ProductImage`, `ContactResult`.
**Arquivos:** `src/components/catalog/catalogShared.tsx` (novo), `ExternalProductCard.tsx`, `ProductDetailDialog.tsx`, `sendProductUtils.ts`, `useSendProduct.ts`
1. Criar `catalogShared.tsx` exportando `formatPrice`, `formatStock`, `ProductImage` (com fallback `Package`), `handleImageError`.
2. `ExternalProductCard`/`ProductDetailDialog` importam de lá; apagar cópias locais.
3. `ContactResult` fica em `useSendProduct.ts`; `sendProductUtils.ts` reexporta o tipo.
4. `ProductImage` ganha prop opcional `fallbackSrc` (usa `primary_image_fallback_url` quando vier na E21).
5. Testes unitários de `formatPrice` (R$ 63,78) e `formatStock`.
6. Sem mudança visual — screenshot antes/depois idêntico.
7. `tsc`/eslint.
8. vitest.
9. CHANGELOG.
10. Commit `refactor(catalog): E04 helpers únicos em catalogShared`.
**Checklist**
- [ ] 1 `formatPrice`, 1 `ProductImage`, 1 `ContactResult`
- [ ] testes dos helpers
- [ ] zero diff visual
- [ ] commit

### E05 · `useExternalCatalog` sem dívida de hooks
**Objetivo:** zerar `exhaustive-deps`/`set-state-in-effect` na camada de dados sem mudar comportamento.
**Arquivos:** `src/hooks/integrations/useExternalCatalog.ts`, `src/hooks/__tests__/useExternalCatalog.test.ts`
1. Manter API pública (`products`, `totalProducts`, `fetchProducts`, `fetchProduct`, …) — o teste de 47 KB cobre o contrato.
2. Substituir `ready` por `enabled: filters !== null` (filtros iniciais `null`).
3. Expor `isFetching` separado de `loading` (para não piscar skeleton na paginação).
4. Expor `invalidate()` (`queryClient.invalidateQueries(['external-catalog'])`) para "Sincronizar".
5. `fetchCategories`/`fetchSuppliers` viram no-op documentado (mantidos por compatibilidade).
6. Rodar o teste existente; ajustar só mocks, não expectativas.
7. eslint no arquivo = 0.
8. `tsc`.
9. CHANGELOG.
10. Commit `refactor(catalog): E05 useExternalCatalog sem dívida de hooks`.
**Checklist**
- [ ] API pública inalterada
- [ ] teste de 47 KB verde
- [ ] eslint 0 no hook
- [ ] commit

### E06 · Componentes sem `useEffect` de sincronização
**Objetivo:** zerar `set-state-in-effect` em `ExternalProductManagement`, `ExternalProductCatalog`, `SendProductDialog`, `ProductDetailDialog`.
**Arquivos:** os 4
1. Filtros em um `useReducer` único `{search, categoryId, supplierId, onlyInStock, page, sort}`; mudança de filtro zera `page` no reducer (não em effect).
2. Debounce da busca com `useDebouncedValue(search, 300)` (verificar hook existente em `src/hooks/ui/`; criar se não houver).
3. `fetchProducts` chamado por derivação (`useEffect` único com deps completas) — ou passar filtros direto ao hook (E05 aceita `filters` como argumento).
4. `SendProductDialog`: `fullProduct` derivado via `useQuery` de `fetchProduct` em vez de `useState`+`useEffect`.
5. `selectedImages` inicializado por `key` do produto (reset por remontagem), não por effect.
6. `ProductDetailDialog` idem.
7. eslint = 0 nos 4 arquivos; ratchet 0 novas e baseline reduzido.
8. Smoke manual: busca, categoria, página 2, abrir detalhes, abrir enviar.
9. CHANGELOG.
10. Commit `refactor(catalog): E06 componentes sem set-state-in-effect`.
**Checklist**
- [ ] `useReducer` de filtros
- [ ] eslint 0 nos 4 arquivos
- [ ] smoke manual ok
- [ ] commit

### E07 · Suíte de testes base do catálogo
**Objetivo:** rede de segurança antes do redesign.
**Arquivos:** `src/components/catalog/__tests__/Catalog.test.tsx`, `sendProductUtils.test.ts`
1. Mock de `useExternalCatalog` com 3 produtos (1 esgotado, 1 kit, 1 com 3 cores).
2. Render `ExternalProductManagement`: título, contagem, cards.
3. Busca digitada → `fetchProducts` chamado com `search` após debounce.
4. Toggle lista/grade muda a classe do container.
5. "Limpar filtros" reseta o reducer.
6. `buildMessage` para os 3 templates (snapshot).
7. `groupVariantsByColor` agrupa e coleta thumbs sem duplicar.
8. `collectAllImages` inclui principal + thumbs.
9. `ContactSelectionStep`: botão desabilitado sem contato.
10. Commit `test(catalog): E07 suíte base`.
**Checklist**
- [ ] ≥ 20 `it` verdes
- [ ] mocks isolados de rede
- [ ] roda em < 10 s
- [ ] commit

### E08 · Verificação ponta a ponta do envio atual
**Objetivo:** provar (ou não) que "Enviar produto" funciona hoje, já que `messages` não tem nenhum envio.
**Arquivos:** `useSendProduct.ts`, `src/services/outbound-message.service.ts`
1. Ler `sendOutboundMessage` e a fila atômica (PR #330) — confirmar que `mediaUrl` externo (`imagedelivery.net`) é aceito sem re-upload.
2. Enviar 1 produto para um número de teste da Promo Brindes pela UI atual.
3. Verificar em `messages` a linha `image` com `media_url` e a `text`; verificar `status` após 30 s.
4. Verificar no WhatsApp real que imagem e texto chegaram.
5. Se falhar: registrar causa raiz em `docs/catalogo/ENVIO_E2E.md` e corrigir dentro da E08 (diff mínimo no service).
6. Confirmado por leitura de código (sem enviar nada): `external_id` é gravado pelo backend
   (`message-delivery`, via RPC de conclusão), independente do que o frontend faz com o
   retorno de `sendOutboundMessage` — não há fix pendente aqui.
7. Decidir: caption da 1ª imagem = mensagem (1 envio em vez de N+1)? Documentado em
   `docs/catalogo/ENVIO_E2E.md`; **não** mudar ainda (E85).
8. Apagar as mensagens de teste ou marcar `is_deleted`.
9. CHANGELOG.
10. Commit `docs(catalog): E08 envio e2e verificado`.
**Checklist**
- [ ] envio real comprovado (ou causa raiz documentada e corrigida)
- [ ] `messages` com `external_id`
- [ ] `ENVIO_E2E.md`
- [ ] commit

### E09 · PR da Fase 0 + deploy
**Objetivo:** base limpa em `main`.
**Arquivos:** —
1. `git rebase origin/main`; resolver conflitos.
2. Gates completos + `npx vite build`.
3. PR `feat/catalog-f0-base → main` com resumo das E01–E08.
4. Aguardar CI (typecheck-ratchet, lint-ratchet, usage-guard, db-guard).
5. Resolver threads do bot (`resolveReviewThread` via GraphQL) se houver.
6. Squash-merge.
7. Verificar deploy Vercel (`get_deployment`) e abrir `?view=catalog` em produção.
8. Smoke: busca, detalhes, enviar (sem confirmar).
9. Atualizar memória do projeto.
10. Commit de CHANGELOG na próxima branch.
**Checklist**
- [ ] CI verde
- [ ] mergeado
- [ ] smoke em prod
- [ ] memória atualizada

### E10 · Grafo, arquitetura e mapa métrica→fonte
**Objetivo:** documentação viva antes do redesign.
**Arquivos:** `docs/catalogo/ARQUITETURA.md`, `graphify-out/`
1. `graphify update . --force` no VPS (≈2,5 min); conferir commit no `GRAPH_REPORT.md` = HEAD.
2. `graphify explain "ExternalProductManagement.tsx"` e `"promogifts-catalog"` → colar no doc.
3. Diagrama Mermaid: UI → `useExternalCatalog` → edge `promogifts-catalog` → DB PromoGifts; UI → `sendOutboundMessage` → fila → Evolution.
4. Tabela métrica→fonte (as 6 KPIs, badges, gráfico mensal, favoritos, envios) com a etapa que entrega cada uma.
5. Tabela de campos do `products` externo que a UI usa/vai usar (com % de preenchimento da seção 0).
6. Riscos: rate limit 60/min (KPIs + lista + categorias = 3 chamadas por abertura), imagens Cloudflare sem `sizes`.
7. Decisão registrada: catálogo é **read-only** no ZAPP; criação/edição sempre no PromoGifts.
8. Link no `README.md`.
9. Branch `feat/catalog-f1-design`.
10. Commit `docs(catalog): E10 arquitetura e mapa de métricas`.
**Checklist**
- [ ] grafo atualizado no HEAD
- [ ] Mermaid renderiza
- [ ] mapa métrica→fonte completo
- [ ] branch F1 criado

---

# FASE 1 — DESIGN SYSTEM DO CATÁLOGO · CARVÃO (E11–E20) · mocks A, B

### E11 · Classes `.catalog-*` em `components.css`
**Objetivo:** utilitários visuais do módulo só com tokens existentes.
**Arquivos:** `src/styles/components.css`
1. `.catalog-card` = `bg-card border border-border/70 rounded-xl` + hover `border-primary/40 -translate-y-0.5 shadow glow` (igual `DashboardCard`).
2. `.catalog-media` = área da foto `bg-white rounded-[10px] aspect-square overflow-hidden`.
3. `.catalog-badge--{stock|bestseller|new|featured|out}` = pill 22 px, 11 px semibold, fundo cor/15 + texto cor.
4. `.catalog-chip` (chip de cor: 9 px uppercase, `bg-muted/60`, `border-border/60`) e `.catalog-chip--active`.
5. `.catalog-category-chip` e `--active` (`bg-primary text-white`).
6. `.catalog-price` = 16 px bold `text-primary`.
7. `.catalog-rail` = 300 px (≥1280) / 320 px (≥1536).
8. `.catalog-gallery-thumb` + `--active` (ring `primary/60`).
9. `.catalog-phone` (moldura do preview: `bg-card-elevated`, `rounded-[28px]`, borda).
10. Commit `feat(catalog): E11 classes .catalog-* (carvão)`.
**Checklist**
- [ ] nenhuma cor literal nova (só `hsl(var(--…))`)
- [ ] classes documentadas em `ARQUITETURA.md`
- [ ] build css ok
- [ ] commit

### E12 · `ProductBadge` com prioridade real
**Objetivo:** badge do canto superior esquerdo do mock A.
**Arquivos:** `catalogShared.tsx`
1. `resolveBadge(p)` → ordem: `is_stockout`→Esgotado · `is_bestseller`→Mais vendido · `is_new`→Novidade · `is_featured`→Destaque · senão Em estoque.
2. Ícones lucide: `Check`, `Flame`, `Sparkles`, `Star`, `XCircle`.
3. Prop `size='sm'|'md'`.
4. Renderiza só se o campo existir no payload (antes da E21 os flags vêm `undefined` → cai em Em estoque/Esgotado).
5. Teste unitário da prioridade.
6. a11y: `aria-label`.
7. Exemplo em `docs/catalogo/COMPONENTES.md`.
8. `tsc`.
9. CHANGELOG.
10. Commit `feat(catalog): E12 ProductBadge`.
**Checklist**
- [ ] 5 estados
- [ ] prioridade testada
- [ ] sem dado inventado
- [ ] commit

### E13 · `ColorChips` e `ColorSwatch`
**Objetivo:** chips "BRANCO NATURAL PRETO" do card e bolinhas coloridas do detalhe.
**Arquivos:** `catalogShared.tsx`
1. `ColorChips({colors, max=3})` → chips uppercase 9 px + "+N".
2. `ColorSwatch({hex, name, size})` → círculo com borda `border-border/60`; se `hex` nulo, chip só texto.
3. Fonte: `product.colors` (hoje) e `color_swatches[]` (E21) — prop aceita ambos.
4. Tooltip com nome completo.
5. Teste: 5 cores → 3 chips + "+2".
6. Contraste: texto `text-foreground/80`.
7. `tsc`.
8. Exemplo no `COMPONENTES.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E13 ColorChips/ColorSwatch`.
**Checklist**
- [ ] chips + "+N"
- [ ] swatch com hex real
- [ ] teste
- [ ] commit

### E14 · `PriceTag`, `StockPill`, `LowStockPill`
**Objetivo:** preço azul, "1573 em estoque" verde, "2 un." âmbar.
**Arquivos:** `catalogShared.tsx`
1. `PriceTag({value, suggested?, size})` → `formatPrice`; sugerido riscado/menor só se diferente.
2. `StockPill({qty, stockout})` → verde `success/15` ou vermelho.
3. `LowStockPill({qty})` → só se `1 ≤ qty ≤ 10` (308 produtos reais), âmbar.
4. Threshold configurável por prop (fornecedor tem `low_stock_threshold` — usar na E21 se vier).
5. Testes dos 3.
6. `tabular-nums` nos números.
7. `tsc`.
8. `COMPONENTES.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E14 PriceTag/StockPill/LowStockPill`.
**Checklist**
- [ ] 3 primitivos
- [ ] threshold parametrizado
- [ ] testes
- [ ] commit

### E15 · `ProductThumb` com skeleton, `sizes` e fallback
**Objetivo:** imagem do card sem layout shift e sem `onError` hack.
**Arquivos:** `catalogShared.tsx`
1. `ProductThumb({src, fallbackSrc, alt, ratio='square'|'4/3', priority?})`.
2. Skeleton shimmer até `onLoad`; `loading="lazy" decoding="async"` exceto `priority`.
3. `srcSet`/`sizes` para Cloudflare Images: confirmar variantes existentes no `imagedelivery.net` da conta — se só `public` existir, usar só ele (não inventar variante).
4. Fallback em cascata: `src` → `fallbackSrc` → ícone `Package`.
5. `object-contain` (produto inteiro visível, como no mock).
6. Teste: erro no `src` → renderiza fallback.
7. Substituir `ProductImage` da E04 por `ProductThumb` nos 2 usos.
8. `tsc`.
9. CHANGELOG.
10. Commit `feat(catalog): E15 ProductThumb`.
**Checklist**
- [ ] sem layout shift
- [ ] fallback em cascata
- [ ] variantes CF verificadas (não presumidas)
- [ ] commit

### E16 · `FavoriteButton` (coração)
**Objetivo:** coração do canto superior direito (card e galeria).
**Arquivos:** `catalogShared.tsx`
1. Botão 32 px `bg-background/70 backdrop-blur rounded-full`; ícone `Heart`; ativo = preenchido `text-destructive`.
2. Props `active`, `onToggle`, `busy`, `size`.
3. Animação framer `scale 1→1.2→1` ao ativar (respeita `useReducedMotion`).
4. `aria-pressed`.
5. Sem persistência ainda (E27 traz `catalog_favorites`); até lá o componente não é montado nos cards.
6. Teste de toggle.
7. `tsc`.
8. `COMPONENTES.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E16 FavoriteButton`.
**Checklist**
- [ ] estados ativo/inativo/busy
- [ ] `aria-pressed`
- [ ] não montado antes do backend
- [ ] commit

### E17 · `CatalogKpiStrip` (reuso de `KpiCard`)
**Objetivo:** 6 KPIs do topo do mock A com o `KpiCard` do Talk X.
**Arquivos:** `catalogShared.tsx`, `talkxShared.tsx` (só props opcionais)
1. `KpiCard` ganha prop opcional `compact` (altura 72 px, sem mini-barras, ícone à esquerda como no mock A).
2. `CatalogKpiStrip({stats})` → grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`.
3. Cards: Produtos no total (`Box`, blue), Categorias (`Folder`, amber), Fornecedores (`Users`, blue), Em estoque (`Package`, green), Em destaque (`Star`, blue), Novidades (`Sparkles`, amber).
4. Cada card renderiza só se `stats.<campo>` for número (E24 entrega `catalog_stats`).
5. `KpiCardSkeleton` durante loading.
6. Teste: `stats` parcial → só os presentes.
7. `tsc`; teste do Talk X continua verde (prop opcional).
8. `COMPONENTES.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E17 CatalogKpiStrip`.
**Checklist**
- [ ] `KpiCard compact` sem quebrar Talk X
- [ ] 6 KPIs condicionais
- [ ] skeleton
- [ ] commit

### E18 · `CategoryChips` e `CatalogFilterBar` (reuso de `FilterBarV2`)
**Objetivo:** linha de chips "Todos · Agro · Chapéus …· Mais ▾" e a barra de filtros do mock A.
**Arquivos:** `catalogShared.tsx`, `talkxShared.tsx`
1. `CategoryChips({categories, activeId, onChange, max=7})` → primeiros `max` por `products_count` desc; resto em `DropdownMenu` "Mais".
2. Chip ativo `.catalog-category-chip--active`; scroll horizontal com fade nas bordas em telas menores.
3. Executado na E18: `FilterBarV2` não muda — o switch "Em estoque" e o botão "Filtros avançados" entram pelo `rightSlot` genérico que o componente já tinha (mais simples do que as props extras previstas aqui).
4. `CatalogFilterBar` compõe: busca (placeholder "Buscar por nome, SKU ou marca…", `⌘K` hint), select categoria (árvore), select fornecedor, switch Em estoque, `SegmentedToggle` grade/lista, `GhostButton` "Filtros avançados".
5. Larguras do mock: busca flex-1, selects 180/170 px.
6. Teste: chips limitam e "Mais" lista o restante.
7. `tsc`; testes Talk X verdes.
8. `COMPONENTES.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E18 CategoryChips + CatalogFilterBar`.
**Checklist**
- [ ] chips por contagem real
- [ ] `FilterBarV2` compatível
- [ ] toggle lista/grade
- [ ] commit

### E19 · Botões e ações: `RowActions`, `RailBanner`, `MetaTile`, `SectionCard`
**Objetivo:** "Enviar" com glow, "Ver detalhes" bordado, ações rápidas do rail, tiles de meta (Qtd. mínima/Prazo/Origem).
**Arquivos:** `catalogShared.tsx`
1. Reusar `TalkXPrimaryButton` (glow) como `Enviar`; reusar `GhostButton` como `Ver detalhes` (h-8, ícone `Eye`).
2. `RailActionRow({icon, label, onClick, external?})` → linha com chevron (mock "Ações rápidas").
3. `RailBanner({title, text, ctaLabel, onCta, image?})` → card `bg-card-elevated` com gradiente `--gradient-primary` a 12% no canto e foto opcional.
4. `MetaTile({icon, label, value, color})` → tile `IconTile soft` + label 11 px + valor 14 px semibold (3 colunas no detalhe).
5. `SectionCard({title, children})` → card interno (Descrição, Ficha técnica).
6. Teste de render dos 5.
7. `tsc`.
8. `COMPONENTES.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E19 botões, rail e tiles`.
**Checklist**
- [ ] reuso, não duplicação, dos botões do Talk X/Dashboard
- [ ] 5 primitivos
- [ ] testes
- [ ] commit

### E20 · Motion, densidade e responsividade do módulo + PR F1
**Objetivo:** regras de animação e breakpoints fixadas; merge.
**Arquivos:** `catalogShared.tsx`, `docs/catalogo/COMPONENTES.md`
1. Stagger de entrada dos cards `delay = min(i,12)*0.02` (igual `DashboardCard`); `AnimatePresence popLayout` mantido.
2. Hover do card: `-translate-y-0.5` + glow (sem `scale` — evita jitter da imagem).
3. `useReducedMotion` em tudo.
4. Breakpoints: grid 2 (sm) / 3 (md) / 4 (lg) / 4 + rail (xl) / 5 + rail (2xl).
5. Rail some < 1280 e vira `Accordion` acima da grade (E58).
6. Modais: `max-w-5xl` detalhe, `max-w-6xl` enviar, `max-w-4xl` contato; em mobile viram `vaul` Drawer full-height.
7. Tipografia: título card 13 px semibold 2 linhas, marca 11 px `foreground-secondary`, preço 16 px.
8. `COMPONENTES.md` completo com tabela de tokens usados.
9. Rebase + gates + PR `feat/catalog-f1-design → main`; merge.
10. Branch `feat/catalog-f2-backend`.
**Checklist**
- [ ] regras de motion documentadas
- [ ] breakpoints definidos
- [ ] PR F1 mergeado
- [ ] branch F2

---

# FASE 2 — BACKEND (E21–E30)

### E21 · Edge `promogifts-catalog`: campos completos
**Objetivo:** payload com tudo que o mock precisa.
**Arquivos:** `supabase/functions/promogifts-catalog/index.ts`, `useExternalCatalog.ts` (tipos)
1. `PRODUCT_FIELDS` += `images, is_featured, is_new, is_bestseller, is_on_sale, materials, tags, color_swatches, engraving_type, engraving_description, main_category_id, created_at, updated_at, last_sync_at, order_count, view_count, primary_image_fallback_url, has_gift_box, is_closeout`.
2. `list_products` em modo `compact=true` (default da grade) retorna só o necessário para o card (sem `description`, `images`, `materials`) — reduz payload de 24 itens.
3. `get_product` retorna tudo + `variants` com `images`, `next_entry_date`, `next_entry_quantity`.
4. Tipo `ExternalProduct` atualizado (campos opcionais).
5. Teste Deno da função com mock do `extClient`.
6. Deploy via `deploy-functions.yml` (push em main) ou `supabase functions deploy` no VPS; regenerar `deployment-manifest.json`.
7. Verificar em prod: `get_product` de `PO-13153` traz 4 imagens e swatches.
8. Teste de `useExternalCatalog` ajustado aos novos tipos.
9. CHANGELOG.
10. Commit `feat(catalog): E21 edge v2 campos completos`.
**Checklist**
- [ ] campos novos no payload
- [ ] modo compacto para grade
- [ ] deployada e verificada com produto real
- [ ] manifest regenerado

### E22 · Filtros avançados e faixa de preço
**Objetivo:** backend de "Filtros avançados".
**Arquivos:** edge, `useExternalCatalog.ts`
1. `ListProductsSchema` += `is_featured, is_new, is_bestseller, is_kit, allows_personalization, low_stock (1..10), price_min, price_max, color (ilike em colors), material (contains em materials), has_engraving`.
2. `category_id` passa a incluir descendentes: buscar `categories.path` do id e filtrar `categories.path like '<path>%'` via subselect em `category_ids`.
3. Testes Deno para cada filtro.
4. `CatalogFilters` tipado.
5. Deploy + manifest.
6. Verificação com contagens da seção 0 (destaque=2.147, kits=978, estoque baixo=308).
7. Índices: conferir `EXPLAIN` das combinações mais comuns no DB externo; se faltar, migration aditiva de índice parcial (`is_active and not is_deleted`).
8. Documentar em `ARQUITETURA.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E22 filtros avançados`.
**Checklist**
- [ ] 10 filtros novos
- [ ] categoria com descendentes
- [ ] contagens batem com o DB
- [ ] deploy

### E23 · Ordenação e busca full-text (relevância)
**Objetivo:** "Ordenar por: Mais relevantes" real.
**Arquivos:** edge
1. `order_by` += `relevance, created_at, order_count, stock_quantity, sale_price`.
2. Com `search`: `.textSearch('search_vector', q, {type:'websearch', config:'portuguese'})` + fallback `ilike` se `search_vector` estiver nulo para o produto (verificar preenchimento: `count(*) where search_vector is null`).
3. `relevance` só válido com `search`; sem busca → `name`.
4. Manter `sanitizeSearch`.
5. Testes Deno: "caneca bambu" retorna bambu antes.
6. Latência medida (`meta.duration_ms`) < 400 ms para 24 itens.
7. Deploy + manifest.
8. `CatalogFilters.order_by` tipado com union.
9. CHANGELOG.
10. Commit `feat(catalog): E23 ordenação + FTS`.
**Checklist**
- [ ] 6 ordenações
- [ ] FTS com fallback
- [ ] latência medida
- [ ] deploy

### E24 · Ação `catalog_stats` (KPIs, sync, série mensal)
**Objetivo:** números reais para KPIs e gráfico.
**Arquivos:** migration no DB externo, edge, `useCatalogStats.ts`
1. Ler colunas de `v_catalog_stats` existente; se cobrir, usar; senão criar `public.zapp_catalog_stats()` (`security definer`, `set search_path=public`, read-only) retornando: `total, in_stock, featured, new_30d, bestseller, kits, low_stock, categories_root, suppliers_active, last_sync_at, last_update_at, by_month[{month, count}]` (7 meses por `created_at`).
2. `grant execute` só ao role usado pela service key (não `anon`).
3. Edge: ação `catalog_stats` → chama a RPC; cache em memória 60 s por isolate.
4. Hook `useCatalogStats()` react-query `staleTime 5 min`.
5. Delta mensal = `(m0 - m-1)/m-1` calculado no client; renderiza só se `m-1 > 0`.
6. Testes: RPC no MCP retorna 7.576/6.040/2.147.
7. Deploy + manifest.
8. `ARQUITETURA.md` mapa métrica→fonte atualizado.
9. CHANGELOG.
10. Commit `feat(catalog): E24 catalog_stats`.
**Checklist**
- [ ] RPC/view read-only no externo
- [ ] ação na edge
- [ ] hook com cache
- [ ] valores conferidos

### E25 · Categorias e fornecedores enriquecidos
**Objetivo:** chips com contagem, ícone/cor; fornecedor com logo.
**Arquivos:** edge, tipos
1. `list_categories` → `id, name, slug, parent_id, level, path, full_path_readable, icon, color_hex, image_url, products_count, display_order` filtrando `is_active/is_visible` e `deleted_at is null`.
2. `list_suppliers` → `id, name, trading_name, logo_url, is_product_supplier, low_stock_threshold` + `products_count` (subselect de ativos).
3. Ordenar categorias por `display_order, name`; fornecedores por `products_count desc`.
4. Tipos `ExternalCategory`/`ExternalSupplier` estendidos.
5. Cache client 30 min mantido.
6. Teste Deno.
7. Deploy + manifest.
8. Verificar: 28 raiz, 4 fornecedores com produto.
9. CHANGELOG.
10. Commit `feat(catalog): E25 categorias e fornecedores enriquecidos`.
**Checklist**
- [ ] contagens por categoria
- [ ] logo de fornecedor
- [ ] deploy
- [ ] verificado

### E26 · Rate limit e cache: 2 chamadas por abertura
**Objetivo:** não estourar 60/min com KPIs + lista + categorias + fornecedores + stats.
**Arquivos:** edge, hooks
1. Medir chamadas por abertura da tela (hoje 3; após F3 seriam 5).
2. Ação combinada `bootstrap` → `{categories, suppliers, stats}` em 1 chamada.
3. Rate limit por usuário sobe para 120/min só para `list_products` (paginação rápida); demais mantêm 60.
4. `staleTime` por chave: lista 2 min, produto 5 min, bootstrap 10 min.
5. `keepPreviousData` na lista (sem flash na paginação).
6. Prefetch da página seguinte no hover de "Próxima".
7. Teste de `useExternalCatalog` para `bootstrap`.
8. Deploy + manifest.
9. CHANGELOG.
10. Commit `feat(catalog): E26 bootstrap + cache`.
**Checklist**
- [ ] 2 chamadas por abertura
- [ ] `keepPreviousData`
- [ ] limites documentados
- [ ] deploy

### E27 · Tabela `catalog_favorites` no ZAPP
**Objetivo:** coração persistente por usuário.
**Arquivos:** `supabase/migrations/2026091?_catalog_favorites.sql`, `schema-catalog.json`, `schema-manifest.json`, `scripts/db-audit/catalog.sql`
1. DDL: `catalog_favorites(user_id uuid references auth.users, product_id uuid, product_name text, product_sku text, primary_image_url text, created_at timestamptz default now(), primary key(user_id, product_id))`.
2. RLS: `select/insert/delete` onde `user_id = auth.uid()`.
3. Índice `(user_id, created_at desc)`.
4. Aplicar via `db_apply_migration` (atômico); espelhar o SQL em `supabase/migrations/`.
5. Rodar `catalog.sql`/`manifest.sql` via `db_batch_query` e commitar o `schema-catalog.json`/`schema-manifest.json` regenerados.
6. `db-guard.yml` verde localmente (`node scripts/db-audit/check-migration-drift.mjs`).
7. Hook `useCatalogFavorites()` (`list`, `toggle` optimistic).
8. Teste do hook com mock.
9. CHANGELOG.
10. Commit `feat(catalog): E27 catalog_favorites`.
**Checklist**
- [ ] tabela + RLS
- [ ] migration registrada e catalogada
- [ ] db-guard verde
- [ ] hook

### E28 · Tabela `catalog_send_events` (log de envios)
**Objetivo:** "Enviados recentemente" e métricas de uso reais.
**Arquivos:** migration, catálogos, `useSendProduct.ts`
1. DDL: `catalog_send_events(id uuid pk default gen_random_uuid(), product_id uuid, product_name text, product_sku text, variant_label text, contact_id uuid references contacts, agent_id uuid, template text check in ('formal','informal','promo','custom'), images_count int, message_length int, status text check in ('sent','partial','failed'), message_ids jsonb, created_at timestamptz default now())`.
2. RLS: insert `agent_id = auth.uid()`; select para `authenticated`.
3. Índices `(created_at desc)`, `(product_id)`, `(contact_id)`.
4. Aplicar via `db_apply_migration`; regenerar `schema-catalog.json`/`schema-manifest.json` (mesmo rito da E27).
5. `useSendToContact` grava 1 evento ao final com `status` real e `message_ids`.
6. Teste do hook: evento gravado com `partial` quando 1 imagem falha.
7. `db-guard` verde.
8. Hook `useCatalogRecentSends(limit)`.
9. CHANGELOG.
10. Commit `feat(catalog): E28 catalog_send_events`.
**Checklist**
- [ ] tabela + RLS + índices
- [ ] evento gravado no envio
- [ ] db-guard verde
- [ ] hook de recentes

### E29 · Exportação CSV do filtro atual
**Objetivo:** "Exportar catálogo" real.
**Arquivos:** `src/components/catalog/catalogExport.ts`
1. Reusar `esc()` e BOM UTF-8 de `talkxExport.ts` (importar, não copiar).
2. Paginar `list_products` de 100 em 100 até 1.000 linhas (limite declarado na UI); `.order('id')` como desempate.
3. Colunas: SKU, Nome, Marca, Fornecedor, Categoria, Preço, Preço sugerido, Estoque, Cores, Personalização, Prazo, Qtd. mínima, URL PromoGifts (`slug`).
4. Nome do arquivo `catalogo_<filtro>_<yyyymmdd>.csv`.
5. Progresso via toast `sonner` (`loading` → `success`).
6. Erro em página → aborta e não grava parcial.
7. Teste unitário do builder de linhas.
8. Rate limit: 10 páginas = 10 chamadas; respeita 120/min.
9. CHANGELOG.
10. Commit `feat(catalog): E29 exportar CSV`.
**Checklist**
- [ ] CSV com BOM e escape
- [ ] limite 1.000 linhas explícito
- [ ] sem parcial em erro
- [ ] teste

### E30 · QA Fase 2 + merge
**Objetivo:** backend completo em `main`.
**Arquivos:** —
1. Testes Deno de todas as ações + vitest dos hooks.
2. `deployment-manifest.json` regenerado e `--check` ok.
3. Verificação em prod das ações (`bootstrap`, `catalog_stats`, `list_products` com `is_featured`).
4. `db-guard`, `usage-guard`, `check-migration-drift` verdes.
5. Rebase + gates.
6. PR `feat/catalog-f2-backend → main`; threads; merge.
7. Deploy Vercel + edge verificados.
8. `ARQUITETURA.md` atualizado.
9. Memória.
10. Branch `feat/catalog-f3-header`.
**Checklist**
- [ ] todas as ações verificadas em prod
- [ ] guardas de DB verdes
- [ ] PR mergeado
- [ ] branch F3

---

# FASE 3 — TELA PRINCIPAL: HEADER, KPIs, CHIPS, FILTROS (E31–E40) · mock A

### E31 · Layout `[1fr_300px]` e scroll único
**Objetivo:** estrutura da tela A.
**Arquivos:** `ExternalProductManagement.tsx`
1. Remover `max-w-7xl mx-auto` e o `ScrollArea` interno; a view usa o scroller do `ViewContainer`.
2. Grid raiz `xl:grid-cols-[1fr_300px] 2xl:grid-cols-[1fr_320px] gap-6`.
3. Coluna esquerda: header → KPIs → chips → filtros → status/ordenar → grade → paginação.
4. Coluna direita: `<aside className="catalog-rail sticky top-4">` (conteúdo na F5).
5. Sem scroll duplo (verificar `overflow` em DevTools).
6. `w-full min-w-0` na raiz (regra do plano de layout de 30 etapas).
7. Screenshot 1920 e 1440.
8. `tsc`/eslint.
9. CHANGELOG.
10. Commit `feat(catalog): E31 layout com rail`.
**Checklist**
- [ ] 1 scroller
- [ ] rail sticky
- [ ] sem faixa morta à direita
- [ ] commit

### E32 · Header do módulo (mock A topo)
**Objetivo:** tile + título + subtítulo real + ações.
**Arquivos:** `ExternalProductManagement.tsx`
1. `ModuleHeader` com `IconTile` azul (`Package`), título "Catálogo de Produtos".
2. Subtítulo "`{total}` produtos sincronizados em tempo real com o PromoGifts. Gerencie, edite e compartilhe produtos." (total de `catalog_stats`).
3. Direita: `StatusChip tone=success pulse` "Sincronizado `{fmtAgo(last_sync_at)}`" (fonte `catalog_stats.last_sync_at`; se > 24 h vira `muted` "Última sincronização em dd/MM HH:mm").
4. `GhostButton` "Gerenciar no PromoGifts" (`ExternalLink`) → `https://promogifts.com.br`.
5. `PrimaryButton` "+ Novo Produto" → link externo para a tela de novo produto do PromoGifts (confirmar URL real; se não existir rota pública, ocultar o botão — não deixar botão morto).
6. Skeleton do header enquanto `stats` carrega.
7. Teste: chip muda de tom por idade do sync.
8. `tsc`.
9. CHANGELOG.
10. Commit `feat(catalog): E32 header`.
**Checklist**
- [ ] total e sync reais
- [ ] botão Novo Produto só com URL confirmada
- [ ] skeleton
- [ ] commit

### E33 · KPIs reais
**Objetivo:** 6 cards do mock A com `catalog_stats`.
**Arquivos:** `ExternalProductManagement.tsx`
1. Montar `CatalogKpiStrip stats={stats}`.
2. Categorias = `categories_root` (28) — rótulo "Categorias"; tooltip "28 raiz · 478 no total".
3. Fornecedores = `suppliers_active` (4).
4. Novidades = `new_30d`; rótulo "Novidades (30 dias)".
5. Clique no KPI aplica filtro correspondente (em estoque, destaque, novidade).
6. Estado de erro do stats → strip não renderiza + `AlertCard` discreto.
7. Teste: clique em "Em destaque" → `is_featured=true` no reducer.
8. `tsc`.
9. CHANGELOG.
10. Commit `feat(catalog): E33 KPIs reais`.
**Checklist**
- [ ] 6 valores do backend
- [ ] KPI clicável aplica filtro
- [ ] sem "—" decorativo
- [ ] commit

### E34 · Chips de categoria
**Objetivo:** linha "Todos · Agro · Chapéus · …· Mais".
**Arquivos:** `ExternalProductManagement.tsx`
1. `CategoryChips` com raízes por `products_count` desc.
2. Chip ativo sincroniza com o select de categoria (mesmo `categoryId` no reducer).
3. Contagem no tooltip do chip.
4. "Mais" lista as 21 restantes com busca (cmdk inline).
5. Chip com `icon` da categoria se existir (lucide por nome; fallback sem ícone).
6. Deep link `?view=catalog&cat=<id>`.
7. Teste: clicar chip → reducer + URL.
8. `tsc`.
9. CHANGELOG.
10. Commit `feat(catalog): E34 chips de categoria`.
**Checklist**
- [ ] 7 chips + Mais
- [ ] sincronizado com o select
- [ ] deep link
- [ ] commit

### E35 · Barra de filtros v2
**Objetivo:** substituir os controles atuais por `CatalogFilterBar`.
**Arquivos:** `ExternalProductManagement.tsx`
1. Montar `CatalogFilterBar` ligado ao reducer.
2. Select de categoria em árvore (raiz semibold, filhos indentados) com contagem.
3. Select de fornecedor com logo 16 px + contagem.
4. Switch "Em estoque" (default **ligado**, como no mock; persistir em `sessionStorage catalog.filters`).
5. Toggle grade/lista persistido em `localStorage catalog.view`.
6. "Limpar filtros" aparece só com filtro ativo (fora do default).
7. Atalho `/` foca a busca; `Esc` limpa.
8. Teste: persistência restaura filtros.
9. `tsc`.
10. Commit `feat(catalog): E35 barra de filtros v2`.
**Checklist**
- [ ] árvore + contagens
- [ ] persistência
- [ ] atalhos
- [ ] commit

### E36 · Filtros avançados (Sheet)
**Objetivo:** botão "Filtros avançados" do mock.
**Arquivos:** `src/components/catalog/CatalogAdvancedFilters.tsx`
1. `Sheet` (vaul em mobile) com seções: Destaques (Destaque/Novidade/Mais vendido/Kit), Personalização, Estoque baixo, Faixa de preço (slider min/max com valores reais `min(sale_price)/max(sale_price)` do stats — adicionar à RPC), Cores (top 20 por frequência — adicionar à RPC), Materiais (top 20).
2. Contador de filtros ativos no botão (badge).
3. Aplicar/Limpar no rodapé; aplicar fecha e refaz a busca.
4. Chips de filtro ativo abaixo da barra (removíveis).
5. Reducer estendido com os campos da E22.
6. Teste: aplicar 3 filtros → 3 chips → remover 1.
7. `tsc`.
8. `COMPONENTES.md`.
9. CHANGELOG.
10. Commit `feat(catalog): E36 filtros avançados`.
**Checklist**
- [ ] faixa de preço real
- [ ] chips removíveis
- [ ] contador no botão
- [ ] commit

### E37 · Linha de resultados + Ordenar por
**Objetivo:** "Mostrando 1–24 de 7.576 produtos · Ordenar por: Mais relevantes ▾".
**Arquivos:** `ExternalProductManagement.tsx`
1. Texto com `tabular-nums`; 0 resultados → "Nenhum produto".
2. `CardSelect` "Ordenar por" com: Mais relevantes (só com busca), Nome A–Z, Menor preço, Maior preço, Maior estoque, Mais recentes, Mais pedidos.
3. Default: com busca `relevance`, sem busca `name`.
4. Persistir em `sessionStorage`.
5. Mudar ordenação zera página.
6. Teste do mapeamento label→`order_by/ascending`.
7. `tsc`.
8. CHANGELOG.
9. Screenshot.
10. Commit `feat(catalog): E37 ordenar por`.
**Checklist**
- [ ] 7 opções
- [ ] default por contexto
- [ ] zera página
- [ ] commit

### E38 · Busca global `⌘K` do catálogo
**Objetivo:** provider de produtos no command palette existente.
**Arquivos:** `src/components/command-palette/` (verificar caminho real), `useExternalCatalog.ts`
1. Localizar o provider pattern usado pelo Talk X (E26 do plano Talk X).
2. Provider "Produtos": busca `list_products limit 8 compact` com debounce 300 ms.
3. Item: thumb 24 px, nome, SKU, preço; ação → abre `?view=catalog&product=<id>`.
4. Ação secundária "Enviar" → abre modal de envio direto.
5. Respeita rate limit (mín. 2 caracteres).
6. Teste do provider.
7. `tsc`.
8. CHANGELOG.
9. Screenshot.
10. Commit `feat(catalog): E38 ⌘K produtos`.
**Checklist**
- [ ] provider registrado
- [ ] deep link
- [ ] debounce + mínimo
- [ ] commit

### E39 · Estados: vazio, erro, upstream 503, sem permissão
**Objetivo:** prancha de estados da tela A.
**Arquivos:** `ExternalProductManagement.tsx`, `catalogShared.tsx`
1. Vazio com filtros → "Nenhum produto com esses filtros" + botão Limpar.
2. Vazio sem filtros → "Catálogo vazio" + link PromoGifts.
3. Erro `CATALOG_UPSTREAM_ERROR` → `TalkXDataUnavailableState` adaptado ("Catálogo PromoGifts indisponível") + Tentar de novo.
4. `CATALOG_NOT_CONFIGURED`/`CATALOG_CREDENTIALS_INVALID` → estado para admin com código.
5. 429 → toast "Muitas requisições, aguarde 1 min" e botões desabilitados 10 s.
6. Erro de imagem individual → fallback (E15).
7. Testes de cada estado por `error.code`.
8. `tsc`.
9. CHANGELOG.
10. Commit `feat(catalog): E39 estados`.
**Checklist**
- [ ] 5 estados
- [ ] códigos da edge mapeados
- [ ] testes
- [ ] commit

### E40 · QA visual Fase 3 + merge
**Objetivo:** topo da tela A em `main`.
**Arquivos:** `docs/catalogo/PARIDADE.md`
1. Prints A (1920/1440/1280) lado a lado com o mock em `PARIDADE.md` (seção "Topo").
2. Checar tokens: nenhum navy, nenhum `#` novo.
3. Fluxo manual: chip → select sincroniza → filtro avançado → ordenar → limpar.
4. Gates + build.
5. PR `feat/catalog-f3-header → main`; merge.
6. Deploy + smoke.
7. Sentry: zero erro novo em 30 min.
8. Memória.
9. CHANGELOG.
10. Branch `feat/catalog-f4-grid`.
**Checklist**
- [ ] PARIDADE topo
- [ ] PR mergeado
- [ ] smoke prod
- [ ] branch F4

---

# FASE 4 — GRID E LISTA DE PRODUTOS (E41–E50) · mock A

### E41 · `CatalogProductCard` (grade) conforme mock
**Objetivo:** card idêntico ao mock A em carvão.
**Arquivos:** `src/components/catalog/CatalogProductCard.tsx`, `ExternalProductCard.tsx`
1. Estrutura: `.catalog-card` → `.catalog-media` (ProductThumb) com `ProductBadge` top-left e `FavoriteButton` top-right → corpo: nome (2 linhas), "Marca | Fornecedor", `ColorChips`, linha preço + `LowStockPill`, rodapé 2 botões.
2. `ExternalProductCard` vira wrapper fino que delega ao novo card (mantém prop `compact` e o dialog do chat funcionando).
3. Esgotado: overlay `bg-background/70` + badge central (como hoje) + botão Enviar desabilitado com tooltip.
4. Kit: badge secundário "Kit" à direita do principal.
5. Clique no nome/imagem abre detalhes; botões param propagação.
6. Teste: 3 produtos → badges corretos.
7. `tsc`.
8. Screenshot vs mock.
9. CHANGELOG.
10. Commit `feat(catalog): E41 card da grade`.
**Checklist**
- [ ] card = mock (carvão)
- [ ] wrapper compatível com o chat
- [ ] esgotado/kit
- [ ] commit

### E42 · Linha de lista (`compact`)
**Objetivo:** modo lista denso.
**Arquivos:** `CatalogProductCard.tsx`
1. Linha 72 px: thumb 56, nome+marca, chips, estoque, preço, `RowActionsMenu` (Ver, Enviar, Copiar SKU, Abrir no PromoGifts, Favoritar).
2. Cabeçalho de colunas sticky (`.talkx-table` reuso).
3. Seleção múltipla `☐` para ações em massa (E49).
4. Hover destaca linha.
5. Teste render lista.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y: linha é `row`, botões com label.
10. Commit `feat(catalog): E42 modo lista`.
**Checklist**
- [ ] linha 72 px com ações
- [ ] header sticky
- [ ] seleção
- [ ] commit

### E43 · Favoritos ligados
**Objetivo:** coração persiste.
**Arquivos:** `CatalogProductCard.tsx`, `useCatalogFavorites.ts`
1. `FavoriteButton active={isFav(id)} onToggle={toggle}` com optimistic update e rollback em erro.
2. Snapshot do produto gravado na tabela (nome/sku/imagem) para a aba Favoritos funcionar offline do externo.
3. Toast discreto "Adicionado aos favoritos · Desfazer" 5 s.
4. Sem contador no KPI — só na aba (E91).
5. Teste do optimistic.
6. `tsc`.
7. CHANGELOG.
8. Verificar RLS: outro usuário não vê.
9. Screenshot.
10. Commit `feat(catalog): E43 favoritos`.
**Checklist**
- [ ] persistência por usuário
- [ ] optimistic + rollback
- [ ] RLS verificada
- [ ] commit

### E44 · Skeletons e `keepPreviousData`
**Objetivo:** sem flash na paginação, skeleton fiel ao card.
**Arquivos:** `CatalogProductCard.tsx` (skeleton), `ExternalProductManagement.tsx`
1. `CatalogProductCardSkeleton` com a mesma altura do card (media quadrada + 4 linhas).
2. Primeira carga: 12 skeletons (grade) / 8 (lista).
3. Paginação: mantém cards antigos com `opacity-60` + barra fina de progresso no topo.
4. `isFetching` vs `isLoading` (E05).
5. Teste: `isFetching` não mostra skeleton.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. Lighthouse CLS < 0,05 na página.
10. Commit `feat(catalog): E44 skeleton + sem flash`.
**Checklist**
- [ ] skeleton com mesma altura
- [ ] sem flash na página 2
- [ ] CLS medido
- [ ] commit

### E45 · Paginação do mock + tamanho de página
**Objetivo:** "Anterior · Página 1 de 316 · Próxima" + ir para página.
**Arquivos:** `ExternalProductManagement.tsx`, `talkxShared.tsx` (`TalkXPagination` prop opcional)
1. Reusar `TalkXPagination`; adicionar prop opcional `pageSizes=[24,48,96]`.
2. Input "ir para" com validação.
3. Prefetch da próxima página no hover (E26).
4. Scroll para o topo da grade ao trocar de página.
5. Deep link `?page=`.
6. Teste: `page` no reducer e URL.
7. `tsc`; testes Talk X verdes.
8. CHANGELOG.
9. Screenshot.
10. Commit `feat(catalog): E45 paginação`.
**Checklist**
- [ ] reuso de `TalkXPagination`
- [ ] tamanhos 24/48/96
- [ ] deep link
- [ ] commit

### E46 · Virtualização do modo lista
**Objetivo:** 96 linhas sem custo.
**Arquivos:** `ExternalProductManagement.tsx`
1. `@tanstack/react-virtual` no modo lista quando `pageSize ≥ 48`.
2. Altura fixa 72 px; overscan 8.
3. Grade continua não virtualizada (24–48 cards ok).
4. Teste: renderiza só as visíveis.
5. Medir tempo de render 96 linhas antes/depois.
6. `tsc`.
7. CHANGELOG.
8. Screenshot.
9. a11y preservada (`role=row`).
10. Commit `feat(catalog): E46 virtualização da lista`.
**Checklist**
- [ ] virtual só na lista
- [ ] medição registrada
- [ ] a11y
- [ ] commit

### E47 · Ações de linha e atalhos do card
**Objetivo:** `⋮` e atalhos rápidos.
**Arquivos:** `CatalogProductCard.tsx`
1. `RowActionsMenu` (reuso) no hover do card (canto inferior direito) e sempre visível na lista.
2. Itens: Ver detalhes, Enviar, Copiar SKU, Copiar link PromoGifts (`/produto/<slug>` — confirmar rota), Abrir no PromoGifts, Favoritar/Desfavoritar.
3. Copiar → toast.
4. Teclado: card focável; `Enter` abre detalhes; `e` envia.
5. Teste do menu.
6. `tsc`.
7. CHANGELOG.
8. Screenshot.
9. a11y: menu com `aria-label`.
10. Commit `feat(catalog): E47 ações do card`.
**Checklist**
- [ ] 6 ações
- [ ] rota do PromoGifts confirmada
- [ ] teclado
- [ ] commit

### E48 · Badges e ordenação especiais (Destaque / Novidade / Mais vendido)
**Objetivo:** seções rápidas por flag, com expiração respeitada.
**Arquivos:** edge, `ExternalProductManagement.tsx`
1. Filtro `is_new` usa `is_new OR created_at > now()-30d` (backend: `new_or_recent`).
2. Chip de estado acima da grade quando filtro de flag ativo ("Mostrando só Novidades · limpar").
3. Ordenação "Mais pedidos" usa `order_count` (verificar preenchimento > 0 antes de expor; se 0 em todos, ocultar a opção).
4. Badge "Destaque" respeita `is_featured_expires_at` (backend: `and (is_featured_expires_at is null or > now())`).
5. Idem `is_new_expires_at`, `is_bestseller_expires_at`.
6. Testes Deno das expirações.
7. Deploy edge.
8. `tsc`.
9. CHANGELOG.
10. Commit `feat(catalog): E48 flags com expiração`.
**Checklist**
- [ ] expirações respeitadas
- [ ] "Mais pedidos" só se houver dado
- [ ] deploy
- [ ] commit

### E49 · Seleção em massa: enviar vários / exportar seleção
**Objetivo:** barra flutuante de seleção (padrão Talk X E23).
**Arquivos:** `ExternalProductManagement.tsx`, `CatalogBulkBar.tsx`
1. Checkbox no card (hover) e na lista.
2. Barra flutuante inferior: "N selecionados · Enviar seleção · Exportar CSV · Favoritar · Limpar".
3. "Enviar seleção" abre o modal de envio em modo multi (E79).
4. Limite 10 produtos por envio (WhatsApp/humanização) — mensagem clara.
5. Exportar seleção reusa E29.
6. Teste: selecionar 3 → barra → limpar.
7. `tsc`.
8. CHANGELOG.
9. Screenshot.
10. Commit `feat(catalog): E49 seleção em massa`.
**Checklist**
- [ ] barra flutuante
- [ ] limite 10
- [ ] export da seleção
- [ ] commit

### E50 · QA Fase 4 + merge
**Objetivo:** grade completa em `main`.
**Arquivos:** `docs/catalogo/PARIDADE.md`
1. PARIDADE seção "Grade" (grade, lista, esgotado, kit, favorito).
2. Fluxo manual: favoritar → recarregar → persiste; página 2 sem flash; lista virtualizada.
3. Gates + build + Lighthouse (perf ≥ 85 na view).
4. PR `feat/catalog-f4-grid → main`; merge.
5. Deploy + smoke.
6. Sentry 30 min.
7. Memória.
8. CHANGELOG.
9. Prints.
10. Branch `feat/catalog-f5-rail`.
**Checklist**
- [ ] PARIDADE grade
- [ ] Lighthouse registrado
- [ ] PR mergeado
- [ ] branch F5

---

# FASE 5 — RAIL DIREITO + RESPONSIVO (E51–E58) · mock A direita

### E51 · Banner "Brindes que fortalecem relacionamentos"
**Objetivo:** card promocional estático com CTA real.
**Arquivos:** `src/components/catalog/CatalogRail.tsx`
1. `RailBanner` com texto do mock e foto de 1 produto **em destaque real** (primeiro `is_featured` com imagem, cacheado no bootstrap) — sem imagem fake.
2. CTA "Ver novidades →" aplica filtro `is_new`.
3. Marca "SUA MARCA AQUI" do mock **não** entra (é placeholder).
4. Conteúdo do banner em constante `CATALOG_RAIL_COPY` (fácil trocar).
5. Skeleton do banner.
6. Teste render.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E51 banner do rail`.
**Checklist**
- [ ] foto de produto real em destaque
- [ ] CTA aplica filtro
- [ ] sem placeholder
- [ ] commit

### E52 · "Resumo do catálogo": gráfico mensal real
**Objetivo:** barras dos últimos 7 meses + delta.
**Arquivos:** `CatalogRail.tsx`
1. `recharts BarChart` com `by_month` do `catalog_stats` (contagem de produtos criados por mês).
2. Rótulo do delta "+X%" só se `m-1 > 0`; tooltip com mês/valor.
3. Barra do mês atual em `--primary`, demais `primary/40` (mesma paleta das mini-barras do `KpiCard`).
4. Eixo Y com 4 ticks, eixo X meses abreviados pt-BR (`date-fns ptBR`).
5. "Ver relatórios →" → `?view=reports` (se existir relatório de catálogo; senão ocultar).
6. Teste: série de 7 pontos.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E52 gráfico mensal real`.
**Checklist**
- [ ] série do backend
- [ ] delta condicional
- [ ] paleta carvão
- [ ] commit

### E53 · Lista de contagens do rail
**Objetivo:** 4 linhas "Produtos em estoque · Em destaque · Novidades · Fornecedores ativos".
**Arquivos:** `CatalogRail.tsx`
1. `MetaRow` (reuso) com `IconTile soft` (green/amber/violet/blue) + valor `tabular-nums`.
2. Valores de `catalog_stats`; clique aplica o filtro.
3. Skeleton de 4 linhas.
4. Teste.
5. `tsc`.
6. Screenshot.
7. CHANGELOG.
8. a11y: lista `ul/li`.
9. Rail com `RailCard glow` só no card do gráfico.
10. Commit `feat(catalog): E53 contagens do rail`.
**Checklist**
- [ ] 4 valores reais
- [ ] clicáveis
- [ ] skeleton
- [ ] commit

### E54 · "Ações rápidas": Sincronizar catálogo
**Objetivo:** ação real de refresh.
**Arquivos:** `CatalogRail.tsx`
1. `RailActionRow` "Sincronizar catálogo" → `invalidate()` de todas as chaves `external-catalog` + refetch do stats.
2. Ícone gira durante `isFetching`; toast "Catálogo atualizado · {total} produtos".
3. Subtexto "Último sync do PromoGifts: dd/MM HH:mm" (`last_sync_at`).
4. Cooldown 30 s (rate limit).
5. Teste.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y `aria-busy`.
10. Commit `feat(catalog): E54 sincronizar`.
**Checklist**
- [ ] invalida e refaz
- [ ] mostra sync real
- [ ] cooldown
- [ ] commit

### E55 · "Ações rápidas": Exportar catálogo / Importar planilha / Gerenciar categorias
**Objetivo:** 3 ações restantes sem funcionalidade fake.
**Arquivos:** `CatalogRail.tsx`
1. "Exportar catálogo" → E29 com o filtro atual; tooltip "até 1.000 produtos".
2. "Importar planilha" → link externo para a importação do PromoGifts (confirmar URL; senão ocultar).
3. "Gerenciar categorias" → link externo (idem).
4. Ícone `ExternalLink` nas duas de link.
5. Teste render.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. `ARQUITETURA.md`: decisão "sem escrita no ZAPP".
10. Commit `feat(catalog): E55 ações rápidas`.
**Checklist**
- [ ] export ligado
- [ ] links confirmados ou ocultos
- [ ] nada morto
- [ ] commit

### E56 · "Enviados recentemente" e "Mais enviados" (reais)
**Objetivo:** substituir a área inferior do rail por dados do `catalog_send_events`.
**Arquivos:** `CatalogRail.tsx`, `useCatalogRecentSends.ts`
1. `RecentList` (reuso) com os 5 últimos envios: thumb, produto, contato, `fmtAgo`.
2. "Mais enviados (30 dias)" top 3 por `count(product_id)`.
3. Renderiza só se houver ≥ 1 evento (hoje 0 → seção oculta).
4. Clique reabre o envio com o mesmo produto.
5. Teste com 3 eventos mockados.
6. `tsc`.
7. Screenshot (com dados de teste reais enviados na E08).
8. CHANGELOG.
9. RLS conferida.
10. Commit `feat(catalog): E56 recentes e mais enviados`.
**Checklist**
- [ ] fonte `catalog_send_events`
- [ ] oculto sem dados
- [ ] reabre envio
- [ ] commit

### E57 · Dica do dia e alertas do catálogo
**Objetivo:** `TipCard`/`AlertCard` com conteúdo real.
**Arquivos:** `CatalogRail.tsx`
1. `AlertCard warning` "Sincronização do PromoGifts há mais de 3 dias" só se `last_sync_at < now()-3d` (em 11/09 seria exibido: 05/09).
2. `AlertCard info` "308 produtos com estoque baixo" (valor real, clicável).
3. `TipCard` com 5 dicas de uso do catálogo (texto estático rotativo por dia).
4. Ocultáveis por sessão.
5. Teste das condições.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y `role=status`.
10. Commit `feat(catalog): E57 alertas e dica`.
**Checklist**
- [ ] alerta de sync real
- [ ] estoque baixo real
- [ ] ocultável
- [ ] commit

### E58 · Responsivo < 1280 + QA Fase 5 + merge
**Objetivo:** rail colapsável e merge.
**Arquivos:** `ExternalProductManagement.tsx`, `CatalogRail.tsx`, `docs/catalogo/PARIDADE.md`
1. Rail vira `Accordion` "Resumo do catálogo" acima da grade em `< xl`.
2. Grid 2/3 colunas em md/lg; chips com scroll.
3. Modais viram Drawer em `< md` (E20).
4. Prints 1280/1024/768/390.
5. PARIDADE seção "Rail".
6. Gates + build.
7. PR `feat/catalog-f5-rail → main`; merge.
8. Deploy + smoke.
9. Memória.
10. Branch `feat/catalog-f6-detail`.
**Checklist**
- [ ] 4 larguras verificadas
- [ ] PARIDADE rail
- [ ] PR mergeado
- [ ] branch F6

---

# FASE 6 — MODAL DE DETALHES (E59–E68) · mock B

### E59 · Layout 2 colunas e cabeçalho
**Objetivo:** estrutura do mock B.
**Arquivos:** `src/components/catalog/CatalogProductDetail.tsx`, `ProductDetailDialog.tsx`
1. Novo componente; `ProductDetailDialog` vira wrapper (mesmas props) — dialog do chat continua funcionando.
2. `DialogContent max-w-5xl p-0`; grid `md:grid-cols-[minmax(0,480px)_1fr]`.
3. Título 22 px bold no topo da coluna direita; `X` no canto.
4. Corpo rolável na direita; galeria fixa na esquerda.
5. Dados de `get_product` via `useQuery` (E06).
6. Skeleton do modal.
7. Teste render com produto completo.
8. `tsc`.
9. Screenshot.
10. Commit `feat(catalog): E59 layout do detalhe`.
**Checklist**
- [ ] 2 colunas
- [ ] wrapper compatível
- [ ] skeleton
- [ ] commit

### E60 · Galeria com contador, setas, coração e thumbs
**Objetivo:** "1 / 4", ‹ ›, ♥, 4 miniaturas.
**Arquivos:** `CatalogProductDetail.tsx`, `catalogShared.tsx` (`ProductGallery`)
1. Fonte: `images[]` (E21) + thumbs de variantes (`collectAllImages` estendido), deduplicadas.
2. Imagem principal `.catalog-media` 4:3; pill "1 / N" top-left; `FavoriteButton` top-right.
3. Setas `‹ ›` circulares `bg-background/70`; teclado ← →; swipe em touch.
4. Thumbs 88 px, ativa com ring primary; até 6 visíveis + "+N".
5. Zoom ao clicar (Dialog secundário com imagem grande).
6. Preload da próxima imagem.
7. Teste: navegação circular.
8. `tsc`.
9. Screenshot.
10. Commit `feat(catalog): E60 galeria`.
**Checklist**
- [ ] imagens reais do `images[]`
- [ ] teclado + swipe
- [ ] zoom
- [ ] commit

### E61 · Tags, preços e SKU
**Objetivo:** pills "Talheres | Utensílios · Só Marcas · Personalização", preços, SKU com copiar.
**Arquivos:** `CatalogProductDetail.tsx`
1. Pill de categoria = `full_path_readable` se vier; senão `parent.name | name`.
2. Pill fornecedor; pill "Personalização" tinted primary se `allows_personalization`; pill "Kit".
3. Preço de venda 26 px primary; "Preço sugerido" à direita.
4. SKU com ícone `Tag` + botão copiar (toast); `sku_promo` em tooltip se diferente.
5. `StockPill` "1573 em estoque"/Esgotado; se `next_entry_date` na variante → "Previsão de entrada dd/MM".
6. Teste.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E61 tags, preços, SKU`.
**Checklist**
- [ ] categoria em caminho
- [ ] copiar SKU
- [ ] previsão de entrada real
- [ ] commit

### E62 · Tiles de meta: Qtd. mínima / Prazo / Origem
**Objetivo:** card 3 colunas do mock.
**Arquivos:** `CatalogProductDetail.tsx`
1. `MetaTile` × 3 (`Layers`, `Clock`, `Globe`) com `min_quantity`, `lead_time_days` ("5 dias úteis"), `origin_country`.
2. Tile só renderiza se o campo existir; card some se todos nulos.
3. Tile extra "Modo de fornecimento" (`supply_mode`) se houver.
4. Teste.
5. `tsc`.
6. Screenshot.
7. CHANGELOG.
8. a11y.
9. Tooltip explicando "Prazo".
10. Commit `feat(catalog): E62 tiles de meta`.
**Checklist**
- [ ] 3 tiles condicionais
- [ ] sem "—"
- [ ] tooltip
- [ ] commit

### E63 · Descrição e Ficha técnica
**Objetivo:** dois `SectionCard` do mock.
**Arquivos:** `CatalogProductDetail.tsx`
1. Descrição: `short_description` → `description` → `ai_summary` (nessa ordem); "Ver mais" > 400 chars.
2. Ficha técnica: Dimensões (`dimensions_display`), Peso (`weight_g` g/kg), NCM, Material (`materials[]` joined), Capacidade (`capacity_ml`), Gravação (`engraving_type` + `engraving_description`), Embalagem (`packing_type`, `box_quantity`).
3. Grid 2 colunas com ícones `Ruler/Weight/Box/Layers/Droplet/PenTool/Package`.
4. Linha só se houver valor.
5. Teste com produto sem ficha → card some.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. Copiar ficha (botão) → texto formatado.
10. Commit `feat(catalog): E63 descrição e ficha`.
**Checklist**
- [ ] cascata de descrição
- [ ] 7 campos condicionais
- [ ] copiar ficha
- [ ] commit

### E64 · Cores disponíveis (swatches reais)
**Objetivo:** "Cores disponíveis ● BAMBU".
**Arquivos:** `CatalogProductDetail.tsx`
1. Fonte `color_swatches[]` (`color_name`, `color_hex`, `image_url`, `is_in_stock`, `stock_quantity`) com fallback `colors[]`.
2. `ColorSwatch` + chip nome; esgotada em `opacity-50` riscada.
3. Clique na cor → galeria pula para `image_url` da cor e pré-seleciona a variação para o envio.
4. Contagem "N cores".
5. Teste.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y: `aria-label="Cor Bambu, 1573 em estoque"`.
10. Commit `feat(catalog): E64 cores`.
**Checklist**
- [ ] swatches do backend
- [ ] esgotada marcada
- [ ] clique sincroniza galeria
- [ ] commit

### E65 · Variantes (N) com estoque e seleção
**Objetivo:** lista "AÇUCAREIRO … · SKU · 1573 un. ›".
**Arquivos:** `CatalogProductDetail.tsx`
1. Linhas: thumb 44, swatch, nome, SKU, estoque, chevron.
2. Agrupar por cor (`groupVariantsByColor`) com sub-linhas de tamanho quando `size_code`.
3. Clique → seleciona variante → botão do rodapé vira "Enviar variação X".
4. `max-h-64 overflow-auto`; busca inline se > 10.
5. "Previsão de entrada" por variante (`next_entry_date/quantity`).
6. Teste.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E65 variantes`.
**Checklist**
- [ ] agrupadas por cor
- [ ] seleção altera CTA
- [ ] previsão real
- [ ] commit

### E66 · Rodapé: fornecedor, Fechar, Enviar produto
**Objetivo:** barra inferior do mock B.
**Arquivos:** `CatalogProductDetail.tsx`
1. Esquerda: logo 20 px + "Fornecedor: Só Marcas" + "Entre em contato para mais informações sobre este produto." (texto estático).
2. Direita: `GhostButton` Fechar + `TalkXPrimaryButton glow` "Enviar produto" (desabilitado se esgotado com tooltip).
3. Enviar abre `SendProductDialog` com produto/variante pré-selecionados (fecha o detalhe).
4. Sticky no fundo do modal.
5. Teste: clique chama `onSend` com variante.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y: foco inicial no título.
10. Commit `feat(catalog): E66 rodapé`.
**Checklist**
- [ ] fornecedor com logo
- [ ] CTA com variante
- [ ] sticky
- [ ] commit

### E67 · Deep link, navegação entre produtos e histórico
**Objetivo:** `?view=catalog&product=<id>` e ‹ › entre resultados.
**Arquivos:** `ExternalProductManagement.tsx`, `CatalogProductDetail.tsx`
1. Abrir modal por URL (útil no ⌘K e no chat).
2. Fechar remove o param sem recarregar.
3. `PageUp/PageDown` (ou botões) navegam para o produto anterior/seguinte da página atual.
4. `recently_viewed` local (`localStorage`, 10 itens) — sem tabela.
5. Título da aba do navegador = nome do produto.
6. Teste do parser de URL.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E67 deep link e navegação`.
**Checklist**
- [ ] URL abre modal
- [ ] navegação entre produtos
- [ ] vistos recentemente local
- [ ] commit

### E68 · QA Fase 6 + merge
**Objetivo:** detalhe em `main`.
**Arquivos:** `docs/catalogo/PARIDADE.md`
1. PARIDADE seção "Detalhes" (produto com 4 fotos, kit, esgotado, sem ficha).
2. Fluxo: abrir → cor → variante → Enviar produto → modal de envio com variação.
3. Gates + build.
4. PR `feat/catalog-f6-detail → main`; merge.
5. Deploy + smoke.
6. Sentry.
7. Memória.
8. CHANGELOG.
9. Prints.
10. Branch `feat/catalog-f7-send`.
**Checklist**
- [ ] PARIDADE detalhes
- [ ] fluxo completo
- [ ] PR mergeado
- [ ] branch F7

---

# FASE 7 — ENVIAR PRODUTO (E69–E80) · mock C

### E69 · Layout 2 colunas `[1fr_380px]` e cabeçalho
**Objetivo:** estrutura do mock C.
**Arquivos:** `src/components/catalog/CatalogSendDialog.tsx`, `SendProductDialog.tsx`
1. Novo componente; `SendProductDialog` vira wrapper (mesmas props, incl. `onConfirmSend` do chat).
2. `DialogContent max-w-6xl p-0`; header `IconTile` `Send` + "Enviar Produto" / "Selecione fotos, ajuste a mensagem e envie ao cliente."
3. Esquerda rolável; direita `aside` com preview sticky.
4. Rodapé fixo.
5. Estado do fluxo em `useReducer` (`mode, colorGroup, images, template, custom, step`).
6. Skeleton enquanto `get_product`.
7. Teste render.
8. `tsc`.
9. Screenshot.
10. Commit `feat(catalog): E69 layout do envio`.
**Checklist**
- [ ] 2 colunas
- [ ] wrapper compatível com chat
- [ ] reducer
- [ ] commit

### E70 · Toggle "Produto completo / Variação específica" + card de info
**Objetivo:** segmented do mock C.
**Arquivos:** `CatalogSendDialog.tsx`
1. `SegmentedToggle` (reuso) com ícones `Package`/`Palette`.
2. Card info à direita do toggle: texto muda por modo ("Envia as informações completas do produto, com fotos e descrição." / "Envia só a cor/variação escolhida.").
3. "Variação específica" desabilitado se produto sem variantes (tooltip).
4. Mudar modo reseta imagens selecionadas e template custom.
5. Teste.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y `role=radiogroup`.
10. Commit `feat(catalog): E70 modo de envio`.
**Checklist**
- [ ] segmented
- [ ] info por modo
- [ ] reset ao trocar
- [ ] commit

### E71 · Seleção de variação (cards com foto/cor/estoque)
**Objetivo:** grade de variações do mock C (modo variação).
**Arquivos:** `CatalogSendDialog.tsx`
1. Cards 2 colunas: thumb 44, swatch, nome, "N fotos · N un.", check.
2. Selecionada: `border-primary bg-primary/5 ring-1`.
3. Esgotada: visível, desabilitada.
4. Pré-seleção vinda do detalhe (E66).
5. Teste.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. Teclado: setas movem seleção.
10. Commit `feat(catalog): E71 variação específica`.
**Checklist**
- [ ] grade de variações
- [ ] pré-seleção
- [ ] esgotada bloqueada
- [ ] commit

### E72 · "Fotos do produto" — strip, contador, +N, Adicionar fotos
**Objetivo:** faixa de fotos do mock C.
**Arquivos:** `CatalogSendDialog.tsx`, `CatalogPhotoPicker.tsx`
1. Título "Fotos do produto · `k` de `N` fotos selecionadas" + "Desmarcar todas / Selecionar todas".
2. Thumbs 88 px; selecionada com ring + check azul; até 5 visíveis + tile "+N fotos".
3. Tile "Adicionar fotos" abre `CatalogPhotoPicker` (Dialog) com **todas** as imagens reais (`images[]` + variantes + `box_image` + `set_image_url`) para marcar/desmarcar.
4. Primeira selecionada = capa (arrastar para reordenar com `@hello-pangea/dnd`).
5. Limite 10 fotos por envio (aviso).
6. Teste: +N e picker.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E72 fotos do produto`.
**Checklist**
- [ ] strip + "+N"
- [ ] picker com imagens reais
- [ ] limite 10
- [ ] commit

### E73 · Modelo de mensagem: tabs + Editar + contador
**Objetivo:** "Formal / Informal / Promoção · ✎ Editar · 317/2000".
**Arquivos:** `CatalogSendDialog.tsx`, `sendProductUtils.ts`
1. Tabs pill (Informal default); "Editar" alterna para `Textarea` com o texto atual.
2. Contador `n/2000`; > 2000 bloqueia envio (limite do produto, documentado).
3. `buildMessage` v2: inclui "Marca: · Valor: · Cores: · Qtd. mínima · Personalização" e descrição curta (`short_description` → `ai_summary` → `description[:200]`); linhas vazias colapsadas.
4. Emojis do mock nos templates (já existem).
5. Variáveis `{{nome}}` do contato substituídas na E86 (preview mostra "Cliente").
6. Teste snapshot dos 3 templates com/sem variante.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E73 modelo de mensagem`.
**Checklist**
- [ ] tabs + editar
- [ ] contador/limite
- [ ] snapshots
- [ ] commit

### E74 · Preview WhatsApp (moldura de telefone)
**Objetivo:** coluna direita do mock C.
**Arquivos:** `catalogShared.tsx` (`PhonePreview`), `CatalogSendDialog.tsx`
1. Reusar o `PhonePreview` do wizard Talk X (F6/F8) se exportado; senão extrair para `talkxShared` com prop `contactName`.
2. Header "Cliente · online" com avatar genérico; ícones vídeo/telefone/menu.
3. Bolha de imagem (capa) + bolha de texto verde WhatsApp (cor do WhatsApp permitida — é simulação do app, não superfície do ZAPP).
4. Hora real `HH:mm` + ✓✓.
5. Múltiplas fotos → carrossel na bolha "1/N".
6. Atualiza em tempo real ao editar.
7. Teste render.
8. `tsc`.
9. Screenshot.
10. Commit `feat(catalog): E74 preview WhatsApp`.
**Checklist**
- [ ] reuso do preview Talk X
- [ ] tempo real
- [ ] carrossel
- [ ] commit

### E75 · Rodapé: Cancelar · Selecionar contato ▾ (Copiar / Baixar)
**Objetivo:** barra inferior do mock C.
**Arquivos:** `CatalogSendDialog.tsx`
1. `GhostButton` Cancelar; `TalkXPrimaryButton glow` "Selecionar contato" com `User` + split `DropdownMenu` (chevron).
2. Itens: Copiar descrição, Baixar fotos (N), Copiar link do produto.
3. Download individual (comportamento atual, sem nova dependência), arquivos `sku_cor_n.jpg`.
4. Validação: ≥ 1 foto ou texto não vazio.
5. `onConfirmSend` (chat) envia direto sem etapa de contato.
6. Teste.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E75 rodapé do envio`.
**Checklist**
- [ ] split button
- [ ] 3 ações
- [ ] validação
- [ ] commit

### E76 · Envio de produto para conversa aberta (chat)
**Objetivo:** `ExternalProductCatalog` (dialog do chat) usa o novo fluxo.
**Arquivos:** `ExternalProductCatalog.tsx`, `src/components/inbox/…` (ponto de chamada)
1. Dialog do chat passa a renderizar o mesmo grid (`CatalogProductCard`) e `CatalogSendDialog` com `onConfirmSend`.
2. Contato da conversa aberta já é o destino; etapa de contato pulada.
3. Mensagem + fotos entram na conversa via `sendOutboundMessage` (mesmo caminho).
4. Evento em `catalog_send_events` com `contact_id` da conversa.
5. Teste do dialog do chat.
6. `tsc`.
7. Smoke no inbox real.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E76 envio pelo chat unificado`.
**Checklist**
- [ ] chat usa os novos componentes
- [ ] evento logado
- [ ] smoke inbox
- [ ] commit

### E77 · Rascunho e restauração do envio
**Objetivo:** não perder edição ao fechar sem querer.
**Arquivos:** `CatalogSendDialog.tsx`
1. Estado do reducer salvo em `sessionStorage catalog.sendDraft.<productId>` a cada mudança (debounce 500 ms).
2. Ao reabrir o mesmo produto → banner "Restaurar rascunho?".
3. `TalkXConfirmDialog` ao fechar com texto custom não enviado.
4. Limpa rascunho após envio.
5. Teste.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. Sem PII no storage além do que já está na tela.
10. Commit `feat(catalog): E77 rascunho`.
**Checklist**
- [ ] rascunho por produto
- [ ] confirmação ao fechar
- [ ] limpeza pós-envio
- [ ] commit

### E78 · Deep link de envio e atalhos
**Objetivo:** `?view=catalog&product=<id>&send=1[&variant=<cor>]`.
**Arquivos:** `ExternalProductManagement.tsx`, `CatalogSendDialog.tsx`
1. Parser de URL abre o envio direto (usado por ⌘K, rail "Enviados recentemente", CRM 360).
2. `Ctrl+Enter` avança para contato; `Esc` fecha com confirmação.
3. Teste.
4. `tsc`.
5. CHANGELOG.
6. Screenshot.
7. a11y foco inicial no toggle.
8. Título da aba.
9. Sem duplicar handlers do E67 (mesmo parser).
10. Commit `feat(catalog): E78 deep link do envio`.
**Checklist**
- [ ] URL abre envio
- [ ] atalhos
- [ ] parser único
- [ ] commit

### E79 · Envio multi-produto (seleção em massa)
**Objetivo:** "Enviar seleção" da E49.
**Arquivos:** `CatalogSendDialog.tsx`
1. Modo multi: lista dos até 10 produtos à esquerda com capa e preço; mensagem única de lista ("Separei estes produtos: 1. … 2. …").
2. Fotos: 1 capa por produto (editável).
3. Preview mostra N bolhas.
4. Contador de mensagens que serão enviadas.
5. Teste com 3 produtos.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. Limite 10 respeitado.
10. Commit `feat(catalog): E79 envio multi-produto`.
**Checklist**
- [ ] modo multi
- [ ] mensagem de lista
- [ ] limite
- [ ] commit

### E80 · QA Fase 7 + merge
**Objetivo:** envio em `main`.
**Arquivos:** `docs/catalogo/PARIDADE.md`
1. PARIDADE seção "Enviar Produto" (completo, variação, editando, multi).
2. Fluxo: detalhe → enviar → variação → fotos → editar → preview.
3. Gates + build.
4. PR `feat/catalog-f7-send → main`; merge.
5. Deploy + smoke (sem enviar).
6. Sentry.
7. Memória.
8. CHANGELOG.
9. Prints.
10. Branch `feat/catalog-f8-contact`.
**Checklist**
- [ ] PARIDADE envio
- [ ] fluxo completo
- [ ] PR mergeado
- [ ] branch F8

---

# FASE 8 — SELECIONAR CONTATO & ENVIO REAL (E81–E90) · mock D

### E81 · Layout 2 colunas e card-resumo do produto
**Objetivo:** estrutura do mock D.
**Arquivos:** `src/components/catalog/CatalogContactStep.tsx`, `ContactSelectionStep.tsx`
1. Novo componente; `ContactSelectionStep` vira wrapper.
2. Header `IconTile` `Users` + "Selecionar Contato" / "Escolha para quem enviar o produto selecionado".
3. Card do produto: thumb 96, nome, "Modelo informal", pill "N foto(s) selecionada(s)".
4. Grid `md:grid-cols-[1fr_300px]`.
5. Teste render.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y.
10. Commit `feat(catalog): E81 layout do contato`.
**Checklist**
- [ ] 2 colunas
- [ ] card-resumo
- [ ] wrapper compatível
- [ ] commit

### E82 · Busca e lista de contatos (recentes + resultado)
**Objetivo:** lista do mock D.
**Arquivos:** `CatalogContactStep.tsx`, `useSendProduct.ts`
1. Sem busca: 15 mais recentes por `updated_at` (já existe) + seção "Enviados recentemente" (contatos de `catalog_send_events`) se houver.
2. Busca ≥ 2 chars, debounce 300 ms, `ilike` nome/telefone (já existe) + normalização de telefone (só dígitos).
3. Linha: `InitialsAvatar` 40 (com `avatar_url`), nome, telefone formatado `+55 (41) 9…`, radio à direita; selecionada com borda primary + check.
4. Manter limite 15 sem virtualização.
5. Estado vazio "Nenhum contato encontrado" + link "Criar contato" (`?view=contacts&new=1` se existir).
6. Teste: busca por telefone parcial.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E82 lista de contatos`.
**Checklist**
- [ ] recentes + enviados
- [ ] telefone normalizado
- [ ] radio/seleção
- [ ] commit

### E83 · "Resumo do envio" (checklist)
**Objetivo:** rail do mock D.
**Arquivos:** `CatalogContactStep.tsx`
1. `RailCard` "Resumo do envio · Confira os detalhes antes de enviar".
2. 4 linhas com `IconTile soft` + check verde: 1 produto (nome), N foto(s), Mensagem pronta (Modelo: X / Personalizada), Destino (nome + telefone; cinza "Selecione um contato" até escolher).
3. Modo multi: "N produtos".
4. `AlertCard info` "Pronto para enviar! O produto será enviado para {nome} pelo WhatsApp com a mensagem selecionada." só com contato selecionado.
5. Teste: sem contato → 3 checks + destino pendente.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y `aria-live` no card.
10. Commit `feat(catalog): E83 resumo do envio`.
**Checklist**
- [ ] 4 linhas
- [ ] "Pronto para enviar" condicional
- [ ] multi
- [ ] commit

### E84 · Rodapé: Voltar · Enviar agora (estados)
**Objetivo:** barra inferior do mock D.
**Arquivos:** `CatalogContactStep.tsx`
1. `GhostButton` Voltar (mantém estado do envio).
2. `TalkXPrimaryButton glow` "Enviar agora" desabilitado sem contato; `loading` durante envio com "Enviando 2/4…".
3. Verificação de conexão WhatsApp ativa antes (já existe em `useSendProduct` — reaproveitar) com estado `TalkXWhatsAppDisconnectedState`.
4. Verificação de opt-out/supressão do contato (`talkx_blacklist_active`) → aviso e bloqueio.
5. Teste dos estados.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. `Ctrl+Enter` envia.
10. Commit `feat(catalog): E84 enviar agora`.
**Checklist**
- [ ] progresso real
- [ ] bloqueio por conexão/supressão
- [ ] atalho
- [ ] commit

### E85 · Envio real: caption na 1ª foto, ordem, throttle
**Objetivo:** menos mensagens, mais robusto.
**Arquivos:** `useSendProduct.ts`
1. Decisão da E08: 1ª imagem com `caption = mensagem` (1 mensagem a menos); demais imagens sem caption; texto separado só se sem fotos. Confirmar que `sendOutboundMessage` aceita `caption` (coluna `messages.caption` existe).
2. Pausa 800–1.500 ms entre fotos (humanização; evita ban).
3. Ordem: capa primeiro.
4. Falha em 1 foto não aborta as demais; resultado `partial`.
5. Grava `catalog_send_events` com `message_ids`.
6. Teste unitário com mock de `sendOutboundMessage` (sucesso/parcial/falha).
7. Envio real para número de teste; verificar `messages.status`.
8. `tsc`.
9. CHANGELOG + `ENVIO_E2E.md` atualizado.
10. Commit `feat(catalog): E85 envio com caption e throttle`.
**Checklist**
- [ ] caption na capa
- [ ] throttle
- [ ] parcial tratado
- [ ] envio real verificado

### E86 · Personalização por contato (`{{nome}}`)
**Objetivo:** "Oi, Tomaz!" real.
**Arquivos:** `sendProductUtils.ts`, `CatalogContactStep.tsx`
1. Reusar `personalizePreview`/`extractVariables` do `talkxShared` (`{{nome}}`, `{{empresa}}`).
2. Templates ganham `{{nome}}` no cumprimento; sem contato o preview mostra "Cliente".
3. Preview do telefone no passo de contato atualiza com o nome real ao selecionar.
4. Fallback quando `contacts.name` vazio → "Olá!".
5. Teste.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. Documentar variáveis em `COMPONENTES.md`.
10. Commit `feat(catalog): E86 personalização`.
**Checklist**
- [ ] reuso do Talk X
- [ ] preview com nome real
- [ ] fallback
- [ ] commit

### E87 · Pós-envio: toast com link para a conversa
**Objetivo:** fechar o ciclo.
**Arquivos:** `useSendProduct.ts`, `CatalogSendDialog.tsx`
1. Toast `sonner` "✅ Produto enviado para Tomaz · Abrir conversa" → `?view=inbox&contact=<id>` (confirmar param real do inbox).
2. Parcial → toast `warning` com detalhe.
3. Falha → toast `error` + botão "Tentar de novo" (reabre no passo de contato).
4. Fecha modal e limpa rascunho.
5. Atualiza `useCatalogRecentSends`.
6. Teste.
7. `tsc`.
8. Screenshot.
9. CHANGELOG.
10. Commit `feat(catalog): E87 pós-envio`.
**Checklist**
- [ ] link para conversa (param confirmado)
- [ ] 3 tons
- [ ] recentes atualizados
- [ ] commit

### E88 · Envio pelo CRM 360 / contato aberto
**Objetivo:** atalho "Enviar produto" no perfil do contato.
**Arquivos:** `src/components/contacts/…` ou `crm360/…` (ponto de extensão)
1. Botão "Enviar produto" no header do contato → abre catálogo em dialog com contato pré-selecionado (pula passo D).
2. Reuso de `ExternalProductCatalog` com prop nova `presetContact`.
3. Evento logado com `contact_id`.
4. Teste.
5. `tsc`.
6. Smoke.
7. Screenshot.
8. CHANGELOG.
9. Sem novo componente.
10. Commit `feat(catalog): E88 envio pelo contato`.
**Checklist**
- [ ] botão no contato
- [ ] contato pré-selecionado
- [ ] evento
- [ ] commit

### E89 · Métricas de uso do catálogo (reais)
**Objetivo:** dados para o rail e para relatórios.
**Arquivos:** migration (view), `useCatalogStats` (ZAPP)
1. View `catalog_send_stats` no ZAPP: envios por dia (30 d), por agente, por produto, taxa parcial/falha.
2. Rail: "Envios hoje / 7 dias" só se ≥ 1.
3. Card em `?view=reports` "Catálogo" (se o módulo de relatórios aceitar cards) — senão apenas rail.
4. RLS da view (security invoker).
5. Catalogar no schema/manifest.
6. Teste da query.
7. `db-guard` verde.
8. CHANGELOG.
9. `ARQUITETURA.md` mapa atualizado.
10. Commit `feat(catalog): E89 métricas de envio`.
**Checklist**
- [ ] view catalogada
- [ ] rail condicional
- [ ] db-guard
- [ ] commit

### E90 · QA Fase 8 + merge
**Objetivo:** envio real em `main`.
**Arquivos:** `docs/catalogo/PARIDADE.md`
1. PARIDADE seção "Selecionar contato".
2. Fluxo real ponta a ponta com número de teste: catálogo → detalhe → enviar → contato → recebido no WhatsApp; `messages`, `catalog_send_events` e rail atualizados.
3. Gates + build.
4. PR `feat/catalog-f8-contact → main`; merge.
5. Deploy + smoke.
6. Sentry.
7. Memória.
8. CHANGELOG.
9. Prints.
10. Branch `feat/catalog-f9-release`.
**Checklist**
- [ ] e2e real comprovado
- [ ] PARIDADE contato
- [ ] PR mergeado
- [ ] branch F9

---

# FASE 9 — CHAT, FAVORITOS, QA, A11Y, E2E & RELEASE (E91–E100)

### E91 · Abas do módulo: Catálogo · Favoritos · Enviados
**Objetivo:** navegação secundária com `DashboardTabs`.
**Arquivos:** `ExternalProductManagement.tsx`, `CatalogFavoritesTab.tsx`, `CatalogSentTab.tsx`
1. `DashboardTabs` (reuso) abaixo do header; deep link `?tab=`.
2. Favoritos: grade dos favoritos do usuário (snapshot da tabela + refetch dos produtos por id em lotes de 20); remover em massa.
3. Enviados: `TalkXTable` com `catalog_send_events` (produto, contato, agente, modelo, fotos, status, data) + filtros + export CSV.
4. Contagem nas abas (real).
5. Teste.
6. `tsc`.
7. Screenshot.
8. CHANGELOG.
9. a11y tabs.
10. Commit `feat(catalog): E91 abas`.
**Checklist**
- [ ] 3 abas com deep link
- [ ] favoritos reais
- [ ] enviados com export
- [ ] commit

### E92 · Dialog do chat com paridade total
**Objetivo:** `ExternalProductCatalog` = mesma experiência da tela A em Dialog.
**Arquivos:** `ExternalProductCatalog.tsx`
1. Reusar header compacto, `CatalogFilterBar`, grade, paginação e estados.
2. `max-w-6xl h-[85vh]`; rail oculto.
3. Favoritos como chip de filtro "Meus favoritos".
4. Teste do dialog.
5. `tsc`.
6. Smoke no inbox.
7. Screenshot.
8. CHANGELOG.
9. Remover código morto do dialog antigo.
10. Commit `feat(catalog): E92 dialog do chat`.
**Checklist**
- [ ] mesmos componentes
- [ ] favoritos no chat
- [ ] código morto removido
- [ ] commit

### E93 · Acessibilidade
**Objetivo:** WCAG AA no módulo.
**Arquivos:** todos do catálogo
1. `axe` via Playwright em A/B/C/D: 0 violações sérias.
2. Foco visível (`--ring`) em cards, chips, thumbs, radios.
3. Ordem de tab lógica nos modais; `Esc` fecha; foco retorna ao gatilho.
4. `alt` descritivo em todas as imagens (nome + cor).
5. Contraste dos badges ≥ 4,5:1 (ajustar `/15` → `/20` se precisar).
6. `aria-live` para contagem de resultados e progresso de envio.
7. Reduced motion.
8. Teste automatizado de a11y no vitest (`jest-axe`) para o card.
9. CHANGELOG.
10. Commit `feat(catalog): E93 a11y`.
**Checklist**
- [ ] axe 0 sérias
- [ ] contraste verificado
- [ ] foco/teclado
- [ ] commit

### E94 · Performance e imagens
**Objetivo:** grade rápida com 7.576 produtos.
**Arquivos:** `catalogShared.tsx`, `ExternalProductManagement.tsx`
1. `sizes` corretos por breakpoint; `fetchpriority=high` nas 4 primeiras capas.
2. `content-visibility: auto` nos cards abaixo da dobra.
3. Bundle: `recharts` só no rail (lazy); modais lazy (`React.lazy`).
4. Lighthouse perf ≥ 90 na view em 4G simulado; LCP < 2,5 s.
5. Payload de `list_products compact` < 30 KB por página.
6. Medições registradas em `docs/catalogo/PERF.md`.
7. `tsc`.
8. CHANGELOG.
9. Teste de tamanho de bundle (`vite build --report`).
10. Commit `perf(catalog): E94 imagens e bundle`.
**Checklist**
- [ ] Lighthouse ≥ 90
- [ ] modais lazy
- [ ] PERF.md
- [ ] commit

### E95 · Testes unitários completos
**Objetivo:** cobertura do módulo.
**Arquivos:** `src/components/catalog/__tests__/*`
1. Cards, badges, chips, filtros, reducer, export, envio (mock), contato, favoritos.
2. Cobertura ≥ 80% em `src/components/catalog` (`vitest --coverage`).
3. Testes Deno da edge (todas as ações).
4. Rodar em < 30 s.
5. Sem `Math.random`/`Date.now` em render (grep).
6. `tsc`.
7. CHANGELOG.
8. CI executa os testes do catálogo.
9. Cobertura registrada.
10. Commit `test(catalog): E95 cobertura`.
**Checklist**
- [ ] ≥ 80%
- [ ] Deno verde
- [ ] < 30 s
- [ ] commit

### E96 · E2E Playwright via MCP
**Objetivo:** fluxo real automatizado em prod-like.
**Arquivos:** `e2e/catalog.spec.ts`
1. Login → `?view=catalog` → busca "açucareiro" → card → detalhes → cor → Enviar → fotos → Informal → Selecionar contato → contato de teste → Enviar agora → toast.
2. Asserts de `messages` e `catalog_send_events` via API.
3. Rodar com `PLAYWRIGHT - MCP - WORKERS` (`pw_sequence`) contra o preview da Vercel.
4. Screenshots das 4 telas anexadas ao `PARIDADE.md`.
5. Limpeza dos dados de teste.
6. Flake < 1/10.
7. CHANGELOG.
8. Documentar comando.
9. `tsc`.
10. Commit `test(catalog): E96 e2e`.
**Checklist**
- [ ] spec verde
- [ ] asserts de DB
- [ ] limpeza
- [ ] commit

### E97 · Ajuda contextual e onboarding do módulo
**Objetivo:** botão "Ajuda" e tour curto.
**Arquivos:** `CatalogHelpSheet.tsx`
1. `Sheet` "Como usar o catálogo": 5 passos com prints reais.
2. Tour de 4 dicas (`localStorage catalog.tourDone`) na primeira visita: chips, filtros avançados, favoritos, enviar.
3. Link para PromoGifts e para `docs/catalogo/README.md`.
4. Teste.
5. `tsc`.
6. Screenshot.
7. CHANGELOG.
8. a11y.
9. Textos revisados (pt-BR).
10. Commit `feat(catalog): E97 ajuda`.
**Checklist**
- [ ] sheet + tour
- [ ] só na primeira visita
- [ ] textos revisados
- [ ] commit

### E98 · PARIDADE final e revisão de tokens
**Objetivo:** prova visual de paridade em carvão.
**Arquivos:** `docs/catalogo/PARIDADE.md`
1. Tabela por tela (A/B/C/D): elemento do mock → implementado → diferença deliberada (carvão, links externos, placeholder removido).
2. Grep de cores literais em `src/components/catalog` e `.catalog-*` → 0 (exceto `bg-white` da mídia e verde do preview WhatsApp, documentados).
3. Prints finais 1920/1440/1280/390.
4. Revisão de textos (acentuação, "Qtd. mínima", "dias úteis").
5. Lista de itens do mock **não** implementados com motivo (Importar planilha, Novo Produto local, "SUA MARCA AQUI").
6. `tsc`.
7. CHANGELOG.
8. README do módulo atualizado.
9. Memória.
10. Commit `docs(catalog): E98 paridade final`.
**Checklist**
- [ ] 4 telas comparadas
- [ ] 0 cor literal fora das exceções
- [ ] não-implementados justificados
- [ ] commit

### E99 · Hardening final: RLS, rate limit, Sentry, logs
**Objetivo:** produção sem surpresa.
**Arquivos:** `docs/catalogo/SECURITY.md`, edge, migrations
1. Auditar RLS de `catalog_favorites`/`catalog_send_events`/`catalog_send_stats` com usuário não-admin.
2. Confirmar que a service key do PromoGifts só existe em Edge secrets (grep no repo e no bundle).
3. Sentry: breadcrumbs `catalog.*` e alerta para `CATALOG_UPSTREAM_ERROR` > 5/min.
4. Rate limit da edge testado (61 chamadas → 429) e UI trata.
5. Logs da edge sem PII.
6. `deployment-manifest.json` final.
7. `db-guard`/`usage-guard` verdes.
8. CHANGELOG.
9. `SECURITY.md` do módulo.
10. Commit `chore(catalog): E99 hardening`.
**Checklist**
- [ ] RLS testada com 2 usuários
- [ ] secret só na edge
- [ ] 429 tratado
- [ ] commit

### E100 · Release v1.0.0 do módulo Catálogo
**Objetivo:** tag, handoff, limpeza.
**Arquivos:** `docs/catalogo/HANDOFF_v1.md`
1. Rebase, gates, build, e2e.
2. PR `feat/catalog-f9-release → main`; merge.
3. Deploy Vercel + edge verificados; smoke completo.
4. Tag `catalog-v1.0.0` + release notes (do CHANGELOG).
5. Handoff `HANDOFF_v1.md` (estado, pendências, comandos).
6. Memória do projeto atualizada.
7. Lint/typecheck baselines reduzidos e commitados.
8. `graphify update` final.
9. Remover branches `feat/catalog-*` mergeados.
10. Anunciar no CHANGELOG raiz.
**Checklist**
- [ ] tag criada
- [ ] handoff
- [ ] memória
- [ ] branches limpos

---

## Itens não verificados na geração do plano (fechar nas etapas indicadas)

- Grafo de imports do legado (E03).
- Colunas de `v_catalog_stats` / `user_favorites` / `product_views` no DB externo (E24/E27).
- URLs públicas do PromoGifts para "Novo Produto" / "Importar planilha" / "Gerenciar categorias" / link de produto (E32/E47/E55).
- Variantes de imagem do Cloudflare Images (E15).
- Preenchimento de `order_count` e `search_vector` (E23/E48).
- Param real do inbox para abrir conversa por contato (E87).
