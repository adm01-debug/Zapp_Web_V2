# Relatório — paridade tipográfica ZAPP Web V2 ↔ Promo Gifts V4 (F0–F7)

Execução de 22/09/2026 sobre `origin/main` (`7761a570`).
Plano de origem: `PLANO_PARIDADE_TIPOGRAFICA_ZAPP_PROMO.md`.

## Resultado

| Violação | Antes | Depois | Restante é |
|---|---|---|---|
| Meia-medida (`text-[N.5px]`) | 194 | **1** | arquivo de branch ativa |
| Arbitrário acima de 16px | 51 | **2** | branch ativa + `text-[120px]` |
| Arbitrário com equivalente exato | 836 | **3** | 3 arquivos de branch ativa |

**471 substituições** aplicadas (F2 251 · F3 193 · F4 27), mais o `tailwind.config.ts`
e o guard-rail de CI.

## Correção ao plano: o DoD do F2 estava incompleto

O plano trata o F2 como "troca equivalente" e define o DoD como *"baseline sem mudança de
tamanho renderizado"*. Isso só é verdade para `font-size`.

`text-[12px]` é valor arbitrário: define **apenas** `font-size` e herda o `line-height`
(preflight do Tailwind, 1.5 → 18px). `text-xs` na escala define **os dois** (12px/16px).
A troca portanto muda o `line-height` de 18px para 16px em 182 pontos — e o DoD original,
que só media tamanho, deixaria isso passar.

Essa mudança **é a paridade pretendida**, não efeito colateral: o Promo não customiza
`fontSize` e usa o default do Tailwind, onde `text-xs` é exatamente 12px/16px. Mas precisa
estar declarada, e o medidor do F0 passou a registrar `line-height` por isso.

## F0 — medidor

`scripts/qa/medir-tipografia.cjs`. Análise estática: resolve `font-size` e `line-height`
de cada uso cruzando com a escala do `tailwind.config.ts`.

Desvio do plano: o F0 pedia medição do DOM em produção logado. Não há credenciais
disponíveis nesta execução. O medidor estático é determinístico, versionável e serve
também de guard-rail no F6 — mas **não** substitui a verificação visual das telas densas
que o F3 pede (item 12 do plano), que continua pendente.

## F1 — escala

`2xs` removido (0 usos nomeados; não existe no Promo). `xl` de 30px para 28px de
line-height. `5xl`–`9xl` para razão `1`. A escala resultante é idêntica ao default do
Tailwind:

```
xs 12/16 · sm 14/20 · base 16/24 · lg 18/28 · xl 20/28
2xl 24/32 · 3xl 30/36 · 4xl 36/40 · 5xl 48/48 · 6xl 60/60
```

Remover `2xs` também corrige a contagem: os 581 usos de `text-[10px]` deixam de contar como
"tem equivalente exato" (836 → 255), o que bate com os 254 do D2 mais o `30px` do F4.

## F3 — arredondamento aplicado

`12.5→text-xs` · `13.5→text-sm` · `11.5→text-[11px]` · `10.5→text-[10px]` ·
`9.5→text-[9px]` · `7.5→text-[8px]`

Abaixo de 12px o arbitrário permanece arbitrário, seguindo §2.2 do plano — é a faixa de
badge e rótulo, e o Promo faz o mesmo.

## F4 — mapeamento

`17→lg` · `19→xl` · `22→2xl` · `26/28/30→3xl` · `32/34/38→4xl` · `42→5xl`

`text-[120px]` preservado: número gigante de estado vazio, caso justificado no próprio plano.

## Desvio deliberado do F5

O plano manda excluir talkx (13 arquivos) e inbox em bloco. Medida a superfície real de
conflito contra as branches ativas, ela é de **3 arquivos**, não 16:

- `src/components/inbox/chat/ChatInputArea.tsx` → `redesign/inbox-fidelidade-carvao`
- `src/components/inbox/chat/MessageBubble.tsx` → `redesign/inbox-fidelidade-carvao`
- `src/components/inbox/contact-details/ContactHeaderSection.tsx` → `feat/inbox-painel-direito`

A única branch TalkX viva (`claude/chore-e100-changelog-talkx`) não toca nenhum arquivo
`src/` — é changelog. O gate do F5 sobre TalkX foi escrito quando havia redesign ativo.
TalkX entrou; os 3 arquivos acima ficaram de fora e mantêm seus arbitrários.

## F6 — guard-rail

`node scripts/qa/medir-tipografia.cjs --check`, plugado no `ci.yml` junto dos demais
ratchets. Teto congelado em `scripts/qa/tipografia-budget.json` (1 / 2 / 3), só pode cair.
DoD verificado: com violação proposital o guard sai com código 1; revertida, com 0.

## Pendente

- **F3 item 12** — revisão visual das telas densas. 193 trocas de meia-medida mudam quebra
  de linha em tabela; nenhuma foi inspecionada em tela.
- **F5** — os 3 arquivos preservados, quando as branches de inbox fecharem.
- **F6.5 (D5/D6)** — headings com `clamp()` e cor global de texto no dark seguem pendentes
  de decisão, conforme §4 do plano.
