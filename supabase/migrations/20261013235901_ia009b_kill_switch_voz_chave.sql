-- ia009b_kill_switch_voz_chave
-- Rollback: remove a chave semeada por esta migration (nenhuma outra linha de feature_flags e tocada).
-- Rollback (SQL executável, na ordem):
--   delete from public.feature_flags where key = 'ai.capability.voice';
--
-- SL-010b (IA-009 §2.1) — a DECISÃO da chave única da família de voz, materializada.
--
-- Por que esta migration existe: o kill switch de capacidade lido no servidor
-- (`supabase/functions/_shared/ai-feature-flags.ts`, mapa `AI_CAPABILITY_BY_FUNCTION`)
-- mapeava SÓ `voice-agent` -> `ai.capability.voice`. As nove Edge que falam direto com a
-- ElevenLabs (tts, tts-stream, sfx, sts, dialogue, voice-design, voice-changer e os tokens
-- agent/scribe) não tinham chave — quem as chamasse direto continuava consumindo o provedor
-- pago com a voz "desligada". O cartão de decisão (t_98090b40) resolveu: a FAMÍLIA inteira
-- responde à ÚNICA capacidade de voz do desenho (`ai.capability.voice`), sem chave por função
-- (o desenho §2.1 declara dez capacidades, e `voice` é uma delas — granularidade nova seria
-- chave inventada, fora do desenho).
--
-- Por que SEMEAR LIGADO (`enabled = true`): a coluna nasce com `default false`. Sem esta linha,
-- um `DELETE`/rollback de outra migration ou uma base nova deixaria a chave ausente; o leitor
-- trata ausência como LIGADA, mas então "desligar a voz" seria um INSERT a mais, não a escrita
-- de UMA linha que o aceite da IA-009 pede ("desligamento imediato sem deploy"). Semear
-- explícito torna o estado de hoje explícito e deixa o desligamento ser:
--   update public.feature_flags set enabled = false where key = 'ai.capability.voice';
--
-- Compatível com o seed do SL-010/IA-009 (`20261008185923_ia009_kill_switch_de_ia.sql`, ainda
-- não integrado nesta base): aquele migration usa `ON CONFLICT (key) DO NOTHING` para a MESMA
-- chave; as duas ordens convergem para uma linha única ligada. Esta migration NÃO cria as
-- outras chaves (`ai.capability.*`, `ai.provider.*`) — isso é do cartão do SL-010.
--
-- Idempotente: reaplicar não altera a linha (ON CONFLICT DO NOTHING).

INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'ai.capability.voice',
  true,
  'IA-009 §2.1: capacidade de VOZ (voice-agent + familia ElevenLabs de voz/audio lida no servidor)'
)
ON CONFLICT (key) DO NOTHING;
