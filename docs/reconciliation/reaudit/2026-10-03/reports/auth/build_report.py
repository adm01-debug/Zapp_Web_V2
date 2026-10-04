from pathlib import Path
import hashlib,json,collections,datetime
BASE=Path('/workspace/scratch/f8f9b9cbce53/reaudit')
SRC=BASE/'source';OUT=BASE/'reports/auth';HEAD='da307ba5626dce892f0b37cb6762463f55d14a96'
findings=[]
def blob(path):
 b=(SRC/path).read_bytes();return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def ev(path,start,end,symbol,note=''):
 n=len((SRC/path).read_text().splitlines());assert 1<=start<=end<=n,(path,start,end,n)
 return {'path':path,'start_line':start,'end_line':end,'blob_sha':blob(path),'symbol':symbol,'observation':note}
def add(n,title,sev,flow,precondition,failure,evidence,acceptance,probes=None,prior=None,features=None,limits=None):
 findings.append({'id':f'R2-AUTH-{n:03d}','title':title,'severity':sev,'priority':'P1' if sev=='high' else 'P2','status':'CONFIRMED_OFFLINE' if probes else ('REFINED_PRIOR' if prior else 'CONFIRMED_STATIC'),'source_head':HEAD,'consumer_flow':flow,'precondition':precondition,'failure_and_effect':failure,'evidence':evidence,'offline_probes':probes or [],'prior_comparison':{'kind':'refines_existing' if prior else 'new_not_in_previous_104','ids':prior or [],'assessment':'Amplia a evidência do achado anterior sem contá-lo novamente como defeito independente.' if prior else 'Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.'},'feature_claim_ids':features or [],'acceptance_criteria':acceptance,'limitations':limits or ['Conclusão da fonte fixada; não atesta comportamento de uma implantação ou banco vivo.']})
add(1,'WebAuthn aceita verificação sem assinatura, authenticatorData ou validação de origem','high',
 'Auth/useAuthForm → useWebAuthn.authenticateWithPasskey → webauthn(authentication-options, verify-authentication) → service client lê credencial, incrementa contador e retorna identidade.',
 'Uma credencial cadastrada e um challenge conhecido para a conta; authentication-options devolve o challenge e IDs de credencial quando encontra o email.',
 'verify-authentication só compara clientData.type e challenge. Não verifica signature, authenticatorData, RP ID hash, origin, flags UP/UV nem contador assinado. O challenge não é filtrado por expires_at. A prova offline retornou200/success com origem errada, nenhum dado de assinatura e challenge vencido. A inscrição também grava attestationObject como public_key sem extrair/verificar a chave. A resposta inclui userId/email e consome challenge; não emite uma sessão Auth.',
 [ev('supabase/functions/webauthn/index.ts',97,128,'verify-registration'),ev('supabase/functions/webauthn/index.ts',131,181,'authentication-options / verify-authentication'),ev('supabase/functions/_shared/schemas.ts',338,345,'WebAuthnActionSchema')],
 ['Verificar criação e assertions com uma implementação WebAuthn que valide desafio, expiração, origem/RP, assinatura, UP/UV e contador conforme a política escolhida.','Rejeitar falta/alteração de signature e authenticatorData, origem ou RP errados, challenge expirado/reutilizado; provar que nenhum caso altera contador ou autentica.','Vincular desafio a tentativa/conta e consumir de forma atômica apenas após prova válida.'],['P-AUTH-01'],features=['1.10','24.5'],limits=['O probe executa o handler real transpilado com DB/CORS/entrada de schema sintéticos. Não é exploração de banco vivo.','Não classificado como tomada de sessão: o endpoint não retorna tokens, e o handoff quebrado está em R2-AUTH-002.'])
add(2,'Login com passkey anuncia autenticação mas somente inicia OTP por email','high',
 'Auth → handlePasskeyLogin → authenticateWithPasskey → signInWithOtp → toast de autenticado → navigate(/) → ProtectedRoute.',
 'Usuário sem sessão que conclui a etapa WebAuthn; SDK aceita o envio do OTP.',
 'signInWithOtp envia o mecanismo de login por email, mas o código não verifica OTP nem recebe/aplica sessão. Mesmo com sucesso do endpoint WebAuthn a página anuncia Autenticado com Passkey e navega para uma rota que volta a /auth. Há falhas adicionais do mesmo fluxo: sem email, authentication-options grava challenge com user_id null, enquanto a verificação procura pelo user_id da credencial; listUsers sem paginação torna a resolução por email incompleta para contas fora da primeira página.',
 [ev('src/hooks/auth/useAuthForm.ts',189,202,'handlePasskeyLogin'),ev('src/hooks/auth/useWebAuthn.ts',109,157,'authenticateWithPasskey'),ev('supabase/functions/webauthn/index.ts',131,181,'passkey challenge / identity response'),ev('src/components/auth/ProtectedRoute.tsx',113,118,'guard de sessão')],
 ['Uma assertion válida deve concluir um fluxo de sessão realmente suportado e produzir usuário/sessão antes de anunciar login.','Testar login sem sessão, sem email, conta além da primeira página de usuários, cancelamento e retorno; exigir chegada ao app sem login adicional não anunciado.','Se houver continuação por email, mostrar explicitamente esse estado em vez de autenticação concluída.'],features=['1.10','24.5'],limits=['A semântica de signInWithOtp foi conferida na documentação oficial Supabase.','Não executado biométrico em navegador nem envio de email.'])
add(3,'MFA no login está fora da cadeia de autorização das rotas','high',
 'Login senha/SSO → AuthProvider user → AuthForm navega / → ProtectedRoute checa user/papel/permissão; /2fa é uma rota independente.',
 'Conta com fator TOTP verificado e sessão aal1 antes do desafio adicional.',
 'Não existe decisão AAL em ProtectedRoute, AppRoutes ou no redirecionamento do login. TwoFactorAuth só inicia verificação se o usuário visitar a rota. O inventário SQL do agente de banco não encontrou cláusula AAL nas779 migrations ativas. Assim a UI e a cadeia analisada não exigem segundo fator para acessar o app, apesar de existir enrollment e tela funcional de desafio. A própria rota fica indefinidamente em Verificando para usuário sem sessão/sem fator ou erro de assurance.',
 [ev('src/hooks/auth/useAuthForm.ts',53,57,'redirect após user'),ev('src/components/auth/ProtectedRoute.tsx',17,141,'ProtectedRoute'),ev('src/routes/AppRoutes.tsx',28,113,'rotas auth/2fa/admin'),ev('src/pages/TwoFactorAuth.tsx',17,50,'checkMFAStatus')],
 ['Aplicar decisão de currentLevel/nextLevel antes da autorização do conteúdo protegido.','Reforçar os recursos sensíveis na autorização server-side/RLS conforme política MFA, além do redirecionamento.','Com fator verificado, senha/SSO aal1 e URL direta devem exigir desafio; aal2 deve entrar; ausência de usuário/fator/erro deve ter estado explícito.'],features=['1.7','1.8','1.9','1.11'],limits=['Ausência de AAL em SQL baseada na cadeia da fonte, corroborada pelo agente SQL; não houve consulta ao dashboard Auth implantado.','1.20 SSO tem implementação de callback; o problema é o gate posterior de MFA, não a inexistência de SSO.'])
