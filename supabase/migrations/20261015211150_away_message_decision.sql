-- away_message_decision
-- Rollback: dropa a policy de leitura, o indice, a tabela do log, as duas funcoes novas e a coluna `enabled` criada em away_messages; nao altera coluna, policy, dado ou ACL preexistente.
-- Rollback (SQL executavel, na ordem):
--   drop policy if exists "Admins e supervisores leem o log de ausencia" on public.away_message_log;
--   drop index if exists public.away_message_log_busca_idx;
--   drop table if exists public.away_message_log;
--   drop function if exists public.record_away_message(uuid, uuid, timestamptz);
--   drop function if exists public.should_send_away_message(uuid, uuid);
--   alter table public.away_messages drop column if exists enabled;
--
-- NAO TEM VOLTA: as linhas do away_message_log (o drop da tabela nao devolve o
-- registro dos envios automaticos ja feitos). O log guarda so
-- (contact_id, connection_id, sent_at) — sem telefone, sem texto e sem token.
--
-- ============================================================================
-- PL-04 (t_8010d4a7): a decisao de envio da "mensagem de ausencia" fica no
-- SERVIDOR. Defeito: a tela de horario comercial cadastra `away_messages`
-- (content + is_enabled) com as variaveis {nome}, {horario_abertura} e
-- {horario_fechamento}, e NADA lia essa tabela — nenhuma funcao substituia as
-- variaveis. Esta migration entrega a decisao (texto ja resolvido ou NULL) e o
-- log que garante no maximo 1 envio por contato a cada 24 h.
--
-- Travas, na ordem em que a funcao decide (todas precisam passar):
--   1. contato existe, nao foi apagado (deleted_at), e da conexao pedida;
--   2. nao e grupo e nao esta em conversa atribuida a um atendente;
--   3. conversa "nao arquivada e ativa" (conversation_status fora de
--      'archived'/'resolved');
--   4. mensagem configurada E habilitada (is_enabled true e content util);
--   5. horario comercial FECHADO (mesma regra de is_within_business_hours);
--   6. nenhum envio automatico para aquele contato nas ultimas 24 h.
--
-- "BOT" NAO E VISIVEL AQUI: no V2 nao existe marca de bot no contato — 'bot' e
-- um valor de REMETENTE de mensagem (src/lib/journey/mappers.ts:82). A funcao
-- recebe (contato, conexao), nao mensagem, entao quem impede resposta a eco de
-- bot/agente e o chamador (PL-05, no webhook, que so chama isto para mensagem
-- RECEBIDA de cliente). Fica registrado para nao parecer trava esquecida.
--
-- TRAVA DE ENVIO (1/2): a coluna NOVA `away_messages.enabled boolean NOT NULL
-- DEFAULT false` e' a trava de seguranca do cartao — desligada por padrao por
-- conexao, inclusive nas conexoes que JA tem linha em away_messages. Nenhum
-- envio automatico acontece ate alguem (dono ou a aba Mensagens) gravar
-- `enabled = true`: o padrao false vale para a coluna nova em TODAS as linhas
-- existentes, entao o recurso nasce fechado. O cartao filho PL-06 (iris) liga o
-- interruptor na tela; o PL-05 (edgar) so chama a RPC.
--
-- TRAVA DE ENVIO (2/2): a coluna PREEXISTENTE `away_messages.is_enabled`
-- (default true em 20251220181300_aa931cb8..., linha 19) NAO e' alterada por
-- esta migration — o default true dela continua. Ela segue sendo respeitada
-- como interruptor de desligamento: com is_enabled false, a decisao devolve NULL
-- (provado em T3a de supabase/tests/away_message_decision.sql). Ou seja: envia
-- somente com `enabled IS TRUE AND is_enabled IS NOT FALSE` — a trava nova
-- manda, e o interruptor antigo continua desligando.
--
-- PERMISSAO: as duas funcoes sao SECURITY DEFINER com search_path fixo e EXECUTE
-- so para service_role (o webhook/Edge) — revogado de PUBLIC, anon e
-- authenticated. Quem grava o log e' a funcao (dono), por isso a tabela so tem
-- SELECT para authenticated (filtrado pela policy de admin/supervisor) e
-- SELECT para service_role: INSERT/UPDATE/DELETE nao sao concedidos a ninguem
-- alem do dono.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trava de seguranca: coluna `enabled` em away_messages (aditiva, nasce false)
-- ---------------------------------------------------------------------------
ALTER TABLE public.away_messages
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;

