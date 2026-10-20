from pathlib import Path
import json,hashlib,re,collections

BASE=Path('/workspace/scratch/f8f9b9cbce53/reaudit')
ROOT=BASE/'source'
OUT=BASE/'reports/infra'
source=BASE/'reports/root/findings.json'
findings=json.loads(source.read_text())['findings']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def evidence(path,start,end,reason):
 p=ROOT/path;raw=p.read_bytes();lines=raw.decode().splitlines()
 assert 1<=start<=end<=len(lines)
 return dict(path=path,line_start=start,line_end=end,sha256=hashlib.sha256(raw).hexdigest(),git_blob_sha=hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest(),reason=reason)

reviews=[]
def review(id,status,basis,correction='',refs=()):
 reviews.append(dict(id=id,disposition=status,basis=basis,requested_correction=correction,independent_evidence=list(refs)))

review('R2-GOV-001','accepted',
 'Confirmados seis cabeçalhos TAREFA no prompt CRM e quatro no de Inteligência. Os dois paths aparecem uma vez no SOURCE_CATALOG e não aparecem no PLAN_REGISTRY nem nos arquivos tasks. O limite de que não são automaticamente dez tarefas novas é correto.',
 refs=[evidence('docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',44,120,'Seis tarefas históricas'),evidence('docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md',25,61,'Quatro tarefas históricas')])
review('R2-GOV-002','narrowed',
 'A divergência é confirmada. Há349 linhas de status✅; o subtotal70 do parser omite public/sw.js em duas linhas. Contagem independente dos paths literais src/public/supabase:72 referências inexistentes em72 linhas,69 paths únicos. O JSON global trata public/sw.js como NON_FILE_REFERENCE apesar de ser path de arquivo.',
 'Corrigir o parser para public/ e publicar unidades explícitas:72 referências/69 paths únicos. Manter o catálogo como alegação histórica sem inferir funcionalidade removida a partir de path renomeado.',
 [evidence('docs/COMPLETE_SYSTEM_FEATURES.md',430,446,'Push/SW e referência literal public/sw.js'),evidence('docs/COMPLETE_SYSTEM_FEATURES.md',558,562,'Segunda referência ao mesmo path'),evidence('src/config/service_worker.ts',1,8,'Capacidades explicitamente desligadas'),evidence('src/hooks/system/useServiceWorker.ts',14,43,'Remove registros antigos no fluxo ativo')])
review('R2-QUE-001','narrowed',
 'Estimativas fixas e ausência de eventos de resolução confirmadas no fluxo ativo. ROOT-P01 recebe dez contatos no total, todos atribuídos; o percentual é resolvidos/total. ROOT-P06 tem50 contatos e10 atribuídos, portanto sete resolvidos não equivalem a70% do total nesse caso.',
 'Qualificar o exemplo70% como dez contatos no total, todos atribuídos. A descoberta permanece.',
 [evidence('src/pages/QueueDetails.tsx',48,63,'Métricas locais da amostra'),evidence('src/hooks/business/useQueueAnalytics.ts',183,210,'Denominador usa total'),evidence('src/components/queues/QueueCharts.tsx',81,90,'Percentual mostrado ao usuário'),evidence('src/routes/AppRoutes.tsx',66,72,'Rota ativa')])
review('R2-QUE-002','accepted',
 'waiting_count é sobrescrito com0 no hook. Em QueuesView, ambos os alertas dependem de contagem positiva para thresholds normais válidos, e a taxa mistura membros com contatos. As metas adicionais estão persistidas, mas não aparecem na avaliação local. Não foi inferida ausência de monitor externo.',
 refs=[evidence('src/hooks/business/useQueues.ts',44,63,'Estado construído pelo hook'),evidence('src/components/queues/QueuesView.tsx',31,48,'Único avaliador local de alertas'),evidence('src/components/queues/QueueCard.tsx',53,60,'Contagem exibida')])
