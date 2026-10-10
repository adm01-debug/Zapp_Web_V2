"""Persist manual adjudications after complete policy/DO body review. No SQL."""
from pathlib import Path
import hashlib
import json
from record_policy_notes import record

OUT=Path(__file__).parent
ROOT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')

record({
 'ops.hermes_change_log':'Leitura integral: ALL service_role true. Schema ops fica fora do snapshot public; não constitui drift nem concede acesso authenticated por esta policy.',
 'contact_tags':'Leitura integral das três policies históricas de tags por contato: SELECT/INSERT/DELETE contato atribuído ou staff. DROP TABLE public.contact_tags em 20260927410000:2 encerra sua vigência candidata; não somadas ao schema atual.',
 'tags':'Leitura integral das três policies históricas: SELECT authenticated, ALL staff, INSERT autor nulo/próprio/staff. DROP TABLE public.tags em 20260927410000:3 encerra a tabela; não há falha atual inferida desses predicados antigos.',
 'lid_audit_snapshot_20260902':'Leitura integral: SELECT staff e ALL service_role. A tabela temporária foi removida em 20260905040000:4; extras lexicais não são policies atuais.',
 'storage.objects':'Leitura integral das 30 policies candidatas de Storage: bucket delimita as operações; INSERT por pasta própria (Auth UID em mídia/avatars, profile.id no team-chat-files); SELECT privado por contato/mensagem/membro; DELETE por autor/pasta ou staff conforme cada bucket. UPDATEs herdam USING como CHECK, mas REVOKE UPDATE ON storage.objects FROM authenticated em 20260928560000:8 exige conferir grants além do predicado; auditoria histórica de 2026-09-29:62 registra que a revogação não teve efeito visível. Não se conhece a ACL Storage atual. Buckets de memes/stickers/emojis/avatars têm public=true explícito no DDL; nomes de policies não provam privacidade. Snapshot public não atesta grants/estado de Storage. A divergência Auth UID versus profile.id no team-chat-files já compõe TC-001. Leitura baseada em locator mutável de messages/team_messages ficou em aprofundamento separado de autorização por objeto; nenhuma leitura de objeto real foi executada.'
},'policy-16-extra-storage-and-retired')

