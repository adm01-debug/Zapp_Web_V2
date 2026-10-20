"""Reconcile manually recorded local SQL reviews. Does not execute SQL."""
from pathlib import Path
import json, hashlib, collections

OUT = Path(__file__).parent
ROOT = OUT.parents[1] / 'source'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
def read(name): return json.loads((OUT/name).read_text())
def key(e): return f"{e['path']}:{e['start_line']}:{e['end_line']}"
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def ref(path, first, last, note):
    p=ROOT/path
    assert 1 <= first <= last <= len(p.read_text().splitlines())
    return {'path':path,'start_line':first,'end_line':last,'file_sha256':sha(p),'assessment':note}

queue=read('remaining_ddl_inventory.json')
manual=read('ddl_review.json')
peer_path=OUT.parent/'root/routine-acl-review.json'
peer=json.loads(peer_path.read_text())
assert peer['source_head']==HEAD and peer['status']=='COMPLETED_REVIEW_PASS'
assert peer['statement_count']==730
peer_units={key(x['source']):x for x in peer['units']}
own=manual['instructions']
assert all(x['instruction_body_read_in_full'] for x in own.values())
file_cache={}
for e in [x['source'] for x in own.values()]+[x['source'] for x in peer_units.values()]:
    p=ROOT/e['path']
    if e['path'] not in file_cache:
        file_cache[e['path']]=(sha(p),len(p.read_text().splitlines()))
    digest,lines=file_cache[e['path']]
    assert e['file_sha256']==digest, e['path']
    assert 1<=e['start_line']<=e['end_line']<=lines, e

units=[]
for x in queue['pending_source_units']:
    k=key(x['source'])
    if x['group']=='routine_privileges':
        assert k in peer_units,k
        row={'source':x['source'],'group':x['group'],'review_owner':'root',
             'review_artifact':'../root/routine-acl-review.json','review_provenance':'peer_semantic',
             'coverage_level':'semantic','runtime_tested':False}
    else:
        assert k in own,k
        row={'source':x['source'],'group':x['group'],'review_owner':'database',
             'review_artifact':'ddl_review.json','manual_review_batches':own[k]['manual_review_batches'],
             'review_provenance':'own_semantic','coverage_level':'semantic','runtime_tested':False}
    units.append(row)

other={}
for group,data in queue['other_top_level_categories'].items():
    for e in data['source_units']: assert key(e) in own,key(e)
    other[group]={'source_instruction_count':len(data['source_units']),
        'source_line_count':sum(e['end_line']-e['start_line']+1 for e in data['source_units']),
        'status':'COMPLETED_MANUAL_READING',
        'coverage_level':'semantic_intent_only' if group=='comments_not_behavioral_ddl' else 'semantic',
        'units':[{'source':e,'manual_review_batches':own[key(e)]['manual_review_batches']} for e in data['source_units']]}

closure={
 'schema_version':1,'source_head':HEAD,'status':'COMPLETED_MANUAL_READING',
 'original_allocation_artifact':'remaining_ddl_inventory.json',
 'original_ddl_instruction_count':len(units),'pending_ddl_instruction_count':0,
 'own_original_ddl_instruction_count':sum(x['review_owner']=='database' for x in units),
 'peer_original_ddl_instruction_count':sum(x['review_owner']=='root' for x in units),
 'own_total_recorded_instruction_count':len(own),
 'own_historical_context_extra_count':len(own)-sum(x['review_owner']=='database' for x in units)-sum(v['source_instruction_count']for v in other.values()),
 'own_notes_artifact':'ddl_review.json','own_batch_count':len(manual['batches']),
 'counts_by_group':dict(collections.Counter(x['group']for x in units)),
 'peer_review':{'owner':'root','artifact':'../root/routine-acl-review.json','sha256':sha(peer_path),
   'statement_count':730,'exact_text_groups_read':peer['exact_text_groups_read'],
   'statement_lines':peer['statement_lines_with_overlap'],
   'attribution':'Leitura integral feita pelo root; incorporada por referência, não atribuída ao agente database.'},
 'units':units,'other_top_level_categories':other,
 'validated_source_file_count':len(file_cache),'runtime_tested':False,
 'limits':[
  'Instruções históricas não são somadas como objetos finais. O baseline original da fila fica preservado.',
  'Leitura da DDL não expande os 107 DO nem reconstrói por execução cada uma das 631 constraints/612 indexes do snapshot.',
  'Revisões semânticas são raciocínio manual por grupo/objeto e cadeia, não provas de replay, implantação, valores vivos ou desempenho.',
  'COMMENTs foram lidos como intenção e têm categoria própria; não atestam comportamento.',
  'Nenhum PostgreSQL, Supabase, suíte ou SQL foi iniciado/executado; nenhum segredo foi consultado.'
 ]}
(OUT/'ddl_completion.json').write_text(json.dumps(closure,ensure_ascii=False,indent=2)+'\n')

