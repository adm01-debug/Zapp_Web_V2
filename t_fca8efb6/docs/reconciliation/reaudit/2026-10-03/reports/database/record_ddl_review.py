"""Record a human-reviewed presented batch after reading its complete output."""
from pathlib import Path
import json,sys

OUT=Path(__file__).parent
def record(batch,note,*,limitations=None):
    presented=json.loads((OUT/'ddl_last_presented.json').read_text())
    path=OUT/'ddl_review.json'
    result=json.loads(path.read_text()) if path.exists() else {
        'source_head':presented['source_head'],
        'method':'Leitura manual por lote de instruções completas, seguindo ordem por objeto e fonte. A ferramenta de impressão não marca cobertura; cada lote é anotado após leitura. Nenhum SQL executado.',
        'batches':{},'instructions':{},'runtime_tested':False,
    }
    result['batches'][batch]={'request':presented['request'],'selection':presented['selection'],
        'instruction_count':len(presented['presented_instructions']),'manual_assessment':note,
        'limitations':limitations or [],'coverage_level':'semantic','runtime_tested':False}
    for r in presented['presented_instructions']:
        e=r['source'];key=f"{e['path']}:{e['start_line']}:{e['end_line']}"
        row=result['instructions'].setdefault(key,{'source':e,'groups':[],
            'coverage_level':'semantic','instruction_body_read_in_full':True,'manual_review_batches':[],
            'runtime_tested':False})
        if r['group'] not in row['groups']:row['groups'].append(r['group'])
        if batch not in row['manual_review_batches']:row['manual_review_batches'].append(batch)
    result['coverage_counts']={'semantic':len(result['instructions'])}
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'batch':batch,'read_instructions':len(presented['presented_instructions']),
                      'unique_semantic_instructions':len(result['instructions'])},ensure_ascii=False))

if __name__=='__main__':record(sys.argv[1],sys.argv[2])
