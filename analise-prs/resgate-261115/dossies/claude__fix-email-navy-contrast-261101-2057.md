# Dossiê — claude/fix-email-navy-contrast-261101-2057 (PR #2513)

Tip `b1ff2f007` · merge-base `1252bb5a4` · 11 commits (2026-11-01) · 15 arquivos.

## Propósito
Garantir que `.dark.high-contrast` (src/styles/accessibility.css) vença os inline styles que
`applyThemePreset()` grava em `<html>` (`--muted-foreground` ficava 1,9:1 contra fundo preto):
a branch pôs `!important` nos 20 tokens do bloco e, em cascata, ajustou 14 testes de contraste
para que o parser de tokens CSS tolerasse `!important` (strip no `limpo` ou `(?:!important\s*)?;` na regex).

## Como a main resolveu a mesma necessidade
- `src/components/settings/theme/presets.ts:714-722` (`applyThemePreset`): com `.high-contrast` ligado,
  os tokens do preset NÃO são escritos inline (`removeProperty`) — causa raiz atacada na origem
  (commits `f022cd8c4` #1416 e `ecfdb26ff` #1911).
- `src/styles/accessibility.css:27-50` (commit `b59f7a02e`, PR #2587, 2026-11-02): `!important` só nas
  8 vars de TEXTO (`--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`,
  `--muted-foreground`, `--accent-foreground`, `--destructive-foreground`), para o caso de timing
  (inline gravado antes da classe). Vars de fundo/borda ficam sem `!important` por decisão explícita.
- Todos os parsers de teste já aceitam `!important` via `(?:!important\s*)?;` (ver tabela).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência na main |
|---|---|---|
| src/styles/accessibility.css | OBSOLETA (abordagem superada: `!important` em 20 tokens vs. 8 de texto + guarda em presets.ts) | accessibility.css:29-45 (`!important` nos *-foreground, comentário de motivo); presets.ts:714-722 |
| src/components/__tests__/y17Selos.contraste.test.tsx | INCORPORADA (regex tolera `!important`; strip no `limpo` desnecessário) | :134 `(?:!important\s*)?;` |
| src/components/inbox/__tests__/ContactDetails.mobile-iniciais-sentimento.test.tsx | INCORPORADA | :235 `(?:!important\s*)?;` |
| src/components/inbox/__tests__/SLAIndicator.contrasteSelos.test.tsx | INCORPORADA; as 3 linhas "faltantes" restantes são mojibake da branch (travessão corrompido em `TEXTO_DO_ESTADO`, `describe`, mensagem do expect) — main tem o texto correto | :79 regex; :116 `\w[\w-]*`; :209/:219 travessão íntegro |
| src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx | INCORPORADA | :82 |
| src/components/inbox/__tests__/contrastePlayerSlider.test.tsx | INCORPORADA | :131 |
| src/components/inbox/chat/__tests__/MessageBubble.contrasteStatus.test.tsx | INCORPORADA | :133 |
| src/components/inbox/tabs/__tests__/KpiStrip.contraste.test.tsx | INCORPORADA | :79 |
| src/components/mobile/__tests__/MobileDrawerMenu.a11y.test.tsx | INCORPORADA | :81 |
| src/components/security/__tests__/IPListasErro.contrasteTema.test.tsx | INCORPORADA | :76 |
| src/components/settings/__tests__/ThemeCustomizer.a11y.test.tsx | INCORPORADA (`viaVar` usa `[.\w-]+`, mais amplo que `\w[\w-]+`) | :76 regex; :113 |
| tests/contracts/contraste-balao-midia.contract.test.ts | INCORPORADA | :79 |
| tests/contracts/contraste-cores-categoria.contract.test.ts | OBSOLETA/ruído: lê só `:root {` e `.dark {` de `src/styles/tokens.css`, que não tem nenhum `!important` (`grep -c important` = 0) — a tolerância era defensiva, sem efeito | :73-74, tokens.css |
| CT69_contrasteBadges.test.tsx, contraste-aa-componentes.contract.test.ts | IDENTICAL_TO_MAIN | PRESENT_BYTE |

Mudança `--([\w-]+)` → `--(\w[\w-]+)` nos testes: main usa `\w[\w-]*` ou `[.\w-]+` (equivalentes ou mais abrangentes) — nada a portar.

## Veredito
**OBSOLETA** (CSS superado por solução melhor e já em produção; testes já tolerantes). Nenhuma lacuna a recuperar.
`apagar_branch_seguro = true`.

## Reexame de commits intermediários

Parecer: **REFATORACAO_INTERNA**. `apagar_branch_seguro = true` (veredito OBSOLETA mantido).

As 29 linhas que a varredura mecânica apontou são de duas naturezas, nenhuma delas trabalho real perdido:

### 1. Troca de técnica equivalente (5 arquivos, 5 linhas) — commit `210a9fabb` → removido por `9c590eb7f`
`210a9fabb` tolerou `!important` **dentro da regex** (`%\s*(?:!important\s*)?;`). `9c590eb7f`
("corrige regex tokensDoBloco para aceitar !important nos tokens CSS") trocou isso por um **strip prévio**
no texto do CSS e devolveu a regex ao formato `%\s*;`:

- `9c590eb7f`, y17Selos.contraste.test.tsx:120 e SLAIndicator.contrasteSelos.test.tsx:64 (na ponta):
  `const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*!important/g, '');`

Mesma intenção, cobertura até maior (pega `!important` em qualquer posição). E a intenção **sobrevive na main**,
na forma original: `(?:!important\s*)?;` nos 5 arquivos — y17Selos:134, ContactDetails.mobile:235,
SLAIndicator:79, StatusChips:82, ThemeCustomizer.a11y:76 (`git show origin/main:<arquivo>`). Nada a portar.

### 2. Vai-e-vem de corrupção da própria branch (24 linhas) — `1f5e9c6da`, `a0628c822`, `0254f3313`, `5d4c24161`
Os 4 últimos commits são um pingue-pongue em `SLAIndicator.contrasteSelos.test.tsx`: cada um conserta um
estrago e introduz outro. Nenhuma linha "removida" aqui é funcionalidade — é lixo sendo desfeito:

| Commit | Introduziu | Desfeito por |
|---|---|---|
| `1f5e9c6da` | ~20 linhas de binário/mojibake a partir do `expect(tinta, …)` (linha 250 em diante), arquivo sem newline final | `a0628c822` restaurou o código legível |
| `a0628c822` | regex quebrada `--(\t[\w-]+)` (tab em vez de `\w` → nenhum token casa) + mensagem sem os dois-pontos | `0254f3313` |
| `0254f3313` | `tintaDaClasse` com espaço espúrio `\/( \d+)` → `Error: selo sem tinta` | `5d4c24161` |
| `5d4c24161` | regex quebrada `--(\u[\w-]+)` | `b1ff2f007` (ponta) |
| `b1ff2f007` (ponta) | mojibake em `TEXTO_DO_ESTADO.ok` ("o verde j\xE0 \xC1\xE9 opr\xF3prio"), travessão corrompido no `describe` da linha 219, espaço duplo na mensagem do `expect` | — ainda está na ponta |

`0254f3313` → `5d4c24161` ainda trocou `([\w][\w-]+)` por `(\w[\w-]+)` em `textoDaClasse`: regexes idênticas.

A main tem o arquivo íntegro e mais permissivo: `\w[\w-]*` na matchAll (:79) e em `textoDaClasse` (:116),
`\/([0-9]+)` em `tintaDaClasse` (:108), travessão correto em `TEXTO_DO_ESTADO.ok` (:209) e no `describe` (:219).
A ponta da branch está pior que a main nos 3 pontos.

Conclusão: nenhum commit intermediário entregou validação, guarda, teste ou estado que a ponta ou a main
tenham perdido. Nada a recuperar.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA**. `apagar_branch_seguro = true`. Nenhuma lacuna ≥ média encontrada.
Base da verificação: `origin/main` em `dac285f62` (2026-11-15), diff `1252bb5a4 → b1ff2f007` (15 arquivos,
49 inserções / 45 deleções — nenhum arquivo fora da lista do JSON).

### Tentativa de refutação 1 — a necessidade do CSS ainda existe na main?
Não. A causa raiz está atacada em TRÊS pontos, todos lidos na main:
- `src/components/settings/theme/presets.ts:712-721` — `applyThemePreset`: `const altoContraste =
  root.classList.contains('high-contrast')`; dentro do laço de `CSS_VARS_TO_APPLY` e de
  `PRESET_FIXED_OVERRIDES`, com HC ligado faz `root.style.removeProperty('--'+key)` em vez de
  `setProperty`. Logo o inline que gerava o 1,9:1 não é mais escrito.
- `index.html:46-53` (boot inline) — `var altoContraste = localStorage.getItem('highContrast')==='true'`;
  a classe entra já no boot e o `cssVarsCache` só é gravado inline `if (!altoContraste …)`.
- `src/components/theme/HighContrastProvider.tsx:60-77` — depois de add/remove da classe, reaplica
  `applyThemePreset(..., {persistCache:false})`, justamente para LIMPAR as vars inline ao ligar o HC
  (comentário :69-72). Fecha o caminho "ligar o HC com inline já gravado".
Mais o cinto de segurança para o caso de timing: `src/styles/accessibility.css:27-50` (commit `b59f7a02e`,
"fix(a11y): !important nas vars de texto de .dark.high-contrast (#2587)") põe `!important` nas 7 vars de
TEXTO, `--muted-foreground: 0 0% 80% !important` incluída (:37) — exatamente o token que a branch citava
como ilegível. Deixar fundo/borda sem `!important` é decisão explícita e posterior (2026-11-02) à branch
(2026-11-01); portar os 20 `!important` da branch seria regressão de decisão, não resgate.

### Tentativa de refutação 2 — algum parser de teste da main ainda rejeita `!important`?
12 dos 13 têm `(?:!important\s*)?;` (verificado com `git show origin/main:<arquivo> | grep -n important`):
y17Selos:134, ContactDetails.mobile:235, SLAIndicator:79, StatusChips:82, contrastePlayerSlider:131,
MessageBubble:133, KpiStrip:79, MobileDrawerMenu:81, IPListasErro:76, ThemeCustomizer.a11y:76,
contraste-aa-componentes:80 e :226, contraste-balao-midia:79. As classes de caractere da main
(`\w[\w-]*`, `[.\w-]+`, `[/\w-]+`) são iguais ou mais amplas que as da branch (`\w[\w-]+`).

O único sem tolerância é `tests/contracts/contraste-cores-categoria.contract.test.ts:41`
(`…%\s*;/g`) — e é inerte, confirmado e não só alegado:
- a fonte é fixa em `:12`: `process.env.TOKENS_CSS ?? …/src/styles/tokens.css`; `git grep TOKENS_CSS
  origin/main` só encontra consts locais homônimas em outros testes — **nenhum** workflow, script ou
  config exporta a env, então o arquivo lido é sempre `tokens.css`;
- `git show origin/main:src/styles/tokens.css | grep -c important` = **0**;
- os blocos lidos são só `:root {` e `.dark {` (:72-73) — `accessibility.css`, onde vive o `!important`,
  nunca entra. Valor da lacuna: nulo (tolerância defensiva sem efeito observável), abaixo do piso "médio".

### Tentativa de refutação 3 — a ponta da branch tem algo melhor que a main?
Ao contrário: a ponta está corrompida. `git show origin/.../SLAIndicator.contrasteSelos.test.tsx | cat -v`
mostra mojibake em `TEXTO_DO_ESTADO.ok` (`o verde jM-CM- M-^AM-i oprM-CM-3prio`) e nos comentários
:60-62, onde a main tem o texto íntegro (:209). O `limpo.replace(/\s*!important/g,'')` da branch é técnica
equivalente ao `(?:!important\s*)?;` da main — mesma cobertura prática, nada a portar.

Conclusão: 0 hunks de valor ≥ médio fora da main. Branch segura para apagar.
