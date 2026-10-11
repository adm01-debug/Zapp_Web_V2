-- automation_runtime
-- Rollback: dropa os dois gatilhos (em public.messages e public.contacts), as duas funcoes de
-- gatilho, o indice adicionado em public.automations e as duas tabelas novas — bloco "Rollback
-- (completo)" abaixo, executavel. Nao ha dado legado a devolver: as duas tabelas nascem vazias. O
-- que a fila enfileirar DEPOIS da migration se perde no rollback (fila interna, sem copia de dado).
-- Motor de automações do Zapp Web V2 — base de idempotência.
-- Este cartão entrega só o BANCO: a fila de eventos de gatilho (public.automation_events), o log de
-- execuções (public.automation_executions) e os gatilhos de entrada de mensagem e de tag. O motor
-- (Edge Function) que consome a fila, decide time_inactive/business_hours e grava as execuções é de
-- outro cartão; aqui só existem a base idempotente e o enfileiramento.
--
-- CONTRATO
--   * trigger_type segue o vocabulário JÁ usado por public.automations.trigger_type e pelo editor do
--     painel (src/components/automations/automationConstants.ts): 'new_message', 'keyword' e
--     'tag_added'. Não invento 'message_received' — o executor casa automação por trigger_type, e a
--     fila tem de falar o mesmo idioma do resto do sistema.
--   * public.automation_events é a fila: uma linha por evento de gatilho, com trigger_ref estável
--     (id da mensagem, ou a própria tag) para deduplicar. payload é MÍNIMO e nunca leva texto de
--     mensagem: para 'keyword' grava só os termos casados (matched_terms).
--   * public.automation_executions é o log de resultado do motor, com chave natural
--     (automation_id, contact_id, trigger_ref) que impede rodar a mesma automação duas vezes para o
--     mesmo evento. status ∈ ('ok','erro','ignorada'); actions_done leva só os TIPOS de ação e ids.
--
-- ONDE FICA CADA TAG (importante)
--   O cartão falava de "tag adicionada ao contato"; no schema VIGENTE NÃO existem public.tags nem
--   public.contact_tags — elas foram dropadas por 20260927410000_drop_legacy_tags_tables.sql e a tag
--   de contacto passou a ser o array public.contacts.tags (text[]), escrito pelo painel
--   (src/hooks/inbox/useContactQuickActions.ts: add/remove em contacts.tags). Então o gatilho de tag
--   é um AFTER UPDATE OF tags em public.contacts, que só enfileira os valores REALMENTE acrescentados
--   (diferença OLD→NEW, sem diferenciar maiúsculas/minúsculas: 'vip' e 'VIP' são a mesma tag).
--
-- IDEMPOTÊNCIA
--   * Fila: índice único (trigger_type, trigger_ref, contact_id). trigger_ref = id da mensagem para
--     new_message/keyword e a tag em minúsculas para tag_added. Logo a mesma tag não enfileira duas
--     vezes para o mesmo contacto (uma automação de tag_added roda uma vez por tag por contacto),
--     e um webhook reentregue não duplica evento de mensagem.
--   * Execuções: UNIQUE (automation_id, contact_id, trigger_ref) — a mesma automação não roda duas
--     vezes para o mesmo evento.
--
-- SEGURANÇA
--   * RLS ligada nas duas tabelas; política explícita de leitura para staff (admin/supervisor); nada
--     de USING (true). Escrita só pelo service_role (motor) e pelas funções de gatilho.
--   * As funções de gatilho são SECURITY DEFINER com SET search_path = pg_catalog, public. Elas NÃO
--     checam auth.uid(): são disparadas no INSERT/UPDATE de public.messages/contacts, que acontece no
--     caminho de servidor (Edge Function com service_role), onde auth.uid() é nulo — uma checagem de
--     sessão ali barraria a ingestão legítima. Elas não decidem QUEM pode nada: a autorização está na
--     policy da tabela e no próprio INSERT/UPDATE (já existente); aqui só se lê a linha.
--   * ANTI-LAÇO DE MENSAGEM (estrutural): o gatilho de mensagem só enfileira o que veio do CONTATO
--     (sender = 'contact'). Toda mensagem que uma automação envia nasce com sender = 'agent', então
--     o gatilho nunca realimenta a própria automação.
--   * ANTI-LAÇO DE TAG (switch): uma ação 'add_tag' do motor escreveria em contacts.tags e
--     realimentaria o gatilho de tag. O motor deve rodar essa escrita com
--     SET LOCAL zapp.suppress_automation_events = 'on'; com o switch ligado as duas funções não
--     enfileiram nada.
--   * Nenhum objeto existente muda de ACL, de coluna ou de dado. As tabelas novas ficam FORA da
--     publication supabase_realtime (fila interna, não é para o cliente).
--
-- Rollback (completo; para executar, remova o prefixo "-- > " de cada linha):
-- > DROP TRIGGER IF EXISTS trg_automation_events_on_tags ON public.contacts;
-- > DROP TRIGGER IF EXISTS trg_automation_events_on_message ON public.messages;
-- > DROP FUNCTION IF EXISTS public.enqueue_automation_events_on_tags();
-- > DROP FUNCTION IF EXISTS public.enqueue_automation_events_on_message();
-- > DROP INDEX IF EXISTS public.idx_automations_active_trigger_type;
-- > DROP TABLE IF EXISTS public.automation_executions;
-- > DROP TABLE IF EXISTS public.automation_events;
-- Fim do rollback.