prefix='true|false|false|true|false|true|true|true|'
definition="CREATE UNIQUE INDEX ux_agent_achievements_one_time ON public.agent_achievements USING btree (profile_id, achievement_type) WHERE (achievement_type <> ALL (ARRAY['daily_goal'::text, 'streak'::text, 'message_milestone'::text, 'resolution'::text, 'resolution_milestone'::text]))"
old=definition.replace(", 'resolution_milestone'::text",'')
digest=lambda s:hashlib.md5((prefix+s).encode()).hexdigest()
assert digest(definition)=='e1ef615714441c0d456c65511cbe153c'
adjudications={
 'source_head':HEAD,'runtime_tested':False,
 'adjudications':[
  {'candidate':'resolution_milestone_unique_index','status':'REJECTED_AS_CURRENT_SNAPSHOT_BUG',
   'assessment':'Fonte CREATE top-level exclui quatro tipos, mas comentário da RPC e hash do snapshot são coerentes com cinco. Não se promove falha do segundo marco no estado capturado. Permanece drift entre DDL versionada e definição inferida do snapshot.',
   'evidence':[
    ref('supabase/migrations/20260926101212_dashboard_fix_gamification_xp_resolution.sql',23,25,'CREATE versionada exclui quatro tipos.'),
    ref('supabase/migrations/20260927470000_fix_gamification_closure_upsert_and_backfill.sql',25,31,'Writer emite resolution_milestone.'),
    ref('supabase/migrations/20260928110000_fix_grant_agent_achievement_conflict_target.sql',3,6,'Intenção explícita de índice com cinco exclusões.'),
    ref('scripts/db-audit/manifest.sql',69,83,'Regra de hash do índice.'),
   ],
   'offline_string_hash_reconstruction':{'canonical_flags_prefix':prefix,'five_type_definition':definition,
    'five_type_md5':digest(definition),'four_type_definition':old,'four_type_md5':digest(old),
    'snapshot_md5':'e1ef615714441c0d456c65511cbe153c','method':'Reconstrução inferencial finita de formato textual; apenas Python/hash de strings, sem parser/execução PostgreSQL.'}},
  {'candidate':'profile_delete_set_null_not_null','status':'STRUCTURAL_LIMIT_WITHOUT_ACTIVE_DELETION_JOURNEY',
   'assessment':'conversation_tasks.created_by e csat_surveys.agent_id tornam-se NOT NULL mantendo FKs SET NULL. Excluir perfil com dependentes falha nessa condição; Auth não encontrou consumidor de DELETE físico com obrigação de preservar/excluir dependentes. Não vira novo finding de fluxo.'},
  {'candidate':'legacy_waiting_backfill_unqualified_id','status':'HISTORICAL_SOURCE_OBSERVATION',
   'evidence':[ref('supabase/migrations/20260905080000_conversation_status_fsm.sql',68,73,'id não qualificado no EXISTS encontra messages.id no escopo interno.')],
   'assessment':'Predicado compara message.contact_id a message.id, não ao contato externo. Não se infere que contatos vivos conservem o estado dessa backfill nem que reabertura atual esteja implementada por ela.'},
  {'candidate':'duplicate_e17_indexes','status':'KNOWN_REPLAY_LIMIT_NOT_NEW',
   'evidence':[ref('docs/audits/adversarial-f1-f2-f3-onda2-2026-09-29/AUDITORIA-W3-REPLAY.md',42,65,'Falhas preexistentes já documentadas, incluindo idx_gmail_accounts_user_id, notified_at e CONCURRENTLY.')],
   'assessment':'Repetição CREATE sem IF NOT EXISTS confirmada em E17, mas mecanismo já consta da auditoria anterior e não é recontado.'},
  {'candidate':'team_message_type_intersection','status':'REJECTED_AS_ACTIVE_UPLOAD_BUG',
   'assessment':'A interseção dos CHECKs restringe message_type, mas o consumidor ativo useSendTeamMessage omite essa coluna e grava document/sticker em media_type. message_type mantém DEFAULT text, aceito nos dois CHECKs. Logo a DDL isolada não comprova falha de upload atual. TC-001 conserva seus outros mecanismos de URL/locators sem duplicação.',
   'evidence':[
    ref('supabase/migrations/20260927270003_team_chat_e12_check_constraints.sql',5,7,'CHECK restringe message_type a text/image/video/audio/document/system.'),
    ref('supabase/migrations/20260929160000_team_chat_e26_message_type_media_constraint.sql',6,6,'CHECK posterior é sobre message_type, não media_type.'),
    ref('supabase/migrations/20260402130912_abca9ec2-dfde-4f76-908b-2e993e611ad5.sql',28,39,'message_type NOT NULL DEFAULT text.'),
    ref('src/hooks/team-chat/useTeamChatMutations.ts',6,40,'INSERT transmite media_type, omitindo message_type.'),
    ref('src/components/team-chat/useTeamChatPanel.ts',262,280,'Callback de arquivo/sticker transmite mediaType e mediaUrl.'),
    ref('src/components/team-chat/TeamFileUploader.tsx',23,28,'Tipos não áudio/vídeo/imagem se tornam document.'),
    ref('src/components/team-chat/TeamFileUploader.tsx',59,89,'Upload chama onFileSent com URL e mediaType.')
   ]}
 ]}
(OUT/'ddl_adjudications.json').write_text(json.dumps(adjudications,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:closure[k]for k in ['status','original_ddl_instruction_count','own_original_ddl_instruction_count','peer_original_ddl_instruction_count','own_total_recorded_instruction_count','own_historical_context_extra_count']},ensure_ascii=False))
