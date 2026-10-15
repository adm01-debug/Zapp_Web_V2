-- alerta_falha_envio_por_conexao
-- Rollback: desagenda o job do pg_cron e dropa a função do monitor.
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule(jobid) from cron.job where jobname = 'alerta-falha-envio-por-conexao';
--   drop function if exists public.alert_outbound_failure_rate();
--
-- Monitor automático de falha de ENVIO por conexão (o "canário" do WhatsApp).
--
-- PROBLEMA: nenhuma autoridade olha a taxa de falha do outbound. Quando uma conexão
-- começa a recusar envios (instância caiu, número banido, provedor degradado), nada no
-- sistema percebe: o operador só descobre pelo cliente reclamando, e a fila de 'sending'
-- entupida (linhas que ninguém confirmou) fica invisível. O varredor da migration
-- 20261013210005 marca essas linhas como 'failed' após 15 min, mas ninguém é avisado.
--
-- SOLUÇÃO: uma função de manutenção agendada a cada 5 min no pg_cron que calcula, POR
-- CONEXÃO, na última hora:
--   * taxa de falha = 'failed' / amostra de envios com desfecho terminal
--     ('sent','delivered','read','failed','outcome_unknown');
--   * quantidade de mensagens PRESAS em envio = as que o varredor de 20261013210005
--     reprova AGORA (status='sending', external_id nulo, client_message_id preenchido,
--     sem lease vivo e último toque
--     coalesce(delivery_claim_expires_at, updated_at) mais antigo que 15 min — o MESMO
--     critério do sweep_stale_outbound_sending) SOMADAS às que ele já reprovou na última
--     hora (status='failed', delivery_failure_reason='nao_despachada', updated_at na
--     última hora). Sem essa soma o alerta quase nunca sai: monitor e varredor rodam no
--     mesmo cron */5 e o varredor costuma converter as presas antes de o monitor contá-las;
--   * quantidade de 'outcome_unknown' (enviadas mas sem confirmação).
-- A conexão da linha é resolvida com o MESMO coalesce do claim/varredor:
-- coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id) via contacts —
-- a linha pode estar sem conexão direta (é o caso 'sem_conexao' do fail_outbound_unclaimed).
-- Dispara quando a amostra é confiável (>= 20 envios terminais) e a taxa de falha chega a
-- 20% OU há mais de 10 mensagens presas em envio.
--
-- Alerta no warroom_alerts (som + push já existentes reagem ao INSERT na tabela), com
-- dedupe_key estável `envio-falha:<conexao>:<hora>` na hora corrente: rodar de novo na
-- mesma hora NÃO cria segundo alerta (ON CONFLICT ... DO NOTHING sobre o índice único
-- parcial ux_warroom_alerts_dedupe_key). Texto próprio para cada gatilho: quando o disparo
-- é por presas (taxa abaixo do limiar) o texto NÃO fala em "amostra insuficiente" — mostra
-- as falhas e delega o aviso à contagem de presas. Sem telefone e sem texto de mensagem
-- no alerta: só o NOME da conexão e as contagens. O limiar é fixo na função (nada
-- editável por tela).
--
-- DEPENDÊNCIA: usa a coluna messages.delivery_failure_reason criada pela migration
-- 20261013210005 (cartão pai t_bc890f8a), aplicada antes por timestamp.
--
-- Classe: aditiva / manutenção — cria UMA função e agenda UM job, sem DDL em objeto vivo,
-- sem DML em dado existente, sem mudança de papel/ACL além do REVOKE da função nova.

create or replace function public.alert_outbound_failure_rate()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_min_sample  constant integer  := 20;
  v_failure_rate constant numeric := 0.20;
  v_stuck_limit constant integer  := 10;
  v_window      constant interval := interval '1 hour';
  v_stuck_age   constant interval := interval '15 minutes';
  v_inserted    integer := 0;
