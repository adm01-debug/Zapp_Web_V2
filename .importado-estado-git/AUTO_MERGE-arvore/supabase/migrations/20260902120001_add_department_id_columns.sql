ALTER TABLE public.profiles           ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS department_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid  = 'public.profiles'::regclass
      AND contype   = 'f'
      AND confrelid = 'public.departments'::regclass
      AND conkey    = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid = 'public.profiles'::regclass
                               AND attname  = 'department_id')]
      AND confkey   = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid = 'public.departments'::regclass
                               AND attname  = 'id')]
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid  = 'public.team_conversations'::regclass
      AND contype   = 'f'
      AND confrelid = 'public.departments'::regclass
      AND conkey    = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid = 'public.team_conversations'::regclass
                               AND attname  = 'department_id')]
      AND confkey   = ARRAY[(SELECT attnum FROM pg_attribute
                             WHERE attrelid = 'public.departments'::regclass
                               AND attname  = 'id')]
  ) THEN
    ALTER TABLE public.team_conversations
      ADD CONSTRAINT team_conversations_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id);
  END IF;
END $$;
