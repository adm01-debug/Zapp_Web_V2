"""Documentation-only entrypoint review integration."""
from pathlib import Path
import json,hashlib,subprocess
from merge_finite_batch import merge_batch
R=Path('/workspace/scratch/f8f9b9cbce53/reaudit');S=R/'source';O=R/'reports/infra';H='da307ba5626dce892f0b37cb6762463f55d14a96'
notes={
 '.husky/pre-commit':'Invoca lint-ratchet --staged; status da única chamada Node é status do hook. Gate incremental por dívida nova, não lint integral. Nenhuma execução; consumidor do runner já revisado.',
 '.husky/pre-push':'set-e propaga erro dos runners typecheck, lint e migration-drift em sequência. Não corrige falsa aceitação dentro de typecheck (INF008); comentário offline supõe ambiente sem DESTINO_URL, o hook não limpa a variável. Não foi invocado nem se inferiu consulta de banco nesta revisão.',
 'index.html':'Entry HTML integral: idioma/viewport/fonts; bootstrap theme cachev6/v5 e clamp raio; tratamento de exceção; remoção de flag session; watchdog até primeiro filho root, erros window/unhandledrejection e fallback HTML; mount src/main.tsx. Sem DOM/render/rede. O fallback concatena mensagens em innerHTML, mas não foi estabelecido dado adversário alcançável durante bootstrap: observação, não novo XSS. Tema HC antecipado está dentro do cachev6; componentes de tema posteriores não foram confundidos com bootstrap. Prazo8s e override já explicitam limite cold-start, sem novo ID genérico.',
 'public/manifest.json':'Manifest declarativo integral: start/scope/display standalone, idioma, ícones any/maskable, sem shortcuts/handlers. Não há link manifest neste index.html; PWA/SW desabilitado é decisão preservada. Não equivale a instalação ativa nem nova falha.',
 'public/version.json':'Metadados estáticos integrais de versão, ambiente, endpoints públicos e data histórica. Não é atestado de deploy recente; sem segredo ou consulta de endpoint. Nenhum ID por metadado estático sem consumidor que prometa frescor.'}
inv=[]
for path,note in notes.items():
 p=S/path;b=p.read_bytes();n=len(b.decode().splitlines())
 inv.append(dict(path=path,sha256=hashlib.sha256(b).hexdigest(),git_blob_sha=subprocess.check_output(['git','hash-object',str(p)],text=True).strip(),bytes=len(b),lines=n,baseline_sha=H,reviewed_ranges=[[1,n]],review_level='semantic',full_file_read=True,primary_delegated=True,layer='entrypoint_support',review_basis=note,execution='NOT_EXECUTED'))
assert sum(x['lines']for x in inv)==177
def dump(f,d):(O/f).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
dump('entrypoint-review.json',dict(schema_version=1,baseline_sha=H,status='COMPLETED',files=inv,completed_files=5,completed_lines=177,new_findings=0,product_executions=0))
dump('entrypoint-review-findings.json',dict(schema_version=1,baseline_sha=H,findings=[]))
dump('entrypoint-review-coverage.json',dict(schema_version=1,baseline_sha=H,state='COMPLETED',primary_files=5,primary_lines=177,primary_full_file_read=5,primary_remaining=0,counts=dict(total=5,semantic=5),inventory=inv))
md='# Entrypoints sem extensão e metadados públicos\n\nLidos integralmente5 arquivos/177 linhas; zero execução. Os hooks encaminham os gates já revisados; o HTML inicializa tema/watchdog/mount e os JSONs são metadados declarativos. PWA/SW desligado permanece decisão preservada. Não foram promovidos riscos hipotéticos de bootstrap, metadados antigos sem promessa de frescor ou limites genéricos.\n\n'
for x in inv:md+='- `'+x['path']+'`,1–'+str(x['lines'])+': '+x['review_basis']+'\n'
(O/'entrypoint-review-report.md').write_text(md.replace('integralmente5','integralmente 5'))
print(json.dumps(merge_batch('entrypoint-review','entrypoint_review','entrypoints e metadados públicos',43,artifacts=['entrypoint-review.json','finalize_entrypoint_review.py']),ensure_ascii=False,indent=2))
