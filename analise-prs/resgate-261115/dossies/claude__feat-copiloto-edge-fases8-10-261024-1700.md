# claude/feat-copiloto-edge-fases8-10-261024-1700 (PR #2217) — OBSOLETA

- tip `e9d2e0fa6ee66096da1b1e359a311362ca3d18a9` · merge_base `e51662a9c391cddc7a21fcfbba2dfd581c3ad6d8` · 1 commit
- Commit: `e9d2e0fa6 feat: edge functions AI copiloto fases 8-15 (CV-071 a CV-150)`
- Diff: 7 arquivos, **524 inserções, 0 remoções** — só criação de edges novas (`git diff --stat`).

## Propósito
Criar 7 edge functions do Copiloto de Vendas (RADAR, plano `docs/plans/PLANO_COPILOTO_VENDAS_AO_VIVO_150_ETAPAS_2026-10-16.md`),
etapas CV-071 a CV-150: tratamento de objeção, âncora de preço, risco de perda, recomendação de produto,
calculadora de prazo, temperatura do lead e análise multimodal.

## Arquivo × achado × evidência

Nenhum dos 7 arquivos existia no merge base (`git cat-file -e <MB>:... ` → ausente). Todos os 7 **existem hoje na
main**, em versão maior e mais madura:

| arquivo (`supabase/functions/.../index.ts`) | branch | main | achado |
|---|---|---|---|
| `ai-objection-handler` | 74 L | 141 L | main implementa metodologia B·R·I·N·D·E + contrato `ObjectionHandlerEnvelope` |
| `ai-price-anchor` | 74 L | 124 L | main usa `unitPrice`/`costPerUseScript`/`reframing` em vez do `sellerMaxDiscountPct` da branch |
| `ai-loss-risk` | 72 L | 118 L | main tem `level`/`urgency`/`script` tipados (`LossRiskEnvelope`) |
| `ai-product-recommendation` | 76 L | 132 L | main tem `ProductRecommendationEnvelope` (1–3 itens, `topPick`, `upsellOpportunity`) |
| `ai-deadline-calculator` | 78 L | 127 L | main tem `feasibility`/`productionDays`/`lastOrderDate` (`DeadlineCalculatorEnvelope`) |
| `ai-lead-temperature` | 75 L | 124 L | main tem `temperature`/`interestScore`/`urgencyScore`/`capacityScore` (`LeadTemperatureEnvelope`) |
| `ai-multimodal-analysis` | 75 L | 130 L | main envia a imagem de verdade em formato *vision* (`need: { modality: 'vision' }`), a branch só colava a URL dentro do prompt de texto |

Evidências pontuais:
- Quem trouxe as 7 para a main: `git log --oneline origin/main -- supabase/functions/ai-objection-handler/index.ts` →
  `7ce81c015 feat(copilot): 7 edge functions AI + camada AI nos hooks RADAR + LiveSuggestions #2460 #2473 #2002 (#2834)`
  e depois `eb93d55ec fix(edge): copiloto RADAR extrai JSON via parseJsonObject (#3001)`.
- Contratos de saída por capacidade na main: `supabase/functions/_shared/ai-response-contracts.ts:176` (`ObjectionHandlerEnvelope`),
  `:187` (`PriceAnchorEnvelope`), `:197` (`LossRiskEnvelope`), `:207` (`DeadlineCalculatorEnvelope`),
  `:218` (`LeadTemperatureEnvelope`), `:239` (`ProductRecommendationEnvelope`), `:246` (`MultimodalAnalysisEnvelope`).
- Schemas de entrada na main: `supabase/functions/_shared/schemas.ts:161,170,177,185,191,200`.
- Integração ponta a ponta já existe na main (`git grep -l ... origin/main -- src/`):
  `src/hooks/copilot/useObjectionHandler.ts`, `usePriceAnchoring.ts`, `useLossRiskDetector.ts`,
  `useProductRecommendation.ts`, `useDeadlineCalculator.ts`, `useLeadThermometer.ts`, `useImageAnalysis.ts`.
- Padrão da main que a branch não tem: `export async function handleAi...(req, deps)` com injeção de
  `authorize`/`enforceGuards`/`generate` (testável) + `parseJsonObject` + `parseModelOutput`; a branch usa
  `Deno.serve` direto e `JSON.parse` cru (ex.: branch `ai-objection-handler/index.ts` linhas 15 e 60-66).

## Por que OBSOLETA, não PERDIDA
As 326 linhas "em lacuna" são o rascunho anterior das MESMAS 7 capacidades (mesmos `functionName`, mesmas
etapas CV). A main substituiu a abordagem de propósito: prompts especializados em brindes corporativos,
contratos Zod de saída, roteamento de modelo por `purpose`/`need`, hooks no front. Portar qualquer hunk da
branch regrediria a main. Único ponto onde a branch "fazia mais" é cosmético, não funcional:
`mediaType: image|audio|document|video` no multimodal — mas a branch nunca buscava a mídia, só mandava a URL
como texto no prompt, então áudio/vídeo/documento não funcionavam de fato; a main cobre imagem de verdade via
vision. Sem valor a recuperar.

