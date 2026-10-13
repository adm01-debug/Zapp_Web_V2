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
  ContactHeaderSection.test.tsx (render do componente REAL, com só o
  useContactStats — a fonte de dados — mockado).
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

## Testes existentes que mudaram (resposta ao aviso do juiz)
- Os testes de engajamento da base afirmavam EXATAMENTE o número inventado:
  `shows engagement score badge` esperava 100 vindo de sentimento/prioridade/
  empresa/tipo e `shows lower engagement for neutral contact` esperava 50 fixo.
  O cartão manda eliminar esse número ("Nenhum número inventado no cabeçalho"),
  então essas asserções saíram junto com o cálculo — não é afrouxamento: nenhuma
  prova passou a aceitar menos; elas foram trocadas por provas sobre estatísticas
  reais (65 derivado de 100 mensagens/4 conversas/10 min/CSAT 5, e o caso "sem
  dados não mostra nada").
- `badge usa cor de médio engajamento na fronteira score=75` virou uma prova na
  fronteira real (score=79, logo abaixo do limiar hot=80) e `score mínimo é 50 —
  ramo s<50 em getScoreBadgeBg é código defensivo não alcançável` virou `score
  baixo (pouco histórico real) usa a cor de baixo engajamento — ramo agora
  alcançável`, que agora EXERCITA e assere o ramo de baixo engajamento (antes ele
  não era alcançável e o teste só documentava isso).
- As provas de contraste WCAG do badge (alto/médio, texto branco) continuam e
  agora são alimentadas por estatísticas reais. O arquivo passou de 43 para 45
  `it(...)`; nenhum `it` foi marcado `skip` nem teve asserção removida sem
  substituta equivalente ou mais forte.

## O que NÃO fiz e por quê
- Não mexi em src/services/contact.service.ts (fora dos arquivos permitidos): a
  fórmula usa só os campos que `ContactStats` já expõe. `fetchStats` devolve totais
  de mensagem/conversa e o tempo médio de resposta dos dois sentidos; não há
  contagem "janelada" separada no contrato atual. Se o card quisesse janela
  ("recentes"), o dado teria que nascer no service — worker (hooks) — e eu deixei a
  pontuação usando o que existe hoje, sem criar campo novo.
