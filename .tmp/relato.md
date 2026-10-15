Especialista: senior (area-front-hooks)

[refazer 1] respostas rápidas: contagem sem a RPC do cartão pai (guarda verde)

Ponto 1 — quebra do ESPELHO DO CI no empilhamento (supabase-usage-guard):
a guarda apontava 2 violações NOVAS, ambas `.rpc('increment_quick_reply_use')`
(`src/hooks/chat/useQuickReplies.ts:242` e
`src/hooks/chat/useMessageTemplates.ts:104`). A função nasce na migration do
cartão pai (t_32034c99), que não está neste recorte nem no catálogo (gerado em
2026-10-04); o cartão chamava algo que não existe na sua própria projeção.
O que mudei: os dois `incrementUseCount` voltaram a contar por `update` direto
em `message_templates` (`use_count + 1`, com `eq('id', …)`), mantendo o tratamento
de erro (aviso + sem invalidar o cache) e o `invalidateQueries(['quick-replies'])`.
Removidos os casts `(supabase as any)` e os `eslint-disable` da RPC. Não toquei
em migration, guarda, CI, manifesto nem tipos.
Teste que prova: `useQuickReplies.test.tsx` — "uso contado por update direto"
(3 testes) e `useMessageTemplates.test.tsx` — "uso contado por update direto"
(2 testes); os mocks do supabase NÃO expõem mais `rpc`, então o código antigo
quebra com `TypeError: supabase.rpc is not a function`.
Saída vermelha (código antigo + testes novos): `Test Files 2 failed (2),
Tests 4 failed | 10 passed (14)`.
Saída verde (com a correção): `Test Files 2 passed (2), Tests 14 passed (14)`.
Guarda antes: `Violações totais: 4 | no baseline: 2 | novas: 2`.
Guarda depois: `Violações totais: 2 | no baseline: 2 | novas: 0` —
`OK: nenhuma violação nova`. `grep` confirma: nenhum `.rpc(` restante em `src/`
(só 2 menções em comentário explicando o motivo).

Segunda passada (defeito novo do meu diff): conferi os chamadores por nome —
`QuickRepliesManager.tsx:43` e `ChatPanel.tsx:356` passam `string` (assinatura de
`useQuickReplies` inalterada), `MessageTemplates.tsx:31` passa `Template`
(assinatura de `useMessageTemplates` inalterada); `PersonalStickers` usa outro
hook (`usePersonalStickers`), sem relação. Nenhum arquivo de guarda, manifesto,
CI ou migration no diff. Sem toast duplicado (um aviso por caminho de erro,
como antes).

Arquivos (`git diff --name-only`, colado do comando):
src/hooks/chat/__tests__/useMessageTemplates.test.tsx
src/hooks/chat/__tests__/useQuickReplies.test.tsx
src/hooks/chat/useMessageTemplates.ts
src/hooks/chat/useQuickReplies.ts

Comandos de verificação (resultados reais, pós-correção):
- `bun run vitest run src/hooks/chat/__tests__/useQuickReplies.test.tsx src/hooks/chat/__tests__/useMessageTemplates.test.tsx` → 14 passed (14)
- `node scripts/db-audit/supabase-usage-guard.mjs` → 0 novas (`OK: nenhuma violação nova`)
- `bun run db:guard` → uso OK + drift `arquivos validos em supabase/migrations: 831`
- `bunx eslint` nos 4 arquivos → exit 0
- `bun run typecheck` (`tsc -b --force`) → exit 0
- `zapp-verify full .` (em fundo): db_guard OK, tipos OK, lint OK, migrations OK, banco_local AVISO (sem nome de conjunto, esperado); testes/build aguardando vaga no pool no momento do commit

O que não fiz: a contagem atômica via RPC (`increment_quick_reply_use`) continua
não existindo neste recorte — incrementos concorrentes do mesmo template podem
perder 1 unidade (last-write-wins). A atomicidade volta num follow-up que troca
estes 2 pontos pela RPC depois que o cartão pai (t_32034c99) integrar e o catálogo
a contiver; deixo a sugestão no comentário do cartão.
