-- 20261002581230_talkx_v4_x029_optout
-- versão 20261002581230 reservada para hermes-talkx-v4-x029-optout-261002132523d5 em 2026-10-02T13:26:14-03:00 (hermes-db-migrar --nova)
-- nomes-antigos-conferidos: talkx_suppress_contact — NAO e rename: a funcao continua com o
-- mesmo nome e ganha p_campaign_id uuid DEFAULT null, entao as chamadas de 6 argumentos
-- (ex.: supabase/functions/_shared/evolution-webhook-messages.ts) seguem validas. A
-- assinatura de 6 args e dropada exatamente para nao criar ambiguidade de overload.
-- rollback: 1) DROP VIEW IF EXISTS public.talkx_campaign_optouts; 2) recriar public.talkx_suppress_contact com a assinatura de 6 argumentos e o corpo de supabase/migrations/20260930330000_talkx_suppress_contact_phone_axis.sql (drop function first); 3) DROP FUNCTION IF EXISTS public.talkx_match_optout(text); 4) DROP FUNCTION IF EXISTS public.talkx_normalize_optout_text(text); 5) DROP TABLE IF EXISTS public.talkx_optout_keywords; 6) UPDATE public.talkx_settings SET value = '"PARE para sair"'::jsonb, updated_at = now() WHERE key = 'optout_autoreply' AND value = '"Você foi removido da lista de comunicações da Promo Brindes. Não receberemos mais mensagens para este número. Em caso de dúvidas, entre em contato pelo nosso site."'::jsonb;
--
-- X029 (Fase 3 · Tela 06/10/11/14 · camada banco · DDL). Fecha CAP-023, CAP-024,
-- CAP-026 e CAP-031.
--
-- HOJE: as palavras de opt-out sao uma regex fixa no webhook (reply:29-30), sem
-- "pare" nem "remover"; "PARE" e o proprio texto do seed de autoresposta
-- (M:20260930410000:35). talkx_suppress_contact nao recebe a campanha do envio
-- (M:20260930330000:20-27,40-47) e o indice unico ativo ignora expires_at
-- (M:20260930160000:24-26): um opt-out novo sobre supressao EXPIRADA cai no
-- ON CONFLICT DO NOTHING e nao cria a supressao nova.
--
-- FAZER (esta migration):
--   (a) tabela talkx_optout_keywords (keyword pk, match_mode check em
--       ('exact','contains'), active, created_by, created_at) semeada com
--       sair/parar/pare/stop/cancelar/remover/descadastrar/unsubscribe/optout/
--       nao quero, todas 'exact'; leitura para admin/supervisor, escrita para admin;
--   (b) funcao talkx_match_optout(p_text) — normaliza acento, caixa e pontuacao
--       (via talkx_normalize_optout_text) e devolve a palavra casada ou NULL;
--   (c) talkx_suppress_contact ganha p_campaign_id uuid default null; quando nulo
--       e origem 'auto_optout', usa a campanha do envio mais recente ao contato; se
--       a supressao ativa estiver expirada, encerra-a (removed_at) e cria a nova NA
--       MESMA transacao. A assinatura antiga de 6 argumentos e DROPada — senao o
--       chamador de 6 argumentos fica ambiguo (42725) — e a ACL e reaplicada igual
--       (revoke de public/anon/authenticated, grant execute para service_role);
--   (d) UPDATE do seed optout_autoreply para o texto de confirmacao hoje fixo em
--       wh-msg:309, APENAS se o valor ainda for o original;
--   (e) view talkx_campaign_optouts (security_invoker) com a contagem por campanha.
--
-- Classe: contrato (CREATE TABLE + CREATE FUNCTION + DROP FUNCTION + CREATE VIEW).
-- Idempotente/replayavel: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS e
-- ON CONFLICT DO NOTHING. A ordem merge -> deploy -> apply continua valendo porque a
-- assinatura de talkx_suppress_contact muda (o webhook chama por nome de parametro e
-- usa o default quando p_campaign_id nao e enviado).

-- ---------------------------------------------------------------------------
-- (a) palavras de opt-out configuraveis
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talkx_optout_keywords (
  keyword    text PRIMARY KEY,
  match_mode text NOT NULL DEFAULT 'exact',
  active     boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_optout_keywords_match_mode_check
    CHECK (match_mode IN ('exact', 'contains'))
);

ALTER TABLE public.talkx_optout_keywords ENABLE ROW LEVEL SECURITY;

