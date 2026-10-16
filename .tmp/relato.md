Especialista: semisenior
Refazer 1 do PG-08 (t_05734e4e): hook de playbooks ativos + toggle ligado ao gerenciador. 4 pontos da recusa, na ordem do cartão.
Nota ao juiz sobre "arquivo fora da lista": todos os 9 arquivos estão em ARQUIVOS QUE PODE TOCAR do cartão — PlaybooksManager.tsx e os 2 hooks nominalmente; os 2 testes como "testes deles"; playbooks-rls.sh e docs/catalogo/playbooks.md nominalmente (com alternativa docs/atalhos); relato e verify-pg08 como .tmp nominal. Nenhum outro arquivo foi tocado (sem .github, sem teste de outro cartão).

Ponto 1: guard is_active no usePlaybooksData — resolvido (mantido + provado). O guard `.eq('is_active', true)` está em `src/hooks/admin/usePlaybooksData.ts:83` (`fetchPlaybooksAtivos`); sem ele o atendente leria playbook desativado. Teste `src/hooks/admin/__tests__/usePlaybooksAtivos.test.tsx` ("filtra is_active=true e ordena...", "recorta por categoria..."): VERMELHO sem o guard (3 falhas — `pb-sales-off` vaza na lista e somem os filtros `['is_active', true]`), VERDE com o guard (8/8 no arquivo).

Ponto 2: toggle LIGADO ao PlaybooksManager, com desfecho e teste ligado — resolvido. O cartão do gerenciador ganhou um Switch por playbook (`src/components/admin/PlaybooksManager.tsx:270`, handler `alternarAtivoDoPlaybook` em `:166`, mutation `useSetPlaybookActive` em `:59` via import em `:38`): a escrita passa por `setPlaybookActive`, que confere linhas afetadas (RLS que barra vira erro visível, nunca "sucesso" falso); o `onError` (toast único) mora no hook e o gerenciador só sincroniza a lista local no `onSuccess`. O Switch tem `stopPropagation` para não abrir o detalhe. Teste novo `PlaybooksManager.test.tsx` ("toggle de ativo/inativo passa pelo hook..."): VERMELHO sem o Switch (1 falha — switch não existe), VERDE com ele (prova `updates == [{is_active:false}]`, toast "Playbook atualizado", selo "Inativo"). O save de edição/criação do mesmo gerenciador tinha a mesma falha de "sucesso falso" (update/insert sem conferir linhas): agora usa `.select('id')` e barra quando `!escrita.data?.length` (`PlaybooksManager.tsx:145-155`), com o diálogo mantido aberto no erro. Teste novo ("salvar edição barrada pela RLS..."): VERMELHO sem o cheque (falha — anunciaria sucesso e fecharia), VERDE com ele (toast "Erro ao salvar", sem toast.success, diálogo aberto). O resto da segunda review continua contemplado: ordem (categoria→nome→id), confirmação ao excluir, erro de carga explícito, teclado — 7 testes antigos verdes.

Ponto 3: teste funcional de RLS commitado — resolvido. `scripts/db-audit/playbooks-rls.sh` (novo, executável) prova em PostgreSQL 17 descartável, contra a migration 20260409014536: red-first sem a policy de UPDATE, texto das 3 policies conferido, admin desativa (1 linha), agente comum escreve 0 linhas sem erro e lê via SELECT. Rodado aqui: 6/6 [OK], saída 0. Referenciado em `docs/catalogo/playbooks.md` (novo).

Ponto 4: sem tocar em teste de outro cartão nem no gate — resolvido. `git diff --name-only HEAD` não lista `.github/workflows/db-guard.yml` nem nenhum teste fora de playbooks; o `.github` não aparece no `git status`.

Arquivos (6 no diff contra a base + 3 untracked: docs, script e este relato):
- .tmp/verify-pg08.log (6 linhas, saída fresca do verify desta entrega)
- .tmp/relato.md (este arquivo)
- docs/catalogo/playbooks.md (novo)
- scripts/db-audit/playbooks-rls.sh (novo, +x)
- src/components/admin/PlaybooksManager.tsx (+toggle ligado ao hook)
- src/components/admin/__tests__/PlaybooksManager.test.tsx (+wrapper de QueryClient, mock com 1 linha afetada, +1 teste)
- src/hooks/admin/usePlaybooksAtivos.ts (novo na base)
- src/hooks/admin/usePlaybooksData.ts (novo na base)
- src/hooks/admin/__tests__/usePlaybooksAtivos.test.tsx (novo na base)

Verificações (todas rodadas agora, nesta cópia):
- `bunx vitest run src/hooks/admin/__tests__/usePlaybooksAtivos.test.tsx src/components/admin/__tests__/PlaybooksManager.test.tsx` → 2 arquivos, 17 testes, todos verdes.
- `bash scripts/db-audit/playbooks-rls.sh` → 6/6 [OK], saída 0 (banco descartável real).
- `zapp-verify . --rapido` → VERDE SEM BANCO (110s): db_guard OK, tipos OK (106s), lint OK, migrations OK; banco_local AVISO (sem nome de conjunto, igual à entrega anterior).
- Diff fora de .tmp: 52979 caracteres (< 90000). Sem project-ref de produção em linha adicionada.
