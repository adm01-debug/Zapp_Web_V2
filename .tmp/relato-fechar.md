Especialista: hugo
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 111s;OK lint 2s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (16/10 15:07, gerados por máquina: valem mais que números escritos à mão)
```
 .../__tests__/useConversationAnalyses.test.tsx     | 216 +++++++++++++++------
 src/hooks/chat/useConversationAnalyses.ts          | 121 +++++++-----
 2 files changed, 227 insertions(+), 110 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 12 passed (12)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial do [refazer]: sem pontos refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|

## O que mudou e por quê
- src/hooks/chat/useConversationAnalyses.ts: `isEnabled` calculado uma vez e reutilizado no `enabled`; `refetch` embrulhado em `useCallback` com retorno cedo quando `!isEnabled` (nunca consulta com id nulo/inválido, nunca rejeita); `useEffect` que observa `query.error` e registra `log.error('Error fetching analyses:', query.error)` — só erro, sem aviso. (skill de área: area-front-hooks)
- src/hooks/__tests__/useConversationAnalyses.test.tsx: 2 testes novos de `refetch()` com `null` e com JID não-uuid (afirmam `mockFrom`/`limitSpy` não chamados); teste de erro existente estendido para afirmar o `log.error` com a mensagem original.
## Prova
- vermelho antes (hook da entrega anterior, sem os 3 pontos): `npx vitest run src/hooks/__tests__/useConversationAnalyses.test.tsx` → `Tests 3 failed | 9 passed (12)` (os 2 testes novos de refetch + a asserção do log)
- verde depois: `npx vitest run src/hooks/__tests__/useConversationAnalyses.test.tsx` → `Test Files 1 passed (1); Tests 12 passed (12)`
- `npx eslint` nos 2 arquivos → 0 erros, 0 avisos
## Pontos do revisor
- Ponto 1: `isEnabled` calculado uma vez (`const isEnabled = ...`) e reutilizado em `enabled: isEnabled`; `refetch` em `useCallback` com retorno cedo quando `!isEnabled`. Desvio deliberado do exemplo: deps `[isEnabled, queryRefetch]` (desestruturado de `query`) em vez de `[isEnabled, query.refetch]`, porque o `react-hooks/exhaustive-deps` do repo acusa `query.refetch` como dependência faltante (`missing dependency: 'query'`); valores idênticos, eslint limpo. Teste que prova: `refetch recarrega e não rejeita` (caminho válido continua resolvendo truthy) + os 2 testes novos do Ponto 2.
- Ponto 2: testes `refetch com contactId nulo não dispara consulta` e `refetch com id que não é uuid não dispara consulta` — ambos chamam o hook real e afirmam `mockFrom` e `limitSpy` não chamados. Vermelho sem a correção (falham na entrega anterior), verde com ela.
- Ponto 3: `useEffect(() => { if (query.error) log.error('Error fetching analyses:', query.error); }, [query.error])` — mensagem idêntica à do carregador anterior, só `error`, sem `warn`/aviso. Teste que prova: `expõe o erro da consulta sem quebrar` agora afirma `log.error` chamado com `'Error fetching analyses:'`.
## Chamadores
- Único chamador fora de testes: `src/components/inbox/AIConversationAssistant.tsx` (`await refetch()` com contactId válido) — contrato preservado: no caminho válido `refetch()` resolve o resultado do `query.refetch()` (teste `refetch recarrega e não rejeita` verde); o no-op só ocorre com id inválido, quando não havia o que recarregar.
## O que NÃO fiz e por quê
- Nada fora dos 2 arquivos do cartão; sem migration, sem manifesto, sem CI, sem ref de produção.
