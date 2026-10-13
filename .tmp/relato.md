Especialista: worker (geral)

# Auditoria — testes irmãos com render pesado + timeout padrão de 5 s (TalkX)

Auditoria somente-leitura de `src/components/talkx/__tests__/` e vizinhos que importam a árvore
TalkX. Nenhum arquivo de teste foi alterado (o cartão pede só a lista; a correção fica para a tarefa
de correção). Prova = inspeção do código atual com `grep`/script no workspace.

## O defeito de referência (por que este risco existe)
`RuleValueInput.test.tsx` monta o `TalkXSegments` REAL (o motor de regras entra sem mock) e faz
`await screen.findByRole('button', { name: 'Novo segmento' })` (`RuleValueInput.test.tsx:101`) **sem
timeout explícito**. O render da árvore inteira, sob carga, passa de 5 s → o `findBy` estoura no
padrão do Testing Library. Nenhum teste da pasta acrescenta `it(..., <timeout>)`.

## Fato medido (base para a prioridade)
Comando: script `.tmp/audit.py`/`.tmp/audit2.py` (git grep + leitura dos imports), nesta pasta.

- 79 arquivos `.test.tsx` em `src/components/talkx/__tests__/`.
- 43 arquivos importam componente de topo do TalkX ou página vizinha.
- **Somente 2 arquivos** têm qualquer `timeout:` — e 1 deles é destes: `TalkXSuppression.contactSearch`.
  Ou seja, em **toda** a pasta os `findBy*`/`waitFor` rodam no padrão de 5 s.
- Os subdiretórios `kit/__tests__`, `help/__tests__`, `report/__tests__` importam só componentes
  locais leves (não a árvore de topo) → sem risco.

## Lista priorizada (risco = peso do render real × nº de esperas no padrão de 5 s)

### ALTO — top real, sem mock da árvore, muitas esperas no padrão (mesmo padrão do RuleValueInput)
1. `src/components/talkx/__tests__/TalkXSuppression.actions.test.tsx` — render real de
   `TalkXSuppression`; 26 `findBy*` + 11 `waitFor` (37 esperas), timeout explícito: NÃO; 16 casos
   (ex.: "selecionar 3 linhas e remover manda os 3 ids…", "Alterar motivo da barra de massa…").
2. `src/components/talkx/__tests__/TalkXSuppression.add.test.tsx` — `TalkXSuppression` real; 14 + 4
   (18 esperas), timeout: NÃO; 12 casos ("aplica a máscara brasileira…", "erro 23505 do banco vira…").
3. `src/components/talkx/__tests__/TalkXSegments.groups.test.tsx` — `TalkXSegments` real; 14 + 1
   (15 esperas), timeout: NÃO; 10 casos ("a árvore liga as condições…", "duplicar grupo copia…").
4. `src/components/talkx/__tests__/TalkXSegments.route.test.tsx` — `TalkXSegments` real; 8 + 6
   (14 esperas), timeout: NÃO; 6 casos ("abre no construtor do segmento do endereço…", "F5").
5. `src/components/talkx/__tests__/TalkXCampaignRunning.segmentoPico.test.tsx` — `TalkXCampaignRunning`
   real; 8 + 4 (12), timeout: NÃO; 8 casos.
6. `src/components/talkx/__tests__/TalkXSegments.builder.test.tsx` — `TalkXSegments` real; 7 + 5 (12),
   timeout: NÃO; 3 casos.
7. `src/components/talkx/__tests__/TalkXSegments.detailFresh.test.tsx` — `TalkXSegments` real; 7 + 3
   (10), timeout: NÃO; 3 casos.
8. `src/components/talkx/__tests__/TalkXSuppression.authoring.test.tsx` — `TalkXSuppression` real;
   6 + 4 (10), timeout: NÃO; 3 casos.
9. `src/components/talkx/__tests__/TalkXCampaignRunning.states.test.tsx` — `TalkXCampaignRunning`
   real; 8 + 0 (8), timeout: NÃO; 7 casos (todos de erro/retry — montam a árvore inteira por caso).