add(4,'Desativar usuário, forçar logout e encerrar dispositivos não revogam sessões Auth','high',
 'AdminUsersTable → ForceLogoutButton/useAdminData; Segurança → useDeviceDetection → profiles ou public.user_sessions.',
 'Usuário com sessão ou credenciais válidas que o administrador tenta desativar/desconectar.',
 'Forçar logout só atualiza profiles.session_invalidated_at, campo sem leitor na fonte/SQL. Desativar altera is_active, mas auth-login e as guardas de entrada não o validam e o predicado is_contact_visible_to_user não o consulta. Há proteções em operações específicas, por exemplo envio/fechamento atômico e guards TalkX que exigem perfil ativo; o achado não afirma autorização universal após desativação. Encerrar sessões só marca public.user_sessions.is_active=false; não há vínculo com auth.sessions, revogação de refresh token ou validação desse registro. detect-new-device insere uma sessão pública nova a cada chamada, sem chave da sessão Auth, e só é chamado nas telas de segurança. As confirmações descrevem efeitos de segurança que esses writes não realizam.',
 [ev('src/components/admin/ForceLogoutButton.tsx',26,61,'handleForceLogout e promessa UI'),ev('src/components/admin/useAdminData.ts',115,126,'handleToggleActive'),ev('src/hooks/ui/useDeviceDetection.ts',174,227,'removeDevice/endSession/endAllOtherSessions'),ev('supabase/functions/detect-new-device/index.ts',140,169,'registro de user_sessions'),ev('supabase/functions/auth-login/index.ts',72,116,'login sem is_active/session_invalidated_at')],
 ['Definir e implementar revogação real para logout forçado, término de sessão/dispositivo e desativação de conta.','Vincular inventário de dispositivos à sessão Auth que ele pretende encerrar; evitar duplicação por visita à tela.','Validar duas sessões independentes: após a ação, sessão alvo não renova/acessa recursos conforme o prazo garantido; desativado não inicia nova sessão; sessão preservada continua.'],features=['1.11'],limits=['SQL peer confirmou: session_invalidated_at só ADD COLUMN; user_sessions não consulta auth.sessions; is_contact_visible_to_user não verifica is_active. As RPCs de mensagem/fechamento em 20260909220000 linhas203 e541, entre outras, exigem perfil ativo.','Não se presume que revogar um refresh token revogue instantaneamente todo JWT já emitido; o aceite deve definir o mecanismo/prazo real.'])
add(5,'Resposta atrasada de perfil repõe identidade antiga após logout ou troca de usuário','medium',
 'AuthProvider.onAuthStateChange / refreshProfile → fetchProfile(userId) → setProfile; consumidores usam profile.id/nome para Team Chat e Contatos.',
 'Uma consulta de perfil em andamento durante SIGNED_OUT, novo SIGNED_IN ou atualização concorrente.',
 'fetchProfile guarda apenas um booleano; não confere identidade vigente ou geração ao resolver. O listener libera o booleano a cada sessão e permite consultas concorrentes. O finally do logout limpa profile, porém uma consulta anterior pode escrever depois dessa limpeza; uma resposta A pode sobrescrever a resposta B. Os dois ordenamentos foram reproduzidos na closure real.',
 [ev('src/hooks/auth/useAuth.tsx',36,47,'fetchProfile'),ev('src/hooks/auth/useAuth.tsx',89,118,'onAuthStateChange'),ev('src/hooks/auth/useAuth.tsx',148,181,'refreshProfile/signOut')],
 ['Vincular cada resposta de perfil à geração de sessão e userId atuais; descartar resultados de gerações encerradas.','Invalidar/cancelar consultas de perfil no logout e na troca de usuário e zerar perfil ao iniciar identidade diferente.','Provar duas ordens de resolução A/B e conclusão tardia após logout, sem reaparecer perfil anterior.'],['P-AUTH-02'],limits=['Probe da closure real com promises controladas; transições de sessão simulam pontos de corte do listener, sem renderização React completa.','Não afirma bypass de RLS: a falha confirmada é a identidade incorreta no estado do cliente.'])
add(6,'Recuperação anônima consulta profiles protegido e não cria solicitação','high',
 '/forgot-password → SELECT profiles(user_id) por email → retorno genérico sem insert.',
 'Pessoa desconectada tentando recuperar sua conta, o caso normal desta página.',
 'As policies SELECT atuais de profiles exigem authenticated e permitem próprio usuário/admin/supervisor. Sem sessão, a consulta não retorna a conta. ForgotPassword ignora userError e, quando existingUser é vazio, apresenta sucesso genérico antes do INSERT password_reset_requests. A não enumeração de emails é correta como aparência, mas o pedido real nunca é entregue ao administrador.',
 [ev('src/pages/ForgotPassword.tsx',37,68,'handleSubmit'),ev('supabase/migrations/20260401000858_6852f3b3-5f4c-4ac5-9c20-875771a25e42.sql',1,1,'placeholder')] if False else [ev('src/pages/ForgotPassword.tsx',37,68,'handleSubmit')],
 ['Mover o registro do pedido para uma fronteira server-side anônima controlada que faça lookup sem expor existência e persista pedido válido.','Manter mesma resposta pública para email existente/inexistente; separar falha de infraestrutura de pedido persistido.','Verificar anon existente: uma solicitação pendente aparece ao revisor; anon inexistente não enumera; duplicatas/rate limit tratados.'],features=['1.4','1.23'],limits=['Policies exatas: migration com prefixo20260401000858 linhas6–12; remoção da policy de equipe no prefixo20260401001655 linha3. Pins SQL anexados em cross_domain_evidence.','Sem teste anônimo em banco vivo.'])
add(7,'Aprovar recuperação gera link que a UI descarta e anuncia email não enviado','high',
 'PasswordResetRequestsPanel.handleApprove → approve-password-reset → auth.admin.generateLink → resposta resetLink → UI ignora data.',
 'Uma solicitação pendente existente e revisor autorizado.',
 'A Edge gera action_link, marca a solicitação approved e devolve o link. Não há envio de email. O consumidor extrai somente error e informa Email de reset enviado. Mesmo contornando o bloqueio da etapa anterior, o usuário não recebe o link por esse fluxo. A checagem pending e update também são separados, sem compare-and-swap, permitindo decisões concorrentes sobre o mesmo pedido.',
 [ev('supabase/functions/approve-password-reset/index.ts',39,104,'leitura/aprovação/generateLink'),ev('src/components/security/PasswordResetRequestsPanel.tsx',51,60,'handleApprove')],
 ['Gerar e entregar o mecanismo de recuperação ao destinatário por transporte verificável; status sent somente após aceite do envio.','Não expor link ao revisor se não for parte do fluxo autorizado; a UI deve refletir queued/sent/failed e permitir retry seguro.','Condicionar decisão ao estado pending de forma atômica e testar aprovar/rejeitar concorrentes sem múltiplas decisões contraditórias.'],features=['1.4','1.23'],limits=['generateLink é geração de link para transporte próprio conforme documentação oficial, não disparo de email.','Nenhum email enviado e nenhum link de recuperação real coletado.'])
add(8,'Troca de papel apaga privilégios antes de confirmar a nova atribuição','high',
 'AdminUsersTable seletor de role → useAdminData.handleRoleChange → DELETE user_roles → INSERT.',
 'Administrador muda papel; o DELETE conclui e o INSERT falha, ou o DELETE falha silenciosamente.',
 'A substituição usa dois requests não transacionais. Falha no INSERT deixa o usuário sem qualquer role; falha no DELETE é ignorada e o INSERT pode somar papéis ao antigo. O probe preservou exatamente o caminho real e mostrou admin→[] quando a inserção falha. Um operador pode inclusive retirar seu próprio acesso administrativo.',
 [ev('src/components/admin/useAdminData.ts',104,113,'handleRoleChange'),ev('src/components/admin/AdminUsersTable.tsx',1,115,'seletor consumidor')],
 ['Substituir papel por operação server-side atômica com autorização e proteção de último administrador conforme regra de negócio.','Erro de qualquer etapa deve manter atribuição anterior e ser refletido na UI.','Validar falha/inserção concorrente e múltiplos papéis sem estados intermediários destrutivos.'],['P-AUTH-05'],features=['1.12','1.13'])
add(9,'Matriz anuncia permissão removida mesmo quando a revogação retorna erro','high',
 'PermissionMatrix.handleToggle → usePermissions.removePermissionFromRole/addPermissionToRole → PostgREST → toast.',
 'Falha explícita da escrita de role_permissions, por ACL, constraint ou serviço.',
 'O hook retorna false em error e não lança. A matriz ignora o booleano e sempre mostra Permissão removida/adicionada. Probe com42501 retornou sucesso visual e nenhum refetch. Além disso, escritas bem-sucedidas não invalidam user-roles/user-nav-permissions de consumidores; staleTime não funciona como polling e o QueryClient desliga refetch em foco/mount.',
 [ev('src/hooks/system/usePermissions.ts',119,141,'mutations retornam boolean'),ev('src/components/permissions/PermissionMatrix.tsx',54,72,'handleToggle'),ev('src/hooks/system/useUserRole.ts',1,74,'cache de papéis'),ev('src/lib/queryClient.ts',1,33,'políticas globais de cache')],
 ['Propagar erro de mutation ou exigir retorno true antes de anunciar sucesso; confirmar quantidade efetivamente alterada.','Invalidar/reconciliar permissões e papéis usados pela navegação após alteração e em mudanças remotas que o produto precise refletir.','Testar revogação403/42501 e falha transitória: permissão permanece visível com erro e nenhuma mensagem de removida.'],['P-AUTH-03'],features=['1.17','1.12'],limits=['Não classifica hasPermission do hook como bloqueio ativo de agentes: não foi encontrado consumidor ativo desse método genérico fora da matriz.','Backend pode continuar autorizando corretamente apesar do cache/UI incorretos.'])
