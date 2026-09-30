-- =============================================================================
-- W4 -- SEED realistico. Parametro: :n  (numero de contatos), :seed (default 0.42)
--   psql -v n=3000 -f 04-seed.sql
-- =============================================================================
-- DISTRIBUICAO DECLARADA (valores literais no SQL abaixo; a contagem efetiva sai
-- no final do arquivo, medida, nao estimada):
--   * nomes: 40 primeiros nomes BR x sobrenome com peso de Brasil: Silva 12%,
--     Santos 8%, Oliveira 7%, Souza 6%, 36 sobrenomes uniformes (1,75% cada).
--   * company: 30% NULL; dos 70% restantes: Acme Corp 10%, Globex 8%,
--     23 empresas uniformes (~3,0% cada).
--   * job_title: 40% NULL; 12 cargos uniformes.
--   * tags: 8 sorteios Bernoulli independentes (vip 8%, lead-quente 12%,
--     cliente-ouro 6%, inativo 10%, parceiro 5%, suporte 15%, comercial 20%,
--     financeiro 10%); array cortado em 3 posicoes -> 0 a 3 tags.
--   * assigned_to: 10% NULL, resto uniforme em 15 profiles (1+(i%15)).
--   * queue_id: 20% NULL, resto uniforme em 6 filas (1+(i%6)).
--   * created_at: now() - power(random,1.6) * 1095 dias (densidade crescente para
--     o presente; media ~418 dias, maximo 3 anos).
--   * endereco: 15% das linhas com TODOS os 8 campos de endereco+geo preenchidos;
--     85% com os 8 NULL (uma unica decisao por linha).
--   * deleted_at: 5% (soft delete nos ultimos 180 dias); 95% NULL.
--   * conversation_status: open 60 / in_progress 15 / waiting 10 / resolved 12 /
--     archived 3 (%).  is_lid_legacy: 2%.  email: 80% preenchido.  notes: 30%.
--
-- TECNICA: as aleatoriedades vem de UMA subquery LATERAL CORRELACIONADA
-- (`array_agg(random()) ... WHERE i IS NOT NULL`). Sem a correlacao, o planner
-- dobra subqueries de uma linha em InitPlan e avalia random() UMA vez para a
-- query inteira -- foi exatamente o que aconteceu na primeira versao deste seed
-- (distribuicao degenerada detectada e corrigida).
--
-- VOLUMES: setseed fixo + gerador deterministico por linha => as linhas 1..3000
--   do volume de 100.000 tem os MESMOS valores do volume de 3.000 (subconjunto
--   exato). Conferido no `verificar-subconjunto.sql`.
-- =============================================================================
\set ON_ERROR_STOP on

\if :{?seed}
\else
\set seed 0.42
\endif
\if :{?n}
\else
\echo 'ERRO: defina -v n=<volume>'
\quit 1
\endif

