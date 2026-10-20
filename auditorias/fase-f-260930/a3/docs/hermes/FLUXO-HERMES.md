# Fluxo de execução por agente Hermes neste repositório

> Referência operacional para tarefas executadas pelo Hermes (agente de programação do Joaquim).
> O Claude analisa e escreve o plano; o Hermes executa **fielmente**, só no módulo do plano, e fecha o
> ciclo até o merge. Regras do repositório (`CLAUDE.md`, `AGENTS.md`) continuam valendo por cima.

## Um chat = um plano = um workspace = um branch = um PR

| Passo | Comando (no WSL) | O que garante |
|---|---|---|
| 1. Abrir | `hermes-tarefa-iniciar Zapp_Web_V2 <slug>` | worktree isolado em `~/hermes-workspaces/`, branch `hermes/<slug>-<id>` a partir de `origin/main` atualizado |
| 2. Executar | edição só nos arquivos do plano; gates: `bun run typecheck`, `lint`, `build`, `test`, `db:guard` | mudança mínima; bug fora do plano vai para "Achados fora do escopo", não é corrigido |
| 3. Banco | `hermes-db-migrar supabase/migrations/<versão>_<nome>.sql` | classifica o SQL: **aditiva** aplica na hora; **contrato** fica pendente para depois do merge; **destrutiva** exige confirmação humana |
| 4. Fechar | `hermes-tarefa-fechar "<tipo>(<escopo>): <título>" corpo-pr.md` | título Conventional Commits, corpo completo, varredura de segredos, push sem force, PR pronto (nunca draft) |
| 5. Mergear | `hermes-tarefa-mergear` | espera os checks obrigatórios, mergeia (squash) só com `mergeStateStatus=CLEAN`, espera o deploy Production e aplica o DDL pendente |
| 6. Limpar | `hermes-tarefa-limpar .` | remove o worktree; recusa se houver migration pendente |

## O que é bloqueado por guarda técnica (não é combinado, é impedido)

- Escrita na cópia de referência `~/projetos/Zapp_Web_V2` (somente leitura).
- `git push`/`pull` diretos, `--force`, `--no-verify`, troca ou criação de branch, `git worktree`,
  `git -c` com chave perigosa, aliases, `--git-dir`/`--work-tree`, `GIT_*` de redirecionamento,
  `clean -x`, `stash -a`, `--amend` depois do push, `config` de remote/alias/global.
- Merge, checkout ou cópia de arquivos de branch de outro agente (`hermes/*`, `claude/*`, `codex/*`).
- `gh pr create/merge/close/checkout` diretos e qualquer `gh api` que não seja `GET`.
- Uso do workspace de outro chat; segunda tarefa no mesmo chat sem fechar a primeira.

## Banco de dados

- Banco canônico: Supabase Cloud `tnnnlkbymytvtqngbbqh` (ver `CLAUDE.md` §1). Rota do agente: gateway
  `supabase-zapp-web-v2-mcp` (função `mcp_exec`, transação por chamada; `BEGIN`/`COMMIT` explícitos e
  `CREATE INDEX CONCURRENTLY` não são aceitos; `search_path` = `pg_catalog, public` — qualifique o schema).
- Toda migration é arquivo em `supabase/migrations/` + registro no ledger com o SQL real, statement a
  statement (`scripts/db-audit/register-migration.mjs`), na mesma transação do DDL.
- Ordem para DDL que muda contrato: arquivo → PR → merge → deploy → apply (executada pelo
  `hermes-tarefa-mergear`, não à mão).

## Relatório da tarefa

Primeira linha diz o que ficou pronto (ou não). Depois: branch, PR, sha do merge, CI, deploy, banco,
verificação, mudanças, divergências do plano e **achados fora do escopo** (não corrigidos, para virar
tarefa nova).
