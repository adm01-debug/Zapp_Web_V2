# Relatório — paridade tipográfica ZAPP Web V2 ↔ Promo Gifts V4 (F0–F7)

Execução de 22/09/2026 sobre `origin/main` (`7761a570`). F5 e F6.5 concluídos em
23/09/2026 (PR #526). Guard-rail corrigido (regex `rem`/`em`) em 23/09/2026, ver seção
própria abaixo.
Plano de origem: `PLANO_PARIDADE_TIPOGRAFICA_ZAPP_PROMO.md`.

## Resultado

| Violação | Antes | Depois | Restante é |
|---|---|---|---|
| Meia-medida (`text-[N.5px]`) | 194 | **1** | `text-[0.8rem]` do `calendar.tsx` — invisível até o fix de regex do guard-rail (23/09) |
| Arbitrário acima de 16px | 51 | **1** | `text-[120px]` proposital (`NotFound.tsx`) |
| Arbitrário com equivalente exato | 836 | **0** | — |

**475 substituições** aplicadas (F2 251 · F3 193 · F4 27 · F5 4), mais o
`tailwind.config.ts` e o guard-rail de CI.

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
ratchets. Teto em `scripts/qa/tipografia-budget.json`, só pode cair — exceto pelo ajuste
pontual de 23/09 (ver "Fix pós-auditoria" abaixo), que corrigiu a *medição* de uma dívida
pré-existente, não introduziu dívida nova. Teto atual: 1 / 1 / 0.
DoD verificado: com violação proposital o guard sai com código 1; revertida, com 0.

## F5 — concluído (2026-09-23)

Os 3 arquivos preservados aplicados em PR separado (#526). A branch que originalmente
justificou a exclusão (`redesign/inbox-fidelidade-carvao-codex`, PR #384) está closed sem
merge desde 14/09, dormente, e não toca `MessageBubble.tsx`. As duas branches citadas no
desvio original do F5 (`redesign/inbox-fidelidade-carvao` → PR #301, `feat/inbox-painel-direito`
→ PR #299) já estavam mergeadas desde 09/09. Zero PRs abertas no repositório no momento da
verificação — sem conflito real.

As 4 substituições aplicadas (PR #526):

- `ChatInputArea.tsx:201` — `text-[16px]` → `text-base` (16px, equivalente exato)
- `MessageBubble.tsx:192` — `text-[12px]` → `text-xs` (12px, equivalente exato)
- `MessageBubble.tsx:234` — `text-[13.5px]` → `text-sm` (**sem** equivalente exato — ver
  decisão abaixo)
- `ContactHeaderSection.tsx:144` — `text-[18px]` → `text-lg` (18px, equivalente exato)

## Decisão: `MessageBubble.tsx:234` — 13,5px → 14px (2026-09-23)

Dos 4 pontos do F5, só `MessageBubble.tsx:234` não tem equivalente exato na escala
(`xs` 12 · `sm` 14 · `base` 16 · `lg` 18 — não existe token para 13,5px). Fechar a
violação de meia-medida exigia escolher entre manter `text-[13.5px]` fora da escala
nomeada (reabrindo 1 ponto no guard-rail) ou absorver para `text-sm` (14px).

Auditoria de 23/09/2026 (rodada após o merge do PR #526) identificou que o valor tinha
sido absorvido para `text-sm` sem essa decisão ficar registrada — a entrada do budget que
antes marcava `13.5` como "sem equivalente na escala" foi removida no mesmo commit, e não
havia neste documento nenhuma nota sobre a mudança de tamanho renderizado.

**Decisão (owner, 23/09/2026): manter `text-sm` (14px).** Corpo das mensagens do chat fica
+0,5px (~3,7%) acima do valor original do ZAPP (13,5px) — é o único desvio de tamanho
renderizado em todo o F5. Trade-off: conformidade com a escala nomeada do guard-rail
(zero arbitrários) escolhida sobre paridade pixel-exata neste ponto específico. Sem
alteração de código como consequência desta decisão; registrado aqui para não ficar
implícito no changelog do commit.

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

## Fix pós-review: especificidade do bloco de headings (2026-09-23)

O codex review da PR #526 apontou que `src/index.css` importa `base.css` **antes** de
`@tailwind base`. O preflight do Tailwind reseta `h1..h6 { font-size: inherit }` na mesma
especificidade (0,0,1) do seletor `h1` usado no bloco de tipografia — e por rodar depois no
cascade gerado, vencia o empate e sobrescrevia o `clamp()` inteiro (D5 incluído: o
recalibre nunca teve efeito visual). Corrigido elevando a especificidade do bloco pra
`html h1`...`html h6` (0,0,2), mesma técnica já usada no bloco `html.dark` deste arquivo.
Confirmado por leitura direta do cascade gerado (import order + seletores); não depende
mais de revisão visual pra ser considerado corrigido — é uma garantia estrutural de CSS.

## Pendente

- **F3 item 12** — revisão visual das telas densas. 193 trocas de meia-medida mudam quebra
  de linha em tabela; nenhuma foi inspecionada em tela.

  **4 tentativas de automação nesta linha de trabalho, todas bloqueadas por infra de
  browser, nunca pela paridade em si:**
  1. Cloudflare Browser Rendering — token inválido/expirado (precisa permissão "Browser
     Rendering: Edit" renovada).
  2. Bright Data (scraping_browser) — sessão rejeitou consistentemente `fill`/`type` no
     campo de senha do formulário de login (3 sub-tentativas, mesmo erro "waiting for
     element to be visible, enabled and editable").
  3. Bright Data, nova sessão (23/09, pós-merge #526) — sessão expirou entre chamadas e
     depois pediu reautenticação OAuth (`/mcp`), impossível numa sessão não-interativa.
  4. Playwright Workers, mesma tentativa — falhou com o mesmo token Cloudflare inválido do
     item 1 (`CF_API_TOKEN` sem permissão "Browser Rendering: Edit"), confirmando que é o
     mesmo bloqueio de infra, não um problema do Bright Data especificamente.

  Testado também: sem computador vinculado a esta sessão (sem device bridge) e o conector
  `Chrome_Browser` disponível é só leitura/scraping (sem `click`/`fill`), não serve para
  formulário de login.

  Usuário QA `qa.visual@promobrindes.com.br` com senha redefinida de novo em 23/09 (Supabase
  Auth Admin API), pronta para a próxima tentativa. **Ação necessária fora desta sessão**:
  renovar/corrigir o `CF_API_TOKEN` com permissão "Browser Rendering: Edit" (destrava
  Playwright Workers e Cloudflare Browser MCP de uma vez), e/ou reautenticar o Bright Data
  MCP via `/mcp` numa sessão interativa. Sem isso, a revisão visual só é viável manualmente.

## Fix pós-auditoria: guard-rail cego a `rem`/`em` (2026-09-23)

Auditoria de 23/09/2026 achou `src/components/ui/calendar.tsx:29` (`text-[0.8rem]`, 12,8px)
— arbitrário fora da escala que `medir-tipografia.cjs` varria mas nunca contava, porque a
regex exigia sufixo literal `px]`. Não entrava em nenhuma das 3 métricas nem no budget.

Corrigido: regex estendida para `text-\[([0-9.]+)(px|rem|em)\]`, convertendo `rem`/`em` para
px (1 unidade = 16px, mesma convenção já usada em `toPx()` no restante do script).

Rodado de verdade contra checkout limpo (clone raso do `main`, não calculado à mão) para
confirmar que não havia outro arbitrário `rem`/`em` escondido nos 1.414 arquivos — achou
exatamente 1: o próprio `calendar.tsx:29`. Nenhuma outra métrica mudou.

`tipografia-budget.json` atualizado com o resultado real da execução:

| Violação | Antes do fix | Depois do fix |
|---|---|---|
| Meia-medida (`text-[N.5px]`) | 0 | **1** (`calendar.tsx:29`, 12,8px) |
| Arbitrário acima de 16px | 1 | 1 (inalterado) |
| Arbitrário com equivalente exato | 0 | 0 (inalterado) |

O ajuste de `meiaMedida` 0→1 não é regressão nova — é dívida pré-existente que ficou
invisível por 2 meses de gap na regex do guard-rail; agora medida corretamente. Componente
`calendar.tsx` é shadcn/ui padrão, fora do escopo desta correção (que é só de medição); a
decisão sobre tocar nele fica para um ciclo futuro.
