-- Semente sintetica do TALK ME para E2E. NUNCA aplique em producao.
--
-- Aplicacao somente no banco local desta copia:
--   zapp-db-local up /home/joaquim_ataides/zapp-worktrees/talkme-e-e2e e2e
--   eval "$(zapp-db-local env /home/joaquim_ataides/zapp-worktrees/talkme-e-e2e e2e)"
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v talk_me_local_seed=1 \
--     -f e2e/fixtures/seed-talk-me.sql
--
-- O marcador talk_me_local_seed e obrigatorio. IDs, telefones, nomes, empresas,
-- mensagens e avatar sao ficticios. A semente e idempotente e restaura os tres
-- contatos para a fila, mesmo depois de um aceite feito em execucao anterior.

\if :{?talk_me_local_seed}
\else
  \echo 'ERRO: seed TALK ME recusado; use -v talk_me_local_seed=1 no banco local.'
  \quit 1
\endif

BEGIN;

INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'inbox.talk-me',
  true,
  'Habilita TALK ME no banco local para o E2E sintetico.'
)
ON CONFLICT (key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO public.queues (id, name, description, color, is_active, priority)
VALUES (
  'e2e10000-0000-4000-8000-000000000001',
  'Suporte E2E',
  'Fila sintetica local do spec e2e/talk-me.spec.ts',
  '#2563EB',
  true,
  900
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    color = EXCLUDED.color,
    is_active = EXCLUDED.is_active,
    priority = EXCLUDED.priority,
    updated_at = now();

-- Sem membro durante o upsert dos contatos, o gatilho legado de distribuicao
-- nao preenche assigned_to. O membro sintetico volta ao fim da transacao.
DELETE FROM public.queue_members
WHERE id = 'e2e10000-0000-4000-8000-000000000002';

INSERT INTO public.contacts (
  id, name, phone, avatar_url, company, job_title, queue_id, assigned_to,
  conversation_status, channel_type, contact_type, group_category, deleted_at,
  created_at, updated_at
) VALUES
  (
    'e2e10000-0000-4000-8000-000000000101',
    'Ana Antiga Sintetica',
    '5511900001101',
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 rx=%2220%22 fill=%22%232563eb%22/%3E%3Ctext x=%2220%22 y=%2225%22 text-anchor=%22middle%22 font-size=%2213%22 fill=%22white%22%3EAA%3C/text%3E%3C/svg%3E',
    'Aurora Testes Ltda',
    'Analista de Qualidade',
    'e2e10000-0000-4000-8000-000000000001',
    NULL,
    'waiting',
    'whatsapp',
    'cliente',
    NULL,
    NULL,
    now() - interval '50 minutes',
    now() - interval '45 minutes'
  ),
  (
    'e2e10000-0000-4000-8000-000000000102',
    'Bruno Navegacao Sintetico',
    '5511900001102',
    NULL,
    'Boreal Laboratorio',
    'Coordenador de Testes',
    'e2e10000-0000-4000-8000-000000000001',
    NULL,
    'waiting',
    'whatsapp',
    'cliente',
    NULL,
    NULL,
    now() - interval '30 minutes',
    now() - interval '20 minutes'
  ),
  (
    'e2e10000-0000-4000-8000-000000000103',
    'Carla Busca Sintetica',
    '5511900001103',
    NULL,
    'Cosmos Homologacao',
    'Especialista de Suporte',
    'e2e10000-0000-4000-8000-000000000001',
    NULL,
    'waiting',
    'whatsapp',
    'cliente',
    NULL,
    NULL,
    now() - interval '10 minutes',
    now() - interval '5 minutes'
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    avatar_url = EXCLUDED.avatar_url,
    company = EXCLUDED.company,
    job_title = EXCLUDED.job_title,
    queue_id = EXCLUDED.queue_id,
    assigned_to = NULL,
    conversation_status = 'waiting',
    channel_type = 'whatsapp',
    contact_type = 'cliente',
    group_category = NULL,
    deleted_at = NULL,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

DELETE FROM public.messages
WHERE id IN (
  'e2e10000-0000-4000-8000-000000000201',
  'e2e10000-0000-4000-8000-000000000202',
  'e2e10000-0000-4000-8000-000000000203'
);

INSERT INTO public.messages (
  id, contact_id, sender, content, message_type, is_read, is_deleted,
  external_id, created_at, updated_at
) VALUES
  (
    'e2e10000-0000-4000-8000-000000000201',
    'e2e10000-0000-4000-8000-000000000101',
    'contact',
    'Mensagem sintetica da Ana para validar a ordem da fila.',
    'text',
    false,
    false,
    'talk-me-e2e-ana',
    now() - interval '45 minutes',
    now() - interval '45 minutes'
  ),
  (
    'e2e10000-0000-4000-8000-000000000202',
    'e2e10000-0000-4000-8000-000000000102',
    'contact',
    'Mensagem sintetica do Bruno para validar a navegacao.',
    'text',
    false,
    false,
    'talk-me-e2e-bruno',
    now() - interval '20 minutes',
    now() - interval '20 minutes'
  ),
  (
    'e2e10000-0000-4000-8000-000000000203',
    'e2e10000-0000-4000-8000-000000000103',
    'contact',
    'Mensagem sintetica da Carla para validar a busca e o aceite.',
    'text',
    false,
    false,
    'talk-me-e2e-carla',
    now() - interval '5 minutes',
    now() - interval '5 minutes'
  );

DO $seed$
DECLARE
  v_profile_id uuid;
BEGIN
  SELECT p.id
  INTO v_profile_id
  FROM public.profiles p
  WHERE p.is_active IS TRUE
  ORDER BY
    CASE WHEN p.role IN ('admin', 'supervisor', 'agent') THEN 0 ELSE 1 END,
    p.created_at,
    p.id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'seed TALK ME requer ao menos um perfil ativo nos dados locais';
  END IF;

  INSERT INTO public.queue_members (id, queue_id, profile_id, is_active)
  VALUES (
    'e2e10000-0000-4000-8000-000000000002',
    'e2e10000-0000-4000-8000-000000000001',
    v_profile_id,
    true
  )
  ON CONFLICT (queue_id, profile_id) DO UPDATE
  SET is_active = true;
END;
$seed$;

COMMIT;
