# IA-003 — Registro rastreável de achados

**Etapa do plano:** `IA-003` `[V]` *Abrir registro rastreável de achados* — "Classificar ocorrências como
defeito demonstrado no código, risco a reproduzir, dependência externa ou proposta; anexar caminho e
reprodução esperada."
**Aceite:** cada correção tem hipótese, impacto, evidência e teste de regressão definidos.

## Como classificar (usado nas tabelas)

| Classe | Significado | Fecha com PR? |
|---|---|---|
| **D** | **Defeito demonstrado no código** — o trecho que causa o dano foi lido; `arquivo:linha` aponta o comando. | sim, com teste que falha antes e passa depois |
| **R** | **Risco a reproduzir** — o código sugere o problema, mas depende de estado/ambiente para se confirmar. | sim, depois de reproduzir (ou reportado como não reproduzido) |
| **X** | **Dependência externa** — depende de terceiro, painel, grant de outro sistema ou aprovação humana. | não; vira pedido em bloco |
| **P** | **Proposta** — capacidade nova, sem defeito associado. | sim, mas o aceite de qualidade exige homologação |

Evidência dos inventários: `IA-002-inventario-functions-ia.md`, `IA-002-inventario-frontend-ia.md`,
`IA-004-matriz-autorizacao.md`, `IA-006-natureza-e-verificacao-dos-achados.md`,
`IA-007-reuso-infraestrutura.md`. Os itens marcados **✓ li o código** foram conferidos por mim na
referência congelada (`0ab84095`), não só pelo inventário.

## A. Os 10 achados que o plano usou para priorizar

| # | Achado (resumo) | Classe | Evidência | Impacto | Bloco |
|---|---|---|---|---|---|
| A1 | Roteamento configurável **e** chamadas fixas ao gateway em paralelo | D | `_shared/ai-usage.ts:115` (gateway fixo) × `_shared/ai-providers.ts:21` (provedor do cadastro) | trocar provedor não troca todas as chamadas; custo/quota divergentes | 04 |
| A2 | Normalizações divergentes de sentimento/prioridade | D | inventário frontend (P13) + `useContactIntelligence.ts` | mesmo sentimento com significados diferentes entre telas | 03 |
| A3 | Resultado do backend não aplicado em churn/classificação | D | inventário frontend (churn/categoria) | painel mostra número recalculado no cliente, não o analisado | 12 |
| A4 | Perda de campos no histórico de análise | D | `_shared/schemas.ts` + persistência da análise | reabrir o histórico não reproduz a análise aceita | 03 |
| A5 | Fontes gerenciais insuficientes | D | consultas do supervisor limitadas | resposta gerencial sem base reproduzível | 12 |
| A6 | Quota **não atômica** | D ✓ li o código | `_shared/ai-guards.ts:34-56`: rate limit **em memória por isolate** + quota por `count` em `ai_usage_logs` (check-then-act), e **fail-open** em erro de infra | chamadas paralelas furam o teto; N workers multiplicam o limite | 05 |
| A7 | Registro incompleto de streaming | D | `ai-proxy` (streaming) sem ledger de uso | consumo pago não aparece no relatório | 06 |
| A8 | Classificação de áudio por nome/URL | D | `classify-audio-meme`, `classify-emoji`, `classify-sticker` | classificação por heurística do nome, não pelo conteúdo | 14 |
| A9 | `elevenlabs-webhook` em **modo de observação** | D ✓ li o código | `elevenlabs-webhook/index.ts:14-19` chama o helper de assinatura e **ignora** o resultado; `_shared/hmac-validation.ts:260-262` declara que o helper nunca bloqueia; `index.ts:35-43` grava o corpo cru em `audit_logs` com service role | endpoint público: poluição de `audit_logs`, spoofing de evento de faturamento, gravação de payload arbitrário | 02 |
| A10 | Sem autorização por objeto no download de áudio | D ✓ li o código | `ai-transcribe-audio/index.ts:41-51`: valida só origem + bucket da allowlist e baixa com `service_role`; `messageId` recebido (`:104`) **não** é usado para checar posse | quem conhece o caminho de um objeto de bucket privado baixa e transcreve áudio de outro | 02 |

Os 10 estão marcados **CONFIRMADO** no `IA-006-natureza-e-verificacao-dos-achados.md`; A6, A9 e A10 eu
confirmei lendo o código.

## B. Achados adicionais (levantados nos inventários desta execução)

