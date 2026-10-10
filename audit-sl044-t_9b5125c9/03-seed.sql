-- Semeia :vol contatos com a forma do canonico (mesma distribuicao de "visibilidade"
-- usada na evidencia: legado 5%, excluido 5%, sobrinha ~90%).
-- :caller = admin | agent (agent sem role admin/supervisor e com ~29% atribuido a ele).
\set ON_ERROR_STOP on

truncate public.contacts;
truncate public.queue_members;
truncate public.user_roles;
truncate public.profiles;

insert into public.profiles (id, user_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001');

insert into public.queue_members (queue_id, profile_id, is_active)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', true);

insert into public.user_roles (user_id, role)
select '11111111-0000-4000-8000-000000000001', 'admin'
where :'caller' = 'admin';

insert into public.contacts (
  id, name, nickname, surname, job_title, company, phone, email, tags, contact_type,
  created_at, updated_at, is_lid_legacy, deleted_at, assigned_to, queue_id
)
select
  ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'Contato ' || lpad(i::text, 7, '0'),
  null,
  'Sobrenome' || lpad((i % 997)::text, 3, '0'),
  'Cargo ' || (i % 37),
  'Empresa ' || (i % 211),
  lpad((10000000000 + i)::text, 11, '0'),
  'contato' || i || '@exemplo.test',
  array['tag' || (i % 13), 'tag' || (i % 7)],
  (array['cliente','fornecedor','parceiro'])[1 + (i % 3)],
  now() - (i || ' minutes')::interval,
  now() - (i || ' minutes')::interval,
  (i % 20 = 0),
  case when i % 20 = 5 then now() - interval '1 day' end,
  case when (i % 100) < 29
       then 'aaaaaaaa-0000-4000-8000-000000000001'::uuid
       else ('00000000-0000-4000-8000-' || lpad((900000 + (i % 50))::text, 12, '0'))::uuid
  end,
  ('00000000-0000-4000-8000-' || lpad((800000 + (i % 8))::text, 12, '0'))::uuid
from generate_series(1, :vol) as g(i);

analyze public.contacts;

select count(*) as seeded,
       count(*) filter (where deleted_at is null and is_lid_legacy = false and phone ~ '^[0-9]{10,15}$') as visiveis_todos,
       count(*) filter (where deleted_at is null and is_lid_legacy = false and phone ~ '^[0-9]{10,15}$'
                        and assigned_to = 'aaaaaaaa-0000-4000-8000-000000000001') as visiveis_agent
from public.contacts;
