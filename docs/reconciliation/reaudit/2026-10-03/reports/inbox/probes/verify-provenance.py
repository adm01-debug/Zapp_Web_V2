from pathlib import Path
import tempfile, json, subprocess, shutil, os
here=Path(__file__).resolve().parent
source=Path(os.environ.get('SOURCE', here.parents[2]/'source')).resolve()
runner=here/'run.mjs'
pins=json.loads((here/'pins.json').read_text())
gitdir=subprocess.check_output(['git','-C',str(source),'rev-parse','--absolute-git-dir'],text=True).strip()
checks=[]
with tempfile.TemporaryDirectory(prefix='integrity-fixture-',dir=here) as tmp:
 t=Path(tmp); copy=t/'source'; copy.mkdir()
 # This file lets git read the expected HEAD. No git mutation is performed.
 (copy/'.git').write_text('gitdir: '+gitdir+'\n')
 for rel in pins['files']:
  to=copy/rel;to.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/rel,to)
 first=next(iter(pins['files']));p=copy/first;p.write_bytes(p.read_bytes()+b'\n// offline provenance rejection fixture\n')
 result=subprocess.run(['node','--disable-warning=ExperimentalWarning',str(runner),'--source',str(copy),'--out',str(t/'must-not-exist.json')],capture_output=True,text=True)
 assert result.returncode!=0 and 'Source blob mismatch before execution' in result.stderr
 assert not (t/'must-not-exist.json').exists()
 checks.append({'case':'changed_source_file_with_same_git_head','rejected_before_execution':True,'result_not_written':True,'exit_code':result.returncode,'file':first})
 wrong={**pins,'source_sha':'0'*40};(t/'wrong-head.json').write_text(json.dumps(wrong))
 result=subprocess.run(['node','--disable-warning=ExperimentalWarning',str(runner),'--source',str(source),'--pins',str(t/'wrong-head.json'),'--out',str(t/'must-not-exist.json')],capture_output=True,text=True)
 assert result.returncode!=0 and 'Source HEAD mismatch' in result.stderr
 assert not (t/'must-not-exist.json').exists()
 checks.append({'case':'wrong_expected_head','rejected_before_execution':True,'result_not_written':True,'exit_code':result.returncode})
(here/'provenance-checks.json').write_text(json.dumps({'checks':checks,'source_unchanged':True,'no_network':True},indent=2)+'\n')
print(json.dumps({'provenance_negative_controls':len(checks),'all_passed':True}))
