Especialista: semisenior
# Refazer 1 — CT-E/PB-30 (indicadores de Contatos via RPC)

## Pontos do revisor
- Ponto 1: resolvido — `src/components/contacts/ContactStatsCards.tsx` (prop opcional `onDuplicatesClick` + indicador `DuplicatesIndicator` com `kpi.duplicateCandidates`); teste em `src/components/contacts/__tests__/ContactStatsCards.test.tsx` (exibe valor, clique chama a prop, sem prop não é botão, some no loading).
- Ponto 2: resolvido sem restaurar o campo — nenhum consumidor lia `kpi.fornecedoresTotal` (o card Fornecedores sempre leu a prop `fornecedoresAll`, antes e depois; `rg fornecedoresTotal` em `src supabase` agora retorna zero); texto do contrato corrigido abaixo e mock do teste alinhado ao contrato real.
- Ponto 3: resolvido incluindo o teste de verdade — `src/components/contacts/__tests__/ContactStatsCards.test.tsx` está no diff, com mock no contrato atual e os casos de `lgpdPending` nulo e de clique em duplicados.
- Ponto 4: resolvido com medição provada por teste — antes: `fetchKpiRows` paginava `.range(from, from + 999)` até página curta (1 requisição por página de 1000 linhas, N linhas no navegador); depois: 2 RPCs + 3 contagens head = 5 requisições, 0 linhas (`src/hooks/crm/__tests__/useContactsKpi.test.ts`: `custa 2 RPCs + 3 contagens head e nenhuma linha de contato`).

## O que mudou e por quê
- `src/components/contacts/ContactStatsCards.tsx`: indicador "Possíveis duplicados" abaixo do grid (não mexi nos 4 cards nem no skeleton); com `onDuplicatesClick` é `<button type="button">` com `aria-label` em pt-BR, sem a prop é `<div>` estática — botão sem ação seria defeito novo.
- `src/components/contacts/__tests__/ContactStatsCards.test.tsx`: mock `baseKpi` alinhado ao contrato atual (sai `fornecedoresTotal`, entram `duplicateCandidates`, `lgpdPending`); 5 testes novos do indicador.
- `src/hooks/crm/__tests__/useContactsKpi.test.ts`: harness conta consultas `head` (`h.queries`); teste de custo fixo 2 RPCs + 3 head + 0 `range`.
- Contrato `ContactsKpi` (texto corrigido): saiu `fornecedoresTotal` porque o valor exibido no card Fornecedores vem da prop `fornecedoresAll` (ContactsView ← contagem por tipo), idêntico antes e depois; `kpiFromServer` não o devolve mais. Mantido no resto.

## Prova
- vermelho antes: `npx vitest run src/components/contacts/__tests__/ContactStatsCards.test.tsx` → `Test Files 1 failed (1)` / `Tests 4 failed | 11 passed (15)` (sem `kpi-duplicates` no componente).
- verde depois: `npx vitest run ContactStatsCards.test.tsx useContactsKpi.test.ts useContactsKpi.pagination.test.ts useContactsKpi.query.test.tsx` → `Test Files 4 passed (4)` / `Tests 32 passed (32)`.
- sem regressão ao lado: `ContactsView.v2Flags + CRM360ExplorerView.heading + ContactAnalyticsDashboard` → `Test Files 3 passed (3)` / `Tests 9 passed (9)`.
- `rg -n "fornecedoresTotal" src supabase` → zero ocorrências (prova do Ponto 2).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (12s)` (gates OK; banco_local não verificado — o refazer não tem SQL; migrations da entrega anterior já auditadas pelos pais).

## O que NÃO fiz e por quê
- Não liguei o clique à lista: `ContactsView.tsx` e o filtro da lista estão fora dos arquivos do cartão; a prop `onDuplicatesClick` está pronta e testada. Falta: `ContactsView` passar a prop aplicando o filtro de duplicados (a detecção é do CT-083; hoje nenhum filtro de duplicados existe na UI de contatos).
- Não restaurei `fornecedoresTotal` (Ponto 2 dava as duas vias; escolhi provar o não-uso + ajustar o texto, mudança mínima, sem migration nova).
- `hermes-tarefa-fechar` indisponível (sai 75, CONGELADO sem MODO_V2); sem bloco FATOS — os números acima são copiados das saídas reais citadas. Fechamento via `kanban_complete`.

## Workspace (desvio registrado)
- Sem workspace novo: o dispatcher deu path Windows inutilizável no WSL, `hermes-tarefa-iniciar` sai 75 e a guarda bloqueia `worktree`/`clone`/novo branch. Trabalhei no workspace do trabalho anterior, empilhando só commits deste refazer no topo de `3f58e61463`, sem tocar nos commits anteriores.
- Arquivos do refazer (`git diff --name-only 3f58e61463..HEAD`, colado do comando): `src/components/contacts/ContactStatsCards.tsx`, `src/components/contacts/__tests__/ContactStatsCards.test.tsx`, `src/hooks/crm/__tests__/useContactsKpi.test.ts`, `.tmp/relato.md`.