def ev(path,start,end,note):
    p=ROOT/path
    assert 1<=start<=end<=len(p.read_text().splitlines())
    return {'path':path,'absolute_path':str(p),'line_start':start,'line_end':end,
            'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'note':note}

manual=json.loads((OUT/'access_manual_reviews.json').read_text())
roster=json.loads((OUT/'policy_review.json').read_text())
dos=json.loads((OUT/'do_review.json').read_text())['do_blocks']
do_map={r['identity']:r['source'] for r in dos}
M='supabase/migrations/'
drop_do={
 'public.whatsapp_groups':'DO-001',
 'public.campaigns':'DO-012',
 'public.sla_rules':'DO-013',
 'public.geo_blocking_settings':'DO-014',
 'public.client_wallet_rules':'DO-015',
 'public.automations':'DO-016',
 'public.queue_members':'DO-017',
 'public.contact_notes':'DO-043',
}
extra={}
for r in roster['source_extras']:
    identity=r['identity'];table=r['table']
    if table.startswith('storage.') or table.startswith('ops.'):
        x={'classification':'outside_public_snapshot','reason':'O snapshot informado coleta schema public. Esta policy de outro schema foi lida, mas não pode ser comparada como ausência no snapshot.','evidence':[]}
    elif table in drop_do:
        ident=drop_do[table];e=do_map[ident]
        x={'classification':'removed_by_dynamic_policy_drop','reason':'O bloco '+ident+' remove as policies anteriores da tabela/comando; corpo lido, expansão SQL não executada. As definições posteriores foram reconciliadas por nome com o snapshot.',
           'evidence':[ev(e['path'],e['start_line'],e['end_line'],'Fonte do DROP dinâmico que explica o extra.')], 'do_identity':ident}
    elif table in ('public.tags','public.contact_tags'):
        x={'classification':'retired_with_dropped_table','reason':'A tabela foi removida por migration posterior; o parser não propaga DROP TABLE para cada policy dependente.',
           'evidence':[ev(M+'20260927410000_drop_legacy_tags_tables.sql',1,3,'Remoção explícita das tabelas legadas; comentário condiciona sua aplicação a deploy anterior.')]}
    elif table=='public.lid_audit_snapshot_20260902':
        x={'classification':'retired_with_dropped_table','reason':'Snapshot temporário de dados removido por migration posterior, não policy ausente em tabela vigente.',
           'evidence':[ev(M+'20260905040000_drop_lid_snapshot_and_table_comments.sql',1,4,'DROP TABLE do snapshot temporário.') ]}
    elif table=='public.conversation_events':
        x={'classification':'renamed_to_snapshot_identity','reason':'ALTER POLICY RENAME preserva o objeto sob conversation_events_select_policy; não se somam as duas identidades.',
           'evidence':[ev(M+'20260925150000_dashboard_fase1_rls_indices.sql',23,27,'Rename na cadeia local.')]}
    elif table=='public.team_messages':
        x={'classification':'known_source_snapshot_identity_mismatch','reason':'A fonte cria Senders can edit own messages; E12 remove outros três nomes e cria team_messages_update_own. Não foi achado DROP correspondente ao nome antigo na cadeia. A auditoria de 2026-09-29 já documentava que o snapshot vivo tinha uma policy e o arquivo não documentava a remoção. Preservado como lacuna conhecida de reconciliação, sem inventar DROP ou afirmar incidente/deploy atual. Ambos os predicados filtram autor próprio; grants de coluna posteriores permanecem a proteção relevante.',
           'evidence':[ev(M+'20260404172933_cc26cd49-aefe-495d-a6da-7231daaa06e6.sql',59,65,'CREATE do nome extra.'),
                       ev(M+'20260928480000_team_chat_e12_fix_update_policy_team_messages.sql',6,12,'Três DROP de outros nomes e nova policy.'),
                       ev('docs/audits/AUDITORIA_TEAM_CHAT_ESTADO_REAL_2026-09-29.md',139,142,'Registro anterior da mesma lacuna entre fonte e snapshot.') ]}
    else:
        raise AssertionError(identity)
    x['runtime_tested']=False
    x['dynamic_expansion_executed']=False
    extra[identity]=x
manual['extra_adjudications']=extra
manual['negative_cases']=[
 {'case':'UPDATE/ALL sem WITH CHECK','disposition':'rejected_as_automatic_bypass','reason':'USING é reaproveitado pelo PostgreSQL como CHECK quando aplicável; autorização composta e grants de coluna foram considerados.'},
 {'case':'conversation_closures com closed_by de outro agente','disposition':'rejected_compensating_trigger_rls','reason':'O trigger invoker de gamificação insere/atualiza agent_stats e RLS impede autoria de outro agente. A RPC autorizada define ator. Não confundir closed_by nulo com personificação de terceiro.'},
 {'case':'profiles can_download versus role/is_active/access_level','disposition':'qualified_peer_finding','reason':'can_download não protegido no trigger permite alterar o próprio gate de UI (AUTH-027). Outros campos sensíveis estão protegidos e não foram incluídos no impacto.'},
 {'case':'team_messages reparenting por UPDATE','disposition':'rejected_column_acl','reason':'Policies de autor próprio não restringem cada coluna, mas grants atuais de UPDATE a authenticated cobrem apenas content/is_edited/updated_at; não promovido como movimentação de mensagens.'},
 {'case':'email child policy OR staff','disposition':'rejected_global_mailbox_inference','reason':'A subconsulta gmail_accounts continua sujeita à policy de conta própria; OR staff dentro da subconsulta não prova leitura global de todas as contas.'},
 {'case':'Storage UPDATE autorizado por policy','disposition':'requires_grant_reconciliation_not_promoted','reason':'Há REVOKE UPDATE ON storage.objects FROM authenticated na fonte, mas auditoria histórica de 2026-09-29:62 registra grant ainda presente. Snapshot public não resolve a ACL de Storage. Não se infere permissão nem proibição atual de UPDATE só pela policy/REVOKE.'},
 {'case':'CSAT/NPS INSERT de notas próprias','disposition':'not_promoted_without_trust_contract','reason':'Hooks existentes expõem submissão/registro manual de nota. Não foi demonstrado contrato de avaliações exclusivamente originadas por cliente externo. Limite de autoria é documentado; não contado como fraude comprovada. csat_surveys.agent_id é NOT NULL na cadeia final, apesar de ramo nulo na policy antiga.'},
 {'case':'DO e diferenças de contagem','disposition':'not_runtime_attestation','reason':'Todos os corpos foram lidos; nenhum bloco foi executado/expandido em banco e hashes de snapshot não foram usados como prova de identidade semântica do deploy.'},
]
manual['projection_notes']=[
 '446/446 identidades de policy do snapshot público têm leitura integral de suas fontes resolvidas, incluindo CREATE/ALTER/RENAME ou CREATE condicional em DO.',
 '56/56 extras lexicais foram lidos e adjudicados separadamente: outros schemas, DROP dinâmico, DROP TABLE, RENAME e uma divergência de nome já documentada.',
 '107/107 corpos DO lidos; efeitos dinâmicos não expandidos/executados. Condicionais que dependem de dados, extensões, permissões e catálogo não foram declaradas satisfeitas.',
 'O conjunto não inclui policies existentes apenas em um banco vivo fora do snapshot/source nem todas as configurações geridas por Supabase Auth/Realtime/Storage.',
]
(OUT/'access_manual_reviews.json').write_text(json.dumps(manual,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'extra_adjudications':len(extra),'negative_cases':len(manual['negative_cases'])}))
