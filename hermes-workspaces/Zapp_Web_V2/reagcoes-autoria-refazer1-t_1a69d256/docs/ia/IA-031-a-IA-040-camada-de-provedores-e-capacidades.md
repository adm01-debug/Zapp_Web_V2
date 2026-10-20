# Bloco 04 — Camada única de provedores e modelos (IA-031..IA-040)

**P1 do plano** — [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md)
(seção "Bloco 04", linhas 256-326). Dependências declaradas pelo plano: IA-011, IA-016, IA-017, IA-021,
IA-025.

O bloco entrega a **camada única de provedores**: roteamento determinístico decidido no servidor,
capacidades declaradas por provedor, fallback explícito e autorizado, teste do provedor realmente
escolhido, despacho central para as 6 capacidades de texto (fim do gateway fixo) e visão por modalidade
com imagem embutida. Entregue em **4 PRs**. Este bloco **não tinha documento de plano próprio** em
`docs/ia/`: o plano é o de 200 etapas (ver §Limites).

## O que muda para quem usa

1. **A escolha do provedor deixa de ser arbitrária.** O `ai-proxy` antigo fazia `limit(1)` sem `ORDER BY`:
   com dois padrões conflitantes o provedor escolhido era o que o banco devolvesse. Agora a resolução por
   finalidade exige **um** provedor ativo/padrão para a finalidade; zero → `NO_PROVIDER` (503), dois ou
   mais → `AMBIGUOUS_PROVIDER` (503); provedor pedido mas inativo → `PROVIDER_INACTIVE` (409). Nunca há
   sorteio pela ordem do banco.
2. **O modelo passa a ser decidido no servidor.** O `model` enviado pelo navegador só vale se o
   administrador o colocou em `config.allowed_models`; caso contrário é ignorado e a substituição fica
   registrada (`modelSubstituted`). Cliente antigo não força modelo incompatível.
3. **A política de sistema entra como mensagem própria na posição 0**, sem mutar nem apagar os `system`
   do cliente (que deixam de ser a primeira mensagem), e o conteúdo multipart (partes imagem+texto) é
   pass-through puro.
4. **Campos reservados e allowlist.** `config`/`extra_body`/`headers` de origem não confiável são
   filtrados: `model`, `messages`, `system`, `tools`, `role`, `streaming`… não sobrescrevem a decisão do
   servidor; cabeçalhos ficam restritos a uma allowlist (sem `Authorization`/`Content-Type`/`Cookie`).
5. **O gateway fixo acaba.** O helper antigo com o endereço do Lovable *hardcoded* sai dos consumidores;
   as 6 capacidades de texto passam pelo despacho central `generateWithRouting`, que resolve provedor e
   modelo no servidor.
6. **Visão por modalidade.** Classificadores de figurinha/emoji deixam de depender de URL pública
   (`whatsapp-media` é **privado**): a imagem é baixada no servidor com service role e embutida como data
   URL base64, limitada a 4 MiB.

## PRs

| PR | SHA do merge | Data | Etapas | O que entregou |
|---|---|---|---|---|
| #1434 | `bb0252322f873bd1563847cdc50b1ee5e84897b7` | 01/10/2026 18:10Z | IA-031, IA-034, IA-035, IA-037, IA-038 | Roteamento determinístico de provedores e modelo no servidor. `_shared/ai-routing.ts` (novo), `ai-proxy/index.ts`, `_shared/ai-providers.ts`, `tests/contracts/ai-routing.contract.test.ts` |
| #1444 | `9e8efaa5b6640fe4af78d029347bf869c3dc974b` | 01/10/2026 18:56Z | IA-036, IA-039, IA-040 | Capacidades declaradas, fallback explícito e teste do provedor real. `_shared/ai-capabilities.ts` (novo), `ai-proxy/index.ts`, `useAIProviders.ts`, 2 contratos novos |
| #1465 | `bb876da6ea45b4c165483ef328d355168c3ded99` | 01/10/2026 22:07Z | IA-032 (completa IA-031) | Despacho central para as 6 capacidades de texto e fim do gateway fixo. `_shared/ai-generate.ts` (novo, `generateWithRouting`); `callAiWithTracking` removido de `_shared/ai-usage.ts`; `tests/contracts/ai-central-routing-ratchet.contract.test.ts` |
| #1487 | `ac33793e1dc21ec2f21ee39d08b03bbaf26744e0` | 01/10/2026 23:53Z | IA-033 | Visão por modalidade e imagem embutida. `classify-sticker`, `classify-emoji`, `_shared/ai-image-input.ts` (novo) |

