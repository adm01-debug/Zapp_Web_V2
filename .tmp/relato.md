Especialista: semisenior (area-front-componentes + area-front-hooks)

# [refazer 1] — resposta ponto a ponto à recusa (commit 735c1ac26e; anterior 0fc87f6ec)

## Ponto 1 — "Resumo de Violações": resolvido por prova, sem mudança de código (a alternativa que a própria recusa prevê)
Não há o que incluir porque o componente não existe: o "Resumo de Violações" foi removido do `SLADashboard.tsx` por cartão anterior, antes da base, e um teste trava a ausência.
Prova: `git grep -n "Resumo de Viola" dia/2026-10-12 -- src/` só devolve o comentário que conta a remoção (`SLADashboard.tsx:156`) e o teste que exige a ausência (`SLADashboard.redundancia.test.tsx:50`, `expect(screen.queryByText('Resumo de Violações')).toBeNull()`); o mesmo grep na árvore atual devolve as mesmas linhas (`SLADashboard.tsx:158`, teste na linha 51). Recriar o card seria desfazer outro cartão e repetir taxa/contagens que já estão no card "Resolução".
Onde as violações de resolução do período JÁ aparecem: card "Resolução" em `src/components/queues/SLAMetricCards.tsx` (`{resolution.breached} atrasados`, linha ~115), provado pelo teste `mostra as contagens de resolução` (`3 atrasados`), mais "Resoluções avaliadas"/"Pendentes de resolução" na Base do cálculo (`SLADashboard.tsx:180-185`).
O outro resumo de violações — "Histórico de Violações SLA" em `src/components/sla/SLAHistoryDashboard.tsx:66` (cards + `SLAViolationsChart`) — está fora de ARQUIVOS QUE PODE TOCAR; os totais que ele precisaria (`totals.resolutionBreaches`/`resolutionEvaluated`) já ficam expostos pelo histórico nesta entrega para um próximo cartão.

## Ponto 2 — teste do fio em useSLAMetrics: resolvido
Novo `src/hooks/sla/__tests__/useSLAMetrics.resolucao.test.tsx`: monta PostgREST fake (mesmo padrão de `src/hooks/__tests__/useSLAMetrics.test.tsx`), renderiza o hook REAL e prova que 4 linhas viram `overall.resolution` = 2 no prazo / 1 atrasada / 1 pendente / taxa 66,67% e `byAgent[].resolution` separado por agente com a pendente fora da taxa.
Prova: `npx vitest run src/hooks/sla/__tests__/useSLAMetrics.resolucao.test.tsx` → `Test Files 1 passed (1); Tests 2 passed (2)`. Sensibilidade: com `tallyResolution(slaData)` trocado por `emptyResolutionTally()` em `useSLAMetrics.ts:73` o teste do overall FALHA (`1 failed | 1 passed`), restaurado em seguida (`git diff --stat` vazio antes de commitar).

## Ponto 3 — estado neutro sem amostra: resolvido
Sem escritor de `resolution_breached`/`resolved_at` toda conversa é pendente, `total === 0` e a taxa não existe. `src/components/queues/SLAMetricCards.tsx:48,93,98`: quando `total === 0` o card "Resolução" mostra "—" em `text-muted-foreground` com borda `border-l-muted`, em vez de `0.0%` com `getRateColor(0)` (cor de falha). Com amostra, o caminho antigo segue igual.
Prova: teste novo `sem amostra (total 0) mostra estado neutro` em `src/components/queues/__tests__/SLAMetricCards.resolucao.test.tsx:58` — vermelho antes (`Unable to find '—'`, `1 failed | 3 passed`), verde depois.
Sem regressão (8 arquivos, saída real): `Test Files 8 passed (8); Tests 56 passed (56)` — inclui `y17Selos.contraste.test.tsx` (fixture com `total: 10`, fora do caminho neutro) e `SLADashboard.redundancia.test.tsx`.
Verificação: `zapp-verify <cópia> --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO` (sem migration no diff; banco não se aplica).

## O que mudou (só o meu commit; a entrega anterior é 0fc87f6ec e anteriores)
- `src/components/queues/SLAMetricCards.tsx` (linhas 45-48, 93, 98)
- `src/components/queues/__tests__/SLAMetricCards.resolucao.test.tsx` (teste da linha 58)
- `src/hooks/sla/__tests__/useSLAMetrics.resolucao.test.tsx` (novo)
`git diff 0fc87f6ec..HEAD --stat` → `3 files changed, 169 insertions(+), 2 deletions(-)`. Nada fora de ARQUIVOS QUE PODE TOCAR; nenhum teste existente removido, pulado ou afrouxado; sem migration; sem project-ref de produção.

## O que NÃO fiz e por quê
- Não recriei o "Resumo de Violações" nem mexi em `SLAHistoryDashboard`/`SLACharts`: fora dos arquivos permitidos; o Ponto 1 autoriza a prova (acima).
- Não mexi em `SLAAgentTable`: não renderiza resolução (grep `resolution` vazio), então o caminho neutro não o afeta.

---

## Relato da entrega anterior (0fc87f6ec e anteriores — mantido para histórico; a linha "Estados da tela" abaixo está SUPERADA no ponto do 0.0%: sem amostra o card agora mostra "—" neutro, Ponto 3 acima)

Especialista: Íris (area-front-componentes)