review('R2-QUE-003','accepted',
 'Confirmados limite50 e uso do comprimento da página como total. Num fetch bem-sucedido com50 contatos há três consultas iniciais, cem consultas de mensagens e até cinquenta de perfis:103–153 chamadas Supabase, sem contar os gráficos. Analytics/comparação não paginam; o limite real do servidor permanece uma precondição, não foi medido.',
 refs=[evidence('src/pages/QueueDetails.tsx',41,63,'Consultas por contato e total'),evidence('src/hooks/business/useQueueAnalytics.ts',217,247,'Consultas sem continuação'),evidence('src/hooks/business/useQueuesComparison.ts',54,84,'Comparação sem continuação')])
review('R2-QUE-004','accepted',
 'O algoritmo e ROOT-P02 confirmam overlap. O preset real30d usa days−1, portanto produz trinta datas civis, não31; o estado do probe é alcançável pelo seletor. A ressalva sobre date-fns/DST é apropriada.',
 refs=[evidence('src/hooks/business/useQueueAnalytics.ts',74,121,'Buckets sobrepostos'),evidence('src/components/queues/PeriodSelector.tsx',48,59,'Preset30d alcança o intervalo'),evidence('src/components/queues/QueueCharts.tsx',23,27,'Range encaminhado ao hook')])
review('R2-QUE-005','accepted',
 'saveGoal captura erro e resolve, enquanto handleSave fecha após await. O probe3 só prova a promessa resolvida; a conclusão de fechamento vem da leitura do consumidor, já declarada em probe-results.json. Ao reabrir, o useEffect também reconstrói o formulário a partir de goals antigos/default.',
 refs=[evidence('src/hooks/business/useQueueGoals.ts',68,104,'Erro não é propagado'),evidence('src/components/queues/QueueGoalsDialog.tsx',36,61,'Rascunho reidratado e fechamento')])
review('R2-QUE-006','accepted',
 'Os controles Editar e Configurar não têm callback e os componentes estão ligados à navegação ativa. updateQueue existir no hook não conecta estes controles.',
 refs=[evidence('src/components/queues/QueueCard.tsx',39,47,'Editar sem callback'),evidence('src/pages/QueueDetails.tsx',95,102,'Configurar sem callback'),evidence('src/components/queues/QueuesView.tsx',82,101,'Consumidor do card/dialog')])
review('R2-SLA-001','narrowed',
 'As fórmulas são incompatíveis na presença de registros pendentes, e nenhuma amostra retorna100. ROOT-P04 passa, mas seu único registro breached também tem first_response_at=null; o escritor versionado de primeira resposta grava breached junto com timestamp de resposta. A mesma divergência0%/90% é demonstrável com um registro respondido fora do prazo mais nove pendentes.',
 'Ajustar a fixture para o registro violado ter primeira resposta válida tardia e explicitar linhas pendentes/abertas como precondição. Não promover a população sintética a estado observado de produção.',
 [evidence('src/hooks/sla/useSLAMetrics.ts',41,74,'Elegibilidade do denominador'),evidence('src/hooks/sla/useSLAHistory.ts',87,116,'Pendentes entram como não violados'),evidence('supabase/migrations/20260903233000_sla_base_only_valid_messages.sql',46,55,'Escritor grava resposta e breach juntos')])
review('R2-SLA-002','accepted',
 'Todos aplica365dias e o histórico7d subtrai sete dias antes de incluir os dois extremos. ROOT-P05 executa getStartDate real; ROOT-P04 registra oito datas. Rótulos e consumidor foram conferidos.',
 refs=[evidence('src/hooks/sla/useSLAMetrics.ts',31,38,'Limite365'),evidence('src/hooks/sla/useSLAHistory.ts',60,83,'Janela inclusiva'),evidence('src/components/queues/SLADashboard.tsx',55,60,'Rótulo Todos')])
review('R2-SLA-003','narrowed',
 'A fonte confirma promessa de regras granulares, persistência, resolver sem consumidor localizado, indicadores com5 e última definição versionada com5min. A evidência anterior53–61 do manager começa depois da promessa, que está em50–52.',
 'Mudar a referência para50–52 e usar última definição versionada localizada em lugar de função vigente do banco, a menos que o snapshot canônico seja explicitamente ligado à implementação. Manter a fronteira entre UI ativa e implementação do resolver isolado.',
 [evidence('src/components/settings/SLARulesManager.tsx',48,53,'Promessa correta'),evidence('src/hooks/sla/useSLARules.ts',67,86,'Payload gravado'),evidence('src/hooks/sla/useApplicableSLA.ts',97,134,'Resolver isolado'),evidence('src/components/inbox/chat/ChatPanelHeader.tsx',128,132,'Indicador fixo'),evidence('src/components/inbox/VirtualizedRealtimeList.tsx',518,524,'Segundo indicador'),evidence('supabase/migrations/20260903233000_sla_base_only_valid_messages.sql',46,55,'Definição versionada')])
