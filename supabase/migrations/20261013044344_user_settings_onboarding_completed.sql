-- user_settings_onboarding_completed
-- Rollback: ALTER TABLE public.user_settings DROP COLUMN IF EXISTS onboarding_completed; ALTER TABLE public.user_settings ENABLE TRIGGER update_user_settings_updated_at;
-- versão 20261013044344 reservada para user-settings-onboarding-completed-26101301381314 (hermes-db-migrar --nova)
--
-- ============================================================================
-- PD-32 (auditoria de paridade V3 -> V2, docs de estado 04 a 16): a V3 marca a
-- conclusão do tour numa coluna própria (`user_settings.onboarding_completed`).
-- A V2 não tem a coluna (0 migrations, 0 em types.ts) e `useOnboarding.ts:64`
-- infere "tour concluído" da EXISTÊNCIA de qualquer linha em `user_settings` —
-- portanto salvar uma preferência "conclui" o tour, e "Reiniciar Tour"
-- (`useOnboarding.ts:91`) só apaga o localStorage daquela instância e não
-- reinicia nada. Esta migration entrega SÓ o lado do banco: a coluna. O front
-- que passa a gravar/ler a coluna é o cartão filho (hooks).
-- ============================================================================
--
-- BACKFILL (critério) — toda linha de `public.user_settings` que JÁ EXISTE
-- quando a migration roda recebe `onboarding_completed = true`.
-- Por que é o critério confiável:
--   * a V2 só cria linha nessa tabela (a) quando o tour termina —
--     `useOnboarding.ts:17-25 persistOnboardingCompletion` faz upsert só com
--     `user_id`; ou (b) quando o usuário salva preferência (`useUserSettings`,
--     `useNotificationSettings`, `useTeamChatPanel`, checklist do onboarding);
--   * não existe trigger, seed nem INSERT em SQL de migration que crie a linha
--     sozinha (conferido em supabase/migrations: nenhum INSERT em user_settings),
--     logo não há linha "vazia" criada sem o usuário;
--   * os dois casos são "já usou o produto", e a existência da linha é
--     EXATAMENTE o sinal que o código atual já lê como concluído
--     (`useOnboarding.ts:63-66`).
-- Consequência: marcar `true` para todas as linhas existentes PRESERVA o
-- comportamento atual — nenhum usuário que hoje não vê o tour passa a vê-lo.
-- Usuário SEM linha fica com o default `false` (nunca mexeu em preferências nem
-- concluiu o tour) e o tour continua aparecendo, também sem mudança de
-- comportamento. O rollback descarta a coluna; o dado do flag vai junto (não dá
-- para devolver o valor antigo porque antes da migration a coluna não existia).
--
-- EFEITOS COLATERAIS TRATADOS: o UPDATE do backfill toca todas as linhas e
-- dispararia o gatilho `update_user_settings_updated_at`
-- (20260315172343_620fdf49-ed46-4dd2-a33e-d1cd4bd89870), reescrevendo o
-- `updated_at` de toda a tabela. O gatilho é DESLIGADO durante o backfill e
-- RELIGADO logo em seguida; a migration inteira é atômica (falha no meio =
-- nada aplicado, nem o estado do gatilho). O teste prova que `updated_at` não
-- mudou e que o gatilho voltou ligado.
-- Nenhum GRANT/REVOKE, policy ou ACL é tocado: a coluna herda os grants de
-- tabela e as 3 policies de "linha própria" já existentes
-- (`auth.uid() = user_id`), que já cobrem a coluna nova — mesmo padrão aditivo
-- da 20261006155916_user_settings_controles_evento_notificacao.sql.
-- Classe ADITIVA (coluna nova, NOT NULL com default).

SET search_path = public, pg_temp;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_settings.onboarding_completed IS
  'Tour de onboarding concluído (default false). Fonte da verdade para exibir/reiniciar o tour; as linhas existentes na aplicação da migration foram backfilladas como true (critério documentado em 20261013044344_user_settings_onboarding_completed.sql).';

ALTER TABLE public.user_settings DISABLE TRIGGER update_user_settings_updated_at;

UPDATE public.user_settings
   SET onboarding_completed = true
 WHERE onboarding_completed IS DISTINCT FROM true;

ALTER TABLE public.user_settings ENABLE TRIGGER update_user_settings_updated_at;
