Especialista: iris (worker (design) — design-system-zapp)

## O que mudou e por quê
- src/components/inbox/contact-details/ContactHeaderSection.tsx: o tooltip do badge de engajamento agora explica a FÓRMULA, não só lista entradas: cada componente aparece com o seu peso — `mensagens: N (até 40)`, `conversas: N (até 25)`, `resposta média: X min (até 20)` — e o CSAT entra quando existe, como `satisfação: <média> (<n> avaliações, até 15)`. No exemplo 65/100 as entradas agora fecham a conta (20+10+20+15).
- src/components/inbox/contact-details/ContactHeaderSection.tsx: quando `avgResponseTimeMinutes` é 0/ausente (que `engagementScore` trata como "nenhuma resposta medida"), o tooltip mostra `resposta média: sem medida (até 20)` em vez de `resposta média: 0 min`. Zero não vira mais "resposta instantânea" — nenhum número inventado no cabeçalho (critério 1).
- src/components/inbox/contact-details/__tests__/ContactHeaderSection.test.tsx: o teste do tooltip passou a conferir os pesos de cada componente e o CSAT (média e quantidade de avaliações); novo teste cobre o caso sem resposta medida, exigindo "sem medida", proibindo "0 min" e proibindo qualquer menção a satisfação quando não há CSAT.

## Prova
- vermelho antes: `npx vitest run .../ContactHeaderSection.test.tsx -t "tooltip"` (com o tooltip ANTIGO restaurado por mutação) → `Tests 2 failed | 44 skipped`; `Received: Engajamento Baixo (15/100) — mensagens: 50, conversas: 2, resposta média: 0 min`
- verde depois: `npx vitest run .../ContactHeaderSection.test.tsx .../engagementScore.test.ts` → `Test Files 2 passed (2); Tests 54 passed (54)`

## Pontos da recusa
- Ponto 1: tooltip explicando a fórmula. Feito — pesos (até 40 / 25 / 20 / 15) e o CSAT (média + nº de avaliações) no texto; teste novo confere cada peso e o CSAT via `toHaveTextContent`.
- Ponto 2: "resposta média: 0 min" inventado. Feito — vira "sem medida" quando `avgResponseTimeMinutes <= 0`; teste novo `tooltip usa "sem medida" ...` cobre e proíbe "0 min".
- Ponto 3: relato atualizado com as mudanças e a prova vermelho→verde (acima).

## O que NÃO fiz e por quê
- Não alterei a fórmula de `engagementScore.ts` nem o cálculo (o revisor considerou correto): só o texto do tooltip e os testes.
