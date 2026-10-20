- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 132s;OK lint 5s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (12/10 19:37, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/inbox/tabs/Crm360Tab.tsx            |   8 +-
 .../inbox/tabs/__tests__/Crm360Tab.test.tsx        |  14 ++-
 .../crm/__tests__/useAdvanceDealStage.test.tsx     | 132 +++++++++++++++++++++
 src/hooks/crm/useContactCrm360.ts                  |  70 ++++++++++-
 4 files changed, 208 insertions(+), 16 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 22 passed (22)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|

Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/crm/useContactCrm360.ts:
  - `useAdvanceDealStage` agora grava `performed_by` = id do perfil logado (via `useAuth`) no INSERT de `deal_activities`; confere o `error` do INSERT e, se falhar, rejeita a mutação e avisa (toast + `log.error` sem PII). Sem `performed_by`, a política de INSERT de `deal_activities` nega a escrita e o negócio avançava sem histórico.
  - ignora a chamada quando `currentStageId === nextStageId` (nem UPDATE nem INSERT).
  - novo export puro `nextActiveStage(stages, currentStageId)`: calcula a próxima etapa por `position`, pulando `is_active === false`, com desempate por `id`.
  - o literal `'propost'` (heurístico de bloco) saiu para a constante exportada `PROPOSAL_STAGE_NAME_MARKER`. A tabela `sales_pipeline_stages` não tem coluna de tipo, então a classificação continua por nome — agora num único ponto documentado; trocar por coluna dedicada exige migration/DDL (fora do plano de front).
- src/components/inbox/tabs/Crm360Tab.tsx: o `useMemo` de `nextStage` passou a chamar `nextActiveStage(...)` (antes pegava `stages[idx+1]` na ordem do array, incluindo etapa inativa) e o clique passa `currentStageId` para a mutação.
- Testes: novo `src/hooks/crm/__tests__/useAdvanceDealStage.test.tsx`; `Crm360Tab.test.tsx` passou o mock do módulo a preservar `nextActiveStage` real.

## Prova
- vermelho antes: `npx vitest run src/hooks/crm/__tests__/useAdvanceDealStage.test.tsx` (hook revertido para o HEAD) → `Tests 7 failed (7)` (ex.: `sem perfil logado não escreve nada e alerta` — promise resolved em vez de rejeitar).
- verde depois: `npx vitest run src/hooks/crm/__tests__/useAdvanceDealStage.test.tsx src/hooks/crm/__tests__/useContactCrm360.test.ts src/components/inbox/tabs/__tests__/Crm360Tab.test.tsx` → `Test Files 3 passed (3); Tests 27 passed (27)`.

## O que NÃO fiz e por quê
- A faixa/stepper (`crm360.stages.map`) continua mostrando etapas inativas como chips; o cartão pediu só o cálculo do PRÓXIMO estágio. Registrei como comentário no cartão.
- Não criei coluna de tipo de estágio (migration/DDL): fora do escopo de front.
