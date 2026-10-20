# Probe offline do módulo Other: reproduz a expressão de seleção do FilesTab, a função de
# exportação do Catálogo e o callback do Gmail com fixtures determinísticas.
# Um caminho de checkout não é permissão para executar outra fonte: atesta o HEAD e o
# SHA-256 de cada arquivo lido ANTES de extrair qualquer coisa, e recusa divergência em
# vez de rotular um baseline fixo que não foi o executado.
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
r = Path(os.environ.get('RECONCILIATION_REPO', os.getcwd())).resolve()
PINS = json.loads((HERE / 'source-pins.json').read_text(encoding='utf-8'))
GIT_ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'GIT_CONFIG_NOSYSTEM': '1',
           'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_OPTIONAL_LOCKS': '0'}


def recusar(mensagem):
    sys.stderr.write('Provenance refusal: %s\n' % mensagem)
    raise SystemExit(2)


def head_do_checkout():
    try:
        return subprocess.run(
            ['git', '--no-replace-objects', 'rev-parse', '--verify', 'HEAD^{commit}'],
            cwd=r, capture_output=True, text=True, check=True, timeout=30, env=GIT_ENV,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError) as exc:
        recusar('cannot verify checkout HEAD at %s (%s)' % (r, exc))


if not isinstance(PINS.get('baseline_sha'), str) or not PINS.get('source_sha256'):
    recusar('pins must declare baseline_sha and source_sha256')
HEAD = head_do_checkout()
if HEAD != PINS['baseline_sha']:
    recusar('checkout HEAD %s is not the audited baseline %s' % (HEAD, PINS['baseline_sha']))
for rel, esperado in sorted(PINS['source_sha256'].items()):
    try:
        conteudo = (r / rel).read_bytes()
    except OSError as exc:
        recusar('missing attested source %s (%s)' % (rel, exc))
    observado = hashlib.sha256(conteudo).hexdigest()
    if observado != esperado:
        recusar('unattested source bytes for %s (expected %s, observed %s)' % (rel, esperado, observado))

o = HERE
s = (r / 'src/components/catalog/catalogExport.ts').read_text()
f = s[s.index('export async function collectCatalogExportRows('):s.index('// ─── Fetcher de produção')]
adaptado = '// Exact function extracted read-only from baseline. Native Node TS stripping; no application imports.\n' + f
(o / 'catalog_export_function.ts').write_text(adaptado)
s = (r / 'src/components/inbox/tabs/FilesTab.tsx').read_text()
needle = 'filtered.filter((item) => selection.selectedIds.has(item.id))'
assert needle in s
gmail_source = (r / 'src/hooks/integrations/useGmail.ts').read_text()
gmail_sync = gmail_source[gmail_source.index('  const syncInbox = useMutation({'):gmail_source.index('  const syncLabels = useMutation({')]
gmail_callback = gmail_sync.split('onSuccess: (data) => {', 1)[1].split('},', 1)[0]
assert 'toast.success' in gmail_callback
p = '''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attestProvenance, installNetworkBlock, sha256Of } from '../lib/source-provenance.mjs';
const root=(process.env.RECONCILIATION_REPO || process.cwd());
// Atesta HEAD e os hashes das fontes antes de ler ou executar qualquer coisa; recusa divergência.
const pins=JSON.parse(readFileSync(new URL('./source-pins.json', import.meta.url),'utf8'));
const provenance=attestProvenance({ root, pins });
const network=installNetworkBlock(globalThis);
const adaptedBytes=readFileSync(new URL('./catalog_export_function.ts', import.meta.url));
const adapted_source_sha256={file:'catalog_export_function.ts',expected:'ADAPTED_SHA',observed:sha256Of(adaptedBytes)};
assert.equal(adapted_source_sha256.observed,adapted_source_sha256.expected,'harness-adapted code changed since the pinned extraction');
const { collectCatalogExportRows } = await import('./catalog_export_function.ts');
const selectedIds=new Set(['image-1','pdf-1']);
const all=[{id:'image-1',type:'image'},{id:'pdf-1',type:'document'}];
let filtered=all.filter(x=>x.type==='image');
const selection={selectedIds};
const selectedItems=EXPRESSION;
assert.equal(selectedIds.size,2);
assert.equal(selectedItems.length,1);
filtered=[];
const allOutsideItems=EXPRESSION;
assert.equal(allOutsideItems.length,0);
const syncData={success:false,synced:4,failed:1,failures:[{id:'failed-message',error:'controlled failure'}]};
const httpResponse=new Response(JSON.stringify(syncData),{status:207});
assert.equal(httpResponse.ok,true);
const toastEvents=[];
const invalidated=[];
const toast={success:message=>toastEvents.push({kind:'success',message})};
const queryClient={invalidateQueries:({queryKey})=>invalidated.push(queryKey)};
const invalidateThreadData=()=>invalidated.push(['gmail-threads'],['gmail-thread-counts']);
const onSyncSuccess=(data)=>{ GMAIL_CALLBACK };
onSyncSuccess(syncData);
assert.deepEqual(toastEvents,[{kind:'success',message:'4 emails sincronizados'}]);
assert.equal(invalidated.some(key=>key[0]==='gmail-accounts'),false);
const records=['A','B','C','D'].map(id=>({id,name:'Produto empatado'}));
const orders=[records,[records[2],records[0],records[1],records[3]]];
const pages=[];
const result=await collectCatalogExportRows(async ({offset,limit})=>{
 const order=orders[offset===0?0:1];
 const data=order.slice(offset,offset+limit);pages.push(data.map(x=>x.id));return {data};
},{maxRows:4,pageSize:2});
assert.deepEqual(result.map(x=>x.id),['A','B','D']);
const actions=readFileSync(root+'/src/hooks/chat/useFilesActions.ts','utf8');
const keys=[...actions.matchAll(/invalidateQueries\\(\\{ queryKey: (\\w+)\\(contactId\\)/g)].map(m=>m[1]);
assert.deepEqual(keys,['contactMediaKey','conversationTabCountsKey']);
assert.ok(!keys.includes('contactMediaCountsKey'));
console.log(JSON.stringify({
 baseline_commit:provenance.observed.head,
 baseline_sha_expected:provenance.expected.baseline_sha,
 provenance,
 adapted_source_sha256,
 network_requests:network.attempts.length,
 network_attempts:network.attempts,
 method:'Exact selectedItems expression, export function and Gmail sync onSuccess callback extracted from source, deterministic fixtures; invalidation keys inspected statically. Does not execute React, Supabase SDK, network or database.',
 selection:{displayed_count:selectedIds.size,forwarded_count:selectedItems.length,forwarded:selectedItems.map(x=>x.id),omitted:['pdf-1']},
 selection_all_outside_filter:{displayed_count:selectedIds.size,forwarded_count:allOutsideItems.length,openForward_effect:'early return, as statically checked in FilesTab.tsx'},
 gmail_partial_sync:{http_status:207,http_ok:httpResponse.ok,backend_payload:syncData,toast_events:toastEvents,invalidated_keys:invalidated,account_invalidated:false},
 export:{legal_equal_name_orders:orders.map(a=>a.map(x=>x.id)),pages,returned:result.map(x=>x.id),missing:['C']},
 invalidation:{after_delete_keys:keys,missing_key:'contactMediaCountsKey'}
},null,2));
'''.replace('EXPRESSION', needle).replace('GMAIL_CALLBACK', gmail_callback).replace('ADAPTED_SHA', hashlib.sha256(adaptado.encode()).hexdigest())
(o / 'reproduce_findings.mjs').write_text(p)
