"""Documentation-only IA review ledger. Never imports or executes product code."""
from pathlib import Path
import hashlib
import json
from collections import Counter

ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
SOURCE = ROOT / 'source'
OUT = ROOT / 'reports/infra'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'

def dump(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def source_entry(path, assessment, ranges=None, role='support', **details):
    raw = (SOURCE / path).read_bytes()
    lines = len(raw.decode().splitlines())
    full = ranges is None
    ranges = ranges or [[1, lines]]
    assert all(1 <= start <= end <= lines for start, end in ranges), (path, lines, ranges)
    return dict(path=path, sha256=hashlib.sha256(raw).hexdigest(), baseline_sha=HEAD,
                bytes=len(raw), lines=lines, review_level='semantic' if full else 'targeted',
                reviewed_ranges=ranges, reviewed_line_ranges=ranges, full_file_read=full,
                role=role, layer='ai_delegated' if role=='primary' else 'ai_support',
                review_basis=assessment, **details)

PRIMARY = [
 ('supabase/functions/_shared/ai-conversation-pipeline.ts',
  'Leitura integral de montagem de prompt, leitura RLS de contato, contexto service role, versão da projeção, dispatcher, parsing, conversões, envelopes e persistência delegada. A versão lida é ai_projection_updated_at; não é token transacional de contexto.',
  dict(gates='resolveVisibleContactId usa cliente do usuário; ausência/erro de consulta não libera contato. Helper espera autenticação do handler.',
       input_output='Texto recebido e três análises recentes entram em prompt; JSON de tool/content segue para schema do handler; outputs carregam cobertura e projeção.',
       errors='Consulta de versão propaga erro; consulta de prompt usa data sem distinguir erro. 429/402 preservados, JSON ausente gera 502. Não executado o dispatcher.',
       cancellation='A revalidação recebe callbacks; request.req não vira AbortSignal na chamada generateWithRouting.',
       consumers=['ai-conversation-analysis', 'ai-conversation-summary'], finding_ids=['R2-INF-023'])),
 ('supabase/functions/_shared/ai-image-input.ts',
  'Leitura integral: parser de origem/bucket/path, modo data URL, ambiente por nome, construção de endpoint, download privilegiado, limites de tipo/tamanho, base64 e falhas tipadas. Allowlist de origem não confere autorização do usuário ao objeto.',
  dict(gates='Origem exata e buckets fixos; download usa service role, sem identidade/cliente RLS no contrato do helper.',
       input_output='Storage próprio ou data URL vira bytes/base64; 4 MiB é conferido no header e depois da leitura integral.',
       errors='Falhas tipadas; chamadores classificadores degradam para outros. Timer termina após headers, antes de arrayBuffer.',
       cancellation='AbortController interno cobre fetch até headers; req.signal não entra; corpo é lido após clearTimeout.',
       consumers=['classify-emoji', 'classify-sticker'], finding_ids=['R2-INF-022'], related_previous_findings=['IA-TIMEOUT-001'])),
 ('supabase/functions/ai-conversation-analysis/index.ts',
  'Leitura integral: autenticação/cotas/IP, schema e orçamento, visibilidade, versão inicial, prompt, saída validada/normalizada, revalidação e RPC transacional. Revalidação ocorre fora da transação e p_analyzed_at é gerado ao finalizar.',
  dict(gates='requireAuth, enforceAiGuards, 10/IP/min e cliente RLS para contato; service role apenas após visibilidade.',
       input_output='Mensagens/contato/período/requestId/contextVersion; contrato de saída, análise completa e projeção via RPC, envelope com analysisId.',
       errors='Não persiste saída inválida; erro da RPC produz 502; versão não medida segue por decisão explícita. Falhas gerais passam errorResponse.',
       cancellation='Revalida contato e versão antes da RPC; cliente faz descarte lógico após await. Janela concorrente permanece no servidor.',
       consumers=['src/components/inbox/AIConversationAssistant.tsx'], finding_ids=['R2-INF-023'])),
 ('supabase/functions/ai-conversation-summary/index.ts',
  'Leitura integral: equivalente de resumo com schema mínimo de cinco mensagens, contexto e persistência completa; valida vocabulário e campos opcionais. O gate de versão não está na mesma transação da projeção.',
  dict(gates='requireAuth, enforceAiGuards, limite local por IP e visibilidade RLS de contato.',
       input_output='Mensagens, período opcional e versão declarada; saída validada e RPC de análise com timestamp do fim, envelope/projected.',
       errors='JSON/contrato inválido e persistência falha são respostas explícitas; campo ausente continua ausente.',
       cancellation='Revalida antes da RPC; callback do frontend rejeita retorno antigo após contato/período mudarem, sem desfazer persistência já feita.',
       consumers=['src/components/inbox/ConversationSummary.tsx'], finding_ids=['R2-INF-023'])),
 ('supabase/functions/ai-churn-analysis/index.ts',
  'Leitura integral: até 50 IDs passam pela visibilidade RLS; consultas de mensagens/análises geram score heurístico, sem chamada ao modelo. Cálculo e UI são caminhos diferentes; dashboard ignora o retorno e recalcula por updated_at.',
  dict(gates='Token validado, guard de IA e IDs filtrados por cliente autenticado antes de leituras service role.',
       input_output='Lista limitada de contatos; score/riscos calculados por regras e dados disponíveis, sem previsão de modelo treinado.',
       errors='Erros de algumas consultas não são distinguidos de dados ausentes. UI usa fallback local inclusive após erro da Edge.',
       cancellation='Laço serial de consultas, sem sinal de cancelamento propagado.',
       consumers=['src/components/ai/ChurnPredictionDashboard.tsx'], finding_ids=[], related_previous_findings=['IA-METRICS-001','IA-QUOTA-001'])),
 ('supabase/functions/ai-classify-tickets/index.ts',
  'Leitura integral: consulta ai_conversation_tags com cliente JWT do usuário e deriva categorias/prioridades sem chamar modelo nem persistir. confidence || 0.5 troca zero por 0.5; AutoTicketClassifier ignora a resposta e deriva o primeiro tag localmente, portanto não atribuir a esse zero o efeito da UI.',
  dict(gates='getUser, guard de IA e consulta direta de tags pelo callerClient submetida à RLS, sem cliente service role nesse handler.',
       input_output='Limit limitado pelo schema, tags existentes viram classificações calculadas.',
       errors='A consulta lê data sem distinguir error: ausência ou erro vira classified:0/200; o consumidor anuncia sucesso local até no catch.',
       cancellation='Sem AbortSignal ou efeito persistente do handler; consultas e retorno podem terminar após desmontagem.',
       consumers=['src/components/ai/AutoTicketClassifier.tsx'], finding_ids=[], related_previous_findings=['IA-METRICS-001','IA-QUOTA-001'])),
 ('supabase/functions/ai-enhance-message/index.ts',
  'Leitura integral: texto limitado, enum de tom, despacho copilot com instrução do servidor, texto não vazio, eco de requestId. Não escreve no banco nem envia WhatsApp. requestId não é passado ao dispatcher nesta rota.',
  dict(gates='requireAuth, enforceAiGuards e 20/IP/min; não consulta objeto privado.',
       input_output='Mensagem, tom e contactName recebidos; texto reescrito devolvido para revisão/aplicação pelo cliente.',
       errors='429/402 e resposta vazia tratados, demais falhas via errorResponse.',
       cancellation='Sem req.signal; os dois consumidores examinados aplicam após await sem verificar geração de rascunho/contato.',
       consumers=['src/components/inbox/chat/AIEnhanceButton.tsx','src/components/inbox/chat/AIRewriteButton.tsx'], finding_ids=['R2-INF-025'])),
 ('supabase/functions/ai-suggest-reply/index.ts',
  'Leitura integral: identidade/cotas, schema/contexto, contato visível e notas/campos/artigos no prompt, routing com requestId. O JSON extraído por regex não passa por SuggestedRepliesOutput; falha de parse retorna três frases fixas como 200.',
  dict(gates='requireAuth e guard, contato RLS antes do contexto service role; artigos publicados são contexto adicional.',
       input_output='Até as mensagens limitadas pelo schema entram na conversa do modelo; resposta é JSON sem verificação do formato de suggestions.',
       errors='429/402 preservados; parse inválido é mascarado como sugestões normais. UI só verifica truthiness de data.suggestions.',
       cancellation='Cliente rejeita retorno por geração/contato após await; Edge não persiste e não recebe AbortSignal para provedor.',
       consumers=['src/components/inbox/AISuggestions.tsx'], finding_ids=['R2-INF-024'])),
 ('supabase/functions/chatbot-l1/index.ts',
  'Leitura integral: corpo/HMAC ou JWT, schema UUIDs, autorização por contato no ramo usuário, fluxo ativo, RAG/histórico e saída contratada. connectionId é recebido mas não isola escolha do fluxo/histórico; efeito observado é metadado do contato e flags de retorno.',
  dict(gates='Ramo HMAC de serviço ou requireAuth+guard; assinatura de serviço não equivale a endpoint anônimo sem gateway. Configuração remota não medida.',
       input_output='contactId/message/connectionId; JSON validado e confiança normalizada, retorno de handled/transfer_to_human.',
       errors='Saída inválida é recusada; erro de atualização de metadados apenas registrado. Testar Conexão UI envia UUIDs inválidos test.',
       cancellation='Sem cancelamento de provedor; esta rota não prova envio automático nem transferência efetiva.',
       consumers=['src/components/settings/ChatbotL1Config.tsx'], finding_ids=[], related_previous_findings=['IA-CHATBOT-001'])),
 ('supabase/functions/classify-audio-meme/index.ts',
  'Leitura integral: identidade/cotas, schema, prompt por file_name/audio_url, dispatcher e categoria em allowlist. O som não é baixado nem transcrito; classificação é por metadados.',
  dict(gates='requireAiIdentity; identidade verificada antes do provedor.',
       input_output='URL/nome viram texto ao modelo; categoria sanitizada e validada contra lista fixa.',
       errors='Falha do modelo/categoria inválida vira outros, caminho conhecido de degradação.',
       cancellation='Timeout passado ao dispatcher, sem req.signal; limites centrais ficam na área providers.',
       consumers=['src/hooks/communication/useAudioMemes.ts','src/components/settings/media-library/useMediaUpload.ts','src/components/settings/media-library/useMediaLibrary.ts'], finding_ids=[], related_previous_findings=['IA-AUDIO-001'])),
 ('supabase/functions/classify-emoji/index.ts',
  'Leitura integral: requireAiIdentity, entrada limitada, imagem preparada via service role sem autorização do objeto, routing de visão, categoria fixa e degradação registrada. userId é enviado ao log/dispatcher, mas não ao controle de acesso da imagem.',
  dict(gates='Autenticação e cotas presentes; ausência de autorização de leitura por objeto no ramo usuário.',
       input_output='image_url/file_name; bytes da imagem vão ao provedor e categoria limitada volta ao chamador.',
       errors='Erro de imagem ou provedor vira outros/200 com tentativa de registro; não devolve arquivo bruto.',
       cancellation='15s declarado ao download/dispatcher; req.signal não é propagado.',
       consumers=['src/hooks/integrations/useCustomEmojis.ts','src/components/settings/media-library/useMediaUpload.ts','src/components/settings/media-library/useMediaLibrary.ts'], finding_ids=['R2-INF-022'])),
 ('supabase/functions/classify-sticker/index.ts',
  'Leitura integral: aceita usuário autenticado ou token exato de serviço; imagem privada lida pelo helper sem verificar objeto do usuário. Webhook usa legitimamente o ramo serviço. O achado é sobre o mesmo poder oferecido ao ramo usuário.',
  dict(gates='requireAiIdentityOrService; service key comparada pelo helper, cotas por usuário ou limiter de serviço.',
       input_output='image_url limitada; data URL enviada ao provedor de visão, retorno de categoria de allowlist.',
       errors='Imagem/provedor falhos degradam para outros com log; não há download do conteúdo na resposta HTTP.',
       cancellation='15s declarado ao helper/dispatcher, sem vínculo ao AbortSignal da requisição.',
       consumers=['src/hooks/sticker-picker/useStickerPicker.ts','supabase/functions/_shared/evolution-webhook-messages.ts','src/components/settings/media-library/useMediaLibrary.ts'], finding_ids=['R2-INF-022'])),
]

SUPPORT = [
 ('supabase/config.toml', None, 'Leitura integral das exceções locais de verify_jwt. Nenhuma das dez rotas IA deste lote declara verify_jwt=false. Estado remoto do gateway não foi observado.'),
 ('supabase/functions/_shared/ai-auth.ts', None, 'Leitura integral: requireAuth+enforceAiGuards para usuário; token exato de serviço por comparação constante e limiter próprio. Não contém autorização de objeto Storage.'),
 ('supabase/functions/_shared/ai-guards.ts', None, 'Leitura integral de cotas por função/usuário, contadores compartilhados, fallback local e decisões fail-open de infraestrutura. Não confundir cotas com autorização por contato/objeto.'),
 ('supabase/functions/_shared/ssrf.ts', None, 'Leitura integral do parser puro, origem exata, prefixo public/sign, bucket e travessias. Controla destino de rede, não permissão do usuário à mídia.'),
 ('supabase/functions/_shared/validation.ts', [[270,319]], 'Faixa de criação de clientes e requireAuth: valida Bearer por getUser; não certifica RLS de nenhum objeto apenas por autenticar.'),
 ('supabase/functions/_shared/schemas.ts', [[1,165],[193,214],[245,285],[335,575]], 'Faixas lidas de limites/schema IA, helper puro de versão/revalidação e envelopes. Demais schemas não promovidos integralmente.'),
 ('supabase/functions/_shared/ai-response-contracts.ts', [[101,171]], 'Contratos de sugestões, auto-tag e chatbot: formato e validação de confidence. Dispatcher central revisado por providers.'),
 ('supabase/migrations/20260905030000_private_media_buckets.sql', None, 'Leitura integral: migração determina public=false para buckets de clientes. Nenhuma execução ou certificação do estado remoto.'),
 ('supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql', None, 'Leitura integral da policy SELECT aditiva restrita a mídia de mensagem visível ao chamador, sem SECURITY DEFINER.'),
 ('supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql', [[1,175]], 'Faixa da definição de persist_conversation_analysis: INSERT+UPDATE na mesma transação, ordenação por p_analyzed_at, sem expectedContextVersion no contrato. Revisão cruzada com área database.'),
 ('src/components/ai/AutoTicketClassifier.tsx', [[1,165]], 'Cadeia do consumidor: lista tags, agrupa primeiro tag, normaliza confiança e deriva prioridade; invoke de batch ignora data e recarrega, inclusive fallback de sucesso no catch.'),
 ('src/components/ai/ChurnPredictionDashboard.tsx', [[90,153]], 'Retorno do modelo local, estatísticas e runAIAnalysis: data da Edge ignorada, analyzeChurnRisk recarregado, fallback local anuncia sucesso.'),
 ('src/hooks/integrations/useCustomEmojis.ts', [[50,103]], 'Upload/locator e invocação do classificador no caminho de uso de emoji; retorno de categoria consumido.'),
 ('src/hooks/sticker-picker/useStickerPicker.ts', [[30,85]], 'Faixa de upload/classificação de sticker, input image_url e fallback de categoria.'),
 ('src/hooks/communication/useAudioMemes.ts', [[118,169]], 'Cliente chama classify-audio-meme com URL/nome, trata erro conservando outros e oferece categoria para confirmação antes de INSERT.'),
 ('src/components/inbox/AIConversationAssistant.tsx', [[75,178]], 'Clique captura geração, envia mensagens/período/requestId, retry, descarte após await; ausência de contextVersion enviado e proteção só local depois da resposta.'),
 ('src/components/inbox/ConversationSummary.tsx', [[65,142]], 'Geração/visibilidade e clique de resumo, body não manda período nem versão de projeção, rejeita resposta antiga no cliente depois do await.'),
 ('src/components/inbox/AISuggestions.tsx', [[35,145],[174,221]], 'Guarda lógica por contato/geração; invoke e tratamento de retorno apenas por truthiness de suggestions; .length e .map no render pressupõem array e escolha insere texto no callback.'),
 ('src/components/inbox/chat/AIEnhanceButton.tsx', [[15,110]], 'Envio/aplicação/undo do rascunho após await sem geração; sem afirmar montagem universal do componente.'),
 ('src/components/inbox/chat/AIRewriteButton.tsx', [[15,100]], 'Invocação e callback de rewrite sem guarda por rascunho/contato; presença não equivale a uso em toda tela.'),
 ('src/components/settings/ChatbotL1Config.tsx', [[213,251]], 'Botão Testar Conexão usa IDs test incompatíveis com UUID do schema; não houve clique real.'),
 ('tests/contracts/ai-conversation-summary-contract.test.ts', [[165,200]], 'Contrato verifica ordem textual revalidação→RPC e guarda/envelope, não concorrência transacional. Não executado.'),
 ('tests/contracts/ai-conversation-analysis-contract.test.ts', [[100,134]], 'Contrato verifica substrings e ordem; não injeta commit concorrente entre leitura da versão e gravação. Não executado.'),
 ('tests/contracts/_adv_edge_legacy_producers.test.ts', [[187,219]], 'Testes de inventário de defeitos congelam parse legado/fallback em sugestões; confirmação estrutural não prova contrato correto.'),
 ('supabase/functions/_shared/evolution-webhook-messages.ts', [[666,722]], 'Faixa do produtor interno: classifica sticker com service role e timeout; esse ramo legítimo não fornece autorização por objeto ao ramo usuário do classificador.'),
 ('src/components/settings/media-library/useMediaUpload.ts', [[36,89]], 'Upload em bucket da biblioteca seguido por classificador e INSERT; consumidores invocam URL sem contactId/messageId.'),
 ('src/components/settings/media-library/useMediaLibrary.ts', [[161,208]], 'Reclassificação chama handler por locator e atualiza categoria quando há resultado; ramo de leitura conhecido do usuário não autentica uma chamada arbitrária na Edge.'),
 ('src/components/inbox/chat/ChatInputToolbars.tsx', [[1,72]], 'Cadeia de aplicação: SecondaryToolbar recebe inputRef e escreve diretamente o resultado da reescrita no textarea por native setter e evento input, sem comparar rascunho.'),
 ('src/components/inbox/chat/ChatInputArea.tsx', [[22,44],[175,246],[249,279]], 'Textarea permanece editável; AIRewriteButton mobile permanece montado enquanto hasText e aplica via setNativeValue. O cenário do achado mantém mesma conversa e texto não vazio.'),
 ('src/components/inbox/chat/useChatInputLogic.ts', [[1,55],[107,124]], 'Helpers de persistência local de rascunho e native setter: aplica o valor e emite input, sem condição de geração/valor esperado no setter.'),
 ('src/components/inbox/chat/ChatMessageInput.tsx', [[95,163]], 'Textarea controlado permanece editável enquanto AIEnhanceButton chama o mesmo onInputChange ao resolver a reescrita.'),
 ('src/components/team-chat/TeamChatInputArea.tsx', [[62,112]], 'Consumidor adicional de AIRewriteButton passa setText direto; não é necessário ao cenário principal do Inbox e não certifica montagem/contato de todas as telas.'),
]

def build_coverage():
    inventory = [source_entry(path, basis, role='primary', **details) for path,basis,details in PRIMARY]
    inventory += [source_entry(path, basis, ranges=ranges) for path,ranges,basis in SUPPORT]
    counts = Counter(e['review_level'] for e in inventory)
    payload = dict(schema_version=1, area='infra/ai_delegated', baseline_sha=HEAD,
       source_root=str(SOURCE), mode='READ_ONLY_STATIC_AND_BOUNDED_OFFLINE_PROBES',
       counts={'total':len(inventory), **dict(counts)}, primary_scope={'files':len(PRIMARY),'lines':sum(e['lines'] for e in inventory if e['role']=='primary'),'fully_read':len(PRIMARY)},
       definitions={'semantic':'Arquivo inteiro lido, com gates/entradas/saídas/falhas/efeitos rastreados; não implica execução.','targeted':'Somente faixas explicitadas foram lidas para o fluxo descrito; não usar como leitura integral.','structural':'Inventário/hash/sinais, sem reivindicação comportamental.'},
       inventory=inventory,
       remaining_gaps=[
         'Sem ensaio pago, leitura Storage real, credenciais reais, execução Deno do handler, RPC/SQL, deploy, rede de produto ou sessão de usuário.',
         'Políticas e grants considerados como fonte versionada; estado publicado/currente remoto não certificado.',
         'Helpers centrais ai-generate/ai-routing/ai-usage e migrações/RLS completas ficam com providers/database; somente faixas adicionais de suporte declaradas aqui.',
         'Provas sintéticas usam funções puras/módulo local revisado e stubs; modelo do predicado SQL não é teste de PostgreSQL.',
         'Consumidores fora das faixas declaradas, todos os layouts e toda combinação de provedor não foram promovidos a leitura integral.',
       ])
    dump('ai-review-coverage.json',payload)
    return payload

if __name__ == '__main__':
    result=build_coverage()
    print(json.dumps({'artifact':'ai-review-coverage.json','counts':result['counts'],'primary_scope':result['primary_scope']},ensure_ascii=False))