review('R2-SLA-004','narrowed',
 'Fórmula e condição de atraso confirmadas. Enqueue cria a mensagem sending, o provedor é chamado depois e complete_outbound_message confirma sent, mantendo created_at; trigger usa NEW.created_at. Contudo a migration declara deliberadamente uso de created_at para evitar drift. O defeito de semântica exige definir se SLA mede composição/enqueue, envio efetivo ou recibo do provedor; chegada tardia do webhook não deve ser assumida como timestamp correto.',
 'Descrever como conflito de contrato de evento/timestamp com efeito condicional, sem atribuir incidente observado. Adicionar produtor sending e consumidor complete à evidência; decisão do evento canônico precede correção.',
 [evidence('supabase/migrations/20260903225000_sla_first_response_v2.sql',2,11,'Intenção histórica do timestamp'),evidence('supabase/migrations/20260903225000_sla_first_response_v2.sql',109,135,'Trigger envia created_at'),evidence('supabase/migrations/20260909250000_allow_location_in_atomic_outbound_delivery.sql',113,120,'Mensagem criada antes de enviar'),evidence('supabase/functions/message-delivery/index.ts',300,331,'Envio e confirmação posteriores'),evidence('src/services/outbound-message.service.ts',102,137,'Cadeia ativa do browser')])

# Verify every evidence hash/range in the reviewed root JSON against the fixed checkout.
checks=[]
for f in findings:
 for e in f.get('evidence',[]):
  p=ROOT/e['path'];raw=p.read_bytes();lines=raw.decode().splitlines()
  blob=hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()
  checks.append(dict(finding=f['id'],path=e['path'],range_valid=1<=e['line_start']<=e['line_end']<=len(lines),blob_matches=e.get('git_blob_sha')==blob))
assert all(c['range_valid'] and c['blob_matches'] for c in checks)

replay=json.loads((OUT/'peer-replay-root-probes.json').read_text())
original=json.loads((BASE/'reports/root/probe-results.json').read_text())
probe_reviews=[]
for r in replay['probes']:
 other=next(x for x in original['probes'] if x['id']==r['id'])
 probe_reviews.append(dict(id=r['id'],independently_rerun=True,exit_code=0,status=r['status'],observed=r['observed'],same_as_published=other['observed']==r['observed'],limit='Fonte real extraída e dependências sintéticas; não é fluxo renderizado ou banco.' if r['id']=='ROOT-P03' else 'Prova offline de nó de fonte; sem inferência de execução remota.'))
result=dict(schema_version=1,reviewer='reaudit_infra',reviewed_area='root queues/sla/governance',baseline_sha='da307ba5626dce892f0b37cb6762463f55d14a96',reviewed_findings_path=str(source),reviewed_findings_sha256=sha(source),reviewed_probe_source_sha256=sha(BASE/'tools/root_source_probes.cjs'),reviewed_integrity_sha256=sha(BASE/'source-integrity.json'),summary=dict(findings=len(reviews),accepted=sum(x['disposition']=='accepted' for x in reviews),narrowed=sum(x['disposition']=='narrowed' for x in reviews),rejected=sum(x['disposition']=='rejected' for x in reviews),root_probes_rerun=len(probe_reviews)),reviews=reviews,root_evidence_hash_range_checks=checks,probe_reviews=probe_reviews,notes=['Nenhum achado rejeitado integralmente; narrowed identifica correção de unidade, alcance, fixture ou contrato, não invalida mecanismo local.','Root foi informado das correções durante a revisão; artefatos root podem ter sido atualizados posteriormente.','Replay independente adicionou negação de fetch antes do harness; nenhuma rede/SQL/browser foi usada.','GOV002 contagem independente é de referências literais nas349 linhas✅; não mede funcionalidades ausentes.'])
(OUT/'peer-review-root.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result['summary']))
