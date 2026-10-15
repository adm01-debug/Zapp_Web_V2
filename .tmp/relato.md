Especialista: senior (area-edge-api)

Refazer 1 do cartão "Verificar kill switch de voz e fechar com relato".
Fechamento com tipo `fix` (não `docs`): a entrega carrega código das 3 Edge
Functions + 3 testes (ponto 4 da recusa).

Ponto 1 — contrato AI_DISABLED nas 3 funções (dialogue, voice-design,
voice-changer). Decisão registrada: NÃO mantive o `enforceAiCapability`;
troquei pelo padrão inline da família (`readCapabilityFlag` +
`aiCapabilityFlagKey("voice")` + `jsonResponse` 503 com
`{ error: { code: "AI_DISABLED", message } }`), igual a elevenlabs-tts/sts/
sfx/agent-token. Motivo: o helper emite outro contrato
(`AI_CAPABILITY_DISABLED` via `errorResponse`) e é usado por outros
chamadores em `_shared` (ai-auth, ai-guards); mudar o helper seria
comportamento a mais fora do título. Arquivos:
supabase/functions/voice-changer/index.ts,
supabase/functions/elevenlabs-dialogue/index.ts,
supabase/functions/elevenlabs-voice-design/index.ts. Teste que prova
(vermelho sem a correção, handlers de HEAD~1): os 3 testes de kill switch
falham com `código inesperado no corpo:
{"error":"AI capability disabled","code":"AI_CAPABILITY_DISABLED"}`
(FAILED 3, 1 passed); verde com a correção: 24 passed, 0 failed.
Nomes: "capacidade de voz desligada -> 503 AI_DISABLED..." (voice-changer,
dialogue) e "capacidade desligada -> preview e create recusam 503
AI_DISABLED..." (voice-design).

Ponto 2 — `withEnv` com restauração no teste do voice-changer. O `Deno.env.set`
no topo do módulo foi trocado por helper `withEnv(ENV_OK, fn)` que salva e
restaura SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY/
ELEVENLABS_API_KEY ao final de cada teste (mesmo padrão dos demais testes da
família; voice-design usa o wrapper `teste()`). Prova: sonda
`/tmp/probe_env_leak.ts` — antes: `LEAK: ELEVENLABS_API_KEY=*** após importar
o módulo de teste`; depois: `OK: importar o modulo de teste nao tocou o
Deno.env`. Arquivo: supabase/functions/voice-changer/index.test.ts
(+ ajustes equivalentes de expectativa nos outros 2 testes).

Ponto 3 — posição do gate uniformizada. Nas 3 o gate estava ANTES do rate
limit; agora é DEPOIS, igual às outras 6 (ordem auth → limite → gate →
provedor). Os testes afirmam `consume_rate_limit` chamado 1x antes da recusa
e zero fetch a api.elevenlabs.io. Valores de cota preservados (dialogue 20,
voice-design 5, voice-changer 10 — conferido no diff: nenhuma linha
`enforceRateLimit` alterada). Comentários dos testes e dos handlers
descrevem a mesma regra da família.

Ponto 4 — só o relato. Tipo corrigido para `fix(ia)` no commit 961a9961da
(6 arquivos, 176+/80-, ~28k chars). Os hashes f7d2eabc1c / 411870d5bd /
c77f45c4f7 citados na recusa são os commits da entrega anterior reaplicados
nesta branch (reaplicações de bd510ae56 / 43be77195 / 3c58cb8a0); tamanhos
medidos do patch: 32.452 / 18.471 / 20.551 chars — todos revisáveis (< 90k).
Meu commit novo tem ~28k chars, também revisável.

Arquivos (git diff --name-only HEAD~1...HEAD, colado):
supabase/functions/elevenlabs-dialogue/index.test.ts
supabase/functions/elevenlabs-dialogue/index.ts
supabase/functions/elevenlabs-voice-design/index.test.ts
supabase/functions/elevenlabs-voice-design/index.ts
supabase/functions/voice-changer/index.test.ts
supabase/functions/voice-changer/index.ts

Verificações (resultado real):
- deno test (3 arquivos, kill switch + regressão): ok | 24 passed | 0 failed
- deno test ai-feature-flags (helper preservado p/ outros chamadores):
  ok | 22 passed | 0 failed
- vermelho-antes (handlers HEAD~1 + testes novos, --filter capacidade):
  FAILED 3 (contrato AI_CAPABILITY_DISABLED) — prova que o teste pega o bug
- lint ratchet no commit: baseline=0, atual=0, nenhuma dívida nova
- zapp-verify . --rapido: VERDE SEM BANCO (19s) — db_guard OK, tipos OK,
  lint OK, migrations OK; banco_local AVISO (sem nome de conjunto; sem
  migration neste cartão). Obs: uma primeira execução falhou no db_guard
  citando `.env` fantasma em `Zapp_Web_V2-anexos/.../caso-A-env` (caminho que
  não existe na cópia); reexecução passou — `zapp-db-guard check` direto OK.
