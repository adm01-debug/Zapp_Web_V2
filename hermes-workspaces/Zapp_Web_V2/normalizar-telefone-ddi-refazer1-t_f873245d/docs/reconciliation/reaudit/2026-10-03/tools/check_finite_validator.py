"""Adversarial in-memory checks of the documentary gate, not product probes.

Never writes source or owner journals, never executes tests/SQL/shell/provider.
Loads the audit validator only; corruptions exist solely in copied Python dicts.
"""
from pathlib import Path
import copy
import hashlib
import importlib.util
import json
import sys

A = Path(__file__).resolve().parents[1]
tool = A/'tools/validate_finite_review.py'
spec = importlib.util.spec_from_file_location('finite_validator',tool)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
base = module.Gate(A,A/'source',True)
base.integrity()
base.result['tests'] = base.roster('test')
base.result['shell'] = base.roster('shell')
base.matrices()
base.sql()
assert not base.errors,base.errors
assert not base.pending,base.pending
cases = []

def run(name, mutate, stage, expected, pending=False):
    g = module.Gate(A,A/'source',True)
    g.head = base.head
    g.source_meta = base.source_meta
    g.inputs = copy.deepcopy(base.inputs)
    g.documents = copy.deepcopy(base.documents)
    g.sql_statement_cache = base.sql_statement_cache
    mutate(g)
    stage(g)
    observed = [e['code'] for e in (g.pending if pending else g.errors)]
    assert expected in observed,(name,expected,observed)
    cases.append(dict(name=name,expected=expected,observed=observed,status='PASS'))

run('journal_missing_stays_pending',
    lambda g:g.documents.__setitem__('reports/providers/shell-review.json',None),
    lambda g:g.roster('shell'),'ROSTER_READING_PENDING',True)
run('sha256_wrong_rejected',
    lambda g:g.documents['reports/providers/test-review.json']['files'][0].__setitem__('source_sha256','0'*64),
    lambda g:g.roster('test'),'SHA256_MISMATCH')
run('adjudication_missing_rejected',
    lambda g:g.documents['reports/providers/test-review.json']['files'][0].__setitem__('adjudication',''),
    lambda g:g.roster('test'),'ADJUDICATION_MISSING')
run('whole_file_range_truncated_rejected',
    lambda g:g.documents['reports/providers/test-review.json']['files'][0]['reviewed_ranges'][0].__setitem__('line_end',2),
    lambda g:g.roster('test'),'JOURNAL_NOT_WHOLE_FILE')
run('duplicate_peer_counting_rejected',
    lambda g:g.documents['reports/providers/test-review.json']['files'].append(copy.deepcopy(g.documents['reports/providers/test-review.json']['files'][0])),
    lambda g:g.roster('test'),'DUPLICATE_JOURNAL_ENTRY')
run('unknown_status_not_promoted',
    lambda g:g.documents['reports/providers/test-review.json']['files'][0].__setitem__('review_status','COMPLETE_MAYBE'),
    lambda g:g.roster('test'),'UNKNOWN_ENTRY_STATUS')
run('sql_statement_pin_wrong_rejected',
    lambda g:g.documents['reports/database/function_review.json']['functions'][0]['candidate_effective_definition'].__setitem__('statement_sha256','0'*64),
    lambda g:g.sql(),'SQL_STATEMENT_PIN')

def delete_ddl(g):
    d = g.documents['reports/database/ddl_completion.json']
    d['units'].pop(0)
    d['original_ddl_instruction_count'] -= 1
run('ddl_delete_and_recount_rejected',delete_ddl,lambda g:g.sql(),'DDL_ALLOCATION_CROSSWALK')
run('ddl_nonexistent_review_artifact_rejected',
    lambda g:g.documents['reports/database/ddl_completion.json']['units'][0].__setitem__('review_artifact','missing.json'),
    lambda g:g.sql(),'DDL_OWN_PROVENANCE')

def unset_ddl_note(g):
    unit = g.documents['reports/database/ddl_completion.json']['units'][0]
    s = unit['source']
    key = f'{s["path"]}:{s["start_line"]}:{s["end_line"]}'
    g.documents['reports/database/ddl_review.json']['instructions'][key]['instruction_body_read_in_full'] = False
run('ddl_allocation_without_body_read_rejected',unset_ddl_note,lambda g:g.sql(),'DDL_MANUAL_INSTRUCTION_MISSING')

def remove_ranges(g):
    body = g.documents['consolidated/function-review-matrix.json'][0]
    row = next(x for x in g.documents['consolidated/file-review-matrix.json'] if x['path']==body['path'])
    row['reviewed_ranges'] = []
    row['reviewed_line_union'] = []
run('body_complete_flag_without_ranges_rejected',remove_ranges,lambda g:g.matrices(),'BODY_CONTAINMENT_STATE')

result = dict(schema_version=1,source_head=base.head,status='PASS',case_count=len(cases),cases=cases,
    validator_sha256=hashlib.sha256(tool.read_bytes()).hexdigest(),
    checker_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    product_code_executed=False,source_changes=0,owner_artifact_changes=0,
    limits=['These are in-memory adversarial checks of the audit validator, not application tests or new provider probes.',
        'No finish() call: no simulated corruption is written to completion outputs; final CLI still needs its independent run.'])
(A/'global/finite-validator-checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'PASS','cases':len(cases),'product_code_executed':False}))
