"""Documentation only: close the already-read fixed roster and merge pinned evidence."""
from pathlib import Path
from collections import Counter
import hashlib, json, subprocess
from merge_finite_batch import merge_batch

ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
SRC, OUT = ROOT/'source', ROOT/'reports/infra'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def dump(name, value): (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
def evidence(path, first, last, reason):
    return dict(path=path,line_start=first,line_end=last,sha256=sha(SRC/path),baseline_sha=HEAD,origin='source',reason=reason)

journal=json.loads((OUT/'test-review.json').read_text())
assert len(journal['files'])==118 and sum(x['line_end'] for x in journal['files'])==14473
assert all(x['review_status'] in ('READ_COMPLETE','PREVIOUS_WHOLE_FILE_REVIEW_CITED') for x in journal['files'])
for row in journal['files']:
    p=SRC/row['path']
    assert sha(p)==row['source_sha256']
    assert subprocess.check_output(['git','hash-object',str(p)],text=True).strip()==row['git_blob_sha']
    assert len(p.read_text().splitlines())==row['line_end']
    assert row['reviewed_ranges']==[[1,row['line_end']]]
    if row['path']=='e2e/a11y-contraste.spec.ts':
        row['assessment'] += ' Adjudicação final: R2-INF-042; color-contrast tem impacto serious na documentação primária axe4.13. Não se executou axe nem se inferiu contraste atual.'
    if row['path']=='e2e/fixtures/onboarding.ts':
        row['assessment'] += ' Adjudicação final: R2-INF-043; nome acessível atual vem de Bem-vindo via aria-labelledby. Depende do modal efetivamente aberto; sem execução Playwright.'
journal.update(status='COMPLETED',completed_files=118,completed_lines=14473,product_test_suites_executed=0,new_probe_cases=0)
journal['candidate_notes']=[
    'R2-INF-042 e R2-INF-043 promovidos após deduplicação dos104 achados anteriores e relatórios atuais.',
    'Parser de contraste-balao-midia lê tema escuro sob rótulo alto-contraste claro: observação adicional para família TC-011, sem novo ID INF.',
    'Tolerância4.4 no alto contraste é decisão explicitamente aceita; não é achado.',
    'OnboardingTour.test.tsx lido integralmente pelo root: querySelector não lançar aceita null; Escape e papel/nome são controles reais, mas não foco/trap/inert. Apoia limites INF038/039 sem novos IDs.'
]
dump('test-review.json',journal)

findings=[
dict(id='R2-INF-042',title='Gate E98 de contraste descarta violações serious da regra que promete proteger',severity='P2',classification='novo',baseline_sha=HEAD,area_extension='finite_test_review',
 description='O spec executa axe com color-contrast e button-name, mas sua única asserção considera impact=critical. A regra color-contrast tem impacto serious no axe4.13; uma violação dessa regra é descartada pelo filtro e não torna o teste vermelho, contrariando o contrato documentado nas linhas29–31.',
 consumer_chain=['Workflow e2e-logado executa chromium-authenticated','Configuração inclui specs e2e; quarantine está vazia','Spec de contatos chama axe com duas regras','Filtro critical remove color-contrast serious antes da asserção'],
 preconditions=['Execução desse spec chega à medição axe em tela de contatos.','Axe retorna uma violação color-contrast com impacto serious, como definido pela regra.'],
 effect='Este gate pode permanecer verde diante de regressão de contraste que ele próprio prometia detectar. Não se afirma que exista regressão de contraste atualmente nem que os demais gates ignorem serious.',
 evidence=[evidence('e2e/a11y-contraste.spec.ts',8,19,'Medição axe e preservação de impact'),evidence('e2e/a11y-contraste.spec.ts',23,33,'Regras, promessa do gate e filtro critical'),evidence('playwright.config.ts',89,101,'Projeto autenticado inclui o spec'),evidence('e2e/quarantine.json',10,12,'Quarentena vazia no snapshot'),evidence('.github/workflows/e2e-logado.yml',114,119,'Job executa o projeto autenticado'),evidence('e2e/inbox-contraste.spec.ts',52,59,'Controle positivo: outro gate exige todas as violações vazias')],
 acceptance=['Asserir as violações das regras explicitamente selecionadas, incluindo serious de color-contrast, ou declarar uma política de severidade que preserve essa regra.','Adicionar caso controlado que insira uma violação color-contrast e prove a falha desse gate; preservar decisões de skin explicitamente autorizadas.','Manter separados o resultado atual do produto e o poder de detecção do teste.'],
 affected_tasks=[],probe_ids=[],related_previous_findings=[],novelty_basis='OTH010 cobre CT94; TC011 cobre tautologias Team Chat; VOL03/SK04 preservam decisões de cor aceitas. Nenhum cobre o filtro critical deste spec. Gates Inbox/email não compartilham esse filtro.',proof_type='STATIC_SOURCE_AND_PRIMARY_RULE_DOCUMENTATION',
 external_references=[dict(url='https://dequeuniversity.com/rules/axe/4.13/color-contrast',retrieved_on='2026-10-04',source_kind='primary_documentation',supports='Regra color-contrast classificada como User Impact: Serious.')],
 limitations=['Nenhum browser, axe, Playwright ou suíte foi executado.','A elegibilidade versionada do projeto/job não prova execução ou resultado de CI remoto.','Nenhum limiar de4.4 autorizado foi tratado como relaxamento indevido.']),
dict(id='R2-INF-043',title='Fixture para dispensar onboarding procura nome acessível removido e deixa o modal ativo',severity='P2',classification='novo',baseline_sha=HEAD,area_extension='finite_test_review',
 description='dispensarOnboarding procura dialog de nome Boas-vindas. WelcomeModal usa aria-labelledby para o título Bem-vindo…; o próprio spec de onboarding documenta a troca e usa /bem-vindo/i. A fixture captura o timeout e retorna quando o locator antigo tem count=0, sem dispensar o modal real.',
 consumer_chain=['gotoContacts navega à tela de contatos','Fixture dispensarOnboarding espera nome antigo','Timeout é absorvido e count=0 retorna','Modal real continua como overlay fixed fullscreen z9999','Passos seguintes tentam interagir com tela sob o overlay'],
 preconditions=['WelcomeModal é efetivamente aberto para a sessão e não foi dispensado por outro caminho.','Um consumidor chama dispensarOnboarding antes de interagir com conteúdo coberto.'],
 effect='A preparação termina sem cumprir a dispensa; interações seguintes podem bloquear por interceptação do overlay. Não se afirma falha universal: usuários já concluídos e sessões falsas que desabilitam onboarding não chegam a esse cenário.',
 evidence=[evidence('e2e/fixtures/onboarding.ts',25,47,'Locator incompatível, erros absorvidos e retorno count0'),evidence('src/components/onboarding/WelcomeModal.tsx',30,47,'Overlay e nome por aria-labelledby'),evidence('src/components/onboarding/WelcomeModal.tsx',87,92,'Título Bem-vindo define o nome acessível'),evidence('e2e/fixtures/contacts-page.ts',12,23,'Consumidor ativo da fixture'),evidence('e2e/onboarding-tour.spec.ts',85,101,'Spec reconhece explicitamente mudança do nome'),evidence('e2e/onboarding-tour.spec.ts',119,124,'Teste do onboarding chama gotoContacts antes de verificar modal')],
 acceptance=['Atualizar a fixture para o contrato acessível atual e diferenciar modal legitimamente ausente de modal presente que falhou ao fechar.','Verificar caminho com modal aberto: a fixture só conclui após remoção do overlay ou comunica falha.','Permitir que os testes do próprio onboarding naveguem sem dispensá-lo automaticamente; gotoContacts é compartilhado e corrigir o helper não deve apagar o cenário que se deseja testar.'],
 affected_tasks=[],probe_ids=[],related_previous_findings=['R2-INF-038','R2-INF-039'],novelty_basis='Fixture E2E desatualizada é mecanismo diferente dos alvos ausentes do tour e da gestão de foco de modais; não encontrada entre104 achados antigos nem achados atuais.',proof_type='STATIC_CONSUMER_AND_ACCESSIBLE_NAME_CONTRACT',
 limitations=['Nenhum navegador ou implementação de accessible-name foi executado; vínculo aria-labelledby/título é explícito.','Não se inferiu que todas as sessões mostram o modal nem que todos os jobs atuais falham.','A anotação histórica de falha da fixture não foi tratada como reprodução atual.'])]

shared=[dict(family='TC-011',classification='extensão proposta ao proprietário root, sem novo ID INF',path='tests/contracts/contraste-balao-midia.contract.test.ts',reviewed_ranges=[[1,144]],evidence=[evidence('tests/contracts/contraste-balao-midia.contract.test.ts',48,90,'indexOf sem fronteira esquerda mistura .high-contrast com .dark.high-contrast'),evidence('src/styles/accessibility.css',4,48,'Bloco claro e bloco escuro têm primary/foreground/background diferentes')],effect='ESTADOS alto-contraste recebe por último tokens escuros, portanto não testa separadamente a paleta clara que seu rótulo anuncia.',controls=['Outras asserções verificam classes reais de AudioMessagePlayer/slider.','contraste-aa-componentes usa parser de seletor exato; não se estende o defeito a esse teste.','Limiar4.4 é decisão autorizada e permanece fora do achado.'],execution='NOT_EXECUTED')]
dump('test-review-findings.json',dict(schema_version=1,area='infra_test_review',baseline_sha=HEAD,findings=findings,shared_family_observations=shared,previous_findings_compared=104,product_suites_executed=0,new_probe_cases=0))

inventory=[]
for row in journal['files']:
    p=SRC/row['path']
    inventory.append(dict(path=row['path'],sha256=row['source_sha256'],git_blob_sha=row['git_blob_sha'],bytes=p.stat().st_size,lines=row['line_end'],baseline_sha=HEAD,reviewed_ranges=row['reviewed_ranges'],review_level='semantic',full_file_read=True,primary_delegated=True,layer='test_review',review_basis=row['assessment'],execution='NOT_EXECUTED'))
support={
 'tests/contracts/contraste-balao-midia.contract.test.ts':([[1,144]],'Leitura integral adicional: conversão HSL, composição/contraste, parser, quatro estados e assertions. Colisão de seletores; controles e tolerância autorizada preservados.'),
 'src/styles/accessibility.css':([[1,56]],'Blocos HC claro/escuro e ordem de sobrescrita do parser textual; não houve medição de contraste.'),
 'playwright.config.ts':([[89,104]],'Elegibilidade do projeto autenticado para os specs; não representa CI executada.'),
 'e2e/quarantine.json':([[1,12]],'Lista de quarentena vazia no snapshot.'),
 '.github/workflows/e2e-logado.yml':([[105,122]],'Passo consumidor do projeto Playwright autenticado e nomes de env; sem valores de segredo.'),
 'src/components/onboarding/WelcomeModal.tsx':([[30,50],[84,94]],'Apoio ao locator: overlay, role, aria-labelledby e texto do título; leitura integral anterior preservada na cobertura principal.')}
paths={x['path'] for x in inventory}
for path,(spans,basis) in support.items():
    if path in paths:continue
    p=SRC/path;n=len(p.read_text().splitlines());full=spans==[[1,n]]
    inventory.append(dict(path=path,sha256=sha(p),bytes=p.stat().st_size,lines=n,baseline_sha=HEAD,reviewed_ranges=spans,review_level='semantic' if full else 'targeted',full_file_read=full,primary_delegated=False,layer='test_review_support',review_basis=basis))
counts=Counter(x['review_level'] for x in inventory)
dump('test-review-coverage.json',dict(schema_version=1,area='infra_test_review',baseline_sha=HEAD,state='COMPLETED',primary_files=118,primary_lines=14473,primary_full_file_read=118,primary_remaining=0,counts=dict(total=len(inventory),**counts),inventory=inventory,remaining_gaps=['Leitura semântica dos testes não é execução das suítes nem certificação do comportamento de produção.','Nenhum browser, acessibilidade assistiva, CI, serviço, banco ou chamada de produto foi executado neste lote.','Conclusões de tests com mocks/cópias locais são limitadas à fronteira efetivamente exercitada; adjudicação por arquivo está em test-review.json.']))

report='''# Revisão integral do roster fixo de testes

Fechados118 arquivos e14.473 linhas do roster alocado no HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`:117 leituras integrais neste lote e1 leitura integral anterior citada. Não houve execução de suítes, serviços, browser ou novos probes. Cada linha do journal contém avaliação específica de assertions, fixtures/mocks, controles positivos, limites, SHA256, blob Git e faixa efetivamente lida. O roster original é histórico da alocação; `test-review.json` é o estado final.

Foram adicionados R2-INF-042 e R2-INF-043, ambos P2. O primeiro identifica o filtro `critical` do spec E98: a regra color-contrast é `serious`, portanto o próprio gate a descarta. Outros specs de contraste exigem todas as violações vazias; nenhuma regressão visual atual foi inferida. O segundo identifica o nome acessível antigo na fixture de onboarding; se o modal abre, o timeout absorvido leva a um retorno sem dispensá-lo. O teste do próprio onboarding precisa de navegação que preserve seu modal, mesmo após correção do helper compartilhado.

A deduplicação considerou os104 achados anteriores e os relatórios atuais. TC-011 é mantido como família de prova insuficiente/tautológica sob responsabilidade do root. OTH010/CT94 é outro teste; VOL03/SK04 preservam a decisão de skin. A tolerância4.4 documentada para alto contraste não foi tratada como defeito.

O suporte adicional `contraste-balao-midia.contract.test.ts` foi lido integralmente: o parser casa `.high-contrast` dentro de `.dark.high-contrast`, de modo que o estado rotulado claro termina com tokens escuros. Isso foi encaminhado como extensão de TC-011, sem outro ID INF. As verificações de classes reais e o parser exato do teste vizinho são controles positivos preservados.

Os limites de prova registrados por arquivo não tornam as suítes inteiras tautológicas. Exemplos: os testes de realtime incluem uma corrida real com deferred; os testes de segurança incluem chamadas reais a logAudit além de um mockRpc autorreferente; os contratos de manifesto distinguem fonte e bundle corretamente; testes de CI verificam ordenação textual, mas não reproduzem o dry-run que grava secrets antes de chegar ao deploy. Os testes de OnboardingTour lidos pelo root verificam Escape, estados e nome, mas querySelector apenas não lançar aceita null e não demonstra foco/trap/inert (apoio INF038/039).

Para consolidação da família TC-011, também foram comunicados os casos de Array.sort local em ordenar.unit, assert do campo já visível em TalkX, oráculos locais de PerformanceMonitor, fallback de teste de exclusão sem remover no RateLimitConfigPanel e logging de catálogo consultado sem marcador/limite temporal. No catálogo, a mensagem em si possui marcador e janela temporal: a insuficiência é limitada à correlação do evento de log.

`test-review-coverage.json` usa semantic apenas para leitura integral do código do teste; não afirma cobertura integral do produto testado. Os arquivos de apoio possuem faixas explícitas. Permanecem sem prova de runtime: accessible-name/browser, axe/contraste renderizado, CI remoto, SDK real, PostgreSQL e provedores. Os dois novos achados têm zero probes atribuídos e prova estática delimitada.
'''
report=report.replace('Fechados118','Fechados 118').replace('e14.473','e 14.473').replace(':117',': 117').replace('e1 leitura','e 1 leitura').replace('os104','os 104').replace('tolerância4.4','tolerância 4.4')
(OUT/'test-review-report.md').write_text(report)
print(json.dumps(merge_batch('test-review','test_review','testes e contratos de prova',41,artifacts=['test-review.json','test-review-roster.json','finalize_test_review.py']),ensure_ascii=False,indent=2))
