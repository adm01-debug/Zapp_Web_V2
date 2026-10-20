# Runbook — Incidentes do Multiplix (fila, worker, voz, conexão, consumo e Singu)

> Resposta rápida aos seis cenários operacionais do disparo Multiplix (item F91 do
> `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`). O cenário de
> dead letter — o mais comum — já vive no `docs/INCIDENT-RUNBOOK.md` (§"Disparo Multiplix
> com falhas / itens em dead letter"); aqui ficam os que faltavam.
>
> Fundamento: `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md` e
> `docs/multiplix/PONTE_SINGU.md`. As edges envolvidas são `multiplix-dispatch` (API de
> domínio), `multiplix-send` (worker do cron) e `evolution-webhook` (recibos e respostas).
>
> **Toda consulta deste runbook é SOMENTE LEITURA.** Nada aqui exporta, copia, imprime ou
> compartilha dado de contato; as funções de diagnóstico do módulo já devolvem destino
> mascarado e o restante se filtra por id. Nunca edite `multiplix_*` à mão: quem escreve
> nessas tabelas é a RPC/edge com `service_role`.
>
> Severidade: **SEV-3** (o disparo de um departamento para, o resto do sistema segue), com
> uma exceção — **Conexão caída é SEV-2** enquanto o canal WhatsApp inteiro estiver fora.

## Panorama em uma consulta

```sql
-- Troque <dispatch_id>. Status do disparo + como estão os itens:
select d.status, d.total_recipients, d.sent_count, d.failed_count, d.delivered_count,
       d.paused_at, d.pause_reason
  from public.multiplix_dispatches d
 where d.id = '<dispatch_id>';

select status, count(*) as itens, min(created_at) as primeiro, max(sent_at) as ultimo_envio
  from public.multiplix_delivery_items
 where dispatch_id = '<dispatch_id>'
 group by status
 order by status;
```

## 1. Fila travada (itens prontos que ninguém puxa)

**Sintoma:** o disparo está `sending`, existem itens `pending`/`failed_transient` vencidos e
`sent_at` não avança há mais que a janela do worker (o cron roda a cada 2 min); nenhum
`item_claimed` novo na trilha (`multiplix_events`).

**Consulta:**

```sql
-- Itens prontos para sair (é esta fila que o worker deveria puxar):
select count(*) as prontos, min(next_attempt_at) as mais_antigo
  from public.multiplix_delivery_items
 where status in ('pending','failed_transient')
   and (next_attempt_at is null or next_attempt_at <= now());

-- Há quanto tempo nada sai deste disparo:
select max(sent_at) as ultimo_envio, now() as agora
  from public.multiplix_delivery_items
 where dispatch_id = '<dispatch_id>';

-- Lease vencido = o worker pegou o item e não terminou (volta ao claim sozinho):
select count(*) as lease_vencido
  from public.multiplix_delivery_items
 where lease_until is not null and lease_until < now();
```

**Ação:** conferir o agendamento do worker antes de mexer no disparo —
`select jobid, jobname, schedule, active from cron.job where jobname = 'multiplix-send-trigger';`
e as últimas execuções em `cron.job_run_details`. Se o job está ativo e o log da edge
`multiplix-send` não tem entrada recente, é o cenário 2 (worker morto). Item com lease vencido
**não** se reenvia à mão: o claim devolve o item à fila e a `idempotency_key`
(`dispatch_id:versão:recipient:bloco`) garante que ele não sai duas vezes.
**Dono:** Engenharia — dono do módulo Multiplix.
**Escalada:** SEV-3; se o disparo tinha janela de horário combinada, avisar a Operação.

## 2. Worker morto (o cron do envio parou de rodar)

**Sintoma:** `cron.job_run_details` sem execução nova na janela de 2 min, ou execuções
seguidas com erro; leases vencidos crescendo e, no log da edge, `multiplix_heartbeat_failed`
/ `multiplix_heartbeat_not_renewed`.

**Consulta:**

```sql
select jobid, status, return_message, start_time, end_time
  from cron.job_run_details
 order by start_time desc
 limit 20;
```

**Ação:** comparar com `cron.job` (job `multiplix-send-trigger`, `active = true`). Causas
típicas: job inativo, segredo do cron divergente (o worker valida `x-cron-secret` contra o
Vault em `get_multiplix_cron_secret` — a rotação está em `docs/runbooks/cron-secret-rotation.md`)
ou a edge respondendo erro. Corrigido o cron, a fila drena sozinha na próxima passada; itens
com lease vencido voltam ao claim. **Não** dispare reenvio manual em massa.
**Dono:** Engenharia — dono do módulo Multiplix.
**Escalada:** SEV-3 (vira SEV-2 se o worker ficar parado com disparo agendado em horário comercial).

## 3. TTS fora (bloco de voz não renderiza / não sai)

**Sintoma:** itens de bloco de voz ficam pendentes de ativo; a edge responde que o ativo está
ausente ou invalidado; provedor de voz com erro/timeout.

**Consulta:**

```sql
-- Ativos de voz do módulo (quem usa voz sai por aqui):
select count(*) filter (where invalidated_at is null) as ativos_validos,
       count(*) filter (where invalidated_at is not null) as invalidados,
       max(created_at) as ultimo_ativo
  from public.multiplix_voice_assets;

-- Itens de voz sem ativo (é o que trava o envio):
select count(*) as itens_sem_ativo
  from public.multiplix_delivery_items
 where block_id in (select id from public.multiplix_blocks where asset_id is not null)
   and voice_asset_id is null;
```

**Ação:** a geração de voz do módulo (fila de TTS do F65) **ainda não existe** — o envio
consome ativo JÁ renderizado (`multiplix_voice_assets.caminho`, bucket privado
`multiplix-voice`) e item sem ativo válido não sai. Se o provedor (`elevenlabs-*`) estiver
recusando, é causa externa: registrar o erro do provedor e aguardar; **não** existe
retentativa de TTS do Multiplix para forçar hoje. Não marque o item como enviado.
**Dono:** Engenharia — dono do módulo Voz/IA (com o dono do Multiplix para a fila de TTS).
**Escalada:** SEV-3.

## 4. Conexão caída (o canal WhatsApp caiu)

**Sintoma:** `whatsapp_connections.status` fora de `connected` (banner de desconexão no app);
disparos em `paused` com `pause_reason = 'connection_at_risk'`; eventos
`connection_at_risk` / `connection_failure` na trilha.

**Consulta:**

```sql
select id, instance_id, status, health_status, last_health_check
  from public.whatsapp_connections;

select id, name, status, pause_reason, paused_at
  from public.multiplix_dispatches
 where status = 'paused';

select kind, payload, created_at
  from public.multiplix_events
 where kind in ('connection_at_risk', 'connection_failure')
 order by created_at desc
 limit 20;
```

**Ação:** reconectar a instância pelo banner do app (se for bloqueio da Meta, siga
`docs/runbooks/bloqueio-meta.md` — não insistir em reconectar em loop). **A retomada é
MANUAL**: três falhas permanentes consecutivas (ou um sinal de banimento/perda de conexão)
pausam TODOS os disparos ativos daquela conexão de propósito — continuar martelando um número
limitado transforma bloqueio temporário em banimento. Retomado o canal, a retomada do disparo
também é manual: chame a edge `multiplix-send` com `{ "dispatchId": "...", "action": "start" }`
(o mesmo caminho de `start`/`pause`/`cancel`; exige ser o dono do disparo ou ter
`multiplix.dispatch.manage_all`).
**Dono:** Operação (on-call) com Engenharia.
**Escalada:** SEV-2 enquanto o canal estiver fora.

## 5. Consumo estourado (saiu mais do que o previsto)

**Sintoma:** itens acima do previsto no `estimate`; disparo auto-pausado com
`pause_reason = 'daily_limit'` (a cota diária da conexão soma Talk X + Multiplix do dia);
consumo de voz acima do estimado.

**Consulta:**

```sql
-- Estimado × realizado do disparo:
select d.total_recipients,
       count(*) filter (where i.sent_at is not null) as enviados_reais,
       sum(a.caracteres) as caracteres_de_voz_reais
  from public.multiplix_dispatches d
  join public.multiplix_delivery_items i on i.dispatch_id = d.id
  left join public.multiplix_voice_assets a on a.id = i.voice_asset_id
 where d.id = '<dispatch_id>'
 group by d.total_recipients;

select id, name, status, pause_reason, paused_at, total_recipients, sent_count, failed_count
  from public.multiplix_dispatches
 where pause_reason is not null
 order by paused_at desc nulls last;
```

**Ação:** `daily_limit` é **esperado** e se resolve sozinho no dia seguinte (a cota é diária por
conexão) — não force o reenvio no mesmo dia. Se o volume passou do combinado, pausar pelo
worker (`action: "pause"`) e falar com o dono do disparo antes de retomar. A estimativa prévia
sai da ação `estimate` do `multiplix-dispatch` (blocos × destinatários aptos, versões de
roteiro e consumo de voz): compare-a com a consulta acima antes de investigar bug.
**Dono:** Operação (dono do disparo) com Engenharia.
**Escalada:** SEV-3.

## 6. Singu indisponível (a ponte não responde)

**Sintoma:** resolução de público/contatos da ponte Singu falhando ou devolvendo vazio; novos
disparos sem aptos; itens com `media_pending`/`requires_template` por falta de dado do contato.

**Consulta:**

```sql
-- Aptidão dos destinatários do disparo (o que a ponte alimenta):
select eligibility, count(*)
  from public.multiplix_recipients
 where dispatch_id = '<dispatch_id>'
 group by eligibility
 order by eligibility;
```

**Ação:** o público é **congelado no confirm** — quem já está na fila continua e **não** é
re-resolvido (é decisão registrada no ADR-007, D5). Não há o que "recalcular" para o disparo
em voo: aguarde a ponte voltar e crie o próximo disparo já com o dado novo. Registre o erro da
ponte e o horário; nada neste cenário se resolve editando a lista à mão.
**Dono:** Engenharia — dono da ponte Singu (com a Operação para o reagendamento).
**Escalada:** SEV-3; SEV-2 se um disparo grande estiver prestes a começar sem público.

## Rastreio de 1 envio (`correlation_id`)

O rastreio combina TRÊS fontes: o id do clique, o log da edge de envio e a trilha de eventos.

```sql
-- 1) O id do CLIQUE: gravado no confirm do disparo (multiplix-dispatch -> RPC).
select kind, correlation_id, created_at
  from public.multiplix_events
 where dispatch_id = '<dispatch_id>' and correlation_id is not null
 order by created_at;

-- 2) A trilha completa do disparo (o que aconteceu, em ordem):
select kind, item_id, recipient_id, payload, created_at
  from public.multiplix_events
 where dispatch_id = '<dispatch_id>'
 order by created_at;
```

```
-- 3) O log da edge de envio: linha JSON com fn/msg/ms + contexto; filtre por dispatchId
--    (e por correlationId, quando existir). Nada de conteúdo de mensagem no log — por
--    desenho (F43) ele só carrega ids, contagens e classe de erro.
```

**Estado atual do rastreio (honesto, medido no código em 2026-10-08):** o `correlation_id`
gerado no clique é gravado em `multiplix_events.correlation_id`; o worker (`multiplix-send`)
gera o **próprio** id por requisição (F43) para o log dele; e o `evolution-webhook` (recibos e
respostas) não carrega id de correlação. Ou seja: **o MESMO id ainda não atravessa os três
saltos**. Enquanto a propagação não fechar, siga o item por `dispatch_id` + `item_id` +
`external_id` (o `external_id` é o que o webhook casa para marcar entrega/leitura e atribuir a
resposta). O que **não** se faz: procurar telefone, nome ou conteúdo no log — isso está fora do
desenho e nenhuma informação de contato sai do sistema.

## Referências

- `docs/INCIDENT-RUNBOOK.md` — dead letter, checklist geral de incidente e severidades.
- `docs/runbooks/slo.md` — métricas com dono e ação (seção "Métricas do Multiplix").
- `docs/runbooks/bloqueio-meta.md` — quando a queda da conexão é bloqueio da Meta.
- `docs/runbooks/cron-secret-rotation.md` — segredo do cron que chama o worker.
- `docs/multiplix/PONTE_SINGU.md` e `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md`.
