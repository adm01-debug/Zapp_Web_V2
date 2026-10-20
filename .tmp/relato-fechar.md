- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 1s;OK tipos 162s;OK lint 4s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 19:33, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  52 +++--
 .../auto-close-conversations/index.test.ts         | 251 +++++++++++++++++++--
 .../functions/auto-close-conversations/index.ts    | 156 +++++++++++--
 3 files changed, 401 insertions(+), 58 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:auth\.(uid|role)\(\), padrão:service_role|SERVICE

Especialista: edgar

## Sensibilidade
- Toca `service_role` (o cliente já existia; o diff não cria nem afrouxa auth) e escreve em `messages` / `conversation_closures` / `contacts`.
- Nada foi afrouxado: os testes provam o caso NEGADO (sem identidade, cron-secret inválido, `CRON_SECRET` vazio, usuário comum, JWT inválido) → 401/403 e ZERO `.from()`, ZERO insert, ZERO update.
- Nada de produção: nenhum segredo; comandos só locais (`deno test`, verificação local), sem rede nem DB de produção.
- Para quem chama: mesma rota HTTP e mesmos campos de resposta; somou-se `skipped`. O cron (PE-102) passa a processar em lote.

## O que mudou e por quê
- `supabase/functions/auto-close-conversations/index.ts`:
  - Inatividade pela ÚLTIMA MENSAGEM (não por `contacts.updated_at`): o laço lê a última mensagem do contato (`.from("messages").eq("contact_id").order("created_at", {ascending:false}).limit(1)`) e só fecha se ela for mais velha que o corte. Sem histórico → não fecha (fail-closed) e conta em `skipped`.
  - Só conversa aberta e viva: a seleção exige `conversation_status NOT IN ('resolved','archived')`, `deleted_at IS NULL` e `assigned_to IS NOT NULL`, e repete essa guarda no cliente antes do laço.
  - Cliente aguardando resposta não é inatividade: se a última mensagem é do cliente (`sender === "contact"`), pula.
  - Teto de 200 por execução: `.order("updated_at", {ascending:true}).limit(200)` no banco + `.slice(0, 200)` no cliente.
  - Mensagem de encerramento enfileirada no outbox: o insert nasce com `status:"sending"` + `client_message_id` + `agent_id` + `whatsapp_connection_id` + `is_read:true`, sem `external_id` — o mesmo formato que `enqueue_outbound_message` grava (migration 20260909220000); antes nascia como já enviada.
  - `client_message_id` determinístico: `auto-close:<contato>:<última mensagem>` resumido em SHA-256 (a coluna é `uuid`); o índice único (contact_id, client_message_id) garante a reexecução. Só depois do enqueue bem-sucedido vêm o `conversation_closures` e a desatribuição.
  - Ramo de erro (antes → depois): `23505` no enqueue = já enfileirada (reexecução) → `skipped`, nada reescrito; outro erro no enqueue → `failed` e NÃO grava fechamento nem desatribui; erro de leitura da última mensagem → `failed`. `closed` segue contando só quando todas as escritas concluem (R2-API-028 preservado).
- `supabase/functions/auto-close-conversations/index.test.ts`: o cliente falso passou a servir `messages` (última por contato) e a registrar filtros/ids; e o arquivo ganhou a cobertura do PK-01 (lote de 200, outbox, determinismo do `clientMessageId`, reexecução 23505 e as bordas de seleção).

## Prova
- Comando (verde, rodado agora):
  `deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/auto-close-conversations/index.test.ts`
  → `ok | 19 passed | 0 failed` (Test Files 1 passed, Tests 19 passed).
- Vermelho antes (mutação: sem o teto `.slice` e sem `status:"sending"` no insert): os testes `PK-01: teto de 200 contatos por execução` e `PK-01: mensagem de encerramento é enfileirada no outbox, não inserida como enviada` FALHAM.
- Borda de número: 250 candidatos → exatamente 200 enfileirados (`closed === 200`); o teto é conferido também no filtro emitido ao banco.
- `zapp-verify . --rapido` verde (verificação do fechamento).

## Config do auto-fechamento (das migrations; produção não foi consultada)
- Só existe UMA config semeada: `INSERT INTO public.auto_close_config (inactivity_hours, is_enabled) VALUES (24, false)` (migration 20260315131303). Das migrations: 1 config, `inactivity_hours = 24`, `is_enabled = false`. As demais migrations só criam índice/trigger/policy.

## Critério 3 — "mensagem entregue pelo pipeline oficial": entregue até o outbox oficial
O critério é cumprido no limite possível DESTA Edge, que roda como `service_role` sem usuário:
- A mensagem de encerramento entra no MESMO outbox que o pipeline oficial consome (`public.messages` com `status='sending'`, `client_message_id`, `agent_id`, `whatsapp_connection_id`, `is_read=true`, `external_id=NULL`) — exatamente as colunas/valores do `INSERT` de `enqueue_outbound_message` (migration 20260930200000, linhas 155-163). Provado no teste "mensagem de encerramento é enfileirada no outbox, não inserida como enviada".
- A RPC `enqueue_outbound_message` NÃO pode ser chamada pelo cron: `REVOKE ALL ... FROM PUBLIC, anon, service_role; GRANT EXECUTE ... TO authenticated` (20260930200000, linhas 190-195), e o corpo exige `auth.role()='authenticated'` + `auth.uid()` + `send_messages` (20260930190000). O cron não tem usuário. O guard de campos internos libera `service_role` (20260909220000, linha 78), por isso o insert direto é aceito.
- O passo de DESPACHO (claim → envio pelo provedor) fica FORA desta Edge: `message-delivery` só é invocado pelo front (`src/services/outbound-message.service.ts:223`) e `claim_outbound_message` exige caller cujo `profile.id` seja o `agent_id`; não há agendador que despache uma mensagem de origem-sistema. É do pipeline de mensageria/agendamento — registrado em comentário no cartão com sugestão de cartão para o worker (mensageria).
