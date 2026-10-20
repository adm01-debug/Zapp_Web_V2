# Contraste dos badges do catálogo — CT-69

Medição WCAG 2.1 do par **fundo efetivo × texto efetivo** de cada badge do módulo de
catálogo nos 3 temas do design system **e** na combinação `escuro + alto contraste`
(os tokens dela divergem dos outros três).

## Método (o que foi medido e como)

- **Fórmula:** `ratio = (L1 + 0,05) / (L2 + 0,05)`, com `L` = luminância relativa
  WCAG (canais sRGB linearizados: `c/12,92` abaixo de 0,03928, senão
  `((c+0,055)/1,055)^2,4`; pesos 0,2126 / 0,7152 / 0,0722).
- **Critério:** **4,5:1** para texto normal. Todos os badges do módulo usam
  `text-[9px] font-bold` ou `text-3xs` → **texto pequeno**; a exceção de 3:1 para
  "texto grande" exigiria ≥ 18,66 px em negrito.
- **Alpha:** quando a classe tem opacidade, o fundo é o **composto**
  `fg·α + bg·(1−α)` sobre o elemento de trás (informado em cada linha).
- **`--contrast-multiplier: 1`** (`src/styles/accessibility.css:53`) → o
  `filter: contrast()` do `.high-contrast` **não** altera nenhum número abaixo;
  a medição é do par de cores, não do filtro.

### Fonte de cada valor (nada foi estimado de memória)

| O que | De onde veio |
|---|---|
| `--background`, `--foreground`, `--card`, `--muted`, `--border`, `--primary-foreground` do tema claro | `src/styles/tokens.css` `:root` (L105–143), em `hsl(H S% L%)`, convertidos para sRGB |
| idem, tema escuro | `src/styles/tokens.css` `.dark` (L371–422) |
| idem, alto contraste (claro) | `src/styles/accessibility.css` `.high-contrast` (L4–25) |
| idem, escuro + alto contraste | `src/styles/accessibility.css` `.dark.high-contrast` (L27–48) |
| Cores **hardcoded** dos badges (`emerald-500`, `orange-500`, `rose-500`, `amber-*`) | valores **reais emitidos no build**, lidos de `dist/assets/index-*.css` (ex.: `.bg-emerald-500{background-color:rgb(16 185 129/…)}`) — Tailwind resolve a paleta para `rgb()` literal; não usei a tabela da doc do Tailwind |
| Composição com alpha | calculada na planilha da medição (`fg·α + bg·(1−α)`) |

**Por que a distinção importa:** os badges de destaque (Novo/Top/Promo) **não** usam
token no fundo — usam a paleta crua do Tailwind (`bg-emerald-500` etc.) no componente.
Medir só os tokens daria o **mesmo par nos 3 temas** e mascararia a falha real (o fundo
não muda com o tema; só o texto muda).

## Onde cada badge é pintado

| Badge | arquivo:linha | classes que definem o par |
|---|---|---|
| "Novo" (card) | `CatalogProductCard.tsx:79` | `bg-emerald-500 text-primary-foreground` |
| "Top" (card) | `CatalogProductCard.tsx:84` | `bg-orange-500 text-primary-foreground` |
| "Promo" (card) | `CatalogProductCard.tsx:89` | `bg-rose-500 text-primary-foreground` |
| Categoria (card) | `CatalogProductCard.tsx:94` | `bg-background/80 text-foreground/70 border-border/40` |
| Estoque baixo (card) | `CatalogProductCard.tsx:136` | `text-amber-600 bg-amber-50 dark:bg-amber-950/30` |
| "Novo" (painel de detalhe) | `ProductDetailDialog.tsx:370` | `bg-emerald-500 text-primary-foreground` |
| "Top" (painel de detalhe) | `ProductDetailDialog.tsx:371` | `bg-orange-500 text-primary-foreground` |
| Previsão de entrada | `ProductDetailDialog.tsx:580` | `text-amber-600 dark:text-amber-500` |
| Status do rail / envio em massa | `CatalogBulkBar.tsx:85` | `text-amber-600 dark:text-amber-500` |