-- ---------------------------------------------------------------------------
-- 1. Fila de eventos de gatilho
-- ---------------------------------------------------------------------------
CREATE TABLE public.automation_events (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id   uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  trigger_type text        NOT NULL,
  -- Referência estável do evento de origem: id da mensagem, ou a tag em minúsculas.
  trigger_ref  text        NOT NULL,
  -- Payload mínimo, sem dado pessoal e sem texto de mensagem.
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT automation_events_trigger_type_check
    CHECK (trigger_type IN ('new_message', 'keyword', 'tag_added'))
);

-- Deduplica: o mesmo gatilho do mesmo contacto na mesma origem só entra uma vez.
CREATE UNIQUE INDEX automation_events_fonte_uidx
  ON public.automation_events (trigger_type, trigger_ref, contact_id);

-- Índice parcial: o motor só varre o que ainda não foi processado.
CREATE INDEX idx_automation_events_pendentes
  ON public.automation_events (created_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE public.automation_events IS
  'Fila de eventos de gatilho (new_message/keyword/tag_added) consumida pelo motor. Payload mínimo, sem texto de mensagem.';
COMMENT ON COLUMN public.automation_events.trigger_ref IS
  'Id da mensagem, ou a tag em minúsculas; parte da chave de deduplicação (trigger_type, trigger_ref, contact_id).';

-- ---------------------------------------------------------------------------
-- 2. Log de execuções do motor
-- ---------------------------------------------------------------------------
CREATE TABLE public.automation_executions (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id uuid        NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  contact_id    uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  trigger_type  text        NOT NULL,
  trigger_ref   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'ok',
  -- Só os TIPOS de ação executados e ids; nunca conteúdo enviado.
  actions_done  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error_code    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_executions_status_check
    CHECK (status IN ('ok', 'erro', 'ignorada')),
  -- Idempotência: a mesma automação não roda duas vezes para o mesmo evento do mesmo contacto.
  CONSTRAINT automation_executions_idempotencia_uidx
    UNIQUE (automation_id, contact_id, trigger_ref)
);

-- Índice para a leitura de painel (mais recentes primeiro).
CREATE INDEX idx_automation_executions_recentes
  ON public.automation_executions (created_at DESC);

COMMENT ON TABLE public.automation_executions IS
  'Log de execuções do motor de automações. Chave natural (automation_id, contact_id, trigger_ref) garante idempotência.';

-- ---------------------------------------------------------------------------
-- 3. Índice de apoio para o gatilho achar automações ativas por tipo
-- ---------------------------------------------------------------------------
CREATE INDEX idx_automations_active_trigger_type
  ON public.automations (trigger_type)
  WHERE is_active;

-- ---------------------------------------------------------------------------
-- 4. RLS e permissões (negar por padrão)
-- ---------------------------------------------------------------------------
ALTER TABLE public.automation_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- Leitura de painel para staff: admin/supervisor. Agente comum e anon não leem. Escrita não tem
-- policy: fica com o service_role (motor) e com as funções SECURITY DEFINER dos gatilhos.
CREATE POLICY automation_events_select_staff
  ON public.automation_events FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor((SELECT auth.uid())));

CREATE POLICY automation_executions_select_staff
  ON public.automation_executions FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor((SELECT auth.uid())));