Cada SHA acima é o commit de merge na `main`, medido no GitHub.

## Etapas: o que foi feito e onde

### IA-031 / IA-034 / IA-035 / IA-037 / IA-038 — PR #1434

`supabase/functions/_shared/ai-routing.ts` é um **módulo puro** (sem `Deno.env`, sem `fetch`, sem I/O),
importável direto no vitest; o contrato `tests/contracts/ai-routing.contract.test.ts` declara
explicitamente as etapas que trava (cabeçalho: "Etapas: IA-031, IA-034, IA-035, IA-037, IA-038").

- **IA-031 (roteamento central por capacidade):** `resolveProvider(rows, purpose, providerId?)` — pedido
  explícito do painel exige linha existente e ativa; sem `providerId`, filtra ativo + finalidade + padrão;
  zero → `NO_PROVIDER`, 2+ → `AMBIGUOUS_PROVIDER`. Finalidade inválida → `BAD_PURPOSE`.
- **IA-034 (padrão por finalidade):** a mesma requisição resolve a mesma configuração; ausência de padrão
  vira indisponibilidade explícita, não escolha arbitrária.
- **IA-035 (modelo no servidor):** `resolveModel(provider, requestedModel?)` — o modelo efetivo vem de
  `provider.model` (ou do default por `provider_type`); o pedido do cliente só vence se estiver em
  `config.allowed_models`. `google_gemini` nunca aceita o modelo do cliente (só fala o dialeto OpenAI para
  um conjunto fixo de nomes).
- **IA-037 (composição de prompts):** `composeMessages(serverSystemPrompt, messages)` põe a política na
  posição 0 e mantém **todas** as mensagens do cliente na ordem original (cópia rasa, sem mutar a
  entrada).
- **IA-038 (campos reservados):** `RESERVED_BODY_KEYS`, `ALLOWED_CONFIG_BODY_KEYS`, `ALLOWED_HEADER_NAMES`;
  `filterConfigBody`, `filterExtraBody` (comparação sem caixa) e `filterHeaders` (allowlist,
  case-insensitive).

O contrato também prova **por leitura de fonte** a fronteira em `ai-proxy/index.ts` e
`_shared/ai-providers.ts`: que os defeitos medidos (spread cru de `config` no corpo, `clientModel ||
provider?.model`, fallback inventado, headers sobrescrevendo `Authorization`) não voltaram.

### IA-036 / IA-039 / IA-040 — PR #1444

`supabase/functions/_shared/ai-capabilities.ts` é o segundo módulo puro do bloco.

- **IA-036 (capacidades declaradas):** `BASE_CAPABILITIES` (congelado) garante por tipo só o núcleo
  (`text` + `tools/json/streaming` para nativos/compatíveis; `custom_webhook`/`custom_agent` só `text`);
  `config.capabilities.modalities` **adiciona** modalidades não-texto (vision/áudio); `features` do config
  apenas **filtram** a base; `limits` vêm só de `config.limits` (positivos e finitos). `assertCapabilities`
  lança `UNSUPPORTED_MODALITY` / `UNSUPPORTED_FEATURE` / `LIMIT_EXCEEDED` / `UNDECLARED_LIMIT` **antes** do
  dispatch; ausência de limite declarado não é permissão. O contrato
  `tests/contracts/ai-capabilities.contract.test.ts` cobre cada item.
