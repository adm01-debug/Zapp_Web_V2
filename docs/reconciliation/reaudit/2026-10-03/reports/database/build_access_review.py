"""Offline source roster for manual policy/DO review; no SQL execution.

The snapshot is an identity roster, not proof that source predicates are deployed.
Dynamic blocks are attached as evidence and never executed or silently expanded.
"""
from pathlib import Path
import collections
import json
import re

ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT = Path(__file__).parent
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
inv = json.loads((OUT/'sql_inventory.json').read_text())
manifest = json.loads((ROOT/'supabase/schema-manifest.json').read_text())
manual_path = OUT/'access_manual_reviews.json'
manual = json.loads(manual_path.read_text()) if manual_path.exists() else {'policies':{},'do_blocks':{},'projection_notes':[]}

def body(e):
    return '\n'.join((ROOT/e['path']).read_text().splitlines()[e['start_line']-1:e['end_line']])

def do_event(prefix, line):
    return next(e for e in inv['unexpanded_dynamic_do'] if e['path'].split('/')[-1].startswith(prefix) and e['start_line']==line)

events = collections.defaultdict(list)
for e in inv['events']:
    if e.get('kind')=='policy': events[e['identity']].append(e)

rename_old = 'public.conversation_events.Agents or admins can view conversation events'
rename_new = 'public.conversation_events.conversation_events_select_policy'
dynamic = {
    'public.query_telemetry.Users can view own telemetry':do_event('20260401000946',26),
    'public.sicoob_contact_mapping.Only admins can view sicoob mappings':do_event('20260321194716',36),
}
scope_do = do_event('20260930142000',16)
scope_tables = {'conversation_snoozes','favorite_contacts','login_attempts','pinned_conversations','talkx_templates'}

def source_state(identity):
    history = events.get(identity,[])
    if identity == rename_new:
        history = events[rename_old]
    creates = [j for j,e in enumerate(history) if e['action']=='create']
    if creates:
        current = history[creates[-1]:]
        # Last create followed by ALTER; retain statements needed for predicate,
        # role and rename, not a synthesized executed policy definition.
        current = [e for e in current if e['action']!='drop']
        mode = 'direct_create_and_subsequent_alters'
        if identity==rename_new: mode='explicit_policy_rename'
    elif identity in dynamic:
        current=[dynamic[identity]];mode='conditional_create_in_do'
    else:
        current=[];mode='unresolved'
    contexts=[]
    parts=identity.split('.',2)
    if parts[0]=='public' and parts[1] in scope_tables:
        contexts=[scope_do]
    return history,current,contexts,mode

def row(identity,snapshot_key=None,snapshot_hash=None):
    history,current,contexts,mode=source_state(identity)
    review=manual['policies'].get(identity)
    table='.'.join(identity.split('.')[:2])
    grants=[]
    for key in manifest['relation_grants']:
        if key.startswith('r:'+table+'|'):grants.append(key)
    return {
        'identity':identity,'table':table,
        'snapshot_identity':snapshot_key,'snapshot_policy_hash':snapshot_hash,
        'definition_resolution':mode,
        'source_definition_statements':current,
        'conditional_role_scope_blocks':contexts,
        'top_level_history':history,
        'snapshot_relation_grants':grants,
        'coverage_level':'semantic' if review else 'structural',
        'manual_review':review,
        'runtime_tested':False,
        'dynamic_expansion_executed':False,
    }

snapshot=[]
for key,h in sorted(manifest['policies'].items()):
    table,name=key.split('.',1)
    identity='public.'+table+'.'+name.strip('"')
    snapshot.append(row(identity,key,h))
snapshot_ids={r['identity'] for r in snapshot}
extra=[]
for identity in sorted(set(inv['candidate_final_policies'])-snapshot_ids):
    r=row(identity)
    r['extra_classification']='outside_public_snapshot' if not identity.startswith('public.') else 'requires_history_adjudication_not_proven_drift'
    if identity==rename_old:r['extra_classification']='renamed_to_snapshot_identity'
    extra.append(r)

dos=[]
for n,e in enumerate(inv['unexpanded_dynamic_do'],1):
    identity=f'DO-{n:03d}'
    review=manual['do_blocks'].get(identity)
    dos.append({'identity':identity,'source':e,
        'coverage_level':'semantic' if review else 'structural',
        'manual_review':review,'body_read_in_full':bool(review),
        'dynamic_expansion_executed':False,'runtime_tested':False})

counts=lambda rows:dict(collections.Counter(r['coverage_level'] for r in rows))
policies={'source_head':HEAD,'snapshot_generated_at':manifest['generated_at'],
 'method':'Identidades do snapshot público ligadas à última CREATE e ALTERs conhecidos na cadeia local. Condicionais DO anexadas como fonte, não executadas. O hash do snapshot não é comparado ao texto lexical.',
 'coverage_counts':counts(snapshot),'extra_coverage_counts':counts(extra),
 'policies':snapshot,'source_extras':extra,
 'projection_notes':manual.get('projection_notes',[])}
do_roster={'source_head':HEAD,
 'method':'Corpos DO de migrations ativas. Leitura integral manual é marcada individualmente; nenhuma expansão SQL foi executada.',
 'coverage_counts':counts(dos),'do_blocks':dos}
(OUT/'policy_review.json').write_text(json.dumps(policies,ensure_ascii=False,indent=2)+'\n')
(OUT/'do_review.json').write_text(json.dumps(do_roster,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'policies':counts(snapshot),'source_extras':counts(extra),'do':counts(dos),'unresolved':[r['identity'] for r in snapshot if r['definition_resolution']=='unresolved']}))
