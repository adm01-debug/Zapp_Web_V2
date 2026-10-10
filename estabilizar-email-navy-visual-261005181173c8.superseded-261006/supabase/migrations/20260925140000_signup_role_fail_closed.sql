-- A migration 20260925100500 (PR #673) fecha o auto-provisionamento de role no
-- signup com `ALTER DATABASE postgres SET app.settings.trusted_domains`. Esse
-- statement NAO e' aplicavel neste projeto: no Supabase Cloud o papel `postgres`
-- nao e' superuser e o comando retorna 42501 ("permission denied to set
-- parameter"). A migration foi registrada no ledger como aplicada, mas apenas o
-- primeiro statement dela (mascaramento de get_team_profiles) entrou -- o
-- parametro segue NULL em producao (pg_db_role_setting sem a entrada).
--
-- Consequencia real, ainda ativa: handle_new_user_role() e' fail-open. `v_allowed`
-- nasce true e so' e' restringido quando o parametro esta preenchido; com ele
-- NULL, qualquer dominio de email -- inclusive conta pessoal via Google --
-- ganha a role 'agent' automaticamente no signup, e 'agent' da' acesso a inbox
-- e contatos (PII).
--
-- Fix: tirar a dependencia do parametro de banco. O allowlist continua
-- sobrescrivivel por `app.settings.trusted_domains` (sessao ou role, caso um dia
-- seja configuravel), mas o default deixa de ser "permite todos" e passa a ser o
-- dominio da empresa. Mesma intencao da #673, sem depender de um comando que
-- este projeto nao pode executar.
--
-- Nao e' destrutivo: afeta apenas auto-provisionamento de NOVOS signups. Quem ja
-- tem role continua com ela, e um admin pode conceder role manualmente a
-- qualquer momento para conta de dominio diferente (parceiro, freelancer).

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trusted_domains text;
  v_email_domain    text;
  v_allowed         boolean := false;
BEGIN
  v_email_domain := split_part(NEW.email, '@', 2);

  -- Default fail-closed: sem override configurado, so' o dominio da empresa
  -- recebe role automaticamente. Override opcional via
  -- app.settings.trusted_domains (lista separada por virgula).
  v_trusted_domains := coalesce(
    nullif(current_setting('app.settings.trusted_domains', true), ''),
    'promobrindes.com.br'
  );

  v_allowed := v_email_domain = ANY (string_to_array(v_trusted_domains, ','));

  IF NOT v_allowed THEN
    -- Dominio nao confiavel: nao concede role. Registra para o admin decidir.
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      NEW.id,
      'role_auto_provision_denied',
      'auth.users',
      NEW.id,
      jsonb_build_object(
        'email',  NEW.email,
        'domain', v_email_domain,
        'reason', 'domain_not_trusted'
      )
    );
    RETURN NEW;
  END IF;

  -- Provisionar role padrao 'agent'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Registrar auto-provisionamento
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (
    NEW.id,
    'role_auto_provisioned',
    'auth.users',
    NEW.id,
    jsonb_build_object(
      'email',  NEW.email,
      'domain', v_email_domain,
      'role',   'agent'
    )
  );

  RETURN NEW;
END;
$function$;
