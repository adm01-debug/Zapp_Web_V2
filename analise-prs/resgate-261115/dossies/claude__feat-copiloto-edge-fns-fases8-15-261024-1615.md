# Dossiê — claude/feat-copiloto-edge-fns-fases8-15-261024-1615 (PR #2216)

**Veredito: OBSOLETA** · confiança alta · apagar branch: **seguro**

## Propósito
Commit `d7e355ecc` "feat: 7 edge functions copiloto RADAR fases 8-15 (CV-071–CV-150)" (+ merge de main `235d73a56`).
Cria do zero (`new file mode` em todos) 7 edges de IA do copiloto: `ai-deadline-calculator`, `ai-lead-temperature`,
`ai-loss-risk`, `ai-multimodal-analysis`, `ai-objection-handler`, `ai-price-anchor`, `ai-product-recommendation`.
653 linhas, só `supabase/functions/`. Versão rascunho: body sem validação (`req.json()` solto), saída = regex `\{[\s\S]*\}`
+ `JSON.parse`, sem contrato de resposta, sem testes, sem hook no front.

## O que a main tem hoje
As MESMAS 7 funções (mesmo nome, mesmo diretório) foram criadas na main por `7ce81c015` (2026-11-10,
PR #2834 "feat(copilot): 7 edge functions AI + camada AI nos hooks RADAR + LiveSuggestions"), em implementação
mais completa que substitui a da branch:
- Input validado por zod: `supabase/functions/_shared/schemas.ts:154-200` (`AiObjectionHandlerSchema` … `AiMultimodalAnalysisSchema`).
- Output validado por contrato: `supabase/functions/_shared/ai-response-contracts.ts:176-246` (`*Envelope`), `parseModelOutput` + `buildAiEnvelope` 502 quando fora do contrato.
- Injeção de dependências p/ teste (`*Deps`: authorize/enforceGuards/generate) e `index.test.ts` em cada uma das 7 pastas.
- Consumidores no front: `src/hooks/copilot/useDeadlineCalculator.ts`, `useImageAnalysis.ts`, `useLeadThermometer.ts`,
  `useLossRiskDetector.ts`, `useObjectionHandler.ts`, `usePriceAnchoring.ts`, `useProductRecommendation.ts` (+ testes em `__tests__/`).
- Registradas em `supabase/deployment-manifest.json` (ex.: linhas 1051, 1211).
- Mesma base: `requireAuth` + `enforceAiGuards` + `generateWithRouting(purpose:'copilot')` — equivalente ao da branch.

## Tabela arquivo × achado
| arquivo (supabase/functions/…/index.ts) | branch | main (origin/main) | achado |
|---|---|---|---|
| ai-deadline-calculator | prompt livre: deadline{productionDays,shippingDays,bufferDays,latestOrderDate,feasible}, quoteDraft, freightEstimate | `AiDeadlineCalculatorSchema` + `DeadlineCalculatorEnvelope` (feasibility ok/tight/impossible, lastOrderDate, alternatives, urgencyLevel); hook `useDeadlineCalculator.ts:13` usa `feasibility` | superada |
| ai-lead-temperature | score 0-100, signals tipados, followUp, silenceAlertMinutes | 3 dimensões (interest/urgency/capacity) + temperatureLabel + recommendedAction + nextBestOffer; `LeadTemperatureEnvelope` | superada |
| ai-loss-risk | riskScore, signals{type,weight}, recoveryAction, triggerThreshold | level/riskScore/signals/recoveryAction/script/urgency + `daysSinceLastContact`; `LossRiskEnvelope`; hook testa `recoveryAction` | superada |
| ai-multimodal-analysis | 9 tipos (áudio, OCR, PDF, etc.) via `analysisHint`, mas só passa `mediaUrl` como texto no prompt (sem vision real) | imagem via mensagem vision `image_url` real + description/extractedText/dominantColors/brandingOpportunity/suggestedReply; `MultimodalAnalysisEnvelope` | superada (a branch não implementava de fato áudio/PDF: só texto no prompt) |
| ai-objection-handler | categorias price/competitor/delay/min_quantity/hard_no/trade_in + battlecard | metodologia B·R·I·N·D·E (regra de domínio do copiloto), isSmokescreen, script[], coaching; `ObjectionHandlerEnvelope` | superada |
| ai-price-anchor | valueFraming/anchorComparison/proposedDiscountPct ≤ sellerMaxDiscountPct | 5 técnicas de ancoragem, strategy enum, anchorScript/costPerUseScript/reframing; `PriceAnchorEnvelope` | superada |
| ai-product-recommendation | primary/cross_sell/upsell/kit com productId | categorias de brindes, recommendations[≤3] + topPick + upsellOpportunity; `ProductRecommendationEnvelope` | superada |

## Por que OBSOLETA e não PERDIDA
Toda a necessidade (7 capacidades do copiloto RADAR) está entregue ponta a ponta na main com outro contrato de
dados, que é o que os hooks do front e os testes consomem. Portar os prompts/campos da branch quebraria os
contratos `*Envelope` e os hooks. Diferenças de conteúdo (ex.: `proposedDiscountPct`, `followUp` do lead,
`battlecard` de concorrente, tipos de mídia além de imagem) são ideias de produto, não trabalho recuperável
como código — e no caso multimodal a branch nem implementava (só citava a URL no prompt).

## Lacunas a recuperar
Nenhuma. Triagem anterior (2026-11-08) já marcava #2216 como OBSOLETA; confirmado aqui com evidência.

## Verificação adversarial

**Concordo com OBSOLETA.** Tentei refutar procurando hunk útil não coberto; não achei nenhum de valor ≥ médio.

### Confirmações de base
- Diff `004e74a8c..235d73a56` = 7 arquivos, 653 inserções, todos `new file mode`, só `supabase/functions/` (nenhum `src/`, migration ou workflow).
- `d7e355ecc` **não** é ancestral de `origin/main` (`git merge-base --is-ancestor` → falso; contido só em `origin/claude/feat-copiloto-edge-fns-fases8-15-261024-1615` e `pr/2216`). Logo o código da branch nunca entrou — a main reimplementou.
- As 7 pastas na main vêm de `7ce81c015` (2026-11-10, PR #2834), cada uma com `index.ts` **+ `index.test.ts`** (`git ls-tree origin/main`). Nenhum `--diff-filter=D` nessas pastas: não houve remoção/revert deliberado a recuperar.
- Registradas em `origin/main:supabase/deployment-manifest.json:438-483` (allowlist de path) e `:1051-1240+` (entrypoints).

### Cada "ideia exclusiva" da branch, caçada na main
| ideia da branch | onde está na main | valor residual |
|---|---|---|
| `quoteDraft` (esboço de orçamento) | `src/hooks/copilot/useQuoteDraft.ts` (CV-086) + `src/components/copilot/QuoteDraftCard.tsx` + teste `__tests__/useQuoteDraft.test.ts` | nenhum |
| `freightEstimate` (dias/custo/transportadora) | `src/hooks/copilot/useFreightEstimate.ts` (CV-087), tabela por região SP/RJ/MG/Sul/Centro/Norte/Nordeste | nenhum |
| `battlecard` de concorrente | `src/hooks/copilot/useBattleCard.ts` (CV-073), `COMPETITOR_PATTERNS` + pontos por categoria | nenhum |
| objeção `trade_in` / permuta | `src/hooks/copilot/useTradeOffer.ts` (CV-076) — pede algo em troca da concessão | nenhum |
| objeção `hard_no` (recusa definitiva) | `src/hooks/copilot/usePostRejection.ts` (CV-080) | nenhum |
| `sellerMaxDiscountPct` + `proposedDiscountPct` | `useDiscountGuardrail.ts` (CV-075) + `useNegotiationGuard.ts` + `DiscountGuardrailBanner.tsx`; `useCopilotSupervisor.ts:7` tem a fonte `discount_guardrail`. A main **desaconselha** desconto e oferece alternativa de valor; a branch *sugeria* o desconto — contradiz a regra vigente, não é lacuna | nenhum (conflito de regra) |
| `silenceThresholdMinutes` / `silenceAlertMinutes` | `useSilenceDetector.ts` (CV-096) + `useLossRiskDetector.ts:39` (`SILENCIO_DIAS`) + `daysSinceLastContact` no `AiLossRiskSchema` | nenhum |
| sinais de risco `competitor_mention`/`stall_phrase`/`engagement_drop`/`silence` | prompt da main `ai-loss-risk/index.ts` cobre os 4 semanticamente ("cotando em outros", "vou pensar", "resposta lenta", `daysSinceLastContact`); + `useStallDetector.ts`, `useVouPensarDetector.ts` | nenhum |
| `audio_transcription` / `audio_sentiment` | `useAudioTranscription.ts` (CV-101), `useAudioTone.ts`; edges `_shared/ai-audio-input.ts`, `ai-audio-authz.ts`, `classify-audio-meme/` | nenhum |
| `pdf_catalog` | `usePdfExtraction.ts` (CV-103) | nenhum |
| `logo_detection` / `competitor_print` | `useLogoAnalysis.ts` (CV-104), `useBrandColors.ts` | nenhum |
| `ocr` / `image_description` | main `ai-multimodal-analysis` devolve `extractedText[]`, `description`, `dominantColors`, `keyElements` sobre imagem **real** | nenhum |
| `chart_extractor`, `label_reader` | sem equivalente na main (`git grep` em `src`+`supabase`: zero) | **< médio — ver abaixo** |
| `productId` na recomendação | main usa `product`/`category`/`estimatedPrice`; o `productId` da branch era inventado pelo modelo (`"id_do_produto_ou_null_se_desconhecido"`), sem consulta a catálogo | nenhum |

### Por que `chart_extractor`/`label_reader` não sustentam PERDIDA_PARCIAL
A branch **não implementava** nenhum dos 9 tipos de mídia: o único `messages` enviado ao modelo é texto —
`{ role: "user", content: \`Analise a mídia (${mediaType}) disponível em: ${mediaUrl}\` }` — sem `image_url`,
sem `need: { modality: 'vision' }`. O modelo não busca URL, então áudio, PDF, OCR, rótulo e gráfico retornariam
alucinação. A main envia a imagem de fato (`content: [{ type: "image_url", image_url: { url: imageUrl } }, …]`
+ `need: { modality: 'vision' }`). Portar os dois rótulos de prompt não é código resgatável: é uma linha de
texto cujo efeito seria piorar a saída. Valor baixo.

### Risco de portar (motivo extra para não resgatar)
Os contratos da main são validados em runtime e consumidos pelo front: `_shared/schemas.ts` (entrada zod) e
`_shared/ai-response-contracts.ts` (`*Envelope` + `parseModelOutput`, 502 fora do contrato). `useDeadlineCalculator.ts:10-30`
declara `feasibility: 'ok'|'tight'|'impossible'`, `lastOrderDate`, `urgencyLevel` — a branch devolvia
`deadline.feasible` booleano e `latestOrderDate`. Injetar campos da branch derrubaria os envelopes (502) e os
testes das 7 pastas.

**Veredito final: OBSOLETA · apagar branch: seguro · lacunas adicionais: nenhuma.**
