# PARIDADE.md — Catálogo / Promo Gifts

Paridade entre o mock de referência e o que está implementado no módulo
`?view=catalog` (`src/components/catalog/`). Cada tela tem o print em
`docs/catalogo/screens/` como fonte visual e a evidência no código (arquivo:linha)
como fonte de verdade. O catálogo é **somente-leitura** no ZAPP: criação e edição de
produtos são do PromoGifts.

Criado em 2026-10-01

> **Escopo.** Este arquivo cobre as quatro telas (A-catálogo, Detalhes, Enviar,
> Contato), incluindo as seções **Topo** e **Grade** da Tela A. A seção
> **Tela A** foi acrescentada na etapa CT-89; os prints responsivos (1920/1440/1280)
> da Tela A ficam pendentes da CT-66. "Diferença deliberada" = divergência assumida
> do mock, com o motivo — não é item pendente.

---

## Tela A — Catálogo / lista de produtos (`ExternalProductManagement.tsx` · `ExternalProductCatalog.tsx`)

Print: [`screens/A-catalogo.jpg`](./screens/A-catalogo.jpg)

A Tela A tem **duas apresentações** com o mesmo Topo/Grade: a **página**
(`?view=catalog`, `ExternalProductManagement.tsx`), com as 3 abas e o rail direito, e o
**Sheet do chat** (`ExternalProductCatalog.tsx`, chamado pelo chat — CT-14), com o chip
"Meus favoritos" no lugar das abas. As duas montam o mesmo `CatalogProductCard` e os
mesmos primitivos de `catalogShared.tsx`.

### Topo

| Item do mock | Status | Arquivo / evidência |
|---|---|---|
| Header com ícone + título + subtítulo (nº de produtos) | ✅ | `ExternalProductManagement.tsx:756-780` (`ModuleHeader`, `stats.total`) |
| Ações do header: chip de sync, Ajuda, Atualizar, "Gerenciar no PromoGifts" (link externo) | ✅ | `ExternalProductManagement.tsx:763-777` (`SyncStatusChip` `:81`, `:763`) |
| Abas Produtos / Favoritos / Enviados com contador (badge) | ✅ | `ExternalProductManagement.tsx:719-738` (`TabsList`; `TabCount` `:173`; `:724`/`:729`/`:736`) |
| KPIs clicáveis (total/estoque/destaque/novidade/…) → aplicam filtro | ✅ | `catalogShared.tsx:394-426` (`CatalogKpiStrip`, `data-testid="catalog-kpi-strip"` `:405`); uso `ExternalProductManagement.tsx:787` |
| Chips de categoria (raízes + "Mais ▾") | ✅ | `catalogShared.tsx:485-557` (`CategoryChips`); uso `ExternalProductManagement.tsx:795-801` |
| Chips de filtro avançado ativos (removíveis) | ✅ | `catalogShared.tsx:833-912` (`AdvancedFilterChips`); uso `ExternalProductManagement.tsx:790-793` |
| Busca por nome/SKU/marca + limpar | ✅ | `ExternalProductManagement.tsx:804-818`; no Sheet `ExternalProductCatalog.tsx:390-405` |
| Select de categoria em árvore (raiz semibold + filhos indentados) com contagem | ✅ | `ExternalProductManagement.tsx:820-842` (`:830`/`:834`, `countLabel`); `ExternalProductCatalog.tsx:407-429` |
| Select de fornecedor | ✅ sem contagem | `ExternalProductManagement.tsx:844-858` (motivo `:850-853`); `ExternalProductCatalog.tsx:431-446` — CT-60 |
| Toggle "Em estoque" | ✅ | `ExternalProductManagement.tsx:860-863`; `ExternalProductCatalog.tsx:448-451` |
| Alternância Grade / Lista | ✅ | `ExternalProductManagement.tsx:865-872`; `ExternalProductCatalog.tsx:468-475` |
| Modo de seleção em massa ("Selecionar") | ✅ | `ExternalProductManagement.tsx:874-882`; `ExternalProductCatalog.tsx:480-489` |
| Botão "Filtros avançados" com contador | ✅ | `ExternalProductManagement.tsx:884-892` (`advCount`) |
| Contador "Mostrando X–Y de Z" (região viva) | ✅ | `ExternalProductManagement.tsx:895-903`; `ExternalProductCatalog.tsx:499-503` (`role="status"`, CT-68) |
| Ordenação ("Ordenar: …") | ✅ | `ExternalProductManagement.tsx:910-929`; "Mais pedidos" oculto de propósito (CT-22, `SORT_OPTIONS` `:547-560`) |
| Chip da flag "Mostrando só Novidades · limpar" | ✅ | `ExternalProductManagement.tsx:947-961` (`data-testid="catalog-flag-chip"`, CT-65) |
| Aba Favoritos | ✅ | `ExternalProductManagement.tsx:1116-1118` (`CatalogFavoritesTab`) |
| Aba Enviados: tabela + filtro de status + Exportar CSV | ✅ | `ExternalProductManagement.tsx:1123-1186` (`TalkXTable` `:1167`, "Exportar CSV" `:1153`) — CT-57 |
| Atalhos `/`, `Esc`, `Ctrl/Cmd+F` | ✅ | `ExternalProductManagement.tsx:674-705` (listener `:714`) — CT-61 |
| Botão "Novo Produto" | ⊘ não implementado | catálogo é somente-leitura no ZAPP (criação/edição é do PromoGifts) — ver "Itens do mock não implementados" |
| Rail direito: KPIs/contagens clicáveis, série mensal, envios recentes | ✅ | `ExternalProductManagement.tsx:1094-1112` (`CatalogRail`); `CatalogRail.tsx:432` (rail), `:240` (`RailCounts`), `:180` (`RailMonthlyChart`), `:295` (`RailRecentSends`) |
| Rail vira `Accordion` acima da grade em `<1280px` | ❌ não implementado | rail é `hidden xl:block` (`ExternalProductManagement.tsx:1094`); o Accordion responsivo (E58) não foi construído — `COMPONENTES.md:61` |

