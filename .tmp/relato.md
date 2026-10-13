Especialista: iris (area-front-componentes)

## O que mudou e por quê
- src/lib/engagementScore.ts (novo): pontuação 0–100 derivada de dados REAIS já
  disponíveis (o mesmo `ContactService.fetchStats` que a aba Resumo do contato
  consome): volume de mensagens (máx. 40), histórico de conversas (máx. 25),
  velocidade de resposta do contato (máx. 20, de `avgResponseTimeMinutes`) e CSAT
  (máx. 15, só com `csatCount > 0`). Sem histórico (nenhuma mensagem e nenhuma
  conversa) devolve `null` — não inventa número. Fórmula documentada no topo do
  arquivo; `engagementLevel` devolve a faixa (Alto ≥80, Médio ≥50, Baixo).
- src/components/inbox/contact-details/ContactHeaderSection.tsx: saiu o cálculo
  antigo (base 50 + sentimento/prioridade/empresa/tipo — o bônus de tipo nunca
  somava porque comparava `'customer'` contra os tipos oficiais `cliente`/
  `fornecedor`/… de contactTypeConfig). Entrou `useContactStats(contact.id)` +
  `engagementScore`; o anel do avatar e o badge só são renderizados quando a
  pontuação existe (`engagement !== null`). O tooltip agora explica a fórmula com
  os números de origem (mensagens, conversas, resposta média). Removido o
  `normalizeSentiment`, que só alimentava o número inventado.
- Testes: src/lib/__tests__/engagementScore.test.ts (fórmula, fronteiras de teto
  e faixas, casos sem dados) e src/components/inbox/contact-details/__tests__/
  ContactHeaderSection.test.tsx (informa/informa… render do componente real).
  Os testes de cor do badge agora usam pontuações derivadas de estatísticas reais
  (inclusive score 100 e score 0, o ramo `s < 50` que era inalcançável).

## Prova
- vermelho antes: `npx vitest run src/components/inbox/contact-details/__tests__/ContactHeaderSection.test.tsx`
  com o ContactHeaderSection.tsx da base (`git show HEAD:… > arquivo`, depois restaurado):
  `Tests  8 failed | 37 passed (45)` — as 8 provas novas falham no código antigo
  (o cabeçalho ainda mostrava 50/100 inventado e o anel/badge sempre presentes).
- verde depois: `npx vitest run src/components/inbox/contact-details/__tests__/ContactHeaderSection.test.tsx src/lib/__tests__/engagementScore.test.ts`
  → `Test Files  2 passed (2); Tests  53 passed (53)`; exit 0.
- `npx tsc --noEmit -p tsconfig.app.json` → sem erros.
- `npx eslint <os 4 arquivos>` → 0 erros, 0 avisos (as 4 skills de lint no staged já
  passaram no commit: baseline=0, novas=0).
- `zapp-verify . --rapido` → verde (linha em FATOS MEDIDOS PELO FECHAR).

## O que NÃO fiz e por quê
- Não mexi em src/services/contact.service.ts (fora dos arquivos permitidos): a
  fórmula usa só os campos que `ContactStats` já expõe. `fetchStats` devolve totais
  de mensagem/conversa e o tempo médio de resposta dos dois sentidos; não há
  contagem "janelada" separada no contrato atual. Se o card quisesse janela
  ("recentes"), o dado teria que nascer no service — worker (hooks) — e eu deixei a
  pontuação usando o que existe hoje, sem criar campo novo.
