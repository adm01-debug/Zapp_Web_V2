"""Documentation-only finalizer. Preserves the original 16 findings, adds the second pass."""
from pathlib import Path
import collections
import hashlib
import json
import re
from second_pass import ROOT, OUT, HEAD, merge

OLD = Path('/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation')
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def evidence(path, start, end, reason):
    p = ROOT / path
    assert 1 <= start <= end <= len(p.read_text().splitlines()), path
    return dict(path=path, line_start=start, line_end=end, sha256=digest(p),
                baseline_sha=HEAD, origin='source', reason=reason)
def task(plan, number, scope, proposed=None):
    p = OLD / 'tasks' / f'{plan}.json'
    t = next(t for t in json.loads(p.read_text())['tasks'] if t['id'] == number)
    return dict(plan_record_id=plan, task_id=number, canonical_id=t['canonical_id'],
                previous_status=t['status'], previous_assessment=t['assessment'],
                affected_subcontract=scope, proposed_status=proposed or t['status'],
                baseline_task_file=f'tasks/{plan}.json', baseline_task_sha256=digest(p))
def finding(n, title, description, chain, preconditions, effect, refs, acceptance,
            tasks=(), probes=(), limits=()):
    return dict(id=f'R2-INF-{n:03}', title=title, severity='P2', classification='novo',
                baseline_sha=HEAD, description=description, consumer_chain=chain,
                preconditions=preconditions, effect=effect, evidence=refs,
                acceptance=acceptance, probe_ids=list(probes), related_previous_findings=[],
                novelty_basis='Mecanismo adicional não descrito nos 104 achados anteriores; novo não significa regressão posterior ao baseline antigo.',
                affected_tasks=list(tasks),
                limitations=['Sem execução de workflow, deploy, SQL, login, E2E real ou rede de produto nesta segunda passagem.'] + list(limits),
                proof_type='STATIC_AND_SYNTHETIC_OFFLINE' if probes else 'STATIC_CODE_PATH')

