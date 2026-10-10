# E62 — Contraste do combobox de endereços (SuggestionList)

Contraste WCAG dos pares de cor da **lista de sugestões do combobox de endereços** nos temas do
produto. Fecha o checklist do E62 (`docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md`):
**3 temas medidos** e **números no doc**.

## O que foi medido

A lista (`src/components/inbox/location-picker/SuggestionList.tsx`) é um `bg-popover`. O texto
secundário é `text-muted-foreground`. O trecho casado da busca é um `<mark>` renderizado por
`src/components/inbox/chat/HighlightedText.tsx:109` com
`bg-[hsl(var(--warning)/0.35)] dark:bg-[hsl(var(--warning)/0.25)]` e `text-inherit` — na linha do
**nome** o texto herda `--foreground`; na linha do **endereço** herda `--muted-foreground`. O
`<mark>` é composto sobre o `--popover` (com o alfa do tema).

Fontes de verdade dos tokens: `src/styles/tokens.css` (`:root` claro / `.dark` escuro) e
`src/styles/accessibility.css` (`.high-contrast` e `.dark.high-contrast`). O tema claro também é
escrito **inline** por `src/components/settings/theme/presets.ts` — por isso a mudança de token foi
espelhada nos dois arquivos.

## Comando que gerou os números

```bash
node scripts/qa/contraste-combobox.mjs          # tabela
node scripts/qa/contraste-combobox.mjs --check  # exit 1 se algum par < 4,5:1
```

Reusa o medidor WCAG (`hslToRgb`/`contrast`) de `scripts/qa/contraste-contatos.mjs`.

## Antes

| Tema | Par | Contraste | AA (≥ 4,5:1) |
|---|---|---|---|
| claro | texto secundário (`muted-foreground`) sobre popover | 5,08:1 | ok |
| claro | `<mark>` nome (`foreground`) sobre popover | 13,00:1 | ok |
| claro | `<mark>` endereço (`muted-foreground`) sobre popover | **3,89:1** | **FALHA** |
| escuro | texto secundário sobre popover | 9,32:1 | ok |
| escuro | `<mark>` nome sobre popover | 9,55:1 | ok |
| escuro | `<mark>` endereço sobre popover | 5,27:1 | ok |
| alto contraste | texto secundário sobre popover | 12,63:1 | ok |
| alto contraste | `<mark>` nome sobre popover | 16,07:1 | ok |
| alto contraste | `<mark>` endereço sobre popover | 9,67:1 | ok |

## Depois

| Tema | Par | Contraste | AA (≥ 4,5:1) |
|---|---|---|---|
| claro | texto secundário (`muted-foreground`) sobre popover | 6,10:1 | ok |
| claro | `<mark>` nome (`foreground`) sobre popover | 13,00:1 | ok |
| claro | `<mark>` endereço (`muted-foreground`) sobre popover | **4,67:1** | ok |
| escuro | texto secundário sobre popover | 9,32:1 | ok |
| escuro | `<mark>` nome sobre popover | 9,55:1 | ok |
| escuro | `<mark>` endereço sobre popover | 5,27:1 | ok |
| alto contraste | texto secundário sobre popover | 12,63:1 | ok |
| alto contraste | `<mark>` nome sobre popover | 16,07:1 | ok |
| alto contraste | `<mark>` endereço sobre popover | 9,67:1 | ok |

## Correção aplicada (só token, sem tocar no componente)

Único par abaixo de 4,5:1 era o `<mark>` da linha do endereço **no tema claro**: texto
`--muted-foreground` (L45) sobre o destaque âmbar. Ajuste mínimo de luminosidade, mesma matiz e
saturação (família preservada):

| Token | Tema | Antes | Depois | Onde |
|---|---|---|---|---|
| `--muted-foreground` | claro | `221 10% 45%` | `221 10% 40%` | `src/styles/tokens.css:137` e `src/components/settings/theme/presets.ts:213` |

L40 é o menor passo inteiro que passa: em **L41** o par fica em **4,495:1** (abaixo do limiar).
Escuro e alto contraste já fechavam e **não** foram alterados.

Além dos 3 temas da etapa, o script também mede **alto contraste escuro**
(`.dark.high-contrast`, que o toggle do produto combina com `.dark`): menor razão **7,11:1**, ok.

## Trava no CI

`tests/contracts/contraste-aa-componentes.contract.test.ts` — um caso por tema
(`claro`, `escuro`, `alto contraste`, `alto contraste escuro`) medindo texto secundário e `<mark>`
sobre o popover, mais um caso que confirma que o componente ainda casa com os pares medidos
(`bg-popover` + `<mark>` `--warning` com alfa). Mutação prova a trava: voltar o token claro para
`L45` faz o caso `claro` cair para 3,87:1.
