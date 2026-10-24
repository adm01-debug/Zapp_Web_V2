#!/usr/bin/env python3
"""Build only declarations for source actually reviewed; never infer review from AST inventory."""
from pathlib import Path
import argparse, hashlib, json, subprocess

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--source', default=str(ROOT / 'source'))
p.add_argument('--integrity', default=str(ROOT / 'source-integrity.json'))
p.add_argument('--out', default=str(ROOT / 'reports/platform'))
a = p.parse_args()
SOURCE, OUT = Path(a.source).resolve(), Path(a.out)
OUT.mkdir(parents=True, exist_ok=True)
integrity = json.loads(Path(a.integrity).read_text())
HEAD = integrity['head_sha']
assert subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip() == HEAD
files = {r['path']: r for r in integrity['files']}

def ev(path, lo, hi, purpose=''):
    b = (SOURCE / path).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
    assert blob == files[path]['git_blob_sha'], path
    assert 0 < lo <= hi <= len(b.splitlines()), (path, lo, hi)
    return dict(path=path, line_start=lo, line_end=hi, git_blob_sha=blob, purpose=purpose,
                url=f'https://github.com/adm01-debug/Zapp_Web_V2/blob/{HEAD}/{path}#L{lo}-L{hi}')

findings = []
def add(n, priority, title, condition, chain, observed, impact, refs, probes, acceptance, limitations):
    findings.append(dict(id=f'R2-PLAT-{n:03}', title=title, priority=priority,
        classification='CONFIRMED_STATIC_CONTRACT', source_head=HEAD, preconditions=condition,
        consumer_chain=chain, observed_behavior=observed, impact=impact,
        evidence=[ev(*r) for r in refs], probes=probes, acceptance_criteria=acceptance,
        limitations=limitations, related_previous_findings=[],
        relation_to_prior_audit='NEW_DISCOVERY_NOT_RECENT_REGRESSION', runtime_production_acceptance=False))

nav = 'src/hooks/system/useNavigationHistory.ts'
notif = 'src/hooks/system/useNotifications.ts'
settings = 'src/hooks/system/useNotificationSettings.ts'
panel = 'src/components/notifications/NotificationSettingsPanel.tsx'
types = 'src/components/notifications/NotificationTypeCards.tsx'
popover = 'src/components/notifications/NotificationsPopover.tsx'
item = 'src/components/notifications/NotificationItem.tsx'
history = 'src/hooks/system/useSearchHistory.ts'
undo = 'src/hooks/system/useUndoableAction.ts'
bulk = 'src/hooks/inbox/useInboxBulkActions.ts'
auth = 'src/hooks/auth/useAuth.tsx'

add(1, 'P2', 'Avançar no histórico para uma tela repetida seleciona a ocorrência anterior',
    'Histórico interno contém a mesma view antes e depois da posição atual, e o navegador avança para a ocorrência posterior. Exemplo A,B,C,B,D com posição em C.',
    'Popstate do navegador → useNavigationHistory.onPopState → índice/breadcrumb → Index e navegação da aplicação.',
    'O callback recebe somente viewId, procura correspondência para trás primeiro e retorna antes de procurar à frente. No exemplo, avançar de C para B escolhe índice 1, embora o destino seja índice 3. A view B é correta, mas sua posição no histórico não é.',
    'A trilha e os próximos comandos de voltar/avançar podem operar sobre a ocorrência errada. Não se afirma que toda navegação de uma etapa falhe.',
    [(nav, 115, 139), (nav, 211, 264), ('src/pages/Index.tsx', 30, 42), ('src/pages/Index.tsx', 107, 120)],
    ['PLAT-P01'],
    ['Vincular cada entrada a uma identidade de history.state e reconciliar travessia por essa identidade.',
     'Provar ida e volta por views repetidas, reload e navegação programática sem duplicar entradas.'],
    'Callback exato com estado e destino de navegador sintéticos; não foi montada uma interface nem usado o botão do browser.')

