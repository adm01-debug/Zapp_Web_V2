- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 19s;OK lint 3s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (16/10 01:42, gerados por máquina: valem mais que números escritos à mão)
```
 ESTADO.md                                           | 4 ++--
 scripts/ci/docs-estado-registry-convention.unit.mjs | 3 ++-
 2 files changed, 4 insertions(+), 3 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: scripts/ci/docs-estado-registry-convention.unit.mjs

Especialista: semisenior (area-front-hooks + area-testes-do-produto)

## FATOS MEDIDOS (saída de máquina)
- Commit: 13bcf1d24a `fix(admin): ancora create-user no ESTADO.md e guarda reconhece camada invokeEdge` (branch v2/admin-criar-usuario-edge-padrao-26101311-26101601216610, sobre dia/2026-10-16 d723a90107).
- Diff contra a base: 2 arquivos, 4 inserções, 3 remoções (`ESTADO.md`, `scripts/ci/docs-estado-registry-convention.unit.mjs`).
- Guarda no 13/10 (árvore dia/2026-10-13 + ef9393c73, prova em .tmp): ANTES exit 1 (`âncora desatualizada: ...useAdminData.ts:256 não cita 'create-user'` + `grupo de 'create-user' divergiu ... {"A":[],"B":[],"C":[],"D":[]}`); DEPOIS exit 0, 11/11 ✔ (log .tmp/wt-dia13-depois.log).
- Guarda na base atual (dia/2026-10-16 + commit): create-user sem falha; restam só 2 falhas de outros cartões (ai-kb-ingest, talkx-link), iguais com e sem meu commit.
- `vitest run src/components/admin/__tests__/useAdminDataCreateUser.test.ts`: 8 passed.
- `zapp-verify . --rapido`: VERIFY_EXIT 0 — OK db_guard, OK tipos, OK lint, OK migrations; banco_local AVISO (sem conjunto; sem SQL no diff).
- Espelho (`ci_espelho.sh .`): 11 itens antes e 11 itens depois, listas idênticas (`diff` vazio) — meu commit não cria falha nova.

## Ponto 1 — Âncora stale do `create-user` (o item do cartão)
O que mudei: `ESTADO.md` linha 73, `src/components/admin/useAdminData.ts:256` → `:334` · `:341` (os dois `await invokeEdge('create-user', body)`; linha 256 atual é `department: editingUser.department,`, sem a edge).
Teste que prova: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` — vermelho antes (`âncora desatualizada: ...:256 não cita 'create-user'`, .tmp/guard-antes.log e .tmp/wt-dia13-antes.log), verde depois para create-user (arquivo 13/10 todo verde, 11/11).

## Ponto 2 — Guarda não reconhecia a camada padrão `invokeEdge` (segunda faceta da mesma causa)
O que mudei: `scripts/ci/docs-estado-registry-convention.unit.mjs` linha 60, `invoke\(` → `invoke(Edge)?\(` + 1 linha de comentário (camada PE-43 de `src/lib/supabaseHelpers` conta como chamador de front, grupo A); `ESTADO.md` (definição do grupo A: `invoke`/`invokeEdge`/rota). Nenhuma asserção afrouxada — o teste de órfãs continua passando e o padrão anterior (`invoke(`, rota) casa igual.
Teste que prova: mesmo comando — vermelho antes (`grupo de 'create-user' divergiu ... {"A":[],"B":[],"C":[],"D":[]}` = guarda cega), verde depois (grupo computado A = publicado A). Blast radius medido: `invokeEdge('` existe só em `useAdminData.ts` (2 ocorrências, ambas create-user); nenhum outro edge muda de grupo.

## Ponto 3 — Provar o mesmo comando verde + `zapp-verify --rapido` e fechar citando o sha
Comando: `bash .tmp/ci_espelho.sh .` (cópia do `ci_espelho.sh` em .tmp — a guarda bloqueia executar a partir de `~/arquitetura-v2/`); resultado acima (listas iguais, sem falha nova). `zapp-verify . --rapido` verde (exit 0). Sha citado: 13bcf1d24a.

## O que NÃO foi feito (fora do escopo, virou kanban_comment)
- `ai-kb-ingest` (âncora `:99` em `useKnowledgeBase.ts`, calls reais em `:126`/`:197`) e `talkx-link` (publicado B, computado A via `TALKX_LINK_PATH` em `useTalkXLinks.ts:56`): deriva de outros cartões, não corrigidos aqui.
- Cherry-pick de ef9393c73 resultou vazio e foi pulado (`--skip`): a entrega já está integrada na base (66713e9510, ancestor comprovado). O fix da rodada 1 do senior (27f5efc38e, âncoras :334/:341) estava em workspace de outra sessão (guarda recusou escrita); provei o equivalente em árvore 13/10 remontada via `git archive` em .tmp (removida após a prova).
- Nenhum arquivo de produção, migração, Edge ou workflow tocado; nenhum teste existente alterado.
