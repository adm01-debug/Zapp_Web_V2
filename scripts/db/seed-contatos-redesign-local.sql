-- seed-contatos-redesign-local.sql
-- RD-009 — Contatos e retratos de teste do redesign no ambiente LOCAL
-- (docs/plans/PLANO_CONTATOS_REDESIGN_100_ETAPAS_2026-10-12.md).
--
-- O QUE E: DML puro (nenhum DDL, nenhuma funcao, nenhum GRANT). NAO e migration e
-- NAO entra em supabase/migrations/. Insere ~40 contatos de teste no banco LOCAL
-- para o visual do modulo Contatos ser avaliado como sera em producao: nomes curtos
-- e de 60+ caracteres, [E2E] e emoji, com e sem e-mail, para os cards mostrarem foto
-- (SVG embutido em data URI), iniciais (sem avatar) e a queda para iniciais quando a
-- foto falha (avatar_url quebrado).
--
-- COMO RODAR (nao rode este arquivo direto; use o wrapper):
--     bash scripts/db/seed-contatos-redesign-local.sh --url "$SEED_DB_URL"
--     bash scripts/db/seed-contatos-redesign-local.sh            # descobre o banco local da tarefa
--     bash scripts/db/seed-contatos-redesign-local.sh --help
-- O wrapper resolve a URL, recusa qualquer host que nao seja local, liga a marca de
-- sessao e confere os numeros no fim (criterio de pronto do RD-009).
--
-- RECUSA PRODUCAO (3 travas, nesta ordem):
--   1) wrapper: recusa URL com host do Supabase (producao) ou com host que nao seja
--      localhost/127.0.0.1/::1.
--   2) este arquivo: exige a marca de sessao `app.zapp_seed_contatos_redesign = on`
--      (so o wrapper liga). Rodar `psql -f` num banco qualquer falha aqui, de proposito.
--   3) este arquivo: recusa conexao TCP de fora da rede local (producao chega por IP
--      publico; o banco local chega por socket ou pela rede docker privada).
--
-- IDEMPOTENCIA: cada linha tem id deterministico no bloco `d9000000-0000-4000-8000-*`
-- e o INSERT usa ON CONFLICT DO NOTHING — rodar 2x nao duplica nem altera o que ja esta.
--
-- COMO DESFAZER (manutencao do fixture LOCAL; o Zapp nao tem exclusao em massa):
--     bash scripts/db/seed-contatos-redesign-local.sh --rollback --url "$SEED_DB_URL"
-- Remove apenas os contatos cujo id comeca com `d9000000-`.
--
-- SEM IMAGEM NO REPOSITORIO: os retratos sao SVG minusculos embutidos na propria
-- coluna avatar_url (data URI). Nenhum arquivo de imagem entra no repositorio nem no
-- pacote de producao. Os telefones comecam com 5599000, para dar para limpar depois
-- sem encostar em dado real.

