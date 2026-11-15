# Dossiê — claude__feat-copiloto-hooks-261101-1500 (PR #2473)

- Ref: `origin/claude/feat-copiloto-hooks-261101-1500` · tip `358da5fcb` · merge-base `1252bb5a4` (2026-11-01)
- Commits úteis: `63f48522a` feat: conectar 7 hooks do Copiloto às edge functions AI (fases 8–14); `358da5fcb` fix(copilot): useObjectionHandler detecta tipo com mais triggers. Os outros 4 são merges de `main`.
- Diffstat: 7 arquivos em `src/hooks/copilot/`, +367/−35. Sem migration, edge ou workflow.

## Propósito
Adicionar camada AI (`analyze()` → `invokeEdge('ai-*')`, estados `aiResult/aiLoading/aiError`) a 7 hooks do Copiloto RADAR. Na data da branch as 7 edges **não existiam** na main; a branch tipou as respostas por suposição.

## O que a main já tem
Commit `7ce81c015` (2026-11-10, PR #2834, título cita `#2473` explicitamente): cria as 7 edges (`supabase/functions/ai-objection-handler|ai-price-anchor|ai-loss-risk|ai-deadline-calculator|ai-lead-temperature|ai-product-recommendation|ai-multimodal-analysis`), os contratos Zod em `_shared/ai-response-contracts.ts:176-253` e reescreve os 7 hooks com camada AI alinhada a esses contratos (padrão `active = aiResult ?? local`). Consumidores já passam `messages` (ex.: `src/components/inbox/copilot/CopilotPanel.tsx:33-36`).

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência na main |
|---|---|---|
| `useDeadlineCalculator.ts` | INCORPORADA (intenção) / tipos OBSOLETOS | main:7-8 importa `useState/useCallback/invokeEdge`; main:81-101 `analyze()` chama `ai-deadline-calculator`; main:21-29 `AiDeadlineResult` = `DeadlineCalculatorEnvelope` (contracts:207-215). Tipos da branch (`feasible/insufficient_data/rushFeeApplicable`) não batem com a edge real → obsoletos. |
| `useImageAnalysis.ts` | INCORPORADA / tipos OBSOLETOS | main:39-49 chama `ai-multimodal-analysis` com `{imageUrl, conversationContext}`; main:10-20 tipo = `MultimodalAnalysisEnvelope` (contracts:246-254). Shape da branch (`mediaDescription/extractedData/scriptWithMedia`, body `mediaUrl/mediaType`) contradiz a edge → obsoleto. |
| `useLeadThermometer.ts` | INCORPORADA / tipos OBSOLETOS | main:60-76 `analyze()` → `ai-lead-temperature`; main:19-28 `AiLeadThermometerResult` = `LeadTemperatureEnvelope` (contracts:218-227). |
| `useLossRiskDetector.ts` | INCORPORADA / tipos OBSOLETOS | main:93-112 `analyze()` → `ai-loss-risk` com `messages` + `daysSinceLastContact`; main:21-24 tipo = `LossRiskEnvelope` (contracts:197-204). |
| `useObjectionHandler.ts` | INCORPORADA (AI) + **1 lacuna PERDIDA (baixo)** | main:116-134 `analyze()` → `ai-objection-handler`; main:32-36 tipo alinhado ao envelope. **Falta**: trigger `'barato'` em `preco` (main:39 não tem) e detecção por maior contagem de triggers (main:107 ainda `break` no primeiro match). |
| `usePriceAnchoring.ts` | INCORPORADA / tipos OBSOLETOS | main:55-73 `analyze()` → `ai-price-anchor`; main:16-20 tipo = `PriceAnchorEnvelope` (contracts:187-194). |
| `useProductRecommendation.ts` (novo na branch) | INCORPORADA de outra forma / shape OBSOLETO | main tem o arquivo (CV-105) com `recommend({messages,eventType,budget,quantity,context})` → `ai-product-recommendation`; tipo = `ProductRecommendationEnvelope` (contracts:230-243). Shape da branch (`catalog/currentProduct`, `productName/upsell/crossSellOpportunity`) contradiz a edge → obsoleto. Nenhum consumidor em `src/` além de `hooks/copilot/index.ts`. |

Transversal: `abortRef`/`AbortController` em todos os 7 hooks da branch — o `signal` nunca é passado ao `invokeEdge`, só guarda `finally` em 2 hooks → código morto, valor **nenhum**. Main não tem e não precisa.

## Veredito: PERDIDA_PARCIAL (confiança alta)
- 95% da branch está na main via #2834 com tipos corretos (os da branch estavam errados em relação às edges reais).
- Única lacuna que ainda faz sentido no código atual: scoring por contagem em `useObjectionHandler` (commit `358da5fcb`). Valor **baixo**: é correção de um problema que a própria branch criou ao adicionar `'barato'` em `preco` (texto do teste `'Cotei em outra empresa e ficou mais barato.'` passaria a casar `preco` antes de `concorrente`). Na main o teste `src/hooks/copilot/__tests__/useObjectionHandler.test.ts:43-49` passa com first-match porque `preco` não tem `'barato'`. Portar só faz sentido como par (trigger + scoring). Não rodei vitest (sem `node_modules` no clone) — análise estática.
- `triagem_2804 = DECISAO_DONO` (custo LLM) está superada: o dono já mergeou as 7 edges e a camada AI em #2834.
- `apagar_branch_seguro = false` só por regra (há lacuna); o hunk abaixo basta para portar sem reler a branch.

## Hunk a recuperar (opcional, valor baixo) — `src/hooks/copilot/useObjectionHandler.ts`
Na main: linha 39 (`OBJECTION_TRIGGERS.preco`) e linhas 105-108 (loop de detecção).
```diff
-  preco: ['caro', 'preço alto', 'muito caro', 'sai mais barato', 'orçamento', 'apertado', 'tá salgado'],
+  preco: ['caro', 'preço alto', 'muito caro', 'sai mais barato', 'barato', 'orçamento', 'apertado', 'tá salgado'],
...
     let detectedType: ObjeçãoType | null = null;
+    let maxMatches = 0;
     for (const [type, triggers] of Object.entries(OBJECTION_TRIGGERS) as [ObjeçãoType, string[]][]) {
-      if (triggers.some((t) => lower.includes(t))) { detectedType = type; break; }
+      const matchCount = triggers.filter((t) => lower.includes(t)).length;
+      if (matchCount > maxMatches) { maxMatches = matchCount; detectedType = type; }
     }
```
Validar com `npx vitest run src/hooks/copilot/__tests__/useObjectionHandler.test.ts` (7 casos; o de `concorrente` exige que concorrente (2 triggers: `cotei`, `outra empresa`) vença preco (1: `barato`)).

## Observação fora do escopo desta branch (herdado da main, não é lacuna da branch)
`ai-objection-handler/index.ts:127-128` devolve `{...envelope, treatmentSteps: script}` com `objectionType`, sem `type`/`detected`; o hook da main faz `active = aiResult ?? local` (`useObjectionHandler.ts:136`) e espalha `aiResult` como `ObjectionResult`, então após `analyze()` `type` fica `undefined` e `detected` também. Candidato a "Próximos passos" do lote, não a recuperação desta branch.

## Verificação adversarial

Parecer: **CONCORDO com PERDIDA_PARCIAL** (confiança alta). Tentei refutar por dois lados e os dois falharam.

### 1. A lacuna existe mesmo na main (não é falso positivo)
- `git show origin/main:src/hooks/copilot/useObjectionHandler.ts` (HEAD `dac285f62`): linha 39 `preco: ['caro', 'preço alto', 'muito caro', 'sai mais barato', 'orçamento', 'apertado', 'tá salgado']` — sem `'barato'`; linhas 105-108 ainda `if (triggers.some((t) => lower.includes(t))) { detectedType = type; break; }` — sem `maxMatches`.
- Não foi removida de propósito: `git log -S'maxMatches' --oneline origin/main -- src/hooks/copilot/useObjectionHandler.ts` → **vazio**; `git log -S"'barato'" …` → **vazio**. O arquivo só tem 2 commits na main (`8748ebf2a` criação, `7ce81c015` camada AI do #2834) — nenhum revert/remove.
- Ainda encaixa: o bloco alvo da main (`OBJECTION_TRIGGERS` :38-47 e o loop :105-108) está intacto e o hunk do dossiê aplica sem conflito.

### 2. Tentei derrubar para INCORPORADA/OBSOLETA — não deu
Os 6 outros arquivos são de fato obsoletos, e a prova é mais forte do que a da triagem: os **schemas de entrada** das edges na main rejeitam o body da branch, não só os tipos de saída.
- `supabase/functions/ai-multimodal-analysis/index.ts:34-37` → `parseBody(AiMultimodalAnalysisSchema, …)` e desestrutura `{ imageUrl, context, conversationContext }`. A branch manda `{ messages, mediaUrl, mediaType }` (`useImageAnalysis.ts:46` da branch) → não existe `mediaUrl`/`mediaType` no contrato.
- `supabase/functions/ai-product-recommendation/index.ts:34-37` → `{ messages, eventType, budget, quantity, context }`. A branch manda `{ messages, currentProduct, catalog }` (`useProductRecommendation.ts:48` da branch) → `catalog`/`currentProduct` não existem no contrato.
- Saídas: `_shared/ai-response-contracts.ts` `MultimodalAnalysisEnvelope` (description/extractedText/dominantColors/keyElements/brandingOpportunity/suggestedReply/confidence) e `ProductRecommendationEnvelope` (recommendations[product,category,reasoning,estimatedPrice,confidence,urgency]/topPick/upsellOpportunity) ≠ shapes da branch (`mediaDescription/extractedData/scriptWithMedia`, `productName/reason/script/upsell`). Os hooks da main (`useImageAnalysis.ts:39-49`, `useProductRecommendation.ts:53-57`) batem exatamente com os envelopes.
- Os 4 hooks restantes da main têm a camada AI ligada: `useDeadlineCalculator.ts:86` → `ai-deadline-calculator`; `useLeadThermometer.ts:65` → `ai-lead-temperature`; `useLossRiskDetector.ts:98` → `ai-loss-risk`; `usePriceAnchoring.ts:60` → `ai-price-anchor`, todos com `messages`.
- Varri o diff `1252bb5a4..358da5fcb` desses 4 arquivos filtrando o andaime de IA: **nenhuma** mudança de lógica local sobrou (só imports, tipos e `const local = useMemo`). Confirma que a única lógica de negócio exclusiva da branch é a do `useObjectionHandler`.

### 3. Correção ao dossiê: a lacuna vale mais do que "baixo — problema que a branch criou"
O scoring por contagem conserta uma **classificação errada que já existe na main**, independente de `'barato'`. Ordem de `OBJECTION_TRIGGERS` é preco→prazo→…→concorrente. Em "Cotei em outra empresa, o prazo deles é melhor": main casa `prazo` (1 trigger) e para; `concorrente` tem 2 (`cotei`, `outra empresa`) e perde. Com `maxMatches` vence `concorrente` — roteiro certo para o vendedor.
Consequência prática: **o scoring pode (e deve) ser portado sozinho, sem `'barato'`**. Conferi os 7 casos de `src/hooks/copilot/__tests__/useObjectionHandler.test.ts` estaticamente contra "scoring sem `'barato'`": caso 'concorrente' (:45) fica 2×0 → `concorrente`; 'preco' (:19) casa `caro`+`muito caro` = 2; demais têm 1 match único; empate mantém o primeiro tipo (`>`), preservando o comportamento atual. Portar só o scoring é o pedaço de valor com risco ~zero; `'barato'` é o pedaço discutível (classifica "ficou barato" como objeção de preço). Não rodei vitest (sem `node_modules`) — **NÃO VERIFICADO** em execução, análise estática.

### 4. Demais itens
- `abortRef`/`AbortController`: confirmado código morto (o `signal` não é passado ao `invokeEdge` em nenhum dos 7; em 2 hooks só guarda o `finally`). Não portar — concordo.
- `DECISAO_DONO` do lote 2804 está superada: as 7 edges e a camada AI já foram mergeadas pelo dono em #2834 (`7ce81c015`), então não há custo novo a aprovar.
- `apagar_branch_seguro = false` correto: o hunk ainda não está na main.
