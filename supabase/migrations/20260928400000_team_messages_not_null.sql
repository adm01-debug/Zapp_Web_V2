-- E26: NOT NULL em campos criticos de team_messages que deveriam ser obrigatorios

-- content pode ser NULL para mensagens de midia, mas message_type nao pode ser NULL
ALTER TABLE public.team_messages
  ALTER COLUMN message_type SET NOT NULL;

ALTER TABLE public.team_messages
  ALTER COLUMN message_type SET DEFAULT 'text';

-- is_edited nao pode ser NULL (boolean)
ALTER TABLE public.team_messages
  ALTER COLUMN is_edited SET NOT NULL;

ALTER TABLE public.team_messages
  ALTER COLUMN is_edited SET DEFAULT false;