## Valores efetivos por tema

| Token | claro (`:root`) | escuro (`.dark`) | alto contraste | escuro + alto contraste |
|---|---|---|---|---|
| `--background` | `hsl(221 20% 97%)` | `hsl(240 6% 6%)` | `hsl(0 0% 100%)` | `hsl(0 0% 0%)` |
| `--foreground` | `hsl(221 20% 12%)` | `hsl(210 40% 98%)` | `hsl(0 0% 0%)` | `hsl(0 0% 100%)` |
| `--card` | `hsl(0 0% 100%)` | `hsl(240 5% 10%)` | `hsl(0 0% 100%)` | `hsl(0 0% 5%)` |
| `--primary-foreground` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | **`hsl(0 0% 0%)`** |
| Cores dos badges (hardcoded) | `emerald-500 #10b981` · `orange-500 #f97316` · `rose-500 #f43f5e` · `amber-600 #d97706` · `amber-500 #f59e0b` · `amber-50 #fffbeb` · `amber-950/30 #451a03 @ 30,2%` | | | |

> O `--primary-foreground` só sai do branco em **escuro + alto contraste**; é
> exatamente por isso que os badges de destaque passam lá e falham nos outros três
> (ver abaixo) — e é a prova de que o fundo hardcoded não acompanha o tema.

## Resultado medido

| Tema | Badge (par medido) | Fundo | Texto | Ratio | 4,5:1 |
|---|---|---|---|---|---|
| claro | Novo — `bg-emerald-500` × `text-primary-foreground` | `#10b981` | `#ffffff` | **2,54** | ❌ FALHA |
| claro | Top — `bg-orange-500` × `text-primary-foreground` | `#f97316` | `#ffffff` | **2,80** | ❌ FALHA |
| claro | Promo — `bg-rose-500` × `text-primary-foreground` | `#f43f5e` | `#ffffff` | **3,67** | ❌ FALHA |
| claro | Categoria — `bg-background/80` (0,8 sobre `--card`) × `text-foreground/70` | `#f8f8fa` | `#5b5e65` | 6,10 | ✅ |
| claro | Estoque baixo — `text-amber-600` sobre `bg-amber-50` | `#fffbeb` | `#d97706` | **3,07** | ❌ FALHA |
| claro | Previsão de entrada — `text-amber-600` sobre `--card` | `#ffffff` | `#d97706` | **3,19** | ❌ FALHA |
| escuro | Novo — `bg-emerald-500` × `text-primary-foreground` | `#10b981` | `#ffffff` | **2,54** | ❌ FALHA |
| escuro | Top — `bg-orange-500` × `text-primary-foreground` | `#f97316` | `#ffffff` | **2,80** | ❌ FALHA |
| escuro | Promo — `bg-rose-500` × `text-primary-foreground` | `#f43f5e` | `#ffffff` | **3,67** | ❌ FALHA |
| escuro | Categoria — `bg-background/80` (0,8 sobre `--card`) × `text-foreground/70` | `#101012` | `#b2b4b6` | 9,11 | ✅ |
| escuro | Estoque baixo — `text-amber-600` sobre `bg-amber-950/30` (30,2% sobre `--card`) | `#261914` | `#d97706` | 5,37 | ✅ |
| escuro | Previsão de entrada — `dark:text-amber-500` sobre `--card` | `#18181b` | `#f59e0b` | 8,23 | ✅ |
| alto contraste | Novo — `bg-emerald-500` × `text-primary-foreground` | `#10b981` | `#ffffff` | **2,54** | ❌ FALHA |
| alto contraste | Top — `bg-orange-500` × `text-primary-foreground` | `#f97316` | `#ffffff` | **2,80** | ❌ FALHA |
| alto contraste | Promo — `bg-rose-500` × `text-primary-foreground` | `#f43f5e` | `#ffffff` | **3,67** | ❌ FALHA |
| alto contraste | Categoria — `bg-background/80` (0,8 sobre `--card`) × `text-foreground/70` | `#ffffff` | `#4d4d4d` | 8,52 | ✅ |
| alto contraste | Estoque baixo — `text-amber-600` sobre `bg-amber-50` | `#fffbeb` | `#d97706` | **3,07** | ❌ FALHA |
| alto contraste | Previsão de entrada — `text-amber-600` sobre `--card` | `#ffffff` | `#d97706` | **3,19** | ❌ FALHA |
| escuro + alto contraste | Novo — `bg-emerald-500` × `text-primary-foreground` | `#10b981` | `#000000` | 8,28 | ✅ |
| escuro + alto contraste | Top — `bg-orange-500` × `text-primary-foreground` | `#f97316` | `#000000` | 7,49 | ✅ |
| escuro + alto contraste | Promo — `bg-rose-500` × `text-primary-foreground` | `#f43f5e` | `#000000` | 5,72 | ✅ |
| escuro + alto contraste | Categoria — `bg-background/80` (0,8 sobre `--card`) × `text-foreground/70` | `#030303` | `#b3b3b3` | 9,89 | ✅ |
| escuro + alto contraste | Estoque baixo — `text-amber-600` sobre `bg-amber-950/30` (30,2% sobre `--card`) | `#1e110a` | `#d97706` | 5,80 | ✅ |
| escuro + alto contraste | Previsão de entrada — `dark:text-amber-500` sobre `--card` | `#0d0d0d` | `#f59e0b` | 9,06 | ✅ |

