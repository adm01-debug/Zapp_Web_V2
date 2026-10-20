# PLANO MULTI-CONEXÃO EVOLUTION GO — 50 ETAPAS (2026-09-25)

> Origem: auditoria de 2026-09-25 respondendo "o sistema suporta várias conexões de WhatsApp
> via Evolution GO?". Resposta curta: **não** — banco e UI são multi-conexão, mas o transporte
> para a GO é preso a uma única instância (a do secret `EVOLUTION_INSTANCE_TOKEN`). Este plano
> fecha essa lacuna e aproveita a janela do bloqueio da Meta (24 h a partir de 25/09 ~09:48 BRT)
> para fazer o trabalho de fundação sem risco para o número principal.
> Toda afirmação de estado abaixo foi **verificada em 2026-09-25** (código em `main` `300ce5c`,
> banco `tnnnlkbymytvtqngbbqh`, API da GO `evolution-go-rxj2`), salvo indicação contrária.

## Estado-base verificado (2026-09-25)

| Eixo | Estado |
|---|---|
| Conexões no banco | **1** linha em `whatsapp_connections`: `PRINCIPAL` / 551146375517, `status=disconnected`, `is_default=true` |
| Instâncias na GO | **1**: `PRINCIPAL` (`connected:false`, `disconnect_reason:"Reconnecting"`, webhook apontando para `evolution-webhook`) |
| Queda atual | 25/09 **12:48 UTC** (alerta `evolution-webhook`, gravado **em duplicata**); quedas anteriores 24/09 10:08 e 20:57 — instável antes do bloqueio |
| Última atividade | inbound 12:47 UTC · outbound 12:41 UTC · **1.426 mensagens recebidas nas 24 h anteriores** · 356 enviadas por agente em 3 dias · **0 campanhas Talk X em 10 dias** (o bloqueio não veio de campanha) |
| Fila outbound | 0 mensagens presas em `sending`, 0 `failed` em 3 dias |
| Credencial de instância | **um** secret global (`EVOLUTION_INSTANCE_TOKEN`); a GO identifica a instância pelo header `apikey`; o tradutor descarta o nome da instância do path |
| `create-instance` | gera `token: crypto.randomUUID()` e **não persiste**; `/instance/all` remove `token` da resposta (proposital) → credencial nasce e se perde |
| `delete-instance` | `/instance/delete/{name}` **não é traduzido** (404 na GO) e o front engole o erro (`.catch(() => {})`) → instância órfã na GO |
| Inbound | roteamento por `instance_id` (`getConnectionByInstance`, cache 5 min) é multi-capaz; o **gate de token compara com um único secret** |
| Health-check | cron `*/5` (288 runs/24 h): itera todas as conexões, mas toda consulta usa o mesmo token → todas herdam o status da PRINCIPAL |
| Circuit breaker do proxy | global (`cbFailures` único) — uma instância caída abriria o breaker para todas |
| Vault | já em uso (6 secrets: `talkx_scheduler_url`, `gmail_encryption_key`, …) — padrão pronto para guardar token por instância |
| `departments.whatsapp_api_key` | coluna de credencial em texto puro, **0 preenchidas**, exposta por `get_department_whatsapp_credentials` |
| `whatsapp_connection_queues` | 0 linhas; hook `useConnectionQueues` existe |
| Grants | `whatsapp_connections`: `anon` e `authenticated` com **TRUNCATE/TRIGGER/REFERENCES** (não passam por RLS); views `_safe/_agent/_public` são `security_invoker=true` (RLS cobre) |
| Testes | `translateV2ToGo` (309 linhas, ~60 rotas) tem **0 testes unitários**; `message-delivery/index.test.ts` existe e cobre 1 instância |
| Edge `evolution-api` | **107 actions**; ~45 (chatwoot/typebot/openai/dify/flowise/rabbitmq/sqs/kafka/nats/pusher/evoai/template/proxy) não existem na GO → 404 |
| Docs | `EVOLUTION_API_GAPS_ANALYSIS.md` é de 2026-04 contra a **v2 1.0.1** — obsoleto; decisão de "credencial global" registrada em `PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md:285` |
| PRs abertas | 12; **nenhuma** toca `evolution-*`, `whatsapp_connections` ou `connection-health-check` |

## Regras de execução (herdadas dos planos de 16/09 e 20/09, obrigatórias)

1. **1 etapa = 1 PR** quando tocar o repo; branch `claude/<tipo>-e{NN}-slug-<AAMMDD-HHMM>`; merge ⇒ deletar branch no mesmo turno.
2. DDL segue a **ordem do CLAUDE.md §1.6** (arquivo → PR → merge → deploy → apply) e o ritual do `register-migration.mjs`; fechamento = `npm run db:guard` exit 0 + paridade count+md5. `max(version)` hoje: `20260925170100`.
3. Edges só sobem por `deploy-functions.yml` (environment `producao-edge-functions`, aprovação humana). Nenhuma etapa de F1–F4 vale sem o deploy confirmado.
4. **Nada de `EVOLUTION_WEBHOOK_ENFORCE=token` antes de E31.** Ligar antes derruba o inbound.
5. **Nenhuma etapa toca a instância `PRINCIPAL` na GO enquanto o bloqueio da Meta durar** (E01). Leitura (`/instance/status`, `/instance/all`) é permitida.
6. Cada etapa fecha com o comando de verificação listado saindo **verde** e o checkbox marcado **no mesmo PR** que a implementa.
7. 🔴 bloqueia o objetivo (multi-conexão real ou risco ao número principal) · 🟡 dívida com juros · 🟢 manutenção/documentação.

