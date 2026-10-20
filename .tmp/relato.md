Especialista: hugo

Ponto 1 — falha parcial mentia (toast genérico) e travava a tela na etapa antiga
O que mudei (src/hooks/crm/useContactCrm360.ts): no `useAdvanceDealStage`, se só o INSERT do histórico falhar, a mutação agora rejeita com `Error('Etapa avançada, mas o histórico não foi registrado')` em vez de repassar o erro cru; o `onError` mostra essa mensagem verdadeira no caso parcial e mantém a genérica ('Não foi possível avançar a etapa do negócio') para falha total/sem perfil. Troquei `onSuccess` por `onSettled` com a mesma invalidação (`contactCrm360Key(contactId)`), então o cache invalida também no erro e a tela sai da etapa antiga. Escolhi a via (a) da recusa (mensagem verdadeira + invalidação no erro) e descartei reverter o `stage_id`: seria uma segunda escrita que também pode falhar, recriando o meio-termo. Sem PII (log só do evento), sem toast duplicado (só o `onError` exibe), único chamador (`Crm360Tab`, via `mutate`) coberto pelo teste dela.
Teste que prova (src/hooks/crm/__tests__/useAdvanceDealStage.test.tsx, 'rejeita e alerta quando o INSERT da atividade falha: falha parcial usa mensagem verdadeira e invalida o cache'): semeia o cache com `fetchQuery`, força erro no INSERT, espera rejeição com a mensagem verdadeira + `toast.error` com ela + `isInvalidated === true` no `contactCrm360Key('contact-1')`.
Saída vermelha (antes da correção, só o teste novo/ajustado contra o código antigo): 1 failed — `expected [Function] to throw error including 'Etapa avançada, mas o histórico não foi registrado' but got 'new row violates row-level security policy'` (7 passed).
Saída verde (depois): `Test Files 2 passed (2) / Tests 23 passed (23)` (hook + Crm360Tab).

Ponto 2 — teste ajustado + teste novo de falha do UPDATE
O que mudei (mesmo arquivo de teste): o teste do INSERT agora prova mensagem verdadeira + invalidação (acima); acrescentei 'falha do UPDATE: toast de erro genérico e INSERT nem é tentado' (força erro no UPDATE, espera rejeição, `updateMock` chamado com `{ stage_id: 's2' }`, `insertMock` não chamado, `toast.error` com 'Não foi possível avançar a etapa do negócio'). O teste novo já passava antes (documenta o comportamento correto da falha total); o que prova o defeito é o do ponto 1 (vermelho antes, verde depois). Para observar a invalidação, o `wrapper` agora guarda o `QueryClient` em `testQueryClient` e o teste importa `contactCrm360Key` (chave inalterada).

Ponto 3 — SÓ RELATO: estado das irmãs e comportamento com cada política (verificado em 14/10/2026)
Estado encontrado: `t_bf660f7e` (SEC-Y25-01 permitir avanço, migration `20261009090603_sec_y25_01_insert_alvo.sql`) está `done`, APROVADA pelo revisor, na fila do integrador; `t_bc466fa1` (SEC-Y25-01 exigir performed_by, cherry-pick da mesma migration) está `done`, APROVADA pelo revisor, na fila do integrador. Conferi no `dia/2026-10-14`: a migration apertada ainda NÃO está integrada (`ls-tree ... | grep sec_y25` vazio; o INSERT vigente é `performed_by IN (perfis do usuário) OR is_admin_or_supervisor`, migration `20260317222442_...`). Ou seja, hoje vale a política atual (só autor) e a apertada (alvo + autor) entra em seguida.
Comportamento deste hook com a política atual: envia `performed_by` = próprio perfil, então o INSERT passa para negócio próprio ou como admin/supervisor; para negócio de outro agente o UPDATE pode passar e o INSERT passa (autor ok) — sem mudança.
Comportamento quando a apertada entrar: negócio de outro agente → o INSERT falha (alvo não é do agente) → cai exatamente no ramo parcial deste refazer: toast verdadeiro ('Etapa avançada, mas o histórico não foi registrado') + cache invalidado, nunca silêncio. Negócio próprio e admin/supervisor continuam passando nas duas. Nenhuma mudança de código foi necessária para isso; o gancho já envia `performed_by`.

Ponto 4 — SÓ RELATO: primeira linha deste arquivo é exatamente `Especialista: hugo` (skill de área `area-front-hooks` usada).

Arquivos (saída exata de `git diff --name-only 773ee8d09...HEAD`):
src/hooks/crm/__tests__/useAdvanceDealStage.test.tsx
src/hooks/crm/useContactCrm360.ts

Verificações (comandos reais, workspace `~/hermes-workspaces/Zapp_Web_V2/avanco-etapa-deal-performed-by-26101219250fac`):
- `npx vitest run src/hooks/crm/__tests__/useAdvanceDealStage.test.tsx src/components/inbox/tabs/__tests__/Crm360Tab.test.tsx` → 2 passed, 23 passed.
- `npx vitest run src/hooks/crm` → 16 passed, 100 passed + 1 expected fail pré-existente (`it.fails` em `useContactsSearch.test.tsx:359`, arquivo não tocado).
- Commit com lint ratchet: `Lint ratchet (staged, 2 arquivo(s)): baseline=0, atual=0 ... nenhuma nova dívida de lint`.
- `git diff 773ee8d09...HEAD -U3 | wc -c` → 6177 (longe do teto de 90 mil); diff só com estes 2 arquivos, nenhum fora do título, sem project-ref de produção.
- `hermes-tarefa-fechar` NÃO executado: `hermes-tarefa-iniciar/fechar` recusam com 'CONGELADO: o modo V1 está suspenso' (sem `MODO_V2` nesta sessão); trabalhei no workspace da entrega anterior (branch `v2/avanco-etapa-deal-performed-by-26101219250fac`, commit da recusa `773ee8d09` intacto como pai) e o commit do refazer `4eab47d7e8` está estacionado nele para o integrador.