**13 dos 24 pares medidos NÃO atingem 4,5:1.**

## Achados (registrados, NÃO corrigidos)

A cor de um badge é **decisão de produto/design** — nenhuma cor foi alterada por esta
medição. O que falha, com o número:

1. **Badges de destaque (Novo/Top/Promo) em 3 dos 4 temas — 2,54 / 2,80 / 3,67.**
   Causa: o fundo é a paleta crua do Tailwind (`emerald-500`/`orange-500`/`rose-500`,
   `CatalogProductCard.tsx:79,84,89` e `ProductDetailDialog.tsx:370,371`) enquanto o
   texto é o token `--primary-foreground`, que é **branco em 3 dos 4 temas**. O par
   não reage ao tema — só o tema "escuro + alto contraste" (onde
   `--primary-foreground` vira **preto**) passa. Além de falhar o 4,5:1, os 3 pares
   também ficam **abaixo de 3:1**, o limiar de componente de UI/objeto gráfico
   (WCAG 1.4.11).
2. **Estoque baixo (pill) no claro e no alto contraste — 3,07.** `text-amber-600`
   (`#d97706`) sobre `bg-amber-50` (`#fffbeb`) tem a mesma cor nos dois temas; só no
   escuro passa (5,37), porque lá o fundo é `amber-950/30` composto sobre o card.
3. **Previsão de entrada no claro e no alto contraste — 3,19.** `text-amber-600`
   sobre `--card` branco.
4. **O que passa:** o badge de Categoria (6,10 / 9,11 / 8,52 / 9,89) — porque é o
   único que usa **tokens** (`--background`/`--foreground`) e portanto acompanha o
   tema — e a Previsão/Estoque no escuro e no escuro+alto contraste.

## Limitações desta medição (não escondidas)

- O badge de **Categoria** fica sobre a **foto** do produto (`bg-background/80` +
  `backdrop-blur-sm`, `CatalogProductCard.tsx:94`), não sobre o card. Medi contra
  `--card` (o fundo previsível) porque a foto é dado do usuário: sobre uma foto clara
  o `text-foreground/70` do tema escuro perde contraste, e isso **não** está medido —
  exigiria screenshot real no browser.
- Medição é aritmética sobre os valores **declarados** (tokens + CSS emitido no
  build), não sobre pixel renderizado. Não cobre `opacity`/`filter` de elementos
  pais nem antialiasing.
- Só o módulo de catálogo; outros módulos com a mesma paleta não foram auditados.

## Reproduzir

`node scripts/ci/bundle-budget.mjs` não cobre isso; a medição foi feita por script
(conversão `hsl()→sRGB`, composição de alpha e fórmula WCAG) sobre os valores citados
acima. Ao mudar qualquer cor de badge, esta tabela precisa ser refeita.