Legenda de status (a preencher na execução): ✅ fechada com evidência · 🔧 em PR · 📋 análise pronta,
ação deferida · 👤 exige decisão/ação humana · ⏳ janela de observação.

---

## F0 — Janela do bloqueio da Meta (E01–E07) — hoje → +24 h

O número principal está bloqueado; a GO fica em `Reconnecting` sozinha. Tudo nesta fase é
**sem tocar a PRINCIPAL** e serve para (a) não agravar o bloqueio, (b) não perder cliente às cegas,
(c) preparar a volta.

### E01 🔴 Congelar reconexão manual da PRINCIPAL durante o bloqueio
- [ ] Hoje `MonitoringConnectionsList.tsx:38-50` e `useConnectionsManager` expõem "Reconectar", "QR" e "Reiniciar" sem trava. Cada clique vira `POST /instance/connect` (reafirma webhook — inofensivo) ou `/instance/reconnect`. Tentativas repetidas de login durante um bloqueio da Meta são o comportamento clássico que estende o bloqueio.
- [ ] Ação: chave `whatsapp_maintenance_until` (timestamptz) em `global_settings` (tabela já usada em `evolution-webhook-messages.ts:421`; sem DDL). Enquanto `now() < valor`, os três botões ficam desabilitados com tooltip "Bloqueio da Meta até HH:MM" e a edge `evolution-api` recusa `connect`/`restart-instance`/`disconnect` para essa instância com `{ error: true, message }` (mesma convenção do proxy).
- [ ] Gravar agora: `2026-09-26 13:00 UTC` (24 h + folga sobre a queda de 12:48 UTC).
- Verificação: `select value from global_settings where key='whatsapp_maintenance_until'` + clique no botão retorna toast de bloqueio (E2E em `e2e/` opcional).

### E02 🔴 Banner "WhatsApp indisponível" e bloqueio de envio com mensagem honesta
- [ ] Hoje o agente escreve, `claim_outbound_message` não acha candidato (`status='connected'` obrigatório) e a mensagem simplesmente não sai — o front não diz por quê. 0 presas em `sending` agora só porque ninguém tentou depois das 12:41.
- [ ] Ação: no inbox, banner global lendo `whatsapp_connections_safe.status` da conexão padrão (`useWhatsAppStatus.ts` já tem a subscription) + `whatsapp_maintenance_until`; no composer, bloquear o envio com "Conexão PRINCIPAL indisponível (bloqueio da Meta até HH:MM). A mensagem não foi enviada." em vez de aceitar e engolir.
- [ ] Não enfileirar para envio automático na volta (E05 define retomada manual e gradual).
- Verificação: tentar enviar com a conexão `disconnected` → toast + nenhuma linha nova em `messages` com `status='sending'`.

### E03 🟡 Diagnóstico da causa do bloqueio (evidência, não palpite)
- [ ] Não houve campanha Talk X em 10 dias, então a hipótese "spam de campanha" está descartada. Restam: (1) volume de conversas **iniciadas pelo agente** para números novos sem resposta; (2) taxa de "bloquear/denunciar" dos destinatários; (3) mesmo número logado em outro dispositivo/API; (4) instabilidade prévia (3 quedas em 30 h) fazendo a GO re-logar repetidas vezes.
- [ ] Coletar em SQL (uma consulta cada, salvar em `docs/audits/DIAGNOSTICO_BLOQUEIO_META_2026-09-25.md`): mensagens de agente por contato **sem resposta** nos 7 dias; contatos criados por `evolution-webhook` vs. por `useNewConversation` (iniciados por nós); uso de `check-numbers` (`/user/check`) — consulta em massa de números é sinal de prospecção; `connection_health_logs` dos 7 dias para contar re-logins.
- [ ] Na GO (leitura): `/instance/all` já mostra `alwaysOnline:false, readMessages:false` — OK. Registrar `os_name/client_name`.
- Verificação: relatório com as 4 séries e uma conclusão marcada como "provável" ou "inconclusivo" — nunca "confirmado" sem evidência da Meta.

### E04 👤 Decisão de negócio: número reserva por swap de instância única (plano B operacional)
- [ ] Enquanto F1–F3 não fecham, o único jeito de operar por **outro** número é o **swap**: criar instância nova na GO, trocar o secret `EVOLUTION_INSTANCE_TOKEN` para o token dela e, na linha `PRINCIPAL` de `whatsapp_connections`, trocar `instance_id` para o nome novo (mantendo o mesmo `id` para não perder o vínculo dos 3.099 contatos). Zero código.
- [ ] Custo/risco a apresentar ao Joaquim: os clientes passam a receber de **outro número**; ao voltar o principal, o swap reverso é igual; durante o swap o histórico fica na mesma conversa (o vínculo é pelo `id` da conexão, não pelo número); o token gerado na criação **precisa ser guardado** (E11 ainda não existe) — anotar no Vault manualmente.
- [ ] Só executar com `APROVADO`. Se aprovado, E05 vale para o número reserva também.
- Verificação: `/instance/status` da instância nova = `LoggedIn:true`; 1 mensagem de teste enviada e recebida; alerta `🟢 restaurada` no war-room.

