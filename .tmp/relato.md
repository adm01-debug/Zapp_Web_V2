Especialista: iris

## O que mudou e por quê
- `src/components/inbox/summary/SummaryResult.tsx`: os 4 botões de voz ganharam `aria-label` dinâmico (`Ouvir o resumo em voz alta` / `Ouvir os pontos-chave em voz alta` / `Ouvir os próximos passos em voz alta`, virando `Pausar a leitura ...` quando o trecho está tocando, e `Carregando ...` enquanto carrega) e o de "Ouvir tudo/Parar" virou `Ouvir o resumo completo em voz alta` / `Parar a leitura do resumo completo`. Alvo do botão de voz subiu de 24px (`h-6 w-6`) para `h-8 w-8`, e o de "Ouvir tudo" para `h-8`. Antes só existia Tooltip (nome acessível vazio). [critério 1]
- `src/components/inbox/collaboration/ViewersIndicator.tsx`: o select do perfil e o `channel.track` dentro do `subscribe(async ...)` foram envolvidos em `try/catch` com `log.warn('Falha ao anunciar presença na conversa', error)`; a limpeza passou a `channel.unsubscribe()` antes de `supabase.removeChannel(channel)`. [critério 2]
- `src/components/inbox/collaboration/InternalNotesPanel.tsx` + `src/components/contacts/ContactNotes.tsx`: o popover passou a invalidar também `contactNotesKey(contactId, user?.id)`, e a aba Notas do contato deixou de buscar por conta própria — agora lê pela MESMA chave de react-query via `useContactNotes` (foi a opção "unifique a chave em react-query" do cartão). O caminho de exclusão com confirmação do RLS (`select('id')`, zero linhas = recusa) foi preservado, agora com atualização otimista via `setQueryData`. [critério 3]

## Prova
- `npx vitest run` (4 arquivos) → `Test Files 4 passed (4); Tests 12 passed (12)`
  - `src/components/inbox/summary/__tests__/SummaryResult.a11y.test.tsx` (3 testes: nome acessível por botão; nome dinâmico ao tocar; alvo `h-8 w-8`)
  - `src/components/inbox/collaboration/__tests__/ViewersIndicator.presenca.test.tsx` (3 testes: select falho não lança e loga aviso; track falho idem; `unsubscribe` antes de `removeChannel`)
  - `src/components/inbox/collaboration/__tests__/InternalNotesPanel.sincroniaAba.test.tsx` (1 teste: popover + aba reais sob o mesmo QueryClient — nota criada no popover aparece na aba Notas sem remontar)
  - `src/components/contacts/__tests__/ContactNotes.excluirNota.test.tsx` (5 testes existentes, mantidos verdes após a migração para react-query)
- vermelho antes (código da BASE, via `git show HEAD:<arquivo>`): mesmo comando → `Test Files 3 failed (3); Tests 7 failed (7)` (as 3 suítes novas falham sem as correções).
- verde depois: `Test Files 4 passed (4); Tests 12 passed (12)`.
- tipos: `npx tsc -p tsconfig.app.json --noEmit` → saída vazia, exit 0.
- lint dos 8 arquivos: `✖ 4 problems (0 errors, 4 warnings)` — só avisos PRÉ-EXISTENTES (import do client do Supabase em 2 arquivos que já o importavam e fast-refresh do ViewersIndicator); nenhuma ocorrência nova (ratchet mantido).
- `zapp-verify . --rapido`: roda no `hermes-tarefa-fechar`.

## O que NÃO fiz e por quê
- "captura" (item 2 do O QUE FAZER): o harness de teste é jsdom e prova o DOM real (papéis, nomes acessíveis, alvo) — sem screenshot.
- Canal de presença privado (PD-69) citado no cartão: mudança de banco/Edge, fora de `src/components/**`; não toquei (fica com worker (edge/sql)).
- `ContactService.deleteNote`/`useContactNotes.deleteNote` sem a checagem de zero linhas do RLS: é de `src/services`/`src/hooks` (worker (hooks)); mantive a exclusão própria em ContactNotes para não regredir o R2-AUTH-026.