### Grade

| Item do mock | Status | Arquivo / evidência |
|---|---|---|
| Card de produto reusado nas duas telas | ✅ | `CatalogProductCard.tsx:216`; uso `ExternalProductManagement.tsx:1011`, `ExternalProductCatalog.tsx:542`/`:607`/`:645` |
| Badge do card (Novo / Top / Promo / categoria, por prioridade) | ✅ | `CatalogProductCard.tsx:77-99` (`is_new` `:78`, `is_bestseller` `:83`, `is_on_sale` `:88`) |
| Chips de cor (swatches + "+N") e contagem de cores | ✅ | `CatalogProductCard.tsx:102-130` (`ColorChips`); `catalogShared.tsx:178` |
| Preço com sugerido riscado | ✅ | `catalogShared.tsx:208-224` (`PriceTag`) |
| Pills de estoque / estoque baixo / esgotado | ✅ | `CatalogProductCard.tsx:133-140` (`LowStockPill`); `catalogShared.tsx:225-235` (`StockPill`) |
| Favoritar (coração) e selecionar (checkbox) no card | ✅ | `CatalogProductCard.tsx:143-159` (`FavoriteButton`), `:162-185` (`SelectCheckbox`) |
| Grade responsiva 2→5 colunas | ✅ | `ExternalProductManagement.tsx:997-1001` (`xl:grid-cols-5`); `ExternalProductCatalog.tsx:302-304` (`lg:grid-cols-4`) |
| Skeletons durante o carregamento | ✅ | `CatalogProductCard.tsx:188`; uso `ExternalProductManagement.tsx:966-970` |
| Estados vazios (sem filtro / com filtro / erro) | ✅ | `ExternalProductManagement.tsx:972-992`; `ExternalProductCatalog.tsx:562-574` |
| Barra fina de progresso no refetch (dado anterior na tela) | ✅ | `ExternalProductCatalog.tsx:514-528` (`data-testid="catalog-fetching-bar"`, CT-29) |
| Paginação (`TalkXPagination`; tamanho de página 24/48/96 na página) | ✅ | `ExternalProductManagement.tsx:101-102`, `:1029-1038`; `ExternalProductCatalog.tsx:665-675` |
| Virtualização do modo lista | ✅ só no Sheet | `ExternalProductCatalog.tsx:245-268` (`useVirtualizer`, `VIRTUALIZE_MIN_PAGE_SIZE=48` `:73`, espaçadores `:596-626`) — CT-27 |
| Virtualização na **página** de gestão | ❌ não implementado | a página renderiza todos os `visibleProducts` (`ExternalProductManagement.tsx:1003-1023`); o plano aceitava 24–48 cards sem virtualizar (`PLANO_IMPLEMENTACAO_CATALOGO_100.md:944`) |
| Seleção em massa → barra flutuante (enviar / favoritar / exportar CSV) | ✅ | `ExternalProductManagement.tsx:1057-1068` (`CatalogBulkBar`); `ExternalProductCatalog.tsx:679-691` |

