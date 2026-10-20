#!/usr/bin/env python3
from pathlib import Path
import json
import hashlib,argparse,subprocess

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--source',default=str(ROOT/'source'));p.add_argument('--integrity',default=str(ROOT/'source-integrity.json'));p.add_argument('--out',default=str(ROOT/'reports/communication'));args=p.parse_args()
SOURCE=Path(args.source).resolve()
OUT=Path(args.out)
OUT.mkdir(parents=True,exist_ok=True)
integrity=json.loads(Path(args.integrity).read_text())
HEAD=integrity['head_sha']
assert subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()==HEAD
files={f['path']:f for f in integrity['files']}
def ev(path,lo,hi,why=''):
    b=(SOURCE/path).read_bytes()
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==files[path]['git_blob_sha']
    assert 0<lo<=hi<=len(b.splitlines()),(path,lo,hi,len(b.splitlines()))
    return {'path':path,'line_start':lo,'line_end':hi,'git_blob_sha':files[path]['git_blob_sha'],
            'url':f'https://github.com/adm01-debug/Zapp_Web_V2/blob/{HEAD}/{path}#L{lo}-L{hi}','purpose':why}
findings=[]
def add(n,priority,title,condition,chain,observed,impact,refs,probes,acceptance,limits='',prior=None):
    findings.append({'id':f'R2-COM-{n:03}','title':title,'priority':priority,'classification':'CONFIRMED_STATIC_CONTRACT',
      'source_head':HEAD,'preconditions':condition,'consumer_chain':chain,'observed_behavior':observed,'impact':impact,
      'evidence':[ev(*r) for r in refs],'probes':probes,'acceptance_criteria':acceptance,
      'limitations':limits or 'Revisão estática e, quando indicado, callbacks exatos com fronteiras sintéticas; sem execução de navegador, Gmail ou banco vivo.',
      'related_previous_findings':prior or [],'relation_to_prior_audit':'NEW_DISCOVERY_NOT_RECENT_REGRESSION',
      'runtime_production_acceptance':False})

inbox='src/components/email/EmailChatInbox.tsx'
thread='src/components/email/EmailChatThread.tsx'
composer='src/components/gmail/EmailComposer.tsx'
bar='src/components/email/EmailChatReplyBar.tsx'
gmail='src/hooks/integrations/useGmail.ts'

add(1,'P1','Conversa de Email entra em ciclo de atualização ao repassar contexto ao painel',
 'Conta ativa e uma thread selecionada no EmailChatInbox, inclusive quando embutido no Omnichannel.',
 'EmailChatInbox → EmailChatThread → useEffect(onContextDataChange) → setThreadContext → novo render do pai.',
 'O pai passa uma arrow inline que grava sempre um objeto novo. O efeito do filho depende dessa função e a chama. A identidade muda em cada render do pai, fechando o ciclo mesmo quando mensagens e anexos estão estáveis. A key é constante dentro da mesma thread e não corta o ciclo.',
 'A atualização repetitiva pode impedir o uso normal da conversa e consumir processamento. A prova limitada executou seis ciclos dos callbacks exatos; não mede travamento de navegador nem confirma incidente em produção.',
 [(inbox,37,45),(inbox,147,156),(thread,130,140),('src/components/email/__tests__/EmailChatInbox.test.tsx',32,37,'O teste substitui o filho que participa do ciclo.')],['COM-P01'],
 ['Estabilizar o retorno de contexto e evitar setState quando a identidade/dados efetivos não mudaram.','Testar pai e filho reais em conjunto com a mesma thread, mensagens estáveis e chegada posterior de anexos; renders devem estabilizar.'],
 'Confirmado por revisão cruzada de auth_users. O probe modela Object.is das dependências; não é um teste de integração React montado.')

add(2,'P2','Prévia de anexo recebe conteúdo de uma seleção anterior',
 'Abrir prévia A, fechá-la, abrir B e receber a resposta de A depois da resposta de B.',
 'EmailChatBubble → openAttachmentPreview → getAttachmentContent → EmailAttachmentPreviewDialog.',
 'A seleção e os bytes são estados separados; a continuação assíncrona grava previewContent sem conferir se o anexo ainda é o selecionado. Fechar o diálogo também não invalida a operação pendente.',
 'O título/nome de B pode aparecer com os bytes de A. Ambos eram anexos legíveis; isso não demonstra acesso entre contas nem quebra da autorização de download.',
 [(thread,194,204),(thread,338,343),(thread,391,393),('src/components/email/EmailAttachmentPreviewDialog.tsx',39,57)],['COM-P02'],
 ['Vincular bytes e seleção à mesma chave/geração e invalidar a requisição ao fechar/trocar.','Com resoluções B→A, manter B com bytes B; erro tardio de A não deve fechar B.'])

