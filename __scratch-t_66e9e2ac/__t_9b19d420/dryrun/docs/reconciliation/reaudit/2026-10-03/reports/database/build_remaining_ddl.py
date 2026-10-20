"""List finite source DDL still needing a dedicated semantic pass, offline.

Counts describe source instructions and lines, not effective database objects.
Already cited complete statements are kept as targeted coverage, not promoted to
semantic. Definitions replaced by a later function/view are not reread here.
"""
from pathlib import Path
import collections
import json
import re

OUT=Path(__file__).parent
ROOT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
inventory=json.loads((OUT/'sql_inventory.json').read_text())
views=json.loads((OUT/'view_review.json').read_text())
findings=json.loads((OUT/'findings.json').read_text())['findings']
coverage=json.loads((OUT/'coverage.json').read_text())
cache={}

def body(e):
    if e['path'] not in cache:cache[e['path']]=(ROOT/e['path']).read_text().splitlines()
    return '\n'.join(cache[e['path']][e['start_line']-1:e['end_line']])

read_ranges=collections.defaultdict(list)
for f in findings:
    for e in f['evidence']:
        if e.get('origin')=='source' and e['path'].startswith('supabase/migrations/'):
            read_ranges[e['path']].append((e['line_start'],e['line_end'],'targeted_finding:'+f['id']))
for v in views['views']:
    for e in v['direct_named_grant_statements_read']:
        read_ranges[e['path']].append((e['start_line'],e['end_line'],'semantic_view_named_grant'))
for t in coverage['tables_without_snapshot_policies']:
    for e in t['source_ddl_sequence']:
        sql=body(e)
        # The recorded seven-table pass says CREATE/ENABLE RLS, not every ALTER.
        if re.match(r'CREATE\s+TABLE',sql,re.I) or re.search(r'ENABLE\s+ROW\s+LEVEL\s+SECURITY',sql,re.I):
            read_ranges[e['path']].append((e['start_line'],e['end_line'],'seven_no_policy_tables_create_rls_read'))

def classify(e,sql):
    if e['kind']=='table':return 'table_create_alter_drop'
    if e['kind']=='privilege':
        if re.match(r'ALTER\s+DEFAULT\s+PRIVILEGES',sql,re.I):return 'default_privileges'
        if re.search(r'\b(?:FUNCTIONS?|ROUTINES?|PROCEDURES?)\b',sql,re.I):return 'routine_privileges'
        return 'relation_schema_type_privileges'
    if e['kind']!='other':return None
    if re.match(r'(?:CREATE\s+(?:UNIQUE\s+)?INDEX|ALTER\s+INDEX|DROP\s+INDEX)',sql,re.I):return 'index_create_alter_drop'
    if re.match(r'ALTER\s+PUBLICATION',sql,re.I):return 'publication_ddl'
    if re.match(r'(CREATE|ALTER|DROP)\s+TYPE',sql,re.I):return 'type_ddl'
    if re.match(r'(CREATE|ALTER|DROP)\s+EXTENSION',sql,re.I):return 'extension_ddl'
    if re.match(r'(CREATE|ALTER|DROP)\s+SCHEMA',sql,re.I):return 'schema_ddl'
    if re.match(r'ALTER\s+DATABASE',sql,re.I):return 'database_setting_ddl'
    return None

pending=[];covered=[];outside=collections.defaultdict(list)
for e in inventory['events']:
    if e['kind'] in {'function','policy','dynamic_do','view','trigger'}:continue
    sql=body(e).lstrip()
    group=classify(e,sql)
    if group is None:
        if re.match(r'COMMENT\s+ON',sql,re.I):category='comments_not_behavioral_ddl'
        elif re.search(r'\bcron\.(?:schedule|unschedule|alter_job)',sql,re.I):category='top_level_cron_calls'
        elif re.match(r'(BEGIN|COMMIT|SET|RESET|ANALYZE)\b',sql,re.I):category='transaction_settings_maintenance'
        elif re.match(r'CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS',sql,re.I):category='known_invalid_policy_syntax_previous_replay_audit'
        else:category='data_backfill_seed_and_other_calls'
        outside[category].append(e)
        continue
    prior=read_ranges.get(e['path'],[])
    full=[label for lo,hi,label in prior if lo<=e['start_line'] and hi>=e['end_line']]
    referenced=set()
    for lo,hi,label in prior:
        referenced.update(range(max(e['start_line'],lo),min(e['end_line'],hi)+1))
    lines=set(range(e['start_line'],e['end_line']+1))
    unread=sorted(lines-referenced)
    segments=[]
    for n in unread:
        if segments and segments[-1]['end_line']==n-1:segments[-1]['end_line']=n
        else:segments.append({'start_line':n,'end_line':n})
    row={'group':group,'path':e['path'],'source':e,'source_line_count':len(lines),
         'coverage_level':'targeted' if referenced else 'structural',
         'prior_read_or_evidence_labels':sorted(set(label for lo,hi,label in prior if lo<=e['end_line'] and hi>=e['start_line'])),
         'remaining_unreferenced_line_ranges':segments,
         'remaining_unreferenced_line_count':len(unread),
         'runtime_tested':False}
    if group=='routine_privileges':
        row['scope_note']='ACL efetiva por assinatura já foi cruzada no roster de funções. A cadeia completa de instruções GRANT/REVOKE não recebe cobertura integral só por essa correspondência.'
    if full or (referenced and not unread):
        row['read_status']='complete_instruction_already_referenced_in_prior_targeted_review'
        row['not_claimed']='Não se promove uma referência de achado a prova semântica de todas as propriedades deste DDL.'
        covered.append(row)
    else:
        row['read_status']='dedicated_ddl_semantic_pass_pending'
        if referenced:row['context_note']='A instrução foi parcialmente referenciada; a próxima passagem deve preservar contexto da instrução ao revisar o trecho restante.'
        pending.append(row)