-- Sem GRANT novo: a coluna entra na mesma tabela e nas mesmas policies — a RLS
-- de away_messages nao depende de coluna.

-- ---------------------------------------------------------------------------
-- 2. Log dos envios automaticos (contact_id, connection_id, sent_at)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.away_message_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  sent_at       timestamp with time zone NOT NULL DEFAULT now()
);

-- Busca da janela de 24 h (contato + conexao, mais recente primeiro).
CREATE INDEX IF NOT EXISTS away_message_log_busca_idx
  ON public.away_message_log (contact_id, connection_id, sent_at DESC);

ALTER TABLE public.away_message_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.away_message_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.away_message_log TO authenticated;
GRANT SELECT ON TABLE public.away_message_log TO service_role;

DROP POLICY IF EXISTS "Admins e supervisores leem o log de ausencia" ON public.away_message_log;
CREATE POLICY "Admins e supervisores leem o log de ausencia"
  ON public.away_message_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Decisao: texto com as variaveis resolvidas, ou NULL (nao envia)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.should_send_away_message(
  p_contact_id uuid,
  p_connection_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_dow    integer;
  v_hora   time;
  v_nome   text;
  v_cfg    public.away_messages%ROWTYPE;
  v_janela public.business_hours%ROWTYPE;
  v_dentro boolean;
  v_texto  text;
BEGIN
  IF p_contact_id IS NULL OR p_connection_id IS NULL THEN
    RETURN NULL;                                   -- sem sujeito: nao envia
  END IF;

  -- Travas 1, 2 e 3: contato da conexao, nao apagado, INDIVIDUAL (nao grupo),
  -- sem atendente atribuido e em conversa nao arquivada/resolvida.
  --
  -- "Nao e grupo" reusa o predicado que as RPCs de talk_me ja aplicam
  -- (20260930310000_harden_talk_me_authorization_and_groups.sql): group_category
  -- nula E sem linha em whatsapp_groups. As outras marcas que aquele predicado
  -- carrega (contact_type LIKE 'grupo%', phone '^digitos-digitos$', '@g.us')
  -- NAO existem nesta base: o chk_contact_type so aceita
  -- cliente/fornecedor/transportadora/colaborador/prestador_servico/parceiro, e o
  -- gatilho trg_normalize_contact_phone (20260412224600) apaga todo caractere
  -- nao numerico no INSERT/UPDATE de phone — conferido no banco local desta
  -- tarefa. Por isso so as duas marcas vivas entram aqui, e as duas sao
  -- provadas em T4 de supabase/tests/away_message_decision.sql.
  SELECT btrim(c.name)
    INTO v_nome
    FROM public.contacts c
   WHERE c.id = p_contact_id
     AND c.deleted_at IS NULL
     AND c.group_category IS NULL
     AND NOT EXISTS (
           SELECT 1
             FROM public.whatsapp_groups wg
            WHERE regexp_replace(c.phone, '[^0-9]', '', 'g')
                = regexp_replace(wg.group_id, '[^0-9]', '', 'g')
         )
     AND (c.whatsapp_connection_id = p_connection_id
          OR c.channel_connection_id = p_connection_id)
     AND c.assigned_to IS NULL
     AND coalesce(c.conversation_status, 'open') NOT IN ('archived', 'resolved');

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Trava 4: mensagem configurada E habilitada. Duas travas de liga/desliga:
  --   a) `enabled` — coluna NOVA (default false), a trava de seguranca do cartao:
  --      nenhuma conexao envia ate alguem liga-la explicitamente;
  --   b) `is_enabled` — coluna preexistente (default true) que a tela ja grava
  --      (MessagesSettings.tsx:131) e o webhook ja le: se estiver false, nao envia.
  SELECT *
    INTO v_cfg
    FROM public.away_messages a
   WHERE a.whatsapp_connection_id = p_connection_id;

  IF NOT FOUND OR v_cfg.enabled IS NOT TRUE OR v_cfg.is_enabled IS FALSE THEN
    RETURN NULL;                                   -- desligada: nao envia
  END IF;

  IF v_cfg.content IS NULL OR btrim(v_cfg.content) = '' THEN
    RETURN NULL;                                   -- sem texto: nao envia
  END IF;

  -- Trava 5: horario comercial fechado. Mesma regra e mesmo fuso de
  -- public.is_within_business_hours(connection_id) (America/Sao_Paulo, dow 0-6),
  -- reescrita aqui para o mesmo SELECT trazer open_time/close_time usados nas
  -- variaveis. Sem horario configurado para hoje = aberto (nao envia), como na
  -- funcao original.
  v_dow  := extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer;
  v_hora := (now() AT TIME ZONE 'America/Sao_Paulo')::time;

  SELECT *
    INTO v_janela
    FROM public.business_hours bh
   WHERE bh.whatsapp_connection_id = p_connection_id
     AND bh.day_of_week = v_dow;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_dentro := CASE
                WHEN v_janela.is_open IS NOT NULL AND NOT v_janela.is_open THEN false
                ELSE (v_hora >= v_janela.open_time AND v_hora <= v_janela.close_time)
              END;

  IF coalesce(v_dentro, false) THEN
    RETURN NULL;                                   -- dentro do horario: nao envia
  END IF;

  -- Trava 6: no maximo 1 envio automatico por contato a cada 24 h.
  IF EXISTS (
    SELECT 1
      FROM public.away_message_log l
     WHERE l.contact_id = p_contact_id
       AND l.connection_id = p_connection_id
       AND l.sent_at > now() - interval '24 hours'
  ) THEN
    RETURN NULL;
  END IF;

  -- Variaveis resolvidas no servidor. O texto nunca volta com "{...}" pendente:
  -- nome vazio cai em 'cliente' e horario nulo cai em vazio, porque
  -- replace(texto, marca, NULL) anularia a mensagem inteira.
  v_texto := v_cfg.content;
  v_texto := replace(v_texto, '{nome}', coalesce(nullif(btrim(v_nome), ''), 'cliente'));
  v_texto := replace(v_texto, '{horario_abertura}',
                     coalesce(to_char(v_janela.open_time, 'HH24:MI'), ''));
  v_texto := replace(v_texto, '{horario_fechamento}',
                     coalesce(to_char(v_janela.close_time, 'HH24:MI'), ''));

  RETURN btrim(v_texto);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Registro do envio (idempotente na janela de 24 h)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_away_message(
  p_contact_id uuid,
  p_connection_id uuid,
  p_sent_at timestamp with time zone DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_quando timestamp with time zone;
  v_id     uuid;
BEGIN
  IF p_contact_id IS NULL OR p_connection_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_quando := coalesce(p_sent_at, now());

  -- Duas entregas do mesmo webhook em paralelo nao podem gravar duas linhas:
  -- a trava por (contato, conexao) serializa o "ver se ja existe / inserir".
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_contact_id::text || ':' || p_connection_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
      FROM public.away_message_log l
     WHERE l.contact_id = p_contact_id
       AND l.connection_id = p_connection_id
       AND l.sent_at > v_quando - interval '24 hours'
  ) THEN
    RETURN NULL;                                   -- ja registrado: nao duplica
  END IF;

  INSERT INTO public.away_message_log (contact_id, connection_id, sent_at)
  VALUES (p_contact_id, p_connection_id, v_quando)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Permissao: negar por padrao, abrir so para o executor (service_role)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.should_send_away_message(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.should_send_away_message(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.record_away_message(uuid, uuid, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_away_message(uuid, uuid, timestamp with time zone)
  TO service_role;
