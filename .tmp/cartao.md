Task t_ad0693b5: feat(banco): gatilho genérico de auditoria de ações administrativas (perfil, config, agentes, rede) — retomar
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_ad0693b5
  max-retries: 2 (default)
  created:   2026-10-15 13:55 by claude
  started:   2026-10-15 13:55
  parents:   t_05242623, t_1279630d, t_64445237, t_694715fc

Body:
Especialista da área: workersql. Abra a skill de área do seu perfil ANTES de editar. A PRIMEIRA LINHA de `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem a palavra 'parcial'.

CONTEXTO (retomada): entrega anterior ficou parada na fila do integrador (estado 'falhou', junta limpa em dia/2026-10-14). MOTIVO REGISTRADO: 'a branch da tarefa andou depois do fechar'. O trabalho NÃO entrou e não pode se perder. Trabalho anterior: branch `v2/audit-admin-changes-261013012225d2` (commit 33598d96e); no workspace novo traga os commits com `git cherry-pick` e ajuste só o necessário. NÃO recomece do zero.

PASSO 0 — reproduzir e conferir estado atual: rode `zapp-verify full .` para reproduzir a falha. Antes de mexer, confira no código ATUAL (a branch do dia muda) se o defeito do pedido ainda existe; se já estiver corrigido, escreva isso em `.tmp/relato.md` com a prova e feche sem commit de código.

PROBLEMA (conferido no banco real): só existem gatilhos de auditoria para `user_roles`, `role_permissions`, `contacts` e `department_audit_logs`. Nada audita `profiles` (`is_active`, `access_level`, `max_chats`, `can_download`), `agent_visibility_grants`, `global_settings`, `ip_whitelist`, `blocked_ips`, `blocked_countries`, `geo_blocking_settings`, `rate_limit_configs`. `audit_logs` não aceita INSERT do cliente (correto), então a escrita tem de ser por gatilho/RPC.

O QUE FAZER:
1. Crie um gatilho genérico `audit_admin_change()` (SECURITY DEFINER, `search_path` fixo) que grava ator (`auth.uid()`), tabela, operação, id do alvo e SÓ os NOMES dos campos alterados (e valores não sensíveis). NUNCA grave segredos de `global_settings`, chaves, tokens, telefone ou e-mail.
2. Aplique-o às tabelas acima — confirme os nomes reais das tabelas no banco local antes. Em `profiles` audite somente mudança de `is_active`, `access_level`, `max_chats`, `can_download`.
3. Prova no banco LOCAL com o papel real (agent/anon/service_role): cada operação gera 1 registro; campo secreto nunca aparece; escrita por `service_role` registra ator nulo identificado como sistema. Mostre explicitamente o que passa e o que é negado.

ARQUIVOS QUE PODE TOCAR:
- `supabase/migrations/<ts>_audit_admin_changes.sql` (novo)
- `supabase/tests/` (atualize/crie testes dos arquivos que tocar e liste-os no relato)

REGRAS: sem dependência nova; migrations só ADITIVAS, com bloco `-- Rollback:` completo no topo, `SET search_path` e grants explícitos; NADA vai para produção (quem aplica é o Joaquim); texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa, exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador.

CRITÉRIO DE PRONTO: (1) todas as tabelas administrativas auditadas sem segredo; (2) prova no banco local com papéis reais; (3) `zapp-verify . --rapido` verde. O cartão compila e passa sozinho. Feche com hermes-tarefa-fechar.

Latest summary:
Infra: SSH do WSL (joaquim_ataides@localhost:2222) fora — todo terminal/read_file devolve 'SSH connection ... timed out' (5 sondagens nesta run). Sem sandbox não consigo editar .tmp/relato.md nem rodar hermes-tarefa-fechar. Nada de conteúdo falta: trabalho commitado na branch v2/audit-admin-changes-26101602537e84 (ponta 4832506662 = cherry-pick de 33598d96e, árvore limpa), provado com zapp-verify --rapido VERDE SEM BANCO e vermelho→verde no PG17 descartável com papéis reais. Retomar quando o SSH voltar: (1) rodar 'zapp-verify full .' e substituir o marcador RESULTADO_FULL da linha ~32 do relato pelo resultado real; (2) hermes-tarefa-fechar "feat(banco): audita acoes administrativas de perfil, config, agentes e rede" .tmp/relato.md. 4ª vez que este mesmo bloqueio de infra ocorre neste cartão.

Comments (8):
  [2026-10-15 13:57] workersql: BLOQUEIO DE INFRA (capability) — nenhum agente consegue abrir workspace agora. Nada foi alterado (zero diff).

Verificado no host em 15/10 13:57:
- `/home/joaquim_ataides/.local/libexec/hermes-guard/CONGELADO` PRESENTE (04/10 11:22);
- `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` AUSENTE;
- `hermes-tarefa-iniciar Zapp_Web_V2 audit-admin-changes` → `CONGELADO … exit 75` (o mesmo vale para `hermes-tarefa-fechar`, que checa a mesma flag).

Consequência: não abro workspace do cartão; o `git worktree` antigo (`…/Zapp_Web_V2/audit-admin-changes-261013012225d2`) pertence a OUTRA sessão e a guarda recusa operar nele. Reconstruir/liberar a guarda é ato do Joaquim — regras 07–08/10 proíbem o agente de mexer na guarda, então não contorno.

Já está escalado: decisão aberta `~/hermes-workspaces/.decisoes/20261015-104307-4eac-sem-tarefa.md` ("Restaurar a flag MODO_V2 … ou manter parado?") e precedentes idênticos t_800bb529 e t_239021b8 (coordenador manteve bloqueado). Não duplico a decisão.

Quando a flag voltar: o cartão pede reproduzir com `zapp-verify full .`, e o motivo do `falhou` é "a branch da tarefa andou depois do fechar" (HEAD `0b59f3dbc2` ≠ sha revisado `33598d96e`), então o serviço aqui é alinhar a branch ao commit revisado e fechar de novo — não refazer o trabalho.
  [2026-10-15 14:01] coordenador: Coordenador (sensor blk:t_ad0693b5): mantido bloqueado — infra/config, CONGELADO presente e MODO_V2 ausente (reconf. 15/10 14:01, exit 75 persiste). Reposição da flag é ato do Joaquim/Claude (guarda proibida a agentes, regras 07–08/10); já escalado em 20261015-104307-4eac-sem-tarefa.md. Sem unblock, sem substituto, zero diff. Quando destravar: reproduzir com `zapp-verify full .` e alinhar a branch ao commit revisado 33598d96e. Decisão: ~/.decisoes/2026-10-15-t_44df5cc8.md. Especialista: coordenador.
  [2026-10-15 14:16] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-16 03:18] workersql: worker (sql) — bloqueio de infraestrutura (transient).

Sintoma: o backend de terminal (SSH para o WSL, joaquim_ataides@localhost:2222) está fora. Todas as chamadas falham com `kex_exchange_identification: read: Connection reset by peer` / `Connection timed out during banner exchange` (Connection reset/timeout em ::1 porta 2222). As ferramentas read_file/search_files também respondem "Terminal environment unavailable".

Sequência: o `hermes-tarefa-iniciar Zapp_Web_V2 audit-admin-changes` estourou o timeout de 180s (exit 124) e, a partir daí, nenhuma conexão SSH completou (18 tentativas de probe com `echo`, workdirs `/tmp` e `$HOME`). Nenhum arquivo foi criado ou alterado; nenhum workspace ficou pronto para uso.

Ação: paro aqui e devolvo o cartão como bloqueio transitório (não é capacidade nem falta de informação de projeto). Quando o SSH do WSL voltar, basta re-rodar o cartão — o `hermes-tarefa-iniciar` deve reaproveitar/criar o workspace normalmente.
  [2026-10-16 13:26] workersql: **Estado no momento em que a infra caiu (SSH do WSL/2222 fora do ar).** Nada foi perdido: o trabalho está commitado na branch da tarefa.

Workspace: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/audit-admin-changes-26101602537e84`
Branch: `v2/audit-admin-changes-26101602537e84` — ponta `4832506662` = `git cherry-pick 33598d96e` (o commit revisado). Conteúdo idêntico: `git diff 33598d96e 4832506662 -- <os 2 arquivos>` vazio e `hash-object` da suíte = `0e6dc3f88cb45222fba131b7dd2eba514ef5bf1c` = `33598d96e:supabase/tests/audit_admin_changes.sql`. Árvore limpa (`git status --short` sem saída); o commit extra `0b59f3dbc2` (que fez a branch andar: `.test.sh` + ALLOWLIST em `scripts/ci/`) **não** foi trazido.