### E05 🟡 Retomada controlada pós-bloqueio (política + trava técnica)
- [ ] Ao voltar, o comportamento que mais reduz reincidência é: primeiras 2 h **só responder** (nenhuma conversa iniciada por agente), primeiras 72 h **sem Talk X**, e teto de conversas novas iniciadas por hora.
- [ ] Trava técnica mínima: `global_settings.whatsapp_warmup_until` (timestamptz) — `useNewConversation` recusa iniciar conversa nova e `talkx-scheduler` pula campanhas enquanto `now() < valor`. Sem DDL.
- [ ] `talkx_settings`: conferir se existe limite diário de destinatários; se não existir, adicionar chave `daily_recipient_cap` lida por `talkx-send` (o `speed_profile` só espaça, não limita).
- Verificação: com `warmup_until` no futuro, "Nova conversa" mostra o motivo; `talkx-scheduler-1min` loga `skipped: warmup`.

### E06 🟢 Auditoria do que se perdeu entre 12:41 UTC e a volta
- [ ] Quando a GO reconectar, ela emite `HISTORY_SYNC`/`MESSAGES_SET` (`handleMessagesSet` existe). Conferir que mensagens recebidas no celular durante o bloqueio (se houver) entram sem duplicar (índice único `(whatsapp_connection_id, external_id, sender)` segura).
- [ ] Listar contatos que escreveram no dia 25 sem resposta (`messages` `sender='contact'` após 12:41 sem `sender='agent'` posterior) e entregar para os agentes retomarem.
- Verificação: SQL de conferência + zero violação do índice único nos logs da edge.

### E07 🟢 Runbook "Bloqueio da Meta"
- [ ] `docs/runbooks/bloqueio-meta.md`: sintomas (`disconnect_reason`, alerta duplicado), o que **não** fazer (reconectar em loop, trocar de aparelho), E01/E02/E04/E05 como checklist, e como verificar a volta (`/instance/status`, `warroom_alerts`).
- Verificação: link no `INCIDENT-RUNBOOK.md`.

---

## F1 — Credencial por instância (E08–E14)

Fundação: o token de cada instância passa a viver no Vault, ligado à linha de `whatsapp_connections`.
Padrão já usado no projeto (`talkx_scheduler_url`, `gmail_encryption_key`).

### E08 🔴 Migration: vínculo conexão → segredo do Vault
- [ ] `supabase/migrations/<versão>_whatsapp_connections_instance_token.sql`:
  `ALTER TABLE whatsapp_connections ADD COLUMN instance_token_secret_id uuid;`
  `CREATE UNIQUE INDEX whatsapp_connections_instance_id_key ON whatsapp_connections(instance_id) WHERE instance_id IS NOT NULL;` (hoje nada impede duas linhas com o mesmo `instance_id`; o webhook usa `.single()` e quebraria).
  `CREATE UNIQUE INDEX whatsapp_connections_one_default ON whatsapp_connections((true)) WHERE is_default;` (E35 depende).
- [ ] Views `_safe/_agent/_public` **não** ganham a coluna nova. `schema-catalog.json` regenerado.
- [ ] Aditiva e compatível com `main` → pode aplicar antes do merge (CLAUDE.md §1.6, exceção), mas o PR mergeia no mesmo turno.
- Verificação: `npm run db:guard` exit 0; `\d whatsapp_connections` com os 2 índices; paridade arquivos↔ledger.

