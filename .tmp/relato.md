Especialista: hugo

Nota de execução: este refazer foi executado pelo perfil semisenior atuando com a skill de área do cartão (hugo — hooks/estado no front); a primeira linha acima é mantida exatamente como o cartão exige e o reencaminhamento é explicado aqui, no corpo.

## Ponto 1 — primeira linha do relato fora do formato exigido
- O que mudei: nenhuma linha de código; reescrevi apenas `.tmp/relato.md` para que a primeira linha seja exatamente `Especialista: hugo`, sem parênteses nem explicação anexada.
- Teste que prova: não se aplica (mudança só de texto do relato); o código segue byte a byte o da entrega anterior, já julgada correta.

## Ponto 2 — linha de resultado do comando de verificação ausente no texto
- O que mudei: incluí neste relato as linhas de resumo reais, copiadas da saída dos comandos rodados agora nesta tarefa (ver seção Comandos abaixo); nenhuma linha de código foi alterada.
- Teste que prova: `npx vitest run src/lib/__tests__/openContactInChat.test.ts src/components/catalog/__tests__/useSendProduct.test.tsx src/hooks/__tests__/sentimentAlerts.navegacao.test.tsx` → Test Files 3 passed (3); Tests 26 passed (26). Suíte do módulo tocado `npx vitest run src/components/contacts` → Test Files 36 passed (36); Tests 264 passed (264).

## O que a entrega contém (código inalterado desde a entrega anterior, julgada correta)
- `src/lib/openContactInChat.ts` (NOVO): função única `openContactInChat(contactId)` que abre a conversa no Inbox pelo evento `open-contact-chat`. Reúne as três proteções que o cartão pede — CANCELA a cadeia anterior (`clearRetryTimer()` antes de reagendar e de trocar `__pendingOpenContactId`), PARA quando a Inbox consome (`useRealtimeInbox` apaga `__pendingOpenContactId`; a checagem encerra o retry) e LIMPA os timers (handle no módulo + `clearTimeout`), com guarda de ambiente para o callback não estourar `ReferenceError: window is not defined` fora do jsdom.
- `src/components/contacts/useContactsCRUD.ts`: apagado o laço local de 15×200 ms do `openContactChat` (que não cancelava, não parava e não limpava) — agora delega a `openContactInChat`.
- `src/components/catalog/useSendProduct.ts`: apagada a cópia local (`retryTimer`/`clearRetryTimer`/`openContactChat`); mantido o alias `openContactChat` só como superfície de import do módulo (toast do Catálogo, alertas de ligação e testes que mockam `useSendProduct`); o toast chama `openContactInChat`.
- `src/lib/__tests__/openContactInChat.test.ts` (NOVO): chama a função REAL. Prova vermelho→verde registrada na entrega anterior (mutação: removido o `clearRetryTimer()` → `AssertionError: expected [ 'c1', 'c1' ] to deeply equal [ 'c1' ]`, a cadeia anterior redisparava o evento — o defeito do cartão; restaurado em seguida).

## O que NÃO fiz e por quê
- Não alterei nenhuma linha de código: a recusa afirma que o código está correto e no escopo, e manda mexer só no relato.
- Não mexi em `src/hooks/inbox/useRealtimeInbox.ts`: é o consumidor (apaga `__pendingOpenContactId`) e já está correto.
- Não copiei a V3 como base: a V3 abre por hash/`remoteJid`; a V2 abre por `view=inbox` + evento.
- Não rodei `hermes-tarefa-fechar` / `zapp-verify --rapido` via fechar: o modo V1 (iniciar/fechar por tarefa) está congelado na máquina (`CONGELADO: o modo V1 ... está suspenso`); a evidência de verificação desta tarefa são os dois comandos vitest acima, rodados agora e verdes.

## Arquivos (`git diff --name-only 96dd72dc5f...HEAD`, colado)
.tmp/relato.md
src/components/catalog/useSendProduct.ts
src/components/contacts/useContactsCRUD.ts
src/lib/__tests__/openContactInChat.test.ts
src/lib/openContactInChat.ts

## Comandos (resultado real)
- `git show --stat d4bf9d6202` → 4 arquivos, entrega só deste cartão; `git show --stat 8365e50427` → só `.tmp/relato.md`; nenhum diff alheio.
- `npx vitest run src/lib/__tests__/openContactInChat.test.ts src/components/catalog/__tests__/useSendProduct.test.tsx src/hooks/__tests__/sentimentAlerts.navegacao.test.tsx` → Test Files 3 passed (3); Tests 26 passed (26).
- `npx vitest run src/components/contacts` → Test Files 36 passed (36); Tests 264 passed (264).