do $seed$
declare
  -- 6 variacoes de retrato: gradiente + silhueta. Cores da paleta padrao do sistema
  -- (azul/indigo, verde/teal, ambar/laranja, rosa/pink, violeta/roxo, azul/ciano).
  v_av text[] := array[
    $a1$data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%230ea5e9'/><stop offset='1' stop-color='%236366f1'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><circle cx='32' cy='25' r='11' fill='white' fill-opacity='.9'/><path d='M12 58c2-12 10-18 20-18s18 6 20 18z' fill='white' fill-opacity='.9'/></svg>$a1$,
    $a2$data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%2310b981'/><stop offset='1' stop-color='%230d9488'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><circle cx='32' cy='25' r='11' fill='white' fill-opacity='.9'/><path d='M12 58c2-12 10-18 20-18s18 6 20 18z' fill='white' fill-opacity='.9'/></svg>$a2$,
    $a3$data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23f59e0b'/><stop offset='1' stop-color='%23ea580c'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><circle cx='32' cy='25' r='11' fill='white' fill-opacity='.9'/><path d='M12 58c2-12 10-18 20-18s18 6 20 18z' fill='white' fill-opacity='.9'/></svg>$a3$,
    $a4$data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23f43f5e'/><stop offset='1' stop-color='%23db2777'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><circle cx='32' cy='25' r='11' fill='white' fill-opacity='.9'/><path d='M12 58c2-12 10-18 20-18s18 6 20 18z' fill='white' fill-opacity='.9'/></svg>$a4$,
    $a5$data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%238b5cf6'/><stop offset='1' stop-color='%237c3aed'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><circle cx='32' cy='25' r='11' fill='white' fill-opacity='.9'/><path d='M12 58c2-12 10-18 20-18s18 6 20 18z' fill='white' fill-opacity='.9'/></svg>$a5$,
    $a6$data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%233b82f6'/><stop offset='1' stop-color='%2306b6d4'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><circle cx='32' cy='25' r='11' fill='white' fill-opacity='.9'/><path d='M12 58c2-12 10-18 20-18s18 6 20 18z' fill='white' fill-opacity='.9'/></svg>$a6$
  ];
  v_ip text;
