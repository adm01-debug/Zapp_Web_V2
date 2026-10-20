Task t_dbddd822: fix(crm): Avançar etapa do negócio registra o log para qualquer agente e avisa quando falha
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_dbddd822
  max-retries: 2 (default)
  created:   2026-10-12 09:51 by claude
  started:   2026-10-12 19:25

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs 02-features-batch1 e 03-features-batch2 (plano em `docs/plans/PLANO_PARIDADE_V3_BATCH1_BATCH2_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-b1b2/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`useAdvanceDealStage` (`src/hooks/crm/useContactCrm360.ts:241-258`) faz UPDATE em `sales_deals` e INSERT em `deal_activities` SEM `performed_by` e sem olhar o erro. No banco real a política de INSERT é `performed_by IN (perfil do usuário) OR is_admin_or_supervisor`: para agente comum o INSERT é negado e o deal avança SEM histórico, em silêncio. Os cartões SEC-Y25-01 (`t_bf660f7e`, `t_bc466fa1`) apertam essa mesma política e QUEBRARIAM o avanço se o hook não for corrigido junto. Também: o hook seleciona `is_active` dos estágios e não filtra (pode cair em estágio inativo) e detecta 'Propostas' por `name.includes('propost')`.

O QUE FAZER
1. Envie `performed_by` (id do perfil do usuário logado) no INSERT; confira o `error` do INSERT e, se falhar, mostre toast de erro e logue sem dado pessoal; adicione `onError` na mutação com toast; ignore a chamada se o `stage_id` já for o destino.
2. Filtre estágios por `is_active` ao calcular o próximo; troque o heurístico 'propost' por campo/constante explícita ou deixe de depender do nome (documente a escolha no relato).
3. Confira o estado de `t_bf660f7e` e `t_bc466fa1` (quadro e fila): seu hook deve funcionar com a política atual E com a apertada (INSERT só do `deal_id` do próprio agente).
4. Testes: agente comum move deal próprio e o log aparece; erro do INSERT aparece ao usuário; estágio igual não dispara nada; estágio inativo é pulado.

ARQUIVOS QUE PODE TOCAR
- src/hooks/crm/useContactCrm360.ts
- src/components/inbox/tabs/Crm360Tab.tsx (só o que o toast exigir)
- testes desses arquivos

CRITÉRIO DE PRONTO
1. Avanço registra `performed_by` e nunca falha em silêncio.
2. Testes dos 4 casos.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-12 19:34] hugo: hotspot/achado fora de escopo: src/components/inbox/tabs/Crm360Tab.tsx — o stepper `crm360.stages.map` (l.141) ainda lista etapas com `is_active === false` como chips; este cartão só pediu filtrar no cálculo do PRÓXIMO estágio, então não mexi.

Events (27):
  [2026-10-12 15:42] reprioritized {'priority': 5}
  [2026-10-12 18:02] assigned {'assignee': 'worker', 'from': 'hugo'}
  [2026-10-12 18:02] reprioritized {'priority': 9}
  [2026-10-12 18:03] reprioritized {'priority': 1}
  [2026-10-12 18:39] reprioritized {'priority': 9}
  [2026-10-12 19:03] assigned {'assignee': 'hugo', 'from': 'worker'}
  [2026-10-12 19:25] [run 11302] claimed {'lock': 'Joaquim:13636', 'expires': 1791844826, 'run_id': 11302}
  [2026-10-12 19:25] [run 11302] spawned {'pid': 9220, 'started_at': '|179184392636'}
  [2026-10-12 19:25] [run 11302] heartbeat
  [2026-10-12 19:26] [run 11302] heartbeat
  [2026-10-12 19:27] [run 11302] heartbeat
  [2026-10-12 19:28] [run 11302] heartbeat
  [2026-10-12 19:29] [run 11302] heartbeat
  [2026-10-12 19:30] [run 11302] heartbeat
  [2026-10-12 19:31] [run 11302] heartbeat
  [2026-10-12 19:32] [run 11302] heartbeat
  [2026-10-12 19:33] [run 11302] heartbeat
  [2026-10-12 19:34] commented {'author': 'hugo', 'len': 243}
  [2026-10-12 19:34] [run 11302] heartbeat
  [2026-10-12 19:35] [run 11302] heartbeat

Runs (1):
  #11302 running      @hugo  active  2026-10-12 19:25
