Especialista: semisenior (skill area-testes-do-produto)
## O que mudou e por quê
- ESTADO.md (2 linhas): âncoras `elevenlabs-sts` (`VoiceChanger.tsx:54` → `:81`) e `voice-changer` (`VoiceChangerPicker.tsx:158` → `:186`). A reescrita do trocador de voz nos commits do stack deslocou os chamadores reais (`/functions/v1/elevenlabs-sts` foi da linha 54 para a 81; `/functions/v1/voice-changer` da 158 para a 186); o documento ficou para trás e o espelho quebrou. Nenhum código, chamador, guarda ou migration foi tocado.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`, `AssertionError: âncora desatualizada: src/components/inbox/VoiceChanger.tsx:54 não cita \`elevenlabs-sts\``, `ℹ pass 10 / ℹ fail 1`
- verde depois (mesmo comando): `ℹ tests 11 / ℹ pass 11 / ℹ fail 0`
- sem regressão ao lado: só `scripts/ci/docs-estado-registry-convention.unit.mjs` lê ESTADO.md; `node --test` dos globs de `scripts/ci|edge-deploy|db-audit|talkx` tem os mesmos vermelhos com e sem esta correção (pré-existentes, fora do escopo): `lint-ratchet.unit.mjs` 24 pass/6 fail, `talkx-engine-window-contract` + `talkx-schedule-timezone-contract` 15 pass/2 fail — idênticos com ESTADO.md restaurado ao estado recusado.

## Pontos da recusa
- Ponto 1: resolvido — `ESTADO.md:81` (`VoiceChanger.tsx:54`→`:81`) e `ESTADO.md:127` (`VoiceChangerPicker.tsx:158`→`:186`); teste `ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` passa 11/11.
- Ponto 2: cumprido — correção só em ESTADO.md (script-local da guarda `docs-estado-registry-convention`); sem rebase em `dia/`, sem edge nova, sem tocar em chamador real.
- Ponto 3: cumprido — este relato segue o formato (primeira linha exata, pontos numerados, nenhuma afirmação fora do diff).

## FAIXA DO PAI
- Branch `v2/t-da634519-2610130120af21` contém os commits do cartão pai `t_da634519` abaixo do meu: `7cf58a1120`, `64092477f4`, `26e81f4140` — não são deste cartão; meu commit novo contém só ESTADO.md + este relato. Workspace reutilizado (o da entrega, sessão anterior encerrada) porque `hermes-tarefa-iniciar`/`fechar` estão congelados sem MODO_V2 nesta máquina.

## Arquivos do meu commit
- ESTADO.md
- .tmp/relato.md

## O que NÃO fiz e por quê
- Não mexi nos 6 vermelhos de `lint-ratchet.unit.mjs` nem nos 2 de `talkx-*-contract`: falham igual com e sem minha correção (prova acima); são de outros cartões.
- Não recriei workspace novo nem rodei `hermes-tarefa-fechar`: ambos bloqueados pelo congelamento (sem MODO_V2); entrega deixada no workspace da entrega com relato em `.tmp/relato.md`.
