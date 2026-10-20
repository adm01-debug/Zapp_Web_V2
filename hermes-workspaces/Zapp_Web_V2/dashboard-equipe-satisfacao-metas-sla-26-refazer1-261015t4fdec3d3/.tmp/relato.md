Especialista: senior

# O que mudou e por quê (refazer 1 de t_a242b42f, base d3efa52d01 — só os 2 pontos, nada além)

Ponto 1 — primeira linha do relato: trocada para exatamente `Especialista: senior` (este arquivo).

Ponto 2 — dois títulos de `src/hooks/business/__tests__/useSatisfactionBreakdown.paginacao.test.tsx` diziam o contrário do que o corpo verifica; só os títulos mudaram, nenhum `expect`/fixture foi tocado:
- `por agente e por fila: ... fallback de registro removido` → `por agente e por fila: nome resolvido, melhor CSAT primeiro; fila inexistente vira "Fila removida" e linha sem agente/fila conta no total sem criar entrada`. O corpo prova fallback de FILA (`q-inexistente` → `Fila removida`) e que a linha sem agente/fila (a4) não cria entrada (`byAgent` só Ana/Carlos, `totalResponses` 4); não prova fallback de agente.
- `agente com avaliação mas perfil apagado aparece como "Agente removido"` → `linha sem agent_id não cria entrada em byAgent — conta só no total (sem "Agente removido")`. O corpo monta `linha(..., null, null)` (agent_id nulo) e asserta `byAgent` `[]` + `totalResponses` 1. Não troquei a asserção porque o título antigo não é o comportamento do produto: em `src/hooks/business/useCSAT.ts` o mapa de agentes só recebe linha `if (r.agent_id)`, e `Agente removido` sai de `r.agent?.name || 'Agente removido'` — ou seja, só quando há agent_id com join de perfil ausente, caso que o helper `linha()` (um param `agente` gera `agent_id` e `agent.name` juntos) nem expressa.

# Prova
- `npx vitest run src/hooks/business/__tests__/useSatisfactionBreakdown.paginacao.test.tsx` → `Test Files 1 passed (1); Tests 12 passed (12)`.
- `git diff --name-only d3efa52d01` → só `src/hooks/business/__tests__/useSatisfactionBreakdown.paginacao.test.tsx` e `.tmp/relato.md` (relato não é versionado no diff de entrega; o diff de código tem 2 linhas trocadas em 1 arquivo).