Já provado (comandos rodados):
- `zapp-verify . --rapido` → `OK dependencias/db_guard/tipos/lint/migrations`, `VERIFY: VERDE SEM BANCO`.
- PG17 descartável com a migration REAL + papéis reais: vermelho `-v sem_guarda=1` → `ERROR: FALHOU [T.1 oito gatilhos instalados]: esperado [8], obtido [0]` (rc=3); verde → `PASS: trilha das acoes administrativas … trilha a prova de forja.` (rc=0).
- Rollback executado de verdade: `PASS [RB.1 nenhum gatilho administrativo sobrou] -> 0`, `[RB.2 a funcao audit_admin_change sumiu] -> 0`, `[RB.3 a trilha ja gravada permanece] -> true`.
- Nomes reais conferidos em `supabase/schema-catalog.json` (9 tabelas + colunas citadas existem).

Falta (bloqueado pela queda do SSH, não por conteúdo):
1. `.tmp/relato.md` está escrito, mas a linha 32 tem o marcador `RESULTADO_FULL` — eu tinha o `zapp-verify full .` rodando (interrompido duas vezes pela carga/queda do WSL) e **não** vou declarar resultado que não vi. Quem retomar: troque a linha pelo `VERIFY:` real do full **ou** apague a linha antes de fechar.
2. `hermes-tarefa-fechar "feat(banco): audita acoes administrativas de perfil, config, agentes e rede" .tmp/relato.md`.