### E09 🔴 Funções de acesso ao token (só `service_role`)
- [ ] `public.get_instance_token(p_instance_id text) RETURNS text` — `SECURITY DEFINER`, `search_path=public,pg_temp`, `IF auth.role() <> 'service_role' THEN RAISE 42501` (mesmo guard de `claim_outbound_message`), lê `vault.decrypted_secrets` pelo `instance_token_secret_id`.
- [ ] `public.set_instance_token(p_connection_id uuid, p_token text) RETURNS uuid` — cria/atualiza via `vault.create_secret`/`vault.update_secret`, grava o id na linha.
- [ ] `REVOKE ALL ... FROM anon, authenticated` explícito (PR #720 já mostrou que o default do schema deixa EXECUTE aberto).
- Verificação: como `authenticated`, `select get_instance_token('PRINCIPAL')` → 42501; como service_role → valor; `grants-baseline.json` regenerado.

### E10 🔴 Backfill da `PRINCIPAL` (o token atual sai do secret e entra no Vault)
- [ ] Action admin `bootstrap-instance-token` em `evolution-api/index.ts`: exige `is_admin_or_supervisor` no JWT, lê `EVOLUTION_INSTANCE_TOKEN` do env e chama `set_instance_token` para a linha com `instance_id = EVOLUTION_INSTANCE_NAME`. Idempotente; nunca ecoa o token na resposta nem nos logs.
- [ ] Executar uma vez via `functions_invoke` com JWT de admin. Depois disso, o secret global vira **fallback de transição** (E21).
- Verificação: `select instance_token_secret_id is not null from whatsapp_connections where instance_id='PRINCIPAL'` → true; `get_instance_token('PRINCIPAL')` como service_role bate com o secret (comparar só o hash SHA-256, não o valor).

### E11 🔴 `create-instance` persiste o token e cria a conexão na mesma transação lógica
- [ ] Hoje (`evolution-api/index.ts:65` + `useConnectionsManager.ts:138-147`): a edge gera o token, cria na GO e devolve; o **front** insere em `whatsapp_connections` depois — se o insert falha, sobra instância órfã na GO com token perdido.
- [ ] Nova action `create-connection` (admin): gera `token = crypto.randomUUID()` → `POST /instance/create` → `INSERT whatsapp_connections` → `set_instance_token`. Se qualquer passo após o create falhar, chama o delete da GO (E12) — compensação, não transação.
- [ ] Em seguida `POST /instance/connect` com `subscribe:['ALL']` + `webhookUrl` (o tradutor já monta isso) para a instância nascer com webhook.
- [ ] Manter `create-instance` só para compatibilidade por 1 release, logando `deprecated`.
- Verificação: teste Deno com `fetch` mockado cobrindo sucesso e falha no insert (delete compensatório chamado); na GO, `/instance/all` mostra a nova com `webhook` preenchido.

### E12 🟡 `delete-instance` real na GO + limpeza do Vault
- [ ] `translateV2ToGo` não mapeia `/instance/delete/{name}` → o path v2 vai intacto e a GO responde 404; `useConnectionsManager.ts:247` faz `.catch(() => {})`. Resultado: apagar conexão no app deixa a instância viva na GO (contando licença/recursos e ainda mandando webhook).
- [ ] Confirmar no swagger da instância (`/swagger/doc.json`, base já citada no cabeçalho do tradutor) o endpoint de exclusão (esperado: `DELETE /instance/{instanceId}` com a key **admin**; `instanceId` vem do `/instance/all`). Mapear com `auth:'admin'`.
- [ ] Na edge: `logout` antes do delete, `vault` limpo (`vault.secrets` DELETE pelo `secret_id`), linha removida por último. Front deixa de engolir o erro.
- Verificação: criar e apagar uma instância de teste; `/instance/all` não a lista; `vault.secrets` sem o segredo.

### E13 🟡 Sinalizar conexão sem credencial
- [ ] `normalizeGoResponse('/instance/all')` continua removendo `token` (correto). Adicionar `hasToken` (boolean) cruzando `name` com `whatsapp_connections.instance_token_secret_id IS NOT NULL`.
- [ ] `MonitoringConnectionsList`/`ConnectionsView`: badge "sem credencial" e ações desabilitadas quando `hasToken=false`.
- Verificação: instância criada fora do app (direto na GO) aparece com o badge.

### E14 🟢 Rotação de token de instância
- [ ] Verificar no swagger se a GO permite atualizar o token de uma instância existente; se não, o procedimento é recriar (E12 + E11) e o runbook diz isso.
- [ ] Action admin `rotate-instance-token` só se a GO suportar; caso contrário, apenas documentar em `docs/security/secret-surface-inventory.md` (linha 68 hoje aponta para "painel Evolution na Hostinger").
- Verificação: inventário atualizado; se implementado, teste de rotação numa instância de teste.

---

## F2 — Transporte outbound por instância (E15–E22)

### E15 🔴 `evoFetch` recebe o token da instância
- [ ] `_shared/evolution-send.ts:34-37`: trocar `Deno.env.get('EVOLUTION_INSTANCE_TOKEN')` por parâmetro `instanceToken?: string`. Regra: `go.auth==='instance'` → usa `instanceToken`; se ausente, **falha explícita** (`400 { error: 'instance token ausente' }`) — nunca mais cair silenciosamente na PRINCIPAL. Fallback para o env só quando `instanceName === EVOLUTION_INSTANCE_NAME` **e** E10 ainda não fechou (remover em E21).
- [ ] Assinatura nova mantém a ordem dos parâmetros existentes (chamadores: `message-delivery`, `talkx-send`, `connection-health-check`, `evolution-sync`, `recover-corrupted-audios`, `batch-fetch-avatars`? — conferir com `grep -rn "evoFetch("`).
- Verificação: `deno test` do E47 cobrindo "sem token → 400" e "token da instância no header".

### E16 🔴 `proxyToEvolution` resolve o token pelo nome da instância
- [ ] `_shared/evolution-api-proxy.ts:94-110`: novo parâmetro `instanceToken`; o chamador (`evolution-api`) resolve via `get_instance_token(instance)` com **cache em memória por isolate** (`Map<instance, {token, expiresAt}>`, TTL 5 min — mesmo padrão de `getConnectionByInstance`) e invalidação quando `connection.update` chega (E30 compartilha o cache).
- [ ] Log `[Evolution GO] translated → METHOD path` passa a incluir `instance=<nome>` (nunca o token).
- Verificação: teste com duas instâncias mockadas → dois `apikey` diferentes no `fetch`.

### E17 🔴 `evolution-api`: instância obrigatória em ação de instância
- [ ] `evolution-api/index.ts:60`: `instance = String(body.instanceName || body.instance || '')` — string vazia hoje vira path `/message/sendText/` e o tradutor **ainda casa** (`[^/]+` não casa vazio → passa intacto → GO 404, ou pior, rotas GET sem nome caem na PRINCIPAL). Validar com o Zod já usado nas edges (`_shared/schemas.ts`): ação de instância sem `instance` → 400 antes do proxy.
- [ ] Ações admin (`list-instances`, `create-connection`, `delete-instance`) explicitamente isentas.
- Verificação: `functions_invoke evolution-api {action:'status'}` sem instância → 400 com mensagem; com instância → 200.

### E18 🔴 `message-delivery` envia pela instância do claim
- [ ] `message-delivery/index.ts:74-156` já monta `/message/sendX/${claim.whatsapp_instance_name}`. Falta passar o token: resolver `get_instance_token(claim.whatsapp_instance_name)` (service_role) uma vez por lote e injetar no `evoFetch` (E15). **Não** adicionar o token ao retorno de `claim_outbound_message` (RPC é `service_role` mas o shape vaza em tipos/testes).
- [ ] `index.test.ts`: caso com dois claims de instâncias distintas → dois tokens distintos no `fetch`; caso "instância sem token" → mensagem volta para `failed` com `delivery_error='no_instance_token'`, não para retry infinito.
- Verificação: `npx vitest run supabase/functions/message-delivery` verde; em produção, `messages.delivery_claimed_by` + logs mostram a instância.

### E19 🔴 `talkx-send`: campanha sai pela conexão da campanha, teste pela padrão
- [ ] Linhas 212 e 469 já filtram por `campaign.whatsapp_connection_id` — só falta o token (E15/E16).
- [ ] Linha 136 (modo teste): `.eq('status','connected').limit(1).single()` = "qualquer conexão conectada", ordem indefinida. Trocar por `is_default=true` (E35 garante unicidade) ou pela conexão escolhida no editor (`useCampaignEditor.ts:264` já lista).
- [ ] Erro claro quando a conexão da campanha não está `connected`: hoje `.single()` lança e a campanha falha com "Internal error"; devolver `connection_unavailable` e o scheduler adia (não marca `failed`).
- Verificação: campanha de teste com conexão desconectada → status `paused_connection` (ou equivalente) e evento em `talkx_campaign_events`.

### E20 🟡 Remover o `'PRINCIPAL'` hardcoded
- [ ] `evolution-sync/index.ts:56` e `recover-corrupted-audios/index.ts:75`: `|| Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'PRINCIPAL'` → exigir `instanceName` no body (ou resolver pela conexão do contato) e falhar com 400 se ausente.
- Verificação: grep `'PRINCIPAL'` em `supabase/functions` retorna 0 fora de comentário.

### E21 🟡 Aposentar `EVOLUTION_INSTANCE_TOKEN` / `EVOLUTION_INSTANCE_NAME`
- [ ] Depois de E10, E15, E16, E18, E19, E24 e E30 fechados e **48 h** sem log `instance token fallback` (adicionar esse log no fallback do E15): remover o fallback do código, remover os dois secrets do Dashboard, atualizar `.env.example:28-30` e `docs/security/secret-surface-inventory.md:68`.
- [ ] Não remover o secret antes do código: foi exatamente essa ordem invertida que quebrou o lockout de login em 2026-09-04 (CLAUDE.md §1.6).
- Verificação: `grep -rn EVOLUTION_INSTANCE_ supabase src .env.example` → 0; edges deployadas depois do grep.

### E22 🟡 Circuit breaker por instância
- [ ] `evolution-api-proxy.ts:52-66`: `cbFailures/cbOpenUntil` são globais do isolate — 5 falhas da instância A abrem o breaker e a instância B leva 503 por 60 s. Trocar por `Map<instanceName, {failures, openUntil}>`; rotas admin usam a chave `'__admin'`.
- Verificação: teste com A falhando 5× e B respondendo 200 → B não recebe 503.

---

## F3 — Operação de instância por token (E23–E29)

### E23 🔴 QR / connect / logout / restart / status usam o token certo
- [ ] Com E16, todas passam pelo mesmo resolvedor. Esta etapa é o **teste de contrato**: para cada rota de instância do tradutor (`/instance/qr`, `/instance/connect`, `/instance/logout`, `/instance/reconnect`, `/instance/status`), o `apikey` enviado tem de ser o token da instância nomeada no path v2, nunca o env.
- Verificação: `tests/contracts/evolution-instance-token.contract.test.ts` verde no CI.

### E24 🔴 `connection-health-check` por instância
- [ ] `connection-health-check/index.ts:18-84`: iterar `whatsapp_connections` resolvendo o token de cada uma; 401 da GO → `health_status='no_credentials'` (novo valor; hoje seria `degraded`) e **não** dispara alerta de "desconectada" nem sobrescreve `status`.
- [ ] Conexão em `whatsapp_maintenance_until` (E01): continua consultando (leitura), mas não gera alerta repetido.
- Verificação: log de execução com 2 instâncias mostrando estados diferentes; `connection_health_logs.status` distinto por `instance_id`.

### E25 🟡 `extractConnectionState` distingue "logado mas sem socket"
- [ ] `evolution-send.ts:89-97`: `{Connected:false, LoggedIn:true}` vira `'open'` → health "healthy" enquanto a GO está em `Reconnecting` (o estado exato de hoje). Mapear: `LoggedIn && Connected → open`; `LoggedIn && !Connected → connecting`; `!LoggedIn → close`. `handleConnectionUpdate` já trata `connecting` como transitório.
- Verificação: teste unitário com os três shapes; health-check em `Reconnecting` grava `degraded`, não `healthy`.

### E26 🟡 Alertas de conexão idempotentes
- [ ] `warroom_alerts` recebeu **2 alertas idênticos** para a mesma queda (12:48:36.757 e 12:48:37.183) e o mesmo em 24/09 10:44 e 20:57 — a GO entrega o evento em dobro (ou o rate-limit/retry reenvia). `handleConnectionUpdate` insere sem checar o anterior.
- [ ] Deduplicar: não inserir se existe alerta do mesmo `source`+`title` nos últimos 60 s. Sem DDL (consulta antes do insert; a janela é curta).
- Verificação: reproduzir com 2 POSTs iguais no webhook → 1 alerta.

### E27 🟡 UI cria conexão por uma única chamada
- [ ] `useConnectionsManager.ts:130-160`: `handleAddConnection` deixa de inserir em `whatsapp_connections`; chama `create-connection` (E11) e recebe a linha pronta. `generateInstanceName` continua no front (nome legível) mas a edge valida `^[a-z0-9_]{3,40}$`.
- [ ] `startStatusPolling` já usa `getInstanceStatus(instanceName)` — passa a funcionar por instância com E16.
- Verificação: E2E `e2e/connections.spec.ts` (novo): criar → QR aparece → excluir → some da GO (mock da GO via `page.route`).

### E28 🟢 Monitoring por instância
- [ ] `MonitoringSLAPanel`, `MonitoringWebhookPanel`, `MonitoringConnectionsList` já iteram por `instance_id`. Adicionar badge de credencial (E13), estado `no_credentials`/`connecting` (E24/E25) e ação "Reconectar" respeitando E01.
- Verificação: screenshot com 2 conexões em estados diferentes.

### E29 🟢 Comentário desatualizado em `evolution-helpers.ts:163`
- [ ] "whatsapp_connections has exactly 2 rows but was receiving 37.9M seq scans" — hoje é 1 linha e o cache é por instância. Atualizar junto com o cache compartilhado do E16.
- Verificação: diff do comentário no PR do E16.

---

## F4 — Inbound multi-instância (E30–E34)

### E30 🔴 Webhook valida `instanceToken` contra o conjunto de tokens
- [ ] `evolution-webhook/index.ts:60-72`: `goTokenMatches` compara com **um** token. Passar a: ler `instanceName` do corpo → `get_instance_token(instanceName)` via o cache do E16 (compartilhado em `_shared`) → `timingSafeEqual`. Instância desconhecida ou sem token → `false` (em `shadow` só loga; em `token` 401).
- [ ] Manter o log `[WEBHOOK_AUTH_SHADOW]` com `instanceName` para a observação do E31.
- Verificação: teste com dois payloads (instâncias A e B, tokens distintos) → ambos aceitos; token trocado → rejeitado em modo `token`.

### E31 ⏳ Ligar `EVOLUTION_WEBHOOK_ENFORCE=token`
- [ ] Pré-requisitos: E10 (PRINCIPAL com token no Vault) + E30 deployado + **48 h** de logs `[WEBHOOK_AUTH_SHADOW]` com 0 "divergente" e 0 "ausente" para instâncias cadastradas.
- [ ] Flip é só secret no Dashboard (sem redeploy — comentário do próprio arquivo). Rollback = voltar para `shadow`.
- Verificação: 1 h após o flip, `messages` continua recebendo (`sender='contact'`) e nenhum 401 nos logs para instâncias cadastradas.

### E32 🟡 Instância desconhecida não vira 500
- [ ] Payload com `instanceName` sem linha em `whatsapp_connections` (ex.: instância criada direto na GO): hoje `getConnectionByInstance` devolve `null` e os handlers seguem caminhos diferentes (alguns inserem contato sem conexão — 4 contatos com `whatsapp_connection_id IS NULL` hoje). Responder `202 {ignored:'unknown_instance'}` cedo e logar com `instanceName`.
- Verificação: POST com instância inventada → 202; `contacts` não cresce.

### E33 🟡 Rate limit do webhook por instância
- [ ] `evolution-webhook/index.ts:88-94`: `checkRateLimit('evowh:'+ip, 200, 60_000)` — todas as instâncias da mesma VPS chegam do mesmo IP; com 3 números o limite de 200/min vira 66/min por número. Chave `evowh:${ip}:${instanceName}` (o nome já está no corpo; lê depois do HMAC, então mover o rate-limit para depois do parse ou manter o por-IP com teto maior como camada 1).
- Verificação: teste de carga sintético (2 instâncias × 150 req/min) sem 429.

### E34 🟢 Índices por instância nas tabelas de operação
- [ ] `connection_health_logs(instance_id, checked_at)` e `webhook_rate_limits(instance_id)`: conferir `pg_stat_user_indexes`; criar índice simples se as consultas do Monitoring (filtro por instância + ordenação por data) fizerem seq scan. `CREATE INDEX` simples (CLAUDE.md §1.5).
- Verificação: `EXPLAIN` das duas consultas do `MonitoringHealthLogs` sem `Seq Scan`.

---

## F5 — Roteamento de negócio (E35–E41)

### E35 🔴 Uma única conexão padrão (atômico)
- [ ] `useConnectionsManager.ts:239-240` faz dois `UPDATE` separados (zera todas, marca uma) — janela sem padrão ou com duas. Índice único parcial do E08 + RPC `set_default_connection(p_id)` que faz as duas escritas numa transação. Front chama a RPC.
- Verificação: `select count(*) from whatsapp_connections where is_default` = 1 sempre; teste do hook.

### E36 🔴 Resposta sai pela conexão do contato — e falha alto quando ela está fora
- [ ] `claim_outbound_message` já resolve `COALESCE(message.whatsapp_connection_id, contact.whatsapp_connection_id)` e exige `connected`. Quando a conexão do contato está `disconnected`, a mensagem fica em `sending` sem ninguém saber (E02 cobre a UI; aqui é o worker).
- [ ] `message-delivery`: se o claim não devolve candidato **e** a conexão do contato existe mas não está `connected`, marcar `status='failed'`, `delivery_error='connection_unavailable'` e emitir notificação ao agente (`notification-events.ts`). **Nunca** trocar de número automaticamente — o cliente veria outro remetente.
- Verificação: mensagem para contato de conexão desconectada → `failed` em < 90 s com o erro legível no balão.

### E37 🟡 Departamento → conexão
- [ ] `departments.whatsapp_instance_id` (text) e `whatsapp_api_key` (text, 0 preenchidas, exposta por `get_department_whatsapp_credentials`) são resquício do V1. Decisão: (a) usar `whatsapp_instance_id` como **conexão padrão do departamento** para conversas iniciadas por agentes daquele departamento (`useNewConversation`), e (b) **dropar `whatsapp_api_key`** + a função (credencial em texto puro em tabela de negócio; o Vault do E09 é o lugar).
- [ ] Ordem: PR do front deixa de ler a função → merge → deploy → migration de DROP (CLAUDE.md §1.6: `DROP` nunca antes do código).
- Verificação: `get_department_whatsapp_credentials` inexistente; catálogo e `known-violations.json` atualizados; guard verde.

### E38 🟡 `whatsapp_connection_queues`: usar ou remover
- [ ] 0 linhas; `useConnectionQueues.ts` e teste existem; nenhuma edge lê a tabela. Verificar se a distribuição de conversas (`assign`/`auto-assign`) considera a fila da conexão. Se não considera, ou liga (conversa entrando pela conexão X cai na fila Y) ou a tabela e o hook são código morto.
- [ ] Recomendação: ligar — é a peça que dá sentido a "número de vendas" vs. "número de suporte".
- Verificação: conversa nova pela conexão X recebe `queue_id` da fila configurada.

### E39 🟡 Política de contato em duas conexões (documentar o que já existe)
- [ ] `getContactByPhone` (`evolution-helpers.ts:225-245`) já implementa: procura por (telefone, conexão); se não acha, procura global e **move** o contato para a conexão atual. Ou seja: 1 contato, último canal vence. É uma política válida, mas invisível.
- [ ] Documentar em `docs/architecture/` e mostrar no `ContactDetails` "Canal atual: <conexão>"; registrar a troca em `contact_history`/timeline se existir.
- Verificação: contato que escreve para A e depois para B aparece com canal B e histórico da troca.

### E40 🟡 Talk X: conexão desconectada não derruba a campanha
- [ ] `useCampaignEditor.ts:264-267` lista só conexões `connected` com `instance_id`; ao agendar, a conexão pode cair antes do disparo. `talkx-scheduler` deve **adiar** (status `waiting_connection`, evento) em vez de deixar `talkx-send` estourar no `.single()`.
- Verificação: campanha agendada + conexão marcada `disconnected` → status adiado; ao reconectar, retoma sozinha.

### E41 🟢 Nova conversa sempre com conexão
- [ ] `useNewConversation.ts:94`: `whatsapp_connection_id: selectedConnection || null` — `null` faz o claim depender só de `contact.whatsapp_connection_id` (4 contatos sem conexão hoje). Default = conexão do departamento (E37) ou a padrão (E35); nunca `null`.
- Verificação: `select count(*) from contacts where whatsapp_connection_id is null` não cresce após deploy; backfill dos 4 para a padrão.

---

## F6 — UI, código morto e segurança (E42–E46)

### E42 🔴 Trava de "Nova conexão" até F1–F3 fecharem
- [ ] Hoje o botão existe e produz uma conexão inoperante (token perdido, QR da PRINCIPAL, health-check contaminado). Chave `multi_connection_enabled` em `global_settings` (default `false`); botão desabilitado com tooltip "Disponível após a atualização multi-conexão". A edge `create-instance` também recusa enquanto `false`.
- [ ] Ligar em E50, depois do teste de aceitação.
- Verificação: botão desabilitado em produção hoje; `functions_invoke evolution-api {action:'create-instance'}` → 403 com mensagem.

### E43 🟡 Remover integrações e actions que a GO não tem
- [ ] `IntegrationsPanel.tsx` (Typebot, OpenAI, Chatwoot…) e ~45 actions de `evolution-api/index.ts` (`set/get/delete-chatwoot|typebot|openai|dify|flowise|evolution-bot|rabbitmq|sqs|kafka|nats|pusher|evoai`, `create/find/delete-template`, `set/get-proxy`, `get-catalog`, `get-collections`, `typebot-sessions`, `typebot-change-status`, `start-typebot`, `send-template`, `offer-call`, `find-chats`, `find-messages`, `find-status-messages`, `mark-unread`, `toggle-ephemeral`, `invite-info`, `set-presence`, `set-settings`, `get-settings`, `get-webhook`) caem no "não mapeado → GO 404" do tradutor. São botões que só produzem toast de erro.
- [ ] Remover do painel e da edge (lista exata gerada por script no PR: actions × `translateV2ToGo` retornando `null`). `evolutionExternal.ts` e `useEvolutionApi.test.ts` ajustados.
- Verificação: `grep -c "action === '" evolution-api/index.ts` ≈ 60; bundle do `ConnectionsView` menor (`performance-budget.json` continua verde).

### E44 🟡 Grants de `whatsapp_connections` e das views
- [ ] `anon` e `authenticated` têm `TRUNCATE`, `TRIGGER`, `REFERENCES` na tabela (privilégios que **não** passam por RLS); `anon` tem `SELECT` nas três views. RLS de linha segura o dado, mas `TRUNCATE` por `authenticated` é uma linha de SQL de distância de zerar as conexões.
- [ ] `REVOKE ALL ON whatsapp_connections FROM anon; REVOKE TRUNCATE, TRIGGER, REFERENCES ON whatsapp_connections FROM authenticated; REVOKE SELECT ON whatsapp_connections_safe, whatsapp_connections_agent, whatsapp_connections_public FROM anon;` — mesmo padrão dos PRs #718/#720 de hoje. `grants-baseline.json` regenerado.
- Verificação: `information_schema.role_table_grants` sem `anon` nas quatro relações; app continua funcionando logado (RLS por `is_admin_or_supervisor` e as views para agente).

### E45 🟡 Schema Zod para o corpo de `evolution-api`
- [ ] Após E17: `EvolutionApiRequestSchema` em `_shared/schemas.ts` com `action` enum (lista do E43) e `instance` obrigatório por ação. Erros de validação seguem `validationErrorResponse` (já usado no webhook).
- Verificação: `tests/contracts/` com 3 casos (ação inválida, instância ausente, corpo válido).

### E46 🟢 Substituir `EVOLUTION_API_GAPS_ANALYSIS.md`
- [ ] Documento de 2026-04 contra a v2 1.0.1 ("cobertura 190%") induz a erro. Gerar `docs/EVOLUTION_GO_ROUTE_MATRIX.md` a partir do tradutor: rota v2 → rota GO → auth → mapeada/não mapeada → usada por (edge/hook). Script `scripts/evolution/route-matrix.mjs` para manter atualizado.
- Verificação: matriz no repo; `GAPS_ANALYSIS` movido para `docs/_superseded/` com nota.

---

## F7 — Testes e observabilidade (E47–E48)

### E47 🔴 Testes unitários de `translateV2ToGo`
- [ ] 0 testes hoje para 309 linhas que decidem **qual instância** e **qual rota** recebem cada mensagem. Suite (vitest, importando o `.ts` da edge como já faz `tests/contracts/evolution-call-handler.contract.test.ts`): para cada rota mapeada → `path/method/auth/body`; casos `invalid`; `/instance/connect` nunca com body vazio; `/label/handleLabel` sem heurística LID; `contentType:'text/json'` em `updateParticipant`; rotas não mapeadas → `null`.
- [ ] Rodar no job `🧪 Unit Tests` (já required).
- Verificação: `npm run test -- evolution-go-routes` verde; cobertura do arquivo ≥ 90 %.

### E48 🟡 Observabilidade por instância
- [ ] `Logger` das edges (`_shared/validation.ts`) ganha campo `instance` quando disponível; `message-delivery`, `talkx-send`, `evolution-webhook` e `connection-health-check` preenchem.
- [ ] Painel simples no Monitoring: mensagens enviadas/recebidas por conexão por dia (SQL sobre `messages.whatsapp_connection_id` — índice já existe pelo unique) e falhas por `delivery_error`.
- Verificação: consulta do painel < 200 ms com `EXPLAIN`; logs filtráveis por `instance` no Dashboard.

---

## F8 — Fechamento (E49–E50)

### E49 🟢 Documentação e CLAUDE.md
- [ ] CLAUDE.md §2: "Instância padrão `PRINCIPAL`" → "instâncias vivem em `whatsapp_connections` + Vault (`get_instance_token`); secrets globais são só `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`". `.env.example`, `secret-surface-inventory.md`, `EVOLUTION_WEBHOOKS_DOCUMENTATION.md` (gate por instância) e runbook do E07.
- [ ] `PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md:285`: anotar que a decisão "credencial global" foi revertida por este plano.
- Verificação: `grep -n PRINCIPAL CLAUDE.md` só em contexto histórico.

### E50 🔴 Teste de aceitação com duas instâncias reais
- [ ] Critério de "pronto" do plano inteiro, com um número reserva real: (1) criar conexão pela UI (E11/E27) → QR da instância **nova**; (2) escanear → `connected` só nela; (3) receber mensagem nela → conversa com `whatsapp_connection_id` correto; (4) responder → sai pela mesma instância (`apikey` nos logs = token dela); (5) campanha Talk X por essa conexão; (6) health-check mostra as duas com estados independentes; (7) derrubar uma → só ela alerta, a outra continua enviando; (8) excluir → some da GO e do Vault.
- [ ] Só então `multi_connection_enabled=true` (E42) e E21 (aposentar os secrets).
- Verificação: os 8 passos com evidência (log, SQL ou request) em `docs/audits/DOSSIE_MULTI_CONEXAO_<data>.md`.

---

## Ordem de ataque sugerida

1. **Hoje (bloqueio ativo):** E01 → E02 → E42 → E03 → E07 (nenhum toca a GO; protegem o número e o cliente). E04 só com `APROVADO`.
2. **Ainda hoje, sem risco à PRINCIPAL:** E08 → E09 → E47 (fundação + testes do tradutor, tudo offline).
3. **Amanhã, após a volta do número:** E05 (retomada) → E10 (backfill) → E15 → E16 → E17 → E18 → E30 (um deploy de edges só, aprovado no environment).
4. **Semana 1:** E11 → E12 → E19 → E23 → E24 → E25 → E26 → E35 → E36.
5. **Semana 2:** E20 → E22 → E27 → E28 → E32 → E33 → E37 → E38 → E40 → E41 → E43 → E44 → E45.
6. **Observação (48 h) e fechamento:** E31 → E13 → E14 → E21 → E29 → E34 → E39 → E46 → E48 → E49 → **E50**.

Dependências duras: E15/E16 ← E09; E18/E19/E23/E24/E30 ← E16; E31 ← E10+E30+48 h; E21 ← E31; E37 (DROP) ← front sem a função; E42 desliga só em E50.
