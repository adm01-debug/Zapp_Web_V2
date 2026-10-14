Especialista: senior (area-front-hooks)
## O que mudou e por quê
- src/hooks/integrations/useKnowledgeBase.ts: `deleteFile` em ida única (`DELETE ... .select('id, file_url')`, sem `SELECT` prévio); remoção do objeto só com URL assinada (`/object/sign/`) via `isSignedStorageObjectUrl`; erro genérico único para id inexistente ou sem permissão.
- src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx: mocks no formato novo (retorno do DELETE) + 3 testes novos (sem leitura prévia, erro genérico, locator público legado).
- src/hooks/integrations/__tests__/useKnowledgeBase.deleteFile.integration.test.tsx (novo): fluxo inteiro contra o stack local (PostgREST + RLS + Storage reais); pula sem `KB_INT_*`.
## Prova
- vermelho antes (código antigo x testes novos): `bunx vitest run src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx` → `Tests 6 failed | 7 passed (13)`
- verde depois: `bunx vitest run src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx src/hooks/integrations/__tests__/useKnowledgeBase.uploadIngest.test.tsx` → `Test Files 2 passed (2); Tests 17 passed (17)`
- integração com stack local: `KB_INT_API_URL=... KB_INT_ANON_KEY=... KB_INT_SERVICE_KEY=... bunx vitest run src/hooks/integrations/__tests__/useKnowledgeBase.deleteFile.integration.test.tsx` → `Test Files 1 passed (1); Tests 3 passed (3)`
- sem stack o arquivo de integração pula sem falhar: `Test Files 1 skipped (1); Tests 3 skipped (3)`
- vizinhas (sem regressão): `bunx vitest run src/lib/__tests__/storage_object_reference.test.ts src/hooks/integrations/__tests__/` → `Test Files 44 passed | 1 skipped (45)` (o skipped é a integração sem stack); `src/components/knowledge/__tests__/KnowledgeBaseView.a11y.test.tsx` → `Tests 5 passed (5)`
## Verificação final
- `zapp-verify <cópia> kb-excluir --rapido`: `OK db_guard, tipos, lint, migrations, travas`; `VERMELHO em banco_local` — deriva estrutural pré-existente (182 diferenças em tabelas alheias ao cartão, ex. `whatsapp_connections`, `ai_usage_outbox`; o registro da produção não pôde ser lido, valeu a regra estrita). Meu diff não tem migration nem toca schema: só hook + testes.
- Correção pós-verify: o typecheck barrou `.at(-1)` nos testes (2 erros novos); trocado por índice `length - 1`, commit à parte; `fileActions` voltou a `Tests 13 passed (13)`.
## Pontos do revisor
- Ponto 1: resolvido — removida a leitura prévia (`select().eq().maybeSingle()`); o DELETE retorna `id, file_url` na mesma ida e zero linhas (RLS ou id inexistente) cai no erro genérico `Nada foi excluído — verifique a permissão.` (useKnowledgeBase.ts, `deleteFile`). Prova: `não faz leitura prévia` + `o erro não denuncia se o id existe` (unit, vermelhos antes) e `sem permissão (RLS)` (integração: linha e objeto preservados).
- Ponto 2: resolvido — só URL assinada autoriza remover o objeto (`isSignedStorageObjectUrl` + allowlist de bucket/origem); locator público legado tem a linha excluída e o objeto preservado com aviso (useKnowledgeBase.ts, `deleteFile`). Prova: `locator público legado não apaga o objeto` (unit) e `locator público legado: a linha sai, o objeto fica` (integração, objeto listado antes e depois).
- Ponto 3: resolvido — `useKnowledgeBase.deleteFile.integration.test.tsx` prova o fluxo inteiro no banco/Storage LOCAL com cliente real (admin exclui linha+objeto; anônimo negado preserva ambos; legado preserva o objeto); só o toast é mockado. Achado da prova: o cliente anônimo herdava a sessão do admin via localStorage e o caso RLS mentia — corrigido com `persistSession: false` por cliente.
## O que NÃO fiz e por quê
- Não alterei `src/lib/storage_object_reference.ts`: outros 3 chamadores (team-chat, stickers, resolved-url) usam o parse com pública+assinada; a restrição a `/sign/` é local do `deleteFile` (escopo do título).
- Não mexi em migration, tela nem CI: fora dos 3 pontos e do pedido original.