add(10,'Rascunho e resposta do Team Chat atravessam conversas e permanecem entre contas','high',
 'TeamChatView troca conversation no mesmo TeamChatPanel → useTeamChatPanel mantém text/replyTo → TeamChatInputArea/useTeamChatDraft grava sob conversationId novo → send usa destino atual.',
 'Operador digita texto ou seleciona resposta em A e muda para B antes de enviar; outra conta pode usar o mesmo navegador e conversa depois.',
 'O painel é reutilizado sem key por conversa; efeito de troca não limpa texto/reply/edit. O hook só restaura B se text estiver vazio e grava o texto antigo sob a chave de B após500ms. As chaves team_draft_+conversationId não têm identidade e não são removidas no logout. Probe mostrou A sobrescrevendo rascunho B e outro profile restaurando A. Enviar em B usa conversationId B e conteúdo/reply pendentes de A.',
 [ev('src/components/team-chat/TeamChatView.tsx',35,54,'painel sem key por conversa'),ev('src/components/team-chat/useTeamChatPanel.ts',27,35,'estado de edição'),ev('src/components/team-chat/useTeamChatPanel.ts',116,124,'reset incompleto por conversationId'),ev('src/components/team-chat/useTeamChatPanel.ts',190,206,'send atual'),ev('src/hooks/chat/useTeamChatDraft.ts',7,53,'chave/auto-save/restore'),ev('src/hooks/auth/useAuth.tsx',162,181,'limpeza de logout')],
 ['Escopar todo estado de composição e persistência por usuário e conversa; restaurar B independentemente do conteúdo prévio de A.','Zerar reply/edit/arquivo/recording ao mudar de destinatário ou remontar painel com identidade completa.','Provar troca A→B com ambos os rascunhos, resposta selecionada, envio e logout→outra conta, sem sobrescrita nem exposição.'],['P-AUTH-04'],limits=['Nova fronteira de identidade/destinatário; TC-010 anterior tratava perda após erro de envio, que permanece separado.','Sem envio real de mensagem; probe do hook com scheduler sintético e retenção do painel confirmada na fonte.'])
add(11,'Team Chat busca perfis de colegas por tabela proibida aos agentes','medium',
 'TeamChatView/lista → useTeamConversations embed profiles; painel colega → useTeamMemberDetails SELECT profiles.',
 'Usuário agent/special_agent, colega diferente e policy atual de profiles (próprio/admin/supervisor).',
 'A lista incorpora perfis diretamente da tabela protegida; dados do outro participante vêm null. DMs sem nome caem em Chat Direto e perdem avatar. O painel individual consulta nome/email/telefone/cargo/aniversário pelo mesmo caminho e fica sem perfil; grupo lista só o que a policy permite, podendo contar1 membro em grupo maior. Há RPC get_team_profiles para projeção controlada em outros consumidores, mas esses caminhos não a usam.',
 [ev('src/hooks/team-chat/useTeamConversations.ts',26,68,'embed e displayName fallback'),ev('src/hooks/team-chat/useTeamMemberDetails.ts',40,69,'consultas peer/group'),ev('src/components/team-chat/TeamMemberDetails.tsx',35,77,'render detalhes e count'),ev('src/hooks/crm/useTeamProfiles.ts',1,19,'projeção existente')],
 ['Usar projeção autorizada e mínima para participantes do Team Chat, sem abrir dados privados inteiros de profiles.','Testar agent→agent e group com múltiplos membros: nomes/avatar corretos, somente atributos autorizados, count fiel.','Distinguir perfil indisponível de erro de consulta.'],limits=['Cadeia e manifesto SQL confirmados pelo agente SQL: policy de membros ativos foi removida na migration20260401001655.','Não sugere afrouxar RLS genericamente nem afirma que agentes deveriam ver todos os dados pessoais do colega.'])
add(12,'Ações VIP, arquivar, bloquear e tags no detalhe do contato não persistem','medium',
 'ContactActionButtons menu Mais → ContactHeaderSection.onQuickAction → ContactDetails.handleQuickAction; ContactAccordionSections botões/tag X.',
 'Abrir detalhes do contato e selecionar ação visível do menu ou tags.',
 'VIP/archive/block só emitem undoToast; não chamam mutation, não alteram estado persistido e undo também só mostra toast. Os botões Adicionar tag/Adicionar e X de tags não têm handler. A UI declara contato bloqueado/arquivado mesmo com dado intacto, levando a decisões operacionais incorretas.',
 [ev('src/components/inbox/contact-details/ContactActionButtons.tsx',186,198,'menu alcançável'),ev('src/components/inbox/ContactDetails.tsx',67,91,'handleQuickAction'),ev('src/components/inbox/ContactDetails.tsx',125,136,'wiring consumidor'),ev('src/components/inbox/contact-details/ContactAccordionSections.tsx',74,77,'Adicionar tag sem handler'),ev('src/components/inbox/contact-details/ContactAccordionSections.tsx',163,190,'TagsContent')],
 ['Conectar cada ação ao contrato persistido com autorização e só confirmar após sucesso; undo deve reverter operação real.','Se a função ainda não existir, removê-la/desabilitá-la com estado honesto.','Reabrir contato após VIP/archive/block/tag e confirmar dado persistido e falhas explícitas.'],features=['2.5'])
add(13,'Mutations de Contatos ainda informam sucesso em erros ou lotes parciais','medium',
 'ContactsView → ContactBulkTagDialog/BulkActionsBar → SELECT/UPDATE contacts; edição avulsa via useContactsCRUD.',
 'Contato selecionado sem UPDATE permitido, seleção incluindo IDs invisíveis, falha de escrita ou perda de autorização entre leitura e update.',
 'ContactBulkTagDialog ignora todos os erros dos UPDATE e anuncia contactIds.length, inclusive IDs não lidos. BulkActionsBar.handleBulkTag ignora erros de leitura/escrita; leitura falha vira tags=[], podendo sobrescrever tags se a escrita subsequente passar. Atribuir/tipo/edição só verificam error sem quantidade, então zero/parte das linhas também anunciam sucesso total. DELETE já usa RPC e contagem corretamente; a correção não foi aplicada aos outros caminhos.',
 [ev('src/components/contacts/ContactBulkTagDialog.tsx',57,94,'handleApply'),ev('src/components/contacts/BulkActionsBar.tsx',78,144,'tag/assign/type'),ev('src/components/contacts/BulkActionsBar.tsx',146,177,'contraste interno: delete contabiliza'),ev('src/components/contacts/useContactsCRUD.ts',187,234,'handleEditContact')],
 ['Propagar erros SDK e obter quantidade/IDs efetivamente alterados; reportar sucesso parcial e manter seleção recusada.','Não fabricar tags vazias quando leitura falha; aplicar adição/remoção atômica para evitar lost update.','Testar lote com autorização mista, erro de SELECT, erro UPDATE e zero rows, preservando tags existentes e feedback fiel.'],['P-AUTH-06'],limits=['O item Atribuir do BulkActionsBar está sem availableAgents no consumidor ContactsView239–248; erro de contagem desse handler é latente nessa montagem. Tag, tipo e edição são alcançáveis.'])