| # | Achado | Classe | Evidência | Impacto | Bloco |
|---|---|---|---|---|---|
| B1 | **4 funções de IA paga sem identidade, sem cota e sem rate limit em código**: `voice-agent`, `classify-audio-meme`, `classify-emoji`, `classify-sticker`. O único gate é o `verify_jwt` do gateway, que aceita a **anon key pública** do bundle; o próprio front manda essa chave. | D | `voice-agent/index.ts:84-99`, `classify-audio-meme:11-28`, `classify-emoji:12-29`, `classify-sticker:11-27`; `src/integrations/supabase/client.ts:13`; `src/hooks/voice/processTranscript.ts:12-18` | consumo pago por qualquer portador da chave pública, sem usuário, sem trilha | **02** |
| B2 | Bypass de serviço em `ai-transcribe-audio` por comparação **`===`** com a service role key (não constant-time) e sem cota nesse caminho | D | `ai-transcribe-audio/index.ts:69-72` | caminho privilegiado; vazamento de tempo do segredo e ausência de limite | 02 |
| B3 | `elevenlabs-voice-design` **cria voz persistente na conta compartilhada** da empresa, sem dono no banco e sem checagem de papel | D | `elevenlabs-voice-design/index.ts:56-60`, `:75-77` | qualquer usuário autenticado altera recurso da conta; sem rastro de autoria | 02/13 |
| B4 | Cliente escolhe **voz e modelo** de TTS/STS e `voice_id` livre no diálogo (`elevenlabs-tts`, `-tts-stream`, `-sts`, `-dialogue`) | D | `schemas.ts:57-58,71` → `elevenlabs-tts/index.ts:23-24`, `-tts-stream:24-25`, `-sts:21-27,36` | pode acionar voz clonada e modelo mais caro; sem allowlist | 13 |
| B5 | `ai-proxy` aceita `provider_id` e `model` **do cliente** | D | `ai-proxy/index.ts:17-19,54,85,139` | escolha de destino/modelo pelo navegador → custo e política fora do controle | 04 |
| B6 | Consumo pago **não registrado** fora das 7 funções que usam `callAiWithTracking`: todas as `elevenlabs-*`, `voice-agent`, `classify-*`, `ai-transcribe-audio` | D | inventário functions §(c) | relatório de custo subestima; sem base para alerta (IA-058) | 06 |
| B7 | Teste do CI fixa o comportamento **inseguro** como esperado (`webhook-auth-shadow.test.ts` garante que a assinatura **não** bloqueia) | D | `_shared/__tests__/webhook-auth-shadow.test.ts:105-118`, `ci.yml:87` | consertar A9 exige mudar o teste junto — senão o CI protege o defeito | 02 |
| B8 | `feature_flags` é lida **só no frontend** — desligar no cliente não impede efeito no servidor | D ✓ li o código | `grep -rn feature_flags supabase/functions` = vazio; `src/hooks/system/useFeatureFlag.ts` | kill switch não é operável no servidor sem deploy | 05/11 (ver `IA-009`) |
| B9 | `ai-churn-analysis` e `ai-classify-tickets` **não gastam provedor** (heurística/regras) mas passam por `enforceAiGuards` e portanto consomem cota de usuário | R | inventário functions §(c) | usuário pode ficar sem cota de IA real por causa de cálculo local | 12 |
| B10 | Departamento "somente leitura" não existe no modelo (`admin`/`supervisor`/`agent`) | X | banco canônico: `user_roles` (3 papéis) | o aceite de IA-015 (perfil só-leitura) não é demonstrável hoje | 02 + decisão sua |

## C. O que cada correção precisa provar (contrato de teste)

| Achado | Prova exigida (red-first) |
|---|---|
| A9/B1/CORS de webhook | requisição com assinatura **inválida** e requisição **sem JWT** → **4xx antes de qualquer gravação**; contagem de `audit_logs` inalterada (vermelho antes: hoje grava e responde 200) |
| A10 | usuário B (autenticado, sem vínculo) pedindo transcrição de áudio do usuário A → **negado**; usuário A → sucesso. Asserção sobre a checagem de posse, não sobre o mock |
| B1 | as 4 funções respondem 401 sem JWT válido e 401 com **anon key** como bearer; nenhuma chama `ai.gateway.lovable.dev` nesse caminho |
| B3/B4 | lista fechada de vozes/modelos aceitos; voz fora da lista → 400; criação de voz exige papel e fica auditada |
| A6 | N execuções paralelas do mesmo usuário não ultrapassam o teto (prova com contador compartilhado, não com memória do isolate) |
| B6 | toda chamada paga gera linha no ledger de uso — teste que falha se alguma função de provedor não registrar |