begin
  -- ------------------------------------------------------------------- travas
  if current_setting('app.zapp_seed_contatos_redesign', true) is distinct from 'on' then
    raise exception E'seed-contatos-redesign: RECUSADO.\n'
      'Este arquivo so roda pelo wrapper (scripts/db/seed-contatos-redesign-local.sh), que liga a marca\n'
      'de sessao `app.zapp_seed_contatos_redesign=on` depois de conferir que o banco e LOCAL.\n'
      'Nunca aplique dados de teste no banco de producao.';
  end if;

  v_ip := host(inet_client_addr());
  if v_ip is not null
     and not (
          v_ip::inet <<= inet '127.0.0.0/8'
       or v_ip::inet <<= inet '10.0.0.0/8'
       or v_ip::inet <<= inet '172.16.0.0/12'
       or v_ip::inet <<= inet '192.168.0.0/16'
       or v_ip = '::1'
     ) then
    raise exception 'seed-contatos-redesign: RECUSADO. Conexao vinda de % (fora da rede local) — este seed so roda no banco LOCAL.', v_ip;
  end if;

  -- ------------------------------------------------------------------- dados
  insert into public.contacts (id, name, phone, email, avatar_url, contact_type, is_lid_legacy)
  select
    ('d9000000-0000-4000-8000-' || lpad(t.n::text, 12, '0'))::uuid,
    t.nm,
    case
      when t.lg then '5599000' || lpad((900000000 + t.n)::text, 9, '0')  -- legado: 16 digitos
      else '5599000' || lpad(t.n::text, 4, '0')                          -- normal: 11 digitos
    end,
    t.em,
    case
      when t.av = 0 then null                                            -- sem avatar -> iniciais
      when t.av = 9 then 'https://exemplo.invalid/avatar-quebrado-' || t.n || '.png'  -- foto quebrada
      else v_av[t.av]                                                    -- retrato (SVG embutido)
    end,
    t.ct,
    t.lg
  from (values
    ( 1, 'Ana Paula Ribeiro',                 'cliente',             'ana.ribeiro@exemplo.local',        1, false),
    ( 2, 'Bruno Carvalho',                    'cliente',              null,                              2, false),
    ( 3, 'Carla Menezes',                     'cliente',             'carla.menezes@exemplo.local',      9, false),
    ( 4, 'Diego Fontes',                      'cliente',              null,                              3, false),
    ( 5, 'Empresa Farol Distribuidora',       'cliente',             'contato@farol.exemplo.local',      4, false),
    ( 6, 'Fernanda Lopes',                    'cliente',              null,                              0, false),
    ( 7, 'Gustavo Prado',                     'cliente',             'gustavo.prado@exemplo.local',      5, false),
    ( 8, 'Helena Duarte',                     'cliente',              null,                              6, false),
    ( 9, 'Instituto Alvorada',                'fornecedor',          'compras@alvorada.exemplo.local',   1, false),
    (10, 'Joao Batista Moreira',              'fornecedor',           null,                              0, false),
    (11, 'Kaique Nunes',                      'fornecedor',          'kaique.nunes@exemplo.local',       2, false),
    (12, 'Lorena Machado',                    'fornecedor',           null,                              3, false),
    (13, 'Marcos Vinicius Teixeira',          'fornecedor',          'marcos.teixeira@exemplo.local',    9, false),
    (14, 'Transportes Silva Rapido',          'transportadora',      'operacao@silvarapido.exemplo.local',4, false),
    (15, 'Nadia Ribeiro Costa',               'transportadora',       null,                              5, false),
    (16, 'Otavio Bandeira',                   'transportadora',      'otavio.bandeira@exemplo.local',    0, false),
    (17, 'Priscila Amorim',                   'transportadora',       null,                              6, false),
    (18, 'Quintino Alves',                    'colaborador',         'quintino.alves@exemplo.local',     1, false),
    (19, 'Renata Salgado',                    'colaborador',          null,                              0, false),
    (20, 'Sergio Antunes',                    'colaborador',         'sergio.antunes@exemplo.local',     2, false),
    (21, 'Tania Regina Farias',               'colaborador',          null,                              0, false),
    (22, 'Ubirajara Pinto',                   'prestador_servico',   'ubirajara.pinto@exemplo.local',    3, false),
    (23, 'Vanessa Coelho',                    'prestador_servico',    null,                              4, false),
    (24, 'Wellington Araujo',                 'prestador_servico',   'wellington.araujo@exemplo.local',  0, false),
    (25, 'Xavier Domingues',                  'prestador_servico',    null,                              9, false),
    (26, 'Yara Peixoto',                      'parceiro',            'yara.peixoto@exemplo.local',       6, false),
    (27, 'Zeca Marreiro',                     'parceiro',             null,                              0, false),
    (28, 'Alianca Brindes Parceiros',         'parceiro',            'contato@alianca.exemplo.local',    1, false),
    (29, 'Beatriz Camargo',                   'parceiro',             null,                              0, false),
    (30, 'Contato Sem Tipo A',                 null,                 'semtipo.a@exemplo.local',          2, false),
    (31, 'Legado LID 1 - so aparece com mostrar legados', null,       null,                              0, true ),
    (32, 'Legado LID 2 - telefone sintetico de 16 digitos', null,     null,                              0, true ),
    (33, 'Associacao Brasileira dos Fabricantes de Brindes Corporativos e Personalizados do Sudeste', 'cliente', 'assoc@abfbcps.exemplo.local', 4, false),
    (34, 'Cooperativa Regional de Distribuicao de Presentes Promocionais e Brindes do Interior Paulista', 'fornecedor', 'coop@crdpp.exemplo.local', 5, false),
    (35, 'Sindicato dos Comerciantes de Artigos Personalizados e Brindes do Estado de Sao Paulo', 'transportadora', null, 6, false),
    (36, 'Fundacao Nacional de Apoio ao Empreendedorismo e a Pequena Empresa Brasileira Ltda', 'parceiro', 'fundacao@exemplo.local', 0, false),
    (37, '[E2E] Contato de teste automatizado do fluxo de contatos',    'cliente', 'e2e.37@exemplo.local', 1, false),
    (38, '[E2E] Contato com nome longo para o teste de corte do card de contatos', null, null, 2, false),
    (39, '🎁 Presentes do Ze - brindes personalizados',      'parceiro', 'presentes@exemplo.local', 3, false),
    (40, '⭐ Brindes Estrela - contato com emoji no nome',   'cliente',   null,               4, false)
  ) as t(n, nm, ct, em, av, lg)
  on conflict do nothing;

  raise notice 'seed-contatos-redesign: contatos de teste no banco = %',
    (select count(*) from public.contacts where id::text like 'd9000000-%');
end
$seed$;
