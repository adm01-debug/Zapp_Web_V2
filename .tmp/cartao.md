Task t_a93514fd: [refazer 1] feat(alertas): alertas de crise tocam e avisam em qualquer tela para quem é da supervisão, não só com a War
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a93514fd
  max-retries: 2 (default)
  created:   2026-10-15 20:43 by user
  started:   2026-10-16 03:28

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: O código está no escopo (App.tsx é o shell que o cartão manda usar), mas o ouvinte global ignora o mudo do painel da War Room. Como ele se registra antes e vence a reivindicação por alerta, o som toca mesmo com o painel mudo, o que é regressão em relação ao comportamento anterior.

O QUE CORRIGIR: 1) Faça o mudo explícito da War Room (o argumento `soundEnabled` de `useWarRoomAlerts(soundEnabled)`) valer também quando o ouvinte global vencer a disputa. Opções: o ouvinte global não tocar som enquanto a War Room estiver montada e a própria tela anunciar, ou o estado de mudo ser compartilhado com o ouvinte global (módulo ou contexto). Hoje o global usa só `settings.soundEnabled`, e o som e o aviso de desktop podem sair pelo global mesmo com o painel mudo. 2) Adicione um teste com o ouvinte global e `useWarRoomAlerts(false)` montados juntos, recebendo o mesmo INSERT: não deve tocar som, e o toast deve sair uma única vez. O teste atual de 'sem duplicar dentro da War Room' chama `announceWarRoomAlert` direto e não exercita o hook da tela. 3) Confirme no relato que a perda do aviso de desktop com `requireInteraction` para alertas críticos (antes via `showNotification` do push) é intencional, ou preserve esse comportamento.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/alertas-crise-globais-supervisao-2610151938847c` (commit 2273c6444) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
SSH do WSL (localhost:2222) com timeout — terminal e leitura de arquivos indisponíveis; nenhum código alterado

Comments (3):
  [2026-10-15 20:48] default: [jev-entrada] pré-filtro de ação externa: \bpush\b → RETIDO (pede ação fora do repositório local)
  [2026-10-15 20:49] default: [revisor-entrada] [jev-entrada] claude liberou → semisenior: O cartão pede apenas corrigir código e testes de hooks no repositório local (src/hooks, shell do app), sem tocar no ferramental da fábrica nem em ações externas; envolve segurança de papéis (supervisão vs. agente) e deduplicação entre abas, então exige perfil complexo.
  [2026-10-16 03:30] semisenior: semisenior: não consegui iniciar o refazer — backend SSH do terminal (joaquim_ataides@localhost:2222) com timeout em todas as tentativas (terminal + read_file). Não toquei em código nem cherry-pick. Li o cartão: 3 pontos da recusa numerados (mudo da War Room valer no global, teste global+useWarRoomAlerts(false) juntos, requireInteraction). Devolvo para nova tentativa quando o WSL/SSH voltar.

Events (25):
  [2026-10-16 03:28] [run 19507] claimed {'lock': 'Joaquim:38172', 'expires': 1792133036, 'run_id': 19507}
  [2026-10-16 03:28] [run 19507] spawned {'pid': 21748, 'started_at': '|179213213681'}
  [2026-10-16 03:29] [run 19507] heartbeat
  [2026-10-16 03:30] [run 19507] heartbeat
  [2026-10-16 03:30] commented {'author': 'semisenior', 'len': 394}
  [2026-10-16 03:30] [run 19507] blocked {'reason': 'SSH do WSL (localhost:2222) com timeout — terminal e leitura de arquivos indisponíveis; nenhum código alterado', 'kind': 'transient', 'recurrences': 1, 'source_status': 'ready'}
  [2026-10-16 07:27] unblocked
  [2026-10-16 14:55] [run 19803] claimed {'lock': 'Joaquim:25096', 'expires': 1792174241, 'run_id': 19803}
  [2026-10-16 14:55] [run 19803] spawned {'pid': 40912, 'started_at': '|179217334184'}
  [2026-10-16 14:55] [run 19803] heartbeat
  [2026-10-16 14:56] [run 19803] heartbeat
  [2026-10-16 14:57] [run 19803] heartbeat
  [2026-10-16 14:59] [run 19803] heartbeat
  [2026-10-16 15:00] [run 19803] heartbeat
  [2026-10-16 15:01] [run 19803] heartbeat
  [2026-10-16 15:02] [run 19803] heartbeat
  [2026-10-16 15:03] [run 19803] heartbeat
  [2026-10-16 15:04] [run 19803] heartbeat
  [2026-10-16 15:05] [run 19803] heartbeat
  [2026-10-16 15:06] [run 19803] heartbeat

Runs (2):
  #19507 blocked      @semisenior  108s  2026-10-16 03:28
        → SSH do WSL (localhost:2222) com timeout — terminal e leitura de arquivos indisponíveis; nenhum código alterado
  #19803 running      @semisenior  active  2026-10-16 14:55
