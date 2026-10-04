"""Record completed static shell reading; never execute source scripts or SQL."""
from pathlib import Path
import hashlib
import json
import subprocess

S = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
O = Path(__file__).resolve().parent
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
R = O / 'shell-review-roster.json'
roster = json.loads(R.read_text())
assert roster['source_head'] == HEAD
assert subprocess.check_output(['git', '-C', str(S), 'rev-parse', 'HEAD'], text=True).strip() == HEAD

# assertions, fixture/embedded SQL, cleanup, adjudication, limits, loci
notes = [
    (
        ['Backfill de 1.200 contatos, contagens canônicas e preservação de nomes; seis CHECKs validados, defaults NULL e ACL das RPCs.', 'Dois mutantes da migration em cópias: remoção dos UPDATEs deve falhar no VALIDATE; normal→high é detectado pelo valor persistido. Hash/cmp confirmam original intacto.'],
        ['Preestado mínimo com roles e tabelas. Corpos de persist_conversation_analysis e replace_ai_conversation_tags são cópias inline; a chamada service é deliberadamente aceita até erro de coluna ausente.', 'Aplica o arquivo real 20260930150000_ai_block03_vocabulary_contract.sql ou argumento alternativo. Três containers PostgreSQL 17, não iniciados nesta revisão.'],
        'trap EXIT/INT/TERM remove somente nomes de containers com prefixo e PID previstos; mktemp e cópias apagadas pelo trap.',
        'Bom contrato de backfill, constraints, defaults e sensibilidade da migration específica. Não demonstra persistência bem-sucedida das RPCs nem preservação de tags humanas; esses corpos são fixtures e a chamada service espera erro. Nenhum novo achado.',
        ['Reversão demonstra apenas restaurar um default/CHECK, não desfaz os dados, todas as constraints e ACLs.', 'Nenhuma execução desta revisão. Não aplica cadeia integral nem substitui a definição SQL vencedora revisada por database.'],
        ['147–344: funções e tabelas inline', '384–505: migration real e assertivas', '507–573: reversão parcial e mutantes']
    ),
    (
        ['Catálogo/manifesto versão 2, PostgreSQL 17, assinaturas de overloads, dezesseis seções e fingerprints; duas bases com OIDs distintos normalizam iguais.', 'Mutações reais de defaults, constraints, domínio, enum, índice, RLS, policies, trigger, corpo/overload de função, ACL de tabela/coluna/tipo/rotina/default e view alteram as seções esperadas.'],
        ['Fixture SQL cria as mesmas estruturas nas bases a/b; somente a recebe ruído previamente descartado para deslocar OIDs.', 'Invoca arquivos reais catalog.sql e manifest.sql por caminhos relativos ao cwd; Node embutido valida JSON e deepEqual após remover data/identidade da base.'],
        'Container nomeado com PID e regex de remoção; trap EXIT limpa container e arquivos temporários.',
        'Controle positivo de estabilidade de catálogo e sensibilidade a alterações estruturais, com produtor real. Não há achado novo.',
        ['Fixture sintético não esgota objetos/ACLs da aplicação; diversas mutações simultâneas comprovam diferença por seção, não cada subcaso isoladamente.', 'Depende de iniciar no cwd esperado; não executado.'],
        ['59–113: fixture SQL', '121–172: geração e equivalência', '176–254: mutações e diferenças']
    ),
    (
        ['Baseline exige status zero, marcador OK e dois MD5s de corpos; negativos exigem erro não zero com marcador FALHA ACL.', 'Mutações cobrem função ausente/overload/owner/SECURITY DEFINER/volatilidade/grants/search_path/default/body, memberships INHERIT/SET/ADMIN e caminhos indiretos.'],
        ['Aplica migration real mcp_exec_functions_harden e guard SQL real; reset acrescenta REVOKE/GRANT explícitos do baseline.', 'Roles/topologia reduzida, alternativa compacta de corpo e manipulação de pg_proc.proacl em fixture isolado. Imagem padrão PostgreSQL 16, não o ambiente real mencionado nos comentários.'],
        'trap EXIT/INT/TERM remove container apenas se nome satisfaz prefixo+PID.',
        'Negativos substanciais do guard e prova textual de status/marcadores. Aceita variantes previstas por hashes distintos. Não prova segurança de todo SQL que mcp_exec pode executar; nenhum achado novo.',
        ['Teste funcional da versão compacta usa substring 1 em saída formatada; evidência principal desse caso é o hash/guard.', 'Migration isolada e topologia artificial não certificam ACL implantada; não executado.'],
        ['46–160: reset e assertivas', '181–201: variante compacta', '203–345: variantes legítimas e mutações negativas']
    ),
    (
        ['Nome do ledger fica estável para mcp_exec limpo, híbrido, hash divergente e statements NULL; colisão reconhecida renomeia e segunda aplicação é estável.', 'Referência Gmail antiga é corrigida apenas em statements[3], os dois primeiros statements são preservados e hash da linha não muda no replay.'],
        ['Tabela schema_migrations mínima; statements de fixtures são dados textuais, incluindo BODY_PLACEHOLDER, nunca executados como SQL de funções.', 'Aplica migration real 20260829060000_reconcile_ledger_drift.sql em cada cenário.'],
        'Container isolado sem publicação de porta; trap EXIT/INT/TERM com regex prefixo+PID; reset por TRUNCATE somente da tabela fixture.',
        'Controla autorização do rename pela evidência textual e estabilidade do replay. Não representa reconstrução de toda a história de migrations. Nenhum achado novo.',
        ['A assinatura histórica do fixture é selecionada para o contrato; o roteiro não mede ledger de produção nem prova semântica do corpo armazenado.', 'Não executado.'],
        ['50–78: insert/assert helpers', '100–151: colisões positivas/negativas', '153–185: Gmail, preservação e replay']
    ),
    (
        ['Migration original deve ser recusada, baseline endurecido aceito; hardening remove grants legados de coluna.', 'Negativos incluem grants de tabela/coluna, policy PUBLIC/adicional, RLS desabilitada, TRUNCATE/GRANT OPTION service_role e tabela ausente; exigem não zero e marcador FALHA.'],
        ['Roles anon/authenticated/service_role e default grants amplos modelam preestado; aplica duas migrations reais e o guard SQL real.', 'Reset derruba só a tabela webhook_failures fixture e reaplica arquivos.'],
        'trap EXIT/INT/TERM com remoção do container por regex prefixo+PID.',
        'Controle útil do contrato do guard e da migration ACL com negativos específicos. Não é teste de processamento de webhook/retry/opt-out, portanto não refuta API006–008. Nenhum novo ID.',
        ['Primeiro caso original inseguro só exige status não zero, sem confirmar a causa; os negativos seguintes exigem marcador.', 'Não aplica toda a cadeia e não executado.'],
        ['46–84: reset, status/marcador', '92–118: default grants e hardening', '120–141: mutações negativas']
    ),
    (
        ['Runtime JSON valida hash de definições, RLS, quatro policies, guards/EXECUTE/grants; checks SQL adicionais de privilégios.', 'Visibilidade de owner/fila/special/admin versus outsider/inativo; IDOR e spoof caller; contagens de tabs; CRUD de notas, autoria imutável, ausência de escrita e replay.'],
        ['Tabelas mínimas, seis perfis, helper admin hardcoded por UID e funções antigas de conveniência; migration real substitui helpers-alvo.', 'Psql SET ROLE e claim sub modelam caller; arquivo runtime SQL real fornece evidência estrutural.'],
        'trap EXIT/INT/TERM remove só container nomeado com prefixo+PID.',
        'Controles de RLS e efeitos concretos, incluindo zero linhas para outsider e remoção própria. Esperar qualquer erro nos negativos reduz a precisão causal; sem novo finding produtivo.',
        ['expect_failure 31–41 não exige SQLSTATE/mensagem: erro SQL não relacionado também satisfaz o cenário.', 'Após UPDATE legítimo 217 só se conta conjunto de notas, sem conferir conteúdo atualizado. Fixture admin/roles não prova integração Auth real. Não executado.'],
        ['59–152: fixtures', '154–195: runtime/hash e ACL', '197–234: comportamentos e replay']
    ),
    (
        ['Privilégio efetivo de coluna antes/depois: segredos fechados para authenticated, colunas públicas preservadas, anon sem escrita, service_role mantém chave.', 'Mutante A sem REVOKE de tabela deve falhar; mutante B sem REVOKE de coluna verifica ausência de UPDATE em segredos e documenta redundância esperada.'],
        ['Grants de tabela default mais grants de coluna do mesmo grantor em quatro bases descartáveis; migration real e duas cópias modificadas.', 'Assertivas has_column_privilege medem grant efetivo, sem confundir REVOKE de coluna com fechamento de grant de tabela.'],
        'Container regex prefixo+PID; diretório TMPDIR/.tmp com sufixo PID removido por pattern, sem tocar arquivo original da migration.',
        'Boa discriminação da revogação necessária versus redundância. Alegações do cabeçalho sobre medição histórica não foram tomadas como evidência live nesta reauditoria. Nenhum novo ID.',
        ['Mutante B 263–267 imprime OK tanto se o contrato falha quanto se passa; asserts anteriores restringem somente UPDATE nos dois segredos, não tornam obrigatória toda equivalência de privilégios.', 'Asserções de ACL não executam INSERT/UPDATE via PostgREST/RLS; não executado.'],
        ['88–141: checa_contrato e detecção de falha', '182–227: grants e migration', '230–271: mutantes A/B']
    ),
    (
        ['V11/V11.1 reais: tipos de evento, alvo obrigatório/XOR, formato de entidade, owner/admin/supervisor, anon, append-only e replay de constraints/policies.', 'CASCADE de campanha é verificado por superuser para não confundir filtro RLS com remoção real.'],
        ['Fixture usa user_roles em helper SECURITY DEFINER e mantém profiles.role agent como controle contra helper legado.', 'X021 299–309 é CHECK copiado inline, não aplicação da migration X021. A tabela campaigns fixture não habilita RLS; events habilita.'],
        'trap EXIT/INT/TERM e nome de container prefixo+PID.',
        'V11/V11.1 têm vínculo com migrations reais e assertivas positivas/negativas. O fecho X021 apenas testa SQL local copiado; locus enviado à família TC-011/GOV003, sem novo ID API.',
        ['X021 copiado continuaria aceito mesmo se o CHECK produtivo divergir; suíte irmã citada precisa evidência independente.', 'CASCADE prova remoção, mas o fixture não prova a autorização de excluir campanha sob a RLS produtiva; não executado.'],
        ['104–184: fixture e roles', '186–290: migrations V11/V11.1 e asserts', '299–328: CHECK X021 copiado e cascade']
    ),
    (
        ['Red-first verifica valor inalterado sem UPDATE policy; migration V06 e X014 reaplicadas; anon perde SELECT e authenticated mantém.', 'Admin persiste novo valor, agente não altera e continua lendo.'],
        ['Helper is_admin_or_supervisor local lê profiles.id/role; fixture iguala profile.id e user_id; não usa user_roles canônico.', 'Campaigns e tabelas de links mínimas permitem carregar role gates, mas RPCs/gatilhos dessas tabelas não são exercitados.'],
        'Container com RANDOM/PID; trap EXIT com regex e três tentativas removem o mesmo nome gerado.',
        'O teste distingue UPDATE silencioso de persistência real. Não comprova o mapeamento de papel em produção; divergência do helper foi encaminhada à família TC-011/GOV003, sem finding API.',
        ['Não há usuário supervisor no roteiro, apesar do título/fecho admin/supervisor.', 'Helper de conveniência e id=user_id podem ocultar erro de identidade; leitura usa substring 09:00. Não executado.'],
        ['48–87: helper e fixtures', '89–111: red-first e replay', '113–146: role gates e valores']
    ),
    (
        ['Migration real de canonização: snapshots preservam estado anterior/autoria, RPC atualiza e retorna timestamp persistido; stale/outsider/mídia inválida recusados.', 'ACL, variants ownership/admin, bypass de definer irmão, trigger imutável mesmo com grant+policy permissiva; counter não altera revision token.', 'Dois writers em processos psql separados exigem exatamente um sucesso e um stale; estado final 2 versões; cascade físico e runtime hash/estrutura.'],
        ['Fixture de runtime preexistente ou migration A/B conforme flag; três preestados inválidos opcionais e mutuamente exclusivos abortam com diagnóstico específico.', 'get_profile_id_for_user e admin helper são definições locais sobre profiles, não a cadeia completa de user_roles; chamadas de RPC reais após migration.'],
        'Container RANDOM/PID e diretório mktemp prefixado /tmp; trap EXIT/INT/TERM com guards; funções/policies permissivas de teste são removidas antes do runtime proof.',
        'Harness comportamental substancial de edição/snapshot e concorrência da migration específica. Flags opcionais não contam como cenários executados automaticamente. Nenhum novo achado.',
        ['Não aplica migrations posteriores que podem substituir RPCs; não refuta defeitos na cadeia vencedora.', 'Helper de papéis simplificado; não há rede/provedor nem execução nesta auditoria. Imutabilidade/atomicidade decorrem apenas dos cenários concretos descritos.'],
        ['30–262: validação de modos e preestados', '268–472: migration, RPCs e negativos', '474–530: concorrência e cascade', '532–588: runtime/hash']
    ),
    (
        ['GREEN exige mensagem talkx_delivery_state_managed_by_worker após UPDATE replied_count; consulta pg_proc exige ausência de increment_talkx_template_use.', 'RED só recusa uma substring de erro específica; não mede valor persistido.'],
        ['Helper admin sempre false, campanha mínima e trigger antigo copiado; claims simulados em conexão postgres, sem SET ROLE authenticated.', 'Nunca cria increment_talkx_template_use no preestado; wrapper usa ON_ERROR_STOP=0 até para carregar a migration real.'],
        'Container RANDOM/RANDOM com regex de prefixo; trap EXIT/INT/TERM.',
        'Locus concreto TC-011/GOV003: ausência final de RPC não comprova DROP, porque ela já não existia no fixture. Remover o DROP manteria essa assertiva verde. GREEN do guard é controle parcial válido. Encaminhado ao root, sem novo ID API.',
        ['ON_ERROR_STOP=0 pode deixar migration/fixture falharem sem encerrar psql; RED aceita erro diferente do marcador, e não verifica SQLSTATE 42501 prometido no cabeçalho.', 'Claims em conexão postgres testam ramo de guard, não ACL/RLS como role authenticated. Não executado.'],
        ['9: ON_ERROR_STOP=0', '36–96: fixture sem RPC', '98–116: RED/GREEN/ausência final e fecho']
    ),
    (
        ['Preestado permite outsider fechar contato e operar tags globais, com efeitos SQL medidos; migration real fecha acesso indevido e preserva próprios/fila/admin.', 'Após negativas verifica status/closures e tags intactos, preserva service_role/cron e bloqueia anon; FSM termina archived.'],
        ['Corpos anteriores e predicates inline; schema reduzido, auth.uid/role leem claims e user_roles realista distingue perfil de auth UID.', 'Replica seed entre antes/depois; funções após migration são reais, helpers de visibilidade/ACL remanescentes continuam fixtures reduzidos.'],
        'trap EXIT/INT/TERM remove diretório mktemp e container regex prefixo+PID; DELETEs de seed restritos ao banco descartável.',
        'Vínculo migration→recusa→ausência de efeito é substancial para status/tags. Não torna equivalentes esses predicados simplificados à cadeia SQL vencedora. Nenhum novo finding.',
        ['Caso B1 promete 42501 mas exige apenas texto contact_not_authorized, apesar do helper permitir SQLSTATE; B4b título open→open na verdade reenvia resolved.', 'Caso cron usa session_user postgres com SET ROLE service_role: prova caminho privilegiado específico, não configuração pg_cron implantada. Não executado.'],
        ['99–244: preestado e corpos copiados', '246–309: seed e RED com efeitos', '314–376: autorização, negativos sem efeitos e privileged paths']
    ),
]

