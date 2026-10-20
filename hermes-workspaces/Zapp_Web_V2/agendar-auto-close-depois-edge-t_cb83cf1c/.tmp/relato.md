Especialista: senior
Base de partida: commit 8bba945f84 do cartao-pai PE-102 (mesmo assunto, nao e outro cartao). Este refazer remove o job auto-close, declara verify_jwt nas 3 edges e ajusta guarda/rollback/teste para 5 jobs.

## O que mudou e por quê
- supabase/migrations/20261013093000_agendadores_edge_e_purga_cron.sql: removido o bloco de agendamento do job auto-close-conversations da funcao apply (mantidas as demais funcoes e os outros 5 jobs); guarda de saida, cabecalho de rollback e comentarios ajustados para 5 jobs, com o motivo registrado no cabecalho (edge sem filtro de status/exclusao/limite, ver PK-01; job volta no PK-02).
- supabase/config.toml: secoes verify_jwt = false para send-scheduled-report, cleanup-rate-limit-logs e auto-close-conversations (a ultima sem job neste cartao, pronta para o PK-02), com comentario explicando que o gateway barrava o cron com 401 antes do x-cron-secret.
- scripts/db-audit/pg-cron-jobs-baseline.json: entrada auto-close-conversations removida (5 jobs restantes).
- scripts/db-audit/agendadores-edge-e-purga-cron.test.sh: A1a virou prova de ausencia do auto-close (falha se a migration voltar a agenda-lo); A1d/A2/D1 contam 5 jobs; A3a usa send-scheduled-report; A3b/A3c/A3d cobrem as 2 edges restantes.

## Prova
- vermelho antes (teste novo contra a migration antiga via MIGRATIONS_DIR): `[FAIL] A1a. auto-close-conversations NAO esta agendado (volta no PK-02): esperado '0', obtido '1'`
- verde depois: `[OK] contrato dos agendadores Edge + purga do log do cron: TODAS as assercoes passaram.` (blocos A, B, C e D, incluindo D1–D4 que executam o `-- Rollback:` de verdade no banco descartavel)
- config: `python3 -c tomllib` confirma as 3 secoes [functions.*] com verify_jwt = false; `bash -n` no teste OK.

## Pontos do revisor
- Ponto 1: resolvido — supabase/migrations/20261013093000_agendadores_edge_e_purga_cron.sql (bloco de schedule/alter_job do auto-close removido da apply; guarda de saida:498 sem ele; rollback:2 com 5 jobs); teste A1a em scripts/db-audit/agendadores-edge-e-purga-cron.test.sh:283 prova a ausencia — falha sem a correcao (vermelho acima) e passa com ela.
- Ponto 2: resolvido — supabase/config.toml:97,100,103 com verify_jwt = false para send-scheduled-report, cleanup-rate-limit-logs e auto-close-conversations; a autorizacao segue obrigatoria dentro de cada edge (x-cron-secret antes de qualquer leitura/escrita, conferido no codigo das 3 edges, sem alteracao nelas).
- Ponto 3: resolvido — teste de contrato atualizado para os 5 jobs (A1a ausencia, A1d/A2 5 jobs, A3a–A3d nas 2 edges, D1 rollback dos 5); linha final `[OK] ... TODAS as assercoes passaram.` (29 linhas [PASS] na saida verde acima).
- Ponto 4: resolvido — scripts/db-audit/pg-cron-jobs-baseline.json:54 sem a entrada 4-59/10 do auto-close (5 jobs restantes).
- Ponto 5: resolvido por conferencia — as 3 edges comparam x-cron-secret em tempo constante ANTES de criar o cliente service_role e de qualquer leitura/escrita/delecao, com fail-closed sem CRON_SECRET; nenhuma alteracao necessaria no codigo delas.

## O que NÃO fiz e por quê
- Nao alterei o codigo das 3 edges nem o deployment-manifest.json: o gate do segredo ja esta na ordem certa; o cartao so pedia conferir.
- Nao renomeei o arquivo de teste nem o registro no inventario: o nome continua o mesmo, sem quebra de rastreio.
- Nao toquei em nenhum outro job, migration ou config fora da lista do cartao (diff restrito aos 4 arquivos acima).

## Acoes de producao
Nenhuma (nenhuma leitura e nenhuma escrita em producao; prova executada em Postgres descartavel via docker).
