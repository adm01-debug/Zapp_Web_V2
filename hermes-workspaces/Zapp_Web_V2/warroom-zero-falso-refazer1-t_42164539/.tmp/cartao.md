Task t_19cec878: fix(warroom): War Room mostra '—' sem dado, estados de carregando/erro/vazio e atualização de verdade
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_19cec878
  max-retries: 2 (default)
  created:   2026-10-12 09:52 by claude
  started:   2026-10-13 00:19
  parents:   t_80beb875

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs 02-features-batch1 e 03-features-batch2 (plano em `docs/plans/PLANO_PARIDADE_V3_BATCH1_BATCH2_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-b1b2/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
`WarRoomAgentCard.tsx:47-48` mostra 'Resp. 0s' e 'Hoje {total vitalício}'; 'Auto-atualizar' só troca o carimbo (não liga/desliga as consultas); não há botão 'Atualizar agora'; as consultas têm default `[]` e erro engolido.

O QUE FAZER
1. Mostre '—' quando o dado for null e rotule 'Hoje' apenas com dado do dia; satisfação sem amostra = '—'.
2. Estados de carregando (skeleton), erro (com 'Tentar de novo') e vazio ('Nenhum agente ativo'); 'Atualizado' reflete `dataUpdatedAt`.
3. 'Auto-atualizar' liga/desliga o `refetchInterval` de verdade e há 'Atualizar agora'. Só tokens de cor do sistema; teste visual claro/escuro.

ARQUIVOS QUE PODE TOCAR
- src/components/dashboard/war-room/WarRoomAgentCard.tsx
- src/components/dashboard/war-room/WarRoomDashboard.tsx
- testes

CRITÉRIO DE PRONTO
1. Nenhum zero falso na tela.
2. Estados de carregando, erro e vazio.
3. Atualização manual e automática funcionam.
4. `zapp-verify . --rapido` verde.


Comments (2):
  [2026-10-12 10:49] default: [claude] ACRESCENTAR (auditoria 12/10, doc 16): os botões só de ícone da War Room (som, auto-atualizar, tela cheia, dispensar alerta) não têm nome acessível (grep aria-label em war-room/*: 0; a V3 tem os quatro); os cartões Agente/Fila clicáveis não fazem nada e não são acessíveis por teclado; tela cheia deve acompanhar o Esc.
  [2026-10-13 00:33] iris: Achados fora do escopo deste cartão (não corrigidos aqui — só os arquivos do cartão eram meus):

1. `src/components/dashboard/war-room/WarRoomQueueRow.tsx` — o cartão de fila é `motion.div onClick` sem `role`/`tabIndex`/teclado. É o outro "cartão clicável" citado no comentário de acessibilidade, mas ficou fora da minha lista de arquivos; precisa do mesmo tratamento que dei ao `WarRoomAgentCard` (worker (telas)).
2. `src/components/dashboard/war-room/WarRoomAlertRow.tsx` — botão de dispensar alerta (`size="icon"`) sem `aria-label`. Mesmo caso: fora da lista de arquivos do cartão.
3. `Hoje` no card de agente continua numérico: `resolvedToday` já é escopado no dia pela RPC do cartão anterior (migration 20261012225242 — `conversation_closures` DISTINCT por contato do dia) e o tipo no hook é `number`, sem caminho `null`. Mostrar `—` para "sem dado do dia" exigiria mudar `useWarRoomData` (worker (hooks)); a tela está pronta para isso se o tipo passar a `number | null`.
4. O caminho do dashboard no corpo do cartão (`src/components/dashboard/war-room/WarRoomDashboard.tsx`) não existe: o arquivo real é `src/components/dashboard/WarRoomDashboard.tsx` (só os subcomponentes moram em `war-room/`). Toquei o arquivo real.

Events (24):
  [2026-10-12 20:44] reprioritized {'priority': 5}
  [2026-10-13 00:19] [run 11827] claimed {'lock': 'Joaquim:32040', 'expires': 1791862480, 'run_id': 11827}
  [2026-10-13 00:19] [run 11827] spawned {'pid': 21088, 'started_at': '|179186158099'}
  [2026-10-13 00:19] [run 11827] heartbeat
  [2026-10-13 00:20] [run 11827] heartbeat
  [2026-10-13 00:21] [run 11827] heartbeat
  [2026-10-13 00:22] [run 11827] heartbeat
  [2026-10-13 00:23] [run 11827] heartbeat
  [2026-10-13 00:24] [run 11827] heartbeat
  [2026-10-13 00:25] [run 11827] heartbeat
  [2026-10-13 00:26] [run 11827] heartbeat
  [2026-10-13 00:27] [run 11827] heartbeat
  [2026-10-13 00:29] [run 11827] heartbeat
  [2026-10-13 00:30] [run 11827] heartbeat
  [2026-10-13 00:31] [run 11827] heartbeat
  [2026-10-13 00:32] [run 11827] heartbeat
  [2026-10-13 00:33] [run 11827] heartbeat
  [2026-10-13 00:33] commented {'author': 'iris', 'len': 1226}
  [2026-10-13 00:34] [run 11827] heartbeat
  [2026-10-13 00:35] [run 11827] heartbeat

Runs (1):
  #11827 running      @iris  active  2026-10-13 00:19