def summarize(rows):
    groups={}
    for group in sorted({r['group'] for r in rows}):
        selected=[r for r in rows if r['group']==group]
        full_lines=set();remaining_lines=set()
        for r in selected:
            e=r['source']
            full_lines.update((e['path'],n) for n in range(e['start_line'],e['end_line']+1))
            for seg in r['remaining_unreferenced_line_ranges']:
                remaining_lines.update((e['path'],n) for n in range(seg['start_line'],seg['end_line']+1))
        groups[group]={'source_instructions':len(selected),'source_files':len({r['source']['path'] for r in selected}),
                       'unique_source_lines_with_context':len(full_lines),'unreferenced_lines_remaining':len(remaining_lines)}
    return groups

result={
    'source_head':inventory['head'],
    'method':'Fila finita de DDL top-level das 779 migrations ativas, excluindo corpos de função/policy/DO/view/trigger. Não expande SQL dinâmico nem identifica automaticamente a constraint ou índice efetivo. Sequências CREATE/ALTER/DROP permanecem ordenadas para preservar redefinições.',
    'coverage_distinction':'Corpos e vínculos semanticamente lidos estão nos seus rosters. Instruções totalmente cobertas por ranges já citados nos achados ou por grants de views/CREATE+ENABLE RLS das sete tabelas são separadas como leitura/referência dirigida anterior, sem nova alegação de cobertura semântica do DDL.',
    'pending_counts_by_group':summarize(pending),
    'pending_source_instruction_count':len(pending),
    'pending_source_file_count':len({r['source']['path'] for r in pending}),
    'pending_source_units':pending,
    'already_referenced_complete_instructions_count':len(covered),
    'already_referenced_complete_instructions':covered,
    'other_top_level_categories':{
        k:{'source_instruction_count':len(v),
           'source_line_count':sum(e['end_line']-e['start_line']+1 for e in v),
           'source_files':len({e['path'] for e in v}),'source_units':v}
        for k,v in outside.items()
    },
    'known_invalid_policy_adjudication':{
        'source':'supabase/migrations/20260916230000_talkx_e93_settings.sql',
        'prior_record':'docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md:47',
        'assessment':'CREATE POLICY IF NOT EXISTS já documentado como sintaxe inválida/inércia histórica no replay anterior. Não contado como achado novo nem como policy vencedora adicional.',
    },
    'snapshot_object_counts_for_separate_reconciliation':{'constraints':631,'indexes':612,'defaults':877,'relation_grants':4859,'routine_grants':668,'column_grants':25,'schema_grants':7,'default_grants':90},
    'limits':['Contagem de instruções históricas não é número de objetos finais.','Ranges previamente citados indicam revisão dirigida; não equivalem a cobrir toda interação de constraint/índice.','DML, seeds, cron e instruções de aplicação de configuração ficam listados à parte, sem execução nem impressão de valores sensíveis.','O snapshot dá identidades/hashes, não corpos de todas as constraints/índices nem prova de implantação viva.'],
    'runtime_tested':False,
}
(OUT/'remaining_ddl_inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pending_units':len(pending),'pending_files':result['pending_source_file_count'],
                  'groups':result['pending_counts_by_group'],'previously_referenced_units':len(covered),
                  'outside_ddl':{k:{a:b for a,b in v.items() if a!='source_units'} for k,v in result['other_top_level_categories'].items()}},ensure_ascii=False))