add(3,'P2','Descartar rascunho fecha e apaga a sessão local mesmo com rejeição remota',
 'Existe draft_id remoto e a exclusão Gmail falha por permissão, indisponibilidade ou outro erro.',
 'Confirmação Descartar → discardDraft → deleteDraft.mutateAsync → limpeza local/onClose.',
 'discardDraft absorve a rejeição do delete remoto com catch(() => undefined), remove a sessão local e fecha. A confirmação promete remover o rascunho remoto e os anexos dessa composição.',
 'O operador perde o estado local de recuperação e recebe uma conclusão incompatível com o rascunho que permanece no Gmail. Não se afirma que o arquivo remoto tenha sido apagado.',
 [(composer,283,292),(composer,485,491),(gmail,264,270)],['COM-P03'],
 ['Manter a composição e informar a falha quando a exclusão remota não foi confirmada.','Separar descarte apenas local de exclusão remota se ambos forem oferecidos; provar rejeição e sucesso.'])

add(4,'P2','Anexos originais que carregam depois da abertura não entram no encaminhamento',
 'Mensagens carregaram, mas metadados de anexos ainda estão pendentes; o usuário abre Encaminhar antes dessa segunda consulta terminar.',
 'useGmail:threadMessages/threadAttachments → EmailChatThread.forwardedAttachments → EmailComposer.',
 'selectedForwardAttachmentIds é inicializado uma única vez a partir de forwardAttachments. Quando a prop recebe os anexos posteriormente, o Set continua vazio; o seletor filtra todos os anexos recebidos e prepareAttachments não os inclui.',
 'A composição do encaminhamento omite anexos originais por ordem de chegada dos dados. O caso não depende de alterar o contato, nem de atribuir dados de outro usuário.',
 [(gmail,148,176),(thread,126,128),(thread,165,171),(thread,379,389),(composer,103,105),(composer,146,159)],['COM-P04'],
 ['Definir estado de carregamento dos anexos e inicializar/conciliar a seleção quando o conjunto inicial estiver pronto.','Preservar remoções explícitas do usuário ao atualizar; testar mensagem pronta com anexos atrasados e forwarding com todos os anexos esperados.'])

add(5,'P2','Conclusão da resposta rápida apaga texto novo digitado durante o envio',
 'Uma resposta está aguardando a mutation e o usuário digita outro texto no campo ainda editável.',
 'EmailChatReplyBar.handleSend → replyEmail.mutateAsync → setBody vazio.',
 'O handler envia o valor capturado antes do await. Ao terminar, limpa body/to/attachments incondicionalmente; o textarea e a seleção de arquivos continuam editáveis durante a espera.',
 'Texto ou anexo acrescentado depois do início do envio pode ser descartado sem ter sido enviado. O bloqueio do botão impede envio duplicado, mas não protege a revisão de rascunho.',
 [(bar,67,139),(bar,207,239)],['COM-P05'],
 ['Preservar edições posteriores ao snapshot enviado, ou bloquear explicitamente os campos durante a operação.','Simular demora no envio e editar o campo: a nova revisão deve permanecer após o sucesso da anterior.'])

add(6,'P2','Rascunho da resposta rápida se perde ao trocar de conversa',
 'Digitar resposta ou selecionar anexo na barra inferior e abrir outra conversa antes de enviar.',
 'EmailChatReplyBar state local → EmailChatInbox troca a key account:thread → unmount.',
 'A barra guarda body, destinatário e anexos apenas em useState; não usa emailDraftSession nem saveDraft. A troca de thread desmonta o estado sem confirmação. O compositor completo tem persistência própria, mas não envolve essa barra.',
 'A resposta em preparação desaparece ao voltar à conversa. A ajuda da tela afirma salvamento automático de rascunhos sem delimitar essa exceção.',
 [(bar,43,50),(inbox,152,152),(inbox,169,175),(thread,368,377),(composer,51,59),(composer,119,137)],[],
 ['Persistir a resposta rápida por conta e thread, com isolamento por usuário e expiração, ou confirmar saída com conteúdo pendente.','Testar ida e volta entre duas threads com texto e anexos; distinguir texto restaurável de arquivo local que precisa ser novamente anexado.'])