-- Leitura para admin/supervisor; escrita para admin. Segue o padrao de papeis do
-- repo (is_admin_or_supervisor no SELECT, is_admin nos writes — 20260830150000,
-- 20260830080000) e o estilo de policy idempotente do Talk X (20261002381230).
DROP POLICY IF EXISTS talkx_optout_keywords_select ON public.talkx_optout_keywords;
CREATE POLICY talkx_optout_keywords_select
  ON public.talkx_optout_keywords FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS talkx_optout_keywords_admin_write ON public.talkx_optout_keywords;
CREATE POLICY talkx_optout_keywords_admin_write
  ON public.talkx_optout_keywords FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

REVOKE ALL ON public.talkx_optout_keywords FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_optout_keywords TO authenticated;
GRANT ALL ON public.talkx_optout_keywords TO service_role;

INSERT INTO public.talkx_optout_keywords (keyword, match_mode) VALUES
  ('sair',         'exact'),
  ('parar',        'exact'),
  ('pare',         'exact'),
  ('stop',         'exact'),
  ('cancelar',     'exact'),
  ('remover',      'exact'),
  ('descadastrar', 'exact'),
  ('unsubscribe',  'exact'),
  ('optout',       'exact'),
  ('nao quero',    'exact')
ON CONFLICT (keyword) DO NOTHING;

COMMENT ON TABLE public.talkx_optout_keywords IS
  'Talk X (X029): palavras de opt-out configuraveis. match_mode exact = mensagem inteira; contains = palavra em qualquer posicao.';

