-- 20260902120001_add_department_id_columns
-- profiles.department_id e team_conversations.department_id existem em producao
-- desde o rollout de departamentos, mas foram aplicadas fora do Git: nenhuma
-- migration do repo as cria. Um replay limpo quebrava em 20260903230000, que
-- indexa as duas colunas.
--
-- Tudo idempotente: em producao e no-op (a coluna e a FK ja estao la), e num
-- ambiente novo cria o que faltava. Nullable e ON DELETE NO ACTION, exatamente
-- como esta no banco vivo (conferido em information_schema).

ALTER TABLE public.profiles           ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS department_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_department_id_fkey') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_conversations_department_id_fkey') THEN
    ALTER TABLE public.team_conversations
      ADD CONSTRAINT team_conversations_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id);
  END IF;
END $$;
