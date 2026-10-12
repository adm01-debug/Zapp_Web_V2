Especialista: complexo (area-front-hooks)
## O que mudou e por quê
- scripts/ci/ci-docs-baseline.unit.mjs: adicionado o teste `CLAUDE.md: seção "Catálogo" cobre o handoff e confere com a edge` (+ funções `secaoCatalogo` e `acoesDaEdge`) — trava do REL-1 (docs/catalogo/HANDOFF_v1.md §4). Código reaproveitado do commit c877c384c (branch v2/sl-155-2610082158f027), aplicado sobre a base atual. CLAUDE.md NÃO tocado (arquivo protegido; decisão do dono 20261008-215845-9a01-sl-155 segue sem resposta).
## Prova
- vermelho (estado final pretendido, sem a seção): `node --test scripts/ci/ci-docs-baseline.unit.mjs` → `ℹ tests 19 / ℹ pass 18 / ℹ fail 1`, falha `AssertionError [ERR_ASSERTION]: CLAUDE.md não tem a seção "## Catálogo"`. Base sem a mudança: `ℹ tests 18 / ℹ pass 18 / ℹ fail 0` — a única falha nova é a trava, sem regressão.
- verde (trava valida a seção correta): com a seção do anexo acrescentada temporariamente ao CLAUDE.md, `node --test --test-name-pattern="Catálogo"` → `✔ pass 1 / fail 0`; CLAUDE.md revertido em seguida (`git checkout -- CLAUDE.md`, só o .mjs segue modificado).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (85s)`.
## O que NÃO fiz e por quê
- NÃO apliquei a seção no CLAUDE.md: arquivo protegido, só o dono aplica; a decisão pedida em 08/10 segue sem resposta. Quando o dono aplicar a seção do anexo, esta trava fica verde sozinha.
