-- my_network_status
-- Rollback: dropa a funcao public.my_network_status(); nenhuma tabela, policy, GRANT existente ou dado e tocado (a funcao e so de leitura).
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.my_network_status();
--
-- PROBLEMA (cartao t_684693d3)
-- O painel de bloqueio geografico (GeoBlockingPanel) precisa MOSTRAR ao admin o
-- que o sistema detecta para ele hoje: o pais e o IP que a politica de rede
-- (supabase/functions/_shared/request-policy.ts + resolve_network_policy) usa na
-- decisao. Hoje nao existe nenhuma fonte para isso: o admin nao consegue saber se
-- o `cf-ipcountry` esta chegando (e portanto se o filtro de pais tem dado para
-- trabalhar) sem ler log de edge, e um pais que chega ausente/fora do padrao e
-- indistinguivel de "sem geo configurada".
--
-- CORRECAO (aditiva: so cria UMA funcao; nenhuma coluna, tabela, policy, GRANT
-- existente ou dado e alterado)
--   public.my_network_status() devolve UMA linha `(country, ip_seen)` resolvida
--   EXATAMENTE como a politica enxerga:
--     * country  — do cabecalho confiavel `cf-ipcountry` (o unico que a infra em
--       frente SOBRESCREVE; espelha TRUSTED_COUNTRY_HEADER_NAMES), normalizado
--       igual a normalizeCountryCode: trim + maiusculas, e so aceita ISO alpha-2
--       (/^[A-Z]{2}$/). Vazio, invalido ou ausente vira NULL = "o gateway nao
--       informa pais" (a politica entao nao bloqueia por pais — falha fechado no
--       sentido de nao inventar codigo). Cabecalho de pais NAO confiavel (ex.:
--       `x-country`) e IGNORADO, para nao virar porta de spoofing.
--     * ip_seen  — do MESMO par de cabecalhos de getClientIP (validation.ts):
--       ultimo item (mais a direita) de `x-forwarded-for`, senao `x-real-ip`,
--       senao a sentinela 'unknown' (e literalmente o valor que a politica
--       recebe como p_ip hoje).
--   Os cabecalhos vem do GUC `request.headers`, que o PostgREST define para a
--   requisicao HTTP que chamou a RPC — nao ha parametro nenhum aceito do cliente,
--   entao o retorno e sempre "como o gateway viu o chamador".
--
-- PERMISSAO / FECHADA POR PADRAO
--   SECURITY DEFINER com search_path fixo. EXECUTE negado a PUBLIC e a anon;
--   concedido a authenticated. Mesmo entre authenticated, o corpo so responde a
--   admin ou supervisor (`is_admin_or_supervisor(auth.uid())`); qualquer outro
--   recebe 42501 sem ver nada. Sem JWT (ex.: service_role fora de um chamador
--   humano) tambem e 42501: nao existe "admin anonimo".
--   E so leitura: nao grava, nao loga e nao expoe PII de terceiros — devolve o
--   proprio pais/IP de quem chamou, para ele mesmo.
--
-- SEM ORACULO: a mensagem de negacao e a mesma para todo chamador nao-admin (nao
-- distingue "existe" de "nao existe") e o valor de retorno nao depende de config.

create or replace function public.my_network_status()
returns table (country text, ip_seen text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_headers  jsonb;
  v_country  text;
  v_ip       text;
begin
  -- So admin ou supervisor. Sem JWT (v_uid NULL) cai aqui tambem: nenhum papel de
  -- servico ganha resposta por nao ter chamador humano.
  if v_uid is null or not public.is_admin_or_supervisor(v_uid) then
    raise exception 'my_network_status: acesso negado' using errcode = '42501';
  end if;

  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;

  -- Pais: SO o cabecalho confiavel cf-ipcountry, normalizado como normalizeCountryCode.
  v_country := upper(btrim(coalesce(v_headers ->> 'cf-ipcountry', '')));
  if v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  -- IP: mesma regra de getClientIP — ultimo item de x-forwarded-for, senao x-real-ip.
  v_ip := nullif(btrim(regexp_replace(coalesce(v_headers ->> 'x-forwarded-for', ''), '.*,', '')), '');
  if v_ip is null then
    v_ip := nullif(btrim(coalesce(v_headers ->> 'x-real-ip', '')), '');
  end if;
  if v_ip is null then
    v_ip := 'unknown';
  end if;

  return query select v_country, v_ip;
end;
$$;

comment on function public.my_network_status() is
  'Somente admin/supervisor: devolve (country, ip_seen) resolvidos como a politica de rede do Edge (cf-ipcountry / x-forwarded-for) - somente leitura, sem parametros.';

-- Fechada por padrao: nada de EXECUTE para PUBLIC/anon.
revoke all on function public.my_network_status() from public;
revoke all on function public.my_network_status() from anon;
grant execute on function public.my_network_status() to authenticated;