Nada mais a fazer no conteúdo: o defeito apontado era de processo (a branch andou depois do fechar), e a ponta da branch agora tem exatamente o sha revisado.
  [2026-10-16 13:27] auto-decomposer: Specified — updated title, body and promoted to todo.
  [2026-10-16 13:31] workersql: **worker (sql) — 4ª tentativa: SSH do WSL (localhost:2222) fora de novo.** Zero diff, nada tocado.

Sintoma (agora, run 19700): TODA chamada falha com `SSH connection to joaquim_ataides@localhost timed out` — `echo probe1`, `uname -a && whoami && pwd && date`, `pwd && ls -la` (workdirs `/tmp` e `$HOME`) e `read_file` do próprio `.tmp/relato.md` (5 sondagens). O backend de terminal está degradado, então não consigo nem "diagnosticar de dentro" (toda ferramenta passa pelo mesmo SSH). Não é falta de capacidade nem de informação de projeto.

**Onde a entrega está (inalterada):** o trabalho está commitado e provado, exatamente como registrado na tentativa anterior.
- Workspace: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/audit-admin-changes-26101602537e84`
- Branch: `v2/audit-admin-changes-26101602537e84` — ponta `4832506662` = `git cherry-pick 33598d96e` (o sha revisado). O commit extra `0b59f3dbc2` (que fez a branch andar: `.test.sh` + ALLOWLIST) NÃO foi trazido. Árvore limpa.
- Provas já rodadas: `zapp-verify . --rapido` → `VERDE SEM BANCO`; vermelho→verde no PG17 descartável com a migration REAL e papéis reais (`T.1 oito gatilhos` 0→8, rc 3→0); rollback executado (RB.1–RB.3); nomes reais conferidos no `schema-catalog.json`.

**Falta só (bloqueado pelo SSH, não por conteúdo):**
1. `.tmp/relato.md` linha ~32 ainda tem o marcador `RESULTADO_FULL` (o `zapp-verify full .` foi interrompido pela queda — não declaro resultado que não vi). Quem retomar: rodar `zapp-verify full .` e trocar a linha pelo `VERIFY:` real, ou apagar a linha.
2. `hermes-tarefa-fechar "feat(banco): audita acoes administrativas de perfil, config, agentes e rede" .tmp/relato.md`.

O defeito apontado no cartão era de processo ("a branch andou depois do fechar") e já está resolvido: a ponta da branch tem exatamente o sha revisado.
  [2026-10-16 13:31] auto-decomposer: Decomposed into t_64445237, t_05242623, t_694715fc, t_1279630d. Root will wake when all children complete.

Events (124):
  [2026-10-16 13:31] commented {'author': 'workersql', 'len': 1832}
  [2026-10-16 13:31] [run 19700] block_loop_detected {'reason': 'Infra: SSH do WSL (joaquim_ataides@localhost:2222) fora — todo terminal/read_file devolve \'SSH connection ... timed out\' (5 sondagens nesta run). Sem sandbox não consigo editar .tmp/relato.md nem rodar hermes-tarefa-fechar. Nada de conteúdo falta: trabalho commitado na branch v2/audit-admin-changes-26101602537e84 (ponta 4832506662 = cherry-pick de 33598d96e, árvore limpa), provado com zapp-verify --rapido VERDE SEM BANCO e vermelho→verde no PG17 descartável com papéis reais. Retomar quando o SSH voltar: (1) rodar \'zapp-verify full .\' e substituir o marcador RESULTADO_FULL da linha ~32 do relato pelo resultado real; (2) hermes-tarefa-fechar "feat(banco): audita acoes administrativas de perfil, config, agentes e rede" .tmp/relato.md. 4ª vez que este mesmo bloqueio de infra ocorre neste cartão.', 'kind': 'transient', 'recurrences': 3, 'source_status': 'ready', 'limit': 2}
  [2026-10-16 13:31] decomposed {'child_ids': ['t_64445237', 't_05242623', 't_694715fc', 't_1279630d'], 'root_assignee': 'workersql'}
  [2026-10-16 15:25] promoted
  [2026-10-16 15:25] [run 19825] claimed {'lock': 'Joaquim:25096', 'expires': 1792176043, 'run_id': 19825}
  [2026-10-16 15:25] [run 19825] spawned {'pid': 43640, 'started_at': '|179217514306'}
  [2026-10-16 15:25] [run 19825] heartbeat
  [2026-10-16 15:26] [run 19825] heartbeat
  [2026-10-16 15:28] [run 19825] heartbeat
  [2026-10-16 15:29] [run 19825] heartbeat
  [2026-10-16 15:30] [run 19825] heartbeat
  [2026-10-16 15:31] [run 19825] heartbeat
  [2026-10-16 15:32] [run 19825] heartbeat
  [2026-10-16 15:33] [run 19825] heartbeat
  [2026-10-16 15:34] [run 19825] heartbeat
  [2026-10-16 15:35] [run 19825] heartbeat
  [2026-10-16 15:36] [run 19825] heartbeat
  [2026-10-16 15:37] [run 19825] heartbeat
  [2026-10-16 15:38] [run 19825] heartbeat
  [2026-10-16 15:39] [run 19825] heartbeat

Runs (5):
  #18408 blocked      @workersql  151s  2026-10-15 13:55
        → Infra da guarda congelada: MODO_V2 AUSENTE em ~/.local/libexec/hermes-guard (só CONGELADO presente), então `hermes-tarefa-iniciar` sai com `CONGELADO … exit 75`
  #19326 blocked      @workersql  1613s  2026-10-16 02:52
        → Backend SSH do WSL (localhost:2222) fora: toda chamada de terminal/leitura responde "Connection reset by peer"/"banner exchange timed out". Nenhum trabalho pôde
  #19666 blocked      @workersql  2971s  2026-10-16 12:37
        → SSH do WSL (localhost:2222) caiu no meio do cartão: `kex_exchange_identification: Connection reset by peer` e, depois, timeout no banner; `terminal` e `read_fil
  #19700 blocked      @workersql  254s  2026-10-16 13:27
        → Infra: SSH do WSL (joaquim_ataides@localhost:2222) fora — todo terminal/read_file devolve 'SSH connection ... timed out' (5 sondagens nesta run). Sem sandbox nã
  #19825 running      @workersql  active  2026-10-16 15:25
