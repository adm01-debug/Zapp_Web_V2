"""Document static reading only; does not import or execute tests/application."""
from pathlib import Path
import json,hashlib,subprocess
S=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
O=Path(__file__).resolve().parent
R=O.parent/'database/test-review-roster.json'
HEAD='da307ba5626dce892f0b37cb6762463f55d14a96'
assert subprocess.check_output(['git','-C',str(S),'rev-parse','HEAD'],text=True).strip()==HEAD
roster=json.loads(R.read_text());assert roster['source_head']==HEAD
# index: assertions, doubles, adjudication, limits
notes={
32:(['Tema padrão v6, migração v5/forest, storage de outra aba sem regravar e dark→light'],['Hook useTheme simulado; componente/presets reais, DOM/localStorage observados'],'Controles úteis de aplicação de tokens e persistência. Sem novo achado.',['Não verifica CSS/layout de navegador nem eventos reais entre duas abas.']),
33:(['Banner com region nomeada, texto contido, axe region e ausência sem conexões'],['Supabase devolve linhas e subscription fixa; componente real'],'Aceite de landmark bem delimitado, sem ação de reconectar. Não refuta R2-API-042.',['Contraste explicitamente desligado no axe; não há clique, erro invoke ou credencial real.']),
34:(['Resumo/estado vazio; clique healthcheck e erro; polling de 30 s e unmount sem novas queries'],['Supabase e toast simulados; relógio falso e componente real'],'Teste de encerramento avança relógio depois de unmount e verifica chamadas, controle substantivo. Sem novo achado.',['Dados sempre vazios; não valida resumo de conexões reais ou resposta lógica HTTP 200 com erro.']),
35:(['Confetti recebe 0.99/0.01 e escolhe última/primeira cor e tipo no DOM'],['secureRandomFloat fixado; normalização de cor pelo DOM'],'Testa consumidor real do índice sorteado, sem cópia local da função produtiva. Sem novo achado.',['Não comprova qualidade criptográfica, animação/layout visual ou ciclo de vida completo.']),
36:(['Sanitizer: comentários CSS, url em várias propriedades, hooks isolados, dataURL limite, idempotência e preview'],['sanitizeEmailHtml/buildBodyPreview reais; removeAllHooks na instância default'],'Controles positivos de preservação de cor e remoção hostil são relevantes. Não refuta R2-COM-011, que trata src protocol-relative.',['Caso height gigante só exige cor preservada; preview devolve string literal HTML e depende de render seguro no consumidor. DataURL aceita não é imagem decodificada.']),
37:(['Sanitizer CSS: CRLF após hex, url tracker, line-continuation puro, espaço/tab'],['Helper real com payloads locais e controles de cor preservada'],'Casos negativos focados nos escapes; sem cópia de parser. Sem novo achado.',['Não testa execução/render de CSS em navegador real ou imagens remotas fora de style.']),
38:(['Dialog: open, título/remetente, sandbox sem scripts/same-origin, popups, srcdoc e download'],['Primitivas Dialog substituídas; HTML recebido já sanitizado'],'Confere atributos do componente real, sem alegar que realiza sanitização. Sem novo achado.',['Não executa iframe, download ou navegador; não verifica foco/fechamento Radix nem sanitização upstream.']),
39:(['Nove componentes Email não contêm cores hex/rgb ou classes Tailwind fixas'],['Scanner textual de arquivos de produto'],'Guarda de convenção de paleta, sem prova visual de contraste ou propagação de tokens. Sem novo achado.',['Regex inclui comentários/textos; pode omitir outras notações de cor e estilos herdados.']),
40:(['Sanitizer: hex em URL/propriedade, transforms, máscaras e continuação de linhas'],['Helper real com strings hostis e cor preservada'],'Negativos exercitam produtor, preservando propriedade segura. Sem novo achado.',['Caso cursor sem URL só verifica ausência de t.exemplo, que o input não possui; não comprova remoção dessa propriedade. Não refuta src protocol-relative COM011.']),
41:(['SpeedTyping usa fonte simulada e escolhe primeira/última frase renderizada'],['secureRandomFloat fixado; componente e TYPING_PHRASES reais'],'Vincula sorteio ao DOM; não é teste de cópia da lógica. Sem novo achado.',['Não testa pontuação, persistência, timer de jogo ou entropia real.']),
42:(['Ajuda mostra seis nomes de tarefas mais Ajuda, teclas e atalhos globais'],['Dialog/ScrollArea passthroughs e toast mockado; componente real'],'Contrato de apresentação dos nomes e teclas, explicitamente sem primitivas Radix. Sem novo achado.',['Não dispara atalhos nem prova lazy loading/chunks ou conflito de teclas.']),
43:(['CelebrationParticles faz 120 chamadas para 20 partículas, tamanho 8px e invisibilidade'],['Fonte aleatória fixada e componente real'],'Contagem e estilo calculado observados, controles positivos de consumidor. Sem novo achado.',['Iteração de tamanho isolada pode ser vazia, mas caso separado exige 20 partículas; não mede animação real ou entropia.']),
44:(['MFABackupCodes chama crypto, gera 10 códigos formato 4+4 e amostras sem repetição'],['Spy preserva crypto real; componente renderizado/desmontado'],'Demonstra origem e formato do sorteio local. Não prova emissão/validação de credenciais pelo servidor, como reconhece o comentário. Sem novo achado.',['Unicidade é amostral, não garantia universal; nenhum cadastro, recuperação, consumo único ou integração Auth.']),
45:(['MiniChatPiP visível/oculto, iniciais, expandir, reply Enter/vazio e callback ausente'],['Framer Motion substituído; callbacks vi.fn e componente real'],'Maioria verifica DOM e chamadas locais. Caso dismiss 48–57 tem asserção dentro de if(dismissBtn) e passa se botão sumir; informado à família TC011/GOV003, sem novo ID produtivo.',['Não testa callback assíncrono falhando, identidade entre contatos ou gesto/drag; onDismiss usa mock compartilhado.']),
46:(['MonitoringNotifications ganho 0.12, mudo, horário silencioso e updateSettings'],['AudioContext fake registra ganho; settings/quiet injetados; hook real'],'Controles positivos e negativos do volume e mudo. Sem novo achado.',['Não prova áudio físico, encerramento de AudioContext ou persistência do hook de settings; caso localStorage não espiona ausência de escrita.']),
47:(['NotificationItem ações reminder_due, openTask/complete; info sem ações e onMarkRead ID'],['Hook de tarefas completamente mockado com metadata fixa'],'Confere vínculo dos botões ao hook e diferença de tipos. Sem novo achado.',['Adiar só tem presença verificada; não há execução de snooze, erro assíncrono ou navegação/persistência reais.']),
48:(['HighContrast limpa tokens inline ao aplicar/alternar e restaura ao desligar'],['Provider/presets reais e DOM/localStorage'],'Prova origem e prioridade das variáveis, limite visual explicitamente separado. Sem novo achado.',['Só quatro tokens no primeiro caso e primary nos demais; não mede contraste renderizado ou todas as cores.']),
49:(['Contraste do sistema aplica classe e reage a matchMedia; toggle sem preferência funciona'],['matchMedia controlado; presets mockados'],'Controles de estado úteis. Caso 77–86 intitulado usuário desliga começa storage null, clica uma vez e exige true: exercita ligar. Limite enviado para TC011/GOV003.',['Não aplica CSS real, nem prova token/contraste visual. Comentário de medição em produção não foi verificado nesta auditoria.']),
50:(['Button default/variantes/loading/disabled e clique único'],['Componente real em DOM; handler vi.fn'],'Verifica props e classes locais. Sem novo achado.',['Não testa teclado, asChild, foco ou estilo visual; uso vi global depende de configuração do runner e não foi presumido erro.']),
51:(['LiquidMetalButton nome/count/click, badge 99+, foco acelera, unmount dispose, loading bloqueia e label contextual'],['ShaderMount fake cria canvas e spies; WebGL2 capability simulada'],'Controles de interação e liberação são substantivos, preservando limite gráfico. Sem novo achado.',['Não executa GPU/shader real ou preferência reduzida de movimento; garantia antes do shader usa import mockado sem atraso controlado.']),
}
entries=[]
for i in range(32,52):
 f=roster['files'][i];b=(S/f['path']).read_bytes();lines=len(b.decode().splitlines())
 blob=hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest();sha=hashlib.sha256(b).hexdigest()
 assert blob==f['git_blob_sha'] and sha==f['source_sha256'] and lines==f['line_end'],f['path']
 assert subprocess.check_output(['git','-C',str(S),'rev-parse',HEAD+':'+f['path']],text=True).strip()==blob
 a,m,d,l=notes[i]
 entries.append(dict(path=f['path'],roster_index_zero_based=i,reviewer='/root/reaudit_providers',source_head=HEAD,
 git_blob_sha=blob,source_sha256=sha,total_lines=lines,review_status='SEMANTIC_FULL_FILE',
 level='semantic_full_file',reviewed_ranges=[dict(line_start=1,line_end=lines,symbols=a)],
 assertions_reviewed=a,mocks_and_fixtures=m,adjudication=d,limits=l,tests_executed=0,source_hash_rechecked_before_record=True))
assert len(entries)==20
out=dict(schema_version=1,status='COMPLETE',owner='/root/reaudit_providers',delegated_by='/root',source_head=HEAD,
 source_root=str(S),roster=str(R),roster_sha256=hashlib.sha256(R.read_bytes()).hexdigest(),slice_zero_based=[32,52],
 total_files=20,total_lines=sum(e['total_lines'] for e in entries),tests_executed=0,source_changes=0,
 findings_added=0,files=entries,limits=['Static reading of assertions, mocks and fixtures only; no test suite, browser, database or provider executed.',
 'These 20 files are peer assistance for database roster and are not added to the completed providers roster count of76.'])
(O/'database-peer-test-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:out[k] for k in ['status','total_files','total_lines','tests_executed','findings_added']}))