additional = [
    finding(17, 'Atestação de Edge aceita inventário anterior sem prova de no-op do deploy',
        'Se versão e digest remoto continuam iguais ao baseline, stable-inventory aceita a função selecionada mesmo com knownUnchanged vazio. Três amostras iguais e o tempo mínimo de 60 segundos bastam. A igualdade entre duas observações remotas não demonstra que o deploy selecionado já apareceu: um inventário ainda não atualizado satisfaz o mesmo ramo. O workflow já captura stdout e stderr e fornece a lista de no-ops, mas ela não é necessária para esse aceite.',
        ['Deploy CLI bem-sucedido → log combinado', 'unchanged-from-log → lista vazia', 'collect-remote → stable-inventory', 'Inventário pré-deploy repetido → artifact com versões antigas atribuídas ao run'],
        ['Há baseline de versão e digest para funções selecionadas.', 'O inventário da Management API ainda mostra a versão anterior por pelo menos o período mínimo, sem sinal de no-op correspondente do CLI.'],
        'A rotina pode encerrar a observação antes de aparecer a versão realmente implantada e associar os inputs do run às versões anteriores. O probe sintético aceitou 73 versões antigas aos 60 segundos, com a atualização programada para 70 segundos; não mediu latência nem deploy real.',
        [evidence('scripts/edge-deploy/stable-inventory.mjs',101,158,'Aceite por digest prévio sem exigir knownUnchanged, seguido de atestação estável'),
         evidence('.github/workflows/deploy-functions.yml',362,426,'Consumidor captura stderr, extrai no-ops e chama coletor após deploy'),
         evidence('scripts/edge-deploy/stable-inventory.unit.mjs',30,62,'Suite ratifica aceite sem bump; não exige observação de mudança atrasada')],
        ['Exigir incremento de versão/identificador de deploy, ou prova explícita de no-op do comando correspondente aliada ao baseline estável.',
         'Inventário anterior retido por mais de 60 segundos não deve ser atribuído ao deploy que mudou a função.',
         'No-op legítimo com sinal correlacionado continua concluindo de forma limitada; baseline sem versão deve produzir estado de evidência explícito.'],
        tasks=[task('P006','E06','A medição histórica permanece, mas a lógica de atribuição admite metadata obsoleta; manter revalidação do contrato de atestação.')],
        probes=['stale_remote_metadata_attested'],
        limits=['O artifact já declara source_to_bundle_equivalence_proven=false. O achado não atribui a ele uma promessa de equivalência binária.',
                'E55 (timeout/lastReason) e E56 (extrator de log/ANSI) conservam DONE_VERIFIED em seus escopos específicos.']),
    finding(18, 'KPI semanal limita runs a 100 e publica ranking de jobs sem consultá-los',
        'principal faz uma única consulta /actions/runs?per_page=100 e agrega apenas essa página como uma janela de sete dias. A tabela de jobs lentos é construída por maisLentos([]), independentemente da API: nenhum job é consultado. As funções de ranking existem, mas o consumidor real lhes passa sempre uma lista vazia antes de publicar summary e issue.',
        ['branch-hygiene-audit semanal → actions-kpi.mjs', 'Uma página de runs → agregar janela', 'maisLentos([]) → tabela vazia', 'Summary e issue KPI'],
        ['Mais de 100 runs caem na janela para que os totais sejam truncados.', 'Para a lacuna do ranking, basta executar o script: o array de jobs é sempre vazio.'],
        'Volumes e taxas semanais podem representar só a página mais recente, e a afirmação de que não há jobs registrados não é resultado de uma consulta. A publicação parece completa sem marcar esses limites.',
        [evidence('scripts/ci/actions-kpi.mjs',49,85,'Agregação/ranking de jobs disponível, mas requer dados'),
         evidence('scripts/ci/actions-kpi.mjs',126,141,'Página única, array vazio e publicação'),
         evidence('.github/workflows/branch-hygiene-audit.yml',40,64,'Invocação do coletor semanal')],
        ['Paginar runs até o limite temporal e explicitar qualquer truncamento ou falha parcial.',
         'Consultar jobs dos runs relevantes para o ranking, ou mostrar que a métrica não foi coletada.',
         'Uma fixture com mais de 100 runs e um job lento deve aparecer integralmente na janela e no ranking; falha de API não vira zero.'],
        tasks=[task('P006','E79','Coleta completa de runs e jobs não está implementada no consumidor, além da observação histórica ainda pendente.','PARTIAL')]),
    finding(19, 'Runner de mutação conta falha de infraestrutura como mutante morto',
        'runSuite retorna res.status e o chamador considera morto tudo que for diferente de zero, incluindo status null quando o binário não inicia. Não há execução verde do baseline nem exigência de assertion executada/falhada; nomes dos testes e resumo são informativos. O runner ainda termina com zero quando há sobreviventes, salvo erro de restauração. As alterações são feitas nos arquivos reais do worktree e depois restauradas; a pasta temporária guarda backups.',
        ['Execução manual run-mapa → sed -i no arquivo real', 'spawnSync de Vitest → status de processo', 'r.code !== 0 → MORTO', 'Contagem impressa e restauração → saída sem gate de qualidade'],
        ['A mutação textual é aplicada e o Vitest não inicia, falha por configuração ou por causa não ligada ao assert que deveria detectar a mutação.', 'O consumidor interpreta a contagem MORTO ou exit code como comprovação da qualidade dos testes.'],
        'É possível reportar mutações detectadas sem executar teste algum. Sobrevivência também não determina o status de saída, de modo que a ferramenta não funciona como gate de qualidade sem interpretação adicional. Não foi executada nem se atribuiu invalidez automática ao resultado histórico de 5/6.',
        [evidence('scripts/mutation/run-mapa.mjs',125,142,'Resultado do processo sem baseline ou mínimo de testes'),
         evidence('scripts/mutation/run-mapa.mjs',145,203,'Muta arquivos reais e classifica qualquer não zero como kill'),
         evidence('scripts/mutation/run-mapa.mjs',205,229,'Contagens e único exitCode explícito associado à restauração')],
        ['Exigir baseline verde e distinguir erro de infraestrutura, mutante detectado, sobrevivente e execução inconclusiva.',
         'Contar detecção apenas quando o teste relevante executou e falhou por uma assertion rastreável.',
         'Declarar política para sobreviventes/equivalentes e refletir a conclusão no status; executar mutações em cópia isolada com cleanup seguro.'],
        tasks=[task('P037','E69','Preservar PARTIAL e evidência histórica 5/6; acrescentar falta de classificação de erro de infraestrutura e baseline verde.','PARTIAL')]),
    finding(20, 'Prova dos classificadores pode aprovar consumo sem comprovar seus registros',
        'Após duas classificações, uma resposta HTTP não OK de ai_usage_logs só produz aviso, sem incrementar falhas; a saída final pode ser PROVA OK. Quando a consulta funciona, considera as últimas 20 linhas de cinco minutos e filtra somente nome de função: duas linhas de qualquer um dos classificadores, algum sucesso e algum modelo Gemini satisfazem o teste, sem correlação com as duas requisições realizadas.',
        ['QA manual autenticado → classify-sticker e classify-emoji', 'REST ai_usage_logs por janela → erro apenas avisado ou linhas não correlacionadas', 'falhas === 0 → PROVA OK e exit 0'],
        ['As verificações das duas respostas de classificação passam.', 'A consulta de consumo falha, ou há linhas anteriores de classificadores que satisfazem as condições sem pertencer às invocações da prova.'],
        'O artefato pode declarar sucesso sem demonstrar que ambas as chamadas pagas foram registradas e pelo provedor afirmado. A instrução de conferência manual não está refletida no status final; a evidência deveria ser inconclusiva até a correlação.',
        [evidence('scripts/qa/prova-visao-classificadores.mjs',1,37,'Contrato da prova e condição anunciada de sucesso'),
         evidence('scripts/qa/prova-visao-classificadores.mjs',160,190,'Chamadas, consulta sem correlação, aviso sem falha e saída final')],
        ['Usar IDs retornados/correlação das duas chamadas e exigir um registro de consumo válido para cada uma.',
         'Sem permissão para consultar o consumo, produzir status inconclusivo/falha de verificação, sem PROVA OK.',
         'Dados anteriores, duas linhas de uma só função e erros de REST não devem aprovar a prova.'],
        limits=['Revisão de fronteira confirmada com a área Providers; este é um defeito do harness, não uma nova alegação de erro de contabilização dentro das Edge Functions.']),
    finding(21, 'Falha dos fixtures E2E é omitida do veredito e do alerta do DB Live Guard',
        'O passo E85 executa check-e2e-fixtures.sql com continue-on-error:true e não tem id. O consolidado lê apenas os dez outcomes nomeados dos outros checks; não inclui fixtures. Se os demais passam, imprime que todos passaram. A abertura de issue depende de failure() e a recuperação depende de success(), permitindo fechar um alerta anterior apesar da falha de fixtures. O arquivo step-e2e-fixtures.log também não integra o upload de evidências.',
        ['DB Live Guard com credencial válida → SQL E85', 'Fixture ausente → psql ON_ERROR_STOP encerra com falha', 'continue-on-error neutraliza conclusão do passo', 'Dez outros outcomes OK → veredito verde e fechamento de alerta'],
        ['O check E85 falha por ausência de tabela/fixture, status da conexão ou falha de consulta.', 'As demais verificações e os passos do workflow terminam com sucesso.'],
        'O guard dito fail-closed para fixtures pode terminar verde sem emitir alerta e sem incluir a evidência desse check no artifact. A falha continua visível no log do passo; não se afirma desaparecimento completo dos logs.',
        [evidence('.github/workflows/db-live-guard.yml',192,205,'Passo E85 tolera erro sem id'),
         evidence('.github/workflows/db-live-guard.yml',316,347,'Outcomes consolidados excluem E85'),
         evidence('.github/workflows/db-live-guard.yml',435,451,'Veredito positivo e alerta condicionado a failure'),
         evidence('.github/workflows/db-live-guard.yml',578,630,'Recuperação automática e lista de artifacts sem fixtures'),
         evidence('scripts/db-audit/check-e2e-fixtures.sql',100,110,'SQL falha de verdade; problema está na integração do workflow')],
        ['Dar id ao check e incluir seu outcome no consolidado, no conjunto de falhas e no mapa de logs.',
         'Falha isolada de fixture deve impedir sucesso/fechamento de alerta e produzir causa identificável.',
         'Incluir evidência de fixtures no artifact e testar o cenário de apenas E85 falhar, sem rodar contra produção.'],
        tasks=[task('P006','E85','SQL de presença existe e falha; resta propagar a falha no workflow, alerta e evidência.','PARTIAL')]),
]

