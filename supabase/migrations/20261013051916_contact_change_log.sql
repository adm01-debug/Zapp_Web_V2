-- contact_change_log
-- Rollback: derruba o gatilho, a funcao e a tabela de trilha. NENHUM dado de contato e tocado
-- (a trilha em si e append-only e some com a tabela); quem precisar preservar o historico ja
-- gravado deve copiar as linhas ANTES de rodar o rollback.
-- Rollback (SQL executavel, na ordem):
--   drop trigger if exists trg_contact_change_log on public.contacts;
--   drop function if exists public.log_contact_change();
--   drop table if exists public.contact_change_log;
--
-- TRILHA DE ALTERACAO DE CONTATO (paridade com o painel de historico do V3, sem o PII do V3).
--
-- O QUE FALTAVA: o sistema guarda QUEM mudou o que em papeis (audit_role_changes), em acoes
-- administrativas (audit_admin_change) e na EXCLUSAO de contato (contact_deletion_audit), mas
-- nao guardava as edicoes COMUNS de contato (nome, telefone, dono, fila, endereco...). Sem
-- isso nao ha como responder "quem apagou o telefone deste contato?" sem depender de snapshot
-- externo. O V3 resolveu com `zapp.contact_audit_log`, que guarda old_values/new_values jsonb
-- — e portanto carrega telefone, e-mail e endereco para dentro da trilha. Este cartao faz o
-- mesmo sem o PII: grava SO OS NOMES dos campos alterados (`campos text[]`), NUNCA os valores.
--
-- CLASSE: ADITIVA PURA (tabela nova + funcao nova + gatilho novo em `public.contacts`). Nao
-- altera coluna, policy, GRANT ou dado de contato existente. Reaplicavel: `CREATE TABLE IF NOT
-- EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` antes do `CREATE TRIGGER`,
-- `REVOKE ALL` + `GRANT` (idempotentes) e `CREATE POLICY` guardado por `IF NOT EXISTS`.
--
-- COMO O PII E BARRADO: o gatilho percorre uma LISTA BRANCA de colunas de negocio e monta a
-- trilha com `array_agg(k)` — a CHAVE do campo, jamais `v_new -> k`. Nenhum caminho do codigo
-- concatena valor de coluna no INSERT. Telefone, e-mail, notas e endereco aparecem na trilha
-- apenas como os nomes `phone`, `email`, `notes`, `address` — nunca como conteudo.
--
-- ATOR: `performed_by = auth.uid()` (quem estava logado) e `performed_by_profile` resolvido em
-- `public.profiles`. Quando a escrita vem de `service_role`/SQL direto (sem JWT) `performed_by`
-- fica NULO, mas a autoria nao some: `performed_by_db_role` (DEFAULT `session_user`) guarda o
-- papel da conexao — mesmo desenho de `contact_deletion_audit`.
--
-- EFEITOS COLATERAIS REVISADOS: o gatilho e `AFTER` (nao altera NEW nem o curso da escrita em
-- `contacts`); nao dispara em UPDATE em que nada da lista branca mudou de fato (sai sem gravar);
-- o UPDATE em `deleted_at` vira `soft_delete`/`restore` em vez de `update` generico; uma unica
-- alteracao gera UMA linha (campos multi-valor vao no array, nao em varias linhas).

-- 1) Tabela append-only.
create table if not exists public.contact_change_log (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- `contact_id` SEM FK de proposito: uma FK ON DELETE CASCADE apagaria a propria trilha junto
  -- com o contato; uma FK sem CASCADE travaria o DELETE. A trilha tem de sobreviver ao alvo.
  contact_id           uuid        NOT NULL,
  operation            text        NOT NULL,
  -- SOMENTE nomes de coluna. Nunca o valor. Ver "COMO O PII E BARRADO" no cabecalho.
  campos               text[]      NOT NULL DEFAULT '{}',
  performed_by         uuid,
  performed_by_profile uuid,
  performed_by_db_role text        NOT NULL DEFAULT session_user,
  performed_at         timestamptz NOT NULL DEFAULT now(),
  constraint contact_change_log_operation_check
    check (operation in ('insert', 'update', 'soft_delete', 'restore'))
);

-- 1-B) RLS + ACL IMEDIATAMENTE apos o CREATE TABLE: qualquer aborto mais adiante deixa a trilha
-- fechada. ENABLE RLS ANTES do REVOKE (RLS ligada + zero policies = zero linhas).
alter table public.contact_change_log enable row level security;

-- Nasce para a API com DML completo (default privileges do Supabase); REVOKE ALL fecha, inclusive
-- service_role: a escrita sai SO pelo gatilho SECURITY DEFINER. Depois o GRANT minimo de leitura.
revoke all on table public.contact_change_log from public, anon, authenticated, service_role;
grant select on table public.contact_change_log to authenticated;
grant select on table public.contact_change_log to service_role;

-- Leitura = MESMA regra de visibilidade do contato (`is_contact_visible_to_user`): quem enxerga o
-- contato enxerga a trilha; quem nao enxerga o contato nao ve nenhuma linha. Sem policy de insert/
-- update/delete: a RLS ja nega por ausencia de policy, reforcada pelos REVOKEs e pelas policies
-- `false` abaixo (defesa em profundidade).
drop policy if exists contact_change_log_select_visible on public.contact_change_log;
create policy contact_change_log_select_visible
  on public.contact_change_log for select to authenticated
  using (public.is_contact_visible_to_user(contact_id, auth.uid()));

drop policy if exists contact_change_log_block_insert on public.contact_change_log;
create policy contact_change_log_block_insert
  on public.contact_change_log for insert to authenticated with check (false);
