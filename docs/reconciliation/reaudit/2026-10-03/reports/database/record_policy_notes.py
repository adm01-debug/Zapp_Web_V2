"""Store manual notes AFTER the listed complete bodies have been displayed/read."""
from pathlib import Path
import json
OUT=Path(__file__).parent

def record(notes,batch):
    path=OUT/'access_manual_reviews.json'
    manual=json.loads(path.read_text())
    roster=json.loads((OUT/'policy_review.json').read_text())
    rows=roster['policies']+roster['source_extras']
    written=[]
    for table,note in notes.items():
        canonical=table if '.' in table else 'public.'+table
        selected=[r for r in rows if r['table']==canonical]
        assert selected,table
        for row in selected:
            manual['policies'][row['identity']]={
                'review_batch':batch,'body_read_in_full':True,
                'note':note,'runtime_tested':False,
                'source_scope':'snapshot_public' if row['snapshot_identity'] else 'source_extra_requires_adjudication',
            }
            written.append(row['identity'])
    path.write_text(json.dumps(manual,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'recorded_policies':len(written),'tables':list(notes)},ensure_ascii=False))