begin
  with janela as (
    select
      coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id) as connection_id,
      count(*) filter (
        where message.status in ('sent', 'delivered', 'read', 'failed', 'outcome_unknown')
      ) as amostra,
      count(*) filter (where message.status = 'failed') as falhas,
      count(*) filter (where message.status = 'outcome_unknown') as sem_confirmacao
    from public.messages as message
    left join public.contacts as contact on contact.id = message.contact_id
    where message.sender = 'agent'
      and message.created_at >= statement_timestamp() - v_window
      and coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id) is not null
    group by 1
  ),
  presas as (
    select candidata.connection_id, count(*) as total
    from (
      -- ainda presas: MESMO critério do varredor sweep_stale_outbound_sending
      -- (20261013210005) — 'sending', external_id nulo, client_message_id preenchido,
      -- sem lease vivo e último toque
      -- coalesce(delivery_claim_expires_at, updated_at) mais antigo que 15 min.
      select coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id) as connection_id
      from public.messages as message
      left join public.contacts as contact on contact.id = message.contact_id
      where message.sender = 'agent'
        and message.status = 'sending'
        and message.external_id is null
        and message.client_message_id is not null
        and (message.delivery_claim_token is null
          or message.delivery_claim_expires_at <= statement_timestamp())
        and coalesce(message.delivery_claim_expires_at, message.updated_at)
              <= statement_timestamp() - v_stuck_age
      union all
      -- já varridas na última hora: o varredor roda no mesmo */5 e converte as
      -- presas em 'failed' antes de o monitor contá-las; o alerta não pode
      -- depender de pegá-las ainda 'sending'.
      select coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id) as connection_id
      from public.messages as message
      left join public.contacts as contact on contact.id = message.contact_id
      where message.sender = 'agent'
        and message.status = 'failed'
        and message.delivery_failure_reason = 'nao_despachada'
        and message.updated_at >= statement_timestamp() - v_window
    ) as candidata
    where candidata.connection_id is not null
    group by candidata.connection_id
  ),
  incidente as (
    select
      connection.id as connection_id,
      connection.name as connection_name,
      coalesce(janela.amostra, 0) as amostra,
      coalesce(janela.falhas, 0) as falhas,
      coalesce(janela.sem_confirmacao, 0) as sem_confirmacao,
      coalesce(presas.total, 0) as presas,
      (coalesce(janela.amostra, 0) >= v_min_sample
        and coalesce(janela.falhas, 0)::numeric
              / nullif(coalesce(janela.amostra, 0), 0) >= v_failure_rate) as taxa_estourada
    from public.whatsapp_connections as connection
    left join janela on janela.connection_id = connection.id
    left join presas on presas.connection_id = connection.id
    where (coalesce(janela.amostra, 0) >= v_min_sample
             and coalesce(janela.falhas, 0)::numeric
                   / nullif(coalesce(janela.amostra, 0), 0) >= v_failure_rate)
       or coalesce(presas.total, 0) > v_stuck_limit
  )
  insert into public.warroom_alerts (alert_type, title, message, source, dedupe_key)
  select
    'critical',
    'Falha de envio na conexão ' || coalesce(incidente.connection_name, incidente.connection_id::text),
    'Falha de envio na conexão ' || coalesce(incidente.connection_name, incidente.connection_id::text) || ': '
      || case
           when incidente.taxa_estourada
             then incidente.falhas || ' de ' || incidente.amostra
                    || ' envios da última hora falharam ('
                    || round(100.0 * incidente.falhas / incidente.amostra) || '%).'
           else incidente.falhas || ' de ' || incidente.amostra
                  || ' envios terminais da última hora falharam'
                  || ' (não bateu o limiar de taxa).'
         end
      || ' Presas em envio (mais de 15 min): ' || incidente.presas || '.'
      || ' Sem confirmação: ' || incidente.sem_confirmacao || '.',
    'envio-falha',
    'envio-falha:' || incidente.connection_id::text || ':'
      || to_char(date_trunc('hour', statement_timestamp() at time zone 'utc'), 'YYYYMMDDHH24')
  from incidente
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

comment on function public.alert_outbound_failure_rate() is
  'Monitor de falha de envio por conexao (R2): taxa de falha da ultima hora (>=20% com amostra >=20 envios terminais) ou mais de 10 mensagens presas em envio (as que o sweep_stale_outbound_sending reprova agora — sending com external_id nulo, client_message_id preenchido, sem lease vivo e coalesce(delivery_claim_expires_at, updated_at) > 15 min — somadas as ja reprovadas na ultima hora, delivery_failure_reason=nao_despachada). Conexao resolvida por coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id). Grava 1 alerta critico por conexao por hora no warroom_alerts (dedupe_key envio-falha:<conexao>:<hora>; som/push existentes reagem ao INSERT; titulo/mensagem usam coalesce(connection_name, connection_id::text)). Sem telefone nem texto no alerta. Limiar fixo; so o dono/cron executa.';

revoke all on function public.alert_outbound_failure_rate()
  from public, anon, authenticated, service_role;

-- ============ agendamento (idempotente) ============
select cron.unschedule(jobid)
from cron.job
where jobname = 'alerta-falha-envio-por-conexao';

select cron.schedule(
  'alerta-falha-envio-por-conexao',
  '*/5 * * * *',
  $$select public.alert_outbound_failure_rate();$$
);
