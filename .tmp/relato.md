Especialista: iris

## O que mudou e por quê

- `src/services/navigation.service.ts`: nova visão `supervisao` (STAFF_ROLES = admin, supervisor), rótulo "Supervisão", no grupo `Sistema`, logo antes de `admin` — as ferramentas do supervisor estavam presas atrás de `admin`, que é ADMIN_ONLY, e a própria navegação negava a entrada ao supervisor (`canAccess('admin', ['supervisor']) === false`).
- `src/pages/lazyViews.ts` + `src/pages/ViewRouter.tsx`: `SupervisaoView` preguiçosa e a rota `?view=supervisao` no `VIEW_MAP` (mesmo padrão das demais telas; não há rota nem item de menu duplicado).
- `src/components/admin/SupervisaoView.tsx` (novo): a tela da visão, com as abas **Filas** (a fila de atendimento do produto, `QueuesView` — o mesmo item `queues` do menu, que já é STAFF), **Copiloto IA**, **Sala de Crise**, **Playbooks** e **Treinamento**. Cada aba vai dentro de `SectionErrorBoundary`, como no `AdminView`. Porta fechada para quem não é supervisor/admin (tela "Acesso Restrito") e espera o papel carregar antes de decidir.
- `src/components/admin/AdminView.tsx`: saíram as abas Copiloto IA, Sala de Crise, Playbooks e Treinamento (com os imports e o tipo de `activeTab`); o painel `admin` ficou com Usuários, Auditoria e CRM 360°.
- Testes: `navigation.service.test.ts` (supervisor acessa `supervisao`, admin acessa, atendente não, `admin` continua só do admin, item único no menu), `SupervisaoView.test.tsx` (novo: as cinco abas e cada ferramenta entregue; atendente barrado; papel carregando não libera), `ViewRouter.supervisao-gate.test.tsx` (novo: a rota entrega a visão a supervisor e admin, bloqueia o atendente e mantém `admin` fechada ao supervisor) e `AdminView.section-error-boundary.test.tsx` (o isolamento de bloco agora é provado na Auditoria, e o teste novo afirma que as abas do supervisor não existem mais no Admin).

## Prova

- vermelho antes (os 3 arquivos de teste rodados contra a base do dia, sem a mudança): `npx vitest run src/services/__tests__/navigation.service.test.ts src/components/admin/__tests__/AdminView.section-error-boundary.test.tsx src/pages/__tests__/ViewRouter.supervisao-gate.test.tsx` → `Test Files  3 failed (3); Tests  8 failed | 19 passed (27)` (ex.: `expect(screen.queryByRole('button', { name: /Playbooks/ })).toBeNull()` devolvendo o botão Playbooks do AdminView; `getViewLabel('supervisao')` sem item na base — `grep -c supervisao` na `navigation.service.ts` do HEAD = 0; `SupervisaoView.tsx` não existia no HEAD, `git show HEAD:src/components/admin/SupervisaoView.tsx` = "exists on disk, but not in 'HEAD'").
- verde depois: `npx vitest run src/services/__tests__/navigation.service.test.ts src/components/admin/__tests__/AdminView.section-error-boundary.test.tsx src/components/admin/__tests__/SupervisaoView.test.tsx src/pages/__tests__/ViewRouter.supervisao-gate.test.tsx` → `Test Files  4 passed (4); Tests  32 passed (32)`.
- regressão da área vizinha: `npx vitest run src/components/admin/__tests__ src/components/layout src/__tests__/pwa-manifest-shortcuts.test.ts src/hooks/system/__tests__/useCurrentModule.test.ts` → `Test Files  28 passed (28); Tests  127 passed (127)`.
- Treinamento (conferido antes de mexer): `grep -rn "TrainingMode" src` só aparecia no `AdminView` (e no teste dele) — ou seja, o atendente **não** tinha aba própria de Treinamento hoje (a única porta era `AdminView`, atrás de ADMIN_ONLY), logo não havia acesso de atendente a preservar; agora ele é alcançável por supervisor e admin pela visão `supervisao`.
- verificação do cartão: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos` (134s), `OK lint`, `OK migrations`; `VERIFY: VERDE SEM BANCO (140s)` (o banco não é tocado neste cartão — nenhuma migration).
- commit: `feat(nav): visao supervisao para as ferramentas do supervisor` (9 arquivos, 376 inserções / 37 remoções); lint ratchet do pre-commit: `baseline=0, atual=0, novas=0`.

## O que NÃO fiz e por quê

- **"Fila" da visão = o item `queues` ("Filas") que o sistema já tem**: o `AdminView` nunca teve aba de fila. Encaixei a tela de filas existente (`QueuesView`) como aba "Filas"; não criei rota nem item de menu novo (o cartão proíbe item duplicado).
- **CRM 360° ficou no `admin`**: o cartão não deu destino a essa aba e ela não está na lista de ferramentas de supervisão (Copiloto, Sala de Crise, Playbooks, Treinamento). Tirá-la do `admin` reduziria o que o admin vê hoje (critério 2, "permissões de `admin` intactos") e deixaria o `AdminCRMDashboard` sem nenhuma tela que o monte. Se a intenção era tirá-la também, é um ajuste de uma linha — digam no cartão.
- Nada fora dos arquivos citados foi tocado; nenhuma dependência, migration ou banco (não há DDL neste cartão).
