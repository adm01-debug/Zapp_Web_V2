-- whisper_audio_path.sql
-- Prova da nota de sussurro por audio: coluna audio_path (formato), leitura do objeto no
-- bucket `audio-messages` pelos membros da linha de sussurro (remetente, agente destino,
-- admin/supervisor) e limites de tamanho/duracao/tipo.
--
-- COMO RODAR (banco local da tarefa, ja com a migration 20261013230005 aplicada):
--   cat supabase/tests/whisper_audio_path.sql | zapp-db-local psql . <nome-do-banco>
--
-- A sessao abre como o dono do banco local, mas TODA assercao de acesso roda sob
-- `set local role authenticated/anon` com `request.jwt.claims` (nunca sob a conexao de
-- superusuario) — mesmo molde de scripts/db-audit/team-membership-bootstrap-owner.test.sh.
-- Cada bloco imprime `OK <caso>`; qualquer divergencia levanta excecao e o teste falha
-- (vermelho) — sem a migration, o INSERT que cita audio_path falha com 42703.
-- Tudo numa transacao com ROLLBACK no fim: nao sobra fixture sintetica.
-- (O rollback da propria migration e provado a parte, extraindo as linhas `--   ` do topo
--  do arquivo da migration e reaplicando-a — ver o relato.)

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------- fixtures (dono do banco)
set local session_replication_role = replica;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000a1'), -- remetente do sussurro
  ('00000000-0000-4000-8000-0000000000a2'), -- agente destino
  ('00000000-0000-4000-8000-0000000000a3'), -- agente existente, NAO membro do sussurro
  ('00000000-0000-4000-8000-0000000000a4'); -- admin

insert into public.profiles (id, user_id, name) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Sussurro Remetente'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a2', 'Sussurro Destino'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a3', 'Sussurro Outro'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a4', 'Sussurro Admin');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a4', 'admin');

insert into public.contacts (id, name, phone, conversation_status, is_lid_legacy) values
  ('00000000-0000-4000-8000-0000000000c1', 'Conversa Sussurro', '+5511900000000', 'open', false);

set local session_replication_role = origin;

-- ------------------------------------------------------------------ 1. estrutura (aditivo)
do $$
declare
  v_txt text;
begin
  select data_type into v_txt from information_schema.columns
   where table_schema='public' and table_name='whisper_messages' and column_name='audio_path';
  if v_txt is distinct from 'text' then raise exception 'FALHOU 1.1: coluna audio_path ausente/errada (%)', coalesce(v_txt,'-'); end if;

  select conname into v_txt from pg_constraint
   where conrelid='public.whisper_messages'::regclass and conname='whisper_messages_audio_path_formato';
  if v_txt is null then raise exception 'FALHOU 1.2: constraint de formato ausente'; end if;

  select tgname into v_txt from pg_trigger
   where tgrelid='public.whisper_messages'::regclass and tgname='whisper_messages_valida_audio_path';
  if v_txt is null then raise exception 'FALHOU 1.3: gatilho de validacao ausente'; end if;

  select policyname into v_txt from pg_policies
   where schemaname='storage' and tablename='objects' and policyname='Whisper audio readable by whisper member';
  if v_txt is null then raise exception 'FALHOU 1.4: policy de leitura por membro ausente'; end if;

  -- aditividade: a policy preexistente de audio de mensagem continua la.
  select policyname into v_txt from pg_policies
   where schemaname='storage' and tablename='objects' and policyname='Users can read assigned audio messages';
  if v_txt is null then raise exception 'FALHOU 1.5: policy preexistente foi removida'; end if;

  raise notice 'OK 1 estrutura (coluna, constraint, gatilho e policy; policy antiga intacta)';
end $$;

