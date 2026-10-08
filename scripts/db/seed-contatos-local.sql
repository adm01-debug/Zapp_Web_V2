-- seed-contatos-local.sql
-- CT-003 — Contatos de teste realistas para o ambiente LOCAL (plano
-- docs/plans/PLANO_CONTATOS_POR_JORNADA_2026-10-08.md, Jornada 1, bloco 1).
--
-- O QUE E: DML puro (nenhum DDL). NAO e migration e NAO entra em supabase/migrations/.
-- Aplica ~160 contatos de teste no banco LOCAL, para o visual e os filtros terem
-- dado de verdade (nomes longos, sem e-mail, sem empresa, varios vendedores, filas,
-- legados, excluidos e duplicados propositais).
--
-- COMO RODAR (nao rode este arquivo direto; use o wrapper):
--     bash scripts/db/seed-contatos-local.sh --url "$SEED_DB_URL"
--     bash scripts/db/seed-contatos-local.sh --help
-- O wrapper e quem resolve a URL, recusa qualquer host que nao seja local, marca a
-- sessao e confere os numeros no fim.
--
-- RECUSA PRODUCAO (3 travas, nesta ordem):
--   1) wrapper: recusa URL com o ref de producao ou host fora de localhost/127.0.0.1.
--   2) este arquivo: exige a marca de sessao `app.zapp_seed_contatos = on` (so o
--      wrapper liga). Rodar `psql -f seed-contatos-local.sql` num banco qualquer
--      falha aqui, de proposito.
--   3) este arquivo: recusa conexao TCP que nao venha do proprio host (o banco local
--      e acessado por socket local ou por 127.0.0.1; producao chega por TCP remoto).
--
-- COMO DESFAZER (nada de DELETE em massa de contato no produto; isto e so o fixture
-- local): todos os contatos nascem com id no bloco  c7000000-0000-4000-8000-*  e as
-- filas auxiliares em  00000000-0000-4000-8000-*-00f2 :
--     bash scripts/db/seed-contatos-local.sh --rollback --url "$SEED_DB_URL"
-- (a remocao e fisica e passa pelo gatilho BEFORE DELETE de redacao de CRM, igual a
--  qualquer exclusao real; se preferir soft-delete, use as RPCs delete_contact(s)).
--
-- IDEMPOTENCIA: cada linha tem id determinístico e o INSERT usa ON CONFLICT (id) DO
-- NOTHING — rodar 2x nao duplica nem altera o que ja esta la.
--
-- DUPLICADOS PROPOSITAIS: `contacts.phone` tem UNIQUE (constraint contacts_phone_key,
-- mantida em 20260827130300), entao numero identico nao existe duas vezes por desenho.
-- As duplicatas "por telefone" sao o MESMO numero com e sem o codigo do pais (55): casa
-- pelos ultimos 11 digitos, que e o que a mesclagem compara — e e como o numero chega
-- digitado na pratica. As duplicatas "por e-mail" sao exatas (email nao tem UNIQUE).

do $$
declare
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid;
  v_q1 uuid := '00000000-0000-4000-8000-0000000000f1';   -- 'Fila Local' (seed do banco local)
  v_q2 uuid := '00000000-0000-4000-8000-0000000000f2';   -- 'Fila Seed B' (criada aqui, se faltar)
  v_conn uuid := '00000000-0000-4000-8000-0000000000c1'; -- 'Conexao Local (falsa)' do seed local