add(14,'Menus de gerenciamento de agentes possuem opções clicáveis sem ação','medium',
 'AgentsView grid → menu de cada agente ou botão Filtrar.',
 'Página de agentes carregada e ação selecionada.',
 'Filtrar, Editar, Configurações e Desativar são renderizados sem onClick/onSelect. Não abrem diálogo, não mudam filtro, não invocam gerenciamento de conta. Há outra superfície Admin funcional para parte dessas operações, mas os controles oferecidos aqui não conduzem a ela.',
 [ev('src/components/agents/AgentsView.tsx',145,155,'Filtrar'),ev('src/components/agents/AgentsView.tsx',205,225,'menu agente')],
 ['Ligar ações à superfície canônica de gerenciamento com o agente escolhido ou apresentá-las como indisponíveis.','Validar cada opção com teclado/clique e verificar efeito real/autorização, inclusive desativação.'])
add(15,'Convite de agente não cria convite autenticável nem provisiona papel escolhido','medium',
 'AgentsView Novo agente → InviteAgentDialog.handleInvite → send-email.',
 'Operador seleciona papel admin/supervisor/agent e envia convite.',
 'O único efeito é email HTML com texto do papel. Não há convite Auth, token/URL de aceite, registro de atribuição pendente ou associação do papel ao email. O destinatário é instruído a criar conta, e o papel selecionado não é comunicado a nenhum contrato de provisionamento. O email pode ser enviado com sucesso, mas não conclui onboarding do papel anunciado.',
 [ev('src/components/agents/InviteAgentDialog.tsx',29,65,'handleInvite'),ev('src/components/agents/InviteAgentDialog.tsx',100,110,'papéis selecionáveis')],
 ['Definir fluxo de convite verificável, com destinatário, expiração, papel autorizado e consumo único.','Aplicar atribuição na aceitação server-side, jamais por confiar no texto/email ou metadata fornecida pelo convidado.','Testar convite para cada papel, email existente, novo, expirado e uso repetido; UI deve refletir estado de convite/aceite.'],limits=['Não afirma que o email não é enviado: o defeito é o provisionamento ausente e a promessa do papel.','send-email não foi executado.'])
add(16,'Criação de usuário retorna sucesso mesmo com role/perfil/contas auxiliares falhos','medium',
 'AdminView → useAdminData.handleCreateUser → create-user → Auth createUser → updates/inserts públicos →200.',
 'Criação Auth bem-sucedida e uma etapa posterior de role/perfil/conta auxiliar falha ou não afeta linha.',
 'Erros das atualizações role e perfil são ignorados; Gmail/serviços/Dropbox apenas logam erro. A Edge sempre responde success:true e UI fecha como criado. Uma conta existe com configuração diferente da solicitada, e repetir a operação esbarra em email já criado. A autorização do criador usa user_roles.single(), incompatível com administrador que tenha mais de uma role, apesar da modelagem por linhas.',
 [ev('supabase/functions/create-user/index.ts',35,44,'lookup single de papel'),ev('supabase/functions/create-user/index.ts',70,152,'provisionamento parcial'),ev('src/components/admin/useAdminData.ts',237,248,'sucesso pelo HTTP')],
 ['Verificar e persistir resultado de cada etapa obrigatória; tornar retry idempotente e retornar provisionamento parcial explícito quando não for possível transação com Auth.','Não sinalizar papel aplicado sem linha confirmada; reconciliar/compensar falha de provisionamento.','Autorizar admin por existência do papel, com caso multi-role coberto.'])
add(17,'Gestão de grupo e recursos novos de Team Chat permanecem sem consumidor','medium',
 'TeamChatView → TeamChatPanel → TeamChatHeader; estados/mutations do hook e diálogos exportados não são ligados ao painel.',
 'Uso da view de produção e intenção de renomear/sair/transferir/gerenciar grupo ou departamentos.',
 'Além da gestão de departamento já apontada em TC-005 e da paginação/reação em TC-006, o painel não passa callbacks de rename/leave/transfer para header nem monta GroupManagementDialog/TransferConversationDialog/TeamPerformancePanel. Componentes e hooks não equivalem a operação disponível. GroupManagementDialog ainda trata membership.id como profile.id, mas esse bug foi mantido somente como bloqueio de integração porque o componente não está alcançável.',
 [ev('src/components/team-chat/TeamChatPanel.tsx',1,156,'imports e props do header'),ev('src/components/team-chat/TeamChatView.tsx',29,55,'props para lista e painel'),ev('src/components/team-chat/useTeamChatPanel.ts',116,124,'estados de gestão'),ev('src/components/team-chat/GroupManagementDialog.tsx',60,70,'shape dormente'),ev('src/components/team-chat/GroupManagementDialog.tsx',155,167,'ID dormente')],
 ['Concluir ligação dos recursos aceitos ao consumidor real; não encerrar tarefa apenas por existir hook/componente.','Corrigir shape membership/profile e contratos SQL antes de ativar diálogos.','Provar as ações de grupo e departamentos a partir da view normal, com gestão/recusa de usuário sem papel.'],prior=['TC-005','TC-006'],limits=['Refinamento do grupo de achados anteriores, não novo achado de exploração.','Bugs em código sem consumidor não foram contados como falha ativa.'])
add(18,'Inteligência CRM aceita pessoa externa diferente do vínculo estável','high',
 'ContactAccordionSections → ContactIntelligencePanel → useContactIntelligence → crm-integration(contactLookup,intelligence) → RPC externa por telefone.',
 'Contato canônico visível vinculado a external-A; o mesmo telefone no CRM externo passa a resolver external-B, sem mudar o telefone canônico.',
 'A Edge lê o vínculo estável, mas compara external_contact_id apenas no lookup360. Para intelligence, aceita result.contact_id diferente e entrega briefing/rapport/interações de outra pessoa sob o contato atual. O probe do handler real retornou409 para360 e200 para intelligence com o mesmo vínculo A e resultado B. O caminho batch também só compara normalized_phone e não carrega external_contact_id, deixando logos/empresa do número reciclado sem prova de identidade.',
 [ev('supabase/functions/crm-integration/index.ts',568,589,'contactLookup'),ev('supabase/functions/crm-integration/index.ts',590,617,'contactLookupBatch'),ev('src/hooks/crm/useContactIntelligence.ts',79,108,'contact_id e consumidor'),ev('src/components/inbox/contact-details/ContactAccordionSections.tsx',95,103,'painel alcançável')],
 ['Resolver leituras pelo vínculo estável ou conferir identidade retornada em todas as projeções, incluindo intelligence e batch.','Em divergência, retornar conflito/estado de reverificação sem exibir dado de outra pessoa.','Reproduzir telefone reciclado, vínculo alterado e ausência de vínculo; confirmar que360/intelligence/batch compartilham a mesma autoridade de identidade.'],['P-AUTH-07'],limits=['External RPC/DB sintéticos, sem provar que já ocorreu reatribuição no Singu real.','Authorization do contato canônico está presente; defeito é a identidade externa que ele autoriza a projetar.'])
add(19,'Edição de empresa/contato no CRM externo aceita zero linhas como sucesso','medium',
 'CRM360ExplorerView → CompanyFormDialog/ContactFormDialog → useExternalMutation → crm-integration mutate update → select result.',
 'Empresa/contato removido ou ID que não existe mais entre abertura do form e update.',
 'O gateway transforma retorno vazio em data=[] com200; hook retorna o array e forms ignoram seu conteúdo, anunciam atualizado e fecham. Não há verificação de uma linha efetivamente gravada nem reconciliação de conflito. A invalidação só cobre external-db/tabela, deixando projeções360/intelligence/batch existentes com valores antigos após edição bem-sucedida.',
 [ev('supabase/functions/crm-integration/index.ts',676,687,'mutate'),ev('src/hooks/integrations/useExternalDB.ts',138,159,'useExternalMutation'),ev('src/components/crm360/CompanyFormDialog.tsx',94,115,'handleSubmit'),ev('src/components/crm360/ContactFormDialog.tsx',105,125,'handleSubmit')],
 ['Exigir exatamente uma linha alterada para update de ID único e informar404/conflito sem fechar form quando zero.','Definir controle de versão para edição concorrente e invalidar projeções360/intelligence/batch impactadas.','Verificar remoção entre read/update e edição de empresa vinculada em aba separada.'])
