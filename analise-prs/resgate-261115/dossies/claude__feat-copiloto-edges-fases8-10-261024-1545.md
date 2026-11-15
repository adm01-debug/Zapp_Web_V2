# Dossiê — claude/feat-copiloto-edges-fases8-10-261024-1545 (PR #2215)

**Veredito: INCORPORADA** (confiança alta) · apagar branch: seguro.

## Propósito
2 commits (`cd03d46c4`, `46d6a02d9`) sobre merge-base `e51662a9c` (2026-10-24): cria 7 edge functions do copiloto de vendas
(fases 8-10, CV-071–CV-100) — `ai-deadline-calculator`, `ai-lead-temperature`, `ai-loss-risk`, `ai-multimodal-analysis`,
`ai-objection-handler`, `ai-price-anchor`, `ai-product-recommendation` — cada uma com ~80 linhas (`requireAuth` → `enforceAiGuards` →
prompt → `generateWithRouting` → regex `/\{[\s\S]*\}/` → JSON), e registra as 7 em `ESTADO.md` como grupo E (órfãs).
Sem src, sem migration, sem workflow.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência na main |
|---|---|---|
| `supabase/functions/ai-deadline-calculator/index.ts` | Já existe, versão superior (127 l.) | adicionado em `7ce81c015` 2026-11-10 "feat(copilot): 7 edge functions AI + camada AI nos hooks RADAR + LiveSuggestions (#2834)"; usa `AiDeadlineCalculatorSchema` (`_shared/schemas.ts:177`), `DeadlineCalculatorEnvelope`, `parseJsonObject`, deps injetáveis; tem `index.test.ts` |
| `supabase/functions/ai-lead-temperature/index.ts` | Idem (124 l.) | `7ce81c015`; `AiLeadTemperatureSchema`, `LeadTemperatureEnvelope`; `index.test.ts` |
| `supabase/functions/ai-loss-risk/index.ts` | Idem (118 l.) | `7ce81c015`; `AiLossRiskSchema`, `LossRiskEnvelope`; `index.test.ts` |
| `supabase/functions/ai-multimodal-analysis/index.ts` | Idem (130 l.) | `7ce81c015`; `AiMultimodalAnalysisSchema`, `MultimodalAnalysisEnvelope`; `index.test.ts` |
| `supabase/functions/ai-objection-handler/index.ts` | Idem (141 l.) | `7ce81c015`; `AiObjectionHandlerSchema` (`schemas.ts:154`), metodologia B·R·I·N·D·E, `ObjectionHandlerEnvelope`; `index.test.ts` |
| `supabase/functions/ai-price-anchor/index.ts` | Idem (124 l.) | `7ce81c015`; `AiPriceAnchorSchema` (`schemas.ts:161`), `PriceAnchorEnvelope`; `index.test.ts` |
| `supabase/functions/ai-product-recommendation/index.ts` | Idem (132 l.) | `7ce81c015`; `AiProductRecommendationSchema`, `ProductRecommendationEnvelope`; `index.test.ts` |
| `ESTADO.md` | As 7 já listadas (grupo E) e nas Órfãs | `origin/main:ESTADO.md:36,42-48` e `:139-146`; totais da main (92 edges, E=27) já superam os da branch (91) |

Os hunks `CONFLICT` são textuais: a branch e a main escreveram o mesmo arquivo a partir do zero com textos diferentes. Nenhuma linha da
branch traz comportamento que a main não tenha — a main valida entrada com zod, valida saída com envelope de contrato (502 se o
modelo foge do schema), permite injeção de deps para teste e teve correção posterior (`eb93d55ec` 2026-11-13, `parseJsonObject`).
A versão da branch (regex solto, sem validação de body, sem testes) é estritamente inferior. Além disso a main ligou os 7 a hooks
em `src/hooks/copilot/` (ex.: `useObjectionHandler.ts:121` → `invokeEdge('ai-objection-handler', …)`), coisa que a branch não fazia.

## Lacunas a recuperar
Nenhuma.