add(2, 'P2', 'Contagem de notificações não lidas diverge da lista após leitura e eventos',
    'Há outra notificação não lida e o operador abre uma já lida; ou o evento UPDATE da leitura chega antes da conclusão HTTP da mutation.',
    'NotificationItem.onClick → markAsRead e subscription Realtime → unreadCount → badge do NotificationsPopover.',
    'markAsRead decrementa o contador em toda conclusão bem-sucedida, sem conferir a transição anterior. NotificationItem chama essa ação mesmo se a linha já está lida. O UPDATE de Realtime já recalcula o total antes da segunda subtração. INSERT incrementa sem deduplicação/checagem de is_read e DELETE remoto remove a linha sem ajustar a contagem.',
    'O badge pode marcar zero com uma notificação não lida visível na lista. São variantes do mesmo contrato de reconciliação, não quatro defeitos contados separadamente.',
    [(notif, 80, 104), (notif, 114, 130), (item, 93, 108), (popover, 22, 39), (popover, 90, 95)],
    ['PLAT-P02', 'PLAT-P03'],
    ['Derivar o contador do conjunto reconciliado ou aplicar deltas idempotentes por transição de estado.',
     'Provar leitura repetida, evento antes/depois do retorno HTTP, INSERT duplicado/lido e DELETE remoto.'],
    'Callbacks exatos de mutation e evento com estado sintético; nenhum dado ou subscription real foi alterado. Limite de 100 linhas da query é registrado separadamente como limite de cobertura do total.')

add(3, 'P2', 'Três controles de notificação só alteram cache e voltam ao padrão após recarga',
    'Usuário desativa Novas Mensagens, Menções ou Violação de SLA na seção Tipos de Notificação.',
    'NotificationTypeSection → updateSettings → React Query cache → user_settings → mapDbToSettings.',
    'Os três booleans newMessageSound, mentionSound e slaBreachSound são aplicados ao cache otimista, mas não são convertidos para nenhum campo de dbUpdates. Uma atualização contendo apenas esses controles não chama o banco. A leitura também não os mapeia e repõe DEFAULT_SETTINGS, todos true. Revisão independente de auth identificou que useRealtimeNotifications também ignora newMessageSound em seus guardas e dependências: o som de mensagem depende da chave global e do horário de silêncio.',
    'A configuração exibida como desativada não persiste; ao recarregar, volta a habilitada. A chave de Novas Mensagens tampouco bloqueia o som nesse consumidor enquanto a configuração global permanece ativa. Volume, tipos de som e outros campos possuem mapeamento e não foram classificados como igualmente ausentes.',
    [(settings, 10, 45), (settings, 84, 102), (settings, 110, 126), (settings, 135, 178), (types, 85, 104),
     ('src/hooks/realtime/useRealtimeNotifications.ts', 25, 63)],
    ['PLAT-P04'],
    ['Definir armazenamento, leitura e consumo dos três booleans, ou retirar controles que não têm contrato persistente.',
     'Provar cada alternância, reload e leitura em outra sessão do mesmo usuário, preservando o isolamento entre usuários.'],
    'Hook inteiro executado com React, QueryClient, Auth e banco simulados; zero chamadas ao banco durante as três alterações. A omissão no consumidor Realtime é evidência estática adicional, sem reprodução sonora. desktopAlerts não foi contado como quarto controle exposto.')

add(4, 'P2', 'Restaurar preferências anuncia sucesso e mantém cache alterado quando o banco rejeita',
    'A escrita de restauração retorna {error} por indisponibilidade, permissão ou validação.',
    'NotificationSettingsPanel.handleReset → resetSettings → cache padrão e upsert → aviso de sucesso.',
    'A tela chama resetSettings sem aguardar e anuncia restauração imediatamente. O hook muda o cache antes da escrita e ignora o campo error do upsert; seu catch também apenas registra exceções, sem rollback ou rejeição para a tela.',
    'O usuário recebe confirmação e vê valores padrão que não foram gravados. O probe fez a promise resolver apesar do erro sintético de banco.',
    [(panel, 36, 39), (settings, 198, 228), (settings, 180, 195, 'Controle presente no update comum não foi generalizado ao reset.')],
    ['PLAT-P05'],
    ['Validar o retorno do upsert, aguardar confirmação e propagar falha para a tela.',
     'Recuperar o estado anterior ou recarregar a fonte persistida após falha; provar sucesso e recusa.'],
    'Hook exato com retorno de banco simulado. O teste não altera preferências reais; o fluxo normal updateSettings já verifica error e informa falhas.')

