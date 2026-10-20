# Revisão IA delegada — pipeline, classificadores e consumidores

Fonte: `da307ba5626dce892f0b37cb6762463f55d14a96`. Foram lidos integralmente os 12 arquivos primários (2692 linhas), com autenticação, entradas, saída, erros, efeitos, cancelamento e consumidores rastreados. A cobertura de suporte é declarada por faixa no JSON.

## Resultado

Quatro mecanismos novos: 1 P1 e 3 P2. A leitura privilegiada de imagem é um problema de autorização de objeto no ramo de usuário; autenticação e cotas existem. Os outros três tratam recência na projeção, contrato da resposta e preservação do rascunho. Nenhuma conclusão presume que a versão esteja publicada ou que o efeito já tenha ocorrido em produção.

| ID | Prioridade | Resultado |
|---|---|---|
| R2-INF-022 | P1 | Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário |
| R2-INF-023 | P2 | Revalidação de contexto fora da RPC deixa análise antiga substituir uma projeção concorrente |
| R2-INF-024 | P2 | Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação |
| R2-INF-025 | P2 | Reescrita atrasada substitui edição mais nova do mesmo rascunho |

## Gates e fronteiras conferidas

O gateway remoto não foi consultado. `supabase/config.toml` não declara exceção verify_jwt=false para estas rotas; a análise de alcance se apoia também nos gates internos observados. Os classificadores exigem usuário verificado; sticker permite adicionalmente token exato de serviço para o webhook. Analysis, summary, suggest e enhance verificam Auth e cotas. Churn e tickets usam getUser e cliente JWT. Chatbot tem ramo HMAC de serviço e ramo de usuário; não foi tratado como acessível anonimamente só pela existência do ramo HMAC.

A autorização por contato está presente nas capacidades de conversa que consultam contexto. Tickets lê tags com cliente RLS, não service role. Churn filtra IDs visíveis antes das leituras privilegiadas. O helper de imagem não possui essa verificação por objeto e por isso constitui caso distinto.

## Cobertura primária

| Arquivo | Gate/efeito principal | Consumidor |
|---|---|---|
| `supabase/functions/_shared/ai-conversation-pipeline.ts` | resolveVisibleContactId usa cliente do usuário; ausência/erro de consulta não libera contato. Helper espera autenticação do handler. A revalidação recebe callbacks; request.req não vira AbortSignal na chamada generateWithRouting. | ai-conversation-analysis; ai-conversation-summary |
| `supabase/functions/_shared/ai-image-input.ts` | Origem exata e buckets fixos; download usa service role, sem identidade/cliente RLS no contrato do helper. AbortController interno cobre fetch até headers; req.signal não entra; corpo é lido após clearTimeout. | classify-emoji; classify-sticker |
| `supabase/functions/ai-conversation-analysis/index.ts` | requireAuth, enforceAiGuards, 10/IP/min e cliente RLS para contato; service role apenas após visibilidade. Revalida contato e versão antes da RPC; cliente faz descarte lógico após await. Janela concorrente permanece no servidor. | src/components/inbox/AIConversationAssistant.tsx |
| `supabase/functions/ai-conversation-summary/index.ts` | requireAuth, enforceAiGuards, limite local por IP e visibilidade RLS de contato. Revalida antes da RPC; callback do frontend rejeita retorno antigo após contato/período mudarem, sem desfazer persistência já feita. | src/components/inbox/ConversationSummary.tsx |
| `supabase/functions/ai-churn-analysis/index.ts` | Token validado, guard de IA e IDs filtrados por cliente autenticado antes de leituras service role. Laço serial de consultas, sem sinal de cancelamento propagado. | src/components/ai/ChurnPredictionDashboard.tsx |
| `supabase/functions/ai-classify-tickets/index.ts` | getUser, guard de IA e consulta direta de tags pelo callerClient submetida à RLS, sem cliente service role nesse handler. Sem AbortSignal ou efeito persistente do handler; consultas e retorno podem terminar após desmontagem. | src/components/ai/AutoTicketClassifier.tsx |
| `supabase/functions/ai-enhance-message/index.ts` | requireAuth, enforceAiGuards e 20/IP/min; não consulta objeto privado. Sem req.signal; os dois consumidores examinados aplicam após await sem verificar geração de rascunho/contato. | src/components/inbox/chat/AIEnhanceButton.tsx; src/components/inbox/chat/AIRewriteButton.tsx |
| `supabase/functions/ai-suggest-reply/index.ts` | requireAuth e guard, contato RLS antes do contexto service role; artigos publicados são contexto adicional. Cliente rejeita retorno por geração/contato após await; Edge não persiste e não recebe AbortSignal para provedor. | src/components/inbox/AISuggestions.tsx |
| `supabase/functions/chatbot-l1/index.ts` | Ramo HMAC de serviço ou requireAuth+guard; assinatura de serviço não equivale a endpoint anônimo sem gateway. Configuração remota não medida. Sem cancelamento de provedor; esta rota não prova envio automático nem transferência efetiva. | src/components/settings/ChatbotL1Config.tsx |
| `supabase/functions/classify-audio-meme/index.ts` | requireAiIdentity; identidade verificada antes do provedor. Timeout passado ao dispatcher, sem req.signal; limites centrais ficam na área providers. | src/hooks/communication/useAudioMemes.ts; src/components/settings/media-library/useMediaUpload.ts; src/components/settings/media-library/useMediaLibrary.ts |
| `supabase/functions/classify-emoji/index.ts` | Autenticação e cotas presentes; ausência de autorização de leitura por objeto no ramo usuário. 15s declarado ao download/dispatcher; req.signal não é propagado. | src/hooks/integrations/useCustomEmojis.ts; src/components/settings/media-library/useMediaUpload.ts; src/components/settings/media-library/useMediaLibrary.ts |
| `supabase/functions/classify-sticker/index.ts` | requireAiIdentityOrService; service key comparada pelo helper, cotas por usuário ou limiter de serviço. 15s declarado ao helper/dispatcher, sem vínculo ao AbortSignal da requisição. | src/hooks/sticker-picker/useStickerPicker.ts; supabase/functions/_shared/evolution-webhook-messages.ts; src/components/settings/media-library/useMediaLibrary.ts |