- **IA-039 (fallback explícito):** `config.allow_fallback === true` é condição **necessária** e o destino
  efetivo é informado — sem troca silenciosa para fornecedor não aprovado (contrato
  `tests/contracts/ai-fallback-and-test.contract.test.ts`).
- **IA-040 (testar o provedor escolhido):** no modo teste (`test === true`) o fallback fica **desligado** e
  `provider_id` é obrigatório, para que teste falho nunca apareça como sucesso do provedor original por
  resposta de outro serviço.

`useAIProviders.ts` (painel) acompanha a declaração de capacidades.

### IA-032 — PR #1465

`supabase/functions/_shared/ai-generate.ts` (`generateWithRouting`) é o despacho central: carrega
`ai_providers` com service role, resolve provedor por finalidade, exige capacidades quando `need` é
informado, decide o modelo no servidor (`resolveModel(provider, null)`), compõe a política do servidor,
filtra `extraBody`, despacha por `provider_type` reusando `_shared/ai-providers.ts` com `withRetry` e
**registra o uso em todos os desfechos** (`logAiUsage`). O ratchet
`tests/contracts/ai-central-routing-ratchet.contract.test.ts` prova o aceite "trocar o provedor da
finalidade altera todas as chamadas": os 6 consumidores migrados são `chatbot-l1`, `ai-auto-tag`,
`ai-suggest-reply`, `ai-enhance-message` e `_shared/ai-conversation-pipeline.ts` (que serve resumo e
análise), com `ai-conversation-summary` e `ai-conversation-analysis` fazendo par. O contrato também exige
que nenhum deles volte a fixar o modelo (`google/gemini-3-flash-preview`), carregue `LOVABLE_API_KEY` ou
referencie `callAiWithTracking` — e que `logAiUsage`/`extractTokenUsage` continuem exportados.

`callAiWithTracking` foi **removido** de `_shared/ai-usage.ts`; no repositório ele só aparece nos testes,
como asserção de ausência (confirmado por busca no workspace).

### IA-033 — PR #1487

- `_shared/ai-image-input.ts` (novo) converte a URL que o app envia numa imagem **embutida**: `data:` pronto
  volta como está; URL de Storage do próprio projeto vira leitura autenticada
  (`/storage/v1/object/<bucket>/<path>` + service role, nunca `/object/public/`); origem de outro projeto,
  bucket fora da allowlist (`whatsapp-media`, `stickers`, `custom-emojis`), travessia de caminho, tipo
  não-imagem, objeto vazio ou imagem acima de `MAX_INLINE_IMAGE_BYTES` (4 MiB) falham com erro **tipado**
  (`AiImageInputError`). O limite é conferido no `content-length` **e** confirmado nos bytes reais.
- `classify-sticker` e `classify-emoji` passam a exigir a modalidade `vision` pelo despacho central e a
  degradar para `outros` (sem 500) em falha do provedor/Storage.
- A resolução por modalidade (`resolveProviderByModalities`) escolhe entre linhas **ativas** que declaram
  todas as modalidades exigidas, **sem** depender de `is_default` (o DeepSeek segue dono do texto); nenhum
  candidato → `NO_PROVIDER`; mais de um → `AMBIGUOUS_PROVIDER`.
- Migration aditiva `supabase/migrations/20260930780000_ia033_visao_openrouter.sql`: habilita a visão na
  linha do provedor OpenRouter (`capabilities.modalities: ["vision"]`, merge JSONB que preserva os headers
  existentes) e grava o modelo `google/gemini-3.8-flash`. **Decisão do provedor de visão:** GEMINI FLASH via
  OpenRouter, id `google/gemini-3.8-flash` (confirmado na API de modelos do OpenRouter, 464 modelos,
  `created=1788362056`); o DeepSeek permanece o padrão de texto.

