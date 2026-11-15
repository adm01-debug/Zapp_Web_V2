# claude__feat-copiloto-edges-261101-1330 — PR #2460

- ref: `origin/claude/feat-copiloto-edges-261101-1330` · tip `c5bac6ad2` · merge_base `1252bb5a4` (2026-11-01)
- 23 commits, 22 arquivos, +1347/-162

## Propósito
Criar 7 edge functions do Copiloto de Vendas (fases 8–11, CV-071–CV-102) — `ai-objection-handler`,
`ai-price-anchor`, `ai-loss-risk`, `ai-product-recommendation`, `ai-deadline-calculator`,
`ai-lead-temperature`, `ai-multimodal-analysis` — e plugar a camada AI nos hooks `src/hooks/copilot/*`
via `invokeEdge`, registrando-as no kill switch e no manifest.

## Achados por arquivo

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/ai-objection-handler/index.ts` | INCORPORADA em versão superior | main tem a função com `parseBody(AiObjectionHandlerSchema)`, `parseModelOutput(ObjectionHandlerEnvelope)`, injeção de deps p/ teste e metodologia B·R·I·N·D·E; branch é a versão crua (prompt solto, sem contrato). `git show origin/main:supabase/functions/ai-objection-handler/index.ts` + `origin/main:.../index.test.ts` |
| `ai-price-anchor`, `ai-loss-risk`, `ai-product-recommendation`, `ai-deadline-calculator`, `ai-lead-temperature` | INCORPORADAS em versão superior | todas existem em `origin/main` com `index.test.ts` ao lado (`git ls-tree -r --name-only origin/main -- supabase/functions/<f>`); diff branch→main = +90..+116 linhas de contrato/validação |
| `supabase/functions/ai-multimodal-analysis/index.ts` | **PARCIAL — lacuna real** | main (linha 68) manda `image_url: { url: imageUrl }` cru para o provedor; a branch baixava a mídia no servidor com `toInlineImage` (bucket privado). Ver "Lacuna 2" |
| `supabase/functions/_shared/ai-feature-flags.ts` | **LACUNA real** | `AI_CAPABILITY_BY_FUNCTION` em `origin/main:supabase/functions/_shared/ai-feature-flags.ts:58-78` não lista nenhuma das 7 edges; `capabilityFlagKeyForFunction` (linha 86-92) devolve `null` → `enforceAiGuards` não aplica o kill switch `ai.capability.copilot_live` a elas |
| `src/hooks/copilot/useObjectionHandler.ts` · `usePriceAnchoring.ts` · `useLossRiskDetector.ts` · `useDeadlineCalculator.ts` · `useLeadThermometer.ts` | INCORPORADAS (contrato diferente) | main já chama as edges: `useObjectionHandler.ts:121`, `usePriceAnchoring.ts:60`, `useLossRiskDetector.ts:98`, `useDeadlineCalculator.ts:86`, `useLeadThermometer.ts:65` — todos via `invokeEdge`. Os tipos da main casam com os envelopes da main; portar a versão da branch quebraria o contrato |
| `src/hooks/copilot/useImageAnalysis.ts` | INCORPORADA | `origin/main:src/hooks/copilot/useImageAnalysis.ts:47` chama `ai-multimodal-analysis` |
| `src/hooks/copilot/useProductRecommendation.ts` | INCORPORADA | `origin/main:src/hooks/copilot/useProductRecommendation.ts:57` chama `ai-product-recommendation` |
| `src/hooks/copilot/useMultimodalAnalysis.ts` (novo) | OBSOLETO (duplicata) | mesma necessidade já coberta por `useImageAnalysis` na main, que chama a mesma edge; o hook da branch usa o contrato antigo (`mediaUrl`/`mediaType`) que a main não aceita (`AiMultimodalAnalysisSchema` só tem `imageUrl/context/conversationContext` — `supabase/functions/_shared/schemas.ts:200-205`) |
| `src/hooks/copilot/index.ts` | OBSOLETO | exports de `useMultimodalAnalysis` (arquivo que não existe na main) e `useProductRecommendation` com tipos do contrato antigo. Nota: na main `useProductRecommendation` existe e não está no barrel, e nem ele nem `useImageAnalysis` têm consumidor de UI (`git grep -n useProductRecommendation origin/main -- src` só acha a própria definição) — lacuna pré-existente da main, não desta branch |
| `.github/workflows/ci.yml` | OBSOLETO / regressivo | a branch **apaga** o job `edge-contracts` e o tira do `needs` do CI Gate; a main mantém os dois (as 16 linhas seguem na main). Aplicar reverteria estrutura de CI atual |
| `src/hooks/inbox/useInboxBulkActions.ts` + `__tests__/useInboxBulkActions.test.ts` | OBSOLETO / regressivo | a branch **remove** a exclusão de contatos já `archived` e o `validFromArchived` (trigger `enforce_conversation_status_transition`) que a main tem hoje — reverteria proteção do desfazer de arquivamento em massa, e apaga 36 linhas de teste que a main mantém |
| `supabase/deployment-manifest.json` | NENHUM | artefato gerado (hashes/bytes), regerado a cada deploy |
| `ESTADO.md` | NENHUM | contagem de edges/órfãs; a main já está em outro número (`54` vs `55`) |

## Veredito: PERDIDA_PARCIAL
As 7 edges e a camada AI dos hooks estão na main, em versão mais evoluída (contratos Zod, envelopes,
testes Deno). Sobram **duas lacunas reais**, ambas em `supabase/functions/` — não há nada de UI,
migration ou workflow a recuperar.

Não é DECISAO_DONO: o custo de LLM das 7 edges já existe na main (todas chamadas pelos hooks), e as
duas lacunas *reduzem* risco/custo (kill switch e correção de bug), não criam novo.

---

## Lacuna 1 — kill switch `copilot_live` não cobre as 7 edges (valor ALTO: custo de IA paga)
Arquivo: `supabase/functions/_shared/ai-feature-flags.ts`, dentro de `AI_CAPABILITY_BY_FUNCTION`
(após `"copilot-live": "copilot_live",`, linha 78 da main).

```ts
  // CV-081-087: Análise contextual do Copiloto RADAR (fases 8-9).
  "ai-objection-handler": "copilot_live",
  "ai-price-anchor": "copilot_live",
  "ai-loss-risk": "copilot_live",
  "ai-product-recommendation": "copilot_live",
  "ai-deadline-calculator": "copilot_live",
  "ai-lead-temperature": "copilot_live",
  "ai-multimodal-analysis": "copilot_live",
