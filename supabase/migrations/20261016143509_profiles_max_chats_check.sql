-- profiles_max_chats_check
-- Rollback: dropa a constraint profiles_max_chats_check e apaga o comentario da funcao; nenhum dado e tocado.
-- Rollback (SQL executável, na ordem):
--   alter table public.profiles drop constraint if exists profiles_max_chats_check;
--   comment on function public.reassign_overloaded_agents() is null;
--
-- Cartão t_d801d1cf (pedido do t_f057f5ee): dois furos de banco no "Balancear Carga".
--
-- 1) profiles.max_chats não tinha CHECK de faixa. O retrato de produção
--    (supabase/schema-manifest.json, seção constraints) só tem em profiles:
--    profiles_department_id_fkey, profiles_pkey, profiles_role_check,
--    profiles_user_id_fkey, profiles_user_id_key. A tela normaliza 1..50 no submit
--    (AdminView), mas INSERT/RPC direto grava 0, -3 ou 999 e o valor vira teto do
--    balanceamento.
--
-- 2) public.reassign_overloaded_agents() usa como ORIGEM do balanceamento só quem tem
--    max_chats IS NOT NULL AND > 0. max_chats NULL = "sem limite configurado" (é o que o
--    War Room e a tela leem), então o atendente NULL continua fora da drenagem — de
--    propósito. O cartão autoriza manter esse comportamento desde que documentado e
--    coberto por teste; mudá-lo exigiria um teto padrão vindo de configuração e não há
--    fonte de configuração para isso no repositório (global_settings não tem chave de
--    max_chats). Este arquivo documenta o contrato no COMMENT da função e
--    supabase/tests/profiles_max_chats_reassign.sql fixa o comportamento.
--
-- Sem GRANT, REVOKE, policy ou papel: nada de ACL muda aqui.

-- 1) Faixa do limite de chats simultâneos por atendente.
--    NULL continua permitido (sem teto configurado). NOT VALID porque a constraint nova
--    passa a valer para INSERT/UPDATE a partir daqui sem conferir as linhas que já
--    existem: uma linha legada gravada por INSERT/RPC direto com 0, -3 ou 999 não
--    derruba a migration e NÃO é reescrita por ela (max_chats é configuração do usuário,
--    não dado derivado de migration).
alter table public.profiles
  add constraint profiles_max_chats_check
  check (max_chats is null or (max_chats >= 1 and max_chats <= 50)) not valid;

-- Valida a constraint quando a base já está na faixa; se houver linha legada fora dela,
-- a constraint fica NOT VALID (AINDA valendo para escrita nova) e a contagem sai no aviso.
do $$
declare
  v_fora integer;
begin
  select count(*) into v_fora
  from public.profiles
  where max_chats is not null and (max_chats < 1 or max_chats > 50);

  if v_fora = 0 then
    alter table public.profiles validate constraint profiles_max_chats_check;
  else
    raise notice 'profiles.max_chats: % linha(s) legada(s) fora de 1..50; constraint fica NOT VALID (escrita nova ja e bloqueada).', v_fora;
  end if;
end $$;

-- 2) Contrato de max_chats NULL em reassign_overloaded_agents():
--    NULL = sem limite configurado. Como ORIGEM do balanceamento o atendente NULL nunca
--    entra (nunca é "excedente"); como DESTINO ele aceita contatos sem teto.
comment on function public.reassign_overloaded_agents() is
  'Balanceia carga: move contatos excedentes de quem passou de max_chats para atendente com vaga na mesma fila (queue_members ativo, profile ativo). max_chats NULL = sem limite configurado: nao entra como origem do balanceamento e, como destino, aceita contatos sem teto. So quem tem max_chats entre 1 e 50 e drenado (CHECK profiles_max_chats_check). Requer is_admin_or_supervisor quando chamada por authenticated.';