# Later independently reviewed locus; keep the original five IDs.
from extend_inf019 import apply_extension
apply_extension(next(f for f in additional if f["id"] == "R2-INF-019"))

merge()
doc = json.loads((OUT / 'findings.json').read_text())
original = [f for f in doc['findings'] if int(f['id'].split('-')[-1]) <= 16]
assert len(original) == 16
doc['findings'] = original + additional
doc['second_pass'] = dict(ledger='second-pass-review.json', new_findings=5,
                          ids=[f['id'] for f in additional], probe='second-pass-offline-probes.json')
(OUT / 'findings-second-pass.json').write_text(json.dumps(dict(baseline_sha=HEAD, findings=additional), ensure_ascii=False, indent=2) + '\n')
(OUT / 'findings.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')

coverage = json.loads((OUT / 'coverage.json').read_text())
coverage['remaining_gaps'] = [
    'A maioria dos 84 contratos .test.sh e das suites Node repetitivas permanece estrutural nesta área; arquivos invocados foram mapeados, sem inferir assertions integralmente auditadas ou execuções.',
    '61 arquivos tests/contracts, 8 arquivos src/test e a maior parte dos specs E2E permanecem estruturais ou dirigidos; não foram executados nesta auditoria.',
    'Baselines JSON extensos, lockfiles, fixtures e documentação auxiliar não foram automaticamente promovidos a leitura semântica por terem consumidores revisados.',
    'Os dois arquivos de ambiente foram inspecionados apenas por nomes de variáveis e linhas de declaração; valores e disponibilidade real não foram lidos.',
    'Nenhum lint/type/build completo foi executado; os probes específicos não substituem essas suites.',
    'Nenhum binário Go/PostgreSQL/Docker nem browser foi iniciado; proxy foi revisto na fonte, sem homologação de rede/TLS/IPv6.',
    'Estado real de Vercel/VPS, secrets configurados, regras GitHub, agendamentos e deploy remoto não foi consultado.',
    'Formato interno comprimido/serializado de artifacts reais de Playwright não foi inspecionado; não se atribuiu uma falha nova de redator a esse formato sem prova concreta.',
    'Sinais lexicais e hashes são inventário, não cobertura de execução. Revisão dos probes de outras áreas foi seletiva; governança global permanece com root.',
]
coverage['second_pass'].update(completed=True,
    reviewed_entrypoint_scope='.github workflows, infrastructure, scripts executáveis e configs, incluindo SQL de apoio e contratos runtime; testes repetitivos explicitamente excluídos da declaração integral.',
    new_findings=[f['id'] for f in additional],
    production_scripts_executed=False, production_network_requests=0)