```
Hoje, desligar `ai.capability.copilot_live` em `feature_flags` **não** barra essas 7 funções: sem
entrada no mapa, `capabilityFlagKeyForFunction` devolve `null` e o gate passa (o próprio cabeçalho do
arquivo documenta "Função SEM capacidade declarada no mapa abaixo não é barrada por este gate").
Ajustar junto `supabase/functions/_shared/__tests__/ai-feature-flags.test.ts` (padrão da linha 34).

## Lacuna 2 — `ai-multimodal-analysis` manda URL de bucket PRIVADO para o provedor (valor ALTO: bug real, mídia do WhatsApp)
`origin/main:supabase/functions/ai-multimodal-analysis/index.ts:60-70` monta a mensagem de visão com a
URL crua:
```ts
        { type: "image_url", image_url: { url: imageUrl } },
```
`origin/main:supabase/functions/_shared/ai-image-input.ts:1-12` prova por que isso falha: o bucket
`whatsapp-media` é **privado** (`public=false`) e as 971 URLs `/object/public/whatsapp-media/...`
devolvem HTTP 400 para terceiros — "o modelo NÃO consegue buscar a imagem"; tornar o bucket público
foi descartado. `classify-emoji/index.ts:88` e `classify-sticker/index.ts:104` já usam o helper
oficial; só `ai-multimodal-analysis` ficou de fora.

Trecho da branch a portar (adaptar nomes: na main o campo é `imageUrl`, não `mediaUrl`):
```ts
import { toInlineImage, AiImageInputError } from "../_shared/ai-image-input.ts";

const bearerToken = (req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "")
  .replace(/^bearer /i, "").trim();