## Provas e alcance

Os 12 arquivos usados nos probes e o compilador TypeScript tiveram SHA256 conferido antes do import. Os módulos avaliados receberam apenas dependências locais revisadas e fixtures; fetch global foi bloqueado. Não foram carregados os handlers Deno, SDKs, React nem Zod remoto.

| Probe | O que executou | Limite |
|---|---|---|
| INF-AI-P01 | toInlineImage e parser reais com imagem sintética e fetch injetado | Não executa RLS, Storage ou provedor; prova conversão privilegiada do locator e confere controles de origem/bucket. |
| INF-AI-P02 | Funções reais de revalidação e barreira assíncrona | O UPDATE é modelo explícito do predicado SQL pinado, sem PostgreSQL. Controle com snapshot atualizado cancela. |
| INF-AI-P03 | Bloco real de parse/fallback extraído por AST | Sem modelo; o erro de render é inferido do shape entregue ao consumidor .map, não sessão de browser. |
| INF-AI-P04 | Dois callbacks reais de reescrita, retorno retardado e setter sintético | Mesma conversa, componente ainda montado; sem React/DOM nem envio. |

Os resultados estão em `ai-review-probes.json`; script em `probe-ai-review.mjs` e pins em `ai-review-probe-pins.json`. As quatro provas passaram suas assertivas. Isso não é resultado de produção, teste E2E ou certificação de todo o dispatcher.

## Achados e critérios de aceite

### R2-INF-022 — Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário

classify-emoji autentica o usuário; classify-sticker aceita usuário ou serviço. No ramo de usuário, ambos passam image_url diretamente a toInlineImage. O helper verifica origem, bucket e path, mas baixa o objeto com SUPABASE_SERVICE_ROLE_KEY sem conferir permissão de leitura do usuário, mensagem visível ou vínculo a uma figurinha compartilhada. A allowlist inclui whatsapp-media, que as migrations mantêm privado e sujeito a SELECT por atribuição/visibilidade. Os bytes são embutidos no pedido ao provedor de visão; userId é usado em cota/log, não na autorização do download.

**Precondições:** Usuário válido, não autorizado pela policy a ler determinado objeto privado de whatsapp-media, conhece seu locator/path. O objeto existe, é imagem aceita pelo helper e há provedor de visão configurado para completar a classificação. A versão publicada corresponde ao caminho versionado analisado; essa condição não foi medida remotamente.

**Efeito:** Permite processamento de mídia privada além da permissão do chamador e envio desses bytes ao provedor configurado. A resposta permite inferir a categoria da imagem; não devolve o arquivo bruto, nem demonstra extração integral do conteúdo para o chamador.

