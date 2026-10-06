-- whatsapp_default_connection_rpc_atomica
-- Rollback: DROP FUNCTION IF EXISTS public.set_default_whatsapp_connection(uuid);

-- ============================================================================
-- TRA-004 / item 174 (P2, area migrations) — "Troca de conexao padrao nao e
-- atomica e anuncia sucesso sem verificar erros".
--
-- O defeito medido na auditoria: o hook useConnectionsManager.handleSetDefault
-- (src/hooks/inbox/useConnectionsManager.ts) dispara DOIS UPDATE separados por
-- HTTP (cada um e a sua propria transacao no PostgREST):
--
--     await supabase.from('whatsapp_connections').update({ is_default: false }).neq('id', id);
--     await supabase.from('whatsapp_connections').update({ is_default: true  }).eq('id', id);
--     setConnections(...); toast({ title: 'Conexao padrao atualizada' });
--
-- A falha entre as duas operacoes deixa ZERO conexoes padrao e a interface
-- afirma que a troca terminou (nenhum dos dois `error` e lido). O indice parcial
-- unico `whatsapp_connections_one_default` (ON (is_default) WHERE is_default,
-- migration 20260925190000) garante no MAXIMO uma padrao; nao garante ao menos
-- uma, e nao da transacao ao par de updates.
--
-- required_fix do finding: "Mover a troca para RPC atomica com autorizacao e
-- resultado validado". Esta migration entrega SO a fronteira de banco. O consumo
-- pelo hook (só atualizar UI depois do sucesso, tratar erro e revalidar o estado
-- retornado) e da area de hooks (src/**) e esta registrado no cartao.
--
-- Contrato da RPC:
--   * UMA transacao para os dois UPDATEs: qualquer falha (validacao, autorizacao,
--     alvo inexistente, violacao do indice unico) aborta TUDO — a padrao anterior
--     permanece. Nao existe estados intermediarios "desmarcado".
--   * Concorrencia: a troca inteira e uma secao critica serializada por
--     pg_advisory_xact_lock (chave canonica constante, abaixo). Duas chamadas
--     concorrentes terminam com exatamente UMA padrao (a ultima vence) e ambas
--     concluem sem erro 23505.
--   * Autorizacao: a MESMA da policy de UPDATE da tabela
--     ("Admins can update connections" → is_admin_or_supervisor(auth.uid())).
--     Nao afrouxa nem amplia quem pode trocar a padrao.
--   * Sem oraculo: chamador sem permissao e conexao inexistente devolvem o
--     MESMO erro (P0002, "inexistente ou sem permissao"); a existencia de um id
--     nao e sondeavel por quem nao pode trocar.
--   * Resultado validado dentro da funcao: ao final confere que sobrou
--     exatamente UMA padrao; se nao, aborta (nada aplicado).
--   * Retorno: uuid da conexao que ficou padrao (o chamador revalida o estado).
--   * Idempotente: alvo que ja e padrao devolve o mesmo uuid sem efeito.
--
-- Efeitos colaterais conhecidos: gatilho update_whatsapp_connections_updated_at
-- (BEFORE UPDATE FOR EACH ROW → update_updated_at_column) reescreve updated_at
-- apenas das linhas de fato alteradas — no maximo a padrao anterior e o alvo.
-- Nao ha gatilho de status (esse e BEFORE UPDATE OF status) nem escrita em outra
-- tabela, evento, Vault ou realtime.
--
-- ACL: funcao nova nasce fechada. REVOKE de PUBLIC, anon, authenticated e
-- service_role pela assinatura exata; GRANT so para authenticated (unico
-- chamador da troca; nao ha consumidor de Edge/cron). Nenhum GRANT, papel ou
-- policy de objeto EXISTENTE foi alterado.
-- ============================================================================

create or replace function public.set_default_whatsapp_connection(p_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_padroes integer;
begin
  if p_connection_id is null then
    raise exception 'set_default_whatsapp_connection: p_connection_id obrigatorio'
      using errcode = '22004';
  end if;

  -- Secao critica: serializa trocas concorrentes de conexao padrao.
  -- Chave constante "whatsapp_connections:set_default" (nao depende de hashtext).
  perform pg_advisory_xact_lock(841723199);

  -- Autorizacao ANTES de tocar em linha: mesma regra da policy de UPDATE.
  -- Chamador sem permissao e id inexistente produzem o MESMO erro (sem oraculo).
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'set_default_whatsapp_connection: conexao inexistente ou sem permissao'
      using errcode = 'P0002';
  end if;

  select c.id into v_id
    from public.whatsapp_connections c
   where c.id = p_connection_id
   for update;

  if v_id is null then
    raise exception 'set_default_whatsapp_connection: conexao inexistente ou sem permissao'
      using errcode = 'P0002';
  end if;

  -- 1) desmarca a padrao anterior (nao ha update em massa: so a linha que e padrao);
  update public.whatsapp_connections
     set is_default = false
   where is_default is true
     and id <> p_connection_id;

  -- 2) marca o alvo (no-op se ja era padrao);
  update public.whatsapp_connections
     set is_default = true
   where id = p_connection_id
     and is_default is not true;

  -- Resultado validado: exatamente uma padrao. O indice unico garante "no maximo
  -- uma"; esta checagem garante "ao menos uma" — se falhar, a transacao inteira
  -- e desfeita e a padrao anterior permanece.
  select count(*) into v_padroes
    from public.whatsapp_connections
   where is_default is true;

  if v_padroes <> 1 then
    raise exception 'set_default_whatsapp_connection: estado inconsistente (% padroes)', v_padroes
      using errcode = '23514';
  end if;

  return p_connection_id;
end;
$function$;

revoke all on function public.set_default_whatsapp_connection(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_default_whatsapp_connection(uuid)
  to authenticated;

comment on function public.set_default_whatsapp_connection(uuid) is
  'TRA-004 (item 174): troca atomica da conexao padrao do WhatsApp. Uma transacao '
  '(desmarca a anterior e marca o alvo), serializada por advisory lock, autorizada '
  'por is_admin_or_supervisor(auth.uid()) (mesma policy de UPDATE da tabela) e com '
  'resultado validado (exatamente uma padrao ao final). Retorna o uuid do alvo. '
  'Erro identico para id inexistente e chamador sem permissao.';
