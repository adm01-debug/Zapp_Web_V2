-- supabase/tests/merge_contacts_tela_rpc.sql
-- Contrato TELA -> RPC da mesclagem de contatos, rodando no banco LOCAL (nada vai para producao).
--
-- O QUE ESTA SUITE PROVA (e o que ela acrescenta):
--   A suite supabase/tests/contact_merge_preserva_dados.sql exercita a RPC com p_merged_fields = '{}'
--   (so o caminho do COALESCE). A TELA, porem, NUNCA manda '{}': ela monta `merged` com as chaves
--   dos campos editaveis (snake_case) e chama mergeContactsAtomic
--   (src/components/contacts/ContactMergeDialog.tsx -> src/services/contact-merge.service.ts).
--   Esta suite cobre exatamente esse caminho, que nao tinha prova:
--   (CT1) payload como a tela monta (chaves snake_case, valores trimados, `tags` como array jsonb):
--         o valor ESCOLHIDO na tela VENCE o valor do secundario, o campo que a tela NAO mandou
--         ainda e preenchido pelo COALESCE do secundario, e nenhum campo vazio e inventado;
--   (CT2) envelope de retorno do contrato de contact-merge.service.ts
--         (primary_id / merged_contacts / already_merged / moved_relations) e idempotencia:
--         2a chamada devolve merged_contacts=0 e already_merged=1, com trilha unica;
--   (CT3) chave fora do contrato (ex.: `jobTitle` em camelCase) e RECUSADA (22023) sem escrever nada
--         -- falha fechada, nao "campo ignorado em silencio";
--   (CT4) agente comum e negado (42501) com o contato PROTEGIDO EXISTINDO e VIVO, e a recusa nao
--         deixa efeito parcial (nada mesclado, nenhuma trilha).
--
-- LACUNA REGISTRADA (nao virou assercao verde -- ver kanban_comment no cartao t_0ded8fb1):
--   escolher na tela o TELEFONE do secundario (escolha que a tela oferece) faz a RPC violar o indice
--   unico contacts_phone_key ao gravar o telefone no principal, porque o secundario ainda esta vivo
--   nesse momento (o soft-delete vem depois). Defeito de PRODUCAO: worker (testes) nao altera producao.
--
-- Roda em transacao unica (BEGIN..ROLLBACK): nada persiste. Sem EXCEPTION = suite verde.

\set ON_ERROR_STOP on

begin;

-- ===== fixtures ==============================================================
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000b0001','authenticated','authenticated','merge.ct@test.local','',now(),now(),now());

create temp table ct_prof on commit drop as
select (select id from public.profiles where user_id = '00000000-0000-0000-0000-0000000b0001') as prof;

-- Principal com email/empresa/cargo/tipo VAZIOS (o caso real do duplicado); secundario com valores
-- DIFERENTES dos que a tela vai escolher, para provar que o payload vence.
insert into public.contacts (id, name, phone, conversation_status) values
  ('00000000-0000-0000-0000-0000000a0001','Ana Principal','+5511900000011','open'),
  ('00000000-0000-0000-0000-0000000a0002','Ana Secundaria','+5511900000012','open');

update public.contacts set email = 'sec@ex.com', company = 'Zeta SA', job_title = 'Outro Cargo', contact_type = 'cliente'
 where id = '00000000-0000-0000-0000-0000000a0002';

insert into public.messages (id, contact_id, sender, content, updated_at)
values ('00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000a0002','contact','mensagem do secundario','2001-01-01 00:00+00');

insert into public.contact_notes (id, contact_id, author_id, content)
values ('00000000-0000-0000-0000-0000000b0002','00000000-0000-0000-0000-0000000a0002',(select prof from ct_prof),'nota do secundario');

insert into public.contact_custom_fields (contact_id, field_name, field_value)
values ('00000000-0000-0000-0000-0000000a0002','plano','pro');

insert into public.conversation_memory (contact_id, commercial_summary)
values ('00000000-0000-0000-0000-0000000a0002','memoria do secundario');

-- ===== CT1/CT2a: payload montado como a TELA monta; envelope =================
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

create temp table ct_ret on commit drop as
select public.merge_contacts_atomic(
  '00000000-0000-0000-0000-0000000a0001',
  array['00000000-0000-0000-0000-0000000a0002']::uuid[],
  -- Payload fiel ao handleMerge do dialogo: so campos com valor, `tags` como array
  -- (a tela manda a uniao das tags). `contact_type` NAO vai: e o campo que a tela esconde quando
  -- ninguem tem valor -- aqui o secundario tem, entao quem preenche e o COALESCE da RPC.
  '{"name":"Ana Principal","email":"ana@principal.com","company":"ACME LTDA","job_title":"Chefe","tags":["vip","vip","lead"]}'::jsonb
) as ret;

