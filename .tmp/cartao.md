Task t_309e6d1e: feat(admin): tela 'Tarefas agendadas' para ver e pausar os agendadores do banco
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_309e6d1e
  max-retries: 2 (default)
  created:   2026-10-13 08:58 by claude
  started:   2026-10-14 11:49
  parents:   t_ac2fa555

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/24-hooks-raiz-2.md (hooks da raiz de src/hooks: contato, dashboard, e-mail/Gmail, Evolution, APIs externas, grupos, metas) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_RAIZ2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
V3: `CronSchedulerPage` + `useCronScheduler` (listar jobs, pausar/ativar). V2: o CR1 cria só as funções de banco (`admin_list_cron_jobs`, `admin_toggle_cron_job`, lista permitida) e NÃO tem cartão de tela. Depende do CR1.

O QUE FAZER
1. Aba 'Tarefas agendadas' em Admin (só admin): nome, agenda, ativo, última execução e resultado; alternar com confirmação e auditoria; NUNCA exiba o texto do comando SQL.
2. Estados de carregando/vazio/erro; teste.

ARQUIVOS QUE PODE TOCAR
- src/components/admin/ (novo componente da aba e o registro da aba)
- testes correspondentes

CRITÉRIO DE PRONTO
1. Admin vê e alterna um job; agente não vê a aba (teste).
2. `zapp-verify . --rapido` verde.


Latest summary:
Fábrica congelada pelo guard: `hermes-tarefa-iniciar` sai exit 75/CONGELADO porque `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` foi removido em 14/10 10:45 (nenhum workspace novo desde 10:39; o deste cartão não existe). Sem workspace não há como editar src/components/admin/, comitar nem rodar hermes-tarefa-fechar. Restaurar o MODO_V2 é ação do Joaquim/Claude — não contornei o guard. Decisão registrada: 20261014-115910-2d45 (duplicata de 20261014-111329-2607, sem resposta).

Comments (2):
  [2026-10-14 11:59] iris: Bloqueio de guarda — fábrica congelada (nada foi contornado)

Comando: `hermes-tarefa-iniciar Zapp_Web_V2 admin-tarefas-agendadas` (workdir /home/joaquim_ataides/projetos/Zapp_Web_V2)
Saída: exit 75 — `CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2. Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.`

Causa apurada (somente leitura, nada alterado):
- O marcador `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` não existe (`CONGELADO` existe, de 04/10 11:22). As guardas `hermes-tarefa-iniciar` (linhas 5-10) e `hermes-tarefa-fechar` (linhas 5-8) só liberam o ciclo local quando MODO_V2 está presente.
- `~/.local/libexec/hermes-guard/` foi modificado em 14/10 10:45; o último workspace criado por qualquer agente é de 14/10 10:39 (`ia-janela-limitada-422-periodo-2610141039aa5e`). Nenhum workspace novo desde então.
- Este cartão não tem workspace: `~/hermes-workspaces/.por-cartao/t_309e6d1e` não existe.
- Não recriei o MODO_V2, não toquei no guard e não usei atalho nenhum.

Efeito no cartão: sem workspace não há onde editar `src/components/admin/`, comitar, nem rodar `hermes-tarefa-fechar` (mesma guarda). O cartão está pronto para executar — dependência do pai `t_ac2fa555` @ d2f008acc, a trazer por cherry-pick conforme o corpo — falta só a fábrica liberar.

Já registrado por outros agentes: decisão `20261014-111329-2607` (11:13, "MODO_V2 sumiu … restaurar ou manter o congelamento?"), com 3 duplicatas em 11:13-11:14, sem resposta até agora.
  [2026-10-15 14:11] default: UNBLOCK: desbloqueio em lote: estava preso por infra (MODO_V2 ausente na guarda, exit 75), flag reposta em 15/10

Events (50):
  [2026-10-15 20:45] [run 18713] heartbeat
  [2026-10-15 20:46] [run 18713] heartbeat
  [2026-10-15 20:47] [run 18713] heartbeat
  [2026-10-15 20:48] [run 18713] heartbeat
  [2026-10-15 20:49] [run 18713] heartbeat
  [2026-10-15 20:50] [run 18713] heartbeat
  [2026-10-15 20:51] [run 18713] heartbeat
  [2026-10-15 20:52] [run 18713] heartbeat
  [2026-10-15 20:53] [run 18713] heartbeat
  [2026-10-15 20:54] [run 18713] heartbeat
  [2026-10-15 20:55] [run 18713] heartbeat
  [2026-10-15 20:56] [run 18713] heartbeat
  [2026-10-15 20:57] [run 18713] heartbeat
  [2026-10-15 20:58] [run 18713] heartbeat
  [2026-10-15 21:00] [run 18713] heartbeat
  [2026-10-15 21:01] [run 18713] heartbeat
  [2026-10-15 21:02] [run 18713] heartbeat
  [2026-10-15 21:03] [run 18713] heartbeat
  [2026-10-15 21:04] [run 18713] heartbeat
  [2026-10-15 21:05] [run 18713] heartbeat

Runs (2):
  #16697 blocked      @iris  604s  2026-10-14 11:49
        → Fábrica congelada pelo guard: `hermes-tarefa-iniciar` sai exit 75/CONGELADO porque `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` foi removido em 1
  #18713 running      @iris  active  2026-10-15 20:33