add(20,'Capacidade de agentes conta todos os contatos atribuídos como chats ativos','medium',
 'useAgents agents-active-chats → COUNT client-side por assigned_to → AgentsView capacidade/chats e totalActiveChats.',
 'Existem contatos atribuídos com conversa encerrada, histórico antigo ou volume acima do limite de resposta da API.',
 'A consulta não filtra estado da conversa e conta cada contato atribuído como ativo. A capacidade exibida cresce com o histórico mesmo sem atendimento aberto; a consulta não pagina/agrega no servidor, então volumes maiores também truncam contagem. Loading dos chats não compõe isLoading e falhas podem se apresentar como0. A presença tem fallback por profiles.updated_at, que é atualização de cadastro, não evento de login.',
 [ev('src/hooks/crm/useAgents.ts',75,142,'activeChats e stats'),ev('src/components/agents/AgentsView.tsx',167,168,'capacityPercent'),ev('src/components/agents/AgentsView.tsx',228,244,'exibição de chats ativos')],
 ['Contar o conjunto canônico de atendimentos ativos no servidor com o filtro de status correto e sem limite de paginação implícito.','Separar erro/loading/ausência de dado de zero; não estimar presença por edição de perfil.','Conferir0 abertos com histórico atribuído, abertos/encerrados mistos e volume maior que uma página.'],limits=['Não afirma que o algoritmo de distribuição do banco usa esta estatística; o defeito confirmado é na UI/estatística de agentes.'])
add(21,'Indisponibilidade do Auth é registrada como tentativa de senha incorreta','medium',
 'AuthService.signIn → auth-login → GoTrue signInWithPassword retorna erro503 → record_failed_login →401 → cliente trata credenciais inválidas.',
 'GoTrue retorna erro operacional/retryable em vez de uma recusa de credenciais.',
 'Qualquer signInError entra no mesmo ramo de senha inválida. O handler registra tentativa e responde401, ocultando503/rede e podendo levar usuários legítimos ao lockout ao repetir durante incidente. Probe com upstream503 chamou record_failed_login e retornou Invalid login credentials. Isso contradiz a distinção disponibilidade/credenciais que o cliente pretende manter no ADR-006.',
 [ev('supabase/functions/auth-login/index.ts',83,99,'classificação de falha Auth'),ev('src/lib/serverLogin.ts',96,121,'interpretação de resposta'),ev('docs/adr/ADR-006-login-lockout-server-side.md',56,58,'distinção declarada')],
 ['Registrar tentativa somente para códigos comprovadamente relativos a credenciais; propagar falhas de rede/5xx/rate limit como indisponibilidade com retry adequado.','Não alterar login_attempts por outage do provedor.','Testar credencial inválida,503,429 e falha de transporte garantindo categoria/status e contador corretos.'],['P-AUTH-08'],features=['1.19'],limits=['Não reabre bypass direto GoTrue: esse limite residual já é explícito e aceito no ADR-00679–85.','Nenhuma conta real foi bloqueada.'])
# Cross-domain SQL evidence pins: discovered from prefixes; no database execution.
cross=[]
for prefix,ranges in [('20260401000858',[(1,26,'SELECT profiles próprio/admin/supervisor e política de equipe transitória')]),('20260401001655',[(1,5,'remove política de equipe')]),('20260315193759',[(33,40,'adiciona session_invalidated_at')]),('20260909200000',[(1,84,'predicado canônico de visibilidade')]),('20260830080000',[(25,75,'role_permissions políticas e RPC designada')])]:
 matches=list((SRC/'supabase/migrations').glob(prefix+'*.sql'))
 if matches:
  p=matches[0];n=len(p.read_text().splitlines())
  for a,b,note in ranges:
   cross.append(ev(str(p.relative_to(SRC)),a,min(b,n),note))
for f in findings:
 if f['id'] in ['R2-AUTH-006','R2-AUTH-011']:
  f['evidence']+= [e for e in cross if '2026040100' in e['path']]
 if f['id']=='R2-AUTH-004':f['evidence'] += [e for e in cross if '20260315193759' in e['path'] or '20260909200000' in e['path']]
external=[
 {'url':'https://www.w3.org/TR/webauthn-2/','purpose':'Requisitos de validação de assertion/origin/RP/signature e contador, R2-AUTH-001','retrieval_ref':'turn23view3'},
 {'url':'https://supabase.com/docs/reference/javascript/auth-signinwithotp','purpose':'Envio de OTP/magic link é etapa de início, R2-AUTH-002','retrieval_ref':'turn23view2'},
 {'url':'https://supabase.com/docs/reference/javascript/auth-admin-generatelink','purpose':'generateLink gera dados/link para envio próprio, R2-AUTH-007','retrieval_ref':'turn23view1'},
 {'url':'https://supabase.com/docs/guides/auth/auth-mfa','purpose':'AAL e enforcement de MFA, R2-AUTH-003','retrieval_ref':'turn18view2'},
 {'url':'https://supabase.com/docs/guides/realtime/authorization','purpose':'Validação de suspeita em hooks dormentes; não usada para contar exposição ativa','retrieval_ref':'turn23view0'},
 {'url':'https://supabase.com/changelog','purpose':'Changelog obrigatório do skill Supabase, consultado antes de recomendações','retrieval_ref':'turn18view3'}]
