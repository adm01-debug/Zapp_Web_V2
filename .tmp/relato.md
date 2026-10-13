Especialista: worker (geral)

# Auditoria — testes irmãos com render pesado + timeout padrão de 5 s (TalkX)

## O que mudou
Nenhum arquivo de teste. Auditoria somente-leitura de `src/components/talkx/__tests__/` e vizinhos
que importam a árvore TalkX. Commit: `docs(testes): auditoria de risco de timeout padrão na árvore
TalkX` (o relato). Escopo respeitado por desenho do cartão: nada foi corrigido aqui.

## Prova (comando + linha de resultado)
Comando: `python3 .tmp/audit_resumo.py` (lê os imports, conta `findBy*`/`waitFor` e `timeout:` por arquivo)

Resultado: `AUDITORIA OK: 79 arquivos .test.tsx; 28 importam componente de topo/pagina; 1 tem timeout
explicito; risco ALTO=12 MEDIO=4 BAIXO=5`

## Causa do defeito de referência
`RuleValueInput.test.tsx` monta o `TalkXSegments` REAL (sem mock da árvore) e faz
`await screen.findByRole('button', { name: 'Novo segmento' })` (`RuleValueInput.test.tsx:101`) sem
timeout explícito; sob carga o primeiro render passa de 5 s e o `findBy` estoura no padrão do Testing
Library. Nenhum teste da pasta tem `it(..., <timeout>)`.

## Critério da prioridade
ALTO = componente de topo REAL (sem mock da árvore) + ≥5 esperas `findBy`/`waitFor` no padrão de 5 s.
MÉDIO = topo real + 1 a 4 esperas no padrão. BAIXO = topo real com filhos de topo MOCADos
(`vi.mock`) ou com `timeout:` explícito. Os subdiretórios `kit/help/report/__tests__` importam só
componentes locais leves → fora do risco.

## ALTO (12) — mesmo padrão do RuleValueInput
1. `src/components/talkx/__tests__/RuleValueInput.test.tsx` — TalkXSegments real; 5 `findBy` + 1
   `waitFor` (6), timeout: NÃO; 5 casos ("em breve": Lead score e Risco de churn…). **Caso confirmado.**
2. `src/components/talkx/__tests__/TalkXSuppression.actions.test.tsx` — TalkXSuppression real;
   26 + 11 (37), timeout: NÃO; 16 casos.
3. `src/components/talkx/__tests__/TalkXSuppression.add.test.tsx` — TalkXSuppression real; 14 + 4
   (18), timeout: NÃO; 12 casos.
4. `src/components/talkx/__tests__/TalkXSegments.groups.test.tsx` — TalkXSegments real; 14 + 1 (15),
   timeout: NÃO; 10 casos.
5. `src/components/talkx/__tests__/TalkXSegments.route.test.tsx` — TalkXSegments real; 8 + 6 (14),
   timeout: NÃO; 6 casos.
6. `src/components/talkx/__tests__/TalkXCampaignRunning.segmentoPico.test.tsx` — real; 8 + 4 (12),
   timeout: NÃO; 8 casos.
7. `src/components/talkx/__tests__/TalkXSegments.builder.test.tsx` — real; 7 + 5 (12), timeout: NÃO;
   3 casos.
8. `src/components/talkx/__tests__/TalkXSegments.detailFresh.test.tsx` — real; 7 + 3 (10), timeout: NÃO.
9. `src/components/talkx/__tests__/TalkXSuppression.authoring.test.tsx` — real; 6 + 4 (10), timeout: NÃO.
10. `src/components/talkx/__tests__/TalkXCampaignRunning.states.test.tsx` — real; 8 + 0 (8), timeout: NÃO.
11. `src/components/talkx/__tests__/TalkXAnalytics.performance.test.tsx` — TalkXAnalytics real
    (AnalyticsFunnel/AnalyticsPerformanceChart reais); 3 + 2 (5), timeout: NÃO.
12. `src/components/talkx/__tests__/TalkXCampaignRunning.checklist.test.tsx` — real; 5 `findBy`,
    timeout: NÃO.

## MÉDIO (4) — topo real, poucas esperas no padrão
13. `src/components/talkx/__tests__/TalkXCampaignActionsCard.test.tsx` — TalkXCampaignRunning real;
    3 `findBy`, timeout: NÃO.
14. `src/components/talkx/__tests__/TalkXCampaignRunning.janela-historico.test.tsx` — real; 2 + 1,
    timeout: NÃO.
15. `src/components/talkx/__tests__/TalkXSuppressionReasons.test.tsx` — TalkXSuppression real;
    2 `findBy`, timeout: NÃO.
16. `src/components/talkx/__tests__/TalkXCampaignRunning.limits.test.tsx` — real; 1 + 1, timeout: NÃO.

## BAIXO (5) — pesado com filhos mockados ou com timeout explícito
17. `src/components/talkx/__tests__/TalkXView.route.test.tsx` — TalkXView real com 10 filhos mockados;
    26 + 11 (37) no padrão; peso cai pelo mock.
18. `src/components/talkx/__tests__/TalkXView.templates.test.tsx` — TalkXView real, 9 filhos mockados.
19. `src/components/talkx/__tests__/TalkXView.whatsapp-band.test.tsx` — TalkXView real, 11 filhos mockados.
20. `src/components/talkx/__tests__/TalkXView.section-error-boundary.test.tsx` — TalkXView real, 10 mockados.
21. `src/components/talkx/__tests__/TalkXSuppression.contactSearch.test.tsx` — TalkXSuppression real,
    7 `findBy`, timeout: SIM (2 explícitos).

## Sem risco
28 - (12+4+5) = 7 arquivos importam topo e não esperam com `findBy`/`waitFor`: `TalkXAnalytics.hooks`,
`TalkXCampaignRunning.remote-completion`, `TalkXCampaignWizard.layout`, `TalkXMultiSegmentos`,
`TalkXWizardDelivery.confirmacao`, `TalkXWizardDelivery.recomendacoes-cta`, `useCampaignEditor`.

## Vizinhos que importam página (mesmo crivo, fora da árvore TalkX)
`src/pages/queue-details/__tests__/QueueDetails.{totais,configurar,consultas,erro}.test.tsx`,
`src/pages/admin-telemetria/__tests__/AdminTelemetriaPage.leitura-falha.test.tsx`,
`src/pages/__tests__/{ViewRouter.multiplix-gate,n066-a11y-combobox-progressbar}.test.tsx` — com
`findBy`/`waitFor` no padrão; registrados aqui, fora do escopo TalkX deste cartão.