**Evidência no fonte:**

- `supabase/functions/classify-emoji/index.ts:40–70` — Identidade validada, mas helper da imagem não recebe autorização do objeto; SHA256 `17398afb5f1a1e4caf8c8e6ecbd3ef00dfb0230f260085a735978f5f60df0e88`.
- `supabase/functions/classify-emoji/index.ts:103–134` — URL do corpo vira imagem enviada ao provedor; SHA256 `17398afb5f1a1e4caf8c8e6ecbd3ef00dfb0230f260085a735978f5f60df0e88`.
- `supabase/functions/classify-sticker/index.ts:39–79` — Ramo de usuário e serviço converge para helper sem autorização do objeto; SHA256 `62eedcddfd167537c4dbc7c9185f1dcaf3dcf09f58b356d8ab77a8530a5d162d`.
- `supabase/functions/classify-sticker/index.ts:102–127` — Imagem privilegiada enviada ao provedor; SHA256 `62eedcddfd167537c4dbc7c9185f1dcaf3dcf09f58b356d8ab77a8530a5d162d`.
- `supabase/functions/_shared/ai-image-input.ts:281–348` — Origin/bucket/path são conferidos; requisição usa credencial de serviço; SHA256 `a5ef80641783858fb58d8f79464cdab38afd35705bfcd8cbdfce1f7f954acc58`.
- `supabase/functions/_shared/ai-image-input.ts:378–398` — Bytes viram data URL; SHA256 `a5ef80641783858fb58d8f79464cdab38afd35705bfcd8cbdfce1f7f954acc58`.
- `supabase/functions/_shared/ai-auth.ts:60–107` — Gate de autenticação/cota é real, sem autorização do objeto; SHA256 `80ec690034f445416c1205b5863a4322fe6e260466d49ffaad45f89dc8633820`.
- `supabase/migrations/20260905030000_private_media_buckets.sql:1–11` — Bucket de clientes privado; SHA256 `893ad17f2d01f3fb410194c62e61289147fafb9756697aa2fe7d44deaa710fd1`.
- `supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql:30–50` — SELECT de mídia condicionado a mensagem visível; SHA256 `dcaad99b94189bef2b4960e605f8dffa12de883983f7932c504765dbb93ff84b`.

**Aceite:**

- No ramo de usuário, autorizar a leitura do objeto com identidade do chamador antes de qualquer download privilegiado ou pedido ao modelo.
- Rejeitar locator de contato/mensagem não visível e impedir acesso a imagem arbitrária no bucket, mesmo quando a URL é conhecida.
- Conservar ramo interno de serviço explícito para o webhook e autorizar bibliotecas compartilhadas por sua política própria.
- Fixtures devem distinguir imagem própria, imagem alheia privada, item compartilhado autorizado, origem externa e identidade inválida; a imagem negada não chega ao provedor.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. Não é chamada anônima: os gates internos exigem usuário válido. Não se presume verify_jwt=false no gateway; nenhuma exceção dessas rotas existe em config.toml. Policies mais recentes da fonte foram cruzadas com a área database; não foi certificado o estado atual do Storage remoto. R2-API-027 trata URL alternativa na transcrição de áudio com precondição de mensagem visível; este caso é dos classificadores visuais sem esse gate.

**Plano:** P007/IA-004: PARTIAL → PARTIAL; Autorização de leitura de objeto em classificadores de visão; preservar PARTIAL da matriz.; P007/IA-019: PARTIAL → PARTIAL; Minimização exige dados autorizados no prompt; preservar PARTIAL e acrescentar mídia privada sem autorização por objeto.

### R2-INF-023 — Revalidação de contexto fora da RPC deixa análise antiga substituir uma projeção concorrente

Os handlers de analysis/summary leem ai_projection_updated_at no início e o revalidam depois do modelo. A leitura final e persist_conversation_analysis são chamadas separadas. A RPC não recebe a versão esperada: aceita a projeção se seu timestamp atual for <= p_analyzed_at, que o handler gera com new Date() no fim. Se outra análise persiste enquanto a resposta da leitura de revalidação antiga está em trânsito, a antiga recebe current:true e seu timestamp posterior permite substituir a projeção concorrente.

**Precondições:** Duas execuções para o mesmo contato visível partem da mesma versão de projeção e seus contextos/requisições têm ordem relevante. A leitura de revalidação de A captura o estado antes do commit de B, mas A conclui essa leitura e produz p_analyzed_at depois do timestamp usado por B. A saída de A possui sentimento/prioridade a projetar e passa o contrato normal. Nenhuma falha de leitura é necessária.