begin
  -- ------------------------------------------------------------------ travas
  if current_setting('app.zapp_seed_contatos', true) is distinct from 'on' then
    raise exception E'seed-contatos-local: RECUSADO.\n'
      'Este arquivo so roda pelo wrapper (scripts/db/seed-contatos-local.sh), que liga a marca\n'
      'de sessao `app.zapp_seed_contatos=on` depois de conferir que o banco e LOCAL.\n'
      'Nunca aplique dados de teste no banco de producao.';
  end if;

  -- O banco local e acessado por socket (inet_server_addr() nulo) ou pela rede
  -- privada do contêiner (127.0.0.0/8 na maquina, 172.16.0.0/12 no Docker). Producao
  -- chega por endereco publico: recusa.
  if inet_server_addr() is not null
     and not (inet_server_addr() << inet '127.0.0.0/8')
     and not (inet_server_addr() << inet '10.0.0.0/8')
     and not (inet_server_addr() << inet '172.16.0.0/12')
     and not (inet_server_addr() << inet '192.168.0.0/16')
  then
    raise exception 'seed-contatos-local: RECUSADO. Conexao veio de % (endereco publico); so banco local.',
      inet_server_addr();
  end if;

  -- ------------------------------------------------------- vendedores (4)
  -- Perfis do seed do banco local (auth.users com estes e-mails). Sem eles nao ha a
  -- quem atribuir: falha alto em vez de gravar contato orfao.
  select p.id into v_v1 from public.profiles p join auth.users u on u.id = p.user_id
    where u.email = 'admin.local@promobrindes.com.br' order by p.id limit 1;
  select p.id into v_v2 from public.profiles p join auth.users u on u.id = p.user_id
    where u.email = 'e2e.zapp@promobrindes.com.br' order by p.id limit 1;
  select p.id into v_v3 from public.profiles p join auth.users u on u.id = p.user_id
    where u.email = 'agente.local@promobrindes.com.br' order by p.id limit 1;
  select p.id into v_v4 from public.profiles p join auth.users u on u.id = p.user_id
    where u.email = 'supervisor.local@promobrindes.com.br' order by p.id limit 1;

  if v_v1 is null or v_v2 is null or v_v3 is null or v_v4 is null then
    raise exception E'seed-contatos-local: NAO ACHEI os vendedores do seed local.\n'
      'Rode primeiro o seed do banco local (`zapp-db-local up . <nome>`) e tente de novo.';
  end if;

  -- ------------------------------------------------------------ filas (2)
  insert into public.queues (id, name) values (v_q1, 'Fila Local') on conflict (id) do nothing;
  insert into public.queues (id, name) values (v_q2, 'Fila Seed B') on conflict (id) do nothing;

  -- o vinculo de conexao e opcional (so se o seed local criou a conexao falsa)
  if not exists (select 1 from public.whatsapp_connections where id = v_conn) then
    v_conn := null;
  end if;

  -- ==========================================================================
  -- 1) BASE VARIADA — 135 contatos: os 6 tipos canonicos + 1 faixa SEM tipo
  --    (7 grupos), com e sem e-mail / endereco / empresa / cargo, nomes longos,
  --    datas variadas, tags, 4 vendedores, 2 filas, legados, excluidos e mapa.
  -- ==========================================================================
  insert into public.contacts (
    id, name, phone, email, company, job_title, nickname, surname, contact_type,
    tags, notes, assigned_to, queue_id, whatsapp_connection_id,
    address, address_number, neighborhood, city, state, postal_code,
    latitude, longitude, is_lid_legacy, deleted_at, created_at
  )
  select
    ('c7000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
    case when n % 15 = 0
      then 'Contato de teste com nome propositalmente muito longo para conferir o corte na lista e no card ' || lpad(n::text, 3, '0')
      else 'Contato Seed ' || lpad(n::text, 3, '0')
    end,
    '5599' || lpad((1000000 + n)::text, 8, '0'),
    case when n % 4 = 0 then null else 'contato.seed.' || lpad(n::text, 3, '0') || '@exemplo.local' end,
    case when n % 3 = 0 then null
         when n % 9 = 0 then 'Industria e Comercio de Brindes Personalizados do Vale do Paraiba Ltda'
         else 'Empresa Seed ' || ((n % 7) + 1)
    end,
    case when n % 6 = 0 then null
         else (array['Analista de Compras','Gerente Comercial','Diretor de Marketing',
                     'Comprador','Coordenador de Eventos','Financeiro'])[((n - 1) % 6) + 1]
    end,
    case when n % 5 = 0 then null else 'Apelido' || lpad(n::text, 3, '0') end,
    case when n % 5 = 0 then null
         else (array['Silva','Souza','Oliveira','Pereira','Costa','Rocha'])[((n - 1) % 6) + 1]
    end,
    case when n <= 30 then 'cliente'
         when n <= 55 then 'fornecedor'
         when n <= 75 then 'transportadora'
         when n <= 95 then 'colaborador'
         when n <= 110 then 'prestador_servico'
         when n <= 125 then 'parceiro'
         else null                     -- 7a faixa: sem tipo (importado/legado do Singu)
    end,
    case when n % 10 = 0 then array['vip', 'seed']
         when n % 7 = 0 then array['lead']
         when n % 3 = 0 then array['cliente-novo', 'seed']
         else array['seed']
    end,
    case when n % 8 = 0 then 'Anotacao de teste ' || lpad(n::text, 3, '0') else null end,
    (array[v_v1, v_v2, v_v3, v_v4])[((n - 1) % 4) + 1],
    case when n % 6 = 0 then case when n % 12 = 0 then v_q2 else v_q1 end else null end,
    v_conn,
    case when n % 5 = 0 then null else 'Rua das Encomendas' end,
    case when n % 5 = 0 then null else (n % 900 + 100)::text end,
    case when n % 5 = 0 then null else 'Centro' end,
    case when n % 5 = 0 then null
         else (array['Sao Paulo','Campinas','Santos','Ribeirao Preto','Sorocaba'])[((n - 1) % 5) + 1]
    end,
    case when n % 5 = 0 then null else (array['SP','SP','SP','SP','SP'])[((n - 1) % 5) + 1] end,
    case when n % 5 = 0 then null else '1' || lpad((1000000 + n * 37)::text, 7, '0') end,
    case when n % 12 = 0 then -23.5 - ((n % 50)::numeric / 100) else null end,
    case when n % 12 = 0 then -46.6 - ((n % 50)::numeric / 100) else null end,
    (n % 25 = 0),                                  -- legado (LID) a cada 25
    case when n % 40 = 0 then now() - interval '3 days' else null end,   -- excluido a cada 40
    now() - ((n * 7) || ' hours')::interval        -- datas variadas (filtro de data)
  from generate_series(1, 135) as g(n)
  on conflict (id) do nothing;

  -- ==========================================================================
  -- 2) CASOS DE BORDA (ids 201+): [E2E], emoji, nome 60+, sem e-mail,
  --    duplicados por e-mail e por telefone.
  -- ==========================================================================
  insert into public.contacts (
    id, name, phone, email, company, job_title, contact_type, tags,
    assigned_to, queue_id, address, city, state, is_lid_legacy, deleted_at, created_at
  )
  select
    ('c7000000-0000-4000-8000-' || lpad(t.n::text, 12, '0'))::uuid,
    t.nm, t.ph, t.em, t.cp, t.jt, t.ct, t.tg,
    case t.v when 1 then v_v1 when 2 then v_v2 when 3 then v_v3 else v_v4 end,
    case when t.q then case when t.n % 2 = 0 then v_q1 else v_q2 end else null end,
    t.ad, t.cd, t.uf, t.lg,
    case when t.de then now() - interval '3 days' else null end,
    now() - (t.n || ' hours')::interval
  from (values
    -- [E2E] no nome (os testes logados procuram o prefixo)
    (201, '[E2E] Contato de teste realista - com e-mail', '559991000201', 'e2e.seed.201@exemplo.local', 'Empresa E2E Ltda', 'Analista de Testes', 'cliente',       array['e2e'],  1, true,  'Rua Teste',      'Sao Paulo', 'SP', false, false),
    (202, '[E2E] Contato de teste realista - sem e-mail', '559991000202', null,                              null,               null,                'fornecedor',    array['e2e'],  2, false, null,             'Campinas', 'SP', false, false),
    -- emoji no nome
    (203, '🎁 Presentes do Ze - contato com emoji',       '559991000203', 'emoji.203@exemplo.local',         'Presentes do Ze',  'Proprietario',      'parceiro',      array['emoji'],3, false, 'Av. Paulista',   'Sao Paulo', 'SP', false, false),
    (204, '⭐ Brindes Estrela - emoji no meio do nome',   '559991000204', null,                              'Brindes Estrela',  null,                null,            array['emoji'],4, true,  null,             'Santos', 'SP', false, false),
    -- nomes com 60+ caracteres
    (205, 'Associacao Brasileira dos Fabricantes de Brindes Corporativos e Personalizados do Sudeste', '559991000205', 'longo.205@exemplo.local', 'ABFBCPS', 'Presidente', 'cliente', array['vip'], 1, false, 'Rua Longa', 'Sao Paulo', 'SP', false, false),
    (206, 'Cooperativa Regional de Distribuicao de Presentes Promocionais e Brindes do Interior',      '559991000206', 'longo.206@exemplo.local', null,      null,         'fornecedor', array['seed'], 2, false, null, 'Ribeirao Preto', 'SP', false, false),
    -- sem e-mail, sem empresa, sem endereco (o visual do card vazio)
    (207, 'Contato Minimo Sem Nada', '559991000207', null, null, null, 'colaborador', array[]::text[], 3, false, null, null, null, false, false),
    (208, 'Contato Minimo Sem Nada 2', '559991000208', null, null, null, null,        array[]::text[], 4, false, null, null, null, false, false),
    -- duplicados por E-MAIL (email nao tem UNIQUE: par exato, para a mesclagem)
    (209, 'Duplicado por e-mail A', '559991000209', 'duplicado.email@exemplo.local', 'Duplicada Ltda', 'Gerente', 'cliente', array['dup'], 1, false, 'Rua Duplicada', 'Sao Paulo', 'SP', false, false),
    (210, 'Duplicado por e-mail B', '559991000210', 'duplicado.email@exemplo.local', 'Duplicada Ltda', 'Gerente', 'cliente', array['dup'], 2, false, 'Rua Duplicada', 'Sao Paulo', 'SP', false, false),
    (211, 'Duplicado por e-mail C', '559991000211', 'duplicado.email@exemplo.local', null,             null,      'cliente', array['dup'], 3, false, null,             'Sao Paulo', 'SP', false, false),
    -- duplicados por TELEFONE (mesmo numero com e sem o codigo do pais 55: casa pelos
    -- ultimos 11 digitos, que e como a mesclagem compara; exato seria impossivel, o
    -- schema tem UNIQUE em phone — contacts_phone_key)
    (212, 'Duplicado por telefone A', '5511998760001', 'dup.tel.a@exemplo.local', 'Telefone Repetido ME', null, 'cliente', array['dup'], 1, false, 'Rua Telefone', 'Santos',    'SP', false, false),
    (213, 'Duplicado por telefone B', '11998760001',   'dup.tel.b@exemplo.local', 'Telefone Repetido ME', null, 'cliente', array['dup'], 2, false, 'Rua Telefone', 'Santos',    'SP', false, false),
    (214, 'Duplicado por telefone C', '5511998760002', 'dup.tel.c@exemplo.local', null,                   null, 'cliente', array['dup'], 3, false, null,           'Sorocaba',  'SP', false, false),
    (215, 'Duplicado por telefone D', '11998760002',   null,                      null,                   null, 'cliente', array['dup'], 4, false, null,           'Sorocaba',  'SP', false, false),
    -- legados (LID: fora da lista por padrao, precisam do "mostrar legados")
    (216, 'Legado LID 1 - so aparece com mostrar legados', '123456789012345.1', null, null, null, null, array['legado'], 1, false, null, null, null, true, false),
    (217, 'Legado LID 2 - telefone sintetico',             '987654321098765.2', null, null, null, null, array['legado'], 2, false, null, null, null, true, false),
    (218, 'Legado LID 3 - sem tipo',                       '111222333444555.3', null, null, null, null, array['legado'], 3, false, null, null, null, true, false),
    -- excluidos (soft-delete: abrem so na lixeira de 30 dias, admin)
    (219, 'Excluido 1 - na lixeira',  '559991000219', null, 'Empresa Excluida', null, 'cliente',       array['excluido'], 1, false, null, 'Sao Paulo', 'SP', false, true),
    (220, 'Excluido 2 - na lixeira',  '559991000220', null, null,               null, 'fornecedor',    array['excluido'], 2, false, null, 'Santos',    'SP', false, true),
    (221, 'Excluido 3 - na lixeira',  '559991000221', null, null,               null, 'transportadora',array['excluido'], 3, false, null, 'Campinas',  'SP', false, true)
  ) as t(n, nm, ph, em, cp, jt, ct, tg, v, q, ad, cd, uf, lg, de)
  on conflict (id) do nothing;

  raise notice 'seed-contatos-local: contatos alvo no banco = %',
    (select count(*) from public.contacts where id::text like 'c7000000-%');
end
$$;
