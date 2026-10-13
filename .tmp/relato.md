Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/contacts/useContactsViewState.ts: o modo de visualização deixou de ser `useState('grid')` e passou a ser lido/gravado no `localStorage` (chave `contacts:view-mode`, dentro de `try/catch`, só aceitando modos válidos) — reabrir a tela volta no modo escolhido. O contato do painel passou a ser DERIVADO da lista atual por id (`useMemo` sobre `filteredContacts`) em vez de uma cópia do clique: o painel não mostra mais nome/telefone antigos depois de editar pelo próprio painel e fecha quando o contato sai do filtro/tipo.
- src/components/contacts/useContactsCRUD.ts: o UPDATE da edição passou a levar a precondição `.eq('updated_at', <versão que o formulário abriu>)`. Quando o UPDATE afeta 0 linhas E a versão atual da linha é diferente, lança `Outra pessoa alterou este contato. Recarregue os dados e tente novamente.` — 0 linhas com a MESMA versão continua sendo a falha de permissão (R2-AUTH-013), que não foi afrouxada. A leitura do estado atual da linha desestrutura `{ data, error }`: se essa leitura falha, lança `Não foi possível confirmar o estado atual do contato. Recarregue os dados e tente novamente.` em vez de engolir o erro e cair na mensagem de permissão (apontamento do juiz barato, corrigido em commit novo).
- src/components/contacts/ContactActivityTimeline.tsx: as 3 consultas (messages, contact_notes, conversation_events) agora usam o `error` que vinha sendo descartado. Consulta que falha vira estado de erro explícito (`data-testid="timeline-error"`) em vez de uma timeline anunciada como completa ou "0 eventos".
- src/components/contacts/__tests__/useContactsViewState.test.tsx: +3 testes (persistência do modo, valor guardado inválido, `localStorage` indisponível) e +2 do painel derivado. __tests__/useContactsCRUD.test.tsx: mock de supabase passou a aceitar `.eq()` encadeado e a leitura do estado atual da linha; +4 testes (precondição no UPDATE, conflito, RLS segue permissão, erro da leitura não vira permissão). __tests__/ContactActivityTimeline.test.tsx: novo, 6 casos (sucesso, erro por cada uma das 3 consultas, ordem decrescente).

## Prova
- vermelho antes (fontes originais recolocadas com `git show HEAD:<arquivo> > <arquivo>`, `npx vitest run` nos 3 arquivos de teste):
  `AssertionError: expected [ [ 'id', 'c1' ] ] to deep equally contain [ 'updated_at', …(1) ]`
  `AssertionError: expected 'Nenhum contato foi atualizado. Verifi…' to be 'Outra pessoa alterou este contato. Re…'`
  `AssertionError: expected null to be 'table'`
  `AssertionError: expected { id: 'b' } to deeply equal { id: 'b', name: 'Nome Atualizado' }`
  `AssertionError: expected { id: 'b' } to be null`
  e os 3 casos de erro da timeline ficaram em timeout esperando `timeline-error`
  → resumo: `Test Files 3 failed (3)` / `Tests 8 failed | 29 passed (37)`
- verde depois (mesmos 3 arquivos, fontes minhas recolocadas): `Test Files 3 passed (3)` / `Tests 37 passed (37)`
- suíte da área: `npx vitest run src/components/contacts` → `Test Files 37 passed (37)` / `Tests 277 passed (277)`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (188s)` (db_guard, tipos, lint, migrations OK; commit 83c4e9a58 passou o ratchet de lint sem dívida nova)

## Apontamento do juiz barato (ANTES DE ENTREGAR)
- "ERRO ENGOLIDO: leitura do Supabase sem o `error`" em useContactsCRUD.ts: procedia. Corrigido em commit novo — a leitura desestrutura `{ data, error: currentError }`, lança mensagem própria quando ela falha e ganhou teste `leitura do estado atual com erro não vira "sem permissão"`.
- green depois da correção: `npx vitest run src/components/contacts/__tests__/useContactsCRUD.test.tsx` → `Test Files 1 passed (1)` / `Tests 20 passed (20)`

## O que NÃO fiz e por quê
- Não toquei em ContactDetailPanel.tsx nem ContactsView.tsx (não estão nos arquivos do cartão): a assinatura que o hook devolve ficou a mesma (`detailContact`/`setDetailContact`), então nenhum consumidor precisou mudar.
- `banco_local` aparece como NÃO VERIFICADO no zapp-verify (sem nome de conjunto); este cartão não tem migration nem SQL.