**Efeito:** A garantia de cancelar resultado superado antes de qualquer persistência não vale nesse interleaving. A análise antiga pode entrar no histórico e assumir a projeção após a análise nova. A transação INSERT+UPDATE continua atômica; o defeito é a ausência de comparação atômica com a versão esperada.

**Evidência no fonte:**

- `supabase/functions/_shared/ai-conversation-pipeline.ts:178–200` — Versão do contexto é lida em uma consulta separada; SHA256 `2aa5c9290cc859bed55c6271b3d4ba9f165e6d6ca845eadaab2dc59bf79dce0f`.
- `supabase/functions/_shared/schemas.ts:440–468` — Revalidação usa snapshot e retorna antes da persistência; SHA256 `7fb6f10bf93306c84c7a4a84b68cb6e53f855e4aa04045dd1e8b96fead3c6cc7`.
- `supabase/functions/ai-conversation-analysis/index.ts:226–272` — Gate externo à RPC e timestamp criado ao concluir; SHA256 `e4731a289d2c7129b40e2281248529e3ab0b26136173323fdf237d4a5347de92`.
- `supabase/functions/ai-conversation-summary/index.ts:194–249` — Mesmo protocolo no resumo; SHA256 `cded06fb6964859231886daab87aad3e0f91d85bba1645c3849888c37dcca969`.
- `supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql:79–83` — Assinatura não recebe versão esperada; SHA256 `348e3d8006109e4e3839c991fd6c5283d82ab4236ecea0c9dafd967f405cea05`.
- `supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql:143–164` — Projeção ordenada apenas por timestamp do payload; SHA256 `348e3d8006109e4e3839c991fd6c5283d82ab4236ecea0c9dafd967f405cea05`.
- `tests/contracts/ai-conversation-analysis-contract.test.ts:110–134` — Testes verificam ordem textual/guarda, sem concorrência; SHA256 `0bc3fd3f155c6932e2b0665bfca0fcbc8eb0914a1b78f523f874b81d1a84b9a9`.
- `tests/contracts/ai-conversation-summary-contract.test.ts:175–200` — Mesmo limite de teste no resumo; SHA256 `8a497126906a472927cfdb2f75aa06bde52921cc88151e8e52ef03a03efb739a`.

**Aceite:**

- Definir identidade/ordem do contexto e levá-la à transação que decide aceitar a análise e projetar o contato.
- Verificar versão esperada sob lock ou condição equivalente, devolvendo cancelled/conflito quando a projeção avançou entre leitura e commit.
- Cobrir o interleaving leitura A → commit B → retorno da leitura A → tentativa de persistir A, preservando o resultado de B.
- Preservar o contrato transacional de análise+projeção e distinguir timestamp de término de identidade/recência do contexto.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. A prova executa o helper real e modela explicitamente o predicado SQL verificado; não é execução de PostgreSQL nem medição de concorrência em produção. O controle com leitura final atualizada cancela corretamente. O achado não nega os gates existentes nem a atomicidade da RPC. IA-026 permanece implementada aguardando evidência no seu contrato de persistência completa; não reabrir essa tarefa inteira por este subcontrato de recência.

**Plano:** P007/IA-048: PARTIAL → PARTIAL; Além do descarte lógico no cliente, a garantia de não aplicar contexto superado no servidor exige comparação atômica com a versão; status anterior já PARTIAL e assim permanece.

### R2-INF-024 — Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação

ai-suggest-reply extrai um objeto por regex e devolve JSON.parse sem usar SuggestedRepliesOutput. Assim, JSON sintaticamente válido como suggestions:string passa. AISuggestions salva qualquer data.suggestions truthy e renderiza com length e map: uma string não vazia satisfaz a condição e não tem map. Quando o parse falha, a Edge fabrica três frases fixas e responde 200 sem status de degradação, mostrando-as pelo mesmo caminho das sugestões geradas.

**Precondições:** O provedor retorna JSON válido com suggestions fora do formato de array, ou conteúdo que não pode ser parseado. A mesma requisição continua vigente no cliente e sua resposta é aceita pelo descarte lógico existente.

**Efeito:** Shape inválido pode causar falha de renderização ou ausência silenciosa de sugestões; parse inválido apresenta texto padrão como sucesso de geração sem explicitar sua origem. Não há envio automático de WhatsApp nesse caminho.