## D. Lacunas declaradas (não verificadas nesta etapa)

- Estado **real de produção** (grants do CRM externo, secrets existentes, quais funções estão de fato
  publicadas): só por acesso do Joaquim — IA-018 e IA-191.
- Contagem de `audit_logs` e volume de eventos do `elevenlabs-webhook` em produção: não consultado (a
  prova de impacto exige leitura do banco canônico, que é possível porém fora do escopo de evidência
  estática do Bloco 01).
- Comportamento do gateway do Supabase ao receber **anon key** em função `verify_jwt=true`: é a hipótese
  central de B1 e será provada em ensaio no Bloco 02 (com o método do "gate aceita anon key" ou não)
  antes de eu afirmar que a função está publicamente acessível.

## E. Aceite da etapa

- [x] Ocorrências classificadas (D/R/X/P) com caminho e reprodução esperada.
- [x] Cada correção com hipótese, impacto, evidência e teste de regressão definidos (seção C).
- [x] Achados fora dos 10 do plano também registrados (seção B) — nenhum será corrigido "de passagem".
- [x] Lacunas declaradas em vez de presumidas (seção D).

## F. Correções entregues contra este registro

| Achado | Correção | Onde | Prova |
|---|---|---|---|
| A9 | Assinatura do webhook da ElevenLabs passa a ser **bloqueante** (secret obrigatório, timestamp com tolerância, HMAC em tempo constante) e o corpo cru deixa de ser gravado | `_shared/webhook-signature.ts`, `elevenlabs-webhook/index.ts` | 11 casos em `__tests__/webhook-signature.test.ts` + contrato de origem; mutação "aceitar sem secret" quebra 2 testes |
| A10 | Áudio só é baixado depois de provar visibilidade da **mensagem** com o JWT do chamador; `media_url` do registro vira a fonte do objeto | `_shared/ai-audio-authz.ts`, `ai-transcribe-audio/index.ts` | 4 casos em `__tests__/ai-audio-authz.test.ts` + contrato (checagem antes do download) |
| B1 | As 4 funções de IA paga sem identidade passam a exigir sessão verificada + cota, recusando a identidade de serviço | `_shared/ai-auth.ts` + `voice-agent`, `classify-*` | 7 casos em `__tests__/ai-auth.test.ts`; mutação "serviço passa como usuário" quebra 1 teste |
| B2 | Comparação da service role key deixa de ser `===` (tempo constante) e o caminho de serviço ganha limite por IP | `_shared/ai-auth.ts` (`isServiceRoleRequest`, `requireAiIdentityOrService`) | casos de prefixo/sufixo/case em `__tests__/ai-auth.test.ts` |

Registro completo do bloco: [`IA-011-a-IA-020-contencao-P0.md`](./IA-011-a-IA-020-contencao-P0.md).
O teste do CI que fixava o comportamento inseguro (B7) **não** foi alterado: ele descreve os outros três
webhooks (Evolution, WhatsApp, Gmail), que seguem em modo sombra — o caminho bloqueante novo tem testes
próprios.

## G. Verificação adversarial do Bloco 02 (29/09) e correções do lote B

Cinco verificadores independentes tentaram derrubar as alegações do lote A (`92cd8952`). Laudo completo,
com evidência crua e o que **não** foi provado: [`IA-011-a-IA-020-verificacao-adversarial.md`](./IA-011-a-IA-020-verificacao-adversarial.md).

| Achado | O que era | Correção (lote B) |
|---|---|---|
| A1 (crítico) | o cliente do `voice-agent` mandava a **anon key pública**; com o endpoint endurecido, o comando de voz responderia 401 para 100% dos usuários | `useVoiceAgent` resolve `supabase.auth.getSession()` e envia o access token |
| A2 (alto) | `classify-sticker` devolvia **403** ao webhook interno do WhatsApp (service role) → figurinha nova perdia a categoria em silêncio | passa a usar `requireAiIdentityOrService` |
| F1 (baixo) | header de assinatura com `v0` repetido era resolvido por "último vence" | header ambíguo é recusado |
| F4 (médio) | o contrato de ordem casava a **linha de import** → 4 mutações de ordem sobreviviam | contrato reescrito sem imports; mutação **4/4 detectada** |
| DB-F2 (médio) | nenhum teste provava a negação por RLS (só rejeições pré-banco) | teste de runtime: zero linhas ⇒ 404, visível ⇒ `media_url`, com o JWT do chamador na consulta |
| F3 / A3 / A6 | o texto do lote A dizia "sessão verificada **+ cota**" e "as outras 21 funções já tinham cota" | corrigido no registro do bloco — a cota é nominal hoje (A3/A6, bloco 06) |