reset role;
set local request.jwt.claims = '{}';

do $$
declare
  v_ret jsonb;
  v_p   record;
  v_s   record;
  v_n   integer;
begin
  select ret into v_ret from ct_ret;
  select * into v_p from public.contacts where id = '00000000-0000-0000-0000-0000000a0001';
  select * into v_s from public.contacts where id = '00000000-0000-0000-0000-0000000a0002';

  -- CT1a: o valor ESCOLHIDO na tela (payload) vence o valor do secundario, inclusive com espacos.
  if v_p.email is distinct from 'ana@principal.com'
     or v_p.company is distinct from 'ACME LTDA'
     or v_p.job_title is distinct from 'Chefe' then
    raise exception 'CT1a FALHOU: payload da tela nao venceu (email=%, company=%, job_title=%)',
      v_p.email, v_p.company, v_p.job_title;
  end if;

  -- CT1b: campo que a TELA NAO mandou e preenchido pelo secundario (COALESCE) -- caminho da outra
  -- suite, aqui provando que os dois caminhos convivem na MESMA chamada.
  if v_p.contact_type is distinct from 'cliente' then
    raise exception 'CT1b FALHOU: campo nao enviado nao foi preenchido pelo secundario (%)', v_p.contact_type;
  end if;

  -- CT1c: nenhum campo vazio e inventado (surname vazio nos dois contatos continua nulo).
  if v_p.surname is not null then
    raise exception 'CT1c FALHOU: campo vazio foi inventado (surname=%)', v_p.surname;
  end if;

  -- CT1d: `tags` do payload vence e nao duplica (mesmo conjunto, sem repetir 'vip').
  if not (v_p.tags @> array['vip','lead']::text[]) or coalesce(array_length(v_p.tags, 1), -1) <> 2 then
    raise exception 'CT1d FALHOU: tags do payload incorretas (%)', v_p.tags;
  end if;

  -- CT2a: envelope do contrato de contact-merge.service.ts.
  if v_ret->>'primary_id' is distinct from '00000000-0000-0000-0000-0000000a0001'
     or coalesce((v_ret->>'merged_contacts')::int, -1) <> 1
     or coalesce((v_ret->>'already_merged')::int, -1) <> 0
     or coalesce((v_ret->>'moved_relations')::int, -1) < 4 then
    raise exception 'CT2a FALHOU: envelope de retorno incorreto (%)', v_ret;
  end if;

  -- CT1e: FKs movidas de fato (mensagem, nota, campo personalizado, memoria de conversa).
  select count(*) into v_n from public.messages
   where id = '00000000-0000-0000-0000-0000000b0001' and contact_id = '00000000-0000-0000-0000-0000000a0001';
  if v_n <> 1 then raise exception 'CT1e FALHOU: mensagem nao foi movida'; end if;
  select count(*) into v_n from public.contact_notes
   where id = '00000000-0000-0000-0000-0000000b0002' and contact_id = '00000000-0000-0000-0000-0000000a0001';
  if v_n <> 1 then raise exception 'CT1e FALHOU: nota nao foi movida'; end if;
  select count(*) into v_n from public.contact_custom_fields
   where field_name = 'plano' and contact_id = '00000000-0000-0000-0000-0000000a0001';
  if v_n <> 1 then raise exception 'CT1e FALHOU: campo personalizado nao foi movido'; end if;
  select count(*) into v_n from public.conversation_memory
   where contact_id = '00000000-0000-0000-0000-0000000a0001';
  if v_n <> 1 then raise exception 'CT1e FALHOU: memoria de conversa nao foi movida'; end if;

  -- CT1f: secundario soft-deletado com rastro.
  if v_s.deleted_at is null or v_s.deletion_reason is distinct from 'merged'
     or v_s.merged_into_id is distinct from '00000000-0000-0000-0000-0000000a0001' then
    raise exception 'CT1f FALHOU: soft-delete/rastro incorreto (%)', v_s;
  end if;

  raise notice 'CT1 OK: payload da tela venceu, campo nao enviado veio do secundario, FKs movidas, rastro correto';
  raise notice 'CT2a OK: envelope do contrato correto (%)', v_ret;
end $$;

-- ===== CT2b: repetir a mesma chamada (a tela pode reenviar) e no-op idempotente =====
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temp table ct_ret2 on commit drop as
select public.merge_contacts_atomic(
  '00000000-0000-0000-0000-0000000a0001',
  array['00000000-0000-0000-0000-0000000a0002']::uuid[],
  '{"email":"ana@principal.com"}'::jsonb
) as ret;
reset role;
set local request.jwt.claims = '{}';