Entrega concluída. O cartão pede que o prazo de resolução fique visível e provado; a tela lê e exibe o desfecho de resolução de `conversation_sla`. A ESCRITA desse desfecho é trilha de banco, fora do escopo desta tela de métricas (registrado em `kanban_comment`).

## Arquivo fora da lista (indispensável)
`src/components/__tests__/y17Selos.contraste.test.tsx` não está em ARQUIVOS QUE PODE TOCAR, mas renderiza o `SLAMetricCards`; o contrato de props mudou (ganhou `resolution`/`sparkRes`) e o typecheck ratchet (baseline=0) reprovou a entrega sem ele. O ajuste é só de fixture e do seletor do contador "atrasados" (que passou a ter dois matches), sem afrouxar a asserção de contraste. Sem ele a verificação fica vermelha.

## O que mudou e por quê
- src/hooks/sla/slaResolution.ts (novo): elegibilidade, denominador e taxa do SLA de RESOLUÇÃO, espelho de `slaFirstResponse.ts` — a pendente (sem violação e sem `resolved_at`) não entra no "no prazo" nem no denominador (R2-SLA-001).
- src/hooks/sla/useSLAMetrics.ts: lê `resolution_breached`/`resolved_at` da MESMA linha e expõe `resolution` no overall e por agente; `totalConversations`/`overallRate` seguem de 1ª resposta.
- src/hooks/sla/useSLAHistory.ts: a série diária ganha `resolutionRate`/`resolutionEvaluated`/`resolutionPending`; os totais do período ganham `resolutionEvaluated`/`resolutionPending`/`resolutionBreaches`; `totalBreaches` segue só 1ª resposta.
- src/components/queues/SLAMetricCards.tsx: 4º card "Resolução" (props `resolution` + `sparkRes`), grade `lg:grid-cols-4`; usa os tokens `getRateColor`/`getRateBg` já existentes.
- src/components/queues/SLADashboard.tsx: passa `data.overall.resolution` e `sparkRes` (de `dailyData.resolutionRate`); o card base vira "Base do cálculo de SLA" com avaliadas+pendentes de resolução; subtítulo agora cita resolução; skeleton em 4 colunas.
- `src/components/__tests__/y17Selos.contraste.test.tsx`: fixture `METRICAS_PROPS` ganhou `resolution` e `sparkRes` (contrato novo de props) e o seletor do contador "atrasados" ficou específico (`/^3 atrasados$/`) porque agora o card de Resolução tem o próprio contador — a asserção de contraste segue a mesma.
- src/hooks/sla/index.ts: exporta `slaResolution`.
- Testes novos: `src/hooks/sla/__tests__/slaResolution.test.ts`, `src/hooks/sla/__tests__/useSLAHistory.resolucao.test.tsx`, `src/components/queues/__tests__/SLAMetricCards.resolucao.test.tsx`. O mock de `SLADashboard.redundancia.test.tsx` ganhou `resolution` no `overall` (o contrato do hook mudou).

## Prova
- vermelho antes: os 3 arquivos de teste são novos — na base `dia/2026-10-12` não existem, e o código que eles exercitam também não: `git show dia/2026-10-12:src/components/queues/SLAMetricCards.tsx | grep -c "Resolução"` → `0`; `git show dia/2026-10-12:src/hooks/sla/useSLAMetrics.ts | grep -c "resolution"` → `0`.
- verde depois: `npx vitest run src/hooks/sla/__tests__/slaResolution.test.ts src/hooks/sla/__tests__/useSLAHistory.resolucao.test.tsx src/components/queues/__tests__/SLAMetricCards.resolucao.test.tsx` → `Test Files 3 passed (3); Tests 13 passed (13)`.
- sem regressão: `npx vitest run src/components/queues/__tests__/SLADashboard.redundancia.test.tsx src/hooks/__tests__/useSLAMetrics.test.tsx src/hooks/__tests__/useSLAHistory.test.tsx src/components/__tests__/y17Selos.contraste.test.tsx` → `Test Files 4 passed (4); Tests 40 passed (40)`.

## Casos cobertos (melhor e pior)
- Cálculo: pendente fora da conta (2 no prazo / 1 violada / 3 pendentes ⇒ 66,67%); só pendentes ⇒ taxa 0, nunca 100; sem amostra ⇒ `resolutionRatePct` = null.
- Tela: card "Resolução" renderizado com o componente REAL mostra `75.0%` e `9 no prazo` / `3 atrasados` (valores de resolução, distintos dos de 1ª resposta 40/5).
- Série diária: dia com resolvidas+violada+pendente ⇒ `resolutionRate` 66,67% e `resolutionEvaluated` 3; dia só com pendentes ⇒ taxa 0; totais de 1ª resposta intactos.

## Arquivos fora desta tela
- `conversation_sla.resolution_breached`/`resolved_at`: nenhum escritor no repositório (as colunas só existem no schema). A gravação do desfecho é do worker (sql/edge) — pedido em `kanban_comment`. Esta tela não decide regra de banco.
- `SLAHistoryDashboard`: não alterado; os campos novos da série/totais são aditivos e nenhum consumidor existente mudou.

## Estados da tela alterada
- Carregando: skeleton da tela ajustado para 4 colunas. Vazio: card base mostra 0 e o card "Resolução" renderiza `0.0%` (sem amostra ≠ 100%). Erro: inalterado (o hook mantém o retorno de erro atual).
