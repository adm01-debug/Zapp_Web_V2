Especialista: semisenior
(skill de área: area-front-hooks; cartão de hook+componente de chat)

## O que mudou e por quê
- Rebase do trabalho anterior sobre `dia/2026-10-14` (que já contém o PTT-limits integrado) e descarte dos cherry-picks do cartão pai. O conteúdo entregue é só o commit `21416a2eaf` (`feat(chat): gravador de áudio com pausa, recuperação, desfazer descarte e reenvio`).
- 6 arquivos, todos do título do cartão:
  - `src/hooks/communication/useAudioRecorder.ts`: pausa/retomada, rascunho para recuperação, desfazer descarte, reenvio com backoff
  - `src/components/inbox/AudioRecorder.tsx`: UI de pausa/recuperação (props `onSend`/`onCancel` inalteradas para os chamadores)
  - `src/hooks/__tests__/useAudioRecorder.pausa-recuperacao.test.ts` (novo), `src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts` (+13), `src/components/inbox/__tests__/AudioRecorder.pausa-recuperacao.test.tsx` (novo), `src/components/inbox/__tests__/AudioRecorder.test.tsx` (+22)

## Prova
- Tamanho do diff (gate: teto de 90000 caracteres): antes `90956` (recusa); depois `git diff dia/2026-10-14...21416a2eaf | wc -c` → `64132`.
- `node_modules/.bin/vitest run src/hooks/__tests__/useAudioRecorder.pausa-recuperacao.test.ts src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts` → `Test Files 2 passed (2)` / `Tests 18 passed (18)` (zero falha, zero pulado).
- `node_modules/.bin/vitest run src/components/inbox/__tests__/AudioRecorder.pausa-recuperacao.test.tsx src/components/inbox/__tests__/AudioRecorder.test.tsx` → `Test Files 2 passed (2)` / `Tests 9 passed (9)` (zero falha, zero pulado).
- `node_modules/.bin/tsc --noEmit` → nenhuma linha de erro em `AudioRecorder`, `useAudioRecorder` ou `pttLimits`.
- Chamadores de `<AudioRecorder>` (`ChatInputArea.tsx:169`, `ChatMessageInput.tsx:184`, `TeamChatInputArea.tsx:113`) passam só `onSend`+`onCancel`; a props aceita `onSend: (audioBlob: Blob) => void | Promise<unknown>` (`AudioRecorder.tsx:12`), compatível sem alteração.

## Pontos do revisor
- Ponto 1 (diff maior que o título; faixa 07c9f47..1a160b4 do PTT-limits): resolvido — os commits `07c9f47f0c` e `1a160b40ea` foram descartados; `git diff --stat dia/2026-10-14...21416a2eaf` lista só os 6 arquivos acima. O módulo PTT (`src/lib/audio/pttLimits.ts`, 147 linhas) vem da base: `git show dia/2026-10-14:src/lib/audio/pttLimits.ts | wc -l` → `147`. FAIXA DO PAI: nenhuma — não resta commit de outro cartão.
- Ponto 2 (`useRealtimeInbox.ts` fora do título): resolvido — o arquivo não aparece no diff (era parte do cherry-pick descartado); a validação PTT no envio continua vindo da base (`validatePttBlob` presente em `dia/2026-10-14:src/hooks/inbox/useRealtimeInbox.ts`).
- Ponto 3 (3 commits seguidos só no relato): resolvido — `b7d7f75d24`, `73f094b2eb`, `6f05c81412` (todos só `.tmp/relato.md`, conferido via `git show --stat`) foram descartados; este é o único relato.

## Arquivos do diff (git diff --name-only dia/2026-10-14...21416a2eaf, colado do comando)
- src/components/inbox/AudioRecorder.tsx
- src/components/inbox/__tests__/AudioRecorder.pausa-recuperacao.test.tsx
- src/components/inbox/__tests__/AudioRecorder.test.tsx
- src/hooks/__tests__/useAudioRecorder.lifecycle.test.ts
- src/hooks/__tests__/useAudioRecorder.pausa-recuperacao.test.ts
- src/hooks/communication/useAudioRecorder.ts

## O que NÃO fiz e por quê
- NÃO CONCLUÍ o giro do branch no servidor: `hermes-tarefa-iniciar`/`hermes-tarefa-fechar` estão congelados (CONGELADO presente, MODO_V2 ausente) e o rebase ficou com estado pendente no worktree (o `git rebase --onto` registrou `head-name` como `detached HEAD` e a guarda barra `--skip/--continue` nessa condição; reparo do metadado também é barrado em `~/projetos`). Para o integrador: basta `git rebase --skip` 3x no workspace `~/hermes-workspaces/Zapp_Web_V2/audio-gravador-pausa-recuperacao-2610130601fcc2`, ou aplicar `.tmp/patch-refazer1.patch` (64132 caracteres, gerado por `git diff dia/2026-10-14...21416a2eaf`) sobre `dia/2026-10-14` — o conteúdo é idêntico e os testes acima passam sobre a base.
