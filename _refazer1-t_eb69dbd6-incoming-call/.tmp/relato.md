Especialista: senior (area-sql-banco)
## O que mudou e por quê
- supabase/migrations/20261014101033_incoming_call_destinatarios_sem_responsavel.sql: seleção de destinatários remontada POR CHAMADA num CASE (responsável ONLINE > fila ONLINE > supervisão ONLINE); ausência de linha em agent_presence conta como OFFLINE via COALESCE; array_agg sem linha volta NULL e fila sem ninguém ONLINE tenta a supervisão; duplicate = evento-já-visto OU notify-pedido-sem-criação (flag v_notification_section_entered). Teto de 25/chamada e ACL service_role-only mantidos.
- supabase/tests/incoming_call_destinatarios_evento_sem_responsavel.sql: volta à versão do trabalho (T1–T9, T9 com 30 membros) + bloco T10 (responsável sem linha em agent_presence cai na fila ONLINE). Descarta: migration refazer-1 20261015015830, T9-500 membros, asserção duplicate do T5 e blocos T11/T12.
## Prova (banco local v2-t-eb69dbd6, SQL real, sem mock)
- verde depois: `zapp-db-local psql . v2-t-eb69dbd6 < supabase/tests/incoming_call_destinatarios_evento_sem_responsavel.sql` → `NOTICE: TODOS OS BLOCOS PASSARAM` (T1–T10, ROLLBACK no fim)
- Ponto 1, vermelho antes (rollback executado: 20261002531230 + 20261004172554; função sem flag nem fan-out, ACL anon=f/service_role=t): sonda T10 → `ERROR: T10probe FALHOU: o responsavel SEM presenca recebeu 1 notificacao(oes)`; verde depois (minha migration): → `NOTICE: T10probe PASSOU`
- Ponto 2, vermelho antes (migration do trabalho): sonda dup → `ERROR: deltaT5 FALHOU: notify-pedido-sem-criacao deveria voltar duplicate=true (veio f)`; verde depois: → `NOTICE: deltaT5 PASSOU (duplicate=true, zero notificacoes)` + `NOTICE: casoA PASSOU (duplicate=true, nada duplicado)` + `NOTICE: casoB PASSOU (duplicate=false, chamada gravada, zero notificacoes)`
- Rollback provado por execução: reapliquei T26+fecha (estado voltou: tem_flag=f, tem_fanout=f) e depois a migration deste refazer (suíte verde acima). O `-- Rollback:` do arquivo continua válido (recria a versão 20261002531230 + ACL).
- Chamador: `supabase/functions/_shared/evolution-webhook-handlers.ts` ignora as colunas de retorno (lê só `error`); assinatura e colunas não mudaram — nenhum fluxo ao lado muda.
## Pontos da recusa
- Ponto 1 (T10, presença ausente): resolvido — CASE por chamada + COALESCE (ausência=offline) em supabase/migrations/20261014101033_incoming_call_destinatarios_sem_responsavel.sql; T10 mantido como regression test (usa presença estável própria: fila1/fila2 online fixos + responsável local sem linha; não depende de flips de outros blocos; caminho fila nunca consulta supervisão). Morto-vivo não reintroduzido: nada é lido fora da chamada, a decisão é remontada a cada execução, e a ausência vira 'offline' sem precisar de IF externo.
- Ponto 2 (T11, duplicate): resolvido na migration (fórmula evento-já-visto OU notify-pedido-sem-criação). AMARELO: a recusa pedia duplicate=false na re-chamada sem notify (caso A) e duplicate=true na answered nova (caso B) — ambos invertem "já visto": caso A o evento FOI visto (duplicate=true, sondado), caso B o evento é NOVO e nada há a deduplicar (duplicate=false, sondado). Blocos T11/T12 descartados do teste; cenários garantidos pelas sondas casoA/casoB acima.
- Ponto 3 (T12, fan-out): sem agregação global; teto de 25/chamada mantido; teste continua com 30 membros (T9 verde na suíte).
- Teste T11/T12: blocos descartados (codificavam a semântica invertida da recusa); cenários verificados via sondas casoA/casoB na migration final.
## O que NÃO fiz e por quê
- Não criei migration nova: o cartão manda alterar SÓ a migration 20261014101033 (ainda não integrada); a refazer-1 20261015015830 foi descartada (não está na entrega — o integrador deve removê-la da branch).
- Não mantive T9-500, asserção duplicate do T5 nem T11/T12: ordem do cartão (descartar mudanças T11/T12 do teste).
- Sem commit/fechar: `hermes-tarefa-iniciar`, `hermes-tarefa-fechar` e `hermes-db-migrar` estão congelados (mensagem CONGELADO); trabalhei em _refazer1-t_eb69dbd6-incoming-call e entrego ENTREGA.patch + RELATO.md.
## FAIXA DO PAI
- Base: branch v2/incoming-call-destinatarios-sem-responsa-26101407060c75 em 48046bc5a (trabalho do cartão t_d33b0511: commits d18a4927be + fbd3502766) — arquivos trazidos de lá e alterados só nos pontos acima; nada de outro cartão no diff.
## Arquivos da entrega
- supabase/migrations/20261014101033_incoming_call_destinatarios_sem_responsavel.sql (300 linhas)
- supabase/tests/incoming_call_destinatarios_evento_sem_responsavel.sql (386 linhas, T1–T10)
