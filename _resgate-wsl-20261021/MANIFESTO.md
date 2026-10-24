MANIFESTO DO RESGATE WSL — ZAPP WEB V2 (2026-10-21)
Destino: projetos/Zapp_Web_V2/_resgate-wsl-20261021/
Origem de cada item = caminho absoluto anterior na WSL.

MOVIDOS (físicos, pequenos e seguros):
sql/reconcile_zapp_20261003272707.sql <- /home/joaquim_ataides/reconcile_zapp_20261003272707.sql (65.158 B)
sql/reconcile_zapp_20261003272707.v2.sql <- /home/joaquim_ataides/reconcile_zapp_20261003272707.v2.sql (65.831 B)
configs-logs/zapp-e2e-agente-t6d598fc3.config.ts <- /home/joaquim_ataides/zapp-e2e-agente-t6d598fc3.config.ts (940 B)
configs-logs/zapp-dev.log <- /home/joaquim_ataides/zapp-dev.log (0 B)
backups-bins/backups-agentes-2026-10-13-zapp-verify.bak <- /home/joaquim_ataides/backups-agentes-2026-10-13-zapp-verify.bak (15.180 B)
backups-bins/zapp-* (17 arquivos) <- /home/joaquim_ataides/backups-bin-2026-10-17/zapp-* (1-16 KB cada)
varredura-20261020/clones-zapp.json (43.137 B) <- /home/joaquim_ataides/backups/varredura-20261020/clones-zapp.json
varredura-20261020/raizes-zapp.txt (82 B) <- /home/joaquim_ataides/backups/varredura-20261020/raizes-zapp.txt
varredura-20261020/clone-Zapp_Web_V2.z (18.607.720 B) <- /home/joaquim_ataides/backups/varredura-20261020/status/clone-Zapp_Web_V2.z
zapp-importar-20261020/ (dir inteiro) <- /home/joaquim_ataides/backups/zapp-importar-20261020/
diversos/zapp-verify.log <- /home/joaquim_ataides/auditorias/ia-050-4xx-2610051828/zapp-verify.log
diversos/.tmp-zapp.db (1.867.776 B) <- /home/joaquim_ataides/.tmp-zapp.db
diversos/tl150-evidencia-zapp-verify-rapido.txt <- /home/joaquim_ataides/.tmp/tl150-evidencia-zapp-verify-rapido.txt
diversos/zapp-db-local-up.log <- /home/joaquim_ataides/.tmp/zapp-db-local-up.log

NAO MOVIDOS DE PROPOSITO (ponteiros abaixo, motivo negocio):
1. /home/joaquim_ataides/projetos/ZAPP WEB V2 - LOCAL - ARQUIVOS A PROCESSAR (7,1G, 592.751 arquivos) — gigante; 95% sao ~21 worktrees-checkouts duplicados + anexos. Duplicar para dentro do repo estoura disco e suja o git. Fica onde esta; triagem futura apaga worktrees velhas.
2. /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2 (55G, checkout principal + 167 worktrees) — E O PROPRIO PROJETO em uso pelos agentes; mover = quebrar 2325 worktrees. Intocavel.
3. /home/joaquim_ataides/teleport/Zapp_Web_V2, /home/joaquim_ataides/zapp-worktrees — espelhos de trabalho; mover quebra retomada.
4. /home/joaquim_ataides/.local/bin/zapp-* (18 ferramentas), .config/systemd/user/zapp-* (10 timers), .cache/zapp-* — toolchain viva; mover quebra verify/db/graph.
5. /home/joaquim_ataides/.secrets/zapp-* — segredos; nao copiar para repo.
6. /home/joaquim_ataides/arquitetura-v2/*zapp* (12), hermes-validacao/pr1572/*ZAPP* (11), projetos/mcp-clone-bwwbey/zapp_db.py, projetos/Evolution_Api_Stack/docs/BOUNDARY-zapp.md, hermes-workspaces/.decisoes/*zapp-verify*.md — pertencem a OUTROS projetos; mover = roubar arquivo alheio.
7. /home/joaquim_ataides/projetos/Zapp_Web_V3, ZAPP WEB V3 - LOCAL (3 arqs), pfv2-wt-p6 (cache vite) — V3 ou lixo, nao V2.
8. tars .tar.gz sem zapp no nome — fora do escopo pedido.