### Diferenças deliberadas

- **Duas apresentações da mesma tela** — a página (`ExternalProductManagement`) mantém as 3
  abas e o rail; o Sheet do chat (`ExternalProductCatalog`) troca as abas por um chip "Meus
  favoritos" e não tem rail (cabe na largura do diálogo). Card e filtros são compartilhados.
- **"Gerenciar no PromoGifts" é link externo** (`target="_blank" rel="noopener noreferrer"`) —
  o ZAPP não tem CRUD de produto (somente-leitura).
- **"Novo Produto" do mock omitido** — mesma razão do link acima: a criação é do PromoGifts.
- **"Mais pedidos" oculto no "Ordenar por"** — `order_count` é 0 em 100% dos produtos (29/09),
  então a opção seria um botão morto (CT-22).

---

## Tela B — Detalhes do produto (`ProductDetailDialog.tsx`)

Print: [`screens/B-detalhes.jpg`](./screens/B-detalhes.jpg)

Implementado como **painel lateral (`Sheet`)**, não modal de 2 colunas — decisão do
dono do produto (24/09), registrada no cabeçalho do arquivo. Mesmo contrato de props
para não quebrar os callers.

| Item do mock | Status | Arquivo / evidência |
|---|---|---|
| Detalhe do produto como painel lateral | ✅ | `ProductDetailDialog.tsx:312-314` (`Sheet`/`SheetContent`, `sm:max-w-xl`) |
| Galeria de imagens no topo | ✅ | `ProductDetailDialog.tsx:76-220` (`ImageGallery`) |
| Contador "N / M" + miniaturas | ✅ | `ProductDetailDialog.tsx:158-162`, `:193-209` |
| Navegação por teclado (← →) e swipe | ✅ | `ProductDetailDialog.tsx:101-135` |
| Zoom da imagem (dialog) | ✅ | `ProductDetailDialog.tsx:211-217` |
| Nome + favorito + navegação ‹ › entre produtos do resultado | ✅ | `ProductDetailDialog.tsx:321-358` (CT-36) |
| Badges Novo / Top / Destaque / Marca / Kit / Personalizável | ✅ | `ProductDetailDialog.tsx:361-368` |
| Pills de categoria (caminho completo) e tags | ✅ | `ProductDetailDialog.tsx:373-388` (CT-35, `full_path_readable`) |
| Preço + sugerido riscado | ✅ | `ProductDetailDialog.tsx:392-403` |
| SKU + copiar | ✅ | `ProductDetailDialog.tsx:405-422` |
| Qtd. mínima / Prazo / Origem (grade 3 colunas) | ✅ | `ProductDetailDialog.tsx:424-431` (CT-31, `MetaTile`) |
| Descrição | ✅ | `ProductDetailDialog.tsx:436-442` (CT-32, `SectionCard`, fallback `short_description`) |
| Ficha técnica (dimensões, peso, capacidade, material, gravação, NCM, embalagem) | ✅ | `ProductDetailDialog.tsx:444-498` (CT-32) |
| Cores com estoque somado por variante + scroll para a imagem da cor | ✅ | `ProductDetailDialog.tsx:257-283`, `:500-529` (CT-33, `ColorSwatch`) |
| Variantes agrupadas por cor + CTA "Enviar variação (<cor>)" | ✅ | `ProductDetailDialog.tsx:531-591`, `:604-612` (CT-34) |
| Fornecedor no rodapé + botão "Enviar produto no chat" | ✅ | `ProductDetailDialog.tsx:595-615` |
| "Adicionar fotos" das variantes e "Baixar" (zip) no detalhe | ⏳ CT-39 | não implementado — pendente no plano |
| Badge "Novo/Kit" com cor por token (`--badge-new`) | ✅ | `ProductDetailDialog.tsx:366` — `bg-[hsl(var(--badge-new))]` (CT-40) |

### Diferenças deliberadas

- **`Sheet` lateral em vez de modal de 2 colunas** — decisão do dono do produto (24/09);
  reaproveita o painel existente em vez de reconstruir o layout do mock.
- **"SUA MARCA AQUI"** do mock removido — placeholder do mock, não vai para produção.
- **Badges de destaque** são sólidas (`bg-emerald-500`/`bg-orange-500`/`--badge-new`),
  não as `.catalog-badge--*` translúcidas do card — o detalhe pede maior peso visual.

---

## Tela C — Enviar produto (`SendProductDialog.tsx`)

Print: [`screens/C-enviar-produto.jpg`](./screens/C-enviar-produto.jpg)

