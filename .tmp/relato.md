Especialista: Edgar (area-edge-api) — cartão de VERIFICAÇÃO/fechamento do SL-010b: audita as 3 entregas de
implementação e fecha o ciclo.

## Motivo da recusa e como foi resolvido
Motivo (cartão t_94f7b826, [refazer 2]): "diff de 112910 caracteres é grande demais para revisão completa".
Resolvido por decomposição em fatias pequenas: 1 cartão de decisão de chave (t_98090b40), 3 fatias de código
por grupo de função (t_1266b773, t_7331ffdc, t_ff9692e4) e este cartão de verificação.

Tamanho do diff de código próprio de cada fatia (medido:
`git diff 96dd72dc5f <commit> -- supabase/functions docs supabase/migrations | wc -c`):
- t_98090b40 @ ec829898c = 9.506 chars
- t_1266b773 @ bd510ae56 = 32.223 chars
- t_7331ffdc @ 43be77195 = 18.244 chars
- t_ff9692e4 @ 3c58cb8a0 = 20.311 chars

Todos abaixo do limite duro de 90.000 chars que motivou a recusa do cartão antigo (112.910). O maior (32.223)
fica acima da faixa de atenção de 25.000, mas não é recusa por regra. Cada fatia tem o seu teste Deno, um por
função tocada.

## O que verifiquei — CONCLUÍ
Este branch de fechamento carrega as 3 fatias de código em 3 commits pequenos, um por grupo de função:
- `f7d2eabc1c` (voz/áudio: elevenlabs-tts, elevenlabs-tts-stream, elevenlabs-sfx, elevenlabs-sts)
- `411870d5bd` (tokens: elevenlabs-agent-token, elevenlabs-scribe-token)
- `c77f45c4f7` (elevenlabs-dialogue, elevenlabs-voice-design, voice-changer + mapa em
  `_shared/ai-feature-flags.ts`)
A decisão de chave (t_98090b40 @ ec829898c) permanece na branch dela.

Verificação:
- As 9 Edge do escopo ficam atrás do gate de voz lido no SERVIDOR antes de tocar o provedor pago. Mecanismo
  real: `supabase/functions/_shared/ai-feature-flags.ts` (`readCapabilityFlag`/`aiCapabilityFlagKey`,
  `enforceAiCapability`), chave única `ai.capability.voice` (decisão do t_98090b40, fiel ao §2.1 do IA-009).
  O corpo do cartão citava `_shared/ai-kill-switch.ts` / `evaluateAiKillSwitch`, que NÃO existem na base
  dia/2026-10-13 — desvio registrado pelos 3 cartões e coerente com a decisão do cartão 0.
- Fail-closed: flag ausente/falsa/erro de leitura → 503 (nunca fail-open), zero chamada a
  `api.elevenlabs.io` (o teste dubla o `fetch` global e afirma 0 POST ao provedor).
- Vermelho antes comprovado por mim: com o gate do `elevenlabs-tts` desligado
  (`if (voiceEnabled !== true)` → `if (false && voiceEnabled !== true)`) o teste daquela função falhou
  ("esperado 503, veio 200"); restaurei o gate e ficou verde.

## Achados registrados para o integrador / revisor (informação, não pendência deste cartão)
1. hotspot `supabase/functions/_shared/ai-feature-flags.ts`: alterado em DOIS commits — o cartão 0
   (ec829898c) mapeia as 9 funções para `voice`, e o t_ff9692e4 (3c58cb8a0) mapeia as 3 do seu escopo
   (subconjunto). `git merge-tree 96dd72dc5f ec829898c 3c58cb8a0` acusa "changed in both". No merge, ficar com
   o mapa completo do cartão 0 (o do filho é subconjunto), como o próprio t_ff9692e4 documentou.
2. Código de resposta divergente dentro da família: 6 funções devolvem `{ error: { code: "AI_DISABLED" } }`
   via `jsonResponse` (tts, tts-stream, sfx, sts, agent-token, scribe-token); 3 devolvem
   `{ error: "AI capability disabled", code: "AI_CAPABILITY_DISABLED" }` via o `enforceAiCapability`
   pré-existente (dialogue, voice-design, voice-changer). Nenhum consumidor em `src`/`e2e`/`tests` lê qualquer
   um dos códigos (git grep vazio): não quebra hoje, mas a família deveria convergir num único código.

## Prova (execuções reais, no HEAD deste branch)
- verde: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1`
  sobre os 9 `index.test.ts` do escopo → `ok | 46 passed | 0 failed (1s)`, exit 0
- vermelho (meu): gate do tts desligado → `IA-009: flag de voz desligada -> 503 AI_DISABLED e ZERO chamada ao
  provedor pago ... FAILED` / `error: esperado 503, veio 200` / `FAILED | 1 passed | 1 failed`
- `zapp-verify . --rapido` → `EXIT=0` / `VERIFY: VERDE SEM BANCO (123s)` — `OK dependencias`, `OK db_guard`,
  `OK tipos`, `OK lint`, `OK migrations`. Aviso esperado: `banco_local NÃO VERIFICADO: sem nome de conjunto`
  (este cartão não toca banco).
