import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const [rootArg, integrityArg, tsArg, outArg] = process.argv.slice(2);
if (!rootArg || !integrityArg || !tsArg || !outArg) throw new Error('Usage: node catalog_microfunctions.mjs SOURCE INTEGRITY_JSON TYPESCRIPT_JS OUT_DIR');
const root=fs.realpathSync(rootArg), out=path.resolve(outArg), ts=require(fs.realpathSync(tsArg));
const integrity=JSON.parse(fs.readFileSync(integrityArg,'utf8'));
fs.mkdirSync(out,{recursive:true});
const allPaths=new Set(integrity.files.map(f=>f.path));
const files=[],functions=[],calls=[];
const isTest=p=>/(^|\/)(__tests__|tests|e2e|qa|fixtures|test)\/|\.(test|spec|unit|integration)\.|_test\.[cm]?[jt]sx?$|(^|\/)_?test[-_]?utils\.[^/]+$/i.test(p);
function layer(p){if(p.startsWith('src/'))return 'frontend';if(p.startsWith('supabase/functions/'))return 'edge';if(p.startsWith('scripts/'))return 'scripts';if(p.startsWith('infrastructure/'))return 'infrastructure';if(isTest(p))return 'tests';return 'configuration_or_other';}
function declaredName(n,sf){
  if(n.name)return n.name.getText(sf).slice(0,120);
  const p=n.parent;
  if(p&&(ts.isVariableDeclaration(p)||ts.isPropertyAssignment(p)||ts.isPropertyDeclaration(p)))return p.name.getText(sf).slice(0,120);
  if(p&&ts.isCallExpression(p)){let c=p.expression.getText(sf);if(!/^[\w.$?]+$/.test(c))c='callback';return c+'@'+(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1);}
  return 'anonymous@'+(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1);
}
function exactLiteral(n){return n&&(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&/^[\w.:/{}-]{1,160}$/.test(n.text)?n.text:null;}
for(const f of integrity.files.filter(f=>/\.(?:[cm]?js|tsx?)$/.test(f.path))){
  const full=path.resolve(root,f.path);if(!full.startsWith(root+path.sep))throw new Error('Invalid source path');
  const raw=fs.readFileSync(full), observed=crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
  if(observed!==f.git_blob_sha)throw new Error('Snapshot drift: '+f.path);
  const source=raw.toString('utf8'), sf=ts.createSourceFile(f.path,source,ts.ScriptTarget.Latest,true,f.path.endsWith('.tsx')?ts.ScriptKind.TSX:f.path.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
  const line=pos=>sf.getLineAndCharacterOfPosition(pos).line+1;
  const rec={path:f.path,git_blob_sha:f.git_blob_sha,lines:source.split('\n').length,is_test:isTest(f.path),layer:layer(f.path),functions:0,empty_catches:[],parse_diagnostics:(sf.parseDiagnostics||[]).map(d=>({line:line(d.start||0),code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}))};
  const stack=[];
  function visit(n){
    let fn=null;
    if(ts.isFunctionLike(n)&&n.body){
      const start=n.getStart(sf),end=n.end,name=declaredName(n,sf);
      fn={id:f.path+':'+line(start)+':'+start,path:f.path,name,kind:ts.SyntaxKind[n.kind],line_start:line(start),line_end:line(end),git_blob_sha:f.git_blob_sha,body_sha256:crypto.createHash('sha256').update(source.slice(start,end)).digest('hex'),parent_function:stack.at(-1)?.id||null,is_test:rec.is_test,layer:rec.layer,parameters:n.parameters?.length||0,async:!!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword),branch_nodes:0,await_nodes:0,throw_nodes:0,return_nodes:0,empty_catches:0,calls:[]};
      functions.push(fn);rec.functions++;stack.push(fn);
    }
    const active=stack.at(-1);
    if(active){
      if(ts.isIfStatement(n)||ts.isConditionalExpression(n)||ts.isCaseClause(n)||ts.isForStatement(n)||ts.isForOfStatement(n)||ts.isForInStatement(n)||ts.isWhileStatement(n)||ts.isDoStatement(n))active.branch_nodes++;
      if(ts.isAwaitExpression(n))active.await_nodes++;
      if(ts.isThrowStatement(n))active.throw_nodes++;
      if(ts.isReturnStatement(n))active.return_nodes++;
    }
    if(ts.isCatchClause(n)&&n.block.statements.length===0){rec.empty_catches.push(line(n.getStart(sf)));if(active)active.empty_catches++;}
    if(ts.isCallExpression(n)){
      let target=null;
      if(ts.isIdentifier(n.expression))target=n.expression.text;
      else if(ts.isPropertyAccessExpression(n.expression))target=n.expression.name.text;
      const literal=exactLiteral(n.arguments[0]);
      if(target&&['from','rpc','invoke','fetch','send','sendMessage','addEventListener','removeEventListener','channel','subscribe','invalidateQueries','setQueryData'].includes(target)){
        const call={path:f.path,line:line(n.getStart(sf)),function_id:active?.id||null,method:target,literal,is_test:rec.is_test};calls.push(call);if(active)active.calls.push({line:call.line,method:target,literal});
      }
    }
    ts.forEachChild(n,visit);if(fn)stack.pop();
  }
  visit(sf);files.push(rec);
}
const summary={head_sha:integrity.head_sha,typescript_version:ts.version,tracked_files:integrity.tracked_files,parsed_files:files.length,parse_error_files:files.filter(f=>f.parse_diagnostics.length).length,functions_with_bodies:functions.length,non_test_functions:functions.filter(f=>!f.is_test).length,test_or_fixture_functions:functions.filter(f=>f.is_test).length,files_with_functions:files.filter(f=>f.functions).length,call_sites:calls.length,functions_by_layer:functions.reduce((o,f)=>(o[f.layer]=(o[f.layer]||0)+1,o),{}),empty_catch_sites:files.reduce((n,f)=>n+f.empty_catches.length,0),limitations:['A function body catalog is structural evidence, not semantic review or a count of distinct business features.','Anonymous callbacks and nested functions are counted individually; overloads without bodies are excluded.','Statement counters describe syntax only; nested function statements belong to their own record.','Calls are bounded lexical candidates, not proof of backend reachability or authorization.','No source module is imported or executed by this scanner.']};
const save=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');
save('microfunction-summary.json',summary);save('microfunction-files.json',files);
for(const [name,data] of [['microfunctions.json',functions],['microfunction-calls.json',calls]]){
  const b=Buffer.from(JSON.stringify(data,null,2)+'\n');fs.writeFileSync(path.join(out,name),b);fs.writeFileSync(path.join(out,name+'.gz'),zlib.gzipSync(b,{level:9,mtime:0}));
}
console.log(JSON.stringify(summary,null,2));