add(5, 'P2', 'Falha de carregamento de notificações aparece como ausência confirmada',
    'Primeira consulta de notificações está pendente ou falha antes de receber uma lista.',
    'fetchNotifications → estado inicial vazio/loading → NotificationsPopover.',
    'O hook registra erro apenas no logger, mantém a lista vazia e encerra loading. O Popover não consome loading nem um estado de erro e mostra Tudo em dia/Nenhuma notificação no momento sempre que a lista está vazia.',
    'A interface comunica inexistência de notificações quando a consulta ainda não confirmou esse estado ou não conseguiu consultá-las.',
    [(notif, 20, 60), (popover, 22, 23), (popover, 80, 88)], [],
    ['Separar carregando, erro, vazio confirmado e lista disponível.',
     'Oferecer nova tentativa em erro e conservar dados anteriores com indicação de atualização falhada quando aplicável.'],
    'Leitura estática do produtor e consumidor; não há prova dinâmica específica nem medição de incidência. A assinatura Realtime pode trazer novos itens depois, mas não confirma o histórico faltante.')

add(6, 'P2', 'Buscas recentes persistem entre usuários no mesmo perfil de navegador',
    'Usuário A pesquisa, sai, e B entra na mesma origem/perfil do navegador sem limpar manualmente o histórico. Termos podem conter dados que A digitou.',
    'useGlobalSearchData.addToHistory → localStorage global-search-history → logout → próxima instância de useSearchHistory → GlobalSearch.Buscas recentes.',
    'A chave não inclui usuário nem sessão e armazena query, timestamp e resultCount. O hook lê a mesma chave no mount. Os dois caminhos de logout limpam QueryClient, cache offline e rascunhos de Email, mas não essa chave; o serviço de logout somente delega para supabase.auth.signOut.',
    'B pode ver termos e quantidades de resultados das buscas feitas por A. O achado não demonstra acesso aos resultados remotos nem quebra das políticas de consulta.',
    [(history, 3, 39), (history, 51, 54), ('src/components/inbox/useGlobalSearchData.ts', 223, 226),
     ('src/components/inbox/GlobalSearch.tsx', 202, 225), (auth, 109, 117), (auth, 162, 181), ('src/services/auth.service.ts', 121, 123)],
    ['PLAT-P06'],
    ['Separar o histórico por identidade e definir retenção/limpeza de saída apropriada.',
     'Provar A→logout→B e retorno a A sem exposição de termos alheios, incluindo logout que falha remotamente.'],
    'Hook inteiro com localStorage/React simulados. Não houve login/logout real nem leitura de termos pessoais; o probe usa somente texto sintético. O botão Limpar existe, mas não é executado automaticamente na troca de usuário.')