do $$
declare v_ret jsonb; v_aud integer;
begin
  select ret into v_ret from ct_ret2;
  select count(*) into v_aud from public.contact_merge_audit
   where primary_id = '00000000-0000-0000-0000-0000000a0001' and merged_id = '00000000-0000-0000-0000-0000000a0002';
  if coalesce((v_ret->>'merged_contacts')::int, -1) <> 0 or coalesce((v_ret->>'already_merged')::int, -1) <> 1 then
    raise exception 'CT2b FALHOU: 2a chamada nao foi no-op (%)', v_ret;
  end if;
  if v_aud <> 1 then raise exception 'CT2b FALHOU: trilha duplicada (%)', v_aud; end if;
  raise notice 'CT2b OK: 2a chamada no-op (merged_contacts=0, already_merged=1), trilha unica';
end $$;

-- ===== CT3: chave fora do contrato e recusada e nada e escrito ================
insert into public.contacts (id, name, phone, conversation_status) values
  ('00000000-0000-0000-0000-0000000a0003','Bia Principal','+5511900000013','open'),
  ('00000000-0000-0000-0000-0000000a0004','Bia Secundaria','+5511900000014','open');
update public.contacts set email = 'bia.sec@ex.com' where id = '00000000-0000-0000-0000-0000000a0004';

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare v_errou boolean := false; v_p record;
begin
  begin
    perform public.merge_contacts_atomic(
      '00000000-0000-0000-0000-0000000a0003',
      array['00000000-0000-0000-0000-0000000a0004']::uuid[],
      '{"jobTitle":"Chefe"}'::jsonb  -- camelCase: fora da lista aceita pela RPC
    );
  exception when invalid_parameter_value then
    v_errou := true;
  end;
  if not v_errou then
    raise exception 'CT3 FALHOU: RPC aceitou chave fora do contrato em vez de recusar (22023)';
  end if;
  select * into v_p from public.contacts where id = '00000000-0000-0000-0000-0000000a0003';
  if v_p.email is not null or v_p.deleted_at is not null then
    raise exception 'CT3 FALHOU: recusa deixou efeito parcial (email=%, deleted_at=%)', v_p.email, v_p.deleted_at;
  end if;
  raise notice 'CT3 OK: chave fora do contrato recusada (22023) sem efeito parcial';
end $$;
reset role;
set local request.jwt.claims = '{}';

-- ===== CT4: agente comum negado, com o objeto EXISTINDO e VIVO ================
-- Prova que o alvo existe e esta vivo: sem isso um 42501 se confundiria com "alvo nao existe".
do $$
declare v_s record;
begin
  select * into v_s from public.contacts where id = '00000000-0000-0000-0000-0000000a0004';
  if v_s.id is null or v_s.deleted_at is not null then
    raise exception 'CT4 FALHOU: o alvo protegido nao existe/nao esta vivo (teste vazio)';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000f0001","role":"authenticated"}';
do $$
declare v_errou boolean := false;
begin
  begin
    perform public.merge_contacts_atomic(
      '00000000-0000-0000-0000-0000000a0003',
      array['00000000-0000-0000-0000-0000000a0004']::uuid[],
      '{"email":"bia.sec@ex.com"}'::jsonb
    );
  exception when insufficient_privilege then
    v_errou := true;
  end;
  if not v_errou then
    raise exception 'CT4 FALHOU: agente comum conseguiu mesclar (deveria ser negado com 42501)';
  end if;
end $$;
reset role;
set local request.jwt.claims = '{}';

do $$
declare v_s record;
begin
  -- A recusa acontece ANTES de qualquer escrita: os dois contatos seguem vivos e sem rastro.
  select * into v_s from public.contacts where id = '00000000-0000-0000-0000-0000000a0004';
  if v_s.deleted_at is not null or v_s.merged_into_id is not null then
    raise exception 'CT4 FALHOU: negacao deixou efeito parcial no secundario (%)', v_s;
  end if;
  if exists (select 1 from public.contacts where id = '00000000-0000-0000-0000-0000000a0003' and deleted_at is not null) then
    raise exception 'CT4 FALHOU: negacao mexeu no principal';
  end if;
  if exists (select 1 from public.contact_merge_audit
              where merged_id = '00000000-0000-0000-0000-0000000a0004') then
    raise exception 'CT4 FALHOU: negacao gravou trilha de auditoria';
  end if;
  raise notice 'CT4 OK: agente comum negado (42501) sobre alvo existente e vivo, sem efeito parcial';
end $$;

rollback;
-- Nada persiste.
