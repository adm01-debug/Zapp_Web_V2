# ADR-010 — Dashboard de SLA sem dados mostra "Sem dados" (nunca 100%)

- **Status:** Proposed (decisão tomada; implementação pendente na V2)
- **Data:** 2026-10-13
- **Contexto original (V3):** ADR-008 da V3 (`dashboard-sla-sem-dados`),
  adaptado à realidade da V2.

## Contexto

A taxa de SLA de 1ª resposta é calculada sobre conversas **avaliadas** (com
desfecho). Quando não há nenhuma conversa avaliada — base vazia, período sem
movimento, ou a consulta ainda carregando/indisponível — o número correto não é
zero nem cem: é **ausente**.

O problema é que a ausência some quando o valor é convertido em porcentagem. A
regra do hook já está certa: sem amostra, a taxa é 0 e vem marcada com
`hasSample: false` (`src/hooks/sla/useSLAMetrics.ts:120`,
`src/hooks/sla/slaFirstResponse.ts:93`).

A tela, porém, ainda tem um fallback numérico que **transforma ausência em
100%**:

```ts
// src/components/dashboard/SLAMetricsDashboard.tsx:41
const overallRate = Math.round(data?.overall.overallRate ?? 100);
```

Enquanto `data` é `undefined` (primeiro carregamento, erro de leitura ou
período sem linhas), a tela afirma "100%" e pinta a faixa de "Bom"
(`getSLARateTone`, `src/components/dashboard/sla/slaRate.ts:4-8`) — ou seja,
inventa um resultado perfeito a partir da falta de dado. O `value` do card só
troca para "—" enquanto `loading` está ligado
(`SLAMetricsDashboard.tsx:65`), o que não cobre o caso "carregou, mas não há
amostra".

## Decisão

1. Ausência de amostra (`hasSample === false`) **não** vira número: a tela
   exibe "Sem dados" (ou equivalente textual) no lugar da porcentagem.
2. O fallback `?? 100` é **eliminado**. Nenhum caminho do painel pode exibir uma
   taxa de SLA que não venha de `conversation_sla`.
3. Zero real continua sendo "0%" — "sem dado" e "0%" são estados diferentes e
   precisam parecer diferentes.
4. Estado de erro/carregamento continua com o padrão da tela ("—" durante o
   carregamento); a novidade é o terceiro estado, "sem dado".

## Estado na V2 (o que ainda não está feito)

- O fallback segue no código em `src/components/dashboard/SLAMetricsDashboard.tsx:41`.
- `useSLAMetrics` já entrega o que é preciso (`overall.hasSample`,
  `overall.total`), então a correção é de exibição, não de consulta.
- A faixa de cor/label (`getSLARateTone` / `getSLARateLabel`) não deve receber
  valor nenhum quando não há amostra — ela precisa de um ramo neutro.

## Consequências

- Positivo: o painel para de premiar a ausência de dado com "100% / Bom", que é
  exatamente o número que o gestor usaria para decidir que está tudo bem.
- Positivo: consistência com o resto do produto, onde tela sem dado mostra
  estado vazio.
- Negativo: as capturas/expectativas que assumem 100% no vazio mudam; testes de
  snapshot/dourado dos cards de SLA precisam acompanhar.
- Risco: alguém reintroduzir `?? 100` — o teste da regra
  (`src/hooks/sla/__tests__/`) deve cobrir o caso "sem amostra → sem número".

## Referências

- ADR-009 — Arquitetura do SLA canônico (a base de onde os números saem).
- R2-SLA-001 (taxa sem amostra = 0) e o comentário em
  `src/hooks/sla/useSLAMetrics.ts:24-25`.
- `src/components/dashboard/SLAMetricsDashboard.tsx`,
  `src/components/dashboard/sla/slaRate.ts`,
  `src/hooks/sla/slaFirstResponse.ts`.
