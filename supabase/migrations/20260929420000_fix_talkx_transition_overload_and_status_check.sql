-- V02 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 (achado P1-1 da auditoria).
--
-- Dois defeitos no mesmo caminho — o motor de disparo:
--
-- 1) public.transition_talkx_campaign coexistia em DOIS overloads ao vivo:
--    (uuid, text), de 20260911150000, e (uuid, text, text DEFAULT NULL), de
--    20260916210000. O PostgREST nao usa o DEFAULT para desempatar overload:
--    uma chamada por nome com 2 argumentos responde HTTP 300 PGRST203
--    ("Could not choose the best candidate function"). O talkx-send chama a
--    RPC com 2 args em 5 pontos (start, pause e cancel), entao iniciar,
--    pausar e cancelar campanha falhariam em producao. Os 29 testes Deno da
--    edge mockam a RPC, por isso a ambiguidade nunca apareceu em CI.
--    Correcao: manter a assinatura de 3 argumentos (o DEFAULT cobre a
--    chamada de 2) e derrubar a antiga.
--
-- 2) O CHECK de public.talkx_campaigns.status nao aceitava 'scheduled', que o
--    front grava ao agendar uma campanha (useCampaignEditor, launch). O valor
--    entrou no vocabulario do produto (rotulo "Agendada", rota propria,
--    transition_talkx_campaign aceita 'scheduled' como origem de start) sem
--    entrar no CHECK — gravar status='scheduled' falharia em producao.
--    A lista nova e um superconjunto da viva (draft, sending, paused,
--    completed, cancelled), entao nenhuma linha existente viola o CHECK.
--
-- Idempotente: IF EXISTS nos dois lados. O ADD CONSTRAINT roda uma vez por
-- versao de ledger; reaplicar a versao nao acontece (o ledger recusa).
DROP FUNCTION IF EXISTS public.transition_talkx_campaign(uuid, text);

ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_status_check;
ALTER TABLE public.talkx_campaigns ADD CONSTRAINT talkx_campaigns_status_check
  CHECK (status = ANY (ARRAY['draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled']));