Novos achados registrados aqui, **sem correção neste PR**:

| # | Achado | Tipo | Destino |
|---|---|---|---|
| B11 | `ai-conversation-summary/index.ts:219` compara `urgency === 'critical'` contra enum em português (`_shared/schemas.ts:138`) → `ai_priority` nunca vira `urgent` nesse caminho (o irmão `ai-conversation-analysis:266` usa `'critica'`) | defeito | bloco 03/07 |
| B12 | `src/hooks/system/useAIStats.ts:72-91` compara sentimento em inglês (`'positive'/'negative'`) enquanto o resto do front usa `'positivo'/'negativo'` (`AnalysisBadges.tsx:8-11`) | defeito | bloco 03 |
| B13 | `supabase/functions/ai-auto-tag/auth_test.ts` existe mas **não roda no CI** (lista fixa em `ci.yml`) | lacuna de teste | bloco 06 |
| B14 | A cota de IA é **nominal**: as funções corrigidas não registram consumo em `ai_usage_logs`; `enforceAiGuards` **falha aberto** em erro de infra; o rate limit é por isolate e usa IP do `x-forwarded-for`; **10 endpoints de IA paga** têm identidade sem cota | risco | bloco 06 |
| B15 | A RLS de `messages` **não filtra ciclo de vida** (`is_deleted`, `contacts.deleted_at`, `conversation_status`) e o bucket `audio-memes` é **público** estando na allowlist do transcritor. **Medido:** 12 mensagens apagadas ainda com mídia (de 49.318) e **1** `media_url` já apontando para o bucket público | risco | bloco 15 / 02 |

## H. Publicação do Bloco 02 em produção e achados da verificação (30/09)

Os dois defeitos do lote B estavam mergeados em `main` desde 29/09 mas **não estavam em produção**: o passo
`Deploy` do `deploy-functions.yml` concluía `success` sem publicar (`version` subia e o conteúdo não mudava —
o `elevenlabs-webhook` ficou em `version 225` com `updated_at` do deploy em massa). Publicado pelo CLI do
Supabase, do workspace em `main` (`49967551`), e verificado **baixando o fonte publicado**
(`supabase functions download`):

| Função | Defeito | Prova da correção em produção |
|---|---|---|
| `elevenlabs-webhook` | A9 — assinatura em modo sombra (qualquer anônimo gravava em `audit_logs`) | sonda com assinatura falsa: `200` antes → **`401`** depois; assinatura correta: `200`; fonte publicado chama `verifyElevenLabsSignature` |
| `classify-audio-meme` | IA-011/IA-012 — não exigia identidade | fonte publicado chama `requireAiIdentity` |

O secret `ELEVENLABS_WEBHOOK_SECRET` foi criado no projeto (`supabase secrets set`, 30/09 10:33Z) — sem ele a
função passa a falhar fechada e recusaria 100% dos eventos; o digest gravado confere com o valor do painel.

Novo achado, **sem correção neste PR**:

| # | Achado | Tipo | Destino |
|---|---|---|---|
| B16 | O insert em `audit_logs` do `elevenlabs-webhook` (`index.ts`) **ignora o `{error}`** e a escrita está falhando em silêncio: 2 sondas pós-deploy devolveram `200` e **zero linhas**, contra 2 linhas gravadas pelo código antigo às 10:35. Formato descartado (`audit_logs` só tem CHECK de `action` não-vazio; `service_role` tem `bypassrls=true`; a URL injetada está correta) — a credencial `SUPABASE_SERVICE_ROLE_KEY` injetada nas Edge Functions tem digest que não corresponde a nenhuma chave atual do projeto. | defeito (robustez + infra) | bloco 03 (logar o erro do insert) / decisão de infra do Joaquim |

Nota operacional: a fila de `deploy-functions.yml` é compartilhada entre chats e `Deploy: success` não prova
publicação — antes de declarar uma correção em produção, baixar o fonte publicado da função.
