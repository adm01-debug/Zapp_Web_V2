"""Allocate a finite, hash-pinned reading roster; allocation never implies review."""
from pathlib import Path
import collections, hashlib, json

root = Path(__file__).resolve().parents[1]
integrity = json.loads((root/'source-integrity.json').read_text())
pins = {r['path']: r for r in integrity['files']}
matrix = json.loads((root/'consolidated/function-review-matrix.json').read_text())
pending = collections.defaultdict(list)
for f in matrix:
    if f['is_test'] and f['review_span_state'] != 'BODY_CONTAINED_IN_REVIEWED_RANGES':
        pending[f['path']].append(f)
areas = ['auth', 'database', 'inbox', 'infra', 'modules', 'providers', 'root']
rosters = {a: [] for a in areas}
totals = collections.Counter()
def preferred(path):
    p = path.lower()
    if p.startswith('supabase/functions/'):
        return 'providers'
    if p.startswith('scripts/db-') or any(s in p for s in ('migration','rls','sql','rpc','schema','database','storage-policy')):
        return 'database'
    if p.startswith(('scripts/','e2e/')) or any(s in p for s in ('realtime','telemetry','performance','layout/','transitions/','pwa','service-worker','security')):
        return 'infra'
    if any(s in p for s in ('auth','settings/','users','agents','roles','permissions','password','2fa','account','profile','sip','call')):
        return 'auth'
    if any(s in p for s in ('inbox','contacts','contact','composer','messages','message','voice','audio','quickrepl','location','media/')):
        return 'inbox'
    if any(s in p for s in ('team-chat','talkx','talk-me','dashboard','analytics','campaign','chatbot','task','workflow','automation','catalog','knowledge','report','demand','warroom','training')):
        return 'modules'
    if any(s in p for s in ('evolution','multiplix','gmail','email','webhook','integration','crm','omnichannel','external','provider','api','whatsapp')):
        return 'providers'
    return 'root'

rows = []
for path, bodies in pending.items():
    b = (root/'source'/path).read_bytes()
    pin = pins[path]['git_blob_sha']
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest() == pin
    rows.append({'path': path, 'line_start': 1, 'line_end': len(b.splitlines()), 'git_blob_sha': pin,
                 'source_sha256': hashlib.sha256(b).hexdigest(), 'uncontained_bodies_at_allocation': len(bodies),
                 'preferred_area': preferred(path), 'review_status': 'PENDING_READING'})

# Keep domain affinity where possible while avoiding one unbounded assignment.
target = sum(r['line_end'] for r in rows)/len(areas)
for row in sorted(rows, key=lambda r: (-r['line_end'], r['path'])):
    owner = row['preferred_area']
    if totals[owner] + row['line_end'] > target * 1.12:
        owner = min(areas, key=lambda a: totals[a])
    rosters[owner].append(row)
    totals[owner] += row['line_end']

for owner, allocated in rosters.items():
    out = root/'reports'/owner/'test-review-roster.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'schema_version': 1, 'source_head': integrity['head_sha'], 'owner': owner,
        'status': 'PENDING_READING', 'files': sorted(allocated, key=lambda r: r['path']),
        'limits': ['Finite allocation only; no file is promoted to semantic review by this roster.',
                   'Read assertions, mocks, fixtures and consumers as needed; do not equate test existence with runtime acceptance.',
                   'Existing later whole-file reviews may be cited and skipped, with their exact evidence source recorded.']},
        ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'files': len(rows), 'lines': sum(totals.values()), 'by_area': {
    a: {'files': len(rosters[a]), 'lines': totals[a]} for a in areas}}, indent=2))