## Provas

**Contratos em `tests/contracts/` (arquivos lidos no workspace; a contagem é o número de casos `it`/`test`
no arquivo):**

| Contrato | Casos | Cobre |
|---|---|---|
| `ai-routing.contract.test.ts` | 41 | IA-031/034/035/037/038 (comportamento + fronteira de fonte) |
| `ai-capabilities.contract.test.ts` | 28 | IA-036 |
| `ai-fallback-and-test.contract.test.ts` | 11 | IA-039 / IA-040 |
| `ai-generate.contract.test.ts` | 33 | Despacho central (IA-032/IA-035/IA-038) |
| `ai-central-routing-ratchet.contract.test.ts` | 13 | Aceite do IA-032 (anti-regressão do gateway fixo) |
| `ai-vision-modality.contract.test.ts` | 11 | IA-033 (resolução por modalidade) |
| `ai-image-input.contract.test.ts` | 20 | IA-033 (imagem embutida) |
| `ai-vision-classifiers-mock.contract.test.ts` | 20 | IA-033 (degradação dos classificadores) |

**Prova real de visão (IA-033), com a conta COMPRAS:**

| Prova | Resultado medido |
|---|---|
| Login HTTP da conta COMPRAS | HTTP 200 |
| Figurinhas reais classificadas | 4 classificadas como `amor` |
| Emoji | classificado como `amor` |
| Linhas novas em `ai_usage_logs` | 9, com `status=success` e `model=google/gemini-3.8-flash` (OpenRouter) |
| Imagem embutida | `input_tokens=1185` numa chamada, provando a imagem no corpo |
| Achado declarado | 5 das 6 figurinhas voltaram `outros` (WebP animado de 101 frames) |

**Integridade de deploy:** em cada PR que tocou `supabase/functions/**`, o `deployment-manifest.json` foi
regenerado e os arquivos-chave foram conferidos **byte-idênticos** à `main` depois do merge (`git diff`
vazio) — declarado pela execução. O manifesto lido neste workspace mede 69 funções / 132 fontes de código.

## Limites e o que não foi provado

- **`system_prompt` permanece NULL por decisão do dono do produto.** A etapa IA-037 está **correta mas
  inerte** no estado atual: sem política gravada na linha do provedor, `composeMessages` devolve as
  mensagens do cliente como estão, sem inserir `system`.
- **O fallback automático entre provedores está desligado na prática.** Ele exige autorização explícita na
  linha do provedor (`config.allow_fallback === true`) e, no estado medido, **nenhuma** das linhas declara
  isso.
- **O Bloco 04 não tinha documento de plano próprio** em `docs/ia/`; o plano de referência é o de 200
  etapas (`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`).
- **Prova de runtime só existe para a visão (IA-033)**, com a conta COMPRAS acima. As demais etapas têm
  prova de contrato (testes) e de leitura de fronteira; não houve, neste bloco, prova de runtime das 6
  capacidades de texto em produção.
- **O "inventário pinado em 145" do PR #1434 está localizado** — verificado em 02/10/2026: é o ratchet
  `tests/contracts/_adv_edge_legacy_producers.test.ts`, cujo cabeçalho lista a linha `145: Bloco 04`
  associada a `_shared/ai-routing.ts`. O pino conta o inventário de produtores legados, não funções nem
  fontes do manifesto.
- **6 testes de `scripts/ci/*.unit.mjs` não rodam no ambiente local do executor** porque fazem `git init`
  (bloqueado por guarda). É limitação de ambiente, não falha do código.

## Achados fora do escopo (não corrigidos)

- **5 das 6 figurinhas reais voltaram `outros`** na prova com a conta COMPRAS. O motivo medido é o formato
  **WebP animado de 101 frames**: a classificação de visão não recorta um frame, então o modelo não
  recebe uma imagem estática reconhecível. Registrado como medição; não corrigido neste bloco.