add(7, 'P2', 'Desfazer no aviso anterior reverte a operação seguinte de arquivamento',
    'Concluir dois arquivamentos em lote com a mesma instância de useUndoableAction dentro da janela de cinco segundos e acionar o Desfazer do primeiro aviso ainda disponível.',
    'RealtimeInboxView → useInboxBulkActions.bulkArchive → useUndoableAction.execute → dois toasts → callback do primeiro.',
    'Cada execute troca pendingActionRef.current, mas não identifica nem descarta o toast anterior. O callback de cada toast consulta essa ref compartilhada na hora do clique, em vez do undoAction de sua operação. Após A e B, o callback do toast A chama undoAction de B e limpa o estado compartilhado.',
    'O usuário tenta desfazer A, mas restaura B. A mensagem de confirmação continua sendo a capturada pelo primeiro aviso. O consumidor libera bulkLoading após a mutation, sem aguardar a janela de undo, permitindo a segunda operação.',
    [(undo, 51, 111), (undo, 113, 137), (bulk, 97, 138), ('src/components/inbox/RealtimeInboxView.tsx', 88, 98),
     ('src/components/inbox/ConversationListSidebar.tsx', 112, 125)], ['PLAT-P07'],
    ['Vincular cada toast à identidade/callback de sua operação, ou encerrar explicitamente o undo anterior ao iniciar outra.',
     'Provar dois lotes seguidos e clicar cada aviso; nenhuma ação deve operar no lote errado.'],
    'Callback execute exato, incluindo o callback de toast que ele produz, com timers não disparados e ações sintéticas. Sonner/React DOM e arquivamento real não foram executados. Não reconta o undo de tarefas da área modules, que usa outro helper.')

add(8, 'P2', 'Editar atalhos em instâncias separadas perde personalizações e mantém o listener antigo',
    'Configurações de atalhos e listener global estão montados. Personalizar A e, sem remontar as outras linhas, personalizar B.',
    'KeyboardShortcutsSettings e cada ShortcutRow → instâncias independentes de useCustomShortcuts → localStorage → useGlobalKeyboardShortcuts.',
    'Cada linha e o pai usam um hook com estado próprio, carregado do storage somente no mount. saveShortcuts grava o conjunto completo da instância que está editando, sem reconciliar a gravação da outra. Depois de A salvar, B ainda contém a cópia anterior e salva somente sua alteração, apagando A. O listener global e as props exibidas pelo pai também não recebem atualização dessas instâncias.',
    'A tela anuncia Atalho atualizado, mas pode continuar mostrando e executando a combinação anterior; uma segunda edição pode apagar a primeira preferencialmente já gravada. Não é alegação de perda de dados do servidor, pois essas preferências são locais.',
    [('src/hooks/ui/useCustomShortcuts.ts', 41, 94), ('src/components/settings/KeyboardShortcutsSettings.tsx', 36, 65),
     ('src/components/settings/KeyboardShortcutsSettings.tsx', 173, 209), ('src/hooks/ui/useGlobalKeyboardShortcuts.ts', 22, 25),
     ('src/hooks/ui/useGlobalKeyboardShortcuts.ts', 108, 143), ('src/components/keyboard/GlobalKeyboardProvider.tsx', 65, 76)],
    ['PLAT-P08'],
    ['Usar uma fonte compartilhada de estado/assinatura de preferências ou transmitir callbacks e bindings do pai para as linhas.',
     'Provar duas edições seguidas, atualização da combinação exibida/consumida, reset e remontagem sem perder a primeira mudança.'],
    'Callbacks exatos de atualização/persistência com duas entradas sintéticas e instâncias separadas. Não foi executado React DOM nem pressionado teclado real. Remontagem pode recarregar a última gravação; isso não evita a sobrescrita já ocorrida.')

