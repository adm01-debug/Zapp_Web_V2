-- 20260902120001_add_department_id_columns
-- profiles.department_id e team_conversations.department_id existem em producao
-- desde o rollout de departamentos, mas foram aplicadas fora do Git: nenhuma
-- migration do repo as cria. Um replay limpo quebrava em 20260903230000, que
-- indexa as duas colunas.
--
-- Tudo idempotente: em producao e no-op (a coluna e a FK ja estao la), e num
-- ambiente novo cria o que faltava. Nullable e ON DELETE NO ACTION, exatamente
-- como esta no banco vivo (conferido em information_schema).
--
-- A guarda casa conrelid, contype e confrelid, nao so o nome: um constraint
-- homonimo em outra tabela faria a checagem por conname sozinha pular a FK e
-- deixar department_id sem restricao.

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
  ) THEN
    ALTER TABLE public.team_conversations
      ADD CONSTRAINT team_conversations_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id);
  END IF;
END $$;
