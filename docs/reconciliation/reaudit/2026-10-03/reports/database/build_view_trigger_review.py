"""Persist the manually completed view/trigger review; never execute SQL.

The exact lexical inventory is pinned below. A changed inventory requires a new
manual read, not an automatic promotion of newly discovered objects to semantic.
"""
from pathlib import Path
import collections
import hashlib
import json
import re

OUT = Path(__file__).parent
ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
REVIEWED_INVENTORY_SHA256 = '9e271fde1f66a2f3bd31fb749572a3bfe4e75da38bb425f224b4eb8cf466f8ba'
raw = (OUT/'sql_inventory.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == REVIEWED_INVENTORY_SHA256
inventory = json.loads(raw)
manifest = json.loads((ROOT/'supabase/schema-manifest.json').read_text())
function_review = json.loads((OUT/'function_review.json').read_text())
functions = {r['identity']: r for r in function_review['functions']}
policies = json.loads((OUT/'policy_review.json').read_text())
files = {}

def body(e):
    if e['path'] not in files:
        files[e['path']] = (ROOT/e['path']).read_text().splitlines()
    return '\n'.join(files[e['path']][e['start_line']-1:e['end_line']])

def file_evidence(path, start, end, note):
    raw = (ROOT/path).read_bytes()
    assert 1 <= start <= end <= len(raw.decode().splitlines())
    return {'path':path, 'start_line':start, 'end_line':end,
            'file_sha256':hashlib.sha256(raw).hexdigest(), 'note':note}

view_notes = {
    'profiles_public': ('profiles',
        'Leitura integral das sete colunas projetadas: identificadores, nome, avatar e estado/cargo. Não projeta email/telefone nem aumenta o alcance de SELECT do perfil; security_invoker mantém a policy própria/staff. A dificuldade de nomes de colegas pertence ao contrato frontend/RLS já cruzado com Auth.'),
    'whatsapp_connections_public': ('whatsapp_connections',
        'Leitura integral da projeção id/name/status/is_default, sem instância, QR ou credenciais. security_invoker exige direitos na view e na relação base; não foi interpretada como autorização de leitura global independente da conexão.'),
    'whatsapp_connections_agent': ('whatsapp_connections',
        'Leitura integral: acrescenta phone_number à projeção básica. A criação isolada não tinha security_invoker, mas os dois ALTERs posteriores o ativam; não há alegação de view definer atual a partir da primeira CREATE.'),
    'channel_connections_safe': ('channel_connections',
        'Leitura integral das colunas de identificação, status, external ids, webhook e timestamps; credentials não entra na projeção. Dois ALTERs ativam security_invoker. O nome safe não elimina a necessidade de conferir a policy/grants da base, que continuam aplicáveis.'),
    'whatsapp_connections_safe': ('whatsapp_connections',
        'Leitura integral: QR e instance_id são CASE condicionais a has_role(admin); demais colunas são operacionais, sem token/API key. Os CASEs não são colunas diretamente graváveis da view; demais mutações continuam sujeitas à base e aos seus triggers. Não se inferiu bypass pela existência de grants amplos da view.'),
    'gmail_accounts_safe': ('gmail_accounts',
        'Leitura integral: identificador do dono, email e estado da sincronização, erro/expiração/timestamps; access_token e refresh_token não são retornados. security_invoker e RLS própria da conta continuam vigentes; não é uma view de todas as caixas para qualquer usuário.'),
    'password_reset_requests_safe': ('password_reset_requests',
        'Leitura integral: exibe pedido, email, justificativa/revisão, expiração e metadados IP/user-agent; reset_token não é projetado. O acesso continua sob a RLS da solicitação. A exclusão do token não transforma metadados pessoais em dados públicos.'),
    'talkx_campaign_metrics': ('talkx_campaigns',
        'Leitura integral: apenas completed com started_at/completed_at presentes; id e campaign_name existem como aliases adicionais. delivered/sent e replied/sent geram percentuais, denominador zero gera zero e replied_count nulo é coalescido. Não usa status finished. O ALTER posterior ativa security_invoker; os problemas de consumidores e de atribuição de replies têm IDs próprios.'),
    'catalog_send_stats': ('catalog_send_events',
        'Leitura integral dos três CTEs/grãos e UNION ALL: janela móvel de 30 dias, totais por dia/agente/produto e razões partial/failed com nullif. dia deriva do cast de timestamptz na timezone da sessão, sem fixação São Paulo; apenas observação de contrato, sem consumidor com divergência demonstrada. A RLS da base limita os eventos agregados.'),
    'searchbox_usage_daily': ('audit_logs',
        'Leitura integral: agrupa por data America/Sao_Paulo, conta somente searchbox_session/searchbox_cost_guard e guarda último evento. A view não limita a janela temporal; o consumidor deve fazê-lo se necessário. security_invoker mantém o escopo de audit_logs; não permite ler todos os logs a quem não podia lê-los.'),
    'talkx_campaign_optouts': ('talkx_blacklist',
        'Leitura integral: agrega registros reason_code opt_out com campaign_id, subdivide origin auto_optout e mantém último created_at. Não filtra removed_at/expires_at; é contagem histórica de registros, não prova de supressões ainda ativas. A leitura de eficácia de blacklist/supressão está nas funções e no módulo TalkX, sem transformar este filtro em bypass de envio.'),
}

view_rows = []
for identity, e in inventory['candidate_final_views'].items():
    name = identity.split('.')[-1]
    table, note = view_notes[name]
    sequence = [e] + e.get('alter_events', [])
    for statement in sequence:
        assert body(statement).strip()
    # These eleven sequences were read in full, including the seven ALTERs.
    security_invoker = e['security_invoker']
    for statement in e.get('alter_events', []):
        if re.search(r'security_invoker\s*=\s*(?:true|on|1)', body(statement), re.I):
            security_invoker = True
    assert security_invoker
    direct_grant_history = [g for g in inventory['events']
                            if g['kind'] == 'privilege' and
                            re.search(r'\b'+re.escape(name)+r'\b', body(g))]
    view_rows.append({
        'identity': identity, 'coverage_level':'semantic',
        'definition_and_alter_bodies_read_in_full':True,
        'source_definition':e, 'effective_alter_sequence':e.get('alter_events', []),
        'metadata_history_not_claimed_read_in_full':[h for h in inventory['events']
            if h['kind']=='view' and h['identity']==identity],
        'snapshot_identity':'v:'+name, 'snapshot_hash':manifest['views']['v:'+name],
        'effective_source_security_invoker':security_invoker,
        'base_relations':['public.'+table],
        'base_policy_review_ids':[p['identity'] for p in policies['policies']
                                  if p['table']==table or p['table']=='public.'+table],
        'snapshot_column_identities':[k for k in manifest['columns'] if k.startswith(name+'.')],
        'snapshot_relation_grants':[k for k in manifest['relation_grants'] if k.startswith('v:'+identity+'|')],
        'direct_named_grant_statements_read':direct_grant_history,
        'manual_review':note,
        'grant_assessment':'Snapshot contém grants além de SELECT para várias views. Grants na view não dispensam privilégios/RLS na base com security_invoker, nem tornam uma view agregada automaticamente gravável. Históricos de GRANT anteriores a DROP não foram automaticamente transportados para a recriação.',
        'runtime_tested':False,
    })
assert len(view_rows)==11

trigger_rows = []
snapshot_triggers = {'public.'+k:v for k,v in manifest['triggers'].items()}
bound_functions = set()
for identity, e in inventory['candidate_final_triggers'].items():
    statement = body(e)
    parsed = re.search(r'\b(BEFORE|AFTER|INSTEAD\s+OF)\s+(.+?)\s+ON\s+([\w.]+)', statement, re.I|re.S)
    callee = re.search(r'EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([\w.]+)\s*\(\s*\)', statement, re.I)
    assert parsed and callee and re.search(r'FOR\s+EACH\s+ROW',statement,re.I), identity
    name = callee.group(1)
    qualified = name if '.' in name else 'public.'+name
    signature = qualified+'()'
    function = functions[signature]
    assert function['coverage_level']=='semantic' and function['candidate_effective_definition']['returns_trigger']
    bound_functions.add(signature)
    timing = re.sub(r'\s+', ' ', parsed.group(1)).upper()
    event_clause = re.sub(r'\s+', ' ', parsed.group(2)).strip()
    events = re.findall(r'\b(INSERT|UPDATE|DELETE|TRUNCATE)\b', event_clause, re.I)
    when = re.search(r'\bWHEN\s*\((.*)\)\s*EXECUTE', statement,re.I|re.S)
    condition = re.sub(r'\s+', ' ',when.group(1)).strip() if when else None
    column_match = re.search(r'\bUPDATE\s+OF\s+(.+?)(?:\s+OR\s+(?:INSERT|DELETE|TRUNCATE)\b|$)',event_clause,re.I)
    columns = [v.strip() for v in column_match.group(1).split(',')] if column_match else []
    if identity in snapshot_triggers:
        classification = 'snapshot_public_identity_matched'
        adjudication = 'Mesma identidade no snapshot público; o hash não prova que o corpo/estado habilitado atual coincida com a projeção.'
        evidence=[]
    elif identity.startswith('auth.users.'):
        classification = 'outside_public_snapshot'
        adjudication = 'Trigger no schema auth, fora do snapshot public; a ausência nesta captura não significa ausência no Auth.'
        evidence=[]
    elif identity=='public.tags.update_tags_updated_at':
        classification = 'retired_with_dropped_table'
        adjudication = 'A tabela tags é removida posteriormente; o coletor lexical não expande a dependência DROP TABLE → DROP TRIGGER. Não é vínculo efetivo sobrevivente.'
        evidence=[file_evidence('supabase/migrations/20260927410000_drop_legacy_tags_tables.sql',1,3,'Remoção de tags/contact_tags e dependências.')]
    elif identity=='public.talkx_campaigns.record_talkx_campaign_lifecycle_event':
        classification = 'introduced_after_snapshot'
        adjudication = 'Migration 20261003172707 posterior ao generated_at 17:11:29Z do snapshot. Implantação atual não medida.'
        evidence=[]
    else:
        raise AssertionError(('unadjudicated trigger',identity))
    binding_note = f'Vínculo completo lido: {timing} {event_clause}, por linha; '
    binding_note += ('WHEN '+condition+'. ') if condition else 'sem condição WHEN externa. '
    if columns:
        binding_note += 'UPDATE OF considera colunas mencionadas no comando, não necessariamente valor alterado; o corpo pode fazer comparação adicional. '
    if qualified=='public.update_updated_at_column':
        binding_note += 'Dispara somente atualização de timestamp; não acrescenta motor de agendamento, reputação, chatbot ou sincronização de configuração. '
    binding_note += 'Corpo vencedor relacionado à revisão semântica já registrada, sem inferir autorização pelo nome do trigger.'
    trigger_rows.append({
        'identity':identity,'coverage_level':'semantic','binding_body_read_in_full':True,
        'source_binding':e,'table':identity.rsplit('.',1)[0],
        'timing':timing,'events':[v.upper() for v in events],
        'update_target_columns':columns,'when_condition':condition,'per_row':True,
        'function_name_in_source':name,'candidate_bound_function_identity':signature,
        'unqualified_name_note': None if '.' in name else 'Nome sem schema resolvido na criação; ligação public inferida da cadeia/public catalog, sem consulta do OID vivo.',
        'candidate_effective_function':function['candidate_effective_definition'],
        'function_body_review_level':function['coverage_level'],
        'function_body_review_note':function['second_pass_review'],
        'snapshot_hash':snapshot_triggers.get(identity),
        'projection_classification':classification,'adjudication':adjudication,
        'adjudication_evidence':evidence,'manual_binding_review':binding_note,
        'runtime_tested':False,
    })
assert len(trigger_rows)==123
assert len(set(snapshot_triggers)-{t['identity'] for t in trigger_rows})==0

# Source-level firing order is useful for reviewing interactions, not a claim of
# runtime enablement, replication mode, or execution of every WHEN branch.
order_groups=collections.defaultdict(list)
for r in trigger_rows:
    if r['projection_classification']=='retired_with_dropped_table':continue
    for event in r['events']:
        order_groups[r['table']+'|'+r['timing']+'|'+event].append(r['identity'])
order_groups={k:sorted(v,key=lambda x:x.rsplit('.',1)[1]) for k,v in sorted(order_groups.items()) if len(v)>1}

view_result={
    'source_head':HEAD, 'inventory_sha256':REVIEWED_INVENTORY_SHA256,
    'method':'Leitura manual integral de 11 CREATE vencedoras e 7 ALTERs efetivos, projeções/filtros/agregações, grants nomeados e ligação às policies da base. Histórias substituídas são apenas metadados, sem reivindicação de releitura integral.',
    'coverage_counts':{'semantic':11,'targeted':0,'structural':0},
    'snapshot_identity_matches':11,'runtime_tested':False,
    'views':view_rows,
    'primary_sources':['https://www.postgresql.org/docs/17/sql-createview.html'],
    'limits':['Grants herdados e reloptions vivos não foram consultados.','Views de agregado não foram transformadas em cenários de INSERT por grants existentes.','As notas de data/filtros são contratos observados, não achados de consumidor sem evidência correspondente.'],
}
trigger_result={
    'source_head':HEAD, 'inventory_sha256':REVIEWED_INVENTORY_SHA256,
    'method':'Leitura manual integral dos 123 CREATE candidatos; anotação de momento/evento/colunas/WHEN, ligação aos corpos vencedores já revisados e reconciliação nominal ao snapshot. A extração auxilia o registro, não substituiu a leitura.',
    'coverage_counts':{'semantic':123,'targeted':0,'structural':0},
    'snapshot_identity_matches':119,'snapshot_only_identities':[],
    'candidate_bound_function_count':len(bound_functions),
    'projection_classification_counts':dict(collections.Counter(r['projection_classification'] for r in trigger_rows)),
    'source_firing_order_for_shared_events':order_groups,
    'triggers':trigger_rows,
    'cross_binding_assessments':[
        'Os dois AFTER INSERT em auth.users têm nomes distintos; a ordem nominal cria primeiro o perfil e depois atribui role. O snapshot public não contém seus vínculos.',
        'Os dois BEFORE INSERT de contacts executam auto_assign_contact antes de auto_assign_to_queue_agent; fila e carteira permanecem mecanismos distintos, com contratos já encaminhados ao root.',
        'messages separa guard BEFORE INSERT/UPDATE, gamificação AFTER INSERT e SLA AFTER INSERT/UPDATE OF status com WHEN agent/sent. A presença da palavra sent no nome de gamificação não acrescenta filtro de status ao seu vínculo.',
        'contact_notes protege contact_id/author_id em BEFORE UPDATE OF; o merge que tenta mudar contact_id continua alcançando o guard, conforme R2-DB-016.',
        'conversation_tasks possui estado condicionado a alteração de status e preenchimento de assignee no INSERT; mudança isolada de remind_at não dispara o trigger de estado nem rearma notified_at.',
        'team_messages tem validação de reply, edição de content e timestamp/bump; não foi localizado um trigger que autentique propriedade de media_bucket/media_path, conforme R2-DB-020.',
        'message_reactions não tem vínculo no catálogo final; o trigger de deduplicação pertence a team_message_reactions, tabela distinta. Mantida a separação dos achados R2-DB-019/021.',
        'Multiplix separa guarda de dispatch/recipient, versão de dispatch/bloco e imutabilidade de eventos; AFTER de bloco roda depois de sua mutação e integra a transação, sem gerar envio externo.',
        'Nos 107 DO lidos não foi encontrado CREATE/DROP/ALTER de trigger nem ENABLE/DISABLE; a busca adicional de ALTER TRIGGER/ENABLE/DISABLE na cadeia ativa não encontrou comandos. Isso não atesta tgenabled, session_replication_role nem alterações externas do banco vivo.',
    ],
    'runtime_tested':False,
    'primary_sources':['https://www.postgresql.org/docs/17/sql-createtrigger.html','https://www.postgresql.org/docs/17/trigger-definition.html'],
    'limits':['Correspondência nominal não compara OIDs, tgfoid/tgenabled nem proprietário vivo.','Ordem considera mesmo tipo/evento e nomes; colunas e WHEN podem impedir disparo.','Triggers do sistema de FK e índices de constraints não se somam aos 123 triggers explícitos de aplicação.'],
}
for name,result in [('view_review.json',view_result),('trigger_review.json',trigger_result)]:
    (OUT/name).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'views':len(view_rows),'triggers':len(trigger_rows),'snapshot_trigger_matches':119,
                  'bound_functions':len(bound_functions),'classifications':trigger_result['projection_classification_counts']},ensure_ascii=False))