CREATE TABLE IF NOT EXISTS w4_meta (n integer, seeded_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS w4_bench (
  phase    text,      -- rotulo da fase (baseline | idx2 | rpc_branches | ...)
  variant  text,      -- v0_vigente | v1_inline | v2_branches | ...
  caller   text,      -- agent | admin
  scenario text,
  sort_field text,
  sort_dir   text,
  page_offset integer,
  run        integer,
  ms         double precision,
  rows_out   integer,
  total_count bigint
);

DELETE FROM w4_meta WHERE n = :n;
INSERT INTO w4_meta(n) VALUES (:n);
DELETE FROM w4_bench;

TRUNCATE public.audit_logs, public.queue_members, public.agent_visibility_grants,
         public.user_roles, public.contacts, public.queues, public.profiles,
         auth.users CASCADE;

SELECT setseed(:seed);

-- 15 profiles (agentes) + 6 filas -------------------------------------------------
INSERT INTO auth.users (id, email)
SELECT ('11111111-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       'agente' || g || '@zapp.test'
FROM generate_series(1, 15) g;

INSERT INTO public.profiles (id, user_id, full_name)
SELECT ('22222222-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       ('11111111-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       'Agente ' || g
FROM generate_series(1, 15) g;

INSERT INTO public.queues (id, name)
SELECT ('33333333-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'Fila ' || g
FROM generate_series(1, 6) g;

-- Chamador padrao do benchmark = profiles[1] (agente simples, SEM papel
-- admin/supervisor, sem grant de visibilidade), membro ATIVO de 2 das 6 filas
-- -> get_visible_agent_ids(caller) = {p1}.
INSERT INTO public.queue_members (queue_id, profile_id, is_active)
VALUES ('33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', true),
       ('33333333-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000001', true);

-- Admin separado, para o contraste admin x agente (predicado sempre true).
INSERT INTO auth.users (id, email) VALUES ('99999999-0000-4000-8000-000000000001', 'admin@zapp.test');
INSERT INTO public.profiles (id, user_id, full_name)
VALUES ('88888888-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000001', 'Admin');
INSERT INTO public.user_roles (user_id, role) VALUES ('99999999-0000-4000-8000-000000000001', 'admin');

-- CONTATOS ----------------------------------------------------------------------
-- i = indice do draw aleatorio (r[i]); ver o mapa no comentario final.
WITH const AS (
  SELECT
    ARRAY['Aline','Ana','Andre','Beatriz','Bruno','Camila','Carla','Carlos','Daniel','Debora',
          'Eduardo','Fabiana','Felipe','Fernanda','Gabriel','Gabriela','Gustavo','Helena','Igor',
          'Isabela','Joao','Juliana','Karina','Leandro','Leonardo','Leticia','Lucas','Mariana',
          'Mateus','Natalia','Otavio','Patricia','Paulo','Rafael','Renata','Ricardo','Roberta',
          'Thiago','Vanessa','Vitor'] AS firsts,
    ARRAY['Almeida','Alves','Araujo','Barbosa','Barros','Cardoso','Carvalho','Castro',
          'Costa','Dias','Fernandes','Ferreira','Fonseca','Freitas','Gomes','Goncalves',
          'Lima','Lopes','Machado','Marques','Martins','Medeiros','Melo','Mendes',
          'Miranda','Monteiro','Moraes','Moreira','Nascimento','Nogueira','Pereira',
          'Pinto','Ramos','Reis','Ribeiro','Rocha'] AS others,
    ARRAY['Analista','Gerente','Diretor','Coordenador','Vendedor','Consultor',
          'Engenheiro','Designer','Suporte','Recepcionista','Medico','Advogado'] AS jobs,
    ARRAY['Initech','Umbrella','Stark Industries','Wayne Enterprises','Cyberdyne',
          'Soylent','Hooli','Pied Piper','Vandelay','Dunder Mifflin','Massive Dynamic',
          'Aperture Labs','Black Mesa','Oscorp','Tyrell Corp','Wonka','Gringotts',
          'Zapp do Brasil','Hospital Santa Casa','Clinica Vida','Construtora Alfa',
          'Logistica Beta','Advocacia Gama'] AS companies,
    ARRAY['gmail.com','outlook.com','hotmail.com','empresa.com.br','yahoo.com'] AS domains,
    ARRAY['das Flores','Sao Joao','Dom Pedro','Brasil','XV de Novembro','da Paz',
          'Santos Dumont','Tiradentes','Rio Branco','da Independencia','Setembro',
          'Amazonas','Bahia','Ceara','Goias','Minas','Parana','Pernambuco','Rio Grande',
          'Santa Catarina'] AS streets,
    ARRAY['Centro','Jardim America','Vila Mariana','Pinheiros','Moema',
          'Santana','Tatuape','Butanta','Ipiranga','Lapa','Bela Vista','Perdizes'] AS hoods,
    ARRAY['Sao Paulo','Campinas','Santos','Ribeirao Preto','Sorocaba',
          'Sao Bernardo','Guarulhos','Osasco'] AS cities,
    ARRAY['SP','SP','SP','SP','SP','SP','SP','SP','RJ','MG','PR','BA'] AS states
)
INSERT INTO public.contacts (
  id, name, nickname, surname, job_title, company, phone, email,
  assigned_to, queue_id, tags, notes, contact_type,
  conversation_status, is_lid_legacy,
  created_at, updated_at, deleted_at,
  latitude, longitude, address, address_number, neighborhood, city, state, postal_code
)
SELECT
  ('44444444-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  k.firsts[1 + floor(r.r[1] * 40)::int] || ' ' || sn.last,
  CASE WHEN r.r[4] < 0.25 THEN k.firsts[1 + floor(r.r[1] * 40)::int] END,
  sn.last,
  CASE WHEN r.r[5] < 0.40 THEN NULL ELSE k.jobs[1 + floor(r.r[6] * 12)::int] END,
  CASE WHEN r.r[7] < 0.30 THEN NULL
       WHEN r.r[7] < 0.40 THEN 'Acme Corp'
       WHEN r.r[7] < 0.48 THEN 'Globex'
       ELSE k.companies[1 + floor(r.r[9] * 23)::int] END,
  '5511' || lpad((100000000 + i)::text, 9, '0'),
  CASE WHEN r.r[10] < 0.80
       THEN lower(k.firsts[1 + floor(r.r[1] * 40)::int]) || '.' || i || '@' ||
            k.domains[1 + floor(r.r[11] * 5)::int] END,
  CASE WHEN r.r[39] < 0.10 THEN NULL
       ELSE ('22222222-0000-4000-8000-' || lpad((1 + (i % 15))::text, 12, '0'))::uuid END,
  CASE WHEN r.r[12] < 0.20 THEN NULL
       ELSE ('33333333-0000-4000-8000-' || lpad((1 + (i % 6))::text, 12, '0'))::uuid END,
  (array_remove(ARRAY[
      CASE WHEN r.r[13] < 0.08 THEN 'vip' END,
      CASE WHEN r.r[14] < 0.12 THEN 'lead-quente' END,
      CASE WHEN r.r[15] < 0.06 THEN 'cliente-ouro' END,
      CASE WHEN r.r[16] < 0.10 THEN 'inativo' END,
      CASE WHEN r.r[17] < 0.05 THEN 'parceiro' END,
      CASE WHEN r.r[18] < 0.15 THEN 'suporte' END,
      CASE WHEN r.r[19] < 0.20 THEN 'comercial' END,
      CASE WHEN r.r[20] < 0.10 THEN 'financeiro' END
   ], NULL))[1:3],
  CASE WHEN r.r[21] < 0.30
       THEN 'Anotacao de atendimento ' || i || ' -- historico de contato, sem PII.' END,
  CASE WHEN r.r[22] < 0.70 THEN 'cliente'
       WHEN r.r[22] < 0.90 THEN 'lead'
       WHEN r.r[22] < 0.98 THEN 'prospect'
       ELSE 'fornecedor' END,
  CASE WHEN r.r[23] < 0.60 THEN 'open'
       WHEN r.r[23] < 0.75 THEN 'in_progress'
       WHEN r.r[23] < 0.85 THEN 'waiting'
       WHEN r.r[23] < 0.97 THEN 'resolved'
       ELSE 'archived' END,
  (r.r[24] < 0.02),
  c.created_at,
  LEAST(c.created_at + (r.r[25] * interval '30 days'), now()),
  CASE WHEN r.r[26] < 0.05 THEN now() - (r.r[27] * interval '180 days') END,
  CASE WHEN r.r[28] < 0.15 THEN -23.5 + r.r[29] * 0.5 END,
  CASE WHEN r.r[28] < 0.15 THEN -46.6 + r.r[30] * 0.5 END,
  CASE WHEN r.r[28] < 0.15
       THEN 'Rua ' || k.streets[1 + floor(r.r[31] * 20)::int] || ', ' ||
            (1 + floor(r.r[32] * 2000)::int) END,
  CASE WHEN r.r[28] < 0.15 THEN (100 + floor(r.r[33] * 1800)::int)::text END,
  CASE WHEN r.r[28] < 0.15 THEN k.hoods[1 + floor(r.r[34] * 12)::int] END,
  CASE WHEN r.r[28] < 0.15 THEN k.cities[1 + floor(r.r[35] * 8)::int] END,
  CASE WHEN r.r[28] < 0.15 THEN k.states[1 + floor(r.r[36] * 12)::int] END,
  CASE WHEN r.r[28] < 0.15
       THEN lpad((1000 + floor(r.r[37] * 89999)::int)::text, 5, '0') || '-' ||
            lpad(floor(r.r[38] * 999)::int::text, 3, '0') END
FROM generate_series(1, :n) AS i
CROSS JOIN const k
-- CORRELACIONADO em `i` de proposito: garante avaliacao POR LINHA dos 40 draws.
CROSS JOIN LATERAL (
  SELECT array_agg(random()) AS r FROM generate_series(1, 40) WHERE i IS NOT NULL
) r
CROSS JOIN LATERAL (
  SELECT CASE WHEN r.r[2] < 0.12 THEN 'Silva'
              WHEN r.r[2] < 0.20 THEN 'Santos'
              WHEN r.r[2] < 0.27 THEN 'Oliveira'
              WHEN r.r[2] < 0.33 THEN 'Souza'
              ELSE k.others[1 + floor(r.r[3] * 36)::int] END AS last
) sn
CROSS JOIN LATERAL (
  SELECT now() - (power(r.r[40], 1.6) * interval '1095 days') AS created_at
) c;

ANALYZE public.contacts;
ANALYZE public.profiles;
ANALYZE public.queue_members;
ANALYZE public.user_roles;
ANALYZE public.audit_logs;

-- Mapa de r[i] (para quem for mexer neste seed):
--   1 first name | 2-3 sobrenome (2 = sorteio ponderado, 3 = uniforme)
--   4 nickname 25% | 5-6 job_title (5 = 40% NULL, 6 = cargo)
--   7-9 company (7 = 30% NULL / 40% top2, 9 = empresa) | 10-11 email
--   12 queue_id 20% NULL | 13-20 tags | 21 notes 30% | 22 contact_type
--   23 conversation_status | 24 is_lid_legacy 2% | 25 updated_at
--   26-27 deleted_at 5% | 28-38 endereco (28 = 15% preenchido)
--   39 assigned_to 10% NULL | 40 created_at

-- Distribuicao efetiva -- MEDIDA (vai para o relatorio).
SELECT :n AS volume,
       count(*) AS linhas,
       count(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted,
       round(100.0 * count(*) FILTER (WHERE deleted_at IS NOT NULL) / count(*), 2) AS pct_deleted,
       count(*) FILTER (WHERE address IS NOT NULL) AS com_endereco,
       count(*) FILTER (WHERE company IS NOT NULL) AS com_company,
       count(*) FILTER (WHERE job_title IS NOT NULL) AS com_cargo,
       count(*) FILTER (WHERE tags <> '{}') AS com_tag,
       count(*) FILTER (WHERE 'vip' = ANY(tags)) AS tag_vip,
       count(*) FILTER (WHERE name ILIKE '%silva%') AS nome_silva,
       count(*) FILTER (WHERE company ILIKE '%acme%') AS empresa_acme,
       count(*) FILTER (WHERE contact_type = 'lead') AS tipo_lead,
       count(DISTINCT company) AS empresas_distintas,
       count(*) FILTER (WHERE assigned_to IS NULL) AS sem_dono,
       count(*) FILTER (WHERE queue_id IS NULL) AS sem_fila
FROM public.contacts;

-- Quantos o chamador padrao (agente p1) enxerga, e quantos o admin enxerga.
SELECT current_setting('request.jwt.claim.sub', true) AS guc,
       count(*) AS visiveis
FROM public.contacts c
WHERE c.deleted_at IS NULL
  AND public.can_edit_contact(c.assigned_to, c.queue_id,
        (SELECT array_agg(v) FROM public.get_visible_agent_ids('11111111-0000-4000-8000-000000000001'::uuid) v),
        (SELECT public.get_profile_id_for_user('11111111-0000-4000-8000-000000000001'::uuid)),
        (SELECT public.is_admin_or_supervisor('11111111-0000-4000-8000-000000000001'::uuid)));