## Observação lateral (fora do escopo deste item)
`origin/main:ESTADO.md:47` marca `ai-objection-handler` (e as outras 6) como grupo E "sem chamador", mas
`src/hooks/copilot/useObjectionHandler.ts:121` as invoca via `invokeEdge(...)`. A guarda
`scripts/ci/docs-estado-registry-convention.unit.mjs` provavelmente só reconhece `invoke`/`/functions/v1` literais. Vale um item
separado (chore) para a guarda reconhecer `invokeEdge` e reclassificar as 7 como grupo A.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA** (no sentido estrito, *substituição por versão superior*; efeito igual — apagar é seguro).
`origin/main` em `dac285f62`. Diff conferido: `git diff e51662a9c 46d6a02d9` = 8 arquivos, 580+/4- (7 edges + ESTADO.md).

### Tentativa de refutação, arquivo por arquivo

1. **As 7 edges existem na main, com teste**: `git ls-tree -r origin/main -- supabase/functions/ai-{deadline-calculator,lead-temperature,loss-risk,multimodal-analysis,objection-handler,price-anchor,product-recommendation}` → `index.ts` + `index.test.ts` em todas (153–161 linhas de teste cada). A branch não traz teste nenhum.
2. **Versão da main é superior, não apenas diferente**:
   - entrada validada por zod (`parseBody(AiDeadlineCalculatorSchema, …)` + `validationErrorResponse`) — a branch faz `const { messages = [] } = await req.json()` cru;
   - saída validada por contrato: `ai-response-contracts.ts:176–262` define `ObjectionHandlerEnvelope`, `PriceAnchorEnvelope`, `LossRiskEnvelope`, `DeadlineCalculatorEnvelope`, `LeadTemperatureEnvelope`, `ProductRecommendationEnvelope`, `MultimodalAnalysisEnvelope`; fora do contrato → 502 com `buildAiEnvelope`. A branch devolve `result ?? {}` (200 com objeto vazio quando o modelo erra o JSON);
   - handler exportado com injeção de dependência (`handleAiX(req, deps)`), o que viabiliza os testes; a branch chama `Deno.serve` direto.
3. **O único ponto em que a branch parecia ter capacidade extra não se sustenta**: `ai-multimodal-analysis` da branch recebe `mediaUrl`/`mediaType` e apenas **cola a URL no texto do system prompt** — o modelo nunca vê a mídia. A main monta mensagem de visão real (`content: [{ type: "image_url", image_url: { url: imageUrl } }, …]`) e roteia por `need: { modality: 'vision' }`. A branch é estritamente inferior aqui. Mesmo padrão em `ai-deadline-calculator`: a main calcula `today`/`lastOrderDate` e tem tabela de prazos por produto; a branch só repassa texto.
4. **Campos de prompt só da branch** (`rushFeeApplicable`, `negotiationScript`, `boiling`, `speedToLeadMinutes`, `followUp.delayHours`, `battlecard`, `tradeInOffer`, `smallerLotSuggestion`, `postNoRecovery`, `psychologyNote`, `crossSellOpportunity`, `timingNote`): ausentes da main (`git grep -i` nos 7 arquivos → zero). São desejos de campo de saída, sem schema, sem teste e sem consumidor na UI; adotá-los exigiria alterar os envelopes zod da main. Valor individual **baixo** (nenhum ≥ médio) — e o `battlecard` tem item próprio já triado: `docs/_arquivo/analise/dossies/feat-copiloto-cv071-080-objection-battlecard.md` (veredito COBERTA, PR #2361 com `useBattlecard.ts`/`useMinimumQty.ts`/`usePriceAnchor.ts`). A semântica de `riskScore/riskLevel/riskFactors/recoveryScript/interventionUrgency` está coberta por `level/riskScore/signals/recoveryAction/script/urgency` na main.
5. **ESTADO.md**: as 3 linhas "faltantes" são números velhos. A main já registra as 7 edges como grupo E/órfãs (`origin/main:ESTADO.md:43–49` e `:137–145`) e o total está em **92** (a branch escrevia 91, e "Órfãs (27)"). Pegar a versão da branch seria regressão de inventário.

Nenhum hunk de valor ≥ médio fora da main. Branch pode ser apagada.