-- ------------------------------------- 2. objeto + linha de sussurro como o remetente real
do $$
declare
  v_rem uuid := '00000000-0000-4000-8000-0000000000a1';
  v_conv uuid := '00000000-0000-4000-8000-0000000000c1';
  v_p_ok text := '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000c1/00000000-0000-4000-8000-0000000000d1';
  v_p_grande text := '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000c1/00000000-0000-4000-8000-0000000000d2';
  v_p_pdf text := '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000c1/00000000-0000-4000-8000-0000000000d3';
  v_p_longo text := '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000c1/00000000-0000-4000-8000-0000000000d4';
  v_p_fantasma text := '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000c1/00000000-0000-4000-8000-0000000000d5';
  v_err text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rem::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 2.1 upload no bucket (policy de INSERT existente aceita a pasta <auth.uid>/...)
  insert into storage.objects (bucket_id, name, metadata) values
    ('audio-messages', v_p_ok,    jsonb_build_object('mimetype','audio/webm','size',12345)),
    ('audio-messages', v_p_grande,jsonb_build_object('mimetype','audio/webm','size',20000000)),
    ('audio-messages', v_p_pdf,   jsonb_build_object('mimetype','application/pdf','size',1000)),
    ('audio-messages', v_p_longo, jsonb_build_object('mimetype','audio/webm','size',9000,'duration',400));
  raise notice 'OK 2.1 upload do objeto no bucket audio-messages pela pasta <auth.uid>';

  -- 2.2 sussurro de audio valido
  insert into public.whisper_messages (contact_id, sender_id, target_agent_id, content, audio_path)
  values (v_conv, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '', v_p_ok);
  raise notice 'OK 2.2 sussurro de audio gravado pelo caminho';

  -- 2.3 recusas: formato, objeto ausente, tamanho, tipo e duracao
  v_err := null;
  begin
    insert into public.whisper_messages (contact_id, sender_id, target_agent_id, content, audio_path)
    values (v_conv, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '', '../etc/passwd');
  exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FALHOU 2.3: caminho fora do formato nao foi recusado (%)', coalesce(v_err,'aceito'); end if;

  v_err := null;
  begin
    insert into public.whisper_messages (contact_id, sender_id, target_agent_id, content, audio_path)
    values (v_conv, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '', v_p_fantasma);
  exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FALHOU 2.4: caminho sem objeto nao foi recusado (%)', coalesce(v_err,'aceito'); end if;

  v_err := null;
  begin
    insert into public.whisper_messages (contact_id, sender_id, target_agent_id, content, audio_path)
    values (v_conv, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '', v_p_grande);
  exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FALHOU 2.5: audio acima do limite nao foi recusado (%)', coalesce(v_err,'aceito'); end if;

  v_err := null;
  begin
    insert into public.whisper_messages (contact_id, sender_id, target_agent_id, content, audio_path)
    values (v_conv, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '', v_p_pdf);
  exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FALHOU 2.6: objeto nao-audio nao foi recusado (%)', coalesce(v_err,'aceito'); end if;

  v_err := null;
  begin
    insert into public.whisper_messages (contact_id, sender_id, target_agent_id, content, audio_path)
    values (v_conv, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '', v_p_longo);
  exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FALHOU 2.7: duracao acima do limite nao foi recusada (%)', coalesce(v_err,'aceito'); end if;

  raise notice 'OK 2.3-2.7 recusas (formato, objeto ausente, tamanho, tipo e duracao)';

  execute 'reset role';
end $$;

-- ------------------------------------------------------- 3. leitura pelo membro / negacao
do $$
declare
  v_path text := '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000c1/00000000-0000-4000-8000-0000000000d1';
  v_n int;
begin
  -- 3.1 remetente enxerga
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id='audio-messages' and name=v_path;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 3.1: remetente nao enxergou o proprio audio (%)', v_n; end if;

  -- 3.2 agente destino enxerga
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-0000000000a2','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id='audio-messages' and name=v_path;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 3.2: agente destino nao enxergou o audio (%)', v_n; end if;

  -- 3.3 admin/supervisor enxerga
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-0000000000a4','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id='audio-messages' and name=v_path;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FALHOU 3.3: admin nao enxergou o audio (%)', v_n; end if;

  -- 3.4 agente EXISTENTE e nao membro: negado
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-0000000000a3','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id='audio-messages' and name=v_path;
  execute 'reset role';
  if v_n <> 0 then raise exception 'FALHOU 3.4: usuario nao membro enxergou o audio (%)', v_n; end if;

  -- 3.5 anonimo: negado
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into v_n from storage.objects where bucket_id='audio-messages' and name=v_path;
  execute 'reset role';
  if v_n <> 0 then raise exception 'FALHOU 3.5: anonimo enxergou o audio (%)', v_n; end if;

  raise notice 'OK 3 leitura (remetente, destino, admin) e negacao (nao membro, anonimo)';
end $$;

select 'PASS whisper_audio_path' as resultado;

rollback;
