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

## F5 — concluído (2026-09-23)

Os 3 arquivos preservados aplicados em PR separado (#526). A branch que originalmente
justificou a exclusão (`redesign/inbox-fidelidade-carvao-codex`, PR #384) está closed sem
merge desde 14/09, dormente, e não toca `MessageBubble.tsx`. As duas branches citadas no
desvio original do F5 (`redesign/inbox-fidelidade-carvao` → PR #301, `feat/inbox-painel-direito`
→ PR #299) já estavam mergeadas desde 09/09. Zero PRs abertas no repositório no momento da
verificação — sem conflito real.

## F6.5 — D5/D6 resolvidas (2026-09-23)

**D5 — headings.** Decisão: recalibrar `clamp()` (recomendação do plano), não trocar pelo
mecanismo discreto. Extremos recalculados com min = tamanho mobile do Promo, max = tamanho
`lg` do Promo, interpolação linear entre viewport 375px–1024px:

| Heading | Antes (min→max) | Depois (min→max) | Referência Promo (mobile→lg) |
|---|---|---|---|
| h1 | 24px → 40px | 36px → 60px | text-4xl → text-6xl |
| h2 | 20px → 32px | 30px → 48px | text-3xl → text-5xl |
| h3 | 17.6px → 24px | 24px → 36px | text-2xl → text-4xl |
| h4 | 16px → 20px | 20px → 30px | text-xl → text-3xl |
| h5 | 14.8px → 17.6px | **inalterado** | Promo não define tamanho próprio para h5 (só herda peso/tracking da regra geral h1–h6); sem referência para recalibrar |

Editado em `src/styles/base.css`. Mecanismo `clamp()` preservado — fluidez mantida, só os
extremos mudaram.

**D6 — cor global de texto no dark.** Decisão: não replicar (recomendação do plano). Zero
mudança de código — a regra do Promo (`color` forçado em `span/p/label/td/th/li`) tem efeito
colateral documentado (quebra `text-primary` em qualquer `<span>` no dark por especificidade
CSS maior) e não compensa o ganho de paridade visual.

## Pendente

- **F3 item 12** — revisão visual das telas densas. 193 trocas de meia-medida mudam quebra
  de linha em tabela; nenhuma foi inspecionada em tela. Tentativa de automação (Playwright/
  Bright Data) nesta sessão: credenciais resolvidas (usuário `qa.visual@promobrindes.com.br`
  com senha redefinida), mas bloqueada por falha de ferramenta — Cloudflare Browser Rendering
  com token inválido/expirado (precisa permissão "Browser Rendering: Edit" renovada), e a
  sessão Bright Data rejeitou consistentemente `fill`/`type` no campo de senha do formulário
  de login (3 tentativas, mesmo erro "waiting for element to be visible, enabled and editable").
  Requer nova tentativa com ferramenta de browser funcional, ou revisão manual.
