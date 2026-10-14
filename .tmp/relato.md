Especialista: semisenior
(skill de área usada: design-system-zapp; refazer 1 do t_ee2824b6, commit anterior b25f2af0bf, já presente nesta branch — sem cherry-pick, sem diff alheio)

## O que mudou e por quê
- src/styles/tokens.css: as 5 superfícies `--contacts-*` deixaram de ser trincas HSL copiadas e viraram apelidos `var()` das bases (`--contacts-page: var(--background)`, `panel: var(--card)`, `raised: var(--card-elevated)`, `line: var(--border)`, `line-soft: var(--input)`), nos dois temas (`:root` e `.dark`). Recolorir a base propaga sozinho; comentário do bloco atualizado (nunca colar a trinca).
- src/styles/__tests__/contacts-tokens.test.ts: contrato de derivação estrutural — superfície tem de ser exatamente `var(--base)` (cópia de trinca ou hex fica vermelha); gradiente tem de ser `linear-gradient()` só com `var(--*)` que existe no tema; sombra tem de conter o `--elev-N` exato (3/4/5) e o anel tem de referenciar `var(--primary)`; raios 11/13/17px nos dois temas e iguais entre temas; parser lê TODOS os blocos do tema (não só a primeira ocorrência) e prova que leu (bases + 13 tokens contacts-* por tema).
- docs/design/contatos-redesign-2026-10-12/MAPA-TOKENS.md: tabela de superfícies atualizada para `var(--base)` (antes listava as trincas copiadas).

## Prova
- vermelho antes (teste novo contra o CSS antigo): `npx vitest run src/styles/__tests__/contacts-tokens.test.ts` → `Tests 3 failed | 6 passed (9)`, ex. `--contacts-page (claro) colou trinca em vez de var(): expected true to be false`.
- verde depois (mesmo comando): `Test Files 1 passed (1); Tests 9 passed (9)`.
- suíte da área: `npx vitest run src/styles/__tests__` → `Test Files 9 passed (9); Tests 47 passed (47)` (zero falha, zero pulado).

## Pontos do revisor
- Ponto 1: resolvido — superfícies agora derivam COM `var()` (src/styles/tokens.css, blocos `:root` e `.dark`); teste `as superfícies derivam da base COM var()` falha se colar trinca/hex (vermelho antes comprovado acima).
- Ponto 2: resolvido — sombras declaradas a partir de `--elev-*` COM `var()` nos dois temas (já usavam; agora pinadas ao `--elev-N` exato por teste `as sombras estendem o --elev-N exato, nos dois temas` + anel referencia `var(--primary)`); parser fundindo todos os blocos do tema (sem "só primeira ocorrência"); teste de resolução de `var(--*)` dos gradientes nos dois temas.
- Ponto 3: resolvido — raios 11/13/17px pinados nos dois temas e com igualdade entre temas (teste `os raios têm os px do design (11, 13 e 17), iguais nos dois temas`); fonte dos valores: MAPA-TOKENS.md (linha `Raios:`).

## O que NÃO fiz e por quê
- Não mapeei `--contacts-*` em tailwind.config.ts nem consumi os tokens em componentes: fora dos 3 arquivos permitidos; o consumo vem nas fases seguintes (verificado: nenhum `var(--contacts-*)` fora de tokens.css/teste — `rg` retorna vazio).
- Não medi cor/contraste computado: o estilo computado é idêntico com cópia ou com `var()` — só o teste da definição distingue um do outro; aparência é prova de navegador da fase RD-010.

## Arquivos (git diff --name-only, colado do comando)
docs/design/contatos-redesign-2026-10-12/MAPA-TOKENS.md
src/styles/__tests__/contacts-tokens.test.ts
src/styles/tokens.css