let imageDataUrl = "";
try {
  const inline = await toInlineImage(imageUrl, {
    storageIdentity: {
      kind: "user",
      bearerToken,
      anonKey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    },
  });
  imageDataUrl = inline.dataUrl;
} catch (err) {
  if (err instanceof AiImageInputError) log.error("image-download", { code: err.code, msg: err.message });
  imageDataUrl = "";
}
if (!imageDataUrl) return errorResponse("Imagem não pôde ser obtida para análise.", 422, req);
// ... e usar imageDataUrl em image_url.url
```
Observação: o teto de ~150 KB (`413`) e o `415` por `mediaType` da branch não se aplicam diretamente —
a main já tem `MAX_INLINE_IMAGE_BYTES` (4 MiB) dentro do helper e não recebe `mediaType` no schema.
Portar só o download inline + o `422`.

## apagar_branch_seguro: false
As duas lacunas acima só existem nesta branch; apagar antes de portá-las perde a prova do trecho.

## Verificação adversarial

Veredito verificado: **PERDIDA_PARCIAL — concordo** (tentei refutar as duas lacunas e as duas se
sustentam; nenhuma terceira lacuna de valor ≥ médio apareceu).

### Lacuna 1 — kill switch não cobre as 7 edges: CONFIRMADA (valor alto)
- `origin/main:supabase/functions/_shared/ai-feature-flags.ts:60-78` — `AI_CAPABILITY_BY_FUNCTION`
  lista `ai-suggest-reply` … `copilot-live` (linha 77) e **nenhuma** das 7 edges do RADAR.
- Prova de que isso desativa o gate, não só o mapa: `ai-feature-flags.ts:240-241`
  (`enforceAiCapability`) → `const key = capabilityFlagKeyForFunction(...); if (key === null) return null;`
  e `ai-guards.ts:202-203` chama `enforceAiCapability` logo antes de reservar orçamento. Função fora do
  mapa ⇒ `key === null` ⇒ gate devolve `null` ⇒ segue para o provedor pago mesmo com
  `ai.capability.copilot_live` desligada (semeada DESLIGADA em
  `supabase/migrations/20261115010000_copilot_live_motor.sql:38`).
- Não foi remoção proposital: `git log -S'"ai-objection-handler": "copilot_live"' origin/main --
  supabase/functions/_shared/ai-feature-flags.ts` → vazio (nunca existiu na main). As 7 edges entraram
  pela PR #2834 (`7ce81c015`, 2026-11-10) sem o trecho do mapa.
- Encaixa no código atual: o mapa, `aiCapabilityFlagKey`, `capabilityFlagKeyForFunction` e
  `supabase/functions/_shared/__tests__/ai-feature-flags.test.ts` existem na main sem mudança de API.
  Diff a portar = 8 linhas (`git diff <MB> origin/claude/feat-copiloto-edges-261101-1330 --
  supabase/functions/_shared/ai-feature-flags.ts`), aplica limpo após a linha 77.

### Lacuna 2 — visão recebe URL de bucket privado: CONFIRMADA (valor alto)
- `origin/main:supabase/functions/ai-multimodal-analysis/index.ts:67-68` →
  `type: "image_url", image_url: { url: imageUrl }` com `imageUrl` cru do corpo
  (`:37`, schema `AiMultimodalAnalysisSchema` em `_shared/schemas.ts:200-205`, só `z.string().url()`).
- O próprio helper da main documenta por que isso não funciona:
  `origin/main:supabase/functions/_shared/ai-image-input.ts:1-12` — "o bucket `whatsapp-media` é
  **PRIVADO** (medido: `public=false`) e 971 de 971 figurinhas guardam URL `/object/public/...`, que
  devolve HTTP 400 para terceiros — o modelo NÃO consegue buscar a imagem".
- Não foi removido: `git log -S'toInlineImage' origin/main -- supabase/functions/ai-multimodal-analysis/`
  → vazio.
- Encaixa: `toInlineImage` + `AiImageInputError` existem na main (`ai-image-input.ts:308`) e já são
  usados sob identidade do chamador em `classify-sticker/index.ts:95-110` e `classify-emoji/index.ts:88`
  — padrão pronto para copiar.
- Ressalva de execução (o porte NÃO é cherry-pick): a versão da branch é pré-contrato (sem `parseBody`
  /`parseModelOutput`) e usa `mediaUrl`/`mediaType`; a main usa `imageUrl`/`context`. Portar apenas o
  download inline (`toInlineImage` com `storageIdentity` do bearer + anon key) e o erro tipado
  (422/415) DENTRO da versão da main, preservando `AiMultimodalAnalysisSchema` e
  `MultimodalAnalysisEnvelope`.

### Hunks que examinei e confirmo como descartáveis
- `.github/workflows/ci.yml`: a branch **remove** o job `edge-contracts` e o tira do `needs` do CI Gate
  (`git diff <MB> <REF> -- .github/workflows/ci.yml`). A main tem o job separado; portar seria regressão.
- `src/hooks/inbox/useInboxBulkActions.ts`: a main é a versão superior — também exclui contato já
  `archived` do alvo (comentário "Contato já 'archived' é excluído…" em `origin/main`), o que a branch
  não faz. Mesmo caso no teste `__tests__/useInboxBulkActions.test.ts`.
- `src/hooks/copilot/useMultimodalAnalysis.ts` (novo na branch) e as versões de branch dos 6 hooks
  RADAR: contrato incompatível com a edge da main (`mediaUrl`/`mediaType` vs `imageUrl`/`context`);
  a main já tem a camada AI — `useObjectionHandler.ts:121`, `usePriceAnchoring.ts:60`,
  `useLossRiskDetector.ts:98`, `useDeadlineCalculator.ts:86`, `useLeadThermometer.ts:65`,
  `useProductRecommendation.ts:52-56` (invokeEdge `ai-product-recommendation`), `useImageAnalysis.ts:41`.
- `ESTADO.md` e `supabase/deployment-manifest.json`: inventário/manifesto gerado, regenerado por
  automação — sem valor de recuperação.

### Lacuna adicional (valor BAIXO, não muda o veredito)
- `origin/main:src/hooks/copilot/index.ts` não exporta `useProductRecommendation` (o arquivo existe em
  `src/hooks/copilot/useProductRecommendation.ts` e **nenhum** outro arquivo da main o importa —
  `git grep -ln useProductRecommendation origin/main -- src` devolve só o próprio arquivo). A branch
  adiciona o export. É higiene de barril sobre hook órfão: exportar não integra a feature (nenhuma UI
  consome), então não vale um PR sozinho.

### apagar_branch_seguro: false — concordo
As duas lacunas só existem nesta branch (tip `c5bac6ad2`); apagar antes do porte perde o trecho de
referência. Além disso o item registra `prs_with_same_tip: [2460]`.
