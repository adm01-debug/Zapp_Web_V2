"""Index existing audit artifacts only. Never import or execute a probe/product module."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib,json,subprocess

R=Path('/workspace/scratch/f8f9b9cbce53/reaudit'); S=R/'source'; O=R/'reports/root'
HEAD='da307ba5626dce892f0b37cb6762463f55d14a96'
def load(path): return json.loads((R/path).read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
artifacts={}; groups=[]; cases=[]; controls=[]; excluded=[]; checks=[]
def artifact(path,kind):
 p=R/path
 assert p.is_file(),path
 entry=artifacts.setdefault(path,dict(path=path,sha256=sha(p),bytes=p.stat().st_size,kinds=[]))
 if kind not in entry['kinds']:entry['kinds'].append(kind)
 return path

findings={}
for area in ['auth','inbox','providers','modules','infra','root','calls','communication','platform']:
 p=f'reports/{area}/findings.json'; d=load(p)
 findings[area]=d.get('findings',[]) if isinstance(d,dict) else d

def links(area,case):
 cid=case.get('id',case.get('probe_id'))
 explicit=case.get('finding_id',case.get('finding'))
 found={explicit} if isinstance(explicit,str) else set()
 if cid.startswith('R2-'):found.add(cid)
 if cid in ('VENDOR-P01','VENDOR-P02'):found.add('R2-MOD-073')
 if cid=='collaboration_handoff_error_variant':found.add('R2-INB-009')
 for f in findings.get(area,[]):
  if cid in f.get('offline_reproduction',{}).get('probe_ids',[]):found.add(f['id'])
  for key in ('probe_ids','probes','offline_probes'):
   vals=f.get(key,[])
   if cid in vals:found.add(f['id'])
 return sorted(found)

def collect_pins(value,out):
 if isinstance(value,dict):
  path=value.get('path',value.get('file'))
  if isinstance(path,str) and (S/path).is_file():
   rec={k:value[k] for k in ('sha256','git_blob_sha','blob_sha','bytes') if k in value}
   if rec:out[path].append(rec)
  for key in ('source_sha256','sourceHashes','source_hashes','source_blob_hashes','sources'):
   mapping=value.get(key)
   if isinstance(mapping,dict):
    for path,val in mapping.items():
     if (S/path).is_file():
      if isinstance(val,str) and len(val) in (40,64):out[path].append({'git_blob_sha' if len(val)==40 else 'sha256':val})
      elif isinstance(val,dict):out[path].append(val)
  if isinstance(value.get('source_path'),str) and (S/value['source_path']).is_file():
   x={k:value[k]for k in ('git_blob_sha','sha256')if k in value}
   if x:out[value['source_path']].append(x)
  for v in value.values():collect_pins(v,out)
 elif isinstance(value,list):
  for v in value:collect_pins(v,out)

def group(gid,area,runner,result,pins=(),method_note=''):
 d=load(result); field=next((k for k in ('results','probes','cases')if isinstance(d.get(k),list)),None)
 arr=d[field] if field else [d]
 source_meta={k:d[k]for k in ('source_verification','provenance','integrity','source_integrity_sha256','source_pins','source_pin_count','source_head','source_sha','head','baseline_sha','head_sha')if k in d}
 g=dict(id=gid,area_owner=area,runner=artifact(runner,'runner'),results=artifact(result,'canonical_results'),pin_artifacts=[artifact(p,'pins')for p in pins],result_array=field,case_count=len(arr),method=d.get('method',d.get('execution',d.get('scope',method_note))),owner_method_note=method_note,limitations=d.get('limitations',d.get('limitation',d.get('limits',[]))),recorded_provenance=source_meta)
 groups.append(g)
 expected=d.get('script_sha256',d.get('probe_script_sha256',d.get('probe_source_sha256',d.get('integrity',{}).get('runner_sha256'))))
 if expected:checks.append(dict(kind='recorded_runner_sha256',group=gid,recorded=expected,actual=artifacts[runner]['sha256'],matches=expected==artifacts[runner]['sha256']))
 if pins:
  expected_pin=d.get('pins_sha256',d.get('integrity',{}).get('pins_sha256'))
  if expected_pin:checks.append(dict(kind='recorded_pin_sha256',group=gid,recorded=expected_pin,actual=artifacts[pins[0]]['sha256'],matches=expected_pin==artifacts[pins[0]]['sha256']))
 for idx,c in enumerate(arr):
  cid=c.get('id',c.get('probe_id')); assert cid
  assigned='communication' if cid=='COM-P10' else area
  linked=links(assigned,c)
  fallback=next((f['title']for f in findings.get(assigned,[])if f['id']in linked),cid)
  title=c.get('title',c.get('description',c.get('probe',c.get('outcome',fallback if fallback!=cid else c.get('kind',cid)))))
  item=dict(registry_key=assigned+':'+cid,id=cid,area=assigned,group=gid,title=title,finding_ids=linked,result_pointer=f'{result}#/{field}/{idx}' if field else result,status_recorded=c.get('status','OUTCOME_RECORDED; not re-executed by registry'),execution_boundary=c.get('execution',c.get('executed',g['method'])),limitations=c.get('limitations',c.get('limitation',c.get('limit',c.get('limits',c.get('note',g['limitations']))))))
  if not item['limitations']:item['limitations']=method_note or 'Limites detalhados no resultado e relatório da área; não reexecutado pelo índice.'
  item['related_finding_limitations']=[dict(finding_id=f['id'],limitations=f['limitations'])for f in findings.get(assigned,[])if f['id']in linked and f.get('limitations')]
  if c.get('kind')=='BEHAVIOR_CONTROL' or cid in ('VENDOR-P03','microphone_guard_contract_positive','media_volume_contract_positive') or (area=='providers' and cid in ('P17','P24','P38')):
   item['category']='behavior_control'; controls.append(item)
  else:
   item['category']='primary_vendor_case' if cid.startswith('VENDOR-') else 'primary_authored_case';cases.append(item)

group('auth-1','auth','probes/auth/source-probes.cjs','probes/auth/results.json',['probes/auth/source-pins.json'],'8 únicos; results.initial é histórico da mesma série, não mais8 casos; SDK/React/claims/DB simulados, sem biometria/DB/rede reais.')
group('auth-2','auth','probes/auth/second-pass-probes.cjs','probes/auth/second-pass-results.json',['probes/auth/second-pass-pins.json'])
group('auth-game','auth','probes/auth/gamification-probe.cjs','probes/auth/gamification-results.json',['probes/auth/gamification-pins.json'],'Scheduler de hooks sintético; outros jogos stub; sem crédito XP real.')
for part in ['', '/pass2','/pass3','/pass4','/pass5']:
 base='reports/inbox/probes'+part
 group('inbox'+(part.replace('/','-')or'-1'),'inbox',base+'/run.mjs',base+'/results.json',[base+'/pins.json'],'Fonte real com stripTypeScriptTypes; fronteiras simuladas; sem DOM, rede, entrega, microfone ou clipboard reais. Casos não equivalem1:1 a findings.')
 provenance=load(base+'/provenance-checks.json')
 for i,c in enumerate(provenance['checks']):
  controls.append(dict(registry_key='inbox-provenance:'+str(part)+':'+str(i),id=c['case'],area='inbox',category='provenance_negative_control',title=c['case'],result_pointer=artifact(base+'/provenance-checks.json','provenance_controls')+f'#/checks/{i}',runner=artifact(base+'/verify-provenance.py','provenance_control_runner'),observed=c))
 artifact(base+'/README.md','method_documentation')

provider_names=[('', 'probe-results'),('-provider-control','provider-control-probe-results'),('-privileged-effects','privileged-effects-probe-results'),('-multiplix-review','multiplix-review-probe-results'),('-media-ai-control','media-ai-control-probe-results'),('-final-endpoints','final-endpoints-probe-results'),('-frontend-providers','frontend-providers-probe-results'),('-frontend-persistence','frontend-persistence-probe-results'),('-security-maintenance','security-maintenance-probe-results'),('-gmail-monitor','gmail-monitor-probe-results'),('-channel-consumers','channel-consumers-probe-results')]
for suffix,result in provider_names:
 group('providers'+(suffix or '-1'),'providers','reports/providers/reproduce'+suffix+'.mjs','reports/providers/'+result+'.json',['source-integrity.json'],'verify-source valida HEAD+218 blobs backend/config antes dos imports; pins extras frontend/SQL nos resultados. P14 statement+thenable lazy; P16/P17 composição, não handler STT inteiro; React sem DOM e SQL modelado.')
artifact('reports/providers/verify-source.mjs','provenance_gate')

for gid,runner,result,pin in [
 ('infra-1','probe.mjs','offline-probes.json','probe-source-pins.json'),
 ('infra-2','probe-second-pass.mjs','second-pass-offline-probes.json','second-pass-probe-pins.json'),
 ('infra-ai','probe-ai-review.mjs','ai-review-probes.json','ai-review-probe-pins.json'),
 ('infra-observability','probe-observability.mjs','observability-probes.json','observability-probe-pins.json'),
 ('infra-ui','probe-ui-performance.mjs','ui-performance-probes.json','ui-performance-probe-pins.json'),
 ('infra-layout','probe-layout-onboarding.mjs','layout-onboarding-probes.json','layout-onboarding-probe-pins.json'),
 ('infra-telemetry','probe-telemetry-error.mjs','telemetry-error-probes.json','telemetry-error-probe-pins.json')]:
 group(gid,'infra','reports/infra/'+runner,'reports/infra/'+result,['reports/infra/'+pin],'Casos finitos heterogêneos: código real/closures, modelos de SQL e inspeções de decisão/fonte com I/O sintético. Sem SQL/provedor/CI/browser de produto; controles internos de cada caso não são outros primários.')

group('modules-1','modules','reports/modules/offline_probes.cjs','reports/modules/proofs.json',['source-integrity.json'],'18 casos de autoria, pins source_files; fronteiras React/SDK simuladas, sem browser/DB/rede.')
group('modules-final','modules','reports/modules/final_frontend_probes.cjs','reports/modules/final-frontend-proofs.json',['source-integrity.json'],'3 casos de autoria; cache/hook/render sintéticos, sem DOM.')
group('modules-vendor','modules','reports/modules/vendor_probes.cjs','reports/modules/vendor/proofs.json',['reports/modules/vendor/manifest.json'],'2 casos diagnósticos P01/P02 sobre vendored code e1 smoke P03 separado como controle. P01 contém12 subcasos; P03 contém2 entradas PCM, sem decoder nem avaliação auditiva.')

root_specs=[('root-core','root','root_source_probes.cjs','reports/root/probe-results.json'),('root-queue','root','queue_tail_probes.cjs','reports/root/queue-probe-results.json'),('root-export','root','export_validation_probe.py','reports/root/export-validation-probe-results.json'),('calls-engine','calls','call_engine_probes.cjs','reports/calls/probe-results.json'),('calls-lifecycle','calls','call_lifecycle_probes.cjs','reports/calls/lifecycle-probe-results.json'),('calls-overlay','calls','call_overlay_probes.cjs','reports/calls/overlay-probe-results.json'),('communication','communication','communication_probes.cjs','reports/communication/probe-results.json'),('communication-oauth','communication','gmail_oauth_probes.cjs','reports/communication/oauth-probe-results.json'),('platform','platform','platform_probes.cjs','reports/platform/probe-results.json'),('platform-mobile','platform','mobile_shell_probes.cjs','reports/platform/mobile-probe-results.json'),('platform-sla','platform','sla_navigation_probe.cjs','reports/platform/sla-navigation-probe-results.json')]
for gid,area,runner,result in root_specs:group(gid,area,'tools/'+runner,result,['source-integrity.json'],'Pins embutidos no resultado; código real/AST com fronteiras sintéticas. Export executou Bash exato apenas com fake node no PATH e diretório temporário, sem psql/DB.')

controls.append(dict(registry_key='auth-provenance:changed-source',id='changed_source',area='auth',category='provenance_negative_control',title='Bytes alterados recusados antes de executar código',result_pointer=artifact('probes/auth/pin-negative-result.json','provenance_controls'),observed=load('probes/auth/pin-negative-result.json')))
artifact('probes/auth/README.md','method_documentation')
excluded.append(dict(category='superseded_same_primary_cases',area='auth',case_count=8,ids=[x['id']for x in load('probes/auth/results.initial.json')['results']],artifact=artifact('probes/auth/results.initial.json','superseded_results'),reason='Histórico anterior ao reforço de proveniência; mesmos P-AUTH01–08. Não adicionar à soma.'))
excluded.append(dict(category='peer_replay',area='root',case_count=6,ids=[x['id']for x in load('reports/infra/peer-replay-root-probes.json')['probes']],artifact=artifact('reports/infra/peer-replay-root-probes.json','peer_replay'),runner=artifact('tools/root_source_probes.cjs','peer_replay_runner_reference'),reason='Reprodução independente dos ROOT-P01–P06 já contados; não seis casos primários novos. O arquivo histórico pode preceder refinamento posterior da fixture P04.'))
controls.append(dict(registry_key='database:textual-index-md5',id='resolution_milestone_unique_index',area='database',category='textual_hash_control_not_runtime',title='Reconstrução MD5 do texto canônico do índice:5 exclusões casam snapshot,4 não',result_pointer=artifact('reports/database/ddl_adjudications.json','textual_hash_control'),runner=artifact('reports/database/finalize_ddl_review.py','textual_hash_control_runner'),limitations='Nenhum PostgreSQL, SQL, suíte ou modelo comportamental executado. Controle de proveniência textual, não prova de aplicação.'))

assert len(cases)==209,len(cases)
assert len({x['registry_key']for x in cases})==len(cases)
infra_limits={
 'tls_raw_override':('Funções reais withPsqlEnvironment/endurecerDestinoTls com URI sintética e projeção de ambiente.','Sem conexão, handshake TLS, PostgreSQL ou segredo real; mede a perda das opções no ambiente gerado.'),
 'runtime_contract_shell':('lerContrato real resolve um arquivo Bash e rejeita outro arquivo ausente.','Não envia esse conteúdo a psql nem executa Bash; a falha de dialeto e a cadeia consumidora são evidência estática associada.'),
 'global_compiler_error_passes':('main de typecheck-ratchet recebe arquivo sintético de saída TS5083.','Nenhuma compilação do projeto; mede parser/exit do gate para erro global.'),
 'missing_compiler_passes':('Cópia isolada do runner implicit-any é executada em diretório sem compiler local.','Subprocesso Node em fixture temporária, não suíte/build do produto; mede erro operacional aceito como zero diagnostics.'),
 'invalid_audit_report_passes':('audit-prod real lê um relatório sintético de falha do registro.','Sem npm/bun audit ou consulta ao registro; mede a classificação permissiva do texto.'),
 'dry_run_secret_decisions':('decidirReescrita real com três condições sintéticas.','Não executa workflow, CLI ou escrita de secrets; o alcance do dry_run foi estabelecido pela leitura do workflow.'),
 'reaction_cleanup_scope':('Função cleanupE2EReactions exata transpilada com request.delete capturado.','Nenhum DELETE real; demonstra URL/filtro preparado, não alteração de reações.'),
 'db_tests_response_contract':('Runner real em subprocesso com fetch substituído por envelope/array sintético.','Nenhum SQL/DB/rede; duas variantes dentro de um caso, não duas provas primárias.'),
 'multiline_error_guard':('acharExposicoes real recebe Response sintético e lê dois handlers reais.','Não executa handlers nem expõe um erro real; demonstra limite do detector textual.')}
for x in cases:
 if x['area']=='infra' and x['id']in infra_limits:x['execution_boundary'],x['limitations']=infra_limits[x['id']]
by_area=defaultdict(Counter)
for x in cases:by_area[x['area']][x['category']]+=1
for x in controls:by_area[x['area']][x['category']]+=1
for x in excluded:by_area[x['area']][x['category']]+=x['case_count']
expected={'auth':11,'inbox':62,'providers':41,'modules':23,'infra':29,'root':11,'calls':11,'communication':10,'platform':11}
assert {a:sum(v[k]for k in ('primary_authored_case','primary_vendor_case'))for a,v in by_area.items()if a!='database'}==expected

# Verify all explicit pins contained in the selected result/pin artifacts, without evaluating source.
pinmap=defaultdict(list)
for path,a in list(artifacts.items()):
 if path.endswith('.json') and path!='source-integrity.json':collect_pins(load(path),pinmap)
pin_verification=[]
for path,records in sorted(pinmap.items()):
 data=(S/path).read_bytes(); actual256=hashlib.sha256(data).hexdigest();actualblob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 issues=[]
 for item in records:
  for k,val in item.items():
   actual=actual256 if k in ('sha256','source_sha256') else actualblob if k in ('git_blob_sha','blob_sha')else len(data)if k=='bytes'else None
   if actual is not None and val!=actual:issues.append(dict(field=k,recorded=val,actual=actual))
 pin_verification.append(dict(path=path,sha256=actual256,git_blob_sha=actualblob,record_count=len(records),matches=not issues,issues=issues))
assert all(x['matches']for x in pin_verification),[x for x in pin_verification if not x['matches']]
head=subprocess.check_output(['git','-C',str(S),'rev-parse','HEAD'],text=True).strip();assert head==HEAD
git_status=subprocess.check_output(['git','-C',str(S),'status','--porcelain'],text=True).strip()
artifact('source-integrity.json','global_source_manifest');artifact('tools/build_offline_probe_registry.py','registry_generator')

registry=dict(schema_version=1,status='COMPLETED',source_head=HEAD,method='READ_EXISTING_ARTIFACTS_AND_HASH_ONLY; no probe, test suite, product import, SQL, browser or service rerun',scope='Canonical unique primary audit cases, separately recorded controls and explicitly excluded historical/replay results',counts=dict(canonical_unique_total=len(cases)+sum(x['category']=='behavior_control' for x in controls),primary_total=len(cases),primary_authored=sum(x['category']=='primary_authored_case'for x in cases),primary_vendor=sum(x['category']=='primary_vendor_case'for x in cases),behavior_controls=sum(x['category']=='behavior_control'for x in controls),provenance_negative_controls=sum(x['category']=='provenance_negative_control'for x in controls),textual_hash_controls=sum(x['category']=='textual_hash_control_not_runtime'for x in controls),peer_replay_cases=6,superseded_same_primary_cases=8,product_test_suites_executed_by_registry=0,probes_reexecuted_by_registry=0),by_area={a:dict(c)for a,c in sorted(by_area.items())},groups=groups,cases=cases,separate_controls=controls,excluded_from_primary=excluded,artifacts=sorted(artifacts.values(),key=lambda a:a['path']),integrity=dict(source_head_matches=True,source_git_status=git_status or 'CLEAN',artifact_hashes_calculated=len(artifacts),explicit_source_pin_files_checked=len(pin_verification),source_pins=pin_verification,recorded_artifact_checks=checks,recorded_artifact_mismatches=[x for x in checks if not x['matches']]),limits=['A case is not a finding; multiple cases may support one finding and a case can narrow/reject a hypothesis.','Primary includes static/synthetic decisions and source-level models as explicitly identified; it does not mean full product integration.','No new runtime evidence was produced by this index. Product suites were read, not run.','Embedded positive/negative variants inside a primary case are not expanded into new primary cases.','Auth initial results and root peer replays are excluded from primary totals. COM-P10 is counted in Communication even though stored in Platform results.','Vendor smoke P03 is a behavior control; P01 has 12 subcases but counts once.','Database has 0 primary behavior probes; textual MD5 comparison and hash/range validators are not PostgreSQL proofs.','No claim of live deployment, real gateway/RLS/DB, provider delivery, actual browser/assistive technology, SIP hardware or OAuth interaction follows from this registry.'])
(O/'offline-probe-registry.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n')
md='# Índice único das reproduções offline\n\nForam catalogados **217 casos canônicos únicos**: **209 casos diagnósticos (207 de código de autoria e2 de vendor) e8 controles comportamentais**. Casos diagnósticos podem confirmar, delimitar ou rejeitar uma hipótese; não equivalem a209 defeitos reproduzidos. Nenhum probe foi reexecutado para montar este índice. Os testes de produto dos rosters foram apenas lidos; este levantamento não executou suítes. Cada caso aponta para resultado, runner e pins; o JSON inclui SHA256 dos artefatos e a conferência dos pins explícitos contra a fonte.\n\n| Área | Diagnósticos autoria | Diagnósticos vendor | Controles comportamentais separados | Negativos de proveniência | Replay excluído | Histórico duplicado excluído | Controle textual |\n|---|---:|---:|---:|---:|---:|---:|---:|\n'
keys=['primary_authored_case','primary_vendor_case','behavior_control','provenance_negative_control','peer_replay','superseded_same_primary_cases','textual_hash_control_not_runtime']
for area,c in sorted(by_area.items()):md+='| '+area+' | '+' | '.join(str(c[k])for k in keys)+' |\n'
md+='\nCOM-P10 pertence a Communication e está fisicamente em Platform. Auth results.initial contém os mesmos8 casos da série atual e não adiciona provas. Os6 replays do root pelo Infra também não ampliam a soma. Vendor P03 é um smoke com silêncio/seno, contado como controle; P01 contém12 variações dentro do mesmo caso. Export contém1 reprodução e2 controles. Inbox preserva64 casos canônicos:62 diagnósticos e2 controles positivos explícitos (microphone_guard_contract_positive e media_volume_contract_positive). Providers tem41 diagnósticos e3 controles comportamentais explícitos: P17 (mídia canônica), P24 (quota no modo normal), P38 (coletor CSP). O caso whisper permanece hipótese/alcance, sem novo finding implícito. O banco não executou probe comportamental ou PostgreSQL: o controle MD5 é textual.\n\nUm caso não equivale a um achado. Fronteiras simuladas e recortes AST/closures não atestam runtime integrado, RLS/gateway efetivos, entrega, browser, dispositivos ou deployment. O registro preserva os limites individuais. Os controles internos de cada caso não foram desmembrados para inflar contagens.\n\nIntegridade: '+str(len(artifacts))+' artefatos com SHA256; '+str(len(pin_verification))+' arquivos de fonte com pins explícitos conferidos; fonte '+('limpa'if not git_status else'com status registrado no JSON')+' no HEAD `'+HEAD+'`. Divergências de SHA gravado versus runner atual: '+str(len(registry['integrity']['recorded_artifact_mismatches']))+'.\n'
md=md.replace(':212',': 212').replace('e2 sobre','e 2 sobre').replace('mesmos8','mesmos 8').replace('Os6','Os 6').replace('contém12','contém 12').replace('contém1','contém 1').replace('e2 controles','e 2 controles').replace('e2 de vendor','e 2 de vendor').replace('e8 controles','e 8 controles').replace('a209 defeitos','a 209 defeitos').replace('preserva64','preserva 64').replace(':62',': 62').replace('tem41','tem 41').replace('e3 controles','e 3 controles')
(O/'offline-probe-registry.md').write_text(md)
print(json.dumps(dict(counts=registry['counts'],by_area=registry['by_area'],artifacts=len(artifacts),source_pins=len(pin_verification),recorded_mismatches=registry['integrity']['recorded_artifact_mismatches']),ensure_ascii=False,indent=2))