rejected=[
 {'id':'D-AUTH-01','paths':['src/hooks/team-chat/useTeamPresence.ts','src/hooks/team-chat/useTeamTyping.ts'],'status':'INTEGRATION_PENDING','reason':'Hooks públicos sem private:true, mas zero importação/chamada de produção encontrada. Não classificar exposição ativa. Se ativados, validar membership no canal privado e identidade de payload.'},
 {'id':'D-AUTH-02','paths':['src/components/inbox/CRMAutoSync.tsx'],'status':'NO_ACTIVE_CONSUMER','reason':'CRMSyncButton retém contactNotFound/lastSyncTime e score0 por truthiness, porém somente export/definição foi encontrada. Header usa CrmSyncMenuItem em ContactActionButtons. Não incluir como bug do botão atual.'},
 {'id':'D-AUTH-03','paths':['src/hooks/crm/useContactSidebar.ts','src/services/crm/external-crm.service.ts','src/types/contactSidebar.ts'],'status':'INTEGRATION_PENDING','reason':'lookup:sidebar não é aceito pelo gateway360/intelligence; hook não tem consumidor UI de produção. DTO/hook/testes existem, não integração atual concluída.'},
 {'id':'D-AUTH-04','paths':['src/components/mfa/MFABackupCodes.tsx'],'status':'INTEGRATION_PENDING','reason':'Códigos gerados localmente sem persistência/redeemer, mas componente não aparece em fluxo MFA de produção. Não afirmar que usuário recebe códigos inválidos atualmente.'},
 {'id':'D-AUTH-05','paths':['src/components/team-chat/GroupManagementDialog.tsx','src/components/team-chat/TransferConversationDialog.tsx','src/hooks/team-chat/useTeamUnreadCount.ts','src/hooks/team-chat/useTeamPerformance.ts'],'status':'INTEGRATION_PENDING','reason':'Há shape/ID incorreto em GroupManagementDialog e transferência só atualiza created_by; ausência de consumidor impede classificar operação ativa. Integração de gestão é refinamentoTC005/006.'},
 {'id':'D-AUTH-06','paths':['src/hooks/auth/useSecureProfile.ts','src/hooks/system/usePermissions.ts'],'status':'NO_ACTIVE_CONSUMER_FOR_SUSPECT_SYMBOL','reason':'useSecureProfile não consumido em produção; hasPermission genérico do hook usePermissions também não é autorização efetiva do app. Não atribuir falha ao consumidor que usa RoleService/RPC.'},
 {'id':'D-AUTH-07','paths':['src/components/auth/ProtectedRoute.tsx'],'status':'NO_ACTIVE_CONSUMER_FOR_SUSPECT_SYMBOL','reason':'Promise de requiredPermission não cancela resposta antiga apesar do reset de estado; rotas atuais usam requiredRoles, e não foi encontrado uso ativo de withPermission. Navegação atual usa consultas escopadas. Mantido como revisão futura.'},
 {'id':'D-AUTH-08','paths':['src/hooks/crm/useContactCustomFields.ts'],'status':'LIMITED_CONSUMER_REVIEW','reason':'Estado/fetch não reinicia por contato. Consumidores atuais encontrados são amostra do TalkXWizard, não editor/sidebar; uso só leitura. Transferido ao escopo TalkX sem alegar alteração do contato errado.'},
 {'id':'D-AUTH-09','paths':['docs/adr/ADR-006-login-lockout-server-side.md'],'status':'ACCEPTED_EXISTING_LIMIT','reason':'Acesso direto ao password grant GoTrue é limite explicitamente aceito79–85. Não reaberto como achado novo. Cliente oficial efetivamente usa auth-login fail-closed.'},
 {'id':'D-AUTH-10','paths':['src/components/inbox/contact-details/ExternalContact360Panel.tsx','src/services/crm/external-crm.service.ts'],'status':'DESIGN_REQUIREMENT_PRESERVED','reason':'Ocultar erro/offline do painel360 atende tarefa1.4 do prompt antigo; não transformar retorno null nesse painel em novo defeito sem requisito mais recente.'}
]
prior=[
 {'ids':['TC-001'],'assessment':'Mantida evidência frontend de locators/payload de mídia; SQL/Storage final delegado ao agente banco. Não duplicada nos novos IDs.'},
 {'ids':['TC-002','TC-003','TC-004','TC-009'],'assessment':'Delegados para reassessment SQL/grants/RLS pelo agente banco; não encerrados por esta revisão UI.'},
 {'ids':['TC-005','TC-006'],'assessment':'Revalidada montagem/props/hooks e ampliada emR2-AUTH-017; não contar como novo defeito independente.'},
 {'ids':['TC-007'],'assessment':'Mute continua com consumidor user_settings versus writer members; notifications montadas na view. Sem sinal de eliminação no caminho revisado.'},
 {'ids':['TC-008'],'assessment':'Hook de departamento conserva contracts de audit/authUUID e tabela/RPC; entrada UI continua ausente. SQL final delegado.'},
 {'ids':['TC-010'],'assessment':'Envio continua limpando texto/reply antes de await. R2-AUTH-010 adiciona outro mecanismo: troca de destinatário/conta; não substitui a perda pós-falha.'},
 {'ids':['TC-011','TC-012','TC-013','TC-014','TC-015'],'assessment':'Histórico/qualidade de testes/scripts/quarentena preservado; não reexecutado como comprovação deste subescopo.'},
 {'ids':['SV-001','SV-002'],'assessment':'Sem evidência de correção: agregado comercial continua completed/approved; fetchStats estima resposta com200 primeiras mensagens. Não recontados.'},
 {'ids':['SV-003','SV-004','OTH-013','OTH-015'],'assessment':'Evidência visual/externa/histórica não substituída por leitura de código. Mantidas necessidades de aceite e reconciliação documental, sem novo runtime inventado.'}
]
plan_mapping=[
 {'source':'docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md','task':'T1','assessment':'Implementado na fonte, requisito visual antigo sujeito à sucessão','evidence':[ev('src/components/inbox/contact-details/ContactAccordionSections.tsx',95,98,'consumer'),ev('src/components/inbox/contact-details/ExternalContact360Panel.tsx',21,43,'loading/error/notfound')],'notes':'Hoje em Mais detalhes, gate runtime crm.integration; mover entre acordeões não reaberto. Contrato mudou de telefone para ID canônico via Edge.'},
 {'source':'docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md','task':'T2','assessment':'Fluxo integrado, aceite visual/externo não executado','evidence':[ev('src/components/contacts/ContactsView.tsx',175,176,'botão/gate'),ev('src/components/contacts/ContactsView.tsx',230,236,'dialog consumidor'),ev('src/components/contacts/ContactCRMDialog.tsx',16,60,'80vh/local lookup/import')],'notes':'AdvancedCRMSearch tem400ms debounce, Sheet/paginação e gate server-side. Importação é imediata no clique se não encontra local; não inventar6gaps. D5 do planoContatos100 linha184 exclui CRM daquele plano, mas HEAD atual passa props; depende da reconciliação de sucessão pelo root.'},
 {'source':'docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md','task':'T5','assessment':'Parcial demonstrável; vendedor no header não encontrado','evidence':[ev('src/components/inbox/contact-details/ContactHeaderSection.tsx',63,83,'CRM/VIP/tratamento'),ev('src/components/inbox/contact-details/ContactHeaderSection.tsx',146,168,'logo/tratamento'),ev('src/components/inbox/contact-details/ContactHeaderSection.tsx',199,203,'VIP')],'notes':'Logo, tratamento/apelido eVIP existem. Vendedor não aparece no header atual; não presumir requisito vigente sem sucessão design. BancoÚnico151 prevê ficha com vendedor. Root coordenaT3/T4/T6.'}
]
supp_path=OUT/'second-pass.json'
supp=json.loads(supp_path.read_text()) if supp_path.exists() else {}
external.extend(supp.get('external_sources', []))
findings += supp.get('new_findings', [])
for patch in supp.get('amendments', []):
 current=next(f for f in findings if f['id']==patch['id'])
 for field,items in patch.get('append',{}).items(): current[field]+=items
 for field,value in patch.get('set',{}).items(): current[field]=value