add(9, 'P2', 'Atalho Ir para Dashboard anuncia navegação sem selecionar a view Dashboard',
    'Usuário está no Inbox e aciona Ctrl+2, o binding padrão anunciado para Ir para Dashboard, com foco fora de campo editável.',
    "DEFAULT_SHORTCUTS.go-to-dashboard → useGlobalKeyboardShortcuts.defaultActions → navigate('/') → Index/useNavigationHistory.",
    'A ação chama navigate somente para / e mostra toast Dashboard. O estado que governa ViewRouter é currentView de useNavigationHistory; o caminho de seleção correto é setCurrentView/navigateTo ou sua URL ?view=. O provider montado no App não fornece override de go-to-dashboard e esse callback não usa o handler de navegação registrado pelo Index.',
    'O atalho pode permanecer no Inbox enquanto informa Dashboard. O problema se refere ao binding Ctrl+2; Alt+R usa outro hook que efetivamente chama onNavigate(dashboard).',
    [('src/hooks/shortcuts/defaultShortcuts.ts', 24, 25), ('src/hooks/ui/useGlobalKeyboardShortcuts.ts', 32, 39),
     ('src/hooks/ui/useGlobalKeyboardShortcuts.ts', 108, 138), ('src/components/keyboard/GlobalKeyboardProvider.tsx', 65, 76),
     ('src/App.tsx', 121, 143), ('src/pages/Index.tsx', 37, 51), ('src/pages/Index.tsx', 69, 77),
     ('src/components/layout/AppShell.tsx', 147, 157)], [],
    ['Encaminhar o binding pelo mesmo contrato de navegação de sidebar/palette, selecionando explicitamente dashboard.',
     'Provar o atalho a partir do Inbox e de outra view, conferindo conteúdo, URL e trilha, com paridade ao clique.'],
    'Cadeia de produtor/consumidor lida integralmente, sem browser ou React Router montado. Não se atribui esse defeito ao atalho alternativo Alt+R nem a IDs sem binding padrão.')

mobile = 'src/components/mobile/MobileShell.tsx'
add(10, 'P2', 'Botão Buscar do cabeçalho mobile só altera um estado sem consumidor',
    'Aplicação usa AppShell em viewport mobile e o usuário aciona Buscar no MobileHeader.',
    'AppShell → MobileShell → MobileHeader.onSearchOpen → setMobileSearchOpen(true).',
    'MobileShell declara mobileSearchOpen e fornece o setter ao botão, mas nunca lê o estado nem renderiza ou despacha uma busca. O botão é exposto porque o callback existe.',
    'O comando não abre busca, campo ou resultado. O probe mudou o flag para true e conservou a mesma composição e os demais painéis fechados.',
    [(mobile, 35, 56), (mobile, 64, 109), ('src/components/mobile/MobileHeader.tsx', 111, 123),
     ('src/components/layout/AppShell.tsx', 95, 106)], ['PLAT-P09'],
    ['Ligar o botão a uma superfície de busca real ou ao comando compartilhado que a abre.',
     'Provar abertura, foco, resultado, fechamento e retorno em viewport mobile.'],
    'Componente inteiro executado com captura de JSX e hooks sintéticos. Não houve ReactDOM, clique real ou medição de layout; o achado é a ausência de qualquer consumidor do estado.')

add(11, 'P2', 'Notificações mobile usam lista vazia local e contador fixado em zero',
    'Há notificações do usuário, mas a navegação usa o shell mobile do Index.',
    'Index.unreadNotifications=0 → AppShell → MobileShell.notification state vazio → NotificationsPanel.',
    'Index passa zero literal. MobileShell cria notifications=[] sem consulta, subscription ou ação que insira dados; a única atualização mapeia essa lista para read=true. O painel abre normalmente e exibe Tudo em dia/Nenhuma notificação com base no array desconectado.',
    'O usuário mobile não recebe a lista nem o contador real por esse painel. Isso independe de erro de rede e é distinto de PLAT005, que trata erro/loading de uma consulta existente no popover desktop.',
    [('src/pages/Index.tsx', 113, 127), (mobile, 35, 49), (mobile, 53, 73),
     ('src/components/mobile/MobileHeader.tsx', 125, 145),
     ('src/components/mobile/NotificationsPanel.tsx', 110, 121)], ['PLAT-P10'],
    ['Conectar mobile e desktop à mesma fonte de notificações e às mesmas mutações de leitura.',
     'Provar lista não vazia, contador, leitura individual/em lote, loading e erro em viewport mobile.'],
    'O probe usa o literal zero extraído do Index e abre o painel do shell inteiro sob hooks/JSX sintéticos. A existência de notificações reais é uma precondição, não um dado consultado na conta do usuário.')