(OUT / 'coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + '\n')

ledger = json.loads((OUT / 'second-pass-review.json').read_text())
for item in ledger['files']:
    item['reviewed_ranges'] = item['line_ranges']
(OUT / 'second-pass-review.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')

report = (OUT / 'report.md').read_text()
report = re.sub(r'## Resultado: \d+ mecanismos adicionais \(7 P1, \d+ P2\)',
                '## Resultado: 21 mecanismos adicionais (7 P1, 14 P2)', report)
report = report.split('\n## Segunda passagem consolidada\n')[0] if '\n## Segunda passagem consolidada\n' in report else report
# Keep the original detailed finding text. Rebuild only live summary/coverage sections.
table = ['## Inventário de achados', '', '| ID | Prioridade | Achado | Relação com auditoria anterior |', '|---|---|---|---|']
for f in doc['findings']:
    relation = ', '.join(f['related_previous_findings']) + ' como contexto' if f['related_previous_findings'] else 'sem duplicação identificada'
    table.append(f"| {f['id']} | {f['severity']} | {f['title']} | {f['classification']}; {relation} |")
report = re.sub(r'## Inventário de achados\n.*?(?=\n## Evidência executada e limites)', '\n'.join(table) + '\n', report, flags=re.S)
c = coverage['counts']
cov = ['## Cobertura real desta área', '',
       f"Foram inventariados {c['total']} arquivos: {c['semantic']} com revisão semântica, {c['targeted']} com revisão dirigida e {c['structural']} com revisão estrutural. A segunda passagem registra {ledger['counts']['total']} arquivos com faixas, SHA256, consumidor, efeitos e avaliação própria; {ledger['counts']['semantic']} foram lidos integralmente e dois arquivos de ambiente apenas por nomes. Esses números são leitura de fonte, não cobertura de execução.", '',
       '| Camada | Semântica | Dirigida | Estrutural | Total |', '|---|---:|---:|---:|---:|']
for name, count in coverage['layers'].items():
    cov.append(f"| {name} | {count.get('semantic',0)} | {count.get('targeted',0)} | {count.get('structural',0)} | {count['total']} |")
cov += ['', 'Wiring preservado: 16 workflows, 72 suites Edge .test.ts, 87 suites Node .unit/.test.mjs, 84 contratos .test.sh e 61 arquivos de contracts Vitest. A descoberta e os globs não comprovam cenários executados.', '',
        'Os quatro workflows extensos, todos os executáveis menores no escopo e os SQL de apoio foram concluídos nesta passagem. O proxy tem revisão integral da fonte, testes, Dockerfile, compose e go.mod; nenhum achado adicional foi confirmado nesse componente.', '', '### Lacunas que permanecem', '']
cov += ['- ' + s for s in coverage['remaining_gaps']]
report = re.sub(r'## Cobertura real desta área\n.*?(?=\n## Reconciliação de tarefas P006)', '\n'.join(cov) + '\n', report, flags=re.S)
report += '\n## Segunda passagem consolidada\n\n'
report += 'A primeira entrega de 16 achados foi preservada. Os cinco acréscimos abaixo afetam atribuição de deploy e integridade das provas de CI/QA. A leitura adicional não executou os entrypoints reais. Somente o probe de inventário estável importou o coletor puro após conferir HEAD e quatro hashes, com rede bloqueada, relógio e respostas sintéticos. O resultado aceitou a versão antiga aos 60 segundos; a versão nova do cenário apareceria aos 70 segundos. Esta é uma demonstração da lógica local, não observação de propagação real.\n\n'
report += 'P006 E79 e E85 passam a PARTIAL somente nos subcontratos de coleta e propagação de falha. E06 conserva NEEDS_REVALIDATION; E55/E56 conservam DONE_VERIFIED. P037 E69 já era PARTIAL e ganha uma razão adicional, sem reescrever a medição histórica de 5/6. As identidades e avaliações anteriores estão no JSON.\n'
for f in additional:
    report += f"\n### {f['id']} — {f['title']}\n\n**{f['severity']} · {f['classification']}.** {f['description']}\n\n**Cadeia:** {' → '.join(f['consumer_chain'])}.\n\n**Precondições:** {' '.join(f['preconditions'])}\n\n**Efeito:** {f['effect']}\n\n**Evidências:**\n\n"
    for e in f['evidence']:
        report += f"- `{e['path']}:{e['line_start']}–{e['line_end']}` — {e['reason']}. SHA256 `{e['sha256']}`.\n"
    report += '\n**Critérios de aceite:**\n\n' + ''.join('- ' + a + '\n' for a in f['acceptance'])
    report += '\n**Limites:** ' + ' '.join(f['limitations']) + '\n'
report += '\n### Artefatos da segunda passagem\n\n- `findings-second-pass.json`: cinco achados adicionais, também integrados ao JSON principal.\n- `second-pass-review.json`: 93 arquivos, suas faixas reais de leitura e os efeitos dos entrypoints.\n- `second-pass-probe-pins.json`, `probe-second-pass.mjs` e `second-pass-offline-probes.json`: proveniência, harness e resultado do caso R2-INF-017.\n- `append_second_pass.py`: finalizador documental idempotente; reaplica a segunda passagem após uma regeneração da primeira. Não executa código de produção.\n'
(OUT / 'report.md').write_text(report)
print(json.dumps(dict(findings=len(doc['findings']), severities=dict(collections.Counter(f['severity'] for f in doc['findings'])), coverage=c, second_pass=ledger['counts']), ensure_ascii=False))
