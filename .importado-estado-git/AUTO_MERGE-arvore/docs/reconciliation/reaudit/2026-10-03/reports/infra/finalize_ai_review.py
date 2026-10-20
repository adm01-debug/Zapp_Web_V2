"""Documentation-only finalizer for the finite IA batch. Preserves prior findings."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib
import json
import re
from build_ai_review import ROOT, SOURCE, OUT, HEAD, dump, build_coverage

OLD = Path('/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation')
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def ev(path, start, end, reason):
    assert 1 <= start <= end <= len((SOURCE/path).read_text().splitlines()), path
    return dict(path=path, line_start=start, line_end=end, sha256=sha(SOURCE/path),
                baseline_sha=HEAD, origin='source', reason=reason)
def task(number, scope, status=None):
    p=OLD/'tasks/P007.json'
    t=next(t for t in json.loads(p.read_text())['tasks'] if t['id']==number)
    return dict(plan_record_id='P007', task_id=number, canonical_id=t['canonical_id'],
                previous_status=t['status'], previous_assessment=t['assessment'],
                affected_subcontract=scope, proposed_status=status or t['status'],
                baseline_task_file='tasks/P007.json', baseline_task_sha256=sha(p))
def finding(number, title, severity, description, chain, conditions, effect, evidence,
            acceptance, tasks, probe, limitations=(), related=()):
    return dict(id=f'R2-INF-{number:03}', title=title, severity=severity, classification='novo',
        area_extension='finite_ai_batch', baseline_sha=HEAD, description=description,
        consumer_chain=chain, preconditions=conditions, effect=effect, evidence=evidence,
        acceptance=acceptance, affected_tasks=tasks, probe_ids=[probe],
        related_previous_findings=list(related),
        novelty_basis='Mecanismo específico não contado nos 104 achados anteriores e confirmado sem duplicação direta com providers, database e Inbox; novo não significa regressão posterior à auditoria anterior.',
        proof_type='STATIC_AND_BOUNDED_SYNTHETIC_OFFLINE',
        limitations=['Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão.']+list(limitations))

findings = [
 finding(22, 'Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário', 'P1',
  'classify-emoji autentica o usuário; classify-sticker aceita usuário ou serviço. No ramo de usuário, ambos passam image_url diretamente a toInlineImage. O helper verifica origem, bucket e path, mas baixa o objeto com SUPABASE_SERVICE_ROLE_KEY sem conferir permissão de leitura do usuário, mensagem visível ou vínculo a uma figurinha compartilhada. A allowlist inclui whatsapp-media, que as migrations mantêm privado e sujeito a SELECT por atribuição/visibilidade. Os bytes são embutidos no pedido ao provedor de visão; userId é usado em cota/log, não na autorização do download.',
  ['Usuário autenticado com cota → classify-emoji ou ramo usuário de classify-sticker',
   'image_url conhecida de whatsapp-media → parser da origem/bucket',
   'GET do objeto com credencial service role → base64',
   'generateWithRouting vision → categoria em allowlist devolvida'],
  ['Usuário válido, não autorizado pela policy a ler determinado objeto privado de whatsapp-media, conhece seu locator/path.',
   'O objeto existe, é imagem aceita pelo helper e há provedor de visão configurado para completar a classificação.',
   'A versão publicada corresponde ao caminho versionado analisado; essa condição não foi medida remotamente.'],
  'Permite processamento de mídia privada além da permissão do chamador e envio desses bytes ao provedor configurado. A resposta permite inferir a categoria da imagem; não devolve o arquivo bruto, nem demonstra extração integral do conteúdo para o chamador.',
  [ev('supabase/functions/classify-emoji/index.ts',40,70,'Identidade validada, mas helper da imagem não recebe autorização do objeto'),
   ev('supabase/functions/classify-emoji/index.ts',103,134,'URL do corpo vira imagem enviada ao provedor'),
   ev('supabase/functions/classify-sticker/index.ts',39,79,'Ramo de usuário e serviço converge para helper sem autorização do objeto'),
   ev('supabase/functions/classify-sticker/index.ts',102,127,'Imagem privilegiada enviada ao provedor'),
   ev('supabase/functions/_shared/ai-image-input.ts',281,348,'Origin/bucket/path são conferidos; requisição usa credencial de serviço'),
   ev('supabase/functions/_shared/ai-image-input.ts',378,398,'Bytes viram data URL'),
   ev('supabase/functions/_shared/ai-auth.ts',60,107,'Gate de autenticação/cota é real, sem autorização do objeto'),
   ev('supabase/migrations/20260905030000_private_media_buckets.sql',1,11,'Bucket de clientes privado'),
   ev('supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql',30,50,'SELECT de mídia condicionado a mensagem visível')],
  ['No ramo de usuário, autorizar a leitura do objeto com identidade do chamador antes de qualquer download privilegiado ou pedido ao modelo.',
   'Rejeitar locator de contato/mensagem não visível e impedir acesso a imagem arbitrária no bucket, mesmo quando a URL é conhecida.',
   'Conservar ramo interno de serviço explícito para o webhook e autorizar bibliotecas compartilhadas por sua política própria.',
   'Fixtures devem distinguir imagem própria, imagem alheia privada, item compartilhado autorizado, origem externa e identidade inválida; a imagem negada não chega ao provedor.'],
  [task('IA-004','Autorização de leitura de objeto em classificadores de visão; preservar PARTIAL da matriz.'),
   task('IA-019','Minimização exige dados autorizados no prompt; preservar PARTIAL e acrescentar mídia privada sem autorização por objeto.')],
  'INF-AI-P01',
  ['Não é chamada anônima: os gates internos exigem usuário válido. Não se presume verify_jwt=false no gateway; nenhuma exceção dessas rotas existe em config.toml.',
   'Policies mais recentes da fonte foram cruzadas com a área database; não foi certificado o estado atual do Storage remoto.',
   'R2-API-027 trata URL alternativa na transcrição de áudio com precondição de mensagem visível; este caso é dos classificadores visuais sem esse gate.']),
 finding(23, 'Revalidação de contexto fora da RPC deixa análise antiga substituir uma projeção concorrente', 'P2',
  'Os handlers de analysis/summary leem ai_projection_updated_at no início e o revalidam depois do modelo. A leitura final e persist_conversation_analysis são chamadas separadas. A RPC não recebe a versão esperada: aceita a projeção se seu timestamp atual for <= p_analyzed_at, que o handler gera com new Date() no fim. Se outra análise persiste enquanto a resposta da leitura de revalidação antiga está em trânsito, a antiga recebe current:true e seu timestamp posterior permite substituir a projeção concorrente.',
  ['Análise A de contexto anterior captura versão V',
   'Revalidação A lê V; resposta ainda não chegou ao handler',
   'Análise B persiste novo contexto e avança projeção',
   'A recebe snapshot V → current:true → gera timestamp posterior',
   'RPC de A permite UPDATE por <= p_analyzed_at e substitui B'],
  ['Duas execuções para o mesmo contato visível partem da mesma versão de projeção e seus contextos/requisições têm ordem relevante.',
   'A leitura de revalidação de A captura o estado antes do commit de B, mas A conclui essa leitura e produz p_analyzed_at depois do timestamp usado por B.',
   'A saída de A possui sentimento/prioridade a projetar e passa o contrato normal. Nenhuma falha de leitura é necessária.'],
  'A garantia de cancelar resultado superado antes de qualquer persistência não vale nesse interleaving. A análise antiga pode entrar no histórico e assumir a projeção após a análise nova. A transação INSERT+UPDATE continua atômica; o defeito é a ausência de comparação atômica com a versão esperada.',
  [ev('supabase/functions/_shared/ai-conversation-pipeline.ts',178,200,'Versão do contexto é lida em uma consulta separada'),
   ev('supabase/functions/_shared/schemas.ts',440,468,'Revalidação usa snapshot e retorna antes da persistência'),
   ev('supabase/functions/ai-conversation-analysis/index.ts',226,272,'Gate externo à RPC e timestamp criado ao concluir'),
   ev('supabase/functions/ai-conversation-summary/index.ts',194,249,'Mesmo protocolo no resumo'),
   ev('supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql',79,83,'Assinatura não recebe versão esperada'),
   ev('supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql',143,164,'Projeção ordenada apenas por timestamp do payload'),
   ev('tests/contracts/ai-conversation-analysis-contract.test.ts',110,134,'Testes verificam ordem textual/guarda, sem concorrência'),
   ev('tests/contracts/ai-conversation-summary-contract.test.ts',175,200,'Mesmo limite de teste no resumo')],
  ['Definir identidade/ordem do contexto e levá-la à transação que decide aceitar a análise e projetar o contato.',
   'Verificar versão esperada sob lock ou condição equivalente, devolvendo cancelled/conflito quando a projeção avançou entre leitura e commit.',
   'Cobrir o interleaving leitura A → commit B → retorno da leitura A → tentativa de persistir A, preservando o resultado de B.',
   'Preservar o contrato transacional de análise+projeção e distinguir timestamp de término de identidade/recência do contexto.'],
  [task('IA-048','Além do descarte lógico no cliente, a garantia de não aplicar contexto superado no servidor exige comparação atômica com a versão; status anterior já PARTIAL e assim permanece.')],
  'INF-AI-P02',
  ['A prova executa o helper real e modela explicitamente o predicado SQL verificado; não é execução de PostgreSQL nem medição de concorrência em produção.',
   'O controle com leitura final atualizada cancela corretamente. O achado não nega os gates existentes nem a atomicidade da RPC.',
   'IA-026 permanece implementada aguardando evidência no seu contrato de persistência completa; não reabrir essa tarefa inteira por este subcontrato de recência.']),
 finding(24, 'Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação', 'P2',
  'ai-suggest-reply extrai um objeto por regex e devolve JSON.parse sem usar SuggestedRepliesOutput. Assim, JSON sintaticamente válido como suggestions:string passa. AISuggestions salva qualquer data.suggestions truthy e renderiza com length e map: uma string não vazia satisfaz a condição e não tem map. Quando o parse falha, a Edge fabrica três frases fixas e responde 200 sem status de degradação, mostrando-as pelo mesmo caminho das sugestões geradas.',
  ['Usuário/contato autorizados → modelo devolve conteúdo',
   'Regex+JSON.parse sem schema, ou catch com frases fixas',
   'HTTP 200 → AISuggestions aceita data.suggestions truthy',
   'Render .length/.map ou escolha de frase fixa no rascunho'],
  ['O provedor retorna JSON válido com suggestions fora do formato de array, ou conteúdo que não pode ser parseado.',
   'A mesma requisição continua vigente no cliente e sua resposta é aceita pelo descarte lógico existente.'],
  'Shape inválido pode causar falha de renderização ou ausência silenciosa de sugestões; parse inválido apresenta texto padrão como sucesso de geração sem explicitar sua origem. Não há envio automático de WhatsApp nesse caminho.',
  [ev('supabase/functions/ai-suggest-reply/index.ts',163,192,'Parsing sem contrato e fallback fixo com HTTP 200'),
   ev('supabase/functions/_shared/ai-response-contracts.ts',110,120,'Schema de sugestões existe, mas não está aplicado neste handler'),
   ev('src/components/inbox/AISuggestions.tsx',78,99,'Cliente aceita campo truthy sem validar array'),
   ev('src/components/inbox/AISuggestions.tsx',180,217,'Render pressupõe array e texto selecionável'),
   ev('tests/contracts/_adv_edge_legacy_producers.test.ts',197,208,'Teste documenta/congela o defeito; não é evidência de contrato correto')],
  ['Validar o envelope e cada sugestão antes de retornar/renderizar, inclusive tipo do array, quantidade e texto não vazio.',
   'JSON válido com shape errado deve produzir estado de erro/degradação explícito e não entrar no render normal.',
   'Se frases locais forem política desejada, identificá-las como fallback local e permitir revisão consciente; não apresentá-las como resultado normal do modelo.',
   'Cobrir array ausente/string/objeto, itens inválidos, JSON malformado e três sugestões válidas, usando respostas sintéticas do provedor.'],
  [task('IA-025','JSON válido com estrutura errada permanece sem validação em ai-suggest-reply/AISuggestions; conservar PARTIAL com este produtor/consumidor explícito.'),
   task('IA-142','Origem das três frases de fallback não é identificada ao consumidor; conservar PARTIAL.')],
  'INF-AI-P03',
  ['Parse/fallback real foi extraído por AST; a consequência no render é sustentada pelo consumidor e checagem de tipo, sem sessão React/browser.',
   'Teste de inventário adversarial do próprio repositório já descreve o defeito; ele não consta como mecanismo nos 104 findings reconciliados.']),
 finding(25, 'Reescrita atrasada substitui edição mais nova do mesmo rascunho', 'P2',
  'AIRewriteButton e AIEnhanceButton capturam inputValue no clique, aguardam ai-enhance-message e aplicam enhanced sem comparar o rascunho corrente nem uma geração de requisição. O campo de mensagem continua editável. No caminho mobile de ChatInputArea, o botão permanece montado enquanto há texto e seu onRewrite escreve diretamente no textarea via setNativeValue; portanto uma edição feita durante o await é substituída pelo resultado do texto anterior.',
  ['Texto A → clique reescrever/aprimorar',
   'invoke pendente → usuário mantém mesma conversa e digita texto B',
   'Resultado para A resolve → callback sem verificação de geração',
   'onRewrite/onInputChange substitui B pelo resultado de A'],
  ['Componente continua montado no mesmo contato/conversa e recebe retorno tardio bem-sucedido.',
   'Usuário modifica o rascunho enquanto a reescrita está em andamento; no caminho mobile mantém texto não vazio.'],
  'Perda da edição recente do rascunho e aplicação de conteúdo relativo a uma versão anterior. O usuário ainda precisa enviar a mensagem; o achado não presume envio, troca de contato ou sobrevivência do componente ao remount.',
  [ev('src/components/inbox/chat/AIRewriteButton.tsx',33,63,'Resposta aplicada após await sem comparar texto/geração'),
   ev('src/components/inbox/chat/AIEnhanceButton.tsx',45,92,'Mesmo caminho no aprimoramento e undo captura texto anterior'),
   ev('src/components/inbox/chat/ChatInputArea.tsx',187,201,'Textarea permanece editável'),
   ev('src/components/inbox/chat/ChatInputArea.tsx',267,274,'Caminho mobile montado para texto não vazio e aplicação via setter'),
   ev('src/components/inbox/chat/useChatInputLogic.ts',112,124,'Setter aplica diretamente ao campo e emite input'),
   ev('src/components/inbox/chat/ChatMessageInput.tsx',140,149,'Consumidor do Enhance compartilha o callback do textarea')],
  ['Associar reescrita à versão do rascunho e só aplicar automaticamente se texto/identidade ainda corresponderem ao clique.',
   'Ao editar durante a requisição, preservar a edição e descartar ou oferecer o resultado antigo como opção revisável.',
   'Testar edição no mesmo contato durante await e retorno fora de ordem; o texto novo deve permanecer.',
   'Definir o escopo de desfazer de forma que não restaure silenciosamente um rascunho anterior após nova edição.'],
  [task('IA-048','Critério inclui rascunho; os consumidores Enhance/Rewrite não têm guarda de geração. Preservar PARTIAL e abrir este ramo sem reclassificar consumidores que já têm proteção.')],
  'INF-AI-P04',
  ['Callbacks reais executados com invoke/setters falsos; wiring do textarea verificado no fonte, sem teste React/DOM.',
   'Revisão cruzada com Inbox e grill_me_primary_review excluiu duplicação com UniversityHelp (R2-MOD-012) e AIGenerateDialog (R2-MOD-040).']),
]

duplicates = [
 dict(previous_id='IA-AUDIO-001', classification='duplicado', paths=['supabase/functions/classify-audio-meme/index.ts'], assessment='Áudio-meme usa nome/URL, não conteúdo sonoro; roteamento central não muda esse fato. Não criar outro ID.'),
 dict(previous_id='IA-CHATBOT-001', classification='duplicado', paths=['supabase/functions/chatbot-l1/index.ts'], assessment='connectionId ignorado em fluxo/histórico; retorno de flags não comprova transferência/envio. Manter achado anterior.'),
 dict(previous_id='IA-METRICS-001', classification='extensão_sem_nova_contagem', paths=['supabase/functions/ai-churn-analysis/index.ts','supabase/functions/ai-classify-tickets/index.ts'], assessment='UI ignora resultados da Edge e usa proxies locais. Confidence zero no classificador vira 0.5, mas não atribuir esse valor à UI que ignora esse retorno.'),
 dict(previous_id='IA-TIMEOUT-001', classification='extensão_sem_nova_contagem', paths=['supabase/functions/_shared/ai-image-input.ts'], assessment='Timer do download é limpo após headers antes de arrayBuffer; limite de bytes é verificado depois da leitura integral. Novo consumidor do mesmo padrão de prazo, sem duplicar o ID.'),
 dict(previous_id='IA-QUOTA-001', classification='contexto_sem_nova_contagem', paths=['supabase/functions/ai-churn-analysis/index.ts','supabase/functions/ai-classify-tickets/index.ts'], assessment='Handlers calculados passam guard mas não geram chamada ao modelo/log de consumo pelo dispatcher. Contabilização de ação versus consumo já está na auditoria anterior/DB.'),
]

def merge_ranges(ranges):
    out=[]
    for start,end in sorted(ranges):
        if out and start<=out[-1][1]+1: out[-1][1]=max(out[-1][1],end)
        else: out.append([start,end])
    return out

coverage=build_coverage()
payload=dict(schema_version=1, area='infra/ai_delegated', baseline_sha=HEAD,
    mode='READ_ONLY_STATIC_AND_BOUNDED_OFFLINE', findings=findings,
    counts=dict(Counter(f['severity'] for f in findings)),
    previous_findings_compared={'path':str(OLD/'FINDINGS.json'),'sha256':sha(OLD/'FINDINGS.json'),'count':104},
    duplicates_not_recounted=duplicates,
    probes='ai-review-probes.json', primary_files_fully_read=12, primary_lines=2692)
dump('ai-review-findings.json',payload)

report=[
 '# Revisão IA delegada — pipeline, classificadores e consumidores', '',
 f'Fonte: `{HEAD}`. Foram lidos integralmente os 12 arquivos primários (2692 linhas), com autenticação, entradas, saída, erros, efeitos, cancelamento e consumidores rastreados. A cobertura de suporte é declarada por faixa no JSON.', '',
 '## Resultado', '',
 'Quatro mecanismos novos: 1 P1 e 3 P2. A leitura privilegiada de imagem é um problema de autorização de objeto no ramo de usuário; autenticação e cotas existem. Os outros três tratam recência na projeção, contrato da resposta e preservação do rascunho. Nenhuma conclusão presume que a versão esteja publicada ou que o efeito já tenha ocorrido em produção.', '',
 '| ID | Prioridade | Resultado |', '|---|---|---|',
 *[f"| {f['id']} | {f['severity']} | {f['title']} |" for f in findings], '',
 '## Gates e fronteiras conferidas', '',
 'O gateway remoto não foi consultado. `supabase/config.toml` não declara exceção verify_jwt=false para estas rotas; a análise de alcance se apoia também nos gates internos observados. Os classificadores exigem usuário verificado; sticker permite adicionalmente token exato de serviço para o webhook. Analysis, summary, suggest e enhance verificam Auth e cotas. Churn e tickets usam getUser e cliente JWT. Chatbot tem ramo HMAC de serviço e ramo de usuário; não foi tratado como acessível anonimamente só pela existência do ramo HMAC.', '',
 'A autorização por contato está presente nas capacidades de conversa que consultam contexto. Tickets lê tags com cliente RLS, não service role. Churn filtra IDs visíveis antes das leituras privilegiadas. O helper de imagem não possui essa verificação por objeto e por isso constitui caso distinto.', '',
 '## Cobertura primária', '', '| Arquivo | Gate/efeito principal | Consumidor |', '|---|---|---|',
 *[f"| `{e['path']}` | {e['gates']} {e['cancellation']} | {'; '.join(e['consumers'])} |" for e in coverage['inventory'] if e['role']=='primary'], '',
 '## Provas e alcance', '',
 'Os 12 arquivos usados nos probes e o compilador TypeScript tiveram SHA256 conferido antes do import. Os módulos avaliados receberam apenas dependências locais revisadas e fixtures; fetch global foi bloqueado. Não foram carregados os handlers Deno, SDKs, React nem Zod remoto.', '',
 '| Probe | O que executou | Limite |', '|---|---|---|',
 '| INF-AI-P01 | toInlineImage e parser reais com imagem sintética e fetch injetado | Não executa RLS, Storage ou provedor; prova conversão privilegiada do locator e confere controles de origem/bucket. |',
 '| INF-AI-P02 | Funções reais de revalidação e barreira assíncrona | O UPDATE é modelo explícito do predicado SQL pinado, sem PostgreSQL. Controle com snapshot atualizado cancela. |',
 '| INF-AI-P03 | Bloco real de parse/fallback extraído por AST | Sem modelo; o erro de render é inferido do shape entregue ao consumidor .map, não sessão de browser. |',
 '| INF-AI-P04 | Dois callbacks reais de reescrita, retorno retardado e setter sintético | Mesma conversa, componente ainda montado; sem React/DOM nem envio. |', '',
 'Os resultados estão em `ai-review-probes.json`; script em `probe-ai-review.mjs` e pins em `ai-review-probe-pins.json`. As quatro provas passaram suas assertivas. Isso não é resultado de produção, teste E2E ou certificação de todo o dispatcher.', '',
 '## Achados e critérios de aceite', '',
]
for f in findings:
    report += [f"### {f['id']} — {f['title']}", '', f['description'], '', '**Precondições:** '+ ' '.join(f['preconditions']), '', '**Efeito:** '+f['effect'], '', '**Evidência no fonte:**', '']
    report += [f"- `{e['path']}:{e['line_start']}–{e['line_end']}` — {e['reason']}; SHA256 `{e['sha256']}`." for e in f['evidence']]
    report += ['', '**Aceite:**', '', *[f'- {a}' for a in f['acceptance']], '', '**Limites:** '+ ' '.join(f['limitations']), '', '**Plano:** '+ '; '.join(f"P007/{t['task_id']}: {t['previous_status']} → {t['proposed_status']}; {t['affected_subcontract']}" for t in f['affected_tasks']), '']
report += ['## Duplicações evitadas e limites adicionais', '', *[f"- `{d['previous_id']}` ({d['classification']}): {d['assessment']}" for d in duplicates], '',
 'O texto de requestId em ai-enhance-message é ecoado na resposta, mas não enviado ao dispatcher; isso foi registrado na cobertura, sem criar mais um ID genérico de correlação. Nenhum dos handlers deste lote passa req.signal ao dispatcher; o cancelamento observado nos consumidores migrados é lógico. Chatbot Testar Conexão usa IDs `test`, incompatíveis com o schema UUID; essa fronteira permanece documentada sem alegar falha do bot inteiro.', '',
 '## Integração e lacunas', '',
 f"Cobertura deste lote: {coverage['counts']['total']} arquivos, {coverage['counts'].get('semantic',0)} semânticos integrais (12 primários e suporte integral explícito), {coverage['counts'].get('targeted',0)} dirigidos. Os contratos repetitivos e dependências fora das faixas não foram promovidos por mera presença.", '',
 'Os 21 achados INF anteriores e sua revisão de infraestrutura permanecem preservados. Os quatro novos IDs são integrados aos arquivos principais da mesma área, sem alterar os relatórios de providers/database/Inbox. As tarefas IA relacionadas já eram PARTIAL; não se reabriu uma tarefa DONE_VERIFIED nem se anulou o trabalho dos consumidores que têm gates válidos.', '',
 *[f'- {g}' for g in coverage['remaining_gaps']], '',
]
text='\n'.join(report)
(OUT/'ai-review-report.md').write_text(text)

# Merge only this area into its own main reports; never writes another agent's files.
main=json.loads((OUT/'findings.json').read_text())
new_ids={f['id'] for f in findings}
first21=[f for f in main['findings'] if f['id'] not in new_ids]
preserved_hash=hashlib.sha256(json.dumps(first21,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
main['findings']=first21+findings
main['ai_review']=dict(files='ai-review-coverage.json', findings='ai-review-findings.json', report='ai-review-report.md', probes='ai-review-probes.json', added_ids=sorted(new_ids), preserved_prior_findings_sha256=preserved_hash)
dump('findings.json',main)

combined=json.loads((OUT/'coverage.json').read_text())
inventory={e['path']:e for e in combined['inventory']}
for entry in coverage['inventory']:
    if entry['path'] not in inventory:
        inventory[entry['path']]=dict(entry,binary=False,lexical_signals={})
        continue
    old=inventory[entry['path']]
    assert old['sha256']==entry['sha256']
    old_ranges=old.get('reviewed_ranges',old.get('reviewed_line_ranges',[]))
    if old['review_level']=='semantic' and not old_ranges: old_ranges=[[1,old['lines']]]
    merged=merge_ranges(old_ranges+entry['reviewed_ranges'])
    old['reviewed_ranges']=old['reviewed_line_ranges']=merged
    old['review_level']='semantic' if old['review_level']=='semantic' or entry['review_level']=='semantic' else 'targeted'
    old['ai_review']=entry
    if 'ai_review_previous_basis' not in old: old['ai_review_previous_basis']=old.get('review_basis','')
    old['review_basis']=old['ai_review_previous_basis']+' IA adicional: '+entry['review_basis']
combined['inventory']=sorted(inventory.values(),key=lambda e:e['path'])
cc=Counter(e['review_level'] for e in combined['inventory'])
combined['counts']={'total':len(inventory),**dict(cc)}
layers=defaultdict(Counter)
for e in combined['inventory']:
    layers[e['layer']][e['review_level']]+=1
combined['layers']={k:{'total':sum(v.values()),**dict(v)} for k,v in sorted(layers.items())}
combined['ai_review']=dict(artifact='ai-review-coverage.json',primary_files=12,primary_lines=2692,counts=coverage['counts'])
dump('coverage.json',combined)

main_report=(OUT/'report.md').read_text()
marker='\n## Lote IA delegado integrado\n'
main_report=main_report.split(marker)[0].rstrip()+'\n'
severity=Counter(f['severity'] for f in main['findings'])
main_report=re.sub(r'## Resultado: \d+ mecanismos adicionais \(\d+ P1, \d+ P2\)',f"## Resultado: {len(main['findings'])} mecanismos adicionais ({severity['P1']} P1, {severity['P2']} P2)",main_report)
main_report='\n'.join(line for line in main_report.splitlines() if not any(line.startswith(f'| {fid} |') for fid in new_ids))+'\n'
table='\n'.join(f"| {f['id']} | {f['severity']} | {f['title']} | novo; lote IA delegado |" for f in findings)
main_report=main_report.replace('\n## Evidência executada e limites',table+'\n\n## Evidência executada e limites',1)
main_report=re.sub(r'Foram inventariados \d+ arquivos: \d+ com revisão semântica, \d+ com revisão dirigida e \d+ com revisão estrutural\.',f"Foram inventariados {len(inventory)} arquivos: {cc['semantic']} com revisão semântica, {cc['targeted']} com revisão dirigida e {cc['structural']} com revisão estrutural.",main_report, count=1)
start=main_report.index('| Camada | Semântica | Dirigida | Estrutural | Total |')
end=main_report.index('\n\nWiring preservado:',start)
layer_table='| Camada | Semântica | Dirigida | Estrutural | Total |\n|---|---:|---:|---:|---:|\n'+'\n'.join(f"| {k} | {v.get('semantic',0)} | {v.get('targeted',0)} | {v.get('structural',0)} | {v['total']} |" for k,v in combined['layers'].items())
main_report=main_report[:start]+layer_table+main_report[end:]
main_report+=marker+'\n'+text.replace('# Revisão IA delegada — pipeline, classificadores e consumidores','### Revisão IA delegada — pipeline, classificadores e consumidores',1)
(OUT/'report.md').write_text(main_report)

# Integrity checks are against sources and actual ranges, not success labels.
for f in main['findings']:
    for e in f.get('evidence',[]):
        if e.get('origin') not in (None,'source'): continue
        p=SOURCE/e['path']
        if p.exists() and 'sha256' in e:
            assert sha(p)==e['sha256'], e
            assert 1<=e['line_start']<=e['line_end']<=len(p.read_text().splitlines()), e
for e in combined['inventory']:
    assert sha(SOURCE/e['path'])==e['sha256'],e['path']
    for a,b in e.get('reviewed_ranges',[]): assert 1<=a<=b<=e['lines'],e['path']
integrity=dict(schema_version=1,baseline_sha=HEAD,source_hashes_checked=len(combined['inventory']),
    finding_counts=dict(severity), finding_total=len(main['findings']), ia_added_ids=sorted(new_ids),
    evidence_refs=sum(len(f.get('evidence',[])) for f in main['findings']), coverage_counts=combined['counts'],
    preserved_prior_findings_sha256=preserved_hash,
    artifact_hashes={p.name:sha(p) for p in [OUT/x for x in ['findings.json','coverage.json','report.md','ai-review-findings.json','ai-review-coverage.json','ai-review-report.md','ai-review-probes.json','probe-ai-review.mjs','ai-review-probe-pins.json']]})
dump('ai-review-integrity.json',integrity)
print(json.dumps({'findings':len(main['findings']),'severity':dict(severity),'coverage':combined['counts'],'ia_scope':coverage['primary_scope'],'evidence_refs':integrity['evidence_refs']},ensure_ascii=False))