| Item do mock | Status | Arquivo / evidência |
|---|---|---|
| Prévia estilo WhatsApp (`PhonePreview`) | ✅ | `SendProductDialog.tsx:491`; `catalogShared.tsx` `PhonePreview` + `.catalog-phone` (CT-37) |
| Cores da marca WhatsApp por token (`--wa-*`) | ✅ | `tokens.css:183-192`; zero hex literal no componente (CT-37) |
| Modos: produto completo / variação específica | ✅ | `SendProductDialog.tsx` (`sendMode`), `sendProductUtils.ts` |
| Cards de variação com foto/cor/estoque | ✅ | `SendProductDialog.tsx` (modo variação) |
| Card de info do produto no modo completo | ✅ | `SendProductDialog.tsx:386-408` (`data-testid="product-info-card"`, CT-38) |
| Templates de mensagem (Formal / Informal / Promoção) + personalizada | ✅ | `SendProductDialog.tsx:54-58`, `sendProductUtils.buildMessage` |
| Seleção de fotos (até 10) | ✅ | `SendProductDialog.tsx:61` (`MAX_IMAGES`), `sendProductUtils.collectAllImages` |
| Rascunho por produto (sessionStorage, debounce) | ✅ | `SendProductDialog.tsx:62-80` (E77) |
| Checagem pré-envio (conexão WhatsApp / supressão) | ✅ | `useCatalogSendReadiness` (CT-08) |
| Progresso real "Enviando N/M…" | ✅ | `SendProductDialog.tsx:566-571` (CT-46) |
| "Adicionar fotos" das variantes + "Baixar" (zip) | ⏳ CT-39 | pendente — o botão "Baixar" do mock ainda não tem zip |

### Diferenças deliberadas

- **Preview WhatsApp local → `PhonePreview` compartilhado** — o mock tinha as cores
  `#075E54/#e5ddd5/#dcf8c6` na mão; viraram tokens `--wa-header/--wa-background/--wa-bubble`
  e a moldura subiu para `catalogShared.tsx` (CT-37).
- **Personalização `{{nome}}`/`{{empresa}}`** reusa o `personalizePreview`/`extractVariables`
  do Talk X (CT-45) — pendente de exibição no preview deste passo.

---

## Tela D — Selecionar contato (`ContactSelectionStep.tsx`)

Print: [`screens/D-selecionar-contato.jpg`](./screens/D-selecionar-contato.jpg)

| Item do mock | Status | Arquivo / evidência |
|---|---|---|
| 2 colunas `md:grid-cols-[1fr_300px]` | ✅ | `ContactSelectionStep.tsx` (CT-41) |
| Header `IconTile Users` | ✅ | `ContactSelectionStep.tsx:7` (`IconTile` de `talkxShared`) (CT-41) |
| Card-resumo do produto (thumb 96, nome, modelo, "N foto(s)") | ✅ | `ContactSelectionStep.tsx` (CT-41) |
| Lista com avatar (iniciais/`avatar_url`), telefone pt-BR e radio ARIA | ✅ | `ContactSelectionStep.tsx:44-70` (`formatPhoneBR`, `role="radio"`) (CT-42) |
| Seção "Enviados recentemente" (`catalog_send_events`) | ✅ | `ContactSelectionStep.tsx:12,17` (`useCatalogRecentSends`, `RECENT_SENDS_LIMIT = 5`) (CT-42) |
| Busca por nome/telefone (dígitos, mínimo 2, debounce 300 ms) | ✅ | `useCatalogContactSearch` (`CONTACT_SEARCH_MIN_CHARS`) (CT-43) |
| Estado vazio com link "Criar contato" | ✅ | `ContactSelectionStep.tsx:10` (`navigateToView('?view=contacts')`) (CT-43) |
| Botão "Enviar agora" com progresso "Enviando 2/4…" | ✅ | `ContactSelectionStep.tsx:144-146` (CT-46) |
| Rail "Resumo do envio" + `AlertCard` "Pronto para enviar!" | ⏳ CT-44 | pendente |
| Personalização `{{nome}}`/`{{empresa}}` no preview | ⏳ CT-45 | pendente |
| Envio multi-produto (bulk) passa pelo mesmo passo | ⏳ CT-47 | pendente |

### Diferenças deliberadas

- **Deep link de "Criar contato"**: o mock/plano sugeria `?view=contacts&new=1`; o
  `ViewRouter` só interpreta `?view=`, então o link usa `?view=contacts` (sem `new`),
  com a razão comentada no código (CT-43).
