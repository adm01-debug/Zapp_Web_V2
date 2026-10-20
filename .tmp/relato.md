Especialista: hugo (area-front-hooks)

## FAIXA DO PAI
Commits 9cf1d41e73 (`feat(storage): paths e expurgo do audio-memes`) — cherry-pick de 0fa8fa6df, do cartão pai t_08ddffae (migration + teste de SQL). NÃO são deste cartão e não foram escritos por mim; entraram porque o pai ficou fora da branch `dia/2026-10-15` (`git merge-base --is-ancestor` deu NAO_ANCESTOR).

Por que foram indispensáveis (e não são escopo meu): o cartão pai é o que põe `public.audio_memes` e `public.audio_meme_favorites` na publicação `supabase_realtime` (`alter publication supabase_realtime add table ...`, linhas 234 e 238 da migration). Sem o pai, o canal que eu assino não recebe evento nenhum: a entrega deste cartão só funciona com a publicação do pai na branch. A pedido do próprio cartão (dependência declarada) e da regra do fluxo, trouxe o commit por cherry-pick em vez de reescrever a migration. As policies de `storage.objects` que aparecem nesse SQL são do escopo do pai (upload/expurgo dos arquivos) — eu não as criei, não as alterei e não as revisei; só o hook e os testes abaixo são meus.

## O que mudou e por quê
- `src/hooks/communication/useAudioMemes.ts`: com o picker aberto o hook agora assina UM canal de realtime (`uniqueRealtimeTopic('audio-memes-realtime')` — padrão RT2, nome único por instância) com dois `.on()`: `audio_memes` e `audio_meme_favorites`, e refaz `fetchMemes()` a cada evento. Antes só existia o fetch da abertura: meme criado por outro atendente (ou favorito alternado em outra aba) só aparecia reabrindo o picker. O canal é removido no fechamento/desmontagem (`supabase.removeChannel`) e um guard `active` descarta evento que chegue depois do fechamento. A falha de assinatura daqui pra frente não é mais silêncio: `SUBSCRIBED` limpa e `CHANNEL_ERROR`/`TIMED_OUT` viram `log.error` + `syncError` no retorno do hook.
- `src/hooks/communication/__tests__/useAudioMemes.realtime.test.tsx` (NOVO): chama o hook real com o cliente Supabase mockado e prova (1) um único canal de nome único cobrindo as duas tabelas, (2) meme novo aparece sem reabrir o picker, (3) evento de favorito também refaz a busca, (4) `CHANNEL_ERROR` avisa em `syncError` e `SUBSCRIBED` limpa, (5) fechar remove o canal e evento tardio não busca, (6) picker fechado não abre canal.
- `useAudioMemes.fechamento.test.tsx`, `useAudioMemes.mediaVolumeBindings.test.tsx`, `useAudioMemes.mutacoes.test.tsx`: os 3 mocks do cliente Supabase ganharam `channel`/`removeChannel` (necessários porque o hook agora abre canal com o picker aberto). Nenhuma asserção existente foi alterada.

## Prova
- vermelho antes (hook na base `dia/2026-10-15`, teste novo): `npx vitest run src/hooks/communication/__tests__/useAudioMemes.realtime.test.tsx` → `Test Files 1 failed (1)` / `Tests 5 failed | 1 passed (6)` (o único que passa é o "picker fechado não abre canal", que vale nos dois estados).
- verde depois: `npx vitest run ...realtime.test.tsx ...fechamento.test.tsx ...mediaVolumeBindings.test.tsx ...mutacoes.test.tsx` → `Test Files 4 passed (4)` / `Tests 23 passed (23)`.
- portão: `zapp-verify . --rapido` → `OK db_guard 1s; OK tipos 382s; OK lint 7s; OK migrations 1s` e `VERIFY: VERDE SEM BANCO (391s)` (EXIT=0). A primeira execução deu `VERMELHO em tipos` porque o workspace ainda não tinha `node_modules` (`TypeScript local nao encontrado`) — rodei `bun install` (651 pacotes) e a segunda passou.

## O que NÃO fiz e por quê
- O aviso de `syncError` fica exposto pelo hook, mas o `src/components/inbox/AudioMemePicker.tsx` (fora dos arquivos que o cartão permite tocar) não desenha esse estado. Deixei registrado em comentário no cartão para virar item da tela.
- Não toquei na migration nem na publicação `supabase_realtime`: quem garante a publicação das duas tabelas é o cartão pai (t_08ddffae), já nesta branch.