## Veredito
**OBSOLETA** — prova completa para os 7 arquivos. `apagar_branch_seguro = true`.

## Verificação adversarial

Tentei refutar o OBSOLETA e não consegui. Resultado: **concordo**, branch pode ser apagada.

Checagens feitas (git só leitura):

1. **A branch só cria arquivos.** `git diff --stat e51662a9..origin/claude/feat-copiloto-edge-fases8-10-261024-1700`
   → 7 arquivos, 524 inserções, 0 remoções. Commit único `e9d2e0fa6 feat: edge functions AI copiloto fases 8-15
   (CV-071 a CV-150)`. `git cat-file -e e51662a9:supabase/functions/<cada edge>/index.ts` → ausente no merge base.
   Nada foi removido da main por esta branch, logo não há como haver trabalho "perdido por reversão".

2. **Os 7 caminhos existem na main, maiores:** branch 72–78 linhas vs main 118–141 linhas
   (objection 74→141, multimodal 75→130, product-rec 76→132, deadline 78→127, lead-temp 75→124,
   price-anchor 74→124, loss-risk 72→118).

3. **O código da branch NÃO compila contra a main.** Todas as 7 funções chamam
   `generateWithRouting({ systemPrompt, userPrompt, responseFormat: "json", maxTokens })` e leem `result.content`.
   Na main, `origin/main:supabase/functions/_shared/ai-generate.ts:319` (`export interface GenerateParams`) exige
   `purpose` + `messages` (`system` opcional, sem `systemPrompt`/`userPrompt`/`responseFormat`/`maxTokens`) e
   `generateWithRouting` (L637) devolve `{ response, data }`, não `{ content }`. Portar qualquer hunk exigiria
   reescrever a chamada — ou seja, não existe hunk aplicável, só a ideia, que já está implementada.

4. **Substituição realmente cobre a necessidade** (abri os arquivos da main nas linhas citadas):
   - `origin/main:supabase/functions/_shared/ai-response-contracts.ts:176` ObjectionHandlerEnvelope (objectionType
     com 8 tipos incl. `quantidade_minima`, `isSmokescreen`, `brindeLetter`, `script[]`, `suggestedReply`, `coaching`),
     `:187` PriceAnchorEnvelope, `:197` LossRiskEnvelope, `:207` DeadlineCalculatorEnvelope,
     `:218` LeadTemperatureEnvelope, `:239` ProductRecommendationEnvelope, `:246` MultimodalAnalysisEnvelope.
   - Entradas tipadas em `origin/main:supabase/functions/_shared/schemas.ts:161` (AiPriceAnchorSchema, `unitPrice`),
     `:170`, `:177`, `:185`, `:191`, `:200`.
   - Cada edge da main valida saída com `parseModelOutput(<Envelope>, rawOutput)` e devolve 502 com
     `buildAiEnvelope` fora do contrato — a branch só fazia `JSON.parse` solto.

5. **Caçada por lacuna de valor ≥ médio nos campos exclusivos da branch — todos cobertos ou inócuos:**
   - `smallerLotSuggestion` → `quantidade_minima` no enum de objeção (ai-response-contracts.ts:178).
   - `sellerMaxDiscountPct` → main usa `unitPrice` + `costPerUseScript`/`reframing`; guardrail de desconto é peça
     própria (`src/hooks/copilot/useDiscountGuardrail.ts`).
   - `speedToLeadMinutes`/`silenceThresholdMinutes` → já existe na main com UI:
     `src/hooks/copilot/useSpeedToLead.ts`, `src/components/copilot/SpeedToLeadAlert.tsx`,
     `src/components/copilot/RadarPhase10Panel.tsx`.
   - `workingDays`/`requestedDate`/`feasibleDate` → `productionDays`/`daysUntilEvent`/`lastOrderDate`/`feasibility`/
     `alternatives` (contrato mais rico).
   - `currentFunnelStage` → `eventType`/`budget`/`quantity` + `topPick`/`upsellOpportunity`.
   - `mediaType: audio|document|video` → aparenta ser a única "capacidade a mais", mas é falsa: a branch manda só
     `URL da mídia: <url>` como texto, sem conteúdo nenhum ao modelo; não transcreve nem baixa nada. A main faz
     vision de verdade (`image_url` + `need: { modality: 'vision' }`) e áudio tem trilha própria
     (`src/hooks/copilot/useAudioTranscription.ts`, `useAudioTone.ts`).
   - `postNoRecovery` → sem identificador na main, mas a necessidade está em LossRiskEnvelope
     (`recoveryAction` + `script` + `urgency`); valor isolado baixo e inaplicável (item 3).
6. **Integração ponta a ponta só existe na main:** `src/hooks/copilot/useObjectionHandler.ts`,
   `usePriceAnchoring.ts`, `useLossRiskDetector.ts`, `useProductRecommendation.ts`, `useDeadlineCalculator.ts`,
   `useLeadThermometer.ts`, `useImageAnalysis.ts` (+ testes em `src/hooks/copilot/__tests__/`). A branch não toca `src/`
   (counts.src = 0).

**Veredito final: OBSOLETA. `apagar_branch_seguro = true`.** Nenhuma lacuna adicional.