add(7,'P2','Histórico de mensagens de Email não continua além do limite de resposta',
 'Uma thread ou o conjunto consultado de anexos excede o limite de linhas da API. O limite real implantado não foi consultado.',
 'useGmail.threadMessages query ascendente → lastMessage/replyTarget/markAsRead → EmailChatThread e EmailThreadView legado.',
 'A lista de threads usa collectEmailPages, mas a consulta de mensagens e a consulta de anexos fazem uma única requisição sem range/cursor/continuação. As mensagens são ordenadas da mais antiga para a mais nova; lastMessage usa o último elemento da amostra recebida.',
 'Sob truncamento, mensagens recentes e anexos podem ficar ausentes, e a resposta padrão pode referenciar uma mensagem antiga da amostra. Não se fixa 1000 como configuração observada do servidor.',
 [(gmail,79,99),(gmail,148,176),(thread,87,95),(thread,121,128),(thread,368,375),('src/components/gmail/EmailThreadView.tsx',178,180,'O consumidor legado também toma o último elemento da amostra como alvo de resposta.')],[],
 ['Paginar o histórico com ordem estável e cursor/limite explícito; obter o alvo de resposta atual a partir de fonte completa.','Provar mais de uma página de mensagens/anexos e mensagens com timestamp igual, preservando a autorização por conta.'],
 'OTH-005 tratava paginação/filtros da lista de threads. Este achado é o histórico interno e suas projeções; não reconta aquele contrato.', ['OTH-005'])

add(8,'P3','Atalho do compositor ignora a exigência de assunto aplicada ao botão',
 'Destinatário válido e assunto vazio; usar Ctrl/Command+Enter no editor.',
 'EmailRichTextEditor.handleKeyDown → onSubmit → EmailComposer.handleSend.',
 'O botão está desabilitado sem subject.trim(), mas handleSend só valida o destinatário antes de seguir. O atalho chama o mesmo handler sem conferir assunto.',
 'O requisito aparente de assunto depende do método de interação. Gmail pode aceitar mensagens sem assunto; a descoberta é a inconsistência do contrato local, não falha do provedor.',
 [(composer,202,216),(composer,399,403),(composer,461,468),('src/components/gmail/EmailRichTextEditor.tsx',45,53)],[],
 ['Decidir se assunto vazio é permitido e aplicar a mesma regra no botão, no handler e no atalho.','Provar teclado/clique com os mesmos campos, sem enviar email real.'])

oauth='supabase/functions/gmail-oauth/index.ts';oauth_hook='src/hooks/integrations/useGmailOAuth.ts';oauth_state='src/lib/gmailOAuth.ts'
add(9,'P1','Retorno OAuth do Gmail prossegue apesar de state ausente ou inválido',
 'Browser autenticado no Zapp recebe retorno com código de autorização, mas sem state válido vinculado à tentativa. Para vínculo real indevido seria necessário código Google válido, ainda não consumido e emitido para o cliente/redirect configurados; os probes usam somente código sintético.',
 'createGmailOAuthState → parseGmailOAuthState → useGmailOAuth → exchange-code → gmail-oauth.',
 'O parser retorna null quando o nonce não confere, mas o hook usa null apenas como fallback de navegação e continua a troca de code. Se não há nonce armazenado, o parser também não exige um. O handler autenticado recebe code sem state e não verifica uma tentativa vinculada.',
 'A proteção CSRF criada pelo projeto não bloqueia o caminho que deveria proteger. Um retorno não vinculado pode iniciar conexão da conta Gmail representada pelo código ao usuário autenticado. A guarda de email já vinculado a outro usuário continua existente; não se afirma roubo de Gmail alheio ou aceitação de código inválido pelo Google.',
 [(oauth_state,25,55),(oauth_hook,22,42),(oauth_hook,61,88),(oauth,92,117),(oauth,121,153)],['COM-P06','COM-P07'],
 ['Interromper a troca quando state/nonce não existe, não confere, expirou ou já foi consumido; vincular tentativa e sessão com consumo seguro.','Preservar allowlists de navegação e a guarda de proprietário da conta; provar retorno legítimo, ausência, divergência, replay e mudança de sessão.'],
 'Parser e hook reais com fronteiras Auth/Edge simuladas. Google não foi chamado. Requisito fundamentado em RFC 6749 §10.12 e documentação oficial Google OAuth web-server, etapa 4.')