- **Radio ARIA** sobre o botão da linha em vez de `RadioGroupItem` do shadcn — o wrapper
  fixa o `Indicator` como filho único e descarta conteúdo do chamador (CT-42).

---

## Itens do mock não implementados (motivo)

| Item | Tela | Motivo |
|---|---|---|
| Modal de 2 colunas | B | substituído pelo `Sheet` lateral (decisão de 24/09) |
| Layout 2 colunas (envio) | C | decisão do dono (24/09); o `SendProductDialog` é `Dialog` de 1 coluna (`SendProductDialog.tsx:354`, `max-w-lg`) |
| "SUA MARCA AQUI" | B | placeholder do mock |
| "Novo Produto" | A | produto é somente-leitura no ZAPP — CRUD é do PromoGifts |
| Importar planilha (se sem URL) | A/B | produto é somente-leitura no ZAPP (sync via PromoGifts) |
| "Sincronizar" manual | A | sincronização é da edge `promogifts-catalog`, sem gatilho de UI |
| Rail → `Accordion` acima da grade `<1280px` | A | E58 não construído; o rail hoje é `hidden xl:block` (`ExternalProductManagement.tsx:1094`) |
| "Adicionar fotos" / "Baixar" (zip) | B/C | pendente — CT-39 |
| Rail "Resumo do envio" | D | pendente — CT-44 |

---

## Nota de tokens (CT-40)

O módulo não usa cor literal: `text-white` → `text-primary-foreground` e
`bg-violet-500` → `bg-[hsl(var(--badge-new))]`, com `--badge-new` criado em
`tokens.css:194-201` (mesma família de matiz da `.catalog-badge--new` de
`components.css`). Contrato travado por
`__tests__/CT40_badgeTokens.test.tsx` (varre os `.tsx` de produção do módulo).
`components.css` ainda repete o hex `268 83% 63%` em `.catalog-badge--new` — fora do
escopo do módulo (não é `src/components/catalog/**`); consumir o token ali é
follow-up.

---

## Textos revisados (CT-85)

Revisão de **acentuação, grafia e rótulos** do fluxo de envio (Detalhes / Enviar /
Contato). Conclusão honesta: **nenhuma correção foi necessária** — os textos já
estavam corretos no código antes desta etapa. A coluna "resultado" distingue
`verificado e correto` de `corrigido` (havia erro e foi ajustado); aqui **todos são
"verificado"**, nenhum "corrigido".

| Texto | Arquivo:linha | Onde aparece | Resultado |
|---|---|---|---|
| `Qtd. mínima` | `ProductDetailDialog.tsx:435` | rótulo do `MetaTile` (grade Qtd./Prazo/Origem) | ✅ verificado e correto — "mínima" acentuado |
| `N dias úteis` | `ProductDetailDialog.tsx:436` | valor do `MetaTile` "Prazo" (`` `${dp.lead_time_days} dias úteis` ``) | ✅ verificado e correto — "úteis" acentuado |
| `Origem` | `ProductDetailDialog.tsx:437` | rótulo do `MetaTile` | ✅ verificado e correto |
| `Qtd. mínima` | `catalogExport.ts:42` | coluna do CSV (`CATALOG_EXPORT_COLUMNS`) | ✅ verificado e correto |
| `Prazo` | `catalogExport.ts:41` | coluna do CSV (`CATALOG_EXPORT_COLUMNS`) | ✅ verificado e correto |
| `Prazo de entrega: N dias úteis` | `sendProductUtils.ts:94` | trecho montado do template de mensagem | ✅ verificado e correto |

**Varredura de acentuação.** Buscando as formas sem acento por todo o módulo
(`dias uteis`, `Qtd. minima`, `minima`/`maxima`/`descricao`/`numero`/`endereco`/
`historico`/`proprio`/etc.), **as únicas ocorrências ficam em comentários de
código de produção** (ex.: `ExternalProductCatalog.tsx:155`, `SendProductDialog.tsx:208`,
`catalogCategoryRoute.ts:4-5`) — **nenhuma em texto exibido ao usuário**. Ou seja: não
havia erro de acentuação a corrigir nos rótulos/valores desta revisão.

**Escopo desta lista.** A Tela A (catálogo) e as seções Topo/Grade/Rail agora estão
documentadas na seção **Tela A** (acrescentada na CT-89); esta revisão de textos, porém,
cobre só os textos do fluxo de envio citados no aceite (Detalhes/Enviar/Contato), sem
afirmar revisão dos textos da Tela A.
