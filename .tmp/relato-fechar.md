Especialista: edgar
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 596s;OK lint 5s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (15/10 19:50, gerados por máquina: valem mais que números escritos à mão)
```
 ....test.ts => evolution-webhook-messages.test.ts} | 266 +++++++++++----------
 .../_shared/evolution-webhook-messages.ts          | 120 ++++++----
 2 files changed, 216 insertions(+), 170 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/functions/_shared/evolution-webhook-messages.ts; padrão sensível: caminho:supabase/functions/_share, padrão:auth\.(uid|role)\(\), padrão:service_role|SERVICE


## Sensibilidade
- Toca `service_role` (o webhook roda com a service key) e RPCs de escrita. Nenhuma proteção afrouxada: o
  caminho NEGADO tem teste próprio (decisão indisponível/`NULL`, conversa com atendente, conexão sem dono
  ou dono sem perfil ativo, `23505`) e em todos a função NÃO envia.
- Nenhuma referência ao banco/endpoint de produção; nenhum segredo em código, teste ou relato.
- Para quem chama: o webhook continua devolvendo o mesmo resultado e nunca passa a lançar por causa da
  ausência (`try/catch` mantido). O que muda é o CONTEÚDO/DE QUEM É A DECISÃO: ela sai do webhook e passa a
  vir do servidor (PL-04).

## O que mudou e por quê
- `supabase/functions/_shared/evolution-webhook-messages.ts`
  - a ausência deixa de reimplementar a regra no webhook (lia `away_messages`, chamava
    `is_within_business_hours` e fazia o cooldown com um índice de janela de 12 h próprio) e passa a chamar
    `public.should_send_away_message(p_contact_id, p_connection_id)` (PL-04), que decide no banco — contato
    individual, conversa ativa e sem atendente, `away_messages` ligada, horário fechado e nenhum envio nas
    últimas 24 h — e devolve o TEXTO já com as variáveis resolvidas, ou NULL;
  - havendo texto, a mensagem entra na fila canônica de saída e sai pelo mesmo pipeline do app:
    INSERT em `messages` (`status='sending'`, `sender='agent'`, `agent_id` = dono da conexão) →
    `record_away_message` → `claim_outbound_message` → provedor → `complete_outbound_message`
    (`evoFetch` + token da instância). Nada de fetch solto;
  - `client_message_id` agora é determinístico por (contato, DIA UTC): semente canônica
    `away-<contato>-<yyyymmdd>` (`awayDayKey`), materializada como UUID (`awayClientMessageId`) porque a
    coluna é `uuid`; o UNIQUE `ux_messages_contact_client_message_id` deduplica, sem consulta prévia;
  - `record_away_message` é chamado SÓ DEPOIS de enfileirar; falha nele não impede a entrega (é trava, não
    caminho crítico) e o log de 24 h é quem garante a cadência;
  - tolerante à migration do PL-04 ausente: QUALQUER erro em `should_send_away_message`
    (RPC inexistente / sem permissão) = NÃO envia.
- `supabase/functions/_shared/evolution-webhook-messages.test.ts`
  - reescrito para o novo contrato: cobre cada caminho NEGADO (decisão NULL, decisão indisponível,
    atendente atribuído, conexão sem dono/perfil ativo, `23505`, provedor 4xx) e a ORDEM
    `INSERT` antes de `record_away_message`.

## Cartões irmãos (checagem pedida pelo cartão)
- `~/hermes-workspaces/.v2-fila/261015180242c0.json` = PL-04 (banco, `worker (sql)`), sha `e1275c8b0c` —
  li a migration por `git show e1275c8b0c:...` para pegar as assinaturas EXATAS
  (`should_send_away_message(uuid, uuid) RETURNS text`, `record_away_message(uuid, uuid, timestamptz)`,
  EXECUTE só para `service_role`).
- `~/hermes-workspaces/.v2-fila/2610151802a359.json` = tela de horário comercial (`iris`), outro assunto.
- Nenhum irmão já entregou a mudança DESTE cartão (o webhook não consumia o PL-04) — não havia o que só
  provar; a implementação era devida.

## Item a item do cartão
- Item 1 (mensagem sai pela fila canônica e não por fetch direto): feito no INSERT canônico + claim/complete
  — teste "decisão com texto → enfileira, registra e entrega pelo pipeline 1x".
- Item 2 (decidir pelo PL-04, tolerante à migration ausente): feito na chamada a
  `should_send_away_message` — testes "decisão NULL ... não envia" e "decisão indisponível (RPC ausente) não
  envia e o webhook segue".
- Item 3 (webhook nunca quebra): `try/catch` mantido — teste "provedor recusando (4xx) ... não derruba o
  webhook" (a mensagem recebida segue em `attribute_talkx_reply`).
- Item 4 (`record_away_message` só depois de enfileirar): teste "o registro só acontece DEPOIS do
  enfileiramento" (compara o índice das chamadas).
- Item 5 (id determinístico `away-<contato>-<yyyymmdd>`): `awayDayKey` + `awayClientMessageId` — testes de
  determinismo/UTC e "sem colisão por contato e por dia".

## Prova
- vermelho antes (impl anterior + teste novo, comando canônico):
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/evolution-webhook-messages.test.ts`
  → `error: Type checking failed.` e, com `--no-check`, `FAILED | 0 passed | 1 failed`.
