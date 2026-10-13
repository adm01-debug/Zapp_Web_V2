Especialista: worker (visual) (design-system-zapp)

## O que mudou e por quê
- src/styles/tokens.css: 13 tokens `--contacts-*` novos, nos blocos `:root` (claro) e `.dark` (escuro) — superfícies de nível (`--contacts-page`, `--contacts-panel`, `--contacts-raised`, `--contacts-line`, `--contacts-line-soft`, trincas HSL sem `hsl()`), `--contacts-card-gradient`, `--contacts-icon-tile`, brilho do selecionado (`--contacts-select-glow`), sombras de hover e do diálogo (`--contacts-hover-shadow`, `--contacts-dialog-shadow` a partir de `--elev-*`) e raios 11/13/17 px. Tudo derivado dos tokens que já existem (`--background`/`--card`/`--card-elevated`/`--border`/`--input`/`--primary`/`--primary-200`/`--primary-300`/`--elev-*`) — nenhuma matiz nova.
- src/styles/__tests__/contacts-tokens.test.ts (novo): contrato de definição — falha se um `--contacts-*` faltar em `:root` ou em `.dark`, se uma superfície não for trinca HSL, se o raio não for 11/13/17 px, se o gradiente não for `linear-gradient` ou se houver cor literal (#hex/rgb). O teste extrai os blocos REAIS de tokens.css e checa o próprio parser com `--background`/`--primary`, para não passar vazio.
- docs/design/contatos-redesign-2026-10-12/MAPA-TOKENS.md: tabela final design→token (superfícies/linhas/raios com valor nos dois temas; gradientes e sombras; cores de tipo que reusam `--primary`/`--violeta`/`--warning`/`--success`/`--destructive`; texto e fontes).

## Prova
- vermelho antes: `npx vitest run src/styles/__tests__/contacts-tokens.test.ts` (antes dos tokens) → `Tests  6 failed | 2 passed (8)`, ex.: `AssertionError: --contacts-radius-stat (claro): expected undefined to be '11px'`.
- verde depois (mesmo comando): `Test Files  1 passed (1); Tests  8 passed (8)`.
- suíte da área: `npx vitest run src/styles/__tests__` → `Test Files  9 passed (9); Tests  46 passed (46)`.

## O que NÃO fiz e por quê
- Não mapeei `--contacts-*` em `tailwind.config.ts`: arquivo fora dos 3 permitidos no cartão; o RD-002 só define os tokens (o consumo vem nas fases seguintes).
- Não provei cor/contraste computado: jsdom não carrega o CSS do app nem calcula layout; a medição visual (temas e alturas) é a fase RD-010 (captura visual).
- Não toquei em `presets.ts` (skins): os `--contacts-*` vivem em `:root`/`.dark`, que continuam valendo com skin aplicada (a skin escreve só as bases inline); fora do escopo do cartão.