**Evidência no fonte:**

- `supabase/functions/ai-suggest-reply/index.ts:163–192` — Parsing sem contrato e fallback fixo com HTTP 200; SHA256 `4c90f4ed62d870269d012d8ead3d77a2531fd03291579a8fd4678275925f8a9a`.
- `supabase/functions/_shared/ai-response-contracts.ts:110–120` — Schema de sugestões existe, mas não está aplicado neste handler; SHA256 `b7f4c6f6690e5c02dfbe8b4fea14a03e1ab16357629c823ff70a9542d7b0d38e`.
- `src/components/inbox/AISuggestions.tsx:78–99` — Cliente aceita campo truthy sem validar array; SHA256 `eee9de6283f635d6877e92efc5184a63701d638240e9860057d362061211135a`.
- `src/components/inbox/AISuggestions.tsx:180–217` — Render pressupõe array e texto selecionável; SHA256 `eee9de6283f635d6877e92efc5184a63701d638240e9860057d362061211135a`.
- `tests/contracts/_adv_edge_legacy_producers.test.ts:197–208` — Teste documenta/congela o defeito; não é evidência de contrato correto; SHA256 `148dc546dd551b196d4ceb22167e396012e98c52e6552298d3468e605cb86746`.

**Aceite:**

- Validar o envelope e cada sugestão antes de retornar/renderizar, inclusive tipo do array, quantidade e texto não vazio.
- JSON válido com shape errado deve produzir estado de erro/degradação explícito e não entrar no render normal.
- Se frases locais forem política desejada, identificá-las como fallback local e permitir revisão consciente; não apresentá-las como resultado normal do modelo.
- Cobrir array ausente/string/objeto, itens inválidos, JSON malformado e três sugestões válidas, usando respostas sintéticas do provedor.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. Parse/fallback real foi extraído por AST; a consequência no render é sustentada pelo consumidor e checagem de tipo, sem sessão React/browser. Teste de inventário adversarial do próprio repositório já descreve o defeito; ele não consta como mecanismo nos 104 findings reconciliados.

**Plano:** P007/IA-025: PARTIAL → PARTIAL; JSON válido com estrutura errada permanece sem validação em ai-suggest-reply/AISuggestions; conservar PARTIAL com este produtor/consumidor explícito.; P007/IA-142: PARTIAL → PARTIAL; Origem das três frases de fallback não é identificada ao consumidor; conservar PARTIAL.

### R2-INF-025 — Reescrita atrasada substitui edição mais nova do mesmo rascunho

AIRewriteButton e AIEnhanceButton capturam inputValue no clique, aguardam ai-enhance-message e aplicam enhanced sem comparar o rascunho corrente nem uma geração de requisição. O campo de mensagem continua editável. No caminho mobile de ChatInputArea, o botão permanece montado enquanto há texto e seu onRewrite escreve diretamente no textarea via setNativeValue; portanto uma edição feita durante o await é substituída pelo resultado do texto anterior.

**Precondições:** Componente continua montado no mesmo contato/conversa e recebe retorno tardio bem-sucedido. Usuário modifica o rascunho enquanto a reescrita está em andamento; no caminho mobile mantém texto não vazio.

**Efeito:** Perda da edição recente do rascunho e aplicação de conteúdo relativo a uma versão anterior. O usuário ainda precisa enviar a mensagem; o achado não presume envio, troca de contato ou sobrevivência do componente ao remount.

**Evidência no fonte:**

- `src/components/inbox/chat/AIRewriteButton.tsx:33–63` — Resposta aplicada após await sem comparar texto/geração; SHA256 `e350755f36fe88aaf8f3c22c7f3ba7497f7d14c92a7577564a71e38141a7349c`.
- `src/components/inbox/chat/AIEnhanceButton.tsx:45–92` — Mesmo caminho no aprimoramento e undo captura texto anterior; SHA256 `5543da64064a3d9e5ad9068cca08c4878124038144074aff8df455a51d0a4d2e`.
- `src/components/inbox/chat/ChatInputArea.tsx:187–201` — Textarea permanece editável; SHA256 `2afe2fca8725cc54161998a384a3eb332cc2488e4535d97121f97a80fcbaf70c`.
- `src/components/inbox/chat/ChatInputArea.tsx:267–274` — Caminho mobile montado para texto não vazio e aplicação via setter; SHA256 `2afe2fca8725cc54161998a384a3eb332cc2488e4535d97121f97a80fcbaf70c`.
- `src/components/inbox/chat/useChatInputLogic.ts:112–124` — Setter aplica diretamente ao campo e emite input; SHA256 `5f87bfd6aedf159c9724cb33adc752456040bad3315f149de6c3152022de17f3`.
- `src/components/inbox/chat/ChatMessageInput.tsx:140–149` — Consumidor do Enhance compartilha o callback do textarea; SHA256 `59fcd6aa95ee33218b3f9ce83a99fcae7afd3caaf96c0eaebf25bcd19099bee9`.