- verde depois (mesmo comando): `ok | 11 passed | 0 failed`.
- sem regressão nos vizinhos que importam o módulo: mesmo comando em
  `evolution-webhook-messages.test.ts`, `evolution-webhook-event-coverage.test.ts`, `talkx-webhook-reply.test.ts`,
  `talkx-webhook-optout.test.ts`, `evolution-go-group-routing.test.ts` → `ok | 24 passed | 0 failed`.
- verificação de fim (`zapp-verify . --rapido`), executada neste workspace: `VERIFY: VERDE SEM BANCO (146s)` —
  `OK db_guard`; `OK tipos`; `OK lint`; `OK migrations`; `banco_local` ficou `NÃO VERIFICADO: sem nome de
  conjunto` (o cartão não define um conjunto de banco).

## Ramo de erro: antes × depois
- `should_send_away_message` com erro: NÃO existia antes (a decisão era local). Agora loga e NÃO envia —
  mesma postura fail-closed do ramo anterior de `is_within_business_hours`, que também não enviava.
- `record_away_message` com erro: ramo NOVO; loga e SEGUE a entrega, porque é trava de cadência e não
  caminho crítico (o cron não existe aqui: o webhook é quem entrega). Teste próprio.
- Provedor 4xx: inalterado — `fail_outbound_message(p_retryable=false)`, linha terminal, webhook segue.

## O que NÃO fiz e por quê
- NÃO usei `enqueue_outbound_message`: a RPC exige `auth.role() = 'authenticated'` (resolve o perfil por
  `auth.uid()` e cobra a permissão de envio — ver `20260909220000` e `20260930190000`); o webhook roda com a
  service key e receberia `authentication_required` (42501). O INSERT grava a MESMA linha
  (`status='sending'`, `sender='agent'`, `agent_id` resolvido), que é o contrato consumido pelo claim.
- NÃO marquei a linha com um carimbo "mensagem automática de sistema": `messages.sender` só aceita
  `('agent','contact')` e não há coluna de origem/automação. O marcador é o `client_message_id` determinístico
  `away-...`. Criar coluna seria migration (área de banco), fora deste cartão.
- NÃO entreguei a mensagem pela edge `message-delivery` em vez do claim local: essa edge é invocada pelo
  CLIENTE quando ele envia; sem app aberto ninguém entregaria a ausência. Uso os MESMOS
  `claim/complete_outbound_message`, então a linha herda lease, auditoria e reconciliação.
- NÃO toquei `supabase/deployment-manifest.json` (derivado; é do integrador).
