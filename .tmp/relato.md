Especialista: worker (geral) (área do cartão: hugo — hooks/estado no front; cartão reencaminhado de hugo para worker, executo e assino como worker (geral))

## O que mudou e por quê
- `src/lib/openContactInChat.ts` (NOVO): função única `openContactInChat(contactId)` que abre a conversa no Inbox pelo evento `open-contact-chat`. Reúne as três proteções que o cartão pede — CANCELA a cadeia anterior (`clearRetryTimer()` antes de reagendar e de trocar `__pendingOpenContactId`), PARA quando a Inbox consome (`useRealtimeInbox` apaga `__pendingOpenContactId`; a checagem encerra o retry) e LIMPA os timers (handle no módulo + `clearTimeout`), com guarda de ambiente para o callback não estourar `ReferenceError: window is not defined` fora do jsdom.
- `src/components/contacts/useContactsCRUD.ts`: apaguei o laço local de 15×200 ms do `openContactChat` (que não cancelava, não parava e não limpava) — agora ele delega a `openContactInChat`.
- `src/components/catalog/useSendProduct.ts`: apaguei a cópia local (`retryTimer`/`clearRetryTimer`/`openContactChat`) e mantenho o alias `openContactChat` só como superfície de import do módulo (toast do Catálogo, alertas de ligação e testes que mockam `useSendProduct`); o toast chama `openContactInChat`.
- `src/lib/__tests__/openContactInChat.test.ts` (NOVO): chama a função REAL.

## Prova
- vermelho antes (mutação: removido o `clearRetryTimer()`): `npx vitest run src/lib/__tests__/openContactInChat.test.ts -t "cancela a cadeia"` → `AssertionError: expected [ 'c1', 'c1' ] to deeply equal [ 'c1' ]` — a cadeia anterior redisparava o evento (é o defeito do cartão). Restaurado em seguida.
- verde depois: `npx vitest run src/lib/__tests__/openContactInChat.test.ts src/components/catalog/__tests__/useSendProduct.test.tsx src/hooks/__tests__/sentimentAlerts.navegacao.test.tsx` → ZERO falhas, ZERO pulados (linha de resumo no bloco FATOS MEDIDOS acima).
- suíte do módulo tocado: `npx vitest run src/components/contacts` → ZERO falhas (`useContactsCRUD` e vizinhos seguem verdes).
- verificação do cartão: `zapp-verify . --rapido` (rodada no fechar).

## Testes tocados
- NOVO `src/lib/__tests__/openContactInChat.test.ts`: navega/marca pendente/entrega o evento; não renavega quando já está na view do inbox; clique rápido cancela a cadeia anterior (o caso do critério 2); para e zera timers quando a Inbox consome; reabre o mesmo contato depois de consumido; não estoura quando `window` some no meio da cadeia.
- `src/components/catalog/__tests__/useSendProduct.test.tsx` e `src/hooks/__tests__/sentimentAlerts.navegacao.test.tsx` seguem verdes e cobrem o alias reexportado.

## O que NÃO fiz e por quê
- Não mexi em `src/hooks/inbox/useRealtimeInbox.ts`: é o consumidor (apaga `__pendingOpenContactId`) e já está correto.
- Não copiei a V3 como base: a V3 abre por hash/`remoteJid`; a V2 abre por `view=inbox` + evento. A V2 já estava certa no Catálogo — o trabalho foi unificar em um lugar só.