rejected += supp.get('rejected_or_pending', [])
meta={'source_head':HEAD,'source_root':str(SRC),'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Auth, users/roles/permissions, session/device, Team Chat/department UI/hooks, routes/admin, contacts/company/profile/sidebar, Singu gateway frontend contracts, delegated AI usage/admin, gamification UI/hooks and settings/notifications consumers','prior_findings_file':'/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation/FINDINGS.json','safety':{'source_modified':False,'live_database_queries':0,'product_scripts_executed':0,'messages_or_emails_sent':0,'secrets_read_or_exported':False},'probe_results':str(BASE/'probes/auth/results.json'),'probe_script':str(BASE/'probes/auth/source-probes.cjs'),'additional_probe_results':supp.get('probe_results',[]),'second_pass_file':str(supp_path),'findings':findings,'cross_domain_evidence':cross,'rejected_or_integration_pending':rejected,'prior_reassessment':prior,'plan_mapping':plan_mapping,'external_sources':external}
OUT.mkdir(parents=True,exist_ok=True);(OUT/'findings.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
# Coverage: actual semantic reads versus targeted reads versus inventory only.
semantic='''src/App.tsx
src/providers/AppProviders.tsx
src/hooks/auth/useAuth.tsx
src/hooks/auth/useAuthForm.ts
src/hooks/auth/useWebAuthn.ts
src/hooks/auth/useMFA.ts
src/hooks/auth/useReauthentication.ts
src/hooks/auth/useSecureProfile.ts
src/services/auth.service.ts
src/lib/serverLogin.ts
src/lib/queryClient.ts
src/components/auth/ProtectedRoute.tsx
src/routes/AppRoutes.tsx
src/pages/TwoFactorAuth.tsx
src/pages/SSOCallback.tsx
src/pages/ResetPassword.tsx
src/components/security/SecuritySettingsPanel.tsx
src/components/security/PasswordResetRequestsPanel.tsx
src/components/security/PasskeysPanel.tsx
src/components/mfa/MFAVerify.tsx
src/components/mfa/MFABackupCodes.tsx
src/hooks/ui/useDeviceDetection.ts
src/components/admin/useAdminData.ts
src/components/admin/AdminUsersTable.tsx
src/components/admin/ForceLogoutButton.tsx
src/pages/admin/useRolesPageState.ts
src/hooks/system/usePermissions.ts
src/hooks/system/useUserRole.ts
src/components/permissions/PermissionMatrix.tsx
src/services/navigation.service.ts
src/pages/ViewRouter.tsx
src/components/agents/AgentsView.tsx
src/components/agents/InviteAgentDialog.tsx
src/components/agents/ConfigurePermissionsDialog.tsx
src/hooks/crm/useAgents.ts
src/hooks/crm/useTeamProfiles.ts
src/hooks/crm/useAgentReassignment.ts
src/components/layout/ProfileMenuContent.tsx
src/components/team-chat/TeamChatView.tsx
src/components/team-chat/TeamChatPanel.tsx
src/components/team-chat/useTeamChatPanel.ts
src/components/team-chat/TeamChatInputArea.tsx
src/hooks/chat/useTeamChatDraft.ts
src/hooks/team-chat/useTeamChatMutations.ts
src/hooks/team-chat/useTeamMessages.ts
src/hooks/team-chat/useTeamConversations.ts
src/hooks/team-chat/useTeamMessageReactions.ts
src/hooks/team-chat/useDepartmentManagement.ts
src/hooks/team-chat/useTeamChatMembers.ts
src/hooks/team-chat/useActiveDepartments.ts
src/hooks/team-chat/useTeamMemberDetails.ts
src/hooks/team-chat/useTeamPresence.ts
src/hooks/team-chat/useTeamTyping.ts
src/hooks/team-chat/useTeamUnreadCount.ts
src/components/team-chat/TeamMemberDetails.tsx
src/components/team-chat/GroupManagementDialog.tsx
src/hooks/crm/useContactSidebar.ts
src/hooks/crm/useContactEnrichedData.ts
src/hooks/crm/useExternalContact360.ts
src/hooks/crm/useContactCrm360.ts
src/hooks/crm/useContactNotes.ts
src/hooks/crm/useContactAssignment.ts
src/hooks/crm/useContactCustomFields.ts
src/hooks/crm/useEmailContactContext.ts
src/hooks/crm/useContactIntelligence.ts
src/hooks/crm/useExternalContact360Batch.ts
src/hooks/crm/useAdvancedContactSearch.ts
src/services/crm/external-crm.service.ts
src/lib/crmIntegration.ts
src/hooks/integrations/useExternalDB.ts
src/components/crm360/CRM360ExplorerView.tsx
src/components/crm360/CompanyFormDialog.tsx
src/components/crm360/ContactFormDialog.tsx
src/services/contact.service.ts
src/components/contacts/contactPermissions.ts
src/components/contacts/useContactsCRUD.ts
src/components/contacts/useContactsViewState.ts
src/components/contacts/ContactDialogs.tsx
src/components/contacts/ContactBulkTagDialog.tsx
src/components/contacts/BulkActionsBar.tsx
src/components/contacts/ContactMergeDialog.tsx
src/components/contacts/ContactsView.tsx
src/components/contacts/ContactCRMDialog.tsx
src/components/contacts/AdvancedCRMSearch.tsx
src/components/inbox/ContactDetails.tsx
src/components/inbox/contact-details/ContactActionButtons.tsx
src/components/inbox/contact-details/ContactHeaderSection.tsx
src/components/inbox/contact-details/ContactAccordionSections.tsx
src/components/inbox/contact-details/ExternalContact360Panel.tsx
supabase/functions/auth-login/index.ts
supabase/functions/webauthn/index.ts
supabase/functions/approve-password-reset/index.ts
supabase/functions/detect-new-device/index.ts
supabase/functions/create-user/index.ts
supabase/functions/crm-integration/index.ts
supabase/functions/_shared/crm-integration-contract.ts
src/hooks/chat/useTeamChatNotifications.ts
docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md
docs/adr/ADR-006-login-lockout-server-side.md'''.splitlines()
# Conservative targeted status when any body portion was truncated / only path-specific reads.
targeted={
 'src/pages/ForgotPassword.tsx':[(1,110,'submission + success branch')],
 'src/components/security/SecurityView.tsx':[(1,140,'tabs/gates/MFA mounting')],
 'src/components/settings/SettingsView.tsx':[(1,140,'settings personal/staff surfaces'),(180,236,'staff gating')],
 'src/components/admin/AdminView.tsx':[(1,110,'wiring useAdminData/table')],
 'src/components/team-chat/TransferConversationDialog.tsx':[(1,90,'select members/transfer flow')],
 'src/components/team-chat/NewConversationDialog.tsx':[(61,200,'creation handlers and types')],
 'src/components/team-chat/TeamConversationList.tsx':[(1,185,'filters/consumer/member display')],
 'src/components/inbox/contact-details/ContactIntelligencePanel.tsx':[(1,190,'briefing/rapport/metrics')],
 'supabase/functions/_shared/schemas.ts':[(338,345,'WebAuthnActionSchema')],
 'docs/COMPLETE_SYSTEM_FEATURES.md':[(50,78,'claims1.1–1.23'),(495,505,'security claims')],
 'docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md':[(160,188,'D5/legacy/sucessão')],
 'docs/audits/PLANO_BANCO_UNICO_200_ETAPAS_2026-09-24.md':[(298,309,'tarefas149–151')],
}
for p,review in supp.get('reviewed_files',{}).items():
 if review['review_level']=='semantic':
  if p not in semantic: semantic.append(p)
  targeted.pop(p,None)
 else:
  targeted.setdefault(p,[]).extend((r['start_line'],r['end_line'],r['symbol']) for r in review['ranges'])
test_review_path=OUT/'test-review.json'
test_reviews={r['path']:r for r in json.loads(test_review_path.read_text())['files']} if test_review_path.exists() else {}
shell_review_path=OUT/'shell-review.json'
if shell_review_path.exists():
 for r in json.loads(shell_review_path.read_text())['files']:
  test_reviews[r['path']]=r
style_review_path=OUT/'style-review.json'
if style_review_path.exists():
 for r in json.loads(style_review_path.read_text())['files']:
  test_reviews[r['path']]=r
for p,r in test_reviews.items():
 if r['review_status']=='SEMANTIC_REVIEW_COMPLETE':
  if p not in semantic:semantic.append(p)
  targeted.pop(p,None)
 elif r['reviewed_ranges']:
  targeted.setdefault(p,[]).extend((a,b,'assertions, fixtures/mocks e contrato do consumidor; revisão parcial de teste') for a,b in r['reviewed_ranges'])
paths=set(semantic)|set(targeted)
for d in ['src/hooks/auth','src/components/auth','src/components/mfa','src/components/security','src/components/admin','src/components/agents','src/components/permissions','src/components/team-chat','src/hooks/team-chat','src/hooks/crm','src/components/contacts','src/components/crm360','src/components/inbox/contact-details','src/pages/admin','src/components/ai','src/components/gamification','src/hooks/gamification','src/components/settings','src/components/notifications','src/components/cognitive','src/components/compliance','src/components/leaderboard','src/components/calls']:
 paths.update(str(p.relative_to(SRC)) for p in (SRC/d).rglob('*') if p.is_file() and p.suffix in ['.ts','.tsx'])
for e in cross:paths.add(e['path'])
coverage=[]
for p in sorted(paths):
 if not (SRC/p).exists():continue
 n=len((SRC/p).read_text().splitlines());refs=[e for f in findings for e in f['evidence'] if e['path']==p]
 if p in semantic:
  level='semantic';ranges=[{'start_line':1,'end_line':n}];symbols=sorted({e['symbol'] for e in refs}) or ['corpo do módulo, imports, hooks/handlers e retornos lidos integralmente']
  gap='Sem execução real de UI/serviços; não equivale a certificação de todos os estados do módulo.'
 elif p in targeted:
  level='targeted';ranges=[{'start_line':a,'end_line':min(b,n)} for a,b,s in targeted[p] if a<=n];symbols=[s for a,b,s in targeted[p]]
  gap='Demais trechos só inventariados; ranges extensos não implicam QA visual nem execução.'
 elif any(e['path']==p for e in cross):
  level='targeted';ranges=[{'start_line':e['start_line'],'end_line':e['end_line']} for e in cross if e['path']==p];symbols=[e['symbol'] for e in cross if e['path']==p]
  gap='Cadeia SQL e grants/RLS finais são responsabilidade do relatório database; esta área usa os resultados coordenados.'
 else:
  level='structural';ranges=[];symbols=['inventário de caminho/tipo/hash; busca de consumidor quando indicado em rejeitados']
  gap='Corpo não revisado semanticamente nesta subárea; testes não executados. Não inferir cobertura funcional pela existência do arquivo.'
 if p in supp.get('reviewed_files',{}):
  symbols=supp['reviewed_files'][p]['symbols']
 if p in test_reviews and test_reviews[p]['reviewed_ranges']:
  symbols=test_reviews[p]['proves']+test_reviews[p]['mocks_and_fixtures']
  gap=('Revisão semântica de CSS, sem renderização ou certificação visual. ' if p.endswith('.css') else 'Revisão semântica do código de teste/script, sem execução. ')+' '.join(test_reviews[p]['limits'])
 coverage.append({'path':p,'blob_sha':blob(p),'line_count':n,'review_level':level,'reviewed_ranges':ranges,'symbols_or_slices_reviewed':symbols,'finding_ids':sorted({f['id'] for f in findings if any(e['path']==p for e in f['evidence'])}),'gaps':[gap]})
counts=collections.Counter(x['review_level'] for x in coverage)
cv={'source_head':HEAD,'definition':{'semantic':'Leitura humana do corpo completo e relação consumidor→efeito/contrato; não é teste E2E.','targeted':'Leitura humana apenas dos símbolos/faixas indicados.','structural':'Inventário/hash e, quando explicitado, busca de import/consumidor; não foi análise semântica.'},'counts':dict(counts),'files':coverage,'rejected_or_integration_pending_ids':[r['id'] for r in rejected],'remaining_microareas':['Arquivos structural permanecem sem leitura semântica nesta subárea: testes preexistentes, GmailWebhookMonitor e componentes de settings/notifications já atribuídos a outros agentes (IA/provedores/mídia/atalhos/SLA). A matriz consolidada reúne essas declarações independentes; este JSON lista cada caminho sem tomar emprestada uma leitura integral.','Nos arquivos targeted, apenas as faixas indicadas foram lidas; não se presume o corpo inteiro a partir de um trecho ou referência de outro agente.','MFA enrollment visual, dispositivos/alertas, SSO OAuth, entrega de recuperação e gamificação real: não houve E2E/browser externo. Os onze probes offline têm fronteiras sintéticas explícitas.','Formulários externos: integridade do schema Singu efetivo e contratos RPC externos continuam dependentes de evidência externa autorizada.','SQL final/RLS/grants, storage e last-owner/department RPCs: relatório database coordenado. Provedores, envio e TalkX são subáreas próprias; evidência compartilhada não substitui suas matrizes de cobertura.','Grafo AST local confirma conectividade de módulo, não uso de export específico; casos dormentes classificados por busca de símbolo/imports e leitura dos consumidores.'],'probe_ids':sorted({p for f in findings for p in f['offline_probes']})}
(OUT/'coverage.json').write_text(json.dumps(cv,ensure_ascii=False,indent=2)+'\n')
# Full human readable report derived from complete structured findings.
report=['# Reauditoria — Auth, usuários, Team Chat, Contatos, administração, IA, gamificação, configurações e chamadas','',f'Fonte fixada: `{HEAD}`. Relatório gerado em {meta["created_at"]}.','',
'## Resultado e alcance','',
f'Foram identificados {sum(not f["prior_comparison"]["ids"] for f in findings)} achados novos confirmados na fonte ({len(cv["probe_ids"])} mecanismos reproduzidos offline) e 1 refinamento de achados prévios. Os casos sem consumidor ativo ficam separados e não entram na contagem de falhas em produção. A gravidade descreve a falha de implementação e suas precondições; nenhum item afirma incidente ocorrido no ambiente real.','',
'Os maiores riscos são a verificação WebAuthn sem prova criptográfica, MFA sem gate efetivo, controles de revogação que só alteram tabelas públicas, recuperação de conta interrompida, rascunho entre destinatários e identidade externa trocada na inteligência CRM. Há ainda falhas de confirmação em permissões, roles e mutations e funções de gerenciamento visíveis sem implementação.','',
f'Não houve alteração na fonte, banco vivo, envio de mensagens/email, consulta de segredos ou execução de scripts do produto. Os {len(cv["probe_ids"])} probes executam código real transpilado/closures extraídas, com fronteiras sintéticas explicitamente descritas; não representam E2E nem certificação de RLS.','',
'## Inventário dos achados','', '| ID | Severidade | Status | Achado |','|---|---|---|---|']
for f in findings:report.append(f'| {f["id"]} | {f["severity"]} | {f["status"]} | {f["title"]} |')
report+=['','## Evidência por achado','']
for f in findings:
 report+=[f'### {f["id"]} — {f["title"]}','',f'**Severidade:** {f["severity"]} ({f["priority"]}). **Status:** {f["status"]}.','',f'**Consumidor → efeito:** {f["consumer_flow"]}','',f'**Precondição:** {f["precondition"]}','',f'**Falha e consequência:** {f["failure_and_effect"]}','', '**Evidências na fonte:**','']
 for e in f['evidence']:report.append(f'- `{e["path"]}:{e["start_line"]}–{e["end_line"]}` — {e["symbol"]}; blob `{e["blob_sha"]}`.')
 report+=['',f'**Comparação com os 104 anteriores:** {f["prior_comparison"]["assessment"]}'+(' IDs: '+', '.join(f['prior_comparison']['ids'])+'.' if f['prior_comparison']['ids'] else ''),'']
 if f['feature_claim_ids']:report += ['**Alegações documentais relacionadas:** '+', '.join(f['feature_claim_ids'])+' em COMPLETE_SYSTEM_FEATURES.md.','']
 if f['offline_probes']:report += ['**Reprodução:** '+', '.join(f['offline_probes'])+' em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).','']
 report+=['**Critérios de aceite para correção:**','']+[f'- {s}' for s in f['acceptance_criteria']]+['','**Limites:**','']+[f'- {s}' for s in f['limitations']]+['']
report+=['## Reavaliação dos achados anteriores','']
for p in prior:report.append('- **'+', '.join(p['ids'])+':** '+p['assessment'])
report+=['','## Casos não contabilizados: integrações, hipóteses rejeitadas e observações menores','', 'Estes itens não entram na contagem de achados materiais novos. O status distingue integração pendente, precondição não demonstrada, hipótese rejeitada e observação estática de baixo impacto. A presença de um hook/componente/teste, ou a conexão do arquivo em um grafo de módulos, não prova que a operação exista no fluxo do usuário.','']
for r in rejected:report.append(f'- **{r["id"]} — {r["status"]}:** {r["reason"]} Caminhos: '+', '.join('`'+p+'`' for p in r['paths'])+'.')
report+=['','## Reconciliação CRM360 e sucessão de planos','']
for p in plan_mapping:
 report += [f'### {p["task"]}: {p["assessment"]}','',p['notes'],'']
 for e in p['evidence']:report.append(f'- `{e["path"]}:{e["start_line"]}–{e["end_line"]}`; blob `{e["blob_sha"]}`.')
 report.append('')
report+=['## Cobertura e microáreas restantes','',f'O catálogo desta subárea contém {len(coverage)} arquivos: '+', '.join(f'{n} {k}' for k,n in sorted(counts.items()))+'. A enumeração de caminhos não é revisão semântica do repositório inteiro. `coverage.json` contém nível, faixas efetivamente lidas, símbolos, hash e gaps por arquivo.','']
report += ['- '+x for x in cv['remaining_microareas']]
report += ['','## Fontes primárias externas consultadas','', 'As fontes externas fundamentam semântica de APIs/protocolo. As conclusões específicas do projeto estão ancoradas nos blobs e faixas acima.','']
for s in external:report.append(f'- [{s["url"]}]({s["url"]}) — {s["purpose"]}.')
report+=['','## Artefatos de reprodução','',f'- Casos01–08: `{BASE / "probes/auth/results.json"}` e `source-probes.cjs`.',f'- Casos09–10: `{BASE / "probes/auth/second-pass-results.json"}` e `second-pass-probes.cjs`.',f'- Caso11: `{BASE / "probes/auth/gamification-results.json"}` e `gamification-probe.cjs`.','- README de probes documenta parâmetros por ambiente e preflight de HEAD/manifesto/blobs; os programas recusam fonte divergente antes de executar os trechos de produto.','- Arquivos de fonte são lidos em memória; os únicos writes ocorrem em relatórios/probes. Não há credenciais reais nos fixtures.','']
(OUT/'report.md').write_text('\n'.join(report))
print(json.dumps({'findings':len(findings),'new':sum(not f['prior_comparison']['ids'] for f in findings),'prior_refinements':sum(bool(f['prior_comparison']['ids']) for f in findings),'severity':dict(collections.Counter(f['severity'] for f in findings)),'coverage':dict(counts),'files':len(coverage),'output':str(OUT)},ensure_ascii=False))
