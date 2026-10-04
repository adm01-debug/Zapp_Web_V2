# Reauditoria de Email e composição

Fonte fixada: `da307ba5626dce892f0b37cb6762463f55d14a96`.

Onze contratos adicionais examinados em Email e OAuth. Dez contraexemplos executam código exato com fronteiras sintéticas; COM-P10 está no conjunto platform. Variantes não são contadas como defeitos independentes. A revisão não enviou email, operou banco ou modificou código do produto.

## R2-COM-001 · P1 · Conversa de Email entra em ciclo de atualização ao repassar contexto ao painel

**Condição:** Conta ativa e uma thread selecionada no EmailChatInbox, inclusive quando embutido no Omnichannel.

**Cadeia:** EmailChatInbox → EmailChatThread → useEffect(onContextDataChange) → setThreadContext → novo render do pai.

**Comportamento:** O pai passa uma arrow inline que grava sempre um objeto novo. O efeito do filho depende dessa função e a chama. A identidade muda em cada render do pai, fechando o ciclo mesmo quando mensagens e anexos estão estáveis. A key é constante dentro da mesma thread e não corta o ciclo.

**Efeito:** A atualização repetitiva pode impedir o uso normal da conversa e consumir processamento. A prova limitada executou seis ciclos dos callbacks exatos; não mede travamento de navegador nem confirma incidente em produção.

**Aceite proposto:** Estabilizar o retorno de contexto e evitar setState quando a identidade/dados efetivos não mudaram. Testar pai e filho reais em conjunto com a mesma thread, mensagens estáveis e chegada posterior de anexos; renders devem estabilizar.

**Limites:** Confirmado por revisão cruzada de auth_users. O probe modela Object.is das dependências; não é um teste de integração React montado.

