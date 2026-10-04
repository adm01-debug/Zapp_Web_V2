#!/usr/bin/env node
// Offline counterexamples, exact source nodes and synthetic I/O boundaries.
// node communication_probes.cjs SOURCE INTEGRITY_JSON TYPESCRIPT_JS OUTPUT
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const [source, integrityPath, tsPath, output] = process.argv.slice(2);
if (!output) throw new Error('SOURCE, INTEGRITY_JSON, TYPESCRIPT_JS and OUTPUT required');
const integrityBytes = fs.readFileSync(integrityPath);
const integrity = JSON.parse(integrityBytes);
const ts = require(path.resolve(tsPath));
assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), integrity.head_sha);
const entries = new Map(integrity.files.map(f => [f.path, f]));
const pins = new Map();
globalThis.fetch = () => { throw new Error('Network is forbidden in these offline probes'); };
function parse(relative) {
  const b = fs.readFileSync(path.join(source, relative));
  const blob = crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
  assert.equal(blob, entries.get(relative)?.git_blob_sha, `Unpinned source: ${relative}`);
  pins.set(relative, {path:relative, git_blob_sha:blob, sha256:crypto.createHash('sha256').update(b).digest('hex')});
  return ts.createSourceFile(relative, b.toString('utf8'), ts.ScriptTarget.Latest, true, relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function nodes(sf, predicate) {
  const out = [];
  const visit = n => { if (predicate(n)) out.push(n); ts.forEachChild(n,visit); };
  visit(sf); return out;
}
function expression(relative, name) {
  const sf = parse(relative);
  const candidates = nodes(sf, n => ts.isVariableDeclaration(n) && (ts.isIdentifier(n.name) ? n.name.text === name : ts.isArrayBindingPattern(n.name) && n.name.elements.some(e => e.name?.getText(sf) === name)));
  assert.equal(candidates.length,1,`Exact unique declaration ${relative}:${name}`);
  let node = candidates[0].initializer;
  if (ts.isCallExpression(node) && ['useCallback','useMemo','useState'].includes(node.expression.getText(sf))) node = node.arguments[0];
  return node.getText(sf);
}
function compile(expr, env={}) {
  const js = ts.transpileModule(`return (${expr});`, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  return new Function(...Object.keys(env),js)(...Object.values(env));
}
function deferred() { let resolve; const promise = new Promise(r => {resolve=r}); return {promise,resolve}; }
const results=[];
async function probe(id, title, run, limits) {
  const observed=await run(); results.push({id,title,status:'PASS',observed,limits});
}
const threadPath='src/components/email/EmailChatThread.tsx';
const inboxPath='src/components/email/EmailChatInbox.tsx';
const composerPath='src/components/gmail/EmailComposer.tsx';
const barPath='src/components/email/EmailChatReplyBar.tsx';
async function main() {
  await probe('COM-P01','Context notification creates another parent update on every callback identity change',()=>{
    const parent=parse(inboxPath), child=parse(threadPath);
    const attrs=nodes(parent,n=>ts.isJsxAttribute(n)&&n.name.getText(parent)==='onContextDataChange');
    assert.equal(attrs.length,1);
    const callbackText=attrs[0].initializer.expression.getText(parent);
    const effects=nodes(child,n=>ts.isCallExpression(n)&&n.expression.getText(child)==='useEffect'&&n.arguments[1]?.getText(child).includes('onContextDataChange'));
    assert.equal(effects.length,1);
    const effectText=effects[0].arguments[0].getText(child);
    const dependencyNames=effects[0].arguments[1].elements.map(n=>n.getText(child));
    assert(dependencyNames.includes('onContextDataChange'));
    const messages=[{id:'fixture-message'}], attachments=[];
    let state={accountId:'fixture-account',messages,attachments}; let updates=0; let previousCallback;
    for(let render=0;render<6;render++) {
      const cb=compile(callbackText,{activeAccount:{id:'fixture-account'},setThreadContext:v=>{ assert(!Object.is(state,v)); state=v; updates++; }});
      assert(!Object.is(cb,previousCallback));
      compile(effectText,{onContextDataChange:cb,threadMessages:messages,contextualAttachments:attachments})();
      previousCallback=cb;
    }
    assert.equal(updates,6);
    return {bounded_parent_renders:6,parent_updates:updates,stable_message_and_attachment_arrays:true,dependency_names:dependencyNames};
  },'Executes the exact parent callback and effect; models dependency identity with Object.is. It is not a DOM render, browser hang measurement or production incident.');
  await probe('COM-P02','Late preview for A replaces bytes beneath attachment B',async()=>{
    const pending=new Map();let attachment=null,content=null;
    const open=compile(expression(threadPath,'openAttachmentPreview'),{useCallback:x=>x,setPreviewAttachment:x=>attachment=x,setPreviewContent:x=>content=x,getAttachmentContent:a=>{const d=deferred();pending.set(a.id,d);return d.promise},toast:{error:()=>{}}});
    const first=open({id:'fixture-A',filename:'A.txt'},'gmail-A');
    const second=open({id:'fixture-B',filename:'B.txt'},'gmail-B');
    pending.get('fixture-B').resolve('base64-of-B');await second;
    pending.get('fixture-A').resolve('base64-of-A');await first;
    assert.equal(attachment.id,'fixture-B');assert.equal(content,'base64-of-A');
    return {selected_attachment:attachment.id,displayed_content_from:'fixture-A',requests_finished_in_order:['B','A']};
  },'Synthetic attachment content and deferred promises; no actual email, file download or DOM. A can be closed before B is opened; the callback has no cancellation/identity check.');
  await probe('COM-P03','Discard deletes the local draft and closes despite remote delete denial',async()=>{
    let closed=0,removed=0,attempted=0;
    const discard=compile(expression(composerPath,'discardDraft'),{
      draftTimerRef:{current:undefined},setDraftDirty:()=>{},draftSaveQueueRef:{current:Promise.resolve()},
      draftIdRef:{current:'fixture-remote-draft'},deleteDraft:{mutateAsync:async()=>{attempted++;throw new Error('synthetic denial')}},
      removeEmailDraftSession:()=>removed++,draftStorageKey:'fixture-session',onClose:()=>closed++,
    });
    await discard();assert.equal(attempted,1);assert.equal(removed,1);assert.equal(closed,1);
    return {remote_delete_rejected:true,local_draft_removed:true,composer_closed:true,promise_rejected:false};
  },'Runs the exact discard callback with a rejected remote mutation; does not delete a real draft.');
  await probe('COM-P04','Forward attachment selection stays empty when metadata arrives after mount',()=>{
    const initial=compile(expression(composerPath,'selectedForwardAttachmentIds'),{forwardAttachments:[]})();
    assert.equal(initial.size,0);
    const received=[{id:'fixture-attachment',filename:'original.pdf'}];
    const selected=compile(expression(composerPath,'selectedForwardAttachments'),{forwardAttachments:received,selectedForwardAttachmentIds:initial})();
    assert.equal(selected.length,0);
    return {attachments_at_composer_mount:0,attachments_after_query:1,selected_for_forward_after_query:0};
  },'Executes exact initializer/selector with React state initialization semantics; not a mounted React integration test. The async metadata precondition is established by the source consumer/query chain.');
  await probe('COM-P05','Reply completion clears text typed while the previous reply was pending',async()=>{
    const pending=deferred();let currentBody='original text',payload;
    const send=compile(expression(barPath,'handleSend'),{
      sendLockRef:{current:false},body:'original text',attachments:[],resolvedTo:'fixture@example.invalid',to:'',
      invalidEmailTokens:()=>[],parseEmailAddressList:()=>['fixture@example.invalid'],validateEmailAttachments:()=>null,
      fileToEmailAttachment:async()=>{},mode:'reply',lastMessage:{gmail_message_id:'fixture-original'},threadId:'fixture-thread',replyRecipients:{cc:[]},
      replyEmail:{mutateAsync:async x=>{payload=x;await pending.promise}},sendEmail:{mutateAsync:async()=>{throw new Error('Unexpected new send')}},
      setBody:x=>{currentBody=x},setTo:()=>{},setAttachments:()=>{},onSent:()=>{},toast:{error:()=>{}},log:{error:e=>{throw e}},
    });
    const running=send();await Promise.resolve();await Promise.resolve();
    assert.equal(payload.text_body,'original text');
    currentBody='new text typed while waiting';
    pending.resolve();await running;
    assert.equal(currentBody,'');
    return {sent_text:'original text',unsent_text_typed_during_wait:'new text typed while waiting',draft_after_success:currentBody};
  },'Exact handler with synthetic pending mutation. Static JSX confirms the textarea is editable during the wait; no real send or DOM typing.');
  for(const pin of pins.values()) parse(pin.path);
  const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(integrityBytes).digest('hex'),
    script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,
    source_files:[...pins.values()],probes:results,network_calls:0,product_writes:0,
    method:'Exact AST source expressions transpiled and executed with explicit synthetic boundaries. Each read checks the Git blob; checkout HEAD is checked before execution.'};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({probes:results.length,passed:results.filter(r=>r.status==='PASS').length,output}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