REVOKE ALL ON TABLE public.automation_events, public.automation_executions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.automation_events, public.automation_executions TO authenticated;
GRANT ALL    ON TABLE public.automation_events, public.automation_executions TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Gatilho de entrada: mensagem recebida (new_message + keyword)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_automation_events_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_termos jsonb;
BEGIN
  -- Switch anti-laço: o motor liga isto quando a escrita é dele mesmo.
  IF current_setting('zapp.suppress_automation_events', true) IN ('on', 'true', '1') THEN
    RETURN NEW;
  END IF;
  -- ANTI-LAÇO estrutural: automação envia como 'agent'; a fila só recebe o que o contato mandou.
  IF NEW.sender IS DISTINCT FROM 'contact' THEN
    RETURN NEW;
  END IF;
  -- Mensagem apagada (soft delete) não dispara automação.
  IF COALESCE(NEW.is_deleted, false) THEN
    RETURN NEW;
  END IF;
  -- Sem contato não há sobre quem rodar.
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- new_message: basta existir uma automação ativa desse tipo.
  IF EXISTS (
    SELECT 1 FROM public.automations a
     WHERE a.is_active AND a.trigger_type = 'new_message'
  ) THEN
    INSERT INTO public.automation_events (contact_id, trigger_type, trigger_ref, payload)
    VALUES (NEW.contact_id, 'new_message', NEW.id::text, '{}'::jsonb)
    ON CONFLICT DO NOTHING;
  END IF;

  -- keyword: casa os termos das automações ativas (substring, sem curinga de LIKE) e grava SÓ os
  -- termos casados — nunca o texto da mensagem. keywords fora do formato array é ignorado.
  SELECT jsonb_agg(DISTINCT termo ORDER BY termo)
    INTO v_termos
    FROM public.automations a
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(a.trigger_config -> 'keywords') = 'array'
           THEN a.trigger_config -> 'keywords'
           ELSE '[]'::jsonb END
    ) AS termo
   WHERE a.is_active
     AND a.trigger_type = 'keyword'
     AND length(btrim(termo)) > 0
     AND strpos(lower(COALESCE(NEW.content, '')), lower(termo)) > 0;

  IF v_termos IS NOT NULL AND jsonb_array_length(v_termos) > 0 THEN
    INSERT INTO public.automation_events (contact_id, trigger_type, trigger_ref, payload)
    VALUES (NEW.contact_id, 'keyword', NEW.id::text,
            jsonb_build_object('matched_terms', v_termos))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Gatilho de entrada: tag adicionada ao contato (contacts.tags text[])
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_automation_events_on_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tag text;
BEGIN
  -- Switch anti-laço (ação add_tag do próprio motor).
  IF current_setting('zapp.suppress_automation_events', true) IN ('on', 'true', '1') THEN
    RETURN NEW;
  END IF;
  IF NEW.tags IS NULL OR cardinality(NEW.tags) = 0 THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.automations a
     WHERE a.is_active AND a.trigger_type = 'tag_added'
  ) THEN
    RETURN NEW;
  END IF;

  -- Só os valores ACRESCENTADOS (diferença OLD→NEW), sem diferenciar caixa.
  FOR v_tag IN
    SELECT DISTINCT t
      FROM unnest(NEW.tags) AS t
     WHERE NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(OLD.tags, '{}'::text[])) AS o
        WHERE lower(o) = lower(t)
     )
  LOOP
    INSERT INTO public.automation_events (contact_id, trigger_type, trigger_ref, payload)
    VALUES (NEW.id, 'tag_added', lower(v_tag), jsonb_build_object('tag', v_tag))
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_automation_events_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_automation_events_on_tags()    FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enqueue_automation_events_on_message() IS
  'Gatilho AFTER INSERT em public.messages: enfileira new_message/keyword apenas para mensagem do contato (anti-laço estrutural). SECURITY DEFINER, sem auth.uid() (caminho de servidor).';
COMMENT ON FUNCTION public.enqueue_automation_events_on_tags() IS
  'Gatilho AFTER UPDATE OF tags em public.contacts: enfileira tag_added só para os valores acrescentados (OLD→NEW). SECURITY DEFINER; respeita zapp.suppress_automation_events.';

-- ---------------------------------------------------------------------------
-- 7. Liga os gatilhos
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_automation_events_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_automation_events_on_message();

CREATE TRIGGER trg_automation_events_on_tags
  AFTER UPDATE OF tags ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_automation_events_on_tags();
