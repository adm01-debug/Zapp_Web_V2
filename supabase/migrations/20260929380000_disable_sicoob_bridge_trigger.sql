-- Migration: desliga a Sicoob Bridge
-- Autor: Hermes (docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md — etapa 11)
-- Decisao D2 (29/09/2026): desligar. A ponte ja estava quebrada em producao desde o CHECK
-- `chk_contact_type` (28/09): `sicoob-bridge` insere `contact_type: 'sicoob_gifts'`, valor
-- que a constraint rejeita. Medicao antes da decisao (etapa 2):
--   contacts com channel_type='internal_chat' ............ 0
--   contacts com phone ILIKE 'sicoob-%' .................. 0
--   mensagens desses contatos ............................ 0
--   invocacoes de sicoob-bridge/sicoob-bridge-reply (24h) . 3 cada, sem criar contato
-- Ou seja: a bridge nunca produziu dado em producao. Nada depende dela — o caminho inverso
-- (recriar `sicoob_gifts` como 7o tipo oculto) reabriria a ambiguidade que a Fase 2 fechou.
--
-- O codigo correspondente sai no mesmo PR (edges sicoob-bridge/ e sicoob-bridge-reply/,
-- dashboard admin, rota, item de menu, schemas compartilhados e o filtro `phone ilike
-- 'sicoob-%'` das audiencias Talk X), e `supabase/deployment-manifest.json` e regenerado.
--
-- Aplicada DEPOIS do merge e do deploy (classe contrato), pelo hermes-tarefa-mergear.

DROP TRIGGER IF EXISTS trg_sicoob_reply ON public.messages;

DROP FUNCTION IF EXISTS public.notify_sicoob_on_reply();

COMMENT ON TABLE public.messages IS
  'Mensagens de todas as origens. O trigger trg_sicoob_reply (Sicoob Bridge) foi removido em 29/09/2026.';