findings[-1]['external_references']=[{'url':'https://www.rfc-editor.org/rfc/rfc6749#section-10.12','purpose':'Vincular o retorno à sessão e impedir CSRF no redirection URI.'},{'url':'https://developers.google.com/identity/protocols/oauth2/web-server#handlingresponse','purpose':'Conferir state antes de tratar a resposta OAuth.'}]
add(10,'P2','OAuth do Gmail anuncia sucesso após falha de armazenamento ou desconexão',
 'Troca de código válida seguida de erro na RPC de tokens; ou conta própria existente cuja revogação Google e desativação local falham.',
 'gmail-oauth exchange/refresh/disconnect → store_gmail_tokens ou update → resposta success → toast/invalidação no cliente.',
 'storeTokens aguarda a RPC mas ignora o campo error. exchange-code responde success após esse helper. refresh também ignora armazenamento e update de expiração. disconnect não confere status HTTP da revogação nem error do update local antes de success.',
 'A conta pode aparecer conectada sem os novos tokens persistidos ou desconectada com credenciais ainda ativas. Dois probes do handler real devolveram HTTP 200/success mesmo com armazenamento negado e, separadamente, revogação 503 mais update com erro.',
 [(oauth,64,77),(oauth,132,169),(oauth,172,203),(oauth_hook,71,85),('supabase/migrations/20260827210100_gmail_token_rpcs.sql',31,59,'Função vencedora pode lançar erro e preserva refresh quando NULL/vazio; não foi inventado apagamento nesse ramo.')],['COM-P08','COM-P09'],
 ['Verificar todos os retornos de RPC/update e estado da revogação antes de anunciar o resultado.','Definir recuperação para gravação parcial de metadados/tokens e informar explicitamente desconexão parcial.','Provar erro persistente/transitório em cada efeito, sem perda silenciosa do estado anterior.'],
 'Handler exato, schema/Auth/banco/Google simulados; as políticas reais não foram exercidas. O problema não é ausência de criptografia: a RPC cifra tokens e tem controle de execução.')

html='src/lib/emailHtml.ts'
add(11,'P2','Bloqueio de imagens externas do Email deixa passar URL relativa ao protocolo',
 'Email contém img com src iniciado por // para host externo; o usuário visualiza esse conteúdo e a política externa do navegador/CSP permite o destino. Não foi observado carregamento em produção.',
 'EmailChatBubble → sanitizeEmailHtml → DOMPurify → afterSanitizeAttributes → HTML renderizado.',
 'A política declara bloqueio de imagens remotas para privacidade, mas o hook remove apenas src que começa com http:, https: ou cid:. A forma //host/caminho não corresponde. img e src permanecem nas allowlists e não existe ALLOWED_URI_REGEXP que retire essa forma; a documentação oficial do DOMPurify permite URLs relativas ao protocolo por padrão.',
 'Uma imagem externa pode sobreviver à regra local de privacidade e permitir requisição ao host quando renderizada sob política permissiva. O probe preserva //tracker.example.invalid/pixel e remove a forma https: equivalente. Isso não demonstra XSS, retirada da sanitização ou rastreamento ocorrido.',
 [(html,3,29),(html,59,83),(html,141,148),('src/components/email/EmailChatBubble.tsx',45,60,'Uso do pipeline comum; sanitização permanece ativa.'),('src/components/gmail/EmailThreadView.tsx',45,53,'O consumidor legado também sanitiza pelo pipeline comum.'),('src/components/gmail/EmailThreadView.tsx',116,120,'Renderização do HTML sanitizado, sem retirar as proteções restantes.')],['COM-P10'],
 ['Classificar a URL já normalizada contra a origem e permitir apenas esquemas/origens previstos para imagens.','Verificar formatos absolutos, relativos ao protocolo, escapes e imagens data permitidas com a biblioteca efetivamente instalada e CSP do ambiente.'],
 'Probe do hook exato com substituto de Element, sem DOMPurify, DOM ou rede. Documentação primária fundamenta a permissividade padrão; não equivale a executar a versão instalada. Resultado está em ../platform/probe-results.json.')
findings[-1]['external_references']=[{'url':'https://github.com/cure53/DOMPurify#control-permitted-attribute-values','purpose':'Documentação primária: URLs relativas e relativas ao protocolo são permitidas por padrão.'}]