add(12, 'P2', 'Sidebar das rotas de SLA muda a seleção sem abrir o módulo escolhido',
    'Usuário está nas rotas protegidas /sla ou /sla/history e seleciona Inbox ou outro módulo pela Sidebar.',
    'AppRoutes → SLADashboardPage/SLAHistory → SidebarNavItem.onClick → setCurrentView local.',
    'As duas páginas passam o setter de um estado local para Sidebar, mas sempre renderizam o mesmo corpo de SLA. O item da Sidebar apenas chama esse callback. Não há navegação de rota nem troca condicional de conteúdo nesses consumidores; a integração normal do Index possui outro callback.',
    'A indicação de módulo selecionado pode mudar enquanto o usuário continua vendo SLA. O probe alterou a seleção para inbox e preservou a composição dos dois corpos. QueuesComparison não usa essa Sidebar e não pertence ao achado.',
    [('src/pages/SLADashboard.tsx', 5, 15), ('src/pages/SLAHistory.tsx', 7, 21),
     ('src/components/layout/SidebarNavItem.tsx', 27, 43), ('src/components/layout/Sidebar.tsx', 128, 137),
     ('src/routes/AppRoutes.tsx', 82, 97)], ['PLAT-P11'],
    ['Conectar essas entradas ao contrato de navegação compartilhado, preservando autorização, histórico e destino.',
     'Provar ida das duas rotas para Inbox/Configurações, retorno e comportamento do botão Voltar.'],
    'Páginas completas com JSX/estado sintéticos; wiring da Sidebar e rotas inspecionados. Sem navegação real, browser, conta autenticada ou mudança do produto. O controle de acesso das rotas permanece presente.')

full_system = ['useNavigationHistory', 'useNotificationSettings', 'useNotifications', 'useDocumentBadge',
    'useResourcePrefetch', 'useDuplicate', 'useSearch', 'useVersions', 'useSkillBasedAssign', 'useCurrentModule',
    'usePrefetch', 'useSearchHistory', 'useDebounce', 'useIdleCallback', 'useNetworkStatus', 'useInfiniteScroll',
    'useCRMIntegrationEnabled', 'useUndoableAction']
full = [f'src/hooks/system/{name}.ts' for name in full_system] + [
    'src/components/a11y/a11yHooks.tsx', 'src/components/a11y/a11yComponents.tsx',
    'src/components/a11y/KeyboardNavigation.tsx', panel, types, popover, item, 'src/App.tsx', bulk,
    'src/hooks/realtime/useRealtimeNotifications.ts']
manual_path = OUT / 'manual-review.json'
manual = json.loads(manual_path.read_text()) if manual_path.exists() else {'source_head': HEAD, 'batches': []}
assert manual['source_head'] == HEAD
for batch in manual['batches']:
    assert batch['review_level'] == 'SEMANTIC_FILE_REVIEW'
    full.extend(batch['files'])
full = list(dict.fromkeys(full))
coverage = [dict(ev(path, 1, len((SOURCE / path).read_bytes().splitlines())),
    review_level='SEMANTIC_FILE_REVIEW', scope='Corpo integral e contratos locais lidos; consumidores/ramos cruzados quando indicados. Não declara execução de todos os estados.') for path in full]
for finding in findings:
    for e in finding['evidence']:
        if e['path'] not in full:
            coverage.append(dict(e, review_level='TARGETED_RANGE_REVIEW', scope=finding['id']))
coverage.append(dict(ev('src/providers/AppProviders.tsx', 64, 90), review_level='TARGETED_RANGE_REVIEW',
                     scope='Ciclo de vida de AuthProvider e CallSessionProvider; observação de teardown, sem novo defeito promovido.'))

