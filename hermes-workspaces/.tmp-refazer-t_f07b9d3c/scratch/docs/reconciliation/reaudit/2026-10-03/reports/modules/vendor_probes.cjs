/* Safe local vendor probes. No browser, provider, network, DB or real audio. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('/workspace/scratch/8b95153002da/audit/tools/ast/node_modules/typescript');
const base = '/workspace/scratch/f8f9b9cbce53/reaudit';
const sourcePath = 'public/vendor/lamejs-1.2.1.min.js';
const raw = fs.readFileSync(path.join(base, 'source', sourcePath));
const source = raw.toString('utf8');
const blob = crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
assert.equal(blob, '8dc6b0726388ff75bec69ac55ac5a6cc49e61093');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let attackLoop = null, energyAssignment = null;
function find(node) {
  const text = node.getText(ast);
  if (ts.isForStatement(node) && /ta\[F\s*\/\s*3\]/.test(text) && (!attackLoop || text.length < attackLoop.getText(ast).length)) attackLoop = node;
  if (ts.isExpressionStatement(node) && /^ya\[1\s*\+\s*F\s*\/\s*3\]\s*\+=/.test(text)) energyAssignment = node;
  ts.forEachChild(node, find);
}
find(ast);
assert(attackLoop && energyAssignment);
const startLine = n => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1;
const endLine = n => ast.getLineAndCharacterOfPosition(n.end).line + 1;
const fragment = vm.createContext({});
const loopText = attackLoop.getText(ast);
vm.runInContext(`function mark(qa) { var ta=[0,0,0,0], Ma=10, F; ${loopText}; return ta; }`, fragment, { timeout: 2000 });
const observed = [];
for (let index = 0; index < 12; index++) {
  fragment.attackSamples = Array.from({ length: 12 }, (_, i) => i === index ? 20 : 0);
  const flags = Array.from(vm.runInContext('mark(attackSamples)', fragment, { timeout: 2000 }));
  observed.push({ input_peak_index: index, flags, marked: flags.some(Boolean) });
}
assert.deepEqual(observed.filter(r => r.marked).map(r => r.input_peak_index), [0, 3, 6, 9]);
vm.runInContext(`var ya=[0,0,0,0], F=1, Ga=20; ${energyAssignment.getText(ast)}`, fragment, { timeout: 2000 });
const aggregate = vm.runInContext('({integer_slots:Array.from(ya), extra_key:Object.keys(ya).find(k=>k.includes(".")), extra_value_is_nan:Number.isNaN(ya[1+1/3])})', fragment, { timeout: 2000 });
assert.equal(aggregate.extra_value_is_nan, true);

const context = vm.createContext({ console: { error() {} } });
vm.runInContext(source, context, { timeout: 2000 });
const smoke = vm.runInContext(`(() => {
  const cases=[];
  for (const kind of ['silence','synthetic_sine']) {
    const encoder=new lamejs.Mp3Encoder(1,44100,128);
    const sizes=[]; let firstBytes=[];
    for(let block=0;block<3;block++) {
      const input=new Int16Array(1152);
      if(kind==='synthetic_sine') for(let i=0;i<input.length;i++) input[i]=Math.round(12000*Math.sin(2*Math.PI*440*(block*1152+i)/44100));
      const bytes=encoder.encodeBuffer(input); sizes.push(bytes.length);
      if(!firstBytes.length && bytes.length) firstBytes=Array.from(bytes.slice(0,4),x=>x&255);
    }
    const tail=encoder.flush(); sizes.push(tail.length);
    if(!firstBytes.length && tail.length) firstBytes=Array.from(tail.slice(0,4),x=>x&255);
    const repeatFlushLength=encoder.flush().length;
    cases.push({kind,input_samples:3456,chunk_sizes:sizes,total_bytes:sizes.reduce((a,b)=>a+b,0),first_bytes:firstBytes,repeat_flush_length:repeatFlushLength});
  }
  return cases;
})()`, context, { timeout: 5000 });
for (const row of smoke) { assert(row.total_bytes > 0); assert.equal(row.repeat_flush_length, 0); }
const result = {
  head_sha: 'da307ba5626dce892f0b37cb6762463f55d14a96', source_path: sourcePath, git_blob_sha: blob,
  execution: 'Node VM with no network APIs; real vendored code; synthetic numerical PCM; fixed per-call timeouts.',
  probes: [
    { id: 'VENDOR-P01', kind: 'exact_original_attack_loop', source_lines: [startLine(attackLoop),endLine(attackLoop)], original_fragment: loopText, cases: observed, limit: 'Shows four marked positions out of twelve synthetic attack-vector positions. Does not establish perceptual audibility or quantify final MP3 degradation.' },
    { id: 'VENDOR-P02', kind: 'exact_original_energy_assignment', source_lines: [startLine(energyAssignment),endLine(energyAssignment)], original_fragment: energyAssignment.getText(ast), result: aggregate, limit: 'Demonstrates a fractional property key/NaN in the aggregation; no full psychoacoustic oracle.' },
    { id: 'VENDOR-P03', kind: 'public_encoder_smoke', result: smoke, limit: 'Nonempty bytes and repeat-flush termination only; no decoder, browser, standard-compliance, fidelity, long-clip, or fuzz validation.' },
  ],
};
fs.writeFileSync(path.join(base,'reports/modules/vendor/proofs.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({probes:3,marked_attack_indices:observed.filter(r=>r.marked).map(r=>r.input_peak_index),smoke}));