full=[inbox,thread,composer,bar,gmail,'src/components/email/EmailAttachmentPreviewDialog.tsx',
      'src/components/email/EmailFullViewDialog.tsx','src/components/gmail/EmailRichTextEditor.tsx',
      'src/components/gmail/GmailInboxView.tsx','src/lib/emailDraftSession.ts','src/components/email/EmailContactPanel.tsx',
      'src/components/email/EmailThreadList.tsx','src/components/email/EmailChatBubble.tsx',oauth,oauth_hook,oauth_state,
      'src/lib/emailRecipients.ts','src/lib/emailComposeFormat.ts','src/lib/emailContactIdentity.ts',html,
      'src/lib/emailRichText.ts','src/lib/emailCompanyLinks.ts','src/lib/emailAttachmentPreview.ts',
      'src/lib/emailAttachments.ts','src/lib/emailPagination.ts','src/lib/emailErrorState.ts']
coverage=[dict(ev(path,1,len((SOURCE/path).read_bytes().splitlines())),review_level='SEMANTIC_FILE_REVIEW',
               scope='Corpo e handlers lidos, consumidores examinados; não implica execução de todos os estados.') for path in full]
for f in findings:
    for e in f['evidence']:
        if e['path'] not in full:coverage.append(dict(e,review_level='TARGETED_RANGE_REVIEW',scope=f['id']))
rejected=[
 {'candidate':'Todos os rascunhos de Email vazam entre usuários','decision':'REJECTED','basis':'emailDraftSessionKey inclui usuário/conta; existe clearEmailDraftSessions para logout. A barra sem persistência é um problema de perda, não essa alegação.'},
 {'candidate':'Nenhum histórico do Gmail tem paginação','decision':'REJECTED','basis':'A lista de threads usa collectEmailPages; o achado novo delimita as queries internas de mensagens/anexos.'},
 {'candidate':'Toda imagem/HTML de email executa código sem sandbox','decision':'REJECTED','basis':'Há sanitizeEmailHtml e previews que restringem formatos, com iframe sandbox. Não se deduz XSS apenas da presença de dangerouslySetInnerHTML.'},
 {'candidate':'Ausência de medição de memória é descoberta nova','decision':'ALREADY_RECORDED','basis':'OTH-014 já registrava a lacuna; não foi recontada.'},
 {'candidate':'Qualquer salvar de nota apaga texto novo','decision':'REJECTED','basis':'ContactNotes no painel de Email compara o texto atual ao enviado antes de limpar. COM005 é a barra de resposta, que não tem esse controle.'},
]
def save(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
save('findings.json',{'schema_version':1,'source_head':HEAD,'status':'COMPLETED_REVIEW_PASS','findings':findings,'rejected':rejected})
save('coverage.json',{'schema_version':1,'source_head':HEAD,'files':coverage,'limits':['Faixas efetivamente revisadas; sem homologação de interface/provedor.','GmailInboxView legado foi lido, mas não se atribuiu seus comportamentos ao EmailChatInbox atual.']})
lines=['# Reauditoria de Email e composição','',f'Fonte fixada: `{HEAD}`.','',
 'Onze contratos adicionais examinados em Email e OAuth. Dez contraexemplos executam código exato com fronteiras sintéticas; COM-P10 está no conjunto platform. Variantes não são contadas como defeitos independentes. A revisão não enviou email, operou banco ou modificou código do produto.','']
for f in findings:
    lines += [f"## {f['id']} · {f['priority']} · {f['title']}",'','**Condição:** '+f['preconditions'],'',
      '**Cadeia:** '+f['consumer_chain'],'','**Comportamento:** '+f['observed_behavior'],'','**Efeito:** '+f['impact'],'',
      '**Aceite proposto:** '+' '.join(f['acceptance_criteria']),'','**Limites:** '+f['limitations'],'',
      '**Evidências:** '+'; '.join(f"[{e['path']}:{e['line_start']}–{e['line_end']}]({e['url']})" for e in f['evidence'])+'.','',
      '**Probes:** '+(', '.join(f['probes']) if f['probes'] else 'Inspeção de código/consumidor; sem prova dinâmica.')+'.','']
    for r in f.get('external_references',[]):lines += ['Referência primária: ['+r['purpose']+']('+r['url']+').','']
lines += ['## Falsos positivos e duplicações evitados','']
for r in rejected:lines += ['- '+r['candidate']+': '+r['basis']]
(OUT/'report.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'findings':len(findings),'coverage_entries':len(coverage)}))