adjudications = [
    dict(candidate='useResourcePrefetch vaza dados reais entre usuários', decision='NOT_PROMOTED',
         basis='O cache genérico não inclui identidade automaticamente, mas não foi encontrado consumidor de produção além de exportações. Não há cadeia concreta de dados sensíveis demonstrada.'),
    dict(candidate='Todos os controles da configuração de notificação são fictícios', decision='REJECTED',
         basis='Volume, quiet hours, notificações do browser, sentimento, transcrição e tipos de som têm mapeamento de escrita/leitura. PLAT003 delimita três booleans expostos.'),
    dict(candidate='SkipLinks do App aponta para o alvo incorreto do pacote a11y', decision='REJECTED',
         basis='App importa components/ui/skip-link, não o componente homônimo do diretório a11y. Os exports deste pacote a11y não tinham consumidor concreto encontrado.'),
    dict(candidate='useSkillBasedAssign/useVersions/useSearch/useInfiniteScroll falham nas telas atuais', decision='NOT_PROMOTED',
         basis='Corpos genéricos lidos, com limitações de chave de cache/paginação/mutation anotadas; apenas barrels e testes encontrados como consumidores. Ausência de uso impede atribuir falha a uma ação atual.'),
    dict(candidate='Sair de Auth encerra necessariamente toda instância SIP', decision='OBSERVATION_REQUIRES_CONTRACT',
         basis='AppProviders persiste acima das rotas; Auth logout não chama disconnect SIP e o CallProvider não depende de user. Sem contrato funcional explícito sobre continuidade do ramal, não foi promovido como novo P1 nem como incidente.'),
    dict(candidate='Contagem limitada a100 notificações é total absoluto confirmado', decision='LIMITATION',
         basis='fetchNotifications consulta somente100 recentes. Não foram medidos volume nem limite/retensão implantados; PLAT002 prova divergência mesmo com duas linhas, sem depender de truncamento.'),
]

def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

save('findings.json', dict(schema_version=1, source_head=HEAD, status='COMPLETED_REVIEW_PASS',
                           findings=findings, adjudications=adjudications))
save('coverage.json', dict(schema_version=1, source_head=HEAD, files=coverage,
                          limits=['Sem execução de browser, React DOM, Supabase ou ações de produto.',
                                  'Alguns utilitários são genéricos ou não alcançados por consumidores; revisão não implica uso atual.']))
lines = ['# Reauditoria de navegação, notificações e utilitários de plataforma', '',
         f'Fonte fixada: `{HEAD}`.', '',
         f'{len(findings)} contratos confirmados por leitura de código. Onze casos PLAT executam callbacks/módulos exatos com fronteiras sintéticas; PLAT002 usa duas variantes, e PLAT005/009 têm inspeção estática. COM-P10 compartilha o arquivo de resultados e pertence ao relatório de Email. Não houve navegação autenticada, operação no banco, instalação ou edição do produto.', '']
for f in findings:
    lines += [f"## {f['id']} · {f['priority']} · {f['title']}", '', '**Condição:** ' + f['preconditions'], '',
              '**Cadeia:** ' + f['consumer_chain'], '', '**Comportamento:** ' + f['observed_behavior'], '',
              '**Efeito:** ' + f['impact'], '', '**Aceite proposto:** ' + ' '.join(f['acceptance_criteria']), '',
              '**Limites:** ' + f['limitations'], '', '**Evidências:** ' + '; '.join(
                  f"[{e['path']}:{e['line_start']}–{e['line_end']}]({e['url']})" for e in f['evidence']) + '.', '',
              '**Probes:** ' + (', '.join(f['probes']) if f['probes'] else 'Leitura estática; sem probe dinâmico.') + '.', '']
lines += ['## Observações e falsos positivos evitados', '']
for item in adjudications:
    lines += ['- **' + item['candidate'] + '** — ' + item['basis']]
if manual['batches']:
    lines += ['', '## Passagens adicionais de corpos integrais', '']
    for batch in manual['batches']:
        lines += ['### ' + batch['id'], '', batch['assessment'], '',
                  'Arquivos: ' + ', '.join('`' + path + '`' for path in batch['files']) + '.', '']
(OUT / 'report.md').write_text('\n'.join(lines) + '\n')
print(json.dumps(dict(findings=len(findings), whole_files=len(full), coverage_entries=len(coverage))))