assert len(notes) == len(roster['files']) == 12
entries = []
for i, (f, note) in enumerate(zip(roster['files'], notes)):
    raw = (S / f['path']).read_bytes()
    lines = len(raw.decode().splitlines())
    blob = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
    sha = hashlib.sha256(raw).hexdigest()
    assert blob == f['git_blob_sha'] and sha == f['source_sha256'] and lines == f['line_end'], f['path']
    assert subprocess.check_output(['git', '-C', str(S), 'rev-parse', HEAD+':'+f['path']], text=True).strip() == blob
    a, fixtures, cleanup, adjudication, limits, loci = note
    entries.append(dict(path=f['path'], roster_index_zero_based=i, reviewer='/root/reaudit_providers',
        source_head=HEAD, git_blob_sha=blob, source_sha256=sha, total_lines=lines,
        review_status='SEMANTIC_FULL_FILE', level='semantic_full_file',
        reviewed_ranges=[dict(line_start=1, line_end=lines, symbols=a)],
        assertions_reviewed=a, fixtures_and_embedded_sql=fixtures, cleanup_reviewed=cleanup,
        adjudication=adjudication, limits=limits, specific_loci=loci,
        scripts_executed=0, source_hash_rechecked_before_record=True))
assert sum(e['total_lines'] for e in entries) == 3558
out = dict(schema_version=1, status='COMPLETE', owner='/root/reaudit_providers', source_head=HEAD,
    source_root=str(S), roster=str(R), roster_sha256=hashlib.sha256(R.read_bytes()).hexdigest(),
    total_files=12, total_lines=3558, fully_read_files=12, fully_read_lines=3558,
    counts={'SEMANTIC_FULL_FILE':12}, scripts_executed=0, tests_executed=0,
    new_probes_executed=0, source_changes=0, findings_added=0, files=entries,
    limits=['Static whole-file reading including shell, embedded SQL/Node, asserts, fixtures and cleanup. No shell harness, Docker container, SQL or suite executed.',
        'Preserves 76 own tests, 66 API findings and 44 previously executed offline probes; shell scripts are a separate reading roster.',
        'Claims about historical live measurements inside comments were not independently treated as current production evidence.',
        'Migrations and external SQL invoked by these harnesses retain their existing database-owner coverage; reading a shell invocation does not grant full-file coverage to its target.'])
