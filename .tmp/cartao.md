Task t_f8b86210: feat(config): tela de preferências de alerta de conexão (push, e-mail, degradada, desconectada)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_f8b86210
  max-retries: 2 (default)
  created:   2026-10-13 08:53 by claude
  started:   2026-10-14 11:41

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
V3: `settings/ConnectionAlertPreferences.tsx` (tabela `connection_alert_preferences`: push, e-mail, alertar em degradada e em desconectada). V2: PD-38 criou só a tabela e `t_6bf2d93f` só o hook e o gate do banner; não há tela de edição. Leia esses dois cartões.

O QUE FAZER
1. Seção em Configurações com as quatro preferências por usuário, estado de salvando/erro, texto claro do que cada uma faz (e que o e-mail depende do PK-15); sem exportar nada; testes e captura.

ARQUIVOS QUE PODE TOCAR
- src/components/settings/ConnectionAlertPreferences.tsx (novo)
- testes

CRITÉRIO DE PRONTO
1. Usuário edita as quatro preferências.
2. `zapp-verify . --rapido` verde.


Latest summary:
Infra V2 congelada: ~/.local/libexec/hermes-guard/MODO_V2 não existe (só CONGELADO), então `hermes-tarefa-iniciar` retorna exit 75 "CONGELADO" e nenhum workspace novo abre desde ~10:45 (último .por-cartao é 10:39; o meu, t_f8b86210, não tem link). Sem workspace não há como editar src/components/settings/ConnectionAlertPreferences.tsx nem provar o critério de pronto. Não contornei a guarda (não criei workspace à mão). Decisão registrada: DECISAO_ID=20261014-114817-dd00-sem-tarefa — preciso que o MODO_V2 seja restaurado (ou instrução de como abrir o workspace deste cartão).

Comments (2):
  [2026-10-14 11:48] iris: Não consegui abrir workspace: a esteira V2 está travada por infraestrutura, não pelo cartão.

Provas (comandos rodados agora, 2026-10-14 ~11:45 BRT, workdir=/home/joaquim_ataides/projetos/Zapp_Web_V2):
- `hermes-tarefa-iniciar Zapp_Web_V2 alerta-conexao-prefs` -> exit 75, stderr: "CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2. Não tente contornar. Estacione: ... e pare." (rodei 2x, mesmo resultado)
- `test -e ~/.local/libexec/hermes-guard/MODO_V2` -> NAO existe; só existe CONGELADO. O script só bloqueia quando CONGELADO existe E MODO_V2 **não** existe (`~/.local/bin/hermes-tarefa-iniciar` linhas 5-10), logo a condição de congelamento está ativa.
- Último workspace criado em `~/hermes-workspaces/.por-cartao/` é de 10:39 de hoje; nenhum novo desde então. A pasta do guard teve mtime 10:45 (algo removido ali), o que bate com a esteira ter travado perto de 10:45.
- Não há link `~/hermes-workspaces/.por-cartao/t_f8b86210`, então não é caso de retentativa (REUSADO) — é criação nova, que é justamente o que o guard recusa.

Não criei workspace à mão (proibido pelo FLUXO/regras: nunca contornar guarda) e não escrevi arquivo de projeto fora de workspace. Decisão registrada para o Joaquim: `DECISAO_ID=20261014-114817-dd00-sem-tarefa`.

O cartão em si está OK (V2 não tem tela de edição; falta `src/components/settings/ConnectionAlertPreferences.tsx` + testes). Falta só a esteira voltar para eu abrir o workspace e implementar.
  [2026-10-15 14:11] default: UNBLOCK: desbloqueio em lote: estava preso por infra (MODO_V2 ausente na guarda, exit 75), flag reposta em 15/10

Events (52):
  [2026-10-15 19:06] [run 18667] heartbeat
  [2026-10-15 19:07] [run 18667] heartbeat
  [2026-10-15 19:08] [run 18667] heartbeat
  [2026-10-15 19:09] [run 18667] heartbeat
  [2026-10-15 19:10] [run 18667] heartbeat
  [2026-10-15 19:11] [run 18667] heartbeat
  [2026-10-15 19:12] [run 18667] heartbeat
  [2026-10-15 19:13] [run 18667] heartbeat
  [2026-10-15 19:15] [run 18667] heartbeat
  [2026-10-15 19:16] [run 18667] heartbeat
  [2026-10-15 19:17] [run 18667] heartbeat
  [2026-10-15 19:18] [run 18667] heartbeat
  [2026-10-15 19:19] [run 18667] heartbeat
  [2026-10-15 19:20] [run 18667] heartbeat
  [2026-10-15 19:21] [run 18667] heartbeat
  [2026-10-15 19:22] [run 18667] heartbeat
  [2026-10-15 19:23] [run 18667] heartbeat
  [2026-10-15 19:24] [run 18667] heartbeat
  [2026-10-15 19:25] [run 18667] heartbeat
  [2026-10-15 19:26] [run 18667] heartbeat

Runs (2):
  #16663 blocked      @iris  456s  2026-10-14 11:41
        → Infra V2 congelada: ~/.local/libexec/hermes-guard/MODO_V2 não existe (só CONGELADO), então `hermes-tarefa-iniciar` retorna exit 75 "CONGELADO" e nenhum workspac
  #18667 running      @iris  active  2026-10-15 18:50
