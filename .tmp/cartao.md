Task t_edfa367b: feat(alertas): alertas de crise tocam e avisam em qualquer tela para quem é da supervisão, não só com a War Room aberta
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_edfa367b
  max-retries: 2 (default)
  created:   2026-10-13 08:53 by claude
  started:   2026-10-13 17:37

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/16-components-connections-dashboard.md` (telas de conexões e dashboard). Plano e relatórios: `~/arquitetura-v2/paridade-16/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-16/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

COORDENAÇÃO: PK-09 (avisos globais de mensagem), PK-10 (aba líder), PF-01..03 e GL5: reaproveite a infraestrutura.

PROBLEMA (evidência conferida)
`useWarRoomAlerts` só é usado em `WarRoomDashboard.tsx:43`: som e push de alerta só funcionam com a War Room aberta. O monitor de SLA roda no navegador e olha todo o histórico de violações, não o ciclo atual. NOTA: a leitura de que `warroom_alerts` não está na publicação Realtime foi CONFERIDA e é falsa (a migration `20260828190000_realtime_publish_subscribed_tables.sql` a re-adiciona). PF-01/PF-02 (Sala de Crise) e GL5 tratam parte do assunto: leia-os e não duplique.

O QUE FAZER
1. Monte um ouvinte global (junto ao shell do app, no mesmo lugar do hook global de avisos do PK-09) só para admin/supervisor, que assina INSERT de `warroom_alerts` e dispara som/notificação/toast reaproveitando a infraestrutura de avisos; uma vez por alerta, em uma só aba (líder).
2. O monitor de SLA considera só violações do ciclo atual.
3. Respeite horário silencioso e a preferência de som; clique leva à War Room.
4. Testes de hook: staff recebe fora da War Room; agente não; sem duplicar dentro da War Room.

ARQUIVOS QUE PODE TOCAR
- src/hooks/ (useWarRoomAlerts e hook global novo)
- shell do app (provedor global)
- testes

CRITÉRIO DE PRONTO
1. Supervisão é avisada em qualquer tela.
2. Agente comum não recebe.
3. Sem duplicar.
4. `zapp-verify . --rapido` verde.


Latest summary:
Fábrica V2 congelada: `hermes-tarefa-iniciar` sai exit 75 (CONGELADO) porque o marcador `~/.local/libexec/hermes-guard/MODO_V2` sumiu (pasta das guardas com mtime 14/10 10:45; nenhum workspace novo desde 10:39 — afeta todos os cartões). Sem ele não abro workspace e `hermes-tarefa-fechar` usa o mesmo portão. Não contornei (não recriei o marcador). Já existem decisões abertas 20261014-111329-2607 / 20261014-114134-9a39 e o sensor do coordenador (2026-10-14-t_3310a016) decidiu manter bloqueado. Falta o Joaquim/Claude repor o MODO_V2 (ou dizer que o congelamento é intencional). Detalhes e evidência no comentário do cartão.

Comments (2):
  [2026-10-14 11:43] hugo: Especialista: hugo (area-front-hooks) — cartão NÃO iniciado: a fábrica V2 está congelada por marcador de guarda ausente.

SINTOMA (verificado agora, 14/10 11:43)
`hermes-tarefa-iniciar Zapp_Web_V2 alertas-crise-globais-supervisao` (workdir=/home/joaquim_ataides/projetos/Zapp_Web_V2) sai com **exit 75** e a mensagem `CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2... estacione e pare.` Nenhum workspace foi criado: `~/hermes-workspaces/.por-cartao/t_edfa367b` não existe.

CAUSA APURADA (somente leitura)
- `hermes-tarefa-iniciar` (topo do script) exige o marcador `~/.local/libexec/hermes-guard/MODO_V2` presente; sem ele cai no ramo CONGELADO.
- `ls ~/.local/libexec/hermes-guard/MODO_V2` → *No such file or directory*. Só existe `CONGELADO` (04/10). A pasta das guardas tem mtime 14/10 10:45; o último workspace de qualquer agente nasceu 10:39 — a fábrica inteira parou nesse ponto, não só este cartão.
- `hermes-tarefa-fechar` usa o MESMO portão: mesmo que eu editasse arquivos, não conseguiria fechar o cartão.

NÃO CONTORNEI: não recriei o MODO_V2 (área de guarda, fora do que agente escreve), não usei `git worktree` nem qualquer caminho alternativo de workspace.

JÁ REGISTRADO: decisões 20261014-111329-2607 e 20261014-114134-9a39 (sem-tarefa), e o sensor do coordenador (2026-10-14-t_3310a016.md) decidiu "manter bloqueado; falta decisão do Joaquim/Claude sobre repor o MODO_V2". Não abro pedido duplicado.

O cartão em si está pronto para executar quando o marcador voltar: o PROBLEMA e o O QUE FAZER (ouvinte global só admin/supervisor para INSERT de `warroom_alerts`, aba única, respeito a silencioso/som, monitor de SLA só do ciclo atual, 4 testes de hook) estão claros e os arquivos são todos da minha área (src/hooks/**).

PONTO DO DISPATCHER: o exit 75 aqui é o CONGELADO, mas o dispatcher rotula como "rate-limited (quota wall)" (as 3 tentativas de 13/10 e a de hoje). Vale conferir se parte dessas mortes era este bloqueio e não cota do provedor.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (73):
  [2026-10-15 20:08] [run 18681] heartbeat
  [2026-10-15 20:09] [run 18681] heartbeat
  [2026-10-15 20:10] [run 18681] heartbeat
  [2026-10-15 20:11] [run 18681] heartbeat
  [2026-10-15 20:12] [run 18681] heartbeat
  [2026-10-15 20:13] [run 18681] heartbeat
  [2026-10-15 20:14] [run 18681] heartbeat
  [2026-10-15 20:15] [run 18681] heartbeat
  [2026-10-15 20:16] [run 18681] heartbeat
  [2026-10-15 20:17] [run 18681] heartbeat
  [2026-10-15 20:18] [run 18681] heartbeat
  [2026-10-15 20:19] [run 18681] heartbeat
  [2026-10-15 20:20] [run 18681] heartbeat
  [2026-10-15 20:21] [run 18681] heartbeat
  [2026-10-15 20:22] [run 18681] heartbeat
  [2026-10-15 20:23] [run 18681] heartbeat
  [2026-10-15 20:24] [run 18681] heartbeat
  [2026-10-15 20:25] [run 18681] heartbeat
  [2026-10-15 20:27] [run 18681] heartbeat
  [2026-10-15 20:28] [run 18681] heartbeat

Runs (5):
  #14538 rate_limited @hugo  44s  2026-10-13 17:37
        ! pid 32832 exited rate-limited (quota wall) — requeued without counting a failure
  #15047 rate_limited @hugo  70s  2026-10-13 17:53
        ! pid 16144 exited rate-limited (quota wall) — requeued without counting a failure
  #15719 rate_limited @hugo  44s  2026-10-13 18:16
        ! pid 43820 exited rate-limited (quota wall) — requeued without counting a failure
  #16670 blocked      @hugo  103s  2026-10-14 11:42
        → Fábrica V2 congelada: `hermes-tarefa-iniciar` sai exit 75 (CONGELADO) porque o marcador `~/.local/libexec/hermes-guard/MODO_V2` sumiu (pasta das guardas com mti
  #18681 running      @hugo  active  2026-10-15 19:38
