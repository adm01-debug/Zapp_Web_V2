# Leitura dos testes de provedores e integrações

HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`; roster com 76 arquivos / 19010 linhas.

Estado: **COMPLETE**. Contagem: `{'SEMANTIC_FULL_FILE': 76}`. Nenhuma suíte foi executada.

Alocação e hash conferido não equivalem a leitura. Somente entradas com faixas/asserções efetivamente revistas integram cobertura semântica.

## 01 — src/components/email/__tests__/EmailChatBubble.test.tsx

**SEMANTIC_FULL_FILE** · 143 linhas · SHA-256 `36d59103692c6b4c7f9976c714b5af91a983bc17195cf48a4fe9c21a720e27a9`.

**Asserções:** sanitizeEmailHtml: remove larguras em px, scripts, handlers, estilos hostis e data image excessiva; preserva percentuais, cores e links seguros; buildBodyPreview: entidades, limite por palavra e reticências; EmailChatBubble: prioridade HTML, fallback texto e expansão/recolhimento de corpos longos

**Mocks e fixtures:** Componente e sanitizadores reais; somente framer-motion é simplificado; EmailMessage sintético completo, sem DB, rede ou layout de navegador

**Adjudicação:** Asserções positivas e negativas relevantes para o contrato local. Nenhum novo achado material; o nome do caso de imagem não prova retenção de src, pois verifica a tag e atributos lazy/referrer.

**Limites:** Leitura estática; suíte não executada; jsdom e motion simplificado não demonstram comportamento visual em pixels; Casos de sanitização não adjudicam o src protocol-relative descrito em COM011

**Achados relacionados:** R2-COM-011

## 02 — src/components/email/__tests__/EmailChatReplyBar.test.tsx

**SEMANTIC_FULL_FILE** · 244 linhas · SHA-256 `3add3d927ed24687c5cb2a4dc4b745202e18fef7d83da39edfbae14d943308ac`.

**Asserções:** Destinatários de reply, reply-all e forward; exclusão do próprio e-mail; Guardas de corpo vazio, destinatário ausente e assunto em novo e-mail; payloads reply/send; Ctrl+Enter versus Enter; onSent no sucesso; tamanho e remoção de anexo

**Mocks e fixtures:** EmailChatReplyBar real com useGmail falso: mutateAsync sempre resolve imediatamente e isPending=false; Toasts, logger e dropdowns simplificados; mensagens inbound/outbound e File com size sobrescrito

**Adjudicação:** Confirma montagem local de payloads e guardas dentro dos mocks. Não há defeito concreto adicional; respostas sempre imediatas não adjudicam as corridas de limpeza/persistência de rascunho já registradas.

**Limites:** Leitura estática; suíte não executada; Sem promessa pendente ou rejeitada; callbacks de envio em voo e troca de contexto permanecem fora do alcance probatório destes casos; Mocks de dropdown não representam foco/portal reais

**Achados relacionados:** R2-COM-005; R2-COM-006

## 03 — src/components/email/__tests__/EmailChatThread.test.tsx

**SEMANTIC_FULL_FILE** · 321 linhas · SHA-256 `ed55b2d9a475a225a80ba1d67e386e1b2dbda876024dab7267871c597c67766f`.

**Asserções:** Scroll: botão de novas mensagens e reduced motion; montagem/limpeza da seleção de thread; Reply explícito mantém a mensagem antiga selecionada; cabeçalho, loading, vazio e conteúdo; markAsRead apenas quando thread não lida e possui mensagens; Arquivo, lixeira e restauração no componente moderno enviam rótulos e gmail_thread_id corretos; Separadores de data hoje/ontem/anteriores

**Mocks e fixtures:** EmailChatThread real; useGmail mutável com sucesso imediato, attachments=[] e sem erros; Bubble/replybar/composer substituídos por marcadores; tooltip/scroll-area simplificados; scrollIntoView e geometria do viewport simulados; temporizador falso apenas para Date

**Adjudicação:** Boa evidência do contrato de ações da thread moderna; não valida o botão Arquivar do componente legado de API060. Os casos intitulados 'só então volta' verificam chamada e resultado com promessa imediatamente resolvida, sem demonstrar a ordem diante de pendência/falha.

**Limites:** Leitura estática; suíte não executada; Sem onContactContext, chegada tardia de anexo ou páginas de mensagens; não encerram COM001/004/007; Geometria e controles filhos simulados não demonstram layout ou integração completa

**Achados relacionados:** R2-API-060; R2-COM-001; R2-COM-004; R2-COM-007

## 04 — src/components/email/__tests__/EmailThreadList.test.tsx

**SEMANTIC_FULL_FILE** · 109 linhas · SHA-256 `bdb365dc36c5235cff62b877ca049b1344cac3e38d9fbc50b428b0051e6edb92`.

**Asserções:** Nome/endereço real do remetente e classe de snippet; seletor de pasta sem chips; Paginação local de 20 itens e busca antes do recorte; fixture de 1000 threads; Restauração de filtros da URL preserva view; combinação unread e attachment

**Mocks e fixtures:** EmailThreadList real com props sintéticas já integralmente carregadas; framer-motion troca inclusive div por button; history local reiniciado antes de cada caso

**Adjudicação:** Asserções comprovam filtragem/paginação local das props e identidade exibida. A fixture de 1000 linhas não comprova paginação de leitura no servidor nem modifica COM007 sobre mensagens.

**Limites:** Leitura estática, sem execução; Motion simplificado altera semântica de elementos; nenhum aceite visual ou de acessibilidade integral; O caso que diz persistir filtros verifica restauração e preservação inicial; a alteração efetiva da URL é exercitada pelo refinamento de anexos

## 05 — src/components/gmail/__tests__/EmailThreadView.test.tsx

**SEMANTIC_FULL_FILE** · 245 linhas · SHA-256 `f0b88cc57f375d0c4b6cae63c288c57b947047441e7584362fc91453cd92d762`.

**Asserções:** Seleção e limpeza do thread, cabeçalho, loading/vazio e renderização de mensagens; markAsRead condicional com Gmail ID; Reply/Forward montam modo correto; Voltar chama callback e Lixeira envia apenas ID da última mensagem

**Mocks e fixtures:** EmailThreadView legado real; useGmail substituído por funções espiãs e mensagens sintéticas; Sanitizador substituído por identidade; composer, ícones, motion e componentes UI simplificados

**Adjudicação:** Exercita ações locais do legado. O botão Arquivar não é acionado no arquivo, portanto não refuta API060. O teste de lixeira congela exclusão da última mensagem; não comprova arquivamento/exclusão integral da thread. Não se infere novo defeito apenas desse escopo.

**Limites:** Leitura estática, sem execução; sanitizeEmailHtml é bypassado deliberadamente; não prova sanitização de produção ou COM011; Sem errors/paginação do hook; não adjudica API059/COM007

**Achados relacionados:** R2-API-059; R2-API-060; R2-COM-007; R2-COM-011

## 06 — src/components/gmail/__tests__/ThreadListItem.test.tsx

**SEMANTIC_FULL_FILE** · 180 linhas · SHA-256 `9a86c9cf6311a961c7d2f06a409d21c81481237ae15d4d0b8fc8160d81f52ff0`.

**Asserções:** Precedência contact.name → last_from_name → address → Desconhecido; Assunto fallback, contagem >1, estrela/importância condicionais e até3 tags; Botão chama callback e classe de seleção

**Mocks e fixtures:** ThreadListItem real com EmailThread sintético e tags sempre array; Motion conserva tag elementar, remove props de animação; avatar/badge/ícones simplificados

**Adjudicação:** Contrato de apresentação e interação local consistentemente exercitado. Sem novo achado concreto; não é prova de sincronização, remetente no backend ou navegação completa.

**Limites:** Leitura estática, sem execução; UI substituída não demonstra pixels, animação ou acessibilidade integral; Fixture não pretende validar payload recebido de rede

## 07 — src/hooks/__tests__/useBitrixApi.test.ts

**SEMANTIC_FULL_FILE** · 167 linhas · SHA-256 `34cb22408f8bc05a7523454d63897af094de25840128e3701858cb38c8738890`.

**Asserções:** Estado inicial e existência dos métodos Lead/Contact/Deal/telefonia/sync; listLeads monta action=list/entityType=lead; Erro invoke e erro lógico de resposta viram error; loading durante promise pendente e após conclusão

**Mocks e fixtures:** useBitrixApi real; invoke/sonner/logger simulados; Promise adiada usada apenas para loading; nenhuma API Bitrix real

**Adjudicação:** Prova local dos dois canais de erro e de loading. Boa parte dos métodos é verificada somente por typeof; isso não valida seus contratos remotos e não refuta os achados de ação especial/URL configurada.

**Limites:** Leitura estática; suíte não executada; Nenhuma chamada ao handler Edge ou provedor, nenhum aceite de autorização/backend

**Achados relacionados:** R2-API-018; R2-API-048

## 08 — src/hooks/__tests__/useEvolutionApi.test.ts

**SEMANTIC_FULL_FILE** · 868 linhas · SHA-256 `aa01855e490f59be09bce56d91ce68698ffdae2644c366f26d083036fd44004d`.

**Asserções:** Inicialização, catálogo de funções expostas, erro invoke/rejeição, limpeza de loading e toasts; Verbos POST e paths/body de instância/settings/webhook; Payloads de texto/citação/mídia/áudio/sticker/localização/contato/reação/poll/lista/botões/status/template; Gestão de mensagem/chat, grupos e ações de participantes no body; Perfil/privacidade/labels, integrações e templates; retorno de data

**Mocks e fixtures:** useEvolutionApi e seus hooks reais com functions.invoke substituído por resposta estática success=true; Fixtures de IDs, URLs e configurações sintéticas; toasts/logger simulados

**Adjudicação:** Cobertura extensa de serialização do frontend, sem executar as rotas remotas. O path mantém a ação principal e o body.action de grupos não a sobrescreve. A denominação Exhaustive Test Suite não é aceite exaustivo do provedor: vários casos de integração verificam apenas toast ou typeof. Nenhum novo defeito independente.

**Limites:** Leitura estática; suíte não executada; Erros lógicos HTTP200/notSupported não aparecem nas fixtures de resposta; API042 permanece fora do aceite; Não há handler/RLS/credenciais/versões GO-v2 executados; não refuta API001/014/015; findMessages congela remoteJid no payload frontend, sem provar o contrato where do backend ou alcance em botão produtivo

**Achados relacionados:** R2-API-001; R2-API-014; R2-API-015; R2-API-042

## 09 — src/hooks/__tests__/useWhatsAppStatus.test.ts

**SEMANTIC_FULL_FILE** · 211 linhas · SHA-256 `882993297d244e22aebe463204609841973c7967b4ce68d61a6334ae6531207a`.

**Asserções:** Telefone ausente/vazio, conexão indisponível e fallback de conexão; Duas chamadas para status/presença e filtro por telefone limpo; Erro de lookup lançado expõe mensagem; erro lógico de status e rejeição isolada viram lista vazia

**Mocks e fixtures:** Hook real; consultas em cadeias mínimas usam fila única de mockMaybeSingle e não validam filtros; invoke recebe respostas sintéticas ou rejeição; nenhum evento real de presença

**Adjudicação:** Casos 149–164 e 192–209 aceitam explicitamente vazio depois de erro do provedor; contextualizam AUTH035 e não o refutam. O teste de presença verifica quantidade de chamadas, não fidelidade do estado online. Sem novo ID.

**Limites:** Leitura estática; suíte não executada; Não testa payload notSupported exato nem prova escopo RLS das consultas; Status filtrado por telefone é exercitado; não é prova de presença obtida do provedor

**Achados relacionados:** R2-AUTH-035

## 10 — src/hooks/crm/__tests__/useAgentPresence.test.ts

**SEMANTIC_FULL_FILE** · 134 linhas · SHA-256 `15aa82345b82c957230661359b375d6d4950596fd9071a5a0af02372d31442ec`.

**Asserções:** Entrada publica status salvo da própria identidade; mudança salva localmente e faz upsert; Mapa inicial e evento UPDATE de postgres_changes; heartbeat velho vira offline; Heartbeat periódico e desmontagem remove canal e impede novas escritas no avanço do relógio

**Mocks e fixtures:** Hook real recarregado por resetModules; timers e localStorage controlados; select/upsert e canal realtime simulados; escritas sempre resolvem sem erro

**Adjudicação:** Asserções de encerramento efetivamente avançam o relógio após unmount e conferem ausência de novas chamadas, portanto são controle positivo útil. Não surge defeito concreto independente.

**Limites:** Leitura estática; suíte não executada; Sem política RLS, canal realtime real ou respostas de falha; não prova presença de todas as identidades em produção

## 11 — src/hooks/integrations/__tests__/useGmail.test.ts

**SEMANTIC_FULL_FILE** · 288 linhas · SHA-256 `c6d08f758adde5b3b799e3172903c579d31cf356cd0428a766816ef4c23efc0d`.

**Asserções:** Accounts via Edge, fallback RPC, RPC recusada e contas vazias; Conta ativa por ID, contagem local unread/starred e thread de deep link; Assinatura com dois listeners e cleanup; sem conta não cria canal; Contexto de retorno OAuth por query/hash e location.assign

**Mocks e fixtures:** useGmail real com QueryClient sem retry; callGmailFunction e Supabase simulados; Query chain devolve fixture independentemente de eq/range; OAuth state/context são mocks; location global substituída para navegação; nenhum OAuth real

**Adjudicação:** Verifica dados e chamadas locais. O caso de deep link não valida os argumentos dos filtros (mock ignora eq). accounts=[] após erro é compatível com hook que também expõe accountsError; a falsa desconexão pertence ao consumidor de API059. OAuth de ida não adjudica state de volta COM009.

**Limites:** Leitura estática; suíte não executada; Sem paginação real, rejeição do backend ou persistência OAuth; não refuta COM007/009/010; Sem execução de SQL/RLS ou autenticação do usuário

**Achados relacionados:** R2-API-059; R2-COM-007; R2-COM-009; R2-COM-010

## 12 — src/hooks/integrations/__tests__/useMultiplixDispatches.edge.test.tsx

**SEMANTIC_FULL_FILE** · 182 linhas · SHA-256 `ce4419387664e07039cc16f930283c762e5db4411b6b25eaa64128108ad47e6f`.

**Asserções:** Leituras usam action/payload e JWT via Edge, sem supabase.from disponível; Variações de envelope rows/dispatches/array; detalhes localizados no lote de50 e erro se ausentes; Recipients limit500/status e totals exatos ou fallback por tamanho; Erro nomeado em Response context e rejeição de formato desconhecido

**Mocks e fixtures:** Hook real/QueryClient; sessão fixa e invoke sem handler real; Duas dispatches/um recipient; createMultiplixDraft é mock

**Adjudicação:** Os testes congelam detalhe limitado à primeira página e ausência convertida em not_found (98–119), coerentes com MOD021. Totais/página dos recipients têm escopo documentado em MOD022. Boa propagação de erro de envelope, sem novo ID.

**Limites:** Leitura estática; suíte não executada; Não valida autorização do JWT no servidor; não lê RPC nem produtor do envelope; Fluxo de criação/idempotência não é exercitado

**Achados relacionados:** R2-MOD-021; R2-MOD-022

## 13 — src/lib/__tests__/crmIntegration.test.ts

**SEMANTIC_FULL_FILE** · 45 linhas · SHA-256 `a07289f6693d53b482539e9a39eeedab489d40c135773aa46bd98ebb677f06a2`.

**Asserções:** Action escolhido sobrepõe tentativa no payload; Envelope válido, erro transporte/domínio, resposta nula/semdata e erro nomeado no context

**Mocks e fixtures:** callCRMIntegration real; functions.invoke simulado, Response de erro construída localmente

**Adjudicação:** Controles positivos precisos de montagem do comando e interpretação de erro. Não atribui esses aceites à autorização ou integração externa.

**Limites:** Leitura estática; suíte não executada; Sem handler/CRM/RLS real nem referência a implantação

## 14 — src/lib/__tests__/emailHtml.test.ts

**SEMANTIC_FULL_FILE** · 337 linhas · SHA-256 `0df1832670460d8868116aa4cbb5a041c219d43727876884b7a08273f9ae133c`.

**Asserções:** XSS básico, links seguros e remoção de tags ativas; Imagem remota HTTPS e cid bloqueados, data grande removida, data pequena preservada; CSS bloqueado, dimensões, comentários, url em qualquer prop, escapes e declarações malformadas; Tags HTML permitidas e buildBodyPreview para null, limites, entidades e espaços

**Mocks e fixtures:** Sanitizador e preview reais; DOMParser para inspecionar HTML produzido; HTML hostil sintético, sem serviço externo ou rede

**Adjudicação:** Asserções negativas significativas com controles de preservação. COM011 é uma forma distinta de URL (//host) não decidida pelos casos HTTPS; não se cria finding pela mera ausência desse caso.

**Limites:** Leitura estática; suíte não executada; Inspeção de strings/DOM não demonstra todos os comportamentos CSS de navegador; Teste de headings anuncia h1–h6, mas verifica apenas h1/h3; escopo de asserção registrado sem defeito de produto inferido

**Achados relacionados:** R2-COM-011

## 15 — src/lib/__tests__/webhookStatusPriority.test.ts

**SEMANTIC_FULL_FILE** · 130 linhas · SHA-256 `5f6bca243c62a7d7ab516b7628288928a14304e4ce41134e9f2700976baf107a`.

**Asserções:** Prioridade local em estado null, progressão, regressão e mesmo estado; deleted/failed sobrepõem sempre; played/read empatam, received/sent empatam; Estados desconhecidos usam prioridade0

**Mocks e fixtures:** STATUS_PRIORITY e shouldUpdateStatus são definidos inteiramente no próprio teste; nenhum módulo de produção é importado

**Adjudicação:** Este arquivo testa uma reimplementação local da regra. Pode documentar intenção, mas seu resultado não é evidência de execução nem regressão do webhook real. Não há novo ID apenas por esse isolamento.

**Limites:** Leitura estática; suíte não executada; Mudança no handler ou helper real pode não alterar asserções deste arquivo; Não modela conexão, identidade, persistência, concorrência ou ordenação de eventos

## 16 — src/pages/__tests__/ViewRouter.multiplix-gate.test.tsx

**SEMANTIC_FULL_FILE** · 85 linhas · SHA-256 `8c2e56c4c63dd27215eab55a479228df03037411c9d724ac237d175a79e93de9`.

**Asserções:** Rota Multiplix bloqueia staff sem permissão nomeada e permite agente com permissão; Rota catálogo não apresenta bloqueio para agente

**Mocks e fixtures:** ViewRouter real/QueryClient, useUserRole inteiramente simulado; Views pesadas substituídas por marcadores; caso catálogo só afirma ausência do gate

**Adjudicação:** Contratos de gate local claramente delimitados e caso negativo útil. Não prova concessão real da permissão pelo RPC nem render completo do catálogo; o próprio comentário explicita este limite.

**Limites:** Leitura estática; suíte não executada; Sem carregamento de roles/permissões de backend nem autorização das Edge Functions

## 17 — supabase/functions/_shared/__tests__/ai-audio-authz-runtime.test.ts

**SEMANTIC_FULL_FILE** · 135 linhas · SHA-256 `f6006323c4dcd4bb5f465d732a5dc289193ddf3fe2f93648406912f939f94d67`.

**Asserções:** Cliente Supabase do helper usa JWT do chamador e anon key na consulta de messages; Linha invisível retorna404; linha visível usa media_url; URL nula permanece null; Erro de banco mantém500; falta de messageId/Bearer impede fetch

**Mocks e fixtures:** assertMessageVisibleToCaller real e SDK real com fetch falso capturando URL/headers; Valores de ambiente sintéticos definidos no arquivo; nenhum SQL/RLS real

**Adjudicação:** O caminho central do helper é exercitado em vez de apenas parsing. A fixture de media_url=null explicitamente delega decisão ao handler: não refuta API027, que combina mensagem visível sem mídia com URL alternativa no consumidor.

**Limites:** Leitura estática; suíte não executada e ambiente real não lido; RLS é representada por respostas []/[row]; prova transporte do JWT, não política implantada; Não executa handler de transcrição, download ou provedor

**Achados relacionados:** R2-API-027

## 18 — supabase/functions/_shared/__tests__/ai-auth-service-path.test.ts

**SEMANTIC_FULL_FILE** · 86 linhas · SHA-256 `8627c2935a7b4d6037ccef3f7c0d64e60709c2ae199d46d38fc0f6650a9bd92e`.

**Asserções:** Reconhecimento da service key exata versus variação e ausência; requireAiIdentity recusa serviço403; variante OrService aceita kind=service; Quarta chamada acima do teto3 porIP retorna429; ambiente semkey não concede serviço

**Mocks e fixtures:** Helpers reais com chave/IPs sintéticos definidos em Deno.env no arquivo; Sem handler classify-sticker nem chamada ao modelo no teste

**Adjudicação:** Controle positivo do caminho de serviço e seu limiter local. Asserções de igualdade não medem tempo constante, e acceptance do helper não confirma aplicação uniforme nos endpoints.

**Limites:** Leitura estática; suíte não executada, nenhum ambiente real acessado; Limite em memória/IP sintético não é prova distribuída ou de identidade do IP no deployment

## 19 — supabase/functions/_shared/__tests__/ai-auth.test.ts

**SEMANTIC_FULL_FILE** · 87 linhas · SHA-256 `2676fcdff3965f951ddf7d8f65a3420fbeeb7630e0a220b3a63bbbdfd4e49145`.

**Asserções:** Chave exata; prefixo/sufixo/case inválidos e ausência deBearer/key; Bearer case-insensitive; identidade ausente ou sessão inválida401, service403

**Mocks e fixtures:** isServiceRoleRequest/requireAiIdentity reais; chaves sintéticas; Um caso altera/restaura servicekey; validação de usuário não recebe cliente mock explícito neste arquivo

**Adjudicação:** Asserções úteis de igualdade e rejeição. O título de comparação em tempo constante descreve intenção; estes casos não realizam medição temporal. Não é prova de sessão válida ou autorização por objeto.

**Limites:** Leitura estática; suíte não executada; não se leu nem configurou ambiente real; Sem mock de fetch explícito no caminho de sessão inválida, portanto não assumo execução offline autônoma do arquivo fora da configuração de CI

## 20 — supabase/functions/_shared/__tests__/ai-context-revalidation.test.ts

**SEMANTIC_FULL_FILE** · 222 linhas · SHA-256 `db2e245bc0e4a9cb256985e72fe8cc4ccd7d5a51e925db804faf4a2ed244aa27`.

**Asserções:** Schemas requestId/contextVersion/periodKey e compatibilidade de cliente antigo; Comparação de versões null/undefined/opacas/temporais; declaredVersion tem precedência; Revalidação de visibilidade e supersessão; versão que lança permite current=true; Envelope cancelled preserva requestId/context/reason e omite ausência

**Mocks e fixtures:** Schemas/helpers reais, callbacks de leitura em memória com UUIDs/timestamps fixos; Persistência é representada apenas por boolean persistiu=true no teste; nenhuma RPC executada

**Adjudicação:** Confirma decisão pura e contrato do envelope; não demonstra atomicidade entre releitura e efeito. Esse limite é diretamente relevante a INF023; o teste não contrapõe a corrida concorrente do handler/RPC.

**Limites:** Leitura estática; suíte não executada; Nenhum servidor/modelo/RPC e nenhum efeito persistente é avaliado; Declaração temporal do cliente e erro de versão são aceitações explícitas do helper, não achados novos por si sós

**Achados relacionados:** R2-INF-023

## 21 — supabase/functions/_shared/__tests__/ai-response-contracts.test.ts

**SEMANTIC_FULL_FILE** · 386 linhas · SHA-256 `71e1dd700a05c0db961bbddb64979d93df19852296f9d9ff7bd86bb0870074b4`.

**Asserções:** Análise/resumo rejeitam enums, tipos, notas e tamanho de arrays inválidos com paths precisos; Opcionais ausentes não ganham defaults; zero/null sobrevivem; Sugestões exigem3 itens/texto e tags exigem confiança0–1/nome; Envelope omite undefined, preserva null e compõe erro com parser

**Mocks e fixtures:** Schemas/parser/envelope reais com fixtures sintéticas; Valor válido de sentimento/urgência vem do próprio vocabulário; vários limites esperados são literais independentes

**Adjudicação:** Bons casos de contratos estritos dos helpers. Não prova que todo handler usa os schemas; o endpoint de sugestão foi auditado separadamente por Infra. AutoTagOutput validado isoladamente não demonstra limpeza de tags no DB quando array vazio.

**Limites:** Leitura estática; suíte não executada; Sem handler de produção, prompt/modelo nem persistência; A composição parser+envelope é feita no teste; não é integração completa Edge

**Achados relacionados:** R2-API-033

## 22 — supabase/functions/_shared/__tests__/ai-vocabulary.test.ts

**SEMANTIC_FULL_FILE** · 241 linhas · SHA-256 `b44e2d18fb71edf72a4ff96c86a3cffb7e0ed4eb482a29b83e2b006d2bbe8d8b`.

**Asserções:** Conjuntos canônicos literais de sentimento/urgência/prioridade; Matriz de legados, trim/case e rejeição de ausentes/tipos errados/valoresinventados; Conversão urgência→prioridade preserva null e rejeita valores runtime inválidos; Consistência entre escalas e idempotência da normalização

**Mocks e fixtures:** Normalizadores de produção reais; matrizes completas declaradas no teste; Nenhuma dependência de DB ou rede

**Adjudicação:** Especificação testável dos vocabulários, com negativos e invariantes. Não comprova os usos de todos os consumidores, mas não há falha concreta adicional no arquivo.

**Limites:** Leitura estática; suíte não executada; Tradução semântica externa e mapeamento de cada campo persistido não são demonstrados apenas por esses helpers

## 23 — supabase/functions/_shared/__tests__/chatbot-l1-output.test.ts

**SEMANTIC_FULL_FILE** · 153 linhas · SHA-256 `a09ef818fa889c23132b02035f2967b86e6530c4514b7b78b4b6c168d953ada1`.

**Asserções:** ChatbotL1Output valida campos obrigatórios, confidence numérica0–1/zero/ausência; Sentimento deve ser canônico; erro em tipo nãoobjeto ou response vazio; Normalização real compõe legadoEN e omissão de valor desconhecido antes do schema

**Mocks e fixtures:** Parser/schema/normalizador reais; fixture sintética de resposta; Pré-normalização129–145 é composição local que simula o handler, explicitamente comentada

**Adjudicação:** Prova os helpers e sua composição local, sem afirmar execução do chatbot. Não cria defaults para campos ausentes nos casos exercitados.

**Limites:** Leitura estática; suíte não executada; Não chama handler, modelo, busca de artigos, transferência ou persistência

## 24 — supabase/functions/_shared/__tests__/crm-integration-contract.test.ts

**SEMANTIC_FULL_FILE** · 78 linhas · SHA-256 `1498c9576ee872c45d5a51a3e1f19a4a5d71c45e8cc509fb616f6d976eb737f1`.

**Asserções:** Telefones e identificadores; pin de URL/projeto/role de chave externa; Allowlist de RPC/args/ordenação e limites; mutações restritas por ação/campo/match; parseSyncResult rejeita falsos sucessos; extractContact360Id aceita apenas identidade delimitada

**Mocks e fixtures:** Helpers reais; JWTs sintéticos com payload base64 e assinatura literal de fixture; Chave fake não é credencial; nenhuma validação criptográfica remota executada

**Adjudicação:** Contrato local fail-closed tem controles positivos e negativos relevantes. A inspeção de claims configura o cliente esperado; não deve ser apresentada como prova da validade criptográfica da chave.

**Limites:** Leitura estática; suíte não executada; Sem servidor CRM, efeito de mutação, RLS ou autenticação da assinatura do JWT

## 25 — supabase/functions/_shared/__tests__/cron-secret-authz-l5.test.ts

**SEMANTIC_FULL_FILE** · 247 linhas · SHA-256 `ed87b4a823ee657dc19366dac2dadaa0d83acc6aa42bbae5e5147b0fd198e8e5`.

**Asserções:** Mesma matriz para connection-health-check e batch-fetch-avatars: anon, ausente, segredo correto/errado, Vault falho eOPTIONS; Caminho sem header não lê Vault; correto alcança200 com tabela vazia; preflight temCORS semVault

**Mocks e fixtures:** Handlers reais com dependências _injected; Vault/Auth/DB falsos; Builder thenable é lazy na resolução, filtros não modelados; tabela vazia evita provedores; IPs distintos isolam limiter e environment de Evolution é sintético no arquivo

**Adjudicação:** Teste de gate atravessa os handlers e contém controles positivos/negativos válidos. O 200 é deliberadamente sem trabalho de provider; não é aceite de healthcheck/avatar em produção nem das rotinas adicionais de API022.

**Limites:** Leitura estática; suíte não executada; Sem DB/Vault/RLS/gateway implantado, linhas reais ou chamadas Evolution; Mensuração de timing do segredo não integra as asserções

## 26 — supabase/functions/_shared/__tests__/effect-reconcile.test.ts

**SEMANTIC_FULL_FILE** · 285 linhas · SHA-256 `14298729305c23976af84e9fa2231343e0d943cec246ca49ef2155a86491cdde`.

**Asserções:** Recibo durável ou sonda v2→succeeded; GO sem recibo→partial; tentativas esgotadas→UNCONFIRMED; Spy comprova leitura de histórico e nenhuma rota de envio nas fixtures; Payload/efeito inválido recusados; enqueues repetidos usam chave/payload estáveis e registro HANDLERS existe

**Mocks e fixtures:** Helpers/handler de reconciliação reais com DBchain que ignora filtros e escritas; fetch espiado/respostas sintéticas; RPC retorna sempre o mesmo jobUUID; Configuração v2/GO definida por fixtures no arquivo

**Adjudicação:** Confirma decisão e que reconciliação não reenvia no caminho exercitado. O título promete atualização de origem, mas update é pass-through sem captura/estado: asserções de succeeded não demonstram a linha gravada. Mesmo jobID decorre do mock; chave estável é efetivamente inspecionada, unicidade SQL não é executada.

**Limites:** Leitura estática; suíte não executada; Sem durabilidade/RPC concorrente/reaper real; HANDLERS é apenas presença do registro; Não confundir conciliação de efeito com execução paga sem heartbeat de API026

**Achados relacionados:** R2-API-026

## 27 — supabase/functions/_shared/__tests__/evolution-call-events.test.ts

**SEMANTIC_FULL_FILE** · 131 linhas · SHA-256 `492d2cc451d47382088e737d8d437193cf9a4c407ae76edc4ad363f83f5ca124`.

**Asserções:** Quatro eventos offer/accept/reject/terminate viram status/rpc/id/direção/notificação esperados; fromMe/isOutgoing e instante inválido/ausente; saída não notifica; Identidade de conexão/contato presente na chamadaRPC

**Mocks e fixtures:** handleCallEvent e notification-events reais; clientthenable capturaRPC masignora filtros; Quatro JSONs sintéticos de13linhas lidos integralmente e pinados como dependências

**Adjudicação:** Valida mapeamento do envelope sintético até argumentos RPC. As fixtures declaram não serem capturas reais; não uso sua afirmação sobre inexistência de eventos no banco como evidência operacional desta auditoria.

**Limites:** Leitura estática; suíte não executada; Mockde conexão/contato sempre encontra a mesma identidade; não prova correlação em múltiplasconexões nem atomicidade deRPC; Não é teste de payload real do provider nem de persistência/notificação entregue

## 28 — supabase/functions/_shared/__tests__/evolution-go-routes.test.ts

**SEMANTIC_FULL_FILE** · 356 linhas · SHA-256 `b2751107980df6f850a5d5db9c50157ef119e174c747f7e1bb0630017987402b`.

**Asserções:** Tradução v2→GO de textos/mídias/citações de contato/polls/listas/botões/status; Payload incompleto de reação/read/label vira invalid; device suffix e LID; Presença, bloqueio, arquivo, contatos, criação/conexão/status/QR, grupos/perfil/privacidade/webhook; Rotas sem equivalente retornamnull; auth instance/admin selecionado no objeto

**Mocks e fixtures:** translateV2ToGo real com inputs sintéticos; nenhuma respostaHTTP nem credencial de instância

**Adjudicação:** Asserções úteis do tradutor e dos campos omitidos. Privacidade parcial é correta aqui, mas API014 acontece na etapa seguinte de leitura/merge; null não prova um 404 remoto nem que o chamador trate unsupported corretamente.

**Limites:** Leitura estática; suíte não executada; Nenhuma chamada ao EvolutionGO para verificar gotchas alegados nos nomes dos testes; Auth no objeto é seleção de modo, não autorização do usuário/instância de API001

**Achados relacionados:** R2-API-001; R2-API-014; R2-API-015; R2-API-042

## 29 — supabase/functions/_shared/__tests__/evolution-webhook-connection-risk.test.ts

**SEMANTIC_FULL_FILE** · 119 linhas · SHA-256 `0e42607fb0f65af95723bc11b26e454c0105e69c85c2d62c0c13261c13de0f6d`.

**Asserções:** TempBanned/Banned/connectFailure mapeiam sinal e classe na RPC de risco da conexão; Queda transitória e conexão desconhecida não registram risco; RPC recusada não lança para o webhook

**Mocks e fixtures:** handleConnectionUpdate real; builder ignora filtros/updates, captura inserts/RPC; PrevStatus e connectionId fixados por cenário, sem concorrência

**Adjudicação:** Demonstra o fio até a RPC e a classificação dos motivos. Erro da RPC explicitamente absorvido não comprova que o dispatch ficou pausado; sem novo ID por esse limite.

**Limites:** Leitura estática; suíte não executada; Não executa SQL de risco/pausa nem webhook HTTP completo; Mock não prova seleção da conexão por instância nem update persistido

## 30 — supabase/functions/_shared/__tests__/f58-item-receipts.test.ts

**SEMANTIC_FULL_FILE** · 123 linhas · SHA-256 `536d894bcfcd70760284daff62babb6a1f27b5e7d3bc72f5e630072e9ed36992`.

**Asserções:** DELIVERY_ACK chama RPC de item com external_id/conexão e p_event omitido; READ repassa p_event=read; fromMe=false não atualiza item; Registro de item independe do resultado positivo do recipient TalkX

**Mocks e fixtures:** handleMessagesUpdate real com envelope v2 já normalizado e fromMe explícito; RPC async imediatamente captura; conexão fixa e demais leituras retornam null

**Adjudicação:** Bons testes do fanout de receipt por item. Não passam pelo tradutor GO que produz fromMe de API002, nem modelam builder RPC lazy; não refutam os achados dessas fronteiras.

**Limites:** Leitura estática; suíte não executada; Nenhum SQL de reconciliação, estado outcome_unknown ou receipt durável é executado; Captura de chamada não demonstra aguardo da execução do SDK

**Achados relacionados:** R2-API-002

## 31 — supabase/functions/_shared/__tests__/gmail-helpers-account-scope.test.ts

**SEMANTIC_FULL_FILE** · 86 linhas · SHA-256 `c363d7e55ce07777e2613ad5ec4c338aab10f1b6f904d716c6ebc958186a6e8a`.

**Asserções:** syncMessages sincroniza uma mensagem e reconcilia unread com filtros gmail_account_id/thread_id; UPDATE de thread reancora a mesma conta e UUID

**Mocks e fixtures:** syncMessages real com fetch Gmail falso de uma página/uma mensagem plain text; Builder registra cada operação e resolve por tabela; escrituras retornam sempre sucesso

**Adjudicação:** Asserções inspecionam efetivamente filtros de conta, controle positivo relevante de isolamento. Não demonstram múltiplas páginas, falha parcial ou cursor, portanto não adjudicam API011/012.

**Limites:** Leitura estática; suíte não executada; Não executa RLS, unicidade ou Gmail real; nenhuma fixture de anexo; Resposta sempre de uma conta e uma mensagem

**Achados relacionados:** R2-API-011; R2-API-012

## 32 — supabase/functions/_shared/__tests__/gmail-send-schema.test.ts

**SEMANTIC_FULL_FILE** · 87 linhas · SHA-256 `2363f665deebdb0f120a4364036fdfac0777de9fb0fb86b54d73ce5f6ca50715`.

**Asserções:** Gmail IDs seguros versus path/query/fragment/percent encoding/espaço/vazio/tamanho; Array de IDs rejeita qualquer elemento inválido; CRLF em destinatário/assunto/anexo; ações thread/draft; limite agregado de anexos

**Mocks e fixtures:** Schema de produção real, sem I/O; Base64 sintético grande é construído somente se a suíte executar; não foi alocado nesta leitura

**Adjudicação:** Negativos precisos da validação de entrada; reforçam rejeição do vetor de header/path injection na fonte auditada. Não provam enforcement de cada campo em toda ação do handler.

**Limites:** Leitura estática; suíte não executada; Sem MIME enviado, API Gmail, autorização de conta ou efeito no banco

## 33 — supabase/functions/_shared/__tests__/messaging-errors.test.ts

**SEMANTIC_FULL_FILE** · 151 linhas · SHA-256 `c44723b934938976105d36fbfcf706769c1db8addf670ce49517c865a8a7276d`.

**Asserções:** Opt-out e número inexistente permanentes, inclusive status5xx; 429/5xx transitórios, backoff30s/2min/10min e quarta tentativa terminal; Corpo ilegível/circular/BigInt ou status desconhecido preservam unknown; Mensagens ao operador mapeadas e não expõem JSON nas strings do catálogo

**Mocks e fixtures:** Classificadores e planejador reais com relógio T0 fixo; Corpos sintéticos, sem timer, worker ou rede

**Adjudicação:** Prova decisão pura de retry e seu teto. Não é prova de que todos os workers aplicam exatamente o plano ou de que um erro pós-POST pode ser reenviado com segurança.

**Limites:** Leitura estática; suíte não executada; Sem agendamento real, deduplicação, outcome_unknown ou rate limit do provedor

## 34 — supabase/functions/_shared/__tests__/messaging-evolution-go.test.ts

**SEMANTIC_FULL_FILE** · 207 linhas · SHA-256 `108ef0216401b95217f24603f354e56993d68efb187b52f02ae57c426d801585`.

**Asserções:** Capabilities e presença por tipo; GO routes/body/token corretos para texto/imagem/documento/áudio/PTT; Documento sem filename e texto excessivo falham antes de fetch; Erro400 do provedor retorna ok=false, status e ausência de messageId

**Mocks e fixtures:** send e tradutor reais com fetch injetado imediato que grava chamadas; Flavor explícita GO evita contaminação por env de outros testes; nenhum token real

**Adjudicação:** Evidência útil da serialização e seleção de credencial de instância. Fetch sempre resolve imediatamente: não testa cancelamento durante presença, achado API031; erro de presença e de envio recebem a mesma fixture no caso negativo.

**Limites:** Leitura estática; suíte não executada; Sem timeout/AbortSignal, efeito em fila ou envio externo real; Capabilities locais não são verificação de disponibilidade remota

**Achados relacionados:** R2-API-031

## 35 — supabase/functions/_shared/__tests__/multiplix-eligibility.test.ts

**SEMANTIC_FULL_FILE** · 140 linhas · SHA-256 `d576f50798f93f875a67cd6d52140a83efea6694057f903e7131f5fc14ff675f`.

**Asserções:** Sete elegibilidades canônicas, unicidade e rótulos exaustivos; Matriz Singu PT→Zapp EN, trim/case e pares de vocabulário; Null/undefined explicitamente elegíveis para legado; valores desconhecidos viram out_of_scope

**Mocks e fixtures:** Mapa/normalizador reais com matrizes sintéticas de entradas

**Adjudicação:** Distingue ausência histórica de valor desconhecido, em vez de alegar que todos os inputs inválidos falham fechados. Não surge novo defeito só porque a compatibilidade null é permitida.

**Limites:** Leitura estática; suíte não executada; Sem leitura do produtor Singu, RPC de audiência ou enum implantado; declaração de NOT NULL do comentário não é prova SQL

## 36 — supabase/functions/_shared/__tests__/secure-egress.test.ts

**SEMANTIC_FULL_FILE** · 100 linhas · SHA-256 `9e0dce5151dcbf7c2ada9a94f20257c6d72804d8e9b001731d9a9ad77541d41a`.

**Asserções:** Fetch vai ao proxy, body é URL serializada e timestamp/nonce presentes; Assinatura possui64hex; resposta base64 vira corpo de prévia; ConfigHTTP/segredo curto e respostas malformadas/esquema file/status semcorpo falham fechados

**Mocks e fixtures:** Helpers de egress reais com fetcher, relógio e nonce injetados; Valores de configuração sintéticos; nenhuma URL de usuário realmente acessada

**Adjudicação:** Prova seleção do proxy e forma do corpo, com controles de não chamada. O teste denominado 'signs the exact body' só valida formato hex da assinatura, sem comparar HMAC esperado: não é prova criptográfica independente do conteúdo assinado.

**Limites:** Leitura estática; suíte não executada; Sem proxy remoto, DNS/redirect ou resistência a SSRF da infraestrutura; Nenhuma aceitação de segurança adicional é inferida só pela regex da assinatura

## 37 — supabase/functions/_shared/__tests__/talkx-reply-window.test.ts

**SEMANTIC_FULL_FILE** · 87 linhas · SHA-256 `e30bd3a3f800610353f868f37adc41d736dd3cd63d7b1acaeab75d04c1933697`.

**Asserções:** TalkX usa p_contact_id/p_phone/p_message_id; Multiplix usa phone/message/quoted_external_id sem contact_id; No recipient/item não lança; erro RPC também não propaga; Citação é repassada para atribuição linked

**Mocks e fixtures:** Wrappers reais com RPC async eager que captura argumentos e devolve resultado fixo

**Adjudicação:** Contrato de assinatura efetivamente testado e explicitamente separado do SQL no arquivo. Absorção de falha é aceita pelos casos; não prova recuperação após ingestão de API006 nem correlação/idempotência DB002.

**Limites:** Leitura estática; suíte não executada; Não executa janela de atribuição, dedupe, identidade ou persistência no banco; Mock eager não demonstra consumo de builder lazy nem durabilidade depois da resposta HTTP

**Achados relacionados:** R2-API-006; R2-DB-002

## 38 — supabase/functions/_shared/__tests__/talkx-resume-policy.test.ts

**SEMANTIC_FULL_FILE** · 219 linhas · SHA-256 `8b451a9c1a8eac4612d96e58a536f27d6b50a6478d2a84b289bddf230e9c9908`.

**Asserções:** Motivos de pausa e allowlist; manual não retoma, janela/conexão elegíveis retomam; Conexão caída/semID/desconhecida/semstatus impede retomada; Motivo com espaços não é aceito; fusos SP/NY produzem decisões distintas; Resolver por map e business_hours comparados com relógio fixo

**Mocks e fixtures:** Política real de retomada/janela com campanhas sintéticas e resolver em memória; Casos de mutação histórica explicitados com entradas que discriminam a guarda

**Adjudicação:** Conjunto consistente de negativos e controles positivos da política pura, inclusive casos que distinguem missing ID e timezone. Não representa o scheduler HTTP nem a transição SQL.

**Limites:** Leitura estática; suíte não executada; Sem RPC de retomada, concorrência, status de conexão observado ou horários persistidos em JSONB

## 39 — supabase/functions/_shared/__tests__/talkx-webhook-receipts.test.ts

**SEMANTIC_FULL_FILE** · 146 linhas · SHA-256 `7981d2222fa3f16dd77308bbe39188962c45771386236363b7f738fd3cea0a5d`.

**Asserções:** GO Chat≠Sender traduzido chama receipt TalkX canônico read/delivered; Repetição gera duas chamadas sem lançar; v2 fromMe=true continua válido; No-match gera warning e wrapper antigo não é usado

**Mocks e fixtures:** translateGoPayload e handleMessagesUpdate reais; RPC eager com retorno fixo; Envelope GO sintético inline e conexão fixa; logger capturado

**Adjudicação:** Este arquivo compõe efetivamente tradutor e handler para a correção X028. A garantia se limita ao TalkX; não verifica os consumidores Multiplix/inbox ainda dependentes de fromMe em API002. Idempotência é explicitamente delegada à RPC.

**Limites:** Leitura estática; suíte não executada; Sem deduplicação SQL, builder lazy ou persistência de receipt; Fixture não substitui captura de provider em produção

**Achados relacionados:** R2-API-002

## 40 — supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts

**SEMANTIC_FULL_FILE** · 180 linhas · SHA-256 `6a039ffce60a2030772f78037f09868e5c1a506f3885697af0008f9363d1a510`.

**Asserções:** Mensagem GO traduzida e ingerida envia contato/phone/message à attribute_talkx_reply; Promise da atribuição fica pendente: handler não resolve antes do release; SAIR vindo do seed configurado não conta como resposta; no-recipient não lança

**Mocks e fixtures:** Handler de entrada e adaptador reais; ingest/RPC/keywords em memória; Gate de promise é adiado, observação após 25 ms; sem campanha recente na fixture; Avatar já existe e demais consultas vazias evitam efeitos acessórios

**Adjudicação:** A asserção de await é substantiva, com bloqueio e liberação explícitos. Não testa falha depois de ingest nem replay que retorna duplicate, portanto não refuta API006/007. Atribuição SQL permanece fora do escopo.

**Limites:** Leitura estática; suíte não executada; Janela25ms depende do escalonamento do runner; não é mensuração do EdgeRuntime; Sem banco, opt-out persistido, evento duplicado ou RPC recusada

**Achados relacionados:** R2-API-006; R2-API-007; R2-DB-002

## 41 — supabase/functions/_shared/__tests__/voice-copilot-authz.test.ts

**SEMANTIC_FULL_FILE** · 133 linhas · SHA-256 `12b88bcd8d6e43890ac3e6681044e32d19082141ccc18a7c89dd4351cc5a682a`.

**Asserções:** Agente reivindica para si, mas não reatribui a terceiro; admin/supervisor podem; Sem perfil do chamador/destino ou roles não concede transferência; Allowlist de gestores e mensagem estável

**Mocks e fixtures:** decideReassignConversation/isReassignManager reais com IDs e papéis sintéticos

**Adjudicação:** Regra de autoatribuição é explícita, não automaticamente roubo de conversa. Asserções de helper não provam leitura autorizada do contato, origem JWT dos papéis ou escrita do endpoint.

**Limites:** Leitura estática; suíte não executada; Sem handler, sessão, RLS ou concorrência de atribuição

## 42 — supabase/functions/_shared/__tests__/webhook-auth-shadow.test.ts

**SEMANTIC_FULL_FILE** · 186 linhas · SHA-256 `6fbe80e6a0310b7652488881e762b69d08fc80c6c6f2f214b463c1249d787abc`.

**Asserções:** Helpers shadow aceitam ausência/erro de assinatura sem lançar e retornam metadados; HMAC válido genérico e ElevenLabs, igualdade do segredo legado; Gmail OIDC ausente/malformado/assinatura fake apenas decodifica/loga

**Mocks e fixtures:** Helpers reais; HMAC WebCrypto com segredos sintéticos; JWT Gmail explicitamente falsificado apenas como fixture; nenhum endpointHTTP chamado

**Adjudicação:** Documenta intencionalmente modo shadow e contextualiza API021. O texto inicial diz provar os quatro handlers, mas só importa helpers; ElevenLabs tem guard bloqueante adicional na produção, por isso não generalizo a falha a esse endpoint.

**Limites:** Leitura estática; suíte não executada; Ausência de throw no helper não determina sozinha o HTTP do consumidor; Sem gateway, validação OIDC real nem deployment

**Achados relacionados:** R2-API-021

## 43 — supabase/functions/_shared/__tests__/webhook-signature.test.ts

**SEMANTIC_FULL_FILE** · 211 linhas · SHA-256 `46f637f705e1197e0788acae941394ac2327f3d44b9fdda5504c3ea9a6f1cb97`.

**Asserções:** Parser de assinatura ElevenLabs exige timestamp/campos/hex; Verificador aceita assinatura correta e headerlegado; recusa secret ausente, payload alterado e segredo errado; Clock controlado recusa passado/futuro fora da tolerância; bordas299/301segundos e matriz adversária

**Mocks e fixtures:** Parser/verificador reais; HMAC esperado produzido independentemente com WebCrypto; Relógio e segredo fixos de fixture, sem rede

**Adjudicação:** Controle positivo/negativo preciso de assinatura e timestamp; contrapõe o helper shadow. Demonstra veredito criptográfico, mas a ligação ao retorno HTTP deve vir da leitura do endpoint já realizada.

**Limites:** Leitura estática; suíte não executada; Não testa dedupe de replay dentro da tolerância nem entrega de webhook real; Nenhuma falta genérica de caso é contada como novo achado

## 44 — supabase/functions/_shared/ai-generate.test.ts

**SEMANTIC_FULL_FILE** · 184 linhas · SHA-256 `487d1f631869a9fffec17f24f12b2f0b341175c30ea0fe031769e7b0366d53f1`.

**Asserções:** deriveAiIdempotencyKey real comparada a serialização/hash independentes de code-unit e locale; Casos discriminam pontuação/dígitos/caixa e chaves aninhadas; Ordem de inserção é estável; arrays preservam ordem; null/undefined e primitivos

**Mocks e fixtures:** Função exportada real é chamada; canonicalização/FNV de referência implementados no teste; Literais de serialização verificam a própria referência; nenhum DB/provider

**Adjudicação:** A réplica serve de oráculo comparado ao produtor real, portanto é distinta do teste que só executa cópia local. Prova estabilidade nos casos escolhidos; não garante ausência universal de colisão nem idempotência da chamada paga.

**Limites:** Leitura estática; suíte não executada; FNV32 não é provado injetivo pelas fixtures; reserva/reuso de orçamento pertence a DB004; Nenhum reserve/settle/modelo é chamado

**Achados relacionados:** R2-DB-004

## 45 — supabase/functions/_shared/ai-usage.test.ts

**SEMANTIC_FULL_FILE** · 997 linhas · SHA-256 `4ac3a3919ee492e9468f747380c1961988e7e455137b1810114a6b2716bf96f4`.

**Asserções:** logAiUsageDetached registra promise no waitUntil e fallback sem runtime aguarda portão do insert; Guarda textual de dois awaits no ai-proxy; UUID/correlação/tentativa e rejeição de e-mail/telefone como ID; POST observado leva rota efetiva/fallback/modalidade e preserva metadados; ausência não vira rota inventada; Stream preserva bytes/conta chunks, mede usage final, registra cancelamento/erro uma vez e distingue null de zero; Reconciliação de ações/tentativas/falhas/tokens, duplicata de rowID e linhas sem identidade; Tarifas sintéticas por vigência/unidade/fonte, fronteiras e custo desconhecido/null versus zero

**Mocks e fixtures:** Helpers reais e SDK Supabase real com fetch falso capturando POST; userId=null evita lookup deprofile; waitUntil simulado e promise de insert adiada; ReadableStream sintéticos com cancelamento/erro; Environment de fixture restaurado no próprio teste; tarifas e modelos são dados sintéticos, não preços verificados

**Adjudicação:** Provas substantivas de consumo da promise e de stream no helper. O POST sempre responde 201, portanto promessa registrada não é prova de durabilidade quando o DB falha. Guardas textuais do ai-proxy não executam todos seus ramos; API032 de teste pago sem log permanece fora desse aceite. Custo é aritmética de fixtures, sem reconciliação de fatura real.

**Limites:** Leitura estática; suíte não executada; nenhum ambiente real lido; Sem insert recusado, DB/RLS/EdgeRuntime real ou recuperação após encerramento forçado; Formato UUID não garante por si ausência de todo dado pessoal nos demais campos; Reconciliar contabilidade no helper não demonstra reserve/settle do orçamento SQL

**Achados relacionados:** R2-API-032; R2-API-043; R2-DB-004

## 46 — supabase/functions/_shared/messaging/__tests__/eligibility.test.ts

**SEMANTIC_FULL_FILE** · 199 linhas · SHA-256 `664d3a425c8facca55aca5bf2d8c9aeba209e2cd95bcecbad7cfb75a4dcd8a99`.

**Asserções:** Sete classes de elegibilidade com caso positivo e negativo; Destino inválido/ausente, blacklist normalizada, escopo/conexão/mídia/template; Precedência dos bloqueios e alcance de todos os valores do enum

**Mocks e fixtures:** eligibility real com contexto sintético; nenhum lookup em DB

**Adjudicação:** Negativos discriminam classes e sua precedência. Defaults permissivos de contexto ausente são explícitos; confiabilidade da coleta do contexto deve vir dos consumidores, não é provada pelo kernel isolado.

**Limites:** Leitura estática; suíte não executada; Sem falha de consulta de blacklist, autorização de audiência ou connection status real

## 47 — supabase/functions/_shared/messaging/__tests__/media.test.ts

**SEMANTIC_FULL_FILE** · 251 linhas · SHA-256 `08f4aa1d4fdd5ade07da202bbf42fb6d3b4990295d79f82138ae06e0ab622fa8`.

**Asserções:** Magic bytes de PNG/PDF/MP3 e detecção apesar de extensão/content-type falsos; 404, tamanho, documento sem nome e tipo desconhecido recusados; SignedURL expirada bloqueia ou re-assina com bucket/path/TTL; válida é preservada; Detector/decoder puros e shutdown do servidor em finally

**Mocks e fixtures:** prepareMedia real; arquivo criaria servidor loopback efêmero ao ser executado, mas não foi importado/executado; PNG/PDF/MP3 mínimos em base64 lidos no source; HEAD/GET da fixture sempre têm content-length verdadeiro; Token Storage sintético com assinatura literal e signer falso

**Adjudicação:** Fixture de HTTP local testa magic bytes e seleção de TTL quando executada; não é autorização de Storage. Esta auditoria apenas leu o arquivo, sem abrir servidor. Não valida conteúdo completo decodificável, SSRF remoto ou tamanho oculto após cabeçalho falso.

**Limites:** Leitura estática; suíte não executada; Nenhum servidor, download, Storage ou provider foi acionado; Token de fixture não tem assinatura válida; decoder apenas lê exp

## 48 — supabase/functions/_shared/messaging/__tests__/personalize.test.ts

**SEMANTIC_FULL_FILE** · 175 linhas · SHA-256 `ef5aac48e24d68fbea9b20347bd8ccee7e71d87f603ad61848a43f6d681101ee`.

**Asserções:** Placeholders TalkX built-in/custom/link/rótulos, case e desconhecidos; Nomes reservados não são sobrescritos; valor custom não é reprocessado; propriedades herdadas não vazam; Dialeto Multiplix aceita empresa/saudação e rejeita outras variáveis

**Mocks e fixtures:** Personalizadores reais; contato/campos/URLs sintéticos; Saudação não fixa relógio, aceita qualquer uma das três faixas

**Adjudicação:** Asserções de substituição e precedência são relevantes. O nome do caso link desconhecido diz 'never [link:rotulo]', mas o corpo exige esse texto e a marca unknown; o aceite real é a presença de unknown, não uma rejeição automática do envio.

**Limites:** Leitura estática; suíte não executada; Sem leitura de custom fields ou snapshot de campanha; não prova consumidor tratar unknown; Caso saudação verifica vocabulário, não correção de faixa horária específica

## 49 — supabase/functions/_shared/messaging/__tests__/phone.test.ts

**SEMANTIC_FULL_FILE** · 185 linhas · SHA-256 `0656bf99ab5cdda632c552ae759c2d488c7710e9f1dfbef32e5bbcd3f72909e7`.

**Asserções:** Variantes com/sem nonodígito, preservaçãoDDD, '+' e remoção de sufixo de dispositivo; Ausência/vazio/LID e warning; exceção de grupo longo; Bloco RED-BEFORE compara strip local antigo com normalizador real

**Mocks e fixtures:** normalizePhone/generatePhoneVariants reais; console.warn espiado; destinoE164Cru é cópia histórica local na138, sem importar o worker

**Adjudicação:** Os testes do kernel importam produção. O bloco RED-BEFORE demonstra diferença entre algoritmos, não o comportamento atual do sender: fonte pinada de multiplix-send:458 já chama normalizePhone. Comentário de caminho 'atual' na linha 146 não deve sustentar um finding contra o pin.

**Limites:** Leitura estática; suíte não executada; Não prova validade de todo número E.164 internacional nem disponibilidade WhatsApp; Não usa contatos/RPC para provar correlação de identidade

## 50 — supabase/functions/ai-jobs-worker/index.test.ts

**SEMANTIC_FULL_FILE** · 108 linhas · SHA-256 `c0a9b1ceed8d82788df76bc8c0d17a15b26b06c9556dcc99d67b6c28a7fa163c`.

**Asserções:** Source guard recorta generateWithRouting e exige jobId/attempt do lease; Source do router declara/lê/repassa requestId/jobId/attempt para logger; Nega atribuições diretas de input.payload como jobId/attempt

**Mocks e fixtures:** Nenhum módulo de produção é executado; Deno.readTextFile + indexOf/regex verificam strings; Worker e roteador reais já foram lidos semanticamente no lote produtivo

**Adjudicação:** O arquivo declara corretamente que é guarda de origem, não prova de runtime. Não valida heartbeat, lease ou continuidade de log de API026. Regex pode ver texto sem execução; esse limite não vira achado genérico.

**Limites:** Leitura estática; suíte não executada; Não prova efeito de um job nem exige provedor real para toda possível prova offline; a limitação histórica do comentário não foi tomada como impossibilidade técnica; Sem cron, DB, fila ou modelo

**Achados relacionados:** R2-API-026

## 51 — supabase/functions/crm-integration/index.test.ts

**SEMANTIC_FULL_FILE** · 86 linhas · SHA-256 `9c6ad2e42255ee577d34e6a6c957431e74eaa6804ec7cba20830cd745f9a987d`.

**Asserções:** Participante externo do Email, primeira identidade e escapeIlikeExact; Redes sociais permitidas na projeção; Handler nega anônimo antes do body, body declarado grande413, cron fora do escopo403; Service credential recusada para emailContactContext400

**Mocks e fixtures:** Helpers e handler reais; valores de configuração/keys sintéticos definidos no arquivo; Casos HTTP são guardas precoces, sem mockfetch explícito; nenhum caminho de consulta bem-sucedida

**Adjudicação:** Negativos correspondem a gates locais do handler. Conferência pontual de index.ts:418–426 confirma que service/cron fazem parte da condição 400 de emailContactContext; IDs da fixture são UUIDs válidos, portanto não se alegou falso negativo por campo malformado.

**Limites:** Leitura estática; suíte não executada; Sem conta/thread visível, confirmação CRM, SQL ou chamada externa real; Tamanho declarado413 não comprova limite de stream diante de cabeçalho falso

## 52 — supabase/functions/multiplix-audience/index.test.ts

**SEMANTIC_FULL_FILE** · 480 linhas · SHA-256 `9d1fa678a1b733c82e1a77a1bf604ff4047265841dcdfd0dcdc3c1f33a9ceafc`.

**Asserções:** mapResolvedRecipients: elegibilidade, campos permitidos e ausência de company ID; cache por tipo/RPC, TTL, erro sem cache; lotes 1000, limite de política, truncamento e falha intermediária; assinatura de escopo: ordenação code-unit, payload e vetor HMAC independente

**Mocks e fixtures:** RPCs, relógio e resolver injetados; simulador de cap de 1000 linhas

**Adjudicação:** Helpers reais demonstram divisão e rejeição de truncamento, com vetor independente de assinatura. Sem novo achado.

**Limites:** Não exercita HTTP, autorização, SQL ou ambiente Singu. Comentário sobre cap observado é fixture histórica, não medição atual.; Caso descrito como non-array só testa array vazio; não cobre summary/estimate de API030.

## 53 — supabase/functions/multiplix-dispatch/actions/__tests__/audience.test.ts

**SEMANTIC_FULL_FILE** · 306 linhas · SHA-256 `5105f42ef888778c1da0cbf75c4cfbfba7ee0987ba08a753699003b2da397d20`.

**Asserções:** handleAudienceSelect: exclusão prevalece sobre seleção e retorno adversarial; principal por empresa e fallback; materializeFilteredCompanyIds: 5001 IDs em 26 páginas, máximo 10000 e rejeição anterior à paginação

**Mocks e fixtures:** Contexto de usuário e scope admin injetados; source.list/source.resolve simulados

**Adjudicação:** Boa verificação de filtros de exclusão e paginação do helper real. O cenário de seleção com 5001 injeta todos os IDs e não percorre ponte real. Sem novo achado.

**Limites:** Não prova autenticação do router, SQL/RLS nem semântica dos filtros do serviço externo.

## 54 — supabase/functions/multiplix-dispatch/actions/__tests__/blocks.test.ts

**SEMANTIC_FULL_FILE** · 469 linhas · SHA-256 `e067552c38f0ff421613f5d49336f71f3b5210d7529596afdef4c82e832d2ca2`.

**Asserções:** blocksUpsert: script/voice/personalização invalidam áudio, título preserva; versionamento, no-op, inserção e tipos; blocksDelete/Reorder: RPC, ordem, duplicatas, set mismatch, ownership e estados não editáveis

**Mocks e fixtures:** FakeSupabase aplica eq/order/limit e registra mutações; RPC retorna ordem simulada sem executar SQL

**Adjudicação:** Asserções verificam mudanças reais da tabela em memória e rejeições de proprietário/estado. Sem novo achado.

**Limites:** O caso rotulado bloco de outro dispatch usa ID ausente, sem semear bloco pertencente ao outro dispatch.; Sem router/auth, RLS, corrida concorrente ou execução da RPC de reorder.

## 55 — supabase/functions/multiplix-dispatch/actions/__tests__/inspect.test.ts

**SEMANTIC_FULL_FILE** · 619 linhas · SHA-256 `46c8e4f4d738354c2995a299a59652bb97991a0daeb7626eb3c77ae9dfc8e6c9`.

**Asserções:** preview e validate: personalização, fallback, assets congelados, campos ausentes e desconhecidos; summary: baldes, inclusion_reason, frase; estimate: mensagens, roteiros e caracteres; dispatch alheio

**Mocks e fixtures:** FakeQuery aplica eq/order mas ignora projeção select e limit; retorna todas as linhas; workerText chama kernel personalize, não executa worker; nove recipients

**Adjudicação:** Contratos locais de renderização e baldes são exercitados. Os mocks não refutam R2-API-029/030: preservam campos não selecionados e não impõem cap. Sem novo ID.

**Limites:** Destinatário rotulado alheio/inexistente é apenas ID ausente; não há recipient de outro dispatch.; Erro HTTP é composto manualmente após capturar DispatchError, sem router real. A afirmação de exaustividade de enum só exige Set.size>0.

**Achados relacionados:** R2-API-029; R2-API-030

## 56 — supabase/functions/multiplix-dispatch/actions/__tests__/lifecycle.test.ts

**SEMANTIC_FULL_FILE** · 367 linhas · SHA-256 `e430e44d541a1dcf1267bf9f29067911e37df4b8c7282549dbe9f3f079b7a7cd`.

**Asserções:** confirm preserva expected_version em cinco chamadas e delega uma RPC por requisição, sem INSERT direto; erro de materialização e revisão stale; status mantém sent/delivered/read/replied separados por recipient e bloco

**Mocks e fixtures:** fakeConfirm implementa staging, rollback e dedupe em memória; tableBuilder aplica eq/range/limit

**Adjudicação:** Demonstra argumentos e tratamento do handler, incluindo ausência de INSERT direto. Atomicidade/idempotência SQL são pressupostas pelo fake e não verificadas. Sem novo achado.

**Limites:** As cinco chamadas são sequenciais, sem concorrência real, DB ou router/auth; perfil simulado sempre é o proprietário.

## 57 — supabase/functions/multiplix-dispatch/actions/__tests__/listing.test.ts

**SEMANTIC_FULL_FILE** · 469 linhas · SHA-256 `bc53f0622ec6383ec549d9bbdfdadebe7eab204d55eea73202dbb8637b3f66df`.

**Asserções:** dispatch.list: dono, perfil ausente, manage_all, offset/limit/count e dispatch_id além dos 50; recipients.list: dono, inexistência, manage_all, status, paginação e payload inválido

**Mocks e fixtures:** Builder aplica eq/order/range/limit e count antes do recorte; registra tabelas consultadas e WHERE

**Adjudicação:** Verifica escopo antes de leitura e filtro por ID na mesma consulta. A capacidade do endpoint não prova que o hook envia dispatch_id ou consome paginação. Sem novo achado.

**Limites:** Autorização RPC injetada, sem RLS/HTTP; maybeSingle escolhe primeira linha e select não projeta campos.

**Achados relacionados:** R2-MOD-021; R2-MOD-022

## 58 — supabase/functions/multiplix-send/index.test.ts

**SEMANTIC_FULL_FILE** · 1269 linhas · SHA-256 `73052b058b26cb52950a131245095eea56dcdeda9f8d5180c770a4bfd9ba9005`.

**Asserções:** handleMultiplixSend: cron/service/JWT, papéis, manage_all e dono; start/pause; Opt-out em duas etapas e RPC falha; lote único/tetos; cota diária/conexão, janela e claim vazio; Envio de texto/mídia, normalização, filename/PTT/presença, WAMID, erro legível e risco da conexão

**Mocks e fixtures:** RPCs retornam Promises já resolvidas, mutam fila em memória; filtros de tabela ignorados; provider fetch captura URLs/payloads e serve cabeçalhos mágicos PNG/PDF/OGG; Env/flavor alterados e restaurados pelos testes; timers não simulados nem observados

**Adjudicação:** Muitos controles positivos de chamadas e efeitos em memória. Nenhuma asserção comprova execução de heartbeat lazy, encerramento de timers ou conclusão SQL tardia, preservando API013/031.

**Limites:** Mock RPC é Promise ávida, distinto do builder PostgREST lazy. Sem concorrência, lease real ou falha da persistência após envio.; Casos bem-sucedidos de mídia/texto forçam v2; stub de bloqueio conta apenas URLs /message/, não todas as variantes GO.

**Achados relacionados:** R2-API-013; R2-API-031

## 59 — supabase/functions/multiplix-voices/index.test.ts

**SEMANTIC_FULL_FILE** · 329 linhas · SHA-256 `64850eae7b1451f883951166d8898ce696fcdceabe66a892380fcc31cd552b90`.

**Asserções:** grantReachesCaller/visibleGrants/canRecoverAsset: papel, perfil, revogação, criador e staff; Handler: ausência de bearer/env, ação inválida, lista filtrada, acesso negado/invalidado e URL assinada

**Mocks e fixtures:** Fetch roteado por substring de URL devolve Auth/PostgREST/Storage; env de teste restaurado

**Adjudicação:** Exercita decisões reais e handler com respostas controladas, sem novo achado.

**Limites:** Não valida filtros do request nem RLS. TTL=300 é verificado na resposta da Edge, sem conferir expiresIn efetivamente enviado ao Storage ou validade da assinatura.

## 60 — supabase/functions/promogifts-catalog/index.actions.test.ts

**SEMANTIC_FULL_FILE** · 616 linhas · SHA-256 `156cabf0a596361def9a8002b56f6c491786abba59ccfabce39f8ecd68ceb317`.

**Asserções:** Seis ações de catálogo: auth/config/payload, query de produtos, categorias, fornecedores, stats/bootstrap, erros externos e range inválido; Cotas por ação, rejeição após limite, corpo inválido/malformado, falha do contador com log; select inclui full_path_readable

**Mocks e fixtures:** Builder registra métodos/args e retorna fila fixa; não filtra dados. Rate limit é Map local que modela RPC

**Adjudicação:** Exercita handler e argumentos de consulta. Atomicidade/distribuição do contador são supostas pelo mock. Falha aberta com log é decisão explicitamente testada, sem novo finding.

**Limites:** Teste de cache aceita zero RPCs por cache de teste anterior, sem isolamento ou expiração. Bootstrap só exige stats existente.; Nenhum banco externo ou PostgREST executado; arquivo contém deleção de env sem restauração no caso de configuração, mas não foi executado.

## 61 — supabase/functions/promogifts-catalog/index.test.ts

**SEMANTIC_FULL_FILE** · 87 linhas · SHA-256 `37358abda0f2b265ab22fa39193780959667582428b0d9afdf7c2f9a784a168f`.

**Asserções:** buildTagOrExpr: três/cinco cores, independência de colunas, sanitização e arrays vazios

**Mocks e fixtures:** Helper real com strings esperadas literais; combinação color/material feita no próprio teste

**Adjudicação:** Bom contrato de expressão local; não comprova parsing pelo PostgREST nem composição real do handler. Sem novo achado.

**Limites:** Não exercita a consulta SQL/JSONB externa.

## 62 — supabase/functions/talkx-link/index.test.ts

**SEMANTIC_FULL_FILE** · 219 linhas · SHA-256 `d9db60078f98f45d9c04fb26e0082a9aa2c1ab16afad450748e3320a39ec417b`.

**Asserções:** mergeUtm preserva query e ignora vazios; GET clique/redirect/404; POST secret, assinatura, timestamp vencido, sucesso/duplicate e valores inválidos

**Mocks e fixtures:** HMAC calculado apenas sobre body; Supabase ignora filtros e retorna conversão configurada

**Adjudicação:** Confirma guardas locais e tradução de resposta; duplicate é resposta pré-programada de uma única chamada, sem teste de repetição/dedupe. Não refuta API035/036.

**Limites:** Não troca timestamp mantendo assinatura, não verifica replay ou external_ref ausente contra SQL. Sucesso usa source explícito; mock aceita parâmetros SQL inválidos.

**Achados relacionados:** R2-API-035; R2-API-036

## 63 — supabase/functions/talkx-scheduler/index.test.ts

**SEMANTIC_FULL_FILE** · 320 linhas · SHA-256 `2c4a86b52bab1e4fd2757403d626d6b2ce7009078e9d90541e60f2684ddd944f`.

**Asserções:** Scheduler auth cron/service; retomada manual/janela/conexão; uma retomada por conexão; Fetch pendente termina por AbortController e próximo envio continua; teto de campanhas; ausência de evento duplicado

**Mocks e fixtures:** Builder separa scheduled/paused e ignora demais filtros; fetch pendente responde ao signal de abort; timeout de 25 ms injetado

**Adjudicação:** Timeout é exercitado com promessa realmente pendente; limites reais exportados são pinados. Sem novo achado.

**Limites:** Não prova consulta de vencimento/ordenação/limite do banco, transação ou dedupe entre ticks concorrentes. Retorno talkx-send é sempre sucesso nos demais casos.

## 64 — supabase/functions/talkx-send/_test-utils.ts

**SEMANTIC_FULL_FILE** · 431 linhas · SHA-256 `ae3bd2b150b83a601ab606c91ab4fee4e78c3aea808f4962f487e62ecef4604c`.

**Asserções:** Helpers de testes: request, builders, campanhas/recipients, env v2/GO, fetch, relógio e fila de continue

**Mocks e fixtures:** thenableQB ignora filtros/mutações e usa Promise resolvida; event builder registra no insert antes de await; Clock avança pelo atraso nominal do timer executado; makeContinueDeps simula retry_after, remoção da fila e claim por contador

**Adjudicação:** Arquivo auxiliar, sem asserções próprias. Registrado como infraestrutura de testes, sem confundir leitura com teste executado.

**Limites:** Não modela leases SQL, fencing, erros de persistência ou concorrência. Configuração de env feita pelos helpers não é restaurada por eles.

## 65 — supabase/functions/talkx-send/index.test.ts

**SEMANTIC_FULL_FILE** · 1107 linhas · SHA-256 `e41233d007d9d92a94fda0325bbf0196405fa4114b93f9268a73a93497950ed1`.

**Asserções:** Personalização e randomBetween; gates service/JWT/role e ações start/test/pause/cancel/retry; Continue: 45 destinos em três invocações, orçamento, retry_after e claim negado; start assíncrono sem POST e um kick; Envio v2/GO, falha 5xx outcome_unknown, dedupe de test com chave explícita/derivada, ator/motivo e eventos

**Mocks e fixtures:** Utilitários reais do roster64; RPCs com fila/claim simulados e provider com captura; Dedupe de test usa Map com erro 23505 e grava provider_message_id quando builder é awaited

**Adjudicação:** Boas verificações da orquestração e parâmetros. Retry outcome_unknown aceita RPC true e só confere success, sem validar estado elegível posterior; cancel só verifica status string. Não refuta DB014/015.

**Limites:** Invocações de lease e dedupe são sequenciais; não há perda de token durante POST, SQL ou persistência tardia.; Orçamento usa sleeps simulados e callbacks imediatos; não estabelece teto com rede lenta. Muitos gates usam resultados de papéis injetados.

**Achados relacionados:** R2-DB-014; R2-DB-015; R2-API-031

## 66 — supabase/functions/talkx-send/v20-daily-limit.test.ts

**SEMANTIC_FULL_FILE** · 92 linhas · SHA-256 `5421bd49f84bc6eb0be1ebcd08ea443cd4d9d4fc104611391099c0b54796b1b8`.

**Asserções:** V20 daily_limit=3: action start retorna 200 e chama pausa daily_limit

**Mocks e fixtures:** DualQB diferencia array/single, count fixo3, settings legado e provider sucesso

**Adjudicação:** Teste exige motivo de pausa, sem observar POST ou caminho continue. Sem execução nesta auditoria; compatibilidade do fixture legado com contrato atual é limitada.

**Limites:** Não implementa talkx_connection_send_budget no mock; não prova cota distribuída nem ausência de quarto envio pelo provedor.

## 67 — supabase/functions/talkx-send/x019-connection-budget.test.ts

**SEMANTIC_FULL_FILE** · 121 linhas · SHA-256 `ee8909e4081cc62a771588144509123f07b4676c28a0c65b4342effe8f6984e9`.

**Asserções:** Token da conexão B em todos os headers; day_remaining zero pausa; minute_limit2 encerra com sent=2

**Mocks e fixtures:** Clock e orçamento injetados; contador de mensagens só reconhece /message/; primeiro caso configura flavor GO

**Adjudicação:** Token é observado no fetch. Os casos de ritmo não estabelecem janela SQL real; há desalinhamento do contador de URLs com GO, preservado como limite de teste e sem novo finding produtivo.

**Limites:** Casos2/3 não redefinem flavor após setDispatchEnvGo do primeiro; /send/text não é contado por messagePosts. Clock.restore está fora do finally e falha prévia pode contaminar próximos casos.

## 68 — supabase/functions/talkx-send/x020-variavel-precedencia.test.ts

**SEMANTIC_FULL_FILE** · 81 linhas · SHA-256 `0b36b883cbead2129f8621e770b7d9087b4aae58682be8f96ebddd8b48b0b5fa`.

**Asserções:** Defaults, missing/unknown, vendedor/telefone/data; pickVariant estável para ID e distribuição entre 50 IDs

**Mocks e fixtures:** Variantes retornadas sempre na mesma ordem; funções produtivas importadas

**Adjudicação:** Determinismo é demonstrado apenas com sequência fixa. Comentário sobre ausência de viés de ordem não é coberto e não refuta API020.

**Limites:** Sem permutação da resposta do banco ou validação de pesos/ordenação SQL; data só confere formato.

**Achados relacionados:** R2-API-020

## 69 — tests/contracts/crm-sentiment-boundary.contract.test.ts

**SEMANTIC_FULL_FILE** · 186 linhas · SHA-256 `f3353fc92eadf94f52a665e5a9fbaafa2c65518738c170b16d11ab17997b3898`.

**Asserções:** sentimentForExternalCrm: quatro canônicos, ausência, lixo e log; buildSyncInteractionArgs omite sentimento e preserva identidade da fila; Scanner remove comentários e exige call site/construtor e ausência de fallback neutral

**Mocks e fixtures:** SDK Deno mockado; helpers reais importados, chamadas CRM não executadas

**Adjudicação:** Asserções comportamentais demonstram mapeamento e omissão no objeto de argumentos; controle textual vincula call site. Sem novo achado.

**Limites:** Não prova domínio/default da RPC externa. Caso intitulado único neutral só exige ocorrência >=1 e mapa, sem exclusividade textual.

## 70 — tests/contracts/email-sender-domains.contract.test.ts

**SEMANTIC_FULL_FILE** · 84 linhas · SHA-256 `46b40f21be93382e794a6ab95074f315f3644c0bb736e9af40837335038e4e50`.

**Asserções:** Scanner de todos os TS Edge: domínios proibidos, from literal permitido e remetentes fixos de alertas

**Mocks e fixtures:** Leitura textual/regex, sem importar handlers ou enviar e-mail

**Adjudicação:** Verifica literais presentes na fonte. Comentário de domínio já verificado não é prova da configuração vigente do provedor. Sem novo achado.

**Limites:** Regex não cobre todo fluxo de dados/remetente dinâmico; varredura inclui testes/comentários. Não comprova destinatário, entrega ou autorização do send-email.

**Achados relacionados:** R2-API-022

## 71 — tests/contracts/evolution-private-storage-url.test.ts

**SEMANTIC_FULL_FILE** · 89 linhas · SHA-256 `85f9c5d4e96136eb40e784c8a9e7a1468eedd0f503fbea9d14f3913ee08255b1`.

**Asserções:** resolvePrivateBucketUrl: re-assina public/sign/authenticated com TTL 300, origem/bucket, traversal e falha do signer

**Mocks e fixtures:** Storage.from/createSignedUrl mockados; helper real e assertions de path/TTL

**Adjudicação:** Bom controle de origem, locator e chamada do signer. Não cobre autorização do objeto pelo usuário ou despacho final. Sem novo achado.

**Limites:** Assinatura e acesso real ao Storage não verificados; helper não recebe identidade do usuário.

## 72 — tests/contracts/multiplix-audience.contract.test.ts

**SEMANTIC_FULL_FILE** · 223 linhas · SHA-256 `9c63f4d30c546e61d92515823173df46c30b96dc11446f3a33bbebdf28ce22f6`.

**Asserções:** Contrato textual audience: cinco RPCs, schemas, escopo servidor, cache/429, HMAC em headers e logs

**Mocks e fixtures:** Dual runner registra asserções de substring/regex sobre fonte sem comentários

**Adjudicação:** Estrutural, corretamente anunciado no arquivo. Complementa testes comportamentais de helpers, sem provar execução/autorização/egress. Sem novo achado.

**Limites:** Ocorrência/contagem de chamada não prova reachability nem fluxo de valores. Scanner de logs não é taint analysis.

## 73 — tests/contracts/multiplix-dispatch-domain-api.contract.test.ts

**SEMANTIC_FULL_FILE** · 157 linhas · SHA-256 `581b52573bb36a6268cf9c2c0ad5ee7eb52da42c025fe32c2286afd7ba58edd7`.

**Asserções:** Mapa de 16 ações, pending vazio, ramo desconhecido400, logs permitidos, header correlation antes do return

**Mocks e fixtures:** Scanner textual com corte por delimitadores e regex, sem handler executado

**Adjudicação:** Trava forma do router; não comprova semântica dos handlers ou o escopo de recipient. Não refuta API029/030.

**Limites:** Ausência literal 500 não prova status em todos os retornos/throws; ordenação textual não é análise de controle de fluxo.

**Achados relacionados:** R2-API-029; R2-API-030

## 74 — tests/contracts/multiplix-dispatch-no-secret-leak.contract.test.ts

**SEMANTIC_FULL_FILE** · 132 linhas · SHA-256 `95623951b2658c04d11d267ce3d344b747f4f3c30ec62ed58d83e1f1a7c62f8e`.

**Asserções:** Cinco arquivos Multiplix: console estruturado, campos proibidos, contagem de logs e leitura de nomes de env

**Mocks e fixtures:** Regex sobre index/blocks/audience/inspect/lifecycle; listing não está no array

**Adjudicação:** Controle estrutural de log direto dos arquivos enumerados; não prova ausência universal de vazamento ou valores indiretos. Sem novo achado.

**Limites:** Não percorre imports/transitivos, não rastreia aliases/valores de variáveis ou logs fora do padrão regex.

## 75 — tests/contracts/multiplix-dispatch-write-path.contract.test.ts

**SEMANTIC_FULL_FILE** · 219 linhas · SHA-256 `257df2970f617a089b5d0960f205ebb05936d884ec625c81fc433ce4bd4f71e3`.

**Asserções:** Scanner de writes no frontend com controles positivo/negativo e vínculo aos hooks; Guarda created_by/ctx.userId e resolveScope antes de writes; confirm único caminho e literais SQL scheduled/sending

**Mocks e fixtures:** Scanner textual com janela de 400 caracteres até ponto-e-vírgula; concatena migrations com nome multiplix_confirm_dispatch

**Adjudicação:** Prova padrões textuais selecionados, incluindo o contrato de identidade que precisa ser confrontado com schema. Não demonstra auth/profile equivalentes nem atomicidade SQL.

**Limites:** Primeira guarda antes da primeira escrita não cobre todos os branches; aliases/templates e writes fora da janela escapam.; Migrations selecionadas por filename e concatenadas não determinam definição vencedora nem exclusividade em outros endpoints.

## 76 — tests/contracts/webhooks-versioning.contract.test.ts

**SEMANTIC_FULL_FILE** · 82 linhas · SHA-256 `7a574dd802de1f2cb661bf76448892311dd15a015812b9ec93ff1f501693a343`.

**Asserções:** getContractVersion/deprecationHeaders; Evolution v1/v2 legado/completo/extras; ElevenLabs vazio e type/event_type

**Mocks e fixtures:** Schemas/helpers reais com Requests locais; sem handlers ou assinatura

**Adjudicação:** Confirma negociação/parser e erro 422 estruturado no helper; não prova política operacional dos endpoints. Sem novo achado.

**Limites:** Não testa tradução GO anterior ao parser, auth/HMAC, flags de enforcement ou efeitos do webhook.

## Dependência lida — supabase/functions/_shared/__fixtures__/evolution-call-offer.json

**SEMANTIC_FULL_FILE** · 13 linhas · SHA-256 `3bd18b02ca37ba2032932e428cb999e50f43fbbedc70f4f43f5de0a28373157f`.

**Asserções:** Envelope call/instance/data com offer, provider ID, remetente, isVideo/fromMe e data

**Mocks e fixtures:** JSON sintético explicitamente identificado; sem dado observado de cliente

**Adjudicação:** Fixture coerente com a asserção de ringing e notificação no teste de chamada.

**Limites:** Não demonstra forma de evento real nem estado do banco

## Dependência lida — supabase/functions/_shared/__fixtures__/evolution-call-accept.json

**SEMANTIC_FULL_FILE** · 13 linhas · SHA-256 `344fd149eb57fc9d59eef63c06c544e618e4b406420268f9ea27bf3420ab6c4e`.

**Asserções:** Envelope call com accept e instante20segundosdepois

**Mocks e fixtures:** JSON sintético com ID diferente deoffer

**Adjudicação:** Fixture de mapeamento answered; teste não modela toda a mesma sessão de chamada.

**Limites:** Não é captura real nem valida correlação temporal de uma sessão

## Dependência lida — supabase/functions/_shared/__fixtures__/evolution-call-reject.json

**SEMANTIC_FULL_FILE** · 13 linhas · SHA-256 `bf5937ca01ccc6c2e3bec9287066676881c96ab75127bb1759c471d28f18ae7b`.

**Asserções:** Envelope call com reject, ID e data fixos

**Mocks e fixtures:** JSON sintético com direçãoinbound

**Adjudicação:** Fixture de missed sem notificação; sem ocorrência operacional demonstrada.

**Limites:** Não é captura real nem valida semântica de todos statusexternos

## Dependência lida — supabase/functions/_shared/__fixtures__/evolution-call-terminate.json

**SEMANTIC_FULL_FILE** · 13 linhas · SHA-256 `7c5730fd5bf6aca5fcd8ccf8d53ec9cd22d059b7f1e893c88f2fecd5c074f393`.

**Asserções:** Envelope call terminate, ID/direção/data fixos

**Mocks e fixtures:** JSON sintético; nota de ausência de tabela é texto histórico, não evidência de DB nesta auditoria

**Adjudicação:** Fixture de ended sem notificação; cobre mapeamento local.

**Limites:** Não comprova encerramento de uma sessão real, duração ou estado do banco
