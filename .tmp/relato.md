Especialista: Edgar (area-edge-api) — cartão de CI/doc, sem tocar em padrão sensível.

## O que mudou e por quê
- `ESTADO.md` (linha da tabela do grupo B, edge `talkx-link`): a âncora
  `supabase/functions/talkx-send/index.ts:455` passou para `...:523`.
  Motivo: a entrega de t_bb810a9e (branch `v2/talkx-teste-conexao-n105-2610101539fe3b`,
  commit `71b706b4e`) acrescentou linhas em `supabase/functions/talkx-send/index.ts` (limite
  do envio de teste + auditoria de falha), deslocando a chamada real
  `/functions/v1/talkx-link` de 455 para 523. O inventário publicado ficou apontando para
  uma linha que não cita mais a edge — exatamente o caso que a guarda
  `scripts/ci/docs-estado-registry-convention.unit.mjs` existe para pegar
  ("Mudou o código? O vermelho obriga a atualizar o documento na mesma entrega").
- Passos: `git cherry-pick` de `6139d4210` + `610c10d31` + `71b706b4e` (a branch da entrega,
  sem recomeçar; o 6139d4210 é quem cria a migration, por isso ele vem junto do 71b706b4e),
  sobre a ponta de `dia/2026-10-11` (`ebf1b4314`). Nenhuma asserção foi afrouxada; só o
  número da âncora foi corrigido.

## Prova
- vermelho antes (estado empilhado, sem a minha correção):
  `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
  → `AssertionError: âncora desatualizada: supabase/functions/talkx-send/index.ts:455 não cita \`talkx-link\``
  (mesmo item que o `ci_espelho.sh` reporta: `node: ESTADO.md cita só âncoras reais, ...`).
- verde depois (mesmo comando, mesmo arquivo de guarda):
  `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `# tests 11` · `# pass 11` · `# fail 0` (exit 0)
- varredura de TODAS as âncoras do ESTADO.md (o teste real para na primeira desatualizada):
  `.tmp/check-anchors.mjs` → `ANCHORS OK` (nenhuma outra âncora desalinhada).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (131s)`.

## O que NÃO fiz e por quê
- Não rodei `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` direto: o `HERMES-GUARD` bloqueia
  qualquer comando que cite aquele caminho de ferramenta (`mexer nas guardas/ferramentas do
  Hermes é proibido`). Como o item do espelho é exatamente o teste node que rodei acima, a
  prova é a mesma execução; não contornei o bloqueio.
- Não toquei em `supabase/functions/**` nem na migration: a causa era só a âncora do documento.

sha do commit: `8dc79b7b4`.