### MÉDIO — top real, sem mock, poucas esperas no padrão
10. `src/components/talkx/__tests__/TalkXSuppression.contactSearch.test.tsx` — `TalkXSuppression` real;
    7 `findBy*`, **MAS** tem 2 `timeout:` explícitos → risco parcialmente mitigado (baixo/médio).
11. `src/components/talkx/__tests__/TalkXCampaignRunning.checklist.test.tsx` — real; 5 `findBy*`,
    timeout: NÃO.
12. `src/components/talkx/__tests__/TalkXAnalytics.performance.test.tsx` — `TalkXAnalytics` real
    (importa `AnalyticsFunnel`/`AnalyticsPerformanceChart` reais); 3 + 2 (5), timeout: NÃO.
13. `src/components/talkx/__tests__/TalkXCampaignActionsCard.test.tsx` — `TalkXCampaignRunning` real;
    3 `findBy*`, timeout: NÃO.
14. `src/components/talkx/__tests__/TalkXCampaignRunning.janela-historico.test.tsx` — real; 2 + 1,
    timeout: NÃO.
15. `src/components/talkx/__tests__/TalkXSuppressionReasons.test.tsx` — `TalkXSuppression` real;
    2 `findBy*`, timeout: NÃO.
16. `src/components/talkx/__tests__/TalkXCampaignRunning.limits.test.tsx` — real; 1 + 1, timeout: NÃO.

### BAIXO — pesado, mas os filhos de topo estão MOCADos (`vi.mock` da árvore) → render leve
17. `src/components/talkx/__tests__/TalkXView.route.test.tsx` — `TalkXView` real com 10 filhos mockados;
    26 + 11 (37 esperas) no padrão, timeout: NÃO. Peso cai pelo mock, mas o número alto merece nota.
18. `src/components/talkx/__tests__/TalkXView.templates.test.tsx` — `TalkXView` real, 9 filhos mockados;
    7 `findBy*`, timeout: NÃO.
19. `src/components/talkx/__tests__/TalkXView.whatsapp-band.test.tsx` — `TalkXView` real, 11 filhos
    mockados; 4 `findBy*`, timeout: NÃO.
20. `src/components/talkx/__tests__/TalkXView.section-error-boundary.test.tsx` — `TalkXView` real, 10
    filhos mockados; 2 + 1, timeout: NÃO.

### SEM RISCO (importam topo, mas não esperam com `findBy`/`waitFor`)
`TalkXAnalytics.hooks` (0), `TalkXCampaignRunning.remote-completion` (0), `TalkXCampaignWizard.layout`
(0, e mocka `useCampaignEditor`), `TalkXMultiSegmentos` (0), `TalkXWizardDelivery.confirmacao` (0),
`TalkXWizardDelivery.recomendacoes-cta` (0), `useCampaignEditor` (0).

### Fora da pasta (vizinhos que importam página, para o mesmo crivo — não são TalkX)
`src/pages/queue-details/__tests__/QueueDetails.*` (totais/configurar/consultas/erro),
`src/pages/admin-telemetria/__tests__/AdminTelemetriaPage.leitura-falha.test.tsx`,
`src/pages/__tests__/ViewRouter.multiplix-gate.test.tsx` e `n066-a11y-combobox-progressbar` — importam
páginas, com `findBy`/`waitFor` no padrão; ficam registrados, mas o escopo do cartão é a árvore TalkX.

## Recomendação para a tarefa de correção (não executada aqui)
Os itens de risco ALTO compartilham exatamente a causa do RuleValueInput (top real + `findBy` no
padrão). Correção mínima e uniforme por arquivo: passar `{ timeout: 15000 }` no primeiro
`findBy`/`waitFor` de cada caso e/ou o tempo do `it` para 20000, sem tocar nas asserções.

## Verificação
- Escopo: só leitura + `.tmp/` (relato e scripts de auditoria); `git status` sem alteração em teste.
- `zapp-verify . --rapido` rodado pelo `hermes-tarefa-fechar` (sem alteração de código a verificar).
