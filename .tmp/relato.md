Especialista: edgar

## Sensibilidade
- Toca `service_role` (o cliente já existia; o diff não cria nem afrouxa auth) e escreve em `messages` / `conversation_closures` / `contacts`.
- Nenhuma proteção afrouxada: os testes de rejeição provam o caso NEGADO (sem identidade, cron-secret inválido, CRON_SECRET vazio, usuário comum, JWT inválido) → 401/403 e ZERO `.from()`, ZERO insert, ZERO update.
- Nada de produção: nenhum segredo; comandos só locais (`deno test`, verificação local), sem rede nem DB de produção.
- Para quem chama: mesma rota HTTP e mesmos campos de resposta; somou-se `skipped`. O cron (PE-102) passa a processar em lote.

## O que mudou e por quê
- `supabase/functions/auto-close-conversations/index.ts`:
  - **Inatividade pela ÚLTIMA MENSAGEM**, não por `contacts.updated_at`. Antes o filtro era `.lt("updated_at", corte)`: atribuição/nota recente escondia conversa parada há dias. Agora o laço lê a última mensagem do contato (`.from("messages").eq("contact_id").order("created_at", {ascending:false}).limit(1)`) e só fecha se ela for mais velha que o corte. Sem histórico → **não fecha** (fail-closed: não há como provar inatividade) e conta em `skipped`.
  - **Só conversa aberta e viva**: a seleção exige `conversation_status NOT IN ('resolved','archived')`, `deleted_at IS NULL` e `assigned_to IS NOT NULL`, e repete essa guarda no cliente (defesa em profundidade) antes do laço.
  - **Cliente aguardando resposta não é inatividade**: se a última mensagem é do cliente (`sender === "contact"`), pula.
  - **Teto de 200 por execução**: `.order("updated_at", {ascending:true}).limit(200)` no banco + `.slice(0, 200)` no cliente.
  - **Mensagem de encerramento enfileirada no outbox**: o insert passou a nascer com `status:"sending"` + `client_message_id` + `agent_id` (o responsável) + `whatsapp_connection_id` + `is_read:true`, sem `external_id` — o mesmo formato que `enqueue_outbound_message` grava (migration 20260909220000). Antes gravava só `{contact_id, content, sender:'agent', message_type:'text'}`, uma linha que já aparecia como enviada (a "linha fantasma do agente emissor" citada no cartão).
  - **`client_message_id` determinístico**: `auto-close:<contato>:<última mensagem>` resumido em SHA-256 (a coluna é `uuid`); o índice único (contact_id, client_message_id) garante a reexecução. Só depois do enqueue bem-sucedido vêm o `conversation_closures` e a desatribuição.
  - **Ramo de erro (antes → depois)**: antes, o erro do insert da mensagem só entrava em `stepErrors` e abortava o contato como `failed`, sem distinguir reexecução de falha real. Depois: `23505` no enqueue = já enfileirada (reexecução) → `skipped`, nada reescrito; outro erro no enqueue → `failed` e **não** grava fechamento nem desatribui; erro de leitura da última mensagem → `failed`. Fechamento e desatribuição continuam contando só quando concluem (R2-API-028 preservado).
- `supabase/functions/auto-close-conversations/index.test.ts`: o cliente falso passou a servir `messages` (última por contato) e a registrar filtros/ids; e o arquivo ganhou a cobertura do PK-01 — lote de 200, outbox, determinismo do `clientMessageId`, reexecução (23505) e as bordas de seleção (resolvida/arquivada, contato excluído/sem dono, atividade recente e mensagem do cliente).

## Prova
- vermelho antes (mutação: sem o teto `.slice` e sem `status:"sending"` no insert):
  `deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/auto-close-conversations/index.test.ts`
  → `PK-01: teto de 200 contatos por execução ... FAILED` e `PK-01: mensagem de encerramento é enfileirada no outbox, não inserida como enviada ... FAILED`
- verde depois (mesmo comando, código restaurado):
  → `ok | 19 passed | 0 failed (81ms)` — Test Files 1 passed, Tests 19 passed.
- Borda de número coberta: 250 candidatos → exatamente 200 enfileirados (`closed === 200`); o teto é conferido também no filtro emitido ao banco.
- `zapp-verify . --rapido` → verde (verificação do fechamento).

## Config de auto-fechamento (das migrations; produção não foi consultada)
- Só existe UMA config semeada: `INSERT INTO public.auto_close_config (inactivity_hours, is_enabled) VALUES (24, false)` (migration 20260315131303). Ou seja, das migrations: 1 config, `inactivity_hours = 24`, `is_enabled = false`. Nenhuma outra migration insere ou atualiza configs (as demais só criam índice/trigger/policy).

## O que NÃO fiz e por quê
- **Despacho da mensagem fora do escopo desta Edge**: a Edge grava no MESMO outbox que `enqueue_outbound_message` produz (`status:'sending'` + `client_message_id` + `agent_id` + `whatsapp_connection_id`), provado no teste "mensagem de encerramento é enfileirada no outbox, não inserida como enviada". O passo de despacho (claim → envio pelo provedor) NÃO existe para mensagem de sistema: quem claims o outbox é a Edge `message-delivery`, que exige um chamador autenticado cujo `profile.id` seja o `agent_id` da mensagem (`claim_outbound_message` casa `message.agent_id = p_agent_id`), e não há agendador que a dispare sem agente. É do pipeline de mensageria/agendamento, não desta Edge; registrado em comentário no cartão.
- **Não troquei `enqueue_outbound_message` por RPC**: ele exige `auth.role() = 'authenticated'` e foi revogado de `service_role` (migration 20260909240000), e o cron roda com service role sem usuário. O insert grava o MESMO formato de outbox que o RPC grava; o guard de campos internos libera `service_role` para `client_message_id`/`status`.
