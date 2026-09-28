-- E32: CHECK de metadados JSON em team_conversations
-- metadata deve ser um objeto JSON valido (ja e jsonb, mas vamos garantir estrutura)

-- metadata nao pode ser NULL (ja tem DEFAULT '{}')
ALTER TABLE public.team_conversations
  ALTER COLUMN metadata SET NOT NULL;

ALTER TABLE public.team_conversations
  ALTER COLUMN metadata SET DEFAULT '{}';

-- CHECK que garante que metadata e sempre um objeto (nao array, nao scalar)
ALTER TABLE public.team_conversations
  DROP CONSTRAINT IF EXISTS team_conversations_metadata_is_object;

ALTER TABLE public.team_conversations
  ADD CONSTRAINT team_conversations_metadata_is_object
  CHECK (jsonb_typeof(metadata) = 'object');
