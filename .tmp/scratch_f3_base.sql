begin;
set local session_replication_role = replica;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000a0001'),('00000000-0000-0000-0000-0000000a0002'),('00000000-0000-0000-0000-0000000a0003');
insert into public.profiles (id, user_id, name, role, access_level, permissions, is_active) values ('00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000a0001','Admin','admin','full','{}',true),('00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-0000000a0002','Agente','agent','basic','{}',true),('00000000-0000-0000-0000-0000000f0003','00000000-0000-0000-0000-0000000a0003','Outro','agent','basic','{}',true);
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000a0001','admin'),('00000000-0000-0000-0000-0000000a0002','agent'),('00000000-0000-0000-0000-0000000a0003','agent');
insert into public.contacts (id, name, phone, assigned_to) values ('00000000-0000-0000-0000-0000000c0009','Contato T','+5519999999','00000000-0000-0000-0000-0000000f0002');
set local session_replication_role = origin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
set local role authenticated;


select public.has_role('00000000-0000-0000-0000-0000000a0001','admin') as f3_oraculo_admin;
select public.has_role('00000000-0000-0000-0000-0000000a0002','agent') as f3_proprio;
select count(*) as f3n_proprio from public.get_profile_role_for_check('00000000-0000-0000-0000-0000000a0002');
rollback;