-- ---------------------------------------------------------------------------
-- (b) normalizacao e casamento
-- ---------------------------------------------------------------------------
-- Normaliza acento, caixa e pontuacao: minusculas, acentos latinos dobrados para
-- ASCII e qualquer run de nao-alfanumerico vira um espaco simples. Immutable, sem
-- dependencia de extensao (translate + lower + regexp_replace).
CREATE OR REPLACE FUNCTION public.talkx_normalize_optout_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT btrim(
    regexp_replace(
      translate(
        lower(coalesce(p_text, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
        'aaaaaaeeeeiiiiooooouuuucnyaaaaaaeeeeiiiiooooouuuucny'
      ),
      '[^a-z0-9]+', ' ', 'g'
    )
  )
$fn$;

COMMENT ON FUNCTION public.talkx_normalize_optout_text(text) IS
  'Talk X (X029): normaliza acento, caixa e pontuacao para o casamento de opt-out.';

-- Devolve a palavra casada ou NULL. Exact tem prioridade sobre contains; em
-- contains o casamento e por palavra inteira (o texto normalizado nao tem
-- pontuacao, entao o limite e espaco ou inicio/fim).
CREATE OR REPLACE FUNCTION public.talkx_match_optout(p_text text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_norm text;
  v_match text;
BEGIN
  v_norm := public.talkx_normalize_optout_text(p_text);
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  SELECT k.keyword
    INTO v_match
    FROM public.talkx_optout_keywords AS k
   WHERE k.active IS TRUE
     AND (
       (k.match_mode = 'exact'
        AND v_norm = public.talkx_normalize_optout_text(k.keyword))
       OR
       (k.match_mode = 'contains'
        AND (
          v_norm = public.talkx_normalize_optout_text(k.keyword)
          OR v_norm LIKE public.talkx_normalize_optout_text(k.keyword) || ' %'
          OR v_norm LIKE '% ' || public.talkx_normalize_optout_text(k.keyword)
          OR v_norm LIKE '% ' || public.talkx_normalize_optout_text(k.keyword) || ' %'
        ))
     )
   ORDER BY (k.match_mode = 'exact') DESC, length(k.keyword) DESC, k.keyword ASC
   LIMIT 1;

  RETURN v_match;
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_normalize_optout_text(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_normalize_optout_text(text) TO service_role;

REVOKE ALL ON FUNCTION public.talkx_match_optout(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_match_optout(text) TO service_role;

COMMENT ON FUNCTION public.talkx_match_optout(text) IS
  'Talk X (X029): devolve a palavra de opt-out casada em p_text (exact ou contains, com normalizacao) ou NULL.';

-- ---------------------------------------------------------------------------
-- (c) talkx_suppress_contact: campanha + supressao expirada
-- ---------------------------------------------------------------------------
-- A assinatura muda (7 argumentos com default). Sem o DROP da versao de 6
-- argumentos, o PostgreSQL mantem as duas e a chamada de 6 argumentos passa a ser
-- ambigua (42725) — o webhook quebraria.
DROP FUNCTION IF EXISTS public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid
);

CREATE OR REPLACE FUNCTION public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code public.talkx_blacklist_reason,
  p_origin text,
  p_source_message_id uuid,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_campaign_id uuid := p_campaign_id;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- X029: sem campanha informada, o opt-out automatico herda a campanha do envio
  -- mais recente ao contato (o pedido de saida fica ligado a campanha que o gerou,
  -- em vez de nascer orfao).
  IF v_campaign_id IS NULL
     AND p_origin = 'auto_optout'
     AND p_contact_id IS NOT NULL THEN
    SELECT r.campaign_id
      INTO v_campaign_id
      FROM public.talkx_recipients AS r
     WHERE r.contact_id = p_contact_id
       AND r.sent_at IS NOT NULL
     ORDER BY r.sent_at DESC, r.id DESC
     LIMIT 1;
  END IF;

  -- X029: o indice unico ativo ignora expires_at, entao uma supressao EXPIRADA
  -- bloqueia o INSERT novo no ON CONFLICT DO NOTHING. Encerra a expirada
  -- (removed_at) e insere a nova NA MESMA transacao — nada fica visivel no meio.
  -- So a expirada e encerrada: uma supressao ativa e vigente segue vencendo o
  -- conflito e devolvendo NULL (idempotencia preservada).
  UPDATE public.talkx_blacklist AS b
     SET removed_at = statement_timestamp()
   WHERE b.removed_at IS NULL
     AND b.expires_at IS NOT NULL
     AND b.expires_at <= statement_timestamp()
     AND (
       (p_contact_id IS NOT NULL AND b.contact_id = p_contact_id)
       OR (p_phone IS NOT NULL AND b.phone = p_phone)
     );

  INSERT INTO public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, source_message_id, campaign_id)
  VALUES
    (p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id, v_campaign_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id; -- NULL => ja havia supressao ATIVA nao expirada (idempotente, em qualquer eixo)
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.talkx_suppress_contact(
  uuid, text, text, public.talkx_blacklist_reason, text, uuid, uuid
) IS
  'Talk X (X029): supressao idempotente nos eixos contact_id e phone. p_campaign_id nulo com origem auto_optout herda a campanha do envio mais recente; supressao ativa expirada e encerrada e a nova nasce na mesma transacao.';

-- ---------------------------------------------------------------------------
-- (d) autoresposta de opt-out: seed passa a ser o texto de confirmacao
-- ---------------------------------------------------------------------------
-- O texto estava fixo no webhook (wh-msg:309) e o seed guardava apenas "PARE para
-- sair". So troca se o valor ainda for o original — uma edicao ja feita por admin
-- nunca e sobrescrita.
UPDATE public.talkx_settings
   SET value = '"Você foi removido da lista de comunicações da Promo Brindes. Não receberemos mais mensagens para este número. Em caso de dúvidas, entre em contato pelo nosso site."'::jsonb,
       updated_at = now()
 WHERE key = 'optout_autoreply'
   AND value = '"PARE para sair"'::jsonb;

-- ---------------------------------------------------------------------------
-- (e) contagem de opt-outs por campanha
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.talkx_campaign_optouts;
CREATE VIEW public.talkx_campaign_optouts
WITH (security_invoker = true)
AS
SELECT
  b.campaign_id,
  count(*)::bigint AS optout_count,
  count(*) FILTER (WHERE b.origin = 'auto_optout')::bigint AS auto_optout_count,
  max(b.created_at) AS last_optout_at
FROM public.talkx_blacklist AS b
WHERE b.campaign_id IS NOT NULL
  AND b.reason_code = 'opt_out'
GROUP BY b.campaign_id;

COMMENT ON VIEW public.talkx_campaign_optouts IS
  'Talk X (X029): opt-outs por campanha (reason_code opt_out). security_invoker=on: a RLS de talkx_blacklist de quem consulta continua valendo.';

REVOKE ALL ON public.talkx_campaign_optouts FROM PUBLIC, anon;
GRANT SELECT ON public.talkx_campaign_optouts TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fail-closed: se qualquer objeto nao colar, aborta em vez de deixar o contrato
-- pela metade.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(assinatura, ', ') INTO v_missing
  FROM (
    VALUES
      ('public.talkx_match_optout(text)'),
      ('public.talkx_normalize_optout_text(text)'),
      ('public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid,uuid)')
  ) AS esperado(assinatura)
  WHERE to_regprocedure(assinatura) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_v4_x029_funcoes_ausentes: %', v_missing;
  END IF;

  IF to_regclass('public.talkx_optout_keywords') IS NULL
     OR to_regclass('public.talkx_campaign_optouts') IS NULL THEN
    RAISE EXCEPTION 'talkx_v4_x029_objetos_ausentes';
  END IF;

  -- A versao de 6 argumentos NAO pode ter sobrado (ambiguidade 42725).
  IF to_regprocedure('public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'talkx_v4_x029_assinatura_antiga_viva';
  END IF;
END;
$$;