**Evidências:** [src/components/email/EmailChatInbox.tsx:37–45](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatInbox.tsx#L37-L45); [src/components/email/EmailChatInbox.tsx:147–156](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatInbox.tsx#L147-L156); [src/components/email/EmailChatThread.tsx:130–140](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L130-L140); [src/components/email/__tests__/EmailChatInbox.test.tsx:32–37](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/__tests__/EmailChatInbox.test.tsx#L32-L37).

**Probes:** COM-P01.

## R2-COM-002 · P2 · Prévia de anexo recebe conteúdo de uma seleção anterior

**Condição:** Abrir prévia A, fechá-la, abrir B e receber a resposta de A depois da resposta de B.

**Cadeia:** EmailChatBubble → openAttachmentPreview → getAttachmentContent → EmailAttachmentPreviewDialog.

**Comportamento:** A seleção e os bytes são estados separados; a continuação assíncrona grava previewContent sem conferir se o anexo ainda é o selecionado. Fechar o diálogo também não invalida a operação pendente.

**Efeito:** O título/nome de B pode aparecer com os bytes de A. Ambos eram anexos legíveis; isso não demonstra acesso entre contas nem quebra da autorização de download.

**Aceite proposto:** Vincular bytes e seleção à mesma chave/geração e invalidar a requisição ao fechar/trocar. Com resoluções B→A, manter B com bytes B; erro tardio de A não deve fechar B.

**Limites:** Revisão estática e, quando indicado, callbacks exatos com fronteiras sintéticas; sem execução de navegador, Gmail ou banco vivo.

**Evidências:** [src/components/email/EmailChatThread.tsx:194–204](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L194-L204); [src/components/email/EmailChatThread.tsx:338–343](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L338-L343); [src/components/email/EmailChatThread.tsx:391–393](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L391-L393); [src/components/email/EmailAttachmentPreviewDialog.tsx:39–57](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailAttachmentPreviewDialog.tsx#L39-L57).

**Probes:** COM-P02.

## R2-COM-003 · P2 · Descartar rascunho fecha e apaga a sessão local mesmo com rejeição remota

**Condição:** Existe draft_id remoto e a exclusão Gmail falha por permissão, indisponibilidade ou outro erro.

**Cadeia:** Confirmação Descartar → discardDraft → deleteDraft.mutateAsync → limpeza local/onClose.

**Comportamento:** discardDraft absorve a rejeição do delete remoto com catch(() => undefined), remove a sessão local e fecha. A confirmação promete remover o rascunho remoto e os anexos dessa composição.

**Efeito:** O operador perde o estado local de recuperação e recebe uma conclusão incompatível com o rascunho que permanece no Gmail. Não se afirma que o arquivo remoto tenha sido apagado.

**Aceite proposto:** Manter a composição e informar a falha quando a exclusão remota não foi confirmada. Separar descarte apenas local de exclusão remota se ambos forem oferecidos; provar rejeição e sucesso.

**Limites:** Revisão estática e, quando indicado, callbacks exatos com fronteiras sintéticas; sem execução de navegador, Gmail ou banco vivo.

**Evidências:** [src/components/gmail/EmailComposer.tsx:283–292](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L283-L292); [src/components/gmail/EmailComposer.tsx:485–491](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L485-L491); [src/hooks/integrations/useGmail.ts:264–270](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useGmail.ts#L264-L270).

**Probes:** COM-P03.

## R2-COM-004 · P2 · Anexos originais que carregam depois da abertura não entram no encaminhamento

**Condição:** Mensagens carregaram, mas metadados de anexos ainda estão pendentes; o usuário abre Encaminhar antes dessa segunda consulta terminar.

**Cadeia:** useGmail:threadMessages/threadAttachments → EmailChatThread.forwardedAttachments → EmailComposer.

**Comportamento:** selectedForwardAttachmentIds é inicializado uma única vez a partir de forwardAttachments. Quando a prop recebe os anexos posteriormente, o Set continua vazio; o seletor filtra todos os anexos recebidos e prepareAttachments não os inclui.

**Efeito:** A composição do encaminhamento omite anexos originais por ordem de chegada dos dados. O caso não depende de alterar o contato, nem de atribuir dados de outro usuário.

**Aceite proposto:** Definir estado de carregamento dos anexos e inicializar/conciliar a seleção quando o conjunto inicial estiver pronto. Preservar remoções explícitas do usuário ao atualizar; testar mensagem pronta com anexos atrasados e forwarding com todos os anexos esperados.

**Limites:** Revisão estática e, quando indicado, callbacks exatos com fronteiras sintéticas; sem execução de navegador, Gmail ou banco vivo.

**Evidências:** [src/hooks/integrations/useGmail.ts:148–176](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useGmail.ts#L148-L176); [src/components/email/EmailChatThread.tsx:126–128](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L126-L128); [src/components/email/EmailChatThread.tsx:165–171](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L165-L171); [src/components/email/EmailChatThread.tsx:379–389](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L379-L389); [src/components/gmail/EmailComposer.tsx:103–105](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L103-L105); [src/components/gmail/EmailComposer.tsx:146–159](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L146-L159).

**Probes:** COM-P04.

## R2-COM-005 · P2 · Conclusão da resposta rápida apaga texto novo digitado durante o envio

**Condição:** Uma resposta está aguardando a mutation e o usuário digita outro texto no campo ainda editável.

**Cadeia:** EmailChatReplyBar.handleSend → replyEmail.mutateAsync → setBody vazio.

**Comportamento:** O handler envia o valor capturado antes do await. Ao terminar, limpa body/to/attachments incondicionalmente; o textarea e a seleção de arquivos continuam editáveis durante a espera.

**Efeito:** Texto ou anexo acrescentado depois do início do envio pode ser descartado sem ter sido enviado. O bloqueio do botão impede envio duplicado, mas não protege a revisão de rascunho.

**Aceite proposto:** Preservar edições posteriores ao snapshot enviado, ou bloquear explicitamente os campos durante a operação. Simular demora no envio e editar o campo: a nova revisão deve permanecer após o sucesso da anterior.

**Limites:** Revisão estática e, quando indicado, callbacks exatos com fronteiras sintéticas; sem execução de navegador, Gmail ou banco vivo.

**Evidências:** [src/components/email/EmailChatReplyBar.tsx:67–139](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatReplyBar.tsx#L67-L139); [src/components/email/EmailChatReplyBar.tsx:207–239](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatReplyBar.tsx#L207-L239).

**Probes:** COM-P05.

## R2-COM-006 · P2 · Rascunho da resposta rápida se perde ao trocar de conversa

**Condição:** Digitar resposta ou selecionar anexo na barra inferior e abrir outra conversa antes de enviar.

**Cadeia:** EmailChatReplyBar state local → EmailChatInbox troca a key account:thread → unmount.

**Comportamento:** A barra guarda body, destinatário e anexos apenas em useState; não usa emailDraftSession nem saveDraft. A troca de thread desmonta o estado sem confirmação. O compositor completo tem persistência própria, mas não envolve essa barra.

**Efeito:** A resposta em preparação desaparece ao voltar à conversa. A ajuda da tela afirma salvamento automático de rascunhos sem delimitar essa exceção.

**Aceite proposto:** Persistir a resposta rápida por conta e thread, com isolamento por usuário e expiração, ou confirmar saída com conteúdo pendente. Testar ida e volta entre duas threads com texto e anexos; distinguir texto restaurável de arquivo local que precisa ser novamente anexado.

**Limites:** Revisão estática e, quando indicado, callbacks exatos com fronteiras sintéticas; sem execução de navegador, Gmail ou banco vivo.

**Evidências:** [src/components/email/EmailChatReplyBar.tsx:43–50](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatReplyBar.tsx#L43-L50); [src/components/email/EmailChatInbox.tsx:152–152](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatInbox.tsx#L152-L152); [src/components/email/EmailChatInbox.tsx:169–175](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatInbox.tsx#L169-L175); [src/components/email/EmailChatThread.tsx:368–377](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L368-L377); [src/components/gmail/EmailComposer.tsx:51–59](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L51-L59); [src/components/gmail/EmailComposer.tsx:119–137](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L119-L137).

**Probes:** Inspeção de código/consumidor; sem prova dinâmica..

## R2-COM-007 · P2 · Histórico de mensagens de Email não continua além do limite de resposta

**Condição:** Uma thread ou o conjunto consultado de anexos excede o limite de linhas da API. O limite real implantado não foi consultado.

**Cadeia:** useGmail.threadMessages query ascendente → lastMessage/replyTarget/markAsRead → EmailChatThread.

**Comportamento:** A lista de threads usa collectEmailPages, mas a consulta de mensagens e a consulta de anexos fazem uma única requisição sem range/cursor/continuação. As mensagens são ordenadas da mais antiga para a mais nova; lastMessage usa o último elemento da amostra recebida.

**Efeito:** Sob truncamento, mensagens recentes e anexos podem ficar ausentes, e a resposta padrão pode referenciar uma mensagem antiga da amostra. Não se fixa 1000 como configuração observada do servidor.

**Aceite proposto:** Paginar o histórico com ordem estável e cursor/limite explícito; obter o alvo de resposta atual a partir de fonte completa. Provar mais de uma página de mensagens/anexos e mensagens com timestamp igual, preservando a autorização por conta.

**Limites:** OTH-005 tratava paginação/filtros da lista de threads. Este achado é o histórico interno e suas projeções; não reconta aquele contrato.

**Evidências:** [src/hooks/integrations/useGmail.ts:79–99](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useGmail.ts#L79-L99); [src/hooks/integrations/useGmail.ts:148–176](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useGmail.ts#L148-L176); [src/components/email/EmailChatThread.tsx:87–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L87-L95); [src/components/email/EmailChatThread.tsx:121–128](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L121-L128); [src/components/email/EmailChatThread.tsx:368–375](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatThread.tsx#L368-L375).

**Probes:** Inspeção de código/consumidor; sem prova dinâmica..

## R2-COM-008 · P3 · Atalho do compositor ignora a exigência de assunto aplicada ao botão

**Condição:** Destinatário válido e assunto vazio; usar Ctrl/Command+Enter no editor.

**Cadeia:** EmailRichTextEditor.handleKeyDown → onSubmit → EmailComposer.handleSend.

**Comportamento:** O botão está desabilitado sem subject.trim(), mas handleSend só valida o destinatário antes de seguir. O atalho chama o mesmo handler sem conferir assunto.

**Efeito:** O requisito aparente de assunto depende do método de interação. Gmail pode aceitar mensagens sem assunto; a descoberta é a inconsistência do contrato local, não falha do provedor.

**Aceite proposto:** Decidir se assunto vazio é permitido e aplicar a mesma regra no botão, no handler e no atalho. Provar teclado/clique com os mesmos campos, sem enviar email real.

**Limites:** Revisão estática e, quando indicado, callbacks exatos com fronteiras sintéticas; sem execução de navegador, Gmail ou banco vivo.

**Evidências:** [src/components/gmail/EmailComposer.tsx:202–216](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L202-L216); [src/components/gmail/EmailComposer.tsx:399–403](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L399-L403); [src/components/gmail/EmailComposer.tsx:461–468](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailComposer.tsx#L461-L468); [src/components/gmail/EmailRichTextEditor.tsx:45–53](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/gmail/EmailRichTextEditor.tsx#L45-L53).

**Probes:** Inspeção de código/consumidor; sem prova dinâmica..

## R2-COM-009 · P1 · Retorno OAuth do Gmail prossegue apesar de state ausente ou inválido

**Condição:** Browser autenticado no Zapp recebe retorno com código de autorização, mas sem state válido vinculado à tentativa. Para vínculo real indevido seria necessário código Google válido, ainda não consumido e emitido para o cliente/redirect configurados; os probes usam somente código sintético.

**Cadeia:** createGmailOAuthState → parseGmailOAuthState → useGmailOAuth → exchange-code → gmail-oauth.

**Comportamento:** O parser retorna null quando o nonce não confere, mas o hook usa null apenas como fallback de navegação e continua a troca de code. Se não há nonce armazenado, o parser também não exige um. O handler autenticado recebe code sem state e não verifica uma tentativa vinculada.

**Efeito:** A proteção CSRF criada pelo projeto não bloqueia o caminho que deveria proteger. Um retorno não vinculado pode iniciar conexão da conta Gmail representada pelo código ao usuário autenticado. A guarda de email já vinculado a outro usuário continua existente; não se afirma roubo de Gmail alheio ou aceitação de código inválido pelo Google.

**Aceite proposto:** Interromper a troca quando state/nonce não existe, não confere, expirou ou já foi consumido; vincular tentativa e sessão com consumo seguro. Preservar allowlists de navegação e a guarda de proprietário da conta; provar retorno legítimo, ausência, divergência, replay e mudança de sessão.

**Limites:** Parser e hook reais com fronteiras Auth/Edge simuladas. Google não foi chamado. Requisito fundamentado em RFC 6749 §10.12 e documentação oficial Google OAuth web-server, etapa 4.

**Evidências:** [src/lib/gmailOAuth.ts:25–55](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/gmailOAuth.ts#L25-L55); [src/hooks/integrations/useGmailOAuth.ts:22–42](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useGmailOAuth.ts#L22-L42); [src/hooks/integrations/useGmailOAuth.ts:61–88](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useGmailOAuth.ts#L61-L88); [supabase/functions/gmail-oauth/index.ts:92–117](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-oauth/index.ts#L92-L117); [supabase/functions/gmail-oauth/index.ts:121–153](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-oauth/index.ts#L121-L153).

**Probes:** COM-P06, COM-P07.

Referência primária: [Vincular o retorno à sessão e impedir CSRF no redirection URI.](https://www.rfc-editor.org/rfc/rfc6749#section-10.12).

Referência primária: [Conferir state antes de tratar a resposta OAuth.](https://developers.google.com/identity/protocols/oauth2/web-server#handlingresponse).

## R2-COM-010 · P2 · OAuth do Gmail anuncia sucesso após falha de armazenamento ou desconexão

**Condição:** Troca de código válida seguida de erro na RPC de tokens; ou conta própria existente cuja revogação Google e desativação local falham.

**Cadeia:** gmail-oauth exchange/refresh/disconnect → store_gmail_tokens ou update → resposta success → toast/invalidação no cliente.

**Comportamento:** storeTokens aguarda a RPC mas ignora o campo error. exchange-code responde success após esse helper. refresh também ignora armazenamento e update de expiração. disconnect não confere status HTTP da revogação nem error do update local antes de success.

**Efeito:** A conta pode aparecer conectada sem os novos tokens persistidos ou desconectada com credenciais ainda ativas. Dois probes do handler real devolveram HTTP 200/success mesmo com armazenamento negado e, separadamente, revogação 503 mais update com erro.

**Aceite proposto:** Verificar todos os retornos de RPC/update e estado da revogação antes de anunciar o resultado. Definir recuperação para gravação parcial de metadados/tokens e informar explicitamente desconexão parcial. Provar erro persistente/transitório em cada efeito, sem perda silenciosa do estado anterior.

**Limites:** Handler exato, schema/Auth/banco/Google simulados; as políticas reais não foram exercidas. O problema não é ausência de criptografia: a RPC cifra tokens e tem controle de execução.

**Evidências:** [supabase/functions/gmail-oauth/index.ts:64–77](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-oauth/index.ts#L64-L77); [supabase/functions/gmail-oauth/index.ts:132–169](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-oauth/index.ts#L132-L169); [supabase/functions/gmail-oauth/index.ts:172–203](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-oauth/index.ts#L172-L203); [src/hooks/integrations/useGmailOAuth.ts:71–85](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useGmailOAuth.ts#L71-L85); [supabase/migrations/20260827210100_gmail_token_rpcs.sql:31–59](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260827210100_gmail_token_rpcs.sql#L31-L59).

**Probes:** COM-P08, COM-P09.

## R2-COM-011 · P2 · Bloqueio de imagens externas do Email deixa passar URL relativa ao protocolo

**Condição:** Email contém img com src iniciado por // para host externo; o usuário visualiza esse conteúdo e a política externa do navegador/CSP permite o destino. Não foi observado carregamento em produção.

**Cadeia:** EmailChatBubble → sanitizeEmailHtml → DOMPurify → afterSanitizeAttributes → HTML renderizado.

**Comportamento:** A política declara bloqueio de imagens remotas para privacidade, mas o hook remove apenas src que começa com http:, https: ou cid:. A forma //host/caminho não corresponde. img e src permanecem nas allowlists e não existe ALLOWED_URI_REGEXP que retire essa forma; a documentação oficial do DOMPurify permite URLs relativas ao protocolo por padrão.

**Efeito:** Uma imagem externa pode sobreviver à regra local de privacidade e permitir requisição ao host quando renderizada sob política permissiva. O probe preserva //tracker.example.invalid/pixel e remove a forma https: equivalente. Isso não demonstra XSS, retirada da sanitização ou rastreamento ocorrido.

**Aceite proposto:** Classificar a URL já normalizada contra a origem e permitir apenas esquemas/origens previstos para imagens. Verificar formatos absolutos, relativos ao protocolo, escapes e imagens data permitidas com a biblioteca efetivamente instalada e CSP do ambiente.

**Limites:** Probe do hook exato com substituto de Element, sem DOMPurify, DOM ou rede. Documentação primária fundamenta a permissividade padrão; não equivale a executar a versão instalada. Resultado está em ../platform/probe-results.json.

**Evidências:** [src/lib/emailHtml.ts:3–29](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/emailHtml.ts#L3-L29); [src/lib/emailHtml.ts:59–83](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/emailHtml.ts#L59-L83); [src/lib/emailHtml.ts:141–148](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/emailHtml.ts#L141-L148); [src/components/email/EmailChatBubble.tsx:45–60](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/email/EmailChatBubble.tsx#L45-L60).

**Probes:** COM-P10.

Referência primária: [Documentação primária: URLs relativas e relativas ao protocolo são permitidas por padrão.](https://github.com/cure53/DOMPurify#control-permitted-attribute-values).

## Falsos positivos e duplicações evitados

- Todos os rascunhos de Email vazam entre usuários: emailDraftSessionKey inclui usuário/conta; existe clearEmailDraftSessions para logout. A barra sem persistência é um problema de perda, não essa alegação.
- Nenhum histórico do Gmail tem paginação: A lista de threads usa collectEmailPages; o achado novo delimita as queries internas de mensagens/anexos.
- Toda imagem/HTML de email executa código sem sandbox: Há sanitizeEmailHtml e previews que restringem formatos, com iframe sandbox. Não se deduz XSS apenas da presença de dangerouslySetInnerHTML.
- Ausência de medição de memória é descoberta nova: OTH-014 já registrava a lacuna; não foi recontada.
- Qualquer salvar de nota apaga texto novo: ContactNotes no painel de Email compara o texto atual ao enviado antes de limpar. COM005 é a barra de resposta, que não tem esse controle.
