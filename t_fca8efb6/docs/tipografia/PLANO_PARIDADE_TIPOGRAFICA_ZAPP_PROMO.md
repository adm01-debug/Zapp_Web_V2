# Plano — paridade tipográfica ZAPP Web V2 ↔ Promo Gifts V4

Medições de 22/09/2026, contra `main` do ZAPP (`0933e01b`) e `main` do Promo_Gifts_V4.
Nada aqui é estimativa: todo número veio de `git grep` nos dois repos ou de medição do DOM
renderizado em produção.

## 1. Onde estamos

Já em produção (PRs #466, #493, #505, #506, #507):

| Camada | Estado |
|---|---|
| Famílias (Plus Jakarta Sans / Outfit) | igual ao Promo, mesmos pesos carregados |
| Pesos no dark (450 / 550 / 650 / 800 / 900) | igual, via `html.dark` em `src/styles/base.css` |
| `letterSpacing` por tamanho na escala | removido dos dois (decisão de 22/09) |
| Sidebar: marca, item, cabeçalho de grupo, ícones, seta | medido igual ao Promo |
| Controles de Contatos (busca, select, abas, botões) | `text-sm`, igual aos primitives do Promo |

## 2. O que "padrão Promo" significa, extraído do código dele

Importante: o Promo **não** é um app sem tamanhos arbitrários. Ele usa muito `text-[10px]`
(1.396 usos), `text-[11px]` (548) e `text-[9px]` (250). Copiar "proibir arbitrário" seria
inventar um padrão que a referência não segue. O padrão real dele é:

1. **Escala do Tailwind sem customização.** O `tailwind.config.ts` do Promo não define
   `fontSize`; usa os defaults, inclusive os line-heights.
2. **Abaixo de 12px, arbitrário é normal** — é a faixa de badge, atalho e rótulo.
3. **Acima de 16px, escala nomeada.** Fora dela o Promo só tem `17px` (3) e `20px` (6).
4. **Sem meias-medidas.** 4 usos de `11.5px` no repo inteiro, e nenhum outro `.5`.
5. **Pesos por classe, reescritos no dark via CSS global** — já replicado no ZAPP.

## 3. Divergências que restam (medidas)

| # | Divergência | ZAPP | Promo | Tamanho do trabalho |
|---|---|---|---|---|
| D1 | `fontSize` customizado no `tailwind.config.ts` | escala própria 2xs–9xl | default do Tailwind | line-height de `xl` (30px vs 28px) e de `5xl`–`9xl`; `2xs` não existe no Promo e tem **0 usos** no ZAPP |
| D2 | Arbitrários com equivalente exato na escala | 254 usos (`12px`×183, `14px`×39, `18px`×17, `16px`×9, `20px`×4, `24px`×2) | 74 equivalentes | 254 substituições mecânicas |
| D3 | Meias-medidas | **194 usos em 25 arquivos** (`12.5`, `11.5`, `10.5`, `13.5`, `9.5`, `7.5`) | 4 | 194 substituições, decisão de arredondamento por caso |
| D4 | One-off acima de 16px fora da escala | 29 usos (`22px`×11, `17px`×4, `32px`×3, `28px`×3, e 30/34/38/42/120px) | 9 | 29 substituições |
| D5 | Headings | `clamp()` fluido em `base.css` (h1–h6) | classes responsivas discretas (`text-4xl md:text-5xl lg:text-6xl`) + tracking por nível | decisão, ver §4 |
| D6 | Cor de texto no dark | ZAPP só mexe no peso | Promo força `color: hsl(24 10% 98%)` em `span/p/label/td/th/li` e 85% no muted | decisão, ver §4 |

Concentração de D3 por módulo: talkx 13 arquivos, dashboard 4, contacts 4, inbox 3, catalog 1.

## 4. Decisões que dependem de você

**D5 — headings.** Paridade literal pede trocar o `clamp()` por classes responsivas
discretas. O `clamp()` é tecnicamente melhor (escala contínua, sem saltos em breakpoint) e
o ZAPP é usado bastante em telas pequenas. **Recomendação:** manter o `clamp()` e calibrar
os extremos para coincidir com o Promo nos breakpoints dele (min = tamanho mobile do Promo,
max = tamanho `lg`), em vez de copiar o mecanismo. Fica visualmente igual onde importa e não
perde a fluidez. Alternativa, se você quiser paridade literal: trocar pelo sistema discreto.

**D6 — cor global de texto no dark.** No Promo essa regra tem efeito colateral forte: como
`.dark span` tem especificidade maior que `text-primary`, qualquer `<span class="text-primary">`
perde a cor no dark. **Recomendação:** não replicar a regra global. Se você quiser o mesmo
resultado visual, aplicar só em `p/li/td/th` (fora de `span`) e com o token do ZAPP
(`--foreground`), nunca com o `hsl(24 10% 98%)` literal, que é da paleta quente do Promo.

Sem essas duas respostas, as fases 0 a 4, 6 e 7 seguem normalmente.

## 5. Fases

### F0 — Ferramenta e baseline (sem risco)
1. Generalizar `/workspace/qa-sidebar/measure2.cjs` para receber lista de rotas e seletores,
   e versioná-lo em `scripts/qa/medir-tipografia.cjs`.
2. Rodar em produção logado nas rotas principais (`/`, `?view=contacts`, `?view=dashboard`,
   `?view=catalog`, `?view=talkx`, `/sla`, `/sla/history`, `/queues/comparison`) e gravar o
   baseline em `docs/tipografia/baseline-<data>.json`.
   **DoD:** JSON com tamanho, peso, tracking, line-height e cor por elemento-chave de cada rota.

### F1 — Escala do Tailwind (1 arquivo)
3. Remover `2xs` (0 usos).
4. Alinhar o line-height de `xl` (28px) e de `5xl`–`9xl` aos defaults do Tailwind.
5. Rodar o baseline de novo e diferenciar: só `text-xl` e `text-5xl+` podem mudar.
   **DoD:** diff do baseline restrito a esses tamanhos; build verde.

### F2 — Arbitrários com equivalente exato (254 usos)
6. `text-[12px]` → `text-xs` (183) — maior lote, fazer sozinho numa PR.
7. `text-[14px]` → `text-sm` (39), `text-[16px]` → `text-base` (9).
8. `text-[18px]` → `text-lg` (17), `text-[20px]` → `text-xl` (4), `text-[24px]` → `text-2xl` (2).
9. Conferir caso a caso os que estão dentro de `cn()` com condicional — substituição cega
   pode colidir com `tailwind-merge`.
   **DoD por lote:** baseline sem mudança de tamanho renderizado (é troca equivalente), build verde.

### F3 — Meias-medidas (194 usos, 25 arquivos)
10. Definir a regra de arredondamento: `12.5→12`, `11.5→11`, `10.5→10`, `13.5→14`, `9.5→9`,
    `7.5→8`, e então mapear para a escala quando existir.
11. Aplicar por módulo, na ordem dashboard → contacts → catalog (talkx e inbox ficam para F5).
12. Revisar visualmente as telas densas, onde 0,5px muda quebra de linha.
    **DoD:** zero `text-[N.5px]` fora de talkx/inbox; nenhuma quebra de layout nas telas revisadas.

### F4 — One-off acima de 16px (29 usos)
13. Mapear cada um para a escala: `17/18→lg`, `19/20→xl`, `22/24→2xl`, `26/28/30→3xl`,
    `32/34/38→4xl`, `42→5xl`, `120→caso próprio (número gigante de estado vazio)`.
14. Aplicar e medir.
    **DoD:** nenhum `text-[>16px]` fora de um caso justificado no código.

### F5 — Módulos com trabalho ativo
15. **TalkX:** 13 arquivos com meia-medida + os `text-[15px]` de título de painel. O redesign
    do TalkX está em andamento em outra frente; coordenar antes de mexer para não conflitar.
16. **Inbox:** tem spec própria (`docs/design/PLANO_INBOX_FIDELIDADE_CARVAO.md`) e branch ativa
    `redesign/inbox-fidelidade-carvao`. Só entra com aval explícito, ou depois que aquela branch
    fechar.
    **DoD:** nenhum conflito de merge com as branches ativas.

### F6 — Guard-rail (impede a volta)
17. Script em `scripts/ci/` no mesmo molde do `lint-ratchet.mjs`: falha quando aparece
    `text-[N.5px]` novo, ou `text-[Npx]` acima de 16px, ou um arbitrário que tem equivalente
    exato na escala. Baseline congelado no valor pós-F4, só pode cair.
18. Registrar no `ci.yml` junto dos outros guards.
    **DoD:** PR de teste com uma violação proposital é reprovada pelo CI.

### F6.5 — Decisões D5/D6, se você responder
19. Headings conforme D5.
20. Cor de texto conforme D6.

### F7 — Verificação final
21. Rodar o medidor nas mesmas rotas do F0 e publicar a tabela antes/depois.
22. Comparar com a tabela do Promo (§2) e registrar o que sobrou divergente de propósito.
    **DoD:** relatório final em `docs/tipografia/`, com os desvios intencionais justificados.

## 6. Como isso é entregue

- Uma PR por fase (F2 quebrada em 3), cada uma com build, medição antes/depois na descrição,
  e revertível sozinha.
- Ordem de módulo por risco: contacts (feito) → dashboard → queues/SLA → catalog → settings →
  team-chat → talkx → inbox.
- Total de substituições mecânicas: **477** (254 + 194 + 29), mais 1 arquivo de config e
  1 script de CI.
