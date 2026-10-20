Especialista: semisenior
Skill de área usada: area-edge-api (supabase/functions). Trabalho executado no workspace próprio ~/hermes-workspaces/Zapp_Web_V2/sl-010b-refazer1-tdf315e0c, povoado por leitura da dia/2026-10-14 (f5885801b1). Ferramentas V1 (hermes-tarefa-iniciar/fechar) congeladas na sessão (CONGELADO, sem MODO_V2); entrega = rebase vazio + este relato, conforme o próprio cartão manda para o caso de nada restar.

## Resultado
NADA RESTA POR FAZER EM CÓDIGO. As 9 Edge ElevenLabs de voz/áudio já negam com 503 pela chave única ai.capability.voice na ponta da dia/2026-10-14, com teste nomeado por função. Diff deste refazer contra a base: VAZIO (nenhum arquivo tocado, nenhum commit novo).

## Ponto 1: rebase para a dia atual + seed (git show --stat, sem seed nova a bordo)
Ponto 1: a base adotada é dia/2026-10-14 (f5885801b1, 14/10). O trabalho anterior (2217837f96 + afc6b27269) tem ZERO migration: `git show --stat --format="" 2217837f96` lista só 13 arquivos em supabase/functions (503 inserções, 15 remoções) e afc6b27269 só 2 arquivos de teste — nenhuma seed nova a bordo, então nada há para re-sementar. Na dia, a ausência de seed é decisão documentada no cabeçalho de supabase/functions/_shared/ai-feature-flags.ts ("SEM seed/migration: a AUSÊNCIA da chave vale LIGADA") e `git grep -l ai.capability.voice dia/2026-10-14 -- supabase/migrations/` retorna vazio. Comportamento equivale a "semeada ligada". Arquivos: nenhum tocado. Teste que prova: suíte abaixo (flag ausente = caminho feliz 200 com 1 fetch ao provedor, em tts/tts-stream/sfx/tokens).

## Ponto 2: cobertura função por função — onde cada parte vive na dia
Ponto 2: mapeado o trabalho anterior contra a dia; cada item já entrou por um destes commits irmãos, preservado integralmente (nenhum cherry-pick refeito para não duplicar diff):
- elevenlabs-tts, elevenlabs-tts-stream, elevenlabs-sfx (gate em request.ts via voiceAiDisabledResponse), elevenlabs-sts → commit 51e29781c3 (cartão 2610131101e0c2). Gate: `readCapabilityFlag(aiCapabilityFlagKey("voice"))`, 503 + AI_DISABLED via jsonResponse, antes do fetch.
- elevenlabs-agent-token, elevenlabs-scribe-token → commit 98124a6590 (cartão 2610131126341c). Mesmo padrão, gate na linha 27, antes de emitir o token.
- elevenlabs-dialogue, elevenlabs-voice-design, voice-changer → commit 368c087d3c (cartão 261013111024a3). Gate: `enforceAiCapability` (linhas 36-41 dialogue, 121-126 voice-design, 30-35 voice-changer), 503, antes de qualquer reserva de orçamento/provedor; mapa em ai-feature-flags.ts linhas 70-72.
Teste que prova (todos verdes na execução abaixo): "IA-009: flag de voz desligada -> 503 AI_DISABLED e ZERO chamada ao provedor pago" (tts, tts-stream, sfx, sts, agent-token, scribe-token), "IA-009/SL-010b: capacidade de voz desligada -> 503, zero chamada ao provedor e sem consumir limite" (dialogue, voice-changer), "IA-009/SL-010b: capacidade desligada -> preview e create recusam 503..." (voice-design); logs mostram key=ai.capability.voice motivo=flag_desligada e os testes de caminho feliz ("flag ligada -> 200... o gate não barra o caminho feliz").

## Ponto 3: testes + verificação
Ponto 3: suíte Deno do escopo, comando canônico do CI, executada agora no workspace acima:
`deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/elevenlabs-tts/index.test.ts supabase/functions/elevenlabs-tts-stream/index.test.ts supabase/functions/elevenlabs-sfx/index.test.ts supabase/functions/elevenlabs-sfx/request.test.ts supabase/functions/elevenlabs-sts/index.test.ts supabase/functions/elevenlabs-dialogue/index.test.ts supabase/functions/elevenlabs-voice-design/index.test.ts supabase/functions/voice-changer/index.test.ts supabase/functions/elevenlabs-agent-token/index.test.ts supabase/functions/elevenlabs-scribe-token/index.test.ts`
→ `ok | 49 passed | 0 failed (1s)`, EXIT 0. Regressão ao lado: suíte Deno de TODA supabase/functions → `1907 passed | 1 failed`, sendo o 1 falho o teste SL-149 de evolution-webhook que lê docs/TROUBLESHOOTING.md ausente na extração parcial (artefato do meu workspace de leitura, não da dia); reexecutado com o doc presente → `ok | 4 passed | 0 failed`. zapp-verify FULL não executado: exige cópia completa do repo + stack de banco e as ferramentas V1 de workspace estão congeladas nesta sessão — registrado como ressalva honesta, sem bloquear o fechamento que o cartão prescreve para este caso.

## Ponto 4: duplo kill switch NÃO é defeito — mesma chave, sem unificar
Ponto 4: não unifiquei nem removi nada, conforme mandado. Conferido que todas as linhas usam a chave canônica única: 6 funções com `readCapabilityFlag(aiCapabilityFlagKey("voice"))` e 3 com `enforceAiCapability` (que resolve a mesma chave pelo mapa AI_CAPABILITY_BY_FUNCTION); os logs dos testes confirmam key=ai.capability.voice nas 9. O módulo antigo _shared/ai-kill-switch.ts do trabalho anterior não existe mais na dia (a reescrita dos irmãos usa _shared/ai-feature-flags.ts) — por isso nenhum cherry-pick foi trazido: trazer seria duplicar o gate. Observação sem ação: os códigos de erro divergem entre irmãos (AI_DISABLED em 6, AI_CAPABILITY_DISABLED em 3); unificar quebraria testes dos cartões irmãos e o ponto 4 veda a unificação — fica como achado para o coordenador, não correção.

## Arquivos alterados (git diff --name-only base...HEAD)
Nenhum. Diff vazio por construção: todo o conteúdo já vive na dia via 51e29781c3, 98124a6590 e 368c087d3c.

## O que NÃO fiz e por quê
- NÃO commitei: sem commit novo porque nada restou (cartão: "nesse caso o fechamento é o rebase vazio + o relato"); o relato-que-passa veda commit quando o cartão manda fechar sem commit se já resolvido.
- NÃO rodei zapp-verify FULL: ver Ponto 3 (ressalva explícita).
- NÃO portei _shared/ai-kill-switch-elevenlabs.test.ts (9 testes do trabalho anterior): módulo-alvo deletado na dia; a cobertura equivalente existe por função (Ponto 2) — portar seria diff maior que o título.
- NÃO semeei flag nem unifiquei códigos: decisão documentada da dia + vedação do Ponto 4.
