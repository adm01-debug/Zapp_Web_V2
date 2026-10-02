# PARIDADE.md — Catálogo / Promo Gifts

Paridade entre o mock de referência e o que está implementado no módulo
`?view=catalog` (`src/components/catalog/`). Cada tela tem o print em
`docs/catalogo/screens/` como fonte visual e a evidência no código (arquivo:linha)
como fonte de verdade. O catálogo é **somente-leitura** no ZAPP: criação e edição de
produtos são do PromoGifts.

Criado em 2026-10-01

> **Escopo.** Este arquivo cobre as três telas do fluxo de envio (Detalhes, Enviar,
> Contato). As telas de lista (A-catálogo) e as seções Topo/Grade/Rail entram pelas
> etapas CT-66/CT-89. "Diferença deliberada" = divergência assumida do mock, com o
> motivo — não é item pendente.

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
| "SUA MARCA AQUI" | B | placeholder do mock |
| Importar planilha (se sem URL) | A/B | produto é somente-leitura no ZAPP (sync via PromoGifts) |
| "Sincronizar" manual | A | sincronização é da edge `promogifts-catalog`, sem gatilho de UI |
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

**Escopo desta lista.** As telas A (catálogo) e as seções Topo/Grade/Rail entram
pelas etapas CT-66/CT-89; aqui a revisão cobre os textos do fluxo de envio citados
no aceite (Detalhes/Enviar/Contato), sem afirmar revisão de telas não lidas.