(O/'shell-review.json').write_text(json.dumps(out, ensure_ascii=False, indent=2)+'\n')
md = ['# Leitura estática dos scripts shell — providers',
    f'\nFonte `{HEAD}`. **12/12 arquivos, 3.558/3.558 linhas, leitura integral.** Nenhum script, Docker, SQL, suíte ou novo probe foi executado. Nenhum novo finding contado.',
    '\nCada entrada inclui todo o shell, SQL/Node embutido, fixture, asserções e cleanup. Os hashes foram comparados com o roster e os blobs do HEAD antes de registrar.']
for e in entries:
    md += [f'\n## `{e["path"]}`',
        f'\nFaixa lida: 1–{e["total_lines"]}. SHA-256 `{e["source_sha256"]}`. Blob `{e["git_blob_sha"]}`.',
        '\n**Asserções e fluxo:**\n'] + ['- '+x for x in e['assertions_reviewed']]
    md += ['\n**Fixtures e SQL embutido:**\n'] + ['- '+x for x in e['fixtures_and_embedded_sql']]
    md += ['\n**Cleanup:** '+e['cleanup_reviewed'], '\n**Adjudicação:** '+e['adjudication'], '\n**Limites:**\n'] + ['- '+x for x in e['limits']]
    md += ['\n**Loci:** '+ '; '.join(e['specific_loci'])+'.']
(O/'shell-review.md').write_text('\n'.join(md)+'\n')
print(json.dumps({k:out[k] for k in ['status','total_files','total_lines','scripts_executed','findings_added']}))