drop policy if exists contact_change_log_block_update on public.contact_change_log;
create policy contact_change_log_block_update
  on public.contact_change_log for update to authenticated using (false) with check (false);
drop policy if exists contact_change_log_block_delete on public.contact_change_log;
create policy contact_change_log_block_delete
  on public.contact_change_log for delete to authenticated using (false);
-- Sem policy para `anon`: RLS ligada + nenhuma policy = zero linhas, somado ao REVOKE.

-- 1-C) Guarda de forma: `CREATE TABLE IF NOT EXISTS` nao reconcilia drift. Se a tabela ja existir
-- com coluna faltando, a migration para aqui em vez de seguir com a trilha quebrada.
do $shape$
declare
  colunas_esperadas text[] := array['id','contact_id','operation','campos',
                                    'performed_by','performed_by_profile',
                                    'performed_by_db_role','performed_at'];
  faltando text[];
begin
  select array_agg(e.nome) into faltando
  from unnest(colunas_esperadas) as e(nome)
  where not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'contact_change_log'
      and a.attname = e.nome
      and a.attnum > 0
      and not a.attisdropped
  );
  if faltando is not null then
    raise exception 'contact_change_log: colunas ausentes no drift: %', array_to_string(faltando, ', ');
  end if;
end
$shape$;

-- 1-D) Indices e COMMENT.
create index if not exists idx_contact_change_log_contact
  on public.contact_change_log (contact_id, performed_at desc);
create index if not exists idx_contact_change_log_recent
  on public.contact_change_log (performed_at desc);

comment on table public.contact_change_log is
  'Trilha append-only das alteracoes de contato. Grava SO os NOMES dos campos alterados (campos text[]), nunca os valores — sem PII. Escrita apenas pelo gatilho SECURITY DEFINER log_contact_change; leitura sob a visibilidade do contato (is_contact_visible_to_user).';

-- 2) Gatilho: uma funcao SECURITY DEFINER (a tabela nega INSERT direto), com lista branca.
create or replace function public.log_contact_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  -- Lista branca: SO estes campos entram na trilha. Colunas internas (ai_projection_*,
  -- avatar_fetch_attempted_at, is_lid_legacy, updated_at/created_at) ficam de fora.
  v_watch   text[] := array[
    'name','nickname','surname','phone','email','company','job_title','avatar_url',
    'assigned_to','queue_id','whatsapp_connection_id','channel_type','channel_connection_id',
    'group_category','contact_type','notes','tags','lead_score','risk_score','lead_origin',
    'consent_status','conversation_status','postal_code','address','address_number',
    'neighborhood','city','state','latitude','longitude','deleted_at'
  ];
  v_new      jsonb;
  v_old      jsonb;
  v_campos   text[] := '{}';
  v_operation text;
  v_profile  uuid;
  k          text;
begin
  v_new := to_jsonb(new);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  if tg_op = 'INSERT' then
    -- Nascimento do contato: registra os campos de negocio que ja vieram preenchidos.
    v_operation := 'insert';
    foreach k in array v_watch loop
      if coalesce(v_new -> k, 'null'::jsonb) <> 'null'::jsonb then
        v_campos := v_campos || k;
      end if;
    end loop;
    v_campos := array(select unnest(v_campos) order by 1);
  else
    -- Edicao: nomes das colunas da lista branca cujo valor REALMENTE mudou
    -- (IS DISTINCT FROM trata NULL sem erro; jsonb compara array/numero/texto).
    foreach k in array v_watch loop
      if (v_new -> k) is distinct from (v_old -> k) then
        v_campos := v_campos || k;
      end if;
    end loop;
    v_campos := array(select unnest(v_campos) order by 1);

    -- Nada da lista branca mudou (ex.: so `updated_at` carimbado por outro gatilho): nao polui.
    if coalesce(array_length(v_campos, 1), 0) = 0 then
      return null;
    end if;

    -- Soft-delete / restore tem vocabulario proprio; qualquer outra edicao e `update`.
    if 'deleted_at' = any(v_campos) then
      if coalesce(v_old -> 'deleted_at', 'null'::jsonb) = 'null'::jsonb
         and coalesce(v_new -> 'deleted_at', 'null'::jsonb) <> 'null'::jsonb then
        v_operation := 'soft_delete';
      elsif coalesce(v_old -> 'deleted_at', 'null'::jsonb) <> 'null'::jsonb
            and coalesce(v_new -> 'deleted_at', 'null'::jsonb) = 'null'::jsonb then
        v_operation := 'restore';
      else
        v_operation := 'update';
      end if;
    else
      v_operation := 'update';
    end if;
  end if;

  select p.id into v_profile
  from public.profiles as p
  where p.user_id = auth.uid()
  limit 1;

  insert into public.contact_change_log (
    contact_id, operation, campos, performed_by, performed_by_profile
  ) values (
    new.id, v_operation, v_campos, auth.uid(), v_profile
  );

  return null;
end;
$function$;

-- A funcao e de uso interno do proprio banco (so o gatilho a chama): ninguem precisa de EXECUTE
-- por assinatura. Fecha a superficie aberta (funcao nova nasce com EXECUTE para PUBLIC).
revoke all on function public.log_contact_change() from public, anon, authenticated, service_role;

-- 2-B) Gatilho na tabela VIVA. Sem lista de colunas no `AFTER UPDATE OF`: a lista branca ja vive
-- dentro da funcao; duplicar aqui cria dois lugares que se desalinham. `AFTER` garante que a
-- trilha so nasce depois de a escrita em `contacts` ter passado por RLS/constraint.
drop trigger if exists trg_contact_change_log on public.contacts;
create trigger trg_contact_change_log
after insert or update
on public.contacts
for each row
execute function public.log_contact_change();
