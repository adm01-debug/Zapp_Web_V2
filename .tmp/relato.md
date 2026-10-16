Especialista: Íris (area-front-componentes)

## Como resolvi o motivo do [retomar] (conflito)
O commit do trabalho anterior (`10bef4ae90`, cartão 2610111041fc67, branch `v2/padronizar-cabecalho-crm-26101112056a3c`) JÁ É ANCESTRAL da ponta atual do dia:
- `git merge-base --is-ancestor 10bef4ae90 HEAD` → exit 0 (ancestral) → nada a trazer por cherry-pick, nada em conflito.
- `git log -1 --format='%h %s' 10bef4ae90` → `10bef4ae90 fix(ux): [refazer 1] padroniza cabecalho/breadcrumb no grupo CRM sem que`
Ou seja, a entrega entrou na ponta do dia entre 11/10 e hoje; a retomada por merge/rebase vira no-op.

## Defeito do pedido no código ATUAL: já corrigido
1. As telas do grupo usam o `PageHeader` compartilhado com a MESMA trilha `Gestão > folha`:
   - `src/components/contacts/ContactsView.tsx:146-149` — `<PageHeader title="Contatos" breadcrumbs={[{ label: 'Gestão' }, { label: 'Contatos' }]} />`
   - `src/components/crm360/CRM360ExplorerView.tsx:71-74` — trilha `Gestão > CRM 360°`
   - `src/components/schedule/ScheduleCalendarView.tsx:157-160` — trilha `Gestão > Agendamentos`
   - `src/components/wallet/ClientWalletView.tsx:26-29` — trilha `Gestão > Carteira`
   - `src/components/queues/QueuesView.tsx:66-67` — trilha `Gestão > Filas`
   - `src/components/groups/GroupsView.tsx:71-74` — trilha `Gestão > Grupos`
2. `src/components/security/SecurityView.tsx` navega pelo roteador, sem reload:
   - `:2` `import { useNavigate }` e `:25` `const navigate = useNavigate();`
   - `:170-176` `onClick={() => navigate('/admin/rate-limit')}` (antes: `window.location.href`)
   - `:191-197` `onClick={() => navigate('/admin/roles')}` (antes: `window.location.href`)
   - `git grep -n "window.location.href" -- src/components/security/SecurityView.tsx` → 0 ocorrências.

## Prova (verde, rodado agora)
- `npx vitest run src/components/layout/__tests__/cabecalho-grupo-crm.test.tsx` → `Test Files 1 passed (1)` / `Tests 4 passed (4)`
  - o teste `exigirCabecalho` monta a TELA real e confere `h1` + trilha `Gestão > folha` (Contatos, CRM 360°, Agendamentos);
  - o teste dos cards admin monta a tela real sob Router e confere a rota trocada sem reload (`window.location.pathname` segue `/`).

## Critério de pronto, item por item
1. As 8 telas no PageHeader: **6 de 8** — Contatos, CRM 360°, Carteira, Filas, Agendamentos e Grupos usam o PageHeader com a trilha `Gestão > folha` (arquivo:linha acima, provado pelo teste `exigirCabecalho`). As outras 2 (Admin e Security) mantêm `h1` próprio — `AdminView.tsx:168` e `SecurityView.tsx:46` — porque `AdminView.tsx` NÃO está em ARQUIVOS QUE PODE TOCAR e, de `SecurityView.tsx`, o cartão autoriza só os 2 pontos de navegação. **FALTA:** migrar os cabeçalhos de Admin/Security para o PageHeader (precisa de cartão com esses arquivos liberados).
2. Os 2 cards do SecurityView navegam sem reload completo: cumprido (prova acima).
3. zapp-verify . --rapido: roda no fechar.

## O que NÃO fiz e por quê
- Nenhum commit de código: o cartão manda fechar sem commit quando o defeito já está corrigido. O único commit desta entrega é `docs` e contém apenas este `.tmp/relato.md` (o `hermes-tarefa-fechar` recusa sem commit novo: `ERRO: nenhum commit novo em relação a dia/2026-10-16`).
- `src/components/admin/AdminView.tsx` não está na lista ARQUIVOS QUE PODE TOCAR do cartão e não foi tocado; o `h1` próprio dele (`:168`) e o da Central de Segurança (`SecurityView.tsx:46`) permanecem — o cartão pede de SecurityView apenas os 2 pontos de navegação, que estão feitos.
- Nenhum DDL, Edge Function ou dependência nova (o pedido não exigia).
