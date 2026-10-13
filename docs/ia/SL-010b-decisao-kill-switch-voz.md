# SL-010b — decisão: chave do kill switch de voz/áudio (IA-009 §2.1)

Cartão de origem: `t_98090b40` (Task 0 — a decisão). Especialista: worker (sql).
Data: 2026-10-13. Base: `dia/2026-10-13`.

## A decisão (única, tomada aqui)

A família de voz/áudio da ElevenLabs **inteira** responde à **chave única**
`ai.capability.voice`. Não há chave por função.

Funções do escopo (9) mapeadas para `ai.capability.voice`:

| Edge Function            | chave de capacidade    |
|--------------------------|------------------------|
| `elevenlabs-tts`         | `ai.capability.voice`  |
| `elevenlabs-tts-stream`  | `ai.capability.voice`  |
| `elevenlabs-sfx`         | `ai.capability.voice`  |
| `elevenlabs-sts`         | `ai.capability.voice`  |
| `elevenlabs-dialogue`    | `ai.capability.voice`  |
| `elevenlabs-voice-design`| `ai.capability.voice`  |
| `voice-changer`          | `ai.capability.voice`  |
| `elevenlabs-agent-token` | `ai.capability.voice`  |
| `elevenlabs-scribe-token`| `ai.capability.voice`  |

Mais `voice-agent` (já mapeado antes desta mudança) — o total da família é 10.

## Por que a chave única (fidelidade ao §2.1)

`docs/ia/IA-009-desligamento-seguro.md` §2.1 lista **10 capacidades**, uma delas
`ai.capability.voice`. O §2.1 fala de "capacidade", não de função: a capacidade de
voz é uma só. Se cada Edge de voz tivesse chave própria (`ai.capability.elevenlabs_tts`,
`..._sfx`, ...), o §2.1 viraria 18 capacidades e o operador deixaria de ter o
botão único "desligar a voz" que o desenho promete — teria de desligar 9 chaves
para atingir o mesmo efeito. A chave única é a leitura fiel: um UPDATE desliga a
família de voz inteira, incluindo os dois tokens (`agent-token`, `scribe-token`),
que são o que permite a sessão de voz começar.

## O que a Task 0 entrega (diff mínimo)

1. **Mapa** `AI_CAPABILITY_BY_FUNCTION` em `supabase/functions/_shared/ai-feature-flags.ts`
   — as 9 funções do escopo acrescentadas apontando para `voice`. O mapa (tipo
   `AiCapability`) é o que `capabilityFlagKeyForFunction()` usa; nenhum valor novo
   de capacidade foi criado (continua 10).
2. **Migration nova** `supabase/migrations/20261013235901_ia009b_kill_switch_voz_chave.sql`
   — semeia `ai.capability.voice` ligada (`enabled = true`) via `ON CONFLICT DO NOTHING`.
   Necessária porque, nesta base, a migration do SL-010
   (`20261008185923_ia009_kill_switch_de_ia.sql`) **não existe** — nenhuma chave
   `ai.capability.*` está semeada. Existir a linha faz o desligamento ser um
   `UPDATE feature_flags SET enabled = false WHERE key = 'ai.capability.voice'`.
3. **Teste** em `supabase/functions/_shared/__tests__/ai-feature-flags.test.ts`:
   as 10 funções da família resolvem para `ai.capability.voice` (vermelho antes do
   mapa, verde depois).

## Achado para os cartões filhos (não é deste cartão corrigir)

O mecanismo de leitura `evaluateAiKillSwitch` (`_shared/ai-kill-switch.ts`) e a
migration `20261008185923_ia009_kill_switch_de_ia.sql` **não estão nesta base**
(`dia/2026-10-13`). O que existe e é consumido é `_shared/ai-feature-flags.ts`
(`enforceAiCapability` / `capabilityFlagKeyForFunction`). Os cartões filhos que
importam `evaluateAiKillSwitch` de `_shared/ai-kill-switch.ts` **não vão resolver
esse import** enquanto o SL-010 não entrar na base. Chave acordada para todos:
`ai.capability.voice`.

## Como um cartão filho prova

1. `capabilityFlagKeyForFunction('<nome-da-função>')` retorna `'ai.capability.voice'`.
2. Com `ai.capability.voice` desligada, a Edge nega antes de tocar a ElevenLabs.
3. A prova de banco aplica as migrations reais e confere a linha semeada.