**Aceite:**

- Associar reescrita à versão do rascunho e só aplicar automaticamente se texto/identidade ainda corresponderem ao clique.
- Ao editar durante a requisição, preservar a edição e descartar ou oferecer o resultado antigo como opção revisável.
- Testar edição no mesmo contato durante await e retorno fora de ordem; o texto novo deve permanecer.
- Definir o escopo de desfazer de forma que não restaure silenciosamente um rascunho anterior após nova edição.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. Callbacks reais executados com invoke/setters falsos; wiring do textarea verificado no fonte, sem teste React/DOM. Revisão cruzada com Inbox e grill_me_primary_review excluiu duplicação com UniversityHelp (R2-MOD-012) e AIGenerateDialog (R2-MOD-040).

**Plano:** P007/IA-048: PARTIAL → PARTIAL; Critério inclui rascunho; os consumidores Enhance/Rewrite não têm guarda de geração. Preservar PARTIAL e abrir este ramo sem reclassificar consumidores que já têm proteção.

## Duplicações evitadas e limites adicionais

- `IA-AUDIO-001` (duplicado): Áudio-meme usa nome/URL, não conteúdo sonoro; roteamento central não muda esse fato. Não criar outro ID.
- `IA-CHATBOT-001` (duplicado): connectionId ignorado em fluxo/histórico; retorno de flags não comprova transferência/envio. Manter achado anterior.
- `IA-METRICS-001` (extensão_sem_nova_contagem): UI ignora resultados da Edge e usa proxies locais. Confidence zero no classificador vira 0.5, mas não atribuir esse valor à UI que ignora esse retorno.
- `IA-TIMEOUT-001` (extensão_sem_nova_contagem): Timer do download é limpo após headers antes de arrayBuffer; limite de bytes é verificado depois da leitura integral. Novo consumidor do mesmo padrão de prazo, sem duplicar o ID.
- `IA-QUOTA-001` (contexto_sem_nova_contagem): Handlers calculados passam guard mas não geram chamada ao modelo/log de consumo pelo dispatcher. Contabilização de ação versus consumo já está na auditoria anterior/DB.

O texto de requestId em ai-enhance-message é ecoado na resposta, mas não enviado ao dispatcher; isso foi registrado na cobertura, sem criar mais um ID genérico de correlação. Nenhum dos handlers deste lote passa req.signal ao dispatcher; o cancelamento observado nos consumidores migrados é lógico. Chatbot Testar Conexão usa IDs `test`, incompatíveis com o schema UUID; essa fronteira permanece documentada sem alegar falha do bot inteiro.

## Integração e lacunas

Cobertura deste lote: 44 arquivos, 18 semânticos integrais (12 primários e suporte integral explícito), 26 dirigidos. Os contratos repetitivos e dependências fora das faixas não foram promovidos por mera presença.

Os 21 achados INF anteriores e sua revisão de infraestrutura permanecem preservados. Os quatro novos IDs são integrados aos arquivos principais da mesma área, sem alterar os relatórios de providers/database/Inbox. As tarefas IA relacionadas já eram PARTIAL; não se reabriu uma tarefa DONE_VERIFIED nem se anulou o trabalho dos consumidores que têm gates válidos.

- Sem ensaio pago, leitura Storage real, credenciais reais, execução Deno do handler, RPC/SQL, deploy, rede de produto ou sessão de usuário.
- Políticas e grants considerados como fonte versionada; estado publicado/currente remoto não certificado.
- Helpers centrais ai-generate/ai-routing/ai-usage e migrações/RLS completas ficam com providers/database; somente faixas adicionais de suporte declaradas aqui.
- Provas sintéticas usam funções puras/módulo local revisado e stubs; modelo do predicado SQL não é teste de PostgreSQL.
- Consumidores fora das faixas declaradas, todos os layouts e toda combinação de provedor não foram promovidos a leitura integral.
