"""Record root's completed reading of 587 exact-text groups / 730 statements.

This is a transcription of an adjudicated reading pass, not an automatic audit.
The selected snapshots are repository artifacts, never a query of the live DB.
"""
from pathlib import Path
import collections, hashlib, json, re
root=Path(__file__).resolve().parents[1]
src=root/'source'
roster=json.loads((root/'reports/database/routine_acl_pending.json').read_text())
groups=json.loads((root/'reports/root/routine-acl-text-groups.json').read_text())
function_path=root/'reports/database/function_review.json'
functions=json.loads(function_path.read_text())['functions']

def canonical(identity):
    s=identity.lower().replace('"','')
    s=re.sub(r'\btimestamptz\b','timestamp with time zone',s)
    s=re.sub(r'\bint\b','integer',s)
    s=s.replace('public.app_role','app_role').replace('public.talkx_blacklist_reason','talkx_blacklist_reason')
    return re.sub(r'\s+','',s)

current={canonical(f['identity']):f for f in functions}
sections=[
 (0,25,'Helpers de perfil/memes e endurecimento dos tokens Gmail/execução administrativa; concessões não dispensam a autorização interna e revogar authenticated não equivale a revogar PUBLIC.'),
 (26,62,'Login/identidade: cadeia inclui restauração e revogação posterior de is_account_locked/record_failed_login. O estado atual é cruzado por assinatura e snapshot; não se atribui ao estado atual a concessão histórica anônima.'),
 (63,88,'Ingestão e CRM: execução do worker fica em service_role, alterações de assinatura introduzem lease uuid; overload anterior é histórico, não se presume que conserve a ACL da assinatura nova.'),
 (89,125,'Inbox, templates e envio atômico: UI recebe execute explícito, workers/guardas são retirados de papéis clientes. Concessão por assinatura não substitui as guardas de contato/ator revisadas no corpo.'),
 (126,183,'TalkX: mutações de worker e recibos são de serviço; draft/replacement e relatórios recebem authenticated. Revoke PUBLIC e revoke anon explícitos aparecem em etapas diferentes e ambos foram considerados.'),
 (184,218,'Alertas, papéis, Dashboard e Searchbox: segredos de instância ficam restritos; RPCs de leitura têm revogações posteriores de anon/PUBLIC. Assinaturas antigas de métricas e busca não são tratadas como a API final.'),
 (219,243,'Motor Multiplix e conquistas: rotina de entrega é serviço; grant_agent_achievement perde acesso cliente e depois o recupera com novo corpo/guardas. R2-DB-009 trata a interação atual, sem novo ID de ACL.'),
 (244,259,'Calls original: quatro RPCs retiram PUBLIC/anon e dão execute a authenticated. Isso não cobre a nova sobrecarga posterior de upsert_my_call com ACL padrão, já documentada em R2-DB-001.'),
 (260,303,'Gamificação/TalkX/cron: grants são preservados por assinatura e ordem. As reaberturas a authenticated exigem corpo autorizado; não são automaticamente escalonamento. Funções de trigger não ficam invocáveis só porque o trigger está ativo.'),
 (304,367,'Team Chat: helpers de identidade e convites com execute autenticado, credenciais movidas a serviço. RPCs de leitura/edição/reação são comparadas ao roster de corpos; ACL não certifica associação a conversa.'),
 (368,410,'Saída de grupos, contatos, IA e campanhas: novos overloads de can_edit_contact e search_contacts são separados dos predecessores; funções de persistência IA são de serviço, enquanto helpers autorizados continuam acessíveis.'),
 (411,442,'Segredos/cron/Talk Me/auditoria: execução administrativa é retirada de clientes, mas get/list/claim recebem authenticated. Definições em DO e privilégios padrão ficam fora deste sub-roster e permanecem responsabilidade da revisão SQL completa.'),
 (443,524,'Classificadores puros, fila de itens, workers, orçamento e jobs IA: concessões de serviço/revogações cliente explícitas; helpers puros não se confundem com escrita privilegiada. Acesso de execução não prova idempotência ou conclusão, que têm achados próprios.'),
 (525,586,'Ritmo/opt-out/capacidades, métricas, links e recibos: serviço é reservado para transporte e persistência; leitura/CRUD autenticados dependem das guardas internas. Revogar PUBLIC não revoga uma concessão explícita anterior a anon, razão do cruzamento com snapshots/roster.')]

assert len(groups['groups'])==587 and len(roster['units'])==730
units=[]
for group_index,g in enumerate(groups['groups']):
    a=g['parsed_acl'];identity=canonical(a['identity']);f=current.get(identity)
    note=next(note for lo,hi,note in sections if lo<=group_index<=hi)
    for occurrence in g['occurrences']:
        u=dict(roster['units'][occurrence['unit_index']]);s=u['source'];b=(src/u['path']).read_bytes()
        assert hashlib.sha256(b).hexdigest()==s['file_sha256']
        text='\n'.join(b.decode().splitlines()[s['start_line']-1:s['end_line']])
        assert text==g['text']
        u.update(coverage_level='semantic',read_status='dedicated_acl_semantic_pass_completed',reviewer='root',
                 parsed_acl=a,exact_text_group=group_index,adjudication=note,
                 current_signature_match=f['identity'] if f else None,
                 snapshot_execute_grantees=f.get('snapshot_execute_grantees',[]) if f else None,
                 related_finding_ids=f.get('finding_ids',[]) if f else [],
                 signature_disposition='CURRENT_SIGNATURE_REVIEW_MATCH' if f else 'HISTORICAL_OVERLOAD_OR_REMOVED_SIGNATURE',
                 runtime_tested=False)
        units.append((occurrence['unit_index'],u))
units=[u for _,u in sorted(units)]
assert len(units)==730
summary={'schema_version':1,'source_head':roster['source_head'],'status':'COMPLETED_REVIEW_PASS',
 'statement_count':730,'exact_text_groups_read':587,'statement_lines_with_overlap':sum(u['source_line_count'] for u in units),
 'function_review_sha256':hashlib.sha256(function_path.read_bytes()).hexdigest(),
 'current_signatures':len({canonical(u['parsed_acl']['identity']) for u in units if u['current_signature_match']}),
 'historical_or_removed_signatures':sorted({u['parsed_acl']['identity'].replace('\n',' ') for u in units if not u['current_signature_match']}),
 'new_findings':0,'units':units,
 'limits':['Every exact-text group was read; repeated byte-identical range text was mapped to every pinned occurrence and chronological path.',
           'Top-level GRANT/REVOKE only. Dynamic DO/default ACL/creation/drop effects are reconciled by database review; these rows are not an independent simulation of PostgreSQL privileges.',
           'Function-body review and stored snapshot ACLs were cross-referenced, not a live database or authorization execution.',
           'No finding is inferred from GRANT authenticated alone or from revoked trigger execution; the caller/body/trigger contexts remain essential.']}
(root/'reports/root/routine-acl-review.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
groups['status']='COMPLETED_EXACT_TEXT_READING';groups['review_evidence']='routine-acl-review.json'
(root/'reports/root/routine-acl-text-groups.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['units','limits','historical_or_removed_signatures']},indent=2))
