# Reauditoria — Auth, usuários, Team Chat, Contatos, administração, IA, gamificação, configurações e chamadas

Fonte fixada: `da307ba5626dce892f0b37cb6762463f55d14a96`. Relatório gerado em 2026-10-04T06:39:12.634048+00:00.

## Resultado e alcance

Foram identificados 52 achados novos confirmados na fonte (11 mecanismos reproduzidos offline) e 1 refinamento de achados prévios. Os casos sem consumidor ativo ficam separados e não entram na contagem de falhas em produção. A gravidade descreve a falha de implementação e suas precondições; nenhum item afirma incidente ocorrido no ambiente real.

Os maiores riscos são a verificação WebAuthn sem prova criptográfica, MFA sem gate efetivo, controles de revogação que só alteram tabelas públicas, recuperação de conta interrompida, rascunho entre destinatários e identidade externa trocada na inteligência CRM. Há ainda falhas de confirmação em permissões, roles e mutations e funções de gerenciamento visíveis sem implementação.

Não houve alteração na fonte, banco vivo, envio de mensagens/email, consulta de segredos ou execução de scripts do produto. Os 11 probes executam código real transpilado/closures extraídas, com fronteiras sintéticas explicitamente descritas; não representam E2E nem certificação de RLS.

## Inventário dos achados

| ID | Severidade | Status | Achado |
|---|---|---|---|
| R2-AUTH-001 | high | CONFIRMED_OFFLINE | WebAuthn aceita verificação sem assinatura, authenticatorData ou validação de origem |
| R2-AUTH-002 | high | CONFIRMED_STATIC | Login com passkey anuncia autenticação mas somente inicia OTP por email |
| R2-AUTH-003 | high | CONFIRMED_STATIC | MFA no login está fora da cadeia de autorização das rotas |
| R2-AUTH-004 | high | CONFIRMED_STATIC | Desativar usuário, forçar logout e encerrar dispositivos não revogam sessões Auth |
| R2-AUTH-005 | medium | CONFIRMED_OFFLINE | Resposta atrasada de perfil repõe identidade antiga após logout ou troca de usuário |
| R2-AUTH-006 | high | CONFIRMED_STATIC | Recuperação anônima consulta profiles protegido e não cria solicitação |
| R2-AUTH-007 | high | CONFIRMED_STATIC | Aprovar recuperação gera link que a UI descarta e anuncia email não enviado |
| R2-AUTH-008 | high | CONFIRMED_OFFLINE | Troca de papel apaga privilégios antes de confirmar a nova atribuição |
| R2-AUTH-009 | high | CONFIRMED_OFFLINE | Matriz anuncia permissão removida mesmo quando a revogação retorna erro |
| R2-AUTH-010 | high | CONFIRMED_OFFLINE | Rascunho e resposta do Team Chat atravessam conversas e permanecem entre contas |
| R2-AUTH-011 | medium | CONFIRMED_STATIC | Team Chat busca perfis de colegas por tabela proibida aos agentes |
| R2-AUTH-012 | medium | CONFIRMED_STATIC | Ações VIP, arquivar, bloquear e tags no detalhe do contato não persistem |
| R2-AUTH-013 | medium | CONFIRMED_OFFLINE | Mutations de Contatos ainda informam sucesso em erros ou lotes parciais |
| R2-AUTH-014 | medium | CONFIRMED_STATIC | Menus de gerenciamento de agentes possuem opções clicáveis sem ação |
| R2-AUTH-015 | medium | CONFIRMED_STATIC | Convite de agente não cria convite autenticável nem provisiona papel escolhido |
| R2-AUTH-016 | medium | CONFIRMED_STATIC | Criação de usuário retorna sucesso mesmo com role/perfil/contas auxiliares falhos |
| R2-AUTH-017 | medium | REFINED_PRIOR | Gestão de grupo e recursos novos de Team Chat permanecem sem consumidor |
| R2-AUTH-018 | high | CONFIRMED_OFFLINE | Inteligência CRM aceita pessoa externa diferente do vínculo estável |
| R2-AUTH-019 | medium | CONFIRMED_STATIC | Edição de empresa/contato no CRM externo aceita zero linhas como sucesso |
| R2-AUTH-020 | medium | CONFIRMED_STATIC | Capacidade de agentes conta todos os contatos atribuídos como chats ativos |
| R2-AUTH-021 | medium | CONFIRMED_OFFLINE | Indisponibilidade do Auth é registrada como tentativa de senha incorreta |
| R2-AUTH-022 | high | CONFIRMED_STATIC | Bloqueios de IP/país e regras configuráveis não dirigem a autorização local |
| R2-AUTH-023 | medium | CONFIRMED_OFFLINE | Salvar regras de rate limit pode apagar a configuração e descarta a ação escolhida |
| R2-AUTH-024 | medium | CONFIRMED_STATIC | Overview de segurança apresenta estados e pontuação sem medição válida |
| R2-AUTH-025 | medium | CONFIRMED_OFFLINE | Editor inline de empresa/cargo conserva vazio inicial e pode apagar dado carregado |
| R2-AUTH-026 | medium | CONFIRMED_STATIC | Excluir nota de colega some da UI mesmo quando RLS preserva a nota |
| R2-AUTH-027 | medium | CONFIRMED_STATIC | Usuário pode liberar o próprio flag administrativo de download |
| R2-AUTH-028 | medium | CONFIRMED_STATIC | Detalhe do contato mostra zero mensagens e inatividade por props nunca fornecidas |
| R2-AUTH-029 | medium | CONFIRMED_STATIC | Analytics de Contatos rotula agregados da página atual como totais |
| R2-AUTH-030 | medium | CONFIRMED_STATIC | Configurações globais de cadastro, grupos, reabertura e chave ElevenLabs não têm consumidor operacional local |
| R2-AUTH-031 | medium | CONFIRMED_STATIC | Resposta de verificação da senha anterior pode substituir o veredito da senha atual |
| R2-AUTH-032 | medium | CONFIRMED_STATIC | Auditoria não inclui concessões e revogações de roles nos filtros e no contador sensível |
| R2-AUTH-033 | medium | CONFIRMED_STATIC | Página de roles usa embed inexistente e transforma erro de consulta em listas vazias |
| R2-AUTH-034 | medium | CONFIRMED_STATIC | Aba Notas trata erros devolvidos pelo serviço como conclusão e descarta o texto antes de salvar |
| R2-AUTH-035 | medium | CONFIRMED_STATIC | Status WhatsApp converte indisponibilidade em ausência de status e apresenta Offline sem medição |
| R2-AUTH-036 | medium | CONFIRMED_STATIC | Sala de Crise calcula alertas operacionais com mensagens respondidas e contas habilitadas |
| R2-AUTH-037 | medium | CONFIRMED_STATIC | Treinamento apresenta e persiste avaliação de desempenho baseada apenas em sorteio |
| R2-AUTH-038 | medium | CONFIRMED_STATIC | Mapa conta contatos com coordenadas também como localização apenas aproximada |
| R2-AUTH-039 | medium | CONFIRMED_STATIC | Recálculo atrasado grava coordenadas do endereço anterior e apaga o aviso de desatualização |
| R2-AUTH-040 | medium | CONFIRMED_STATIC | Janela relativa do painel de uso de IA fica presa à hora de abertura |
| R2-AUTH-041 | medium | CONFIRMED_STATIC | Consulta de custo de IA passa fim nulo e elimina todas as chamadas da janela |
| R2-AUTH-042 | medium | CONFIRMED_STATIC | Página Conquistas apresenta progresso simulado como pertencente ao usuário |
| R2-AUTH-043 | medium | CONFIRMED_STATIC | Mini-games anunciam ganho de XP sem consumidor que credite a recompensa |
| R2-AUTH-044 | medium | CONFIRMED_OFFLINE_PROBE | Speed Typing encerrado conclui o jogo seguinte e grava seu recorde sem jogá-lo |
| R2-AUTH-045 | medium | CONFIRMED_STATIC | CSAT carrega a configuração sem sincronizar o formulário e pode sobrescrevê-la com defaults |
| R2-AUTH-046 | medium | CONFIRMED_STATIC | Seletor de proficiência sempre cadastra nível 3 independentemente da escolha |
| R2-AUTH-047 | medium | CONFIRMED_STATIC | Aba Sons altera um estado privado que o botão Salvar não persiste nem aplica aos alertas |
| R2-AUTH-048 | medium | CONFIRMED_STATIC | Classificar Recentes contabiliza respostas de erro como conversas classificadas |
| R2-AUTH-049 | medium | CONFIRMED_STATIC | Abas de horário, mensagens e automação persistem preferências sem ligação aos executores versionados |
| R2-AUTH-050 | medium | CONFIRMED_STATIC | Solicitação de exclusão de dados é confirmada mesmo quando o registro de auditoria falha |
| R2-AUTH-051 | medium | CONFIRMED_STATIC | Resumo pós-chamada descarta a anotação ainda em edição ao fechar automaticamente |
| R2-AUTH-052 | medium | CONFIRMED_STATIC | A tabela de ligações cancela o acionamento por teclado do botão Ligar de volta |
| R2-AUTH-053 | medium | CONFIRMED_STATIC | O tema Diversity remove o indicador de foco definido para botões padrão e cards de tema |

## Evidência por achado

### R2-AUTH-001 — WebAuthn aceita verificação sem assinatura, authenticatorData ou validação de origem

**Severidade:** high (P1). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** Auth/useAuthForm → useWebAuthn.authenticateWithPasskey → webauthn(authentication-options, verify-authentication) → service client lê credencial, incrementa contador e retorna identidade.

**Precondição:** Uma credencial cadastrada e um challenge conhecido para a conta; authentication-options devolve o challenge e IDs de credencial quando encontra o email.

**Falha e consequência:** verify-authentication só compara clientData.type e challenge. Não verifica signature, authenticatorData, RP ID hash, origin, flags UP/UV nem contador assinado. O challenge não é filtrado por expires_at. A prova offline retornou200/success com origem errada, nenhum dado de assinatura e challenge vencido. A inscrição também grava attestationObject como public_key sem extrair/verificar a chave. A resposta inclui userId/email e consome challenge; não emite uma sessão Auth.

**Evidências na fonte:**

- `supabase/functions/webauthn/index.ts:97–128` — verify-registration; blob `9e42845d17a6dead75e6deb95f12be00d9e7b340`.
- `supabase/functions/webauthn/index.ts:131–181` — authentication-options / verify-authentication; blob `9e42845d17a6dead75e6deb95f12be00d9e7b340`.
- `supabase/functions/_shared/schemas.ts:338–345` — WebAuthnActionSchema; blob `57b706d77864be9c2c24f0eb57f0728335b0b2d0`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.10, 24.5 em COMPLETE_SYSTEM_FEATURES.md.

**Reprodução:** P-AUTH-01 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Verificar criação e assertions com uma implementação WebAuthn que valide desafio, expiração, origem/RP, assinatura, UP/UV e contador conforme a política escolhida.
- Rejeitar falta/alteração de signature e authenticatorData, origem ou RP errados, challenge expirado/reutilizado; provar que nenhum caso altera contador ou autentica.
- Vincular desafio a tentativa/conta e consumir de forma atômica apenas após prova válida.

**Limites:**

- O probe executa o handler real transpilado com DB/CORS/entrada de schema sintéticos. Não é exploração de banco vivo.
- Não classificado como tomada de sessão: o endpoint não retorna tokens, e o handoff quebrado está em R2-AUTH-002.

### R2-AUTH-002 — Login com passkey anuncia autenticação mas somente inicia OTP por email

**Severidade:** high (P1). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** Auth → handlePasskeyLogin → authenticateWithPasskey → signInWithOtp → toast de autenticado → navigate(/) → ProtectedRoute.

**Precondição:** Usuário sem sessão que conclui a etapa WebAuthn; SDK aceita o envio do OTP.

**Falha e consequência:** signInWithOtp envia o mecanismo de login por email, mas o código não verifica OTP nem recebe/aplica sessão. Mesmo com sucesso do endpoint WebAuthn a página anuncia Autenticado com Passkey e navega para uma rota que volta a /auth. Há falhas adicionais do mesmo fluxo: sem email, authentication-options grava challenge com user_id null, enquanto a verificação procura pelo user_id da credencial; listUsers sem paginação torna a resolução por email incompleta para contas fora da primeira página.

**Evidências na fonte:**

- `src/hooks/auth/useAuthForm.ts:189–202` — handlePasskeyLogin; blob `8425451add33bca558cd2e1a92c520e76041ecba`.
- `src/hooks/auth/useWebAuthn.ts:109–157` — authenticateWithPasskey; blob `9757ac438d96ce70bd030a5cb12ed4fccf870f99`.
- `supabase/functions/webauthn/index.ts:131–181` — passkey challenge / identity response; blob `9e42845d17a6dead75e6deb95f12be00d9e7b340`.
- `src/components/auth/ProtectedRoute.tsx:113–118` — guard de sessão; blob `c16a92880441adf86f2a408382c969fb215eaf75`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.10, 24.5 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Uma assertion válida deve concluir um fluxo de sessão realmente suportado e produzir usuário/sessão antes de anunciar login.
- Testar login sem sessão, sem email, conta além da primeira página de usuários, cancelamento e retorno; exigir chegada ao app sem login adicional não anunciado.
- Se houver continuação por email, mostrar explicitamente esse estado em vez de autenticação concluída.

**Limites:**

- A semântica de signInWithOtp foi conferida na documentação oficial Supabase.
- Não executado biométrico em navegador nem envio de email.

### R2-AUTH-003 — MFA no login está fora da cadeia de autorização das rotas

**Severidade:** high (P1). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** Login senha/SSO → AuthProvider user → AuthForm navega / → ProtectedRoute checa user/papel/permissão; /2fa é uma rota independente.

**Precondição:** Conta com fator TOTP verificado e sessão aal1 antes do desafio adicional.

**Falha e consequência:** Não existe decisão AAL em ProtectedRoute, AppRoutes ou no redirecionamento do login. TwoFactorAuth só inicia verificação se o usuário visitar a rota. O inventário SQL do agente de banco não encontrou cláusula AAL nas779 migrations ativas. Assim a UI e a cadeia analisada não exigem segundo fator para acessar o app, apesar de existir enrollment e tela funcional de desafio. A própria rota fica indefinidamente em Verificando para usuário sem sessão/sem fator ou erro de assurance.

**Evidências na fonte:**

- `src/hooks/auth/useAuthForm.ts:53–57` — redirect após user; blob `8425451add33bca558cd2e1a92c520e76041ecba`.
- `src/components/auth/ProtectedRoute.tsx:17–141` — ProtectedRoute; blob `c16a92880441adf86f2a408382c969fb215eaf75`.
- `src/routes/AppRoutes.tsx:28–113` — rotas auth/2fa/admin; blob `005f7a1a35bfb4cb98161784c7047a4edbc9dc22`.
- `src/pages/TwoFactorAuth.tsx:17–50` — checkMFAStatus; blob `dccd7a3ba6c07a6dd7124a2e9cbc5dbfd7be2a03`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.7, 1.8, 1.9, 1.11 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Aplicar decisão de currentLevel/nextLevel antes da autorização do conteúdo protegido.
- Reforçar os recursos sensíveis na autorização server-side/RLS conforme política MFA, além do redirecionamento.
- Com fator verificado, senha/SSO aal1 e URL direta devem exigir desafio; aal2 deve entrar; ausência de usuário/fator/erro deve ter estado explícito.

**Limites:**

- Ausência de AAL em SQL baseada na cadeia da fonte, corroborada pelo agente SQL; não houve consulta ao dashboard Auth implantado.
- 1.20 SSO tem implementação de callback; o problema é o gate posterior de MFA, não a inexistência de SSO.

### R2-AUTH-004 — Desativar usuário, forçar logout e encerrar dispositivos não revogam sessões Auth

**Severidade:** high (P1). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AdminUsersTable → ForceLogoutButton/useAdminData; Segurança → useDeviceDetection → profiles ou public.user_sessions.

**Precondição:** Usuário com sessão ou credenciais válidas que o administrador tenta desativar/desconectar.

**Falha e consequência:** Forçar logout só atualiza profiles.session_invalidated_at, campo sem leitor na fonte/SQL. Desativar altera is_active, mas auth-login e as guardas de entrada não o validam e o predicado is_contact_visible_to_user não o consulta. Há proteções em operações específicas, por exemplo envio/fechamento atômico e guards TalkX que exigem perfil ativo; o achado não afirma autorização universal após desativação. Encerrar sessões só marca public.user_sessions.is_active=false; não há vínculo com auth.sessions, revogação de refresh token ou validação desse registro. detect-new-device insere uma sessão pública nova a cada chamada, sem chave da sessão Auth, e só é chamado nas telas de segurança. As confirmações descrevem efeitos de segurança que esses writes não realizam.

**Evidências na fonte:**

- `src/components/admin/ForceLogoutButton.tsx:26–61` — handleForceLogout e promessa UI; blob `d796604de197b3e648d4b17d96ca45ea218d41df`.
- `src/components/admin/useAdminData.ts:115–126` — handleToggleActive; blob `9c74e75a5e998a94189ff292ffbdfc113973ef9d`.
- `src/hooks/ui/useDeviceDetection.ts:174–227` — removeDevice/endSession/endAllOtherSessions; blob `512c3752014ac7a1494bce1ca8eda98e89a1fa28`.
- `supabase/functions/detect-new-device/index.ts:140–169` — registro de user_sessions; blob `a94779b3b19fcb704eb9a9370cc62267b4e45a33`.
- `supabase/functions/auth-login/index.ts:72–116` — login sem is_active/session_invalidated_at; blob `a4fe292c8b536d271ff3d65008b5ee8473babc99`.
- `supabase/migrations/20260315193759_ad5f45ba-4b9f-4b25-b483-7da8b548e8c7.sql:33–40` — adiciona session_invalidated_at; blob `566646ef7d4f844f87bf80f91030daf645fa965f`.
- `supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql:1–84` — predicado canônico de visibilidade; blob `a0c2e2f7484bfdd3808b3e30f2ca87cb4104428c`.
- `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql:201–207` — controle existente de perfil ativo no envio; blob `26757cd161120a7357018fce06ed2969439e03b0`.
- `supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql:538–546` — controle existente de perfil ativo no fechamento; blob `26757cd161120a7357018fce06ed2969439e03b0`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.11, 24.4, 24.15 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Definir e implementar revogação real para logout forçado, término de sessão/dispositivo e desativação de conta.
- Vincular inventário de dispositivos à sessão Auth que ele pretende encerrar; evitar duplicação por visita à tela.
- Validar duas sessões independentes: após a ação, sessão alvo não renova/acessa recursos conforme o prazo garantido; desativado não inicia nova sessão; sessão preservada continua.

**Limites:**

- SQL peer confirmou: session_invalidated_at só ADD COLUMN; user_sessions não consulta auth.sessions; is_contact_visible_to_user não verifica is_active. As RPCs de mensagem/fechamento em 20260909220000 linhas203 e541, entre outras, exigem perfil ativo.
- Não se presume que revogar um refresh token revogue instantaneamente todo JWT já emitido; o aceite deve definir o mecanismo/prazo real.

### R2-AUTH-005 — Resposta atrasada de perfil repõe identidade antiga após logout ou troca de usuário

**Severidade:** medium (P2). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** AuthProvider.onAuthStateChange / refreshProfile → fetchProfile(userId) → setProfile; consumidores usam profile.id/nome para Team Chat e Contatos.

**Precondição:** Uma consulta de perfil em andamento durante SIGNED_OUT, novo SIGNED_IN ou atualização concorrente.

**Falha e consequência:** fetchProfile guarda apenas um booleano; não confere identidade vigente ou geração ao resolver. O listener libera o booleano a cada sessão e permite consultas concorrentes. O finally do logout limpa profile, porém uma consulta anterior pode escrever depois dessa limpeza; uma resposta A pode sobrescrever a resposta B. Os dois ordenamentos foram reproduzidos na closure real.

**Evidências na fonte:**

- `src/hooks/auth/useAuth.tsx:36–47` — fetchProfile; blob `b6a2c01e872eb422a4c71cab6fff0e58b7f383a4`.
- `src/hooks/auth/useAuth.tsx:89–118` — onAuthStateChange; blob `b6a2c01e872eb422a4c71cab6fff0e58b7f383a4`.
- `src/hooks/auth/useAuth.tsx:148–181` — refreshProfile/signOut; blob `b6a2c01e872eb422a4c71cab6fff0e58b7f383a4`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Reprodução:** P-AUTH-02 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Vincular cada resposta de perfil à geração de sessão e userId atuais; descartar resultados de gerações encerradas.
- Invalidar/cancelar consultas de perfil no logout e na troca de usuário e zerar perfil ao iniciar identidade diferente.
- Provar duas ordens de resolução A/B e conclusão tardia após logout, sem reaparecer perfil anterior.

**Limites:**

- Probe da closure real com promises controladas; transições de sessão simulam pontos de corte do listener, sem renderização React completa.
- Não afirma bypass de RLS: a falha confirmada é a identidade incorreta no estado do cliente.

### R2-AUTH-006 — Recuperação anônima consulta profiles protegido e não cria solicitação

**Severidade:** high (P1). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** /forgot-password → SELECT profiles(user_id) por email → retorno genérico sem insert.

**Precondição:** Pessoa desconectada tentando recuperar sua conta, o caso normal desta página.

**Falha e consequência:** As policies SELECT atuais de profiles exigem authenticated e permitem próprio usuário/admin/supervisor. Sem sessão, a consulta não retorna a conta. ForgotPassword ignora userError e, quando existingUser é vazio, apresenta sucesso genérico antes do INSERT password_reset_requests. A não enumeração de emails é correta como aparência, mas o pedido real nunca é entregue ao administrador.

**Evidências na fonte:**

- `src/pages/ForgotPassword.tsx:37–68` — handleSubmit; blob `c4a8b964af4313dd0d0da2026c3224076ae34caf`.
- `supabase/migrations/20260401000858_6225188d-2861-4f8e-b84b-fa68b542cbb5.sql:1–26` — SELECT profiles próprio/admin/supervisor e política de equipe transitória; blob `a05f3685643ec445ce07862463a20db859b3faa3`.
- `supabase/migrations/20260401001655_509f6c72-b9c2-458c-9dc5-af298d512958.sql:1–5` — remove política de equipe; blob `bcef82895cdad989af1c9809d1107b3483cc6b15`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.4, 1.23 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Mover o registro do pedido para uma fronteira server-side anônima controlada que faça lookup sem expor existência e persista pedido válido.
- Manter mesma resposta pública para email existente/inexistente; separar falha de infraestrutura de pedido persistido.
- Verificar anon existente: uma solicitação pendente aparece ao revisor; anon inexistente não enumera; duplicatas/rate limit tratados.

**Limites:**

- Policies exatas: migration com prefixo20260401000858 linhas6–12; remoção da policy de equipe no prefixo20260401001655 linha3. Pins SQL anexados em cross_domain_evidence.
- Sem teste anônimo em banco vivo.

### R2-AUTH-007 — Aprovar recuperação gera link que a UI descarta e anuncia email não enviado

**Severidade:** high (P1). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** PasswordResetRequestsPanel.handleApprove → approve-password-reset → auth.admin.generateLink → resposta resetLink → UI ignora data.

**Precondição:** Uma solicitação pendente existente e revisor autorizado.

**Falha e consequência:** A Edge gera action_link, marca a solicitação approved e devolve o link. Não há envio de email. O consumidor extrai somente error e informa Email de reset enviado. Mesmo contornando o bloqueio da etapa anterior, o usuário não recebe o link por esse fluxo. A checagem pending e update também são separados, sem compare-and-swap, permitindo decisões concorrentes sobre o mesmo pedido.

**Evidências na fonte:**

- `supabase/functions/approve-password-reset/index.ts:39–104` — leitura/aprovação/generateLink; blob `06449dc84c8bc823cc9505555ba8ef77c8e3d6a2`.
- `src/components/security/PasswordResetRequestsPanel.tsx:51–60` — handleApprove; blob `871a2b47f2eae46543fa00e15eb0d49ff95d0d06`.
- `src/components/security/RejectResetDialog.tsx:30–40` — promessa de notificação por email na rejeição; blob `82f31696533dc5ff9936c306f9205de30850461d`.
- `supabase/functions/approve-password-reset/index.ts:48–64` — rejeição só atualiza pedido e responde sucesso; blob `06449dc84c8bc823cc9505555ba8ef77c8e3d6a2`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.4, 1.23 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Gerar e entregar o mecanismo de recuperação ao destinatário por transporte verificável; status sent somente após aceite do envio.
- Não expor link ao revisor se não for parte do fluxo autorizado; a UI deve refletir queued/sent/failed e permitir retry seguro.
- Condicionar decisão ao estado pending de forma atômica e testar aprovar/rejeitar concorrentes sem múltiplas decisões contraditórias.

**Limites:**

- generateLink é geração de link para transporte próprio conforme documentação oficial, não disparo de email.
- Nenhum email enviado e nenhum link de recuperação real coletado.
- O ramo de rejeição também anuncia notificação por email no diálogo, mas o handler apenas atualiza a solicitação; nenhum transporte de rejeição foi localizado.

### R2-AUTH-008 — Troca de papel apaga privilégios antes de confirmar a nova atribuição

**Severidade:** high (P1). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** AdminUsersTable seletor de role → useAdminData.handleRoleChange → DELETE user_roles → INSERT.

**Precondição:** Administrador muda papel; o DELETE conclui e o INSERT falha, ou o DELETE falha silenciosamente.

**Falha e consequência:** A substituição usa dois requests não transacionais. Falha no INSERT deixa o usuário sem qualquer role; falha no DELETE é ignorada e o INSERT pode somar papéis ao antigo. O probe preservou exatamente o caminho real e mostrou admin→[] quando a inserção falha. Um operador pode inclusive retirar seu próprio acesso administrativo.

**Evidências na fonte:**

- `src/components/admin/useAdminData.ts:104–113` — handleRoleChange; blob `9c74e75a5e998a94189ff292ffbdfc113973ef9d`.
- `src/components/admin/AdminUsersTable.tsx:1–115` — seletor consumidor; blob `b0b64c6e3f23eeda62a9ccf0b679099e40245e4e`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.12, 1.13 em COMPLETE_SYSTEM_FEATURES.md.

**Reprodução:** P-AUTH-05 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Substituir papel por operação server-side atômica com autorização e proteção de último administrador conforme regra de negócio.
- Erro de qualquer etapa deve manter atribuição anterior e ser refletido na UI.
- Validar falha/inserção concorrente e múltiplos papéis sem estados intermediários destrutivos.

**Limites:**

- Conclusão da fonte fixada; não atesta comportamento de uma implantação ou banco vivo.

### R2-AUTH-009 — Matriz anuncia permissão removida mesmo quando a revogação retorna erro

**Severidade:** high (P1). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** PermissionMatrix.handleToggle → usePermissions.removePermissionFromRole/addPermissionToRole → PostgREST → toast.

**Precondição:** Falha explícita da escrita de role_permissions, por ACL, constraint ou serviço.

**Falha e consequência:** O hook retorna false em error e não lança. A matriz ignora o booleano e sempre mostra Permissão removida/adicionada. Probe com42501 retornou sucesso visual e nenhum refetch. Além disso, escritas bem-sucedidas não invalidam user-roles/user-nav-permissions de consumidores; staleTime não funciona como polling e o QueryClient desliga refetch em foco/mount.

**Evidências na fonte:**

- `src/hooks/system/usePermissions.ts:119–141` — mutations retornam boolean; blob `c8242e4421b19780f72aa36765883db807309f60`.
- `src/components/permissions/PermissionMatrix.tsx:54–72` — handleToggle; blob `9528e77ae5a584e286e70c2fb38a6a5f218e4d62`.
- `src/hooks/system/useUserRole.ts:1–74` — cache de papéis; blob `bf443c59442e8913b9c65b4114a4e2704c21b313`.
- `src/lib/queryClient.ts:1–33` — políticas globais de cache; blob `585ce9bf74ebeb3308234c672e6ae0fb98f10b64`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.17, 1.12 em COMPLETE_SYSTEM_FEATURES.md.

**Reprodução:** P-AUTH-03 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Propagar erro de mutation ou exigir retorno true antes de anunciar sucesso; confirmar quantidade efetivamente alterada.
- Invalidar/reconciliar permissões e papéis usados pela navegação após alteração e em mudanças remotas que o produto precise refletir.
- Testar revogação403/42501 e falha transitória: permissão permanece visível com erro e nenhuma mensagem de removida.

**Limites:**

- Não classifica hasPermission do hook como bloqueio ativo de agentes: não foi encontrado consumidor ativo desse método genérico fora da matriz.
- Backend pode continuar autorizando corretamente apesar do cache/UI incorretos.

### R2-AUTH-010 — Rascunho e resposta do Team Chat atravessam conversas e permanecem entre contas

**Severidade:** high (P1). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** TeamChatView troca conversation no mesmo TeamChatPanel → useTeamChatPanel mantém text/replyTo → TeamChatInputArea/useTeamChatDraft grava sob conversationId novo → send usa destino atual.

**Precondição:** Operador digita texto ou seleciona resposta em A e muda para B antes de enviar; outra conta pode usar o mesmo navegador e conversa depois.

**Falha e consequência:** O painel é reutilizado sem key por conversa; efeito de troca não limpa texto/reply/edit. O hook só restaura B se text estiver vazio e grava o texto antigo sob a chave de B após500ms. As chaves team_draft_+conversationId não têm identidade e não são removidas no logout. Probe mostrou A sobrescrevendo rascunho B e outro profile restaurando A. Enviar em B usa conversationId B e conteúdo/reply pendentes de A.

**Evidências na fonte:**

- `src/components/team-chat/TeamChatView.tsx:35–54` — painel sem key por conversa; blob `8454231c59f5d39daef659d66756ecbe66ed4d2b`.
- `src/components/team-chat/useTeamChatPanel.ts:27–35` — estado de edição; blob `236c415ea7b224bb41b815097fb75ed4c37c9ce3`.
- `src/components/team-chat/useTeamChatPanel.ts:116–124` — reset incompleto por conversationId; blob `236c415ea7b224bb41b815097fb75ed4c37c9ce3`.
- `src/components/team-chat/useTeamChatPanel.ts:190–206` — send atual; blob `236c415ea7b224bb41b815097fb75ed4c37c9ce3`.
- `src/hooks/chat/useTeamChatDraft.ts:7–53` — chave/auto-save/restore; blob `586bbd32e45e818ee4fac64e38a6e82df4d849dd`.
- `src/hooks/auth/useAuth.tsx:162–181` — limpeza de logout; blob `b6a2c01e872eb422a4c71cab6fff0e58b7f383a4`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Reprodução:** P-AUTH-04 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Escopar todo estado de composição e persistência por usuário e conversa; restaurar B independentemente do conteúdo prévio de A.
- Zerar reply/edit/arquivo/recording ao mudar de destinatário ou remontar painel com identidade completa.
- Provar troca A→B com ambos os rascunhos, resposta selecionada, envio e logout→outra conta, sem sobrescrita nem exposição.

**Limites:**

- Nova fronteira de identidade/destinatário; TC-010 anterior tratava perda após erro de envio, que permanece separado.
- Sem envio real de mensagem; probe do hook com scheduler sintético e retenção do painel confirmada na fonte.

### R2-AUTH-011 — Team Chat busca perfis de colegas por tabela proibida aos agentes

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** TeamChatView/lista → useTeamConversations embed profiles; painel colega → useTeamMemberDetails SELECT profiles.

**Precondição:** Usuário agent/special_agent, colega diferente e policy atual de profiles (próprio/admin/supervisor).

**Falha e consequência:** A lista incorpora perfis diretamente da tabela protegida; dados do outro participante vêm null. DMs sem nome caem em Chat Direto e perdem avatar. O painel individual consulta nome/email/telefone/cargo/aniversário pelo mesmo caminho e fica sem perfil; grupo lista só o que a policy permite, podendo contar1 membro em grupo maior. Há RPC get_team_profiles para projeção controlada em outros consumidores, mas esses caminhos não a usam.

**Evidências na fonte:**

- `src/hooks/team-chat/useTeamConversations.ts:26–68` — embed e displayName fallback; blob `5cf706a571edcaea4d68de8e7ce3037d0d1c761a`.
- `src/hooks/team-chat/useTeamMemberDetails.ts:40–69` — consultas peer/group; blob `0a3d5c862699b293f8f36e605906af925963b2cf`.
- `src/components/team-chat/TeamMemberDetails.tsx:35–77` — render detalhes e count; blob `2ae63d3cd4caf36eebf96650834a73d0a582c92f`.
- `src/hooks/crm/useTeamProfiles.ts:1–19` — projeção existente; blob `fb33eb361c21d30aca245ad165a01f04f33f896b`.
- `supabase/migrations/20260401000858_6225188d-2861-4f8e-b84b-fa68b542cbb5.sql:1–26` — SELECT profiles próprio/admin/supervisor e política de equipe transitória; blob `a05f3685643ec445ce07862463a20db859b3faa3`.
- `supabase/migrations/20260401001655_509f6c72-b9c2-458c-9dc5-af298d512958.sql:1–5` — remove política de equipe; blob `bcef82895cdad989af1c9809d1107b3483cc6b15`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Critérios de aceite para correção:**

- Usar projeção autorizada e mínima para participantes do Team Chat, sem abrir dados privados inteiros de profiles.
- Testar agent→agent e group com múltiplos membros: nomes/avatar corretos, somente atributos autorizados, count fiel.
- Distinguir perfil indisponível de erro de consulta.

**Limites:**

- Cadeia e manifesto SQL confirmados pelo agente SQL: policy de membros ativos foi removida na migration20260401001655.
- Não sugere afrouxar RLS genericamente nem afirma que agentes deveriam ver todos os dados pessoais do colega.

### R2-AUTH-012 — Ações VIP, arquivar, bloquear e tags no detalhe do contato não persistem

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ContactActionButtons menu Mais → ContactHeaderSection.onQuickAction → ContactDetails.handleQuickAction; ContactAccordionSections botões/tag X.

**Precondição:** Abrir detalhes do contato e selecionar ação visível do menu ou tags.

**Falha e consequência:** VIP/archive/block só emitem undoToast; não chamam mutation, não alteram estado persistido e undo também só mostra toast. Os botões Adicionar tag/Adicionar e X de tags não têm handler. A UI declara contato bloqueado/arquivado mesmo com dado intacto, levando a decisões operacionais incorretas.

**Evidências na fonte:**

- `src/components/inbox/contact-details/ContactActionButtons.tsx:186–198` — menu alcançável; blob `851aa7e03c6010ebbdd240bfdc5c52ddba94f55d`.
- `src/components/inbox/ContactDetails.tsx:67–91` — handleQuickAction; blob `eeffb3e8f1a69c737171f4dfb107d2485beec79a`.
- `src/components/inbox/ContactDetails.tsx:125–136` — wiring consumidor; blob `eeffb3e8f1a69c737171f4dfb107d2485beec79a`.
- `src/components/inbox/contact-details/ContactAccordionSections.tsx:74–77` — Adicionar tag sem handler; blob `97f3a98d20dc468cb4b8c54fe79f1d3fa35f24ed`.
- `src/components/inbox/contact-details/ContactAccordionSections.tsx:163–190` — TagsContent; blob `97f3a98d20dc468cb4b8c54fe79f1d3fa35f24ed`.
- `src/components/contacts/ContactsTable.tsx:218–237` — menu ativo Gerenciar etiquetas sem handler; blob `d9d6dce4276ad6e8ae834c4cc9e10269c41f8dd2`.
- `src/components/contacts/ContactContentArea.tsx:131–138` — consumidor de produção da tabela; blob `84fa3cee69c7e14e8b4311041cf41e2fe4400150`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 2.5 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Conectar cada ação ao contrato persistido com autorização e só confirmar após sucesso; undo deve reverter operação real.
- Se a função ainda não existir, removê-la/desabilitá-la com estado honesto.
- Reabrir contato após VIP/archive/block/tag e confirmar dado persistido e falhas explícitas.

**Limites:**

- Conclusão da fonte fixada; não atesta comportamento de uma implantação ou banco vivo.
- A tabela da página Contatos também oferece Gerenciar etiquetas sem handler; edição, chat e exclusão no mesmo menu possuem handlers reais e gates conferidos. É mais uma superfície do mesmo no-op de tags, não uma contagem adicional.

### R2-AUTH-013 — Mutations de Contatos ainda informam sucesso em erros ou lotes parciais

**Severidade:** medium (P2). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** ContactsView → ContactBulkTagDialog/BulkActionsBar → SELECT/UPDATE contacts; edição avulsa via useContactsCRUD.

**Precondição:** Contato selecionado sem UPDATE permitido, seleção incluindo IDs invisíveis, falha de escrita ou perda de autorização entre leitura e update.

**Falha e consequência:** ContactBulkTagDialog ignora todos os erros dos UPDATE e anuncia contactIds.length, inclusive IDs não lidos. BulkActionsBar.handleBulkTag ignora erros de leitura/escrita; leitura falha vira tags=[], podendo sobrescrever tags se a escrita subsequente passar. Atribuir/tipo/edição só verificam error sem quantidade, então zero/parte das linhas também anunciam sucesso total. DELETE já usa RPC e contagem corretamente; a correção não foi aplicada aos outros caminhos.

**Evidências na fonte:**

- `src/components/contacts/ContactBulkTagDialog.tsx:57–94` — handleApply; blob `386521b4886c48e6ea533072c2522255fca0206c`.
- `src/components/contacts/BulkActionsBar.tsx:78–144` — tag/assign/type; blob `72312d4b962d491a06f99f1070308c900a3b5878`.
- `src/components/contacts/BulkActionsBar.tsx:146–177` — contraste interno: delete contabiliza; blob `72312d4b962d491a06f99f1070308c900a3b5878`.
- `src/components/contacts/useContactsCRUD.ts:187–234` — handleEditContact; blob `8be3bec66e4631d55516b740125ceddcb240cf41`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Reprodução:** P-AUTH-06 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Propagar erros SDK e obter quantidade/IDs efetivamente alterados; reportar sucesso parcial e manter seleção recusada.
- Não fabricar tags vazias quando leitura falha; aplicar adição/remoção atômica para evitar lost update.
- Testar lote com autorização mista, erro de SELECT, erro UPDATE e zero rows, preservando tags existentes e feedback fiel.

**Limites:**

- O item Atribuir do BulkActionsBar está sem availableAgents no consumidor ContactsView239–248; erro de contagem desse handler é latente nessa montagem. Tag, tipo e edição são alcançáveis.

### R2-AUTH-014 — Menus de gerenciamento de agentes possuem opções clicáveis sem ação

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AgentsView grid → menu de cada agente ou botão Filtrar.

**Precondição:** Página de agentes carregada e ação selecionada.

**Falha e consequência:** Filtrar, Editar, Configurações e Desativar são renderizados sem onClick/onSelect. Não abrem diálogo, não mudam filtro, não invocam gerenciamento de conta. Há outra superfície Admin funcional para parte dessas operações, mas os controles oferecidos aqui não conduzem a ela.

**Evidências na fonte:**

- `src/components/agents/AgentsView.tsx:145–155` — Filtrar; blob `6708b347500a72eb23c4da5a96cc31e18c8ea715`.
- `src/components/agents/AgentsView.tsx:205–225` — menu agente; blob `6708b347500a72eb23c4da5a96cc31e18c8ea715`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Critérios de aceite para correção:**

- Ligar ações à superfície canônica de gerenciamento com o agente escolhido ou apresentá-las como indisponíveis.
- Validar cada opção com teclado/clique e verificar efeito real/autorização, inclusive desativação.

**Limites:**

- Conclusão da fonte fixada; não atesta comportamento de uma implantação ou banco vivo.

### R2-AUTH-015 — Convite de agente não cria convite autenticável nem provisiona papel escolhido

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AgentsView Novo agente → InviteAgentDialog.handleInvite → send-email.

**Precondição:** Operador seleciona papel admin/supervisor/agent e envia convite.

**Falha e consequência:** O único efeito é email HTML com texto do papel. Não há convite Auth, token/URL de aceite, registro de atribuição pendente ou associação do papel ao email. O destinatário é instruído a criar conta, e o papel selecionado não é comunicado a nenhum contrato de provisionamento. O email pode ser enviado com sucesso, mas não conclui onboarding do papel anunciado.

**Evidências na fonte:**

- `src/components/agents/InviteAgentDialog.tsx:29–65` — handleInvite; blob `c2ec05fe9f8be3135b56bad8e09ff7d954cd1ee2`.
- `src/components/agents/InviteAgentDialog.tsx:100–110` — papéis selecionáveis; blob `c2ec05fe9f8be3135b56bad8e09ff7d954cd1ee2`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Critérios de aceite para correção:**

- Definir fluxo de convite verificável, com destinatário, expiração, papel autorizado e consumo único.
- Aplicar atribuição na aceitação server-side, jamais por confiar no texto/email ou metadata fornecida pelo convidado.
- Testar convite para cada papel, email existente, novo, expirado e uso repetido; UI deve refletir estado de convite/aceite.

**Limites:**

- Não afirma que o email não é enviado: o defeito é o provisionamento ausente e a promessa do papel.
- send-email não foi executado.

### R2-AUTH-016 — Criação de usuário retorna sucesso mesmo com role/perfil/contas auxiliares falhos

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AdminView → useAdminData.handleCreateUser → create-user → Auth createUser → updates/inserts públicos →200.

**Precondição:** Criação Auth bem-sucedida e uma etapa posterior de role/perfil/conta auxiliar falha ou não afeta linha.

**Falha e consequência:** Erros das atualizações role e perfil são ignorados; Gmail/serviços/Dropbox apenas logam erro. A Edge sempre responde success:true e UI fecha como criado. Uma conta existe com configuração diferente da solicitada, e repetir a operação esbarra em email já criado. A autorização do criador usa user_roles.single(), incompatível com administrador que tenha mais de uma role, apesar da modelagem por linhas.

**Evidências na fonte:**

- `supabase/functions/create-user/index.ts:35–44` — lookup single de papel; blob `c9f07ddae973e905dfee8d7180e82c3ef02d4eb8`.
- `supabase/functions/create-user/index.ts:70–152` — provisionamento parcial; blob `c9f07ddae973e905dfee8d7180e82c3ef02d4eb8`.
- `src/components/admin/useAdminData.ts:237–248` — sucesso pelo HTTP; blob `9c74e75a5e998a94189ff292ffbdfc113973ef9d`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Critérios de aceite para correção:**

- Verificar e persistir resultado de cada etapa obrigatória; tornar retry idempotente e retornar provisionamento parcial explícito quando não for possível transação com Auth.
- Não sinalizar papel aplicado sem linha confirmada; reconciliar/compensar falha de provisionamento.
- Autorizar admin por existência do papel, com caso multi-role coberto.

**Limites:**

- Conclusão da fonte fixada; não atesta comportamento de uma implantação ou banco vivo.

### R2-AUTH-017 — Gestão de grupo e recursos novos de Team Chat permanecem sem consumidor

**Severidade:** medium (P2). **Status:** REFINED_PRIOR.

**Consumidor → efeito:** TeamChatView → TeamChatPanel → TeamChatHeader; estados/mutations do hook e diálogos exportados não são ligados ao painel.

**Precondição:** Uso da view de produção e intenção de renomear/sair/transferir/gerenciar grupo ou departamentos.

**Falha e consequência:** Além da gestão de departamento já apontada em TC-005 e da paginação/reação em TC-006, o painel não passa callbacks de rename/leave/transfer para header nem monta GroupManagementDialog/TransferConversationDialog/TeamPerformancePanel. Componentes e hooks não equivalem a operação disponível. GroupManagementDialog ainda trata membership.id como profile.id, mas esse bug foi mantido somente como bloqueio de integração porque o componente não está alcançável.

**Evidências na fonte:**

- `src/components/team-chat/TeamChatPanel.tsx:1–156` — imports e props do header; blob `66db8581e8565112211f289772b49255bd0c237f`.
- `src/components/team-chat/TeamChatView.tsx:29–55` — props para lista e painel; blob `8454231c59f5d39daef659d66756ecbe66ed4d2b`.
- `src/components/team-chat/useTeamChatPanel.ts:116–124` — estados de gestão; blob `236c415ea7b224bb41b815097fb75ed4c37c9ce3`.
- `src/components/team-chat/GroupManagementDialog.tsx:60–70` — shape dormente; blob `bab5c8d48183b3e1e5aa5e76d1632b52bde9a559`.
- `src/components/team-chat/GroupManagementDialog.tsx:155–167` — ID dormente; blob `bab5c8d48183b3e1e5aa5e76d1632b52bde9a559`.

**Comparação com os 104 anteriores:** Amplia a evidência do achado anterior sem contá-lo novamente como defeito independente. IDs: TC-005, TC-006.

**Critérios de aceite para correção:**

- Concluir ligação dos recursos aceitos ao consumidor real; não encerrar tarefa apenas por existir hook/componente.
- Corrigir shape membership/profile e contratos SQL antes de ativar diálogos.
- Provar as ações de grupo e departamentos a partir da view normal, com gestão/recusa de usuário sem papel.

**Limites:**

- Refinamento do grupo de achados anteriores, não novo achado de exploração.
- Bugs em código sem consumidor não foram contados como falha ativa.

### R2-AUTH-018 — Inteligência CRM aceita pessoa externa diferente do vínculo estável

**Severidade:** high (P1). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** ContactAccordionSections → ContactIntelligencePanel → useContactIntelligence → crm-integration(contactLookup,intelligence) → RPC externa por telefone.

**Precondição:** Contato canônico visível vinculado a external-A; o mesmo telefone no CRM externo passa a resolver external-B, sem mudar o telefone canônico.

**Falha e consequência:** A Edge lê o vínculo estável, mas compara external_contact_id apenas no lookup360. Para intelligence, aceita result.contact_id diferente e entrega briefing/rapport/interações de outra pessoa sob o contato atual. O probe do handler real retornou409 para360 e200 para intelligence com o mesmo vínculo A e resultado B. O caminho batch também só compara normalized_phone e não carrega external_contact_id, deixando logos/empresa do número reciclado sem prova de identidade.

**Evidências na fonte:**

- `supabase/functions/crm-integration/index.ts:568–589` — contactLookup; blob `d51878b27773388bf87396cb82f9b62c8c818c7b`.
- `supabase/functions/crm-integration/index.ts:590–617` — contactLookupBatch; blob `d51878b27773388bf87396cb82f9b62c8c818c7b`.
- `src/hooks/crm/useContactIntelligence.ts:79–108` — contact_id e consumidor; blob `18ab915b7c991b6358fcd9d58a8c7e3ef95c4d11`.
- `src/components/inbox/contact-details/ContactAccordionSections.tsx:95–103` — painel alcançável; blob `97f3a98d20dc468cb4b8c54fe79f1d3fa35f24ed`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Reprodução:** P-AUTH-07 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Resolver leituras pelo vínculo estável ou conferir identidade retornada em todas as projeções, incluindo intelligence e batch.
- Em divergência, retornar conflito/estado de reverificação sem exibir dado de outra pessoa.
- Reproduzir telefone reciclado, vínculo alterado e ausência de vínculo; confirmar que360/intelligence/batch compartilham a mesma autoridade de identidade.

**Limites:**

- External RPC/DB sintéticos, sem provar que já ocorreu reatribuição no Singu real.
- Authorization do contato canônico está presente; defeito é a identidade externa que ele autoriza a projetar.

### R2-AUTH-019 — Edição de empresa/contato no CRM externo aceita zero linhas como sucesso

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** CRM360ExplorerView → CompanyFormDialog/ContactFormDialog → useExternalMutation → crm-integration mutate update → select result.

**Precondição:** Empresa/contato removido ou ID que não existe mais entre abertura do form e update.

**Falha e consequência:** O gateway transforma retorno vazio em data=[] com200; hook retorna o array e forms ignoram seu conteúdo, anunciam atualizado e fecham. Não há verificação de uma linha efetivamente gravada nem reconciliação de conflito. A invalidação só cobre external-db/tabela, deixando projeções360/intelligence/batch existentes com valores antigos após edição bem-sucedida.

**Evidências na fonte:**

- `supabase/functions/crm-integration/index.ts:676–687` — mutate; blob `d51878b27773388bf87396cb82f9b62c8c818c7b`.
- `src/hooks/integrations/useExternalDB.ts:138–159` — useExternalMutation; blob `cc0d00e79513ce3b063106102f14879d20cb6a9a`.
- `src/components/crm360/CompanyFormDialog.tsx:94–115` — handleSubmit; blob `e04475506eb435d2eaa09f00edeb4852feae4023`.
- `src/components/crm360/ContactFormDialog.tsx:105–125` — handleSubmit; blob `3902767351eb673a9412ce405055e8d34a539c21`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Critérios de aceite para correção:**

- Exigir exatamente uma linha alterada para update de ID único e informar404/conflito sem fechar form quando zero.
- Definir controle de versão para edição concorrente e invalidar projeções360/intelligence/batch impactadas.
- Verificar remoção entre read/update e edição de empresa vinculada em aba separada.

**Limites:**

- Conclusão da fonte fixada; não atesta comportamento de uma implantação ou banco vivo.

### R2-AUTH-020 — Capacidade de agentes conta todos os contatos atribuídos como chats ativos

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** useAgents agents-active-chats → COUNT client-side por assigned_to → AgentsView capacidade/chats e totalActiveChats.

**Precondição:** Existem contatos atribuídos com conversa encerrada, histórico antigo ou volume acima do limite de resposta da API.

**Falha e consequência:** A consulta não filtra estado da conversa e conta cada contato atribuído como ativo. A capacidade exibida cresce com o histórico mesmo sem atendimento aberto; a consulta não pagina/agrega no servidor, então volumes maiores também truncam contagem. Loading dos chats não compõe isLoading e falhas podem se apresentar como0. A presença tem fallback por profiles.updated_at, que é atualização de cadastro, não evento de login.

**Evidências na fonte:**

- `src/hooks/crm/useAgents.ts:75–142` — activeChats e stats; blob `9a87db8dcea3d8538a8009cc3986a26cd4dc96c9`.
- `src/components/agents/AgentsView.tsx:167–168` — capacityPercent; blob `6708b347500a72eb23c4da5a96cc31e18c8ea715`.
- `src/components/agents/AgentsView.tsx:228–244` — exibição de chats ativos; blob `6708b347500a72eb23c4da5a96cc31e18c8ea715`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Critérios de aceite para correção:**

- Contar o conjunto canônico de atendimentos ativos no servidor com o filtro de status correto e sem limite de paginação implícito.
- Separar erro/loading/ausência de dado de zero; não estimar presença por edição de perfil.
- Conferir0 abertos com histórico atribuído, abertos/encerrados mistos e volume maior que uma página.

**Limites:**

- Não afirma que o algoritmo de distribuição do banco usa esta estatística; o defeito confirmado é na UI/estatística de agentes.

### R2-AUTH-021 — Indisponibilidade do Auth é registrada como tentativa de senha incorreta

**Severidade:** medium (P2). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** AuthService.signIn → auth-login → GoTrue signInWithPassword retorna erro503 → record_failed_login →401 → cliente trata credenciais inválidas.

**Precondição:** GoTrue retorna erro operacional/retryable em vez de uma recusa de credenciais.

**Falha e consequência:** Qualquer signInError entra no mesmo ramo de senha inválida. O handler registra tentativa e responde401, ocultando503/rede e podendo levar usuários legítimos ao lockout ao repetir durante incidente. Probe com upstream503 chamou record_failed_login e retornou Invalid login credentials. Isso contradiz a distinção disponibilidade/credenciais que o cliente pretende manter no ADR-006.

**Evidências na fonte:**

- `supabase/functions/auth-login/index.ts:83–99` — classificação de falha Auth; blob `a4fe292c8b536d271ff3d65008b5ee8473babc99`.
- `src/lib/serverLogin.ts:96–121` — interpretação de resposta; blob `dd7d79a775127bbb18ee7a64b6e5f730032609aa`.
- `docs/adr/ADR-006-login-lockout-server-side.md:56–58` — distinção declarada; blob `8e57df3373a358ef6a3ed81776fc277ec535b163`.

**Comparação com os 104 anteriores:** Não foi encontrado achado equivalente nos 104 registros de FINDINGS.json anterior; comparação feita por área, fluxo e caminhos, não só título.

**Alegações documentais relacionadas:** 1.19 em COMPLETE_SYSTEM_FEATURES.md.

**Reprodução:** P-AUTH-08 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Registrar tentativa somente para códigos comprovadamente relativos a credenciais; propagar falhas de rede/5xx/rate limit como indisponibilidade com retry adequado.
- Não alterar login_attempts por outage do provedor.
- Testar credencial inválida,503,429 e falha de transporte garantindo categoria/status e contador corretos.

**Limites:**

- Não reabre bypass direto GoTrue: esse limite residual já é explícito e aceito no ADR-00679–85.
- Nenhuma conta real foi bloqueada.

### R2-AUTH-022 — Bloqueios de IP/país e regras configuráveis não dirigem a autorização local

**Severidade:** high (P1). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SecurityView abas administrativas → GeoBlockingPanel/IPWhitelistPanel/BlockedIPsPanel/RateLimitConfigPanel → tabelas; login e Edges → checkRateLimit/enforceRateLimit → parâmetros fixados no chamador.

**Precondição:** Administrador cadastra IP bloqueado, ativa whitelist geográfica vazia ou altera um limite esperando o efeito descrito na UI.

**Falha e consequência:** A UI persiste geo_blocking_settings, allowed_countries, blocked_countries, blocked_ips, ip_whitelist e rate_limit_configs, mas a cadeia de acesso analisada não lê essas configurações. Os helpers is_country_allowed/is_country_blocked/is_ip_blocked/is_ip_whitelisted existem no SQL e não têm consumidor de produção localizado. enforceRateLimit envia p_max/p_window_seconds definidos no código; consume_rate_limit usa exclusivamente esses parâmetros e edge_rate_limits. Portanto adicionar bloqueio/whitelist ou editar regra não passa a proteger/desobrigar esses caminhos. A afirmação da UI de que whitelist vazia impede todo acesso não é realizada pela fonte.

**Evidências na fonte:**

- `src/components/security/SecurityView.tsx:127–142` — mount administrativo; blob `f98bce6c4ae825ec3591cd58a346ba7390e6caa7`.
- `src/components/security/GeoBlockingPanel.tsx:57–86` — promessas whitelist/blacklist; blob `50a103a5fce56641642e7b424a1ec8a91d9898ea`.
- `src/components/security/GeoBlockingPanel.tsx:125–127` — promessa whitelist vazia; blob `50a103a5fce56641642e7b424a1ec8a91d9898ea`.
- `src/hooks/system/useGeoBlocking.ts:31–99` — persistência de modo/listas; blob `5f214fad63a9de2aa1e41a2aa4e37ca7e095a4ad`.
- `src/components/security/IPWhitelistPanel.tsx:146–149` — promessa de isenção; blob `7f77b5bc2db1585fcfd14f0286ca7b737c8e1b96`.
- `src/components/security/BlockedIPDialogs.tsx:29–39` — bloqueio apenas tabela; blob `3bc5df25101d664a10f651422cc496b322a92cad`.
- `src/components/security/RateLimitConfigPanel.tsx:86–105` — persistência rate_limit_configs; blob `d530018985f63fc004870100cbc0469e8112e215`.
- `supabase/functions/_shared/validation.ts:187–266` — limite efetivo por parâmetros; blob `3b82137fae8da21224e20fff7e9f073ab67c017c`.
- `supabase/migrations/20260905020000_edge_rate_limits.sql:19–44` — consume_rate_limit; blob `34977ef90f88f1eafa141253401c51fcb0d3dba4`.
- `supabase/functions/auth-login/index.ts:20–41` — entrada de login/limites; blob `a4fe292c8b536d271ff3d65008b5ee8473babc99`.

**Comparação com os 104 anteriores:** Comparado com os 104 registros anteriores por caminho, fluxo e assunto; não há equivalente material. Não reconta achado anterior.

**Alegações documentais relacionadas:** 24.6, 24.7, 24.8, 24.11 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Ligar os controles prometidos a uma fronteira de autorização obrigatória nos caminhos abrangidos e definir exatamente o alcance de IP/país/endpoint.
- Validar em ambiente isolado: IP bloqueado negado; IP permitido conforme regra; país fora da whitelist negado; mudança de limite altera a decisão efetiva.
- Se algum controle depender de componente externo, registrar e provar esse consumidor; não anunciar enforcement pela simples gravação da tabela.

**Limites:**

- Há limites reais por código e RPC persistente; este achado não afirma ausência de todo rate limiting.
- Não avaliados WAF/reverse proxy/controles do projeto Auth externos à fonte. A busca negativa abrange src e supabase/functions e foi corroborada pelo agente SQL.
- Conclusão na fonte fixada; não mede implantação, políticas externas ou incidente real.

### R2-AUTH-023 — Salvar regras de rate limit pode apagar a configuração e descarta a ação escolhida

**Severidade:** medium (P2). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** Aba Rate Limit → saveRules → DELETE global rate_limit_configs → INSERT novo conjunto → fetchRules.

**Precondição:** Falha no INSERT depois de DELETE bem-sucedido; ou escolha Alertar/Limitar seguida de salvar com sucesso.

**Falha e consequência:** A substituição é feita em dois requests sem transação e o resultado do DELETE é ignorado. Uma falha posterior deixa a tabela sem regras; um DELETE negado pode acumular o conjunto em vez de substituir. A propriedade action oferecida no Select não entra no INSERT e fetchRules define block para qualquer linha. P-AUTH-10 reproduziu perda do conjunto sob erro e alert→payload sem action→block após reload. O efeito confirmado é perda/alteração da configuração administrativa; seu desligamento do enforcement é R2-AUTH-022.

**Evidências na fonte:**

- `src/components/security/RateLimitConfigPanel.tsx:37–57` — fetchRules transforma toda ação em block; blob `d530018985f63fc004870100cbc0469e8112e215`.
- `src/components/security/RateLimitConfigPanel.tsx:86–110` — saveRules não transacional; blob `d530018985f63fc004870100cbc0469e8112e215`.
- `src/components/security/RateLimitConfigPanel.tsx:217–230` — Select das ações; blob `d530018985f63fc004870100cbc0469e8112e215`.

**Comparação com os 104 anteriores:** Comparado com os 104 registros anteriores por caminho, fluxo e assunto; não há equivalente material. Não reconta achado anterior.

**Alegações documentais relacionadas:** 24.11 em COMPLETE_SYSTEM_FEATURES.md.

**Reprodução:** P-AUTH-10 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Salvar o conjunto de regras por operação atômica com validação de todos os campos, ou aplicar alterações individuais com versão e confirmação.
- Persistir e consumir cada ação suportada; retirar opção que não tem semântica implementada.
- Provar erro de inserção mantendo conjunto anterior e round-trip de block/throttle/alert sem mudar a intenção.

**Limites:**

- Não afirma que esta perda desative os limites fixados em código; a separação foi confirmada em R2-AUTH-022.
- Conclusão na fonte fixada; não mede implantação, políticas externas ou incidente real.

### R2-AUTH-024 — Overview de segurança apresenta estados e pontuação sem medição válida

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SecurityView overview/conta → SecurityOverview e SecuritySettingsPanel → instâncias próprias de useMFA; calculateScore → status exibido.

**Precondição:** Conta com TOTP já verificado, ou falha na consulta de alertas; qualquer conta no item Senha Forte.

**Falha e consequência:** useMFA inicializa factors=[] e só carrega por fetchFactors. SecurityOverview e SecuritySettingsPanel nunca chamam fetchFactors, logo exibem MFA desativado/zero fatores mesmo quando a tela MFASettings carrega os fatores corretos em outra instância do hook. calculateScore atribui 25 pontos à senha incondicionalmente e afirma que ela atende aos requisitos; a consulta de alertas que falha deixa [] e termina loading, então SecurityAlertsPanel afirma conta segura sem atividades suspeitas. Esses estados não distinguem ausência, dado ainda não carregado e falha. A revogação/inventário de sessões é tratada separadamente em R2-AUTH-004.

**Evidências na fonte:**

- `src/hooks/auth/useMFA.ts:25–45` — estado local e fetchFactors explícito; blob `9bab653552014a797abf58dcd4fbe6dc915e2ecd`.
- `src/components/security/SecurityOverview.tsx:33–81` — estado não carregado, erro de alertas e pontuação constante; blob `10e091960ce708acde6c9c405c496cbb2bb60418`.
- `src/components/security/SecurityOverview.tsx:138–145` — senha forte sempre enabled; blob `10e091960ce708acde6c9c405c496cbb2bb60418`.
- `src/components/security/SecuritySettingsPanel.tsx:30–57` — instância MFA sem fetch; blob `5a903d9cf20298cf2bc3e8ac553939103a16d7a8`.
- `src/components/security/SecurityPanels.tsx:43–57` — vazio vira afirmação de segurança; blob `329857e0d1cb4843a65a662f713cf2b4c9323f2c`.
- `src/components/mfa/MFASettings.tsx:25–33` — contraste: consumidor realmente busca fatores; blob `2874304ddab31651243b63e775a5c4f38cf50ba1`.

**Comparação com os 104 anteriores:** Comparado com os 104 registros anteriores por caminho, fluxo e assunto; não há equivalente material. Não reconta achado anterior.

**Alegações documentais relacionadas:** 24.2, 24.3 em COMPLETE_SYSTEM_FEATURES.md.

**Critérios de aceite para correção:**

- Usar fonte compartilhada e escopada por usuário para fatores, com loading/erro/zero distintos.
- Calcular ou rotular explicitamente os itens que realmente podem ser medidos; nunca afirmar força de senha sem dado verificável.
- Falha ao consultar alertas deve mostrar indisponibilidade, sem diagnóstico de ausência de incidentes; verificar conta com fator ativo e erro de leitura.

**Limites:**

- Falha de diagnóstico da UI; não pressupõe que a senha real seja fraca nem que exista incidente oculto.
- Conclusão na fonte fixada; não mede implantação, políticas externas ou incidente real.

### R2-AUTH-025 — Editor inline de empresa/cargo conserva vazio inicial e pode apagar dado carregado

**Severidade:** medium (P2). **Status:** CONFIRMED_OFFLINE.

**Consumidor → efeito:** ContactDetails → useContactEnrichedData assíncrono → seção Informações aberta por padrão → EditableField → updateContact.

**Precondição:** Empresa/cargo chega do enriquecimento depois de o campo montar vazio; usuário abre edição após ver o valor carregado e confirma sem preencher novamente.

**Falha e consequência:** EditableField copia value para draft apenas no useState inicial. Ao chegar value novo, o texto de leitura mostra o dado atual, mas clicar lápis só altera editing. O editor abre com draft antigo, inclusive vazio. handleSave compara esse draft com value carregado e manda string vazia para contacts, anunciando campo atualizado. P-AUTH-09 executou a declaração e closure de atualização reais e registrou company:'' para o mesmo contato. Escape também mantém rascunho abandonado e reabertura não recopia o valor corrente.

**Evidências na fonte:**

- `src/components/inbox/contact-details/ContactInfoSection.tsx:31–54` — draft/handleSave; blob `ef545e34a0f5e4395bded6212635bf98064c0040`.
- `src/components/inbox/contact-details/ContactInfoSection.tsx:56–99` — entrada de edição sem reset; blob `ef545e34a0f5e4395bded6212635bf98064c0040`.
- `src/components/inbox/contact-details/ContactInfoSection.tsx:109–146` — persistência e campos enriquecidos; blob `ef545e34a0f5e4395bded6212635bf98064c0040`.
- `src/hooks/crm/useContactEnrichedData.ts:52–75` — consulta assíncrona; blob `02f7398107d5debbf70bbda0ce3a85bbcd2a4b5b`.
- `src/components/inbox/contact-details/ContactAccordionSections.tsx:49–54` — consumidor da seção; blob `97f3a98d20dc468cb4b8c54fe79f1d3fa35f24ed`.
- `src/components/inbox/contact-details/contactDetailSections.ts:31–48` — info aberto por padrão; blob `fb9d7000347808119e9c9a7b884885baef26c106`.
- `src/components/inbox/RealtimeInboxView.tsx:340–343` — remount por conversa limita hipótese; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.

**Comparação com os 104 anteriores:** Comparado com os 104 registros anteriores por caminho, fluxo e assunto; não há equivalente material. Não reconta achado anterior.

**Reprodução:** P-AUTH-09 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Inicializar o draft com valor corrente ao entrar em edição e encerrar/cancelar de forma explícita; lidar com mudança externa durante edição sem perda silenciosa.
- Não permitir interação de edição como dado vazio enquanto um campo está carregando; preservar o valor conhecido.
- Reproduzir vazio inicial→dado carregado→editar/salvar e cancelar/reabrir; nenhum campo existente deve ser apagado por draft antigo.

**Limites:**

- Não alegado vazamento entre conversas: RealtimeInboxView usa key por conversation.id e remonta o painel. A prova usa o mesmo contato/instância.
- Scheduler mínimo de hooks/JSX e SDK gravador; não substitui teste React/browser completo.
- Conclusão na fonte fixada; não mede implantação, políticas externas ou incidente real.

### R2-AUTH-026 — Excluir nota de colega some da UI mesmo quando RLS preserva a nota

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ContactsView → ContactDetailPanel → ContactNotes lista todas as notas visíveis → botão excluir → DELETE por id → filtro local + toast.

**Precondição:** Usuário vê contato e nota escrita por outro perfil, então clica o botão de excluir oferecido nessa nota.

**Falha e consequência:** A política SELECT final permite ler notas do contato visível, mas DELETE exige também author_id do próprio usuário (sem exceção admin nessa policy). ContactNotes rende botão para toda nota, sem comparar autor, e faz DELETE sem select/count. Para nota de colega, RLS filtra a linha e a operação altera zero sem erro; o componente filtra a nota do estado e afirma Nota excluída. Ao recarregar ela reaparece. O banco preserva corretamente a autorização; a falha é de capacidade/apresentação e confirmação da mutação.

**Evidências na fonte:**

- `src/components/contacts/ContactNotes.tsx:43–70` — consulta das notas e autores; blob `e40f098a2d660b2e8eb88ec405fa506c1651bf11`.
- `src/components/contacts/ContactNotes.tsx:109–121` — DELETE e confirmação sem linhas; blob `e40f098a2d660b2e8eb88ec405fa506c1651bf11`.
- `src/components/contacts/ContactNotes.tsx:191–219` — botão para todo autor; blob `e40f098a2d660b2e8eb88ec405fa506c1651bf11`.
- `src/components/contacts/ContactDetailPanel.tsx:328–338` — consumidor ativo; blob `8211a8274c76126952c8f01dee30ce558e9df540`.
- `supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql:136–158` — substitui policies e SELECT visível; blob `a0c2e2f7484bfdd3808b3e30f2ca87cb4104428c`.
- `supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql:182–189` — DELETE apenas próprio autor; blob `a0c2e2f7484bfdd3808b3e30f2ca87cb4104428c`.

**Comparação com os 104 anteriores:** Comparado com os 104 registros anteriores por caminho, fluxo e assunto; não há equivalente material. Não reconta achado anterior.

**Critérios de aceite para correção:**

- Exibir capacidade de excluir a partir da autorização real e impedir interação de apagar nota alheia quando não permitida.
- Confirmar linha apagada antes de removê-la do estado e anunciar sucesso; zero linhas deve ser rejeição/conflito explícito.
- Testar nota própria, nota de colega, mudança de visibilidade e nota já removida; conferir comportamento coerente após reload.

**Limites:**

- Policy final corroborada pelo agente SQL; não executada requisição em banco vivo.
- Não classificado como bypass de RLS nem exclusão não autorizada; a nota permanece no banco.
- Conclusão na fonte fixada; não mede implantação, políticas externas ou incidente real.

### R2-AUTH-027 — Usuário pode liberar o próprio flag administrativo de download

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AdminView Permitir Download → useAdminData salva profiles.can_download; ImagePreview → useDownloadPermission lê o mesmo campo → libera handleDownload.

**Precondição:** Usuário authenticated dono de um perfil normal, com os campos comparados pela policy preservados e não nulos, cujo can_download foi desabilitado pelo administrador.

**Falha e consequência:** A policy permissiva permite UPDATE do próprio profile. A policy restritiva conserva role/access_level/permissions/is_active, e o trigger vencedor conserva role/access_level/permissions, mas nenhum deles protege can_download. O manifesto mantém grant UPDATE da tabela para authenticated. Um PATCH do próprio can_download=true passa por essas condições sem mudar outro privilégio. Após refetch/reload, o hook passa a permitir o download que a UI dizia depender do administrador.

**Evidências na fonte:**

- `src/components/admin/AdminView.tsx:181–191` — controle administrativo Permitir Download; blob `3e7e78463cbe8c8ab9d310a5f4a1988e2daafd7b`.
- `src/components/admin/useAdminData.ts:146–165` — persistência de can_download; blob `9c74e75a5e998a94189ff292ffbdfc113973ef9d`.
- `src/hooks/system/useDownloadPermission.ts:5–24` — leitura do flag como autoridade da UI; blob `0c1c6a36db0f658dedad8376aed764addc961134`.
- `src/components/inbox/ImagePreview.tsx:22–51` — bloqueio/desbloqueio e efeito download; blob `76de00c8dede81c06fa8ff859c2f2cef06dc7a4c`.
- `supabase/migrations/20260405230710_35b60740-aa0f-437d-9029-f5c0d8e1edf0.sql:16–41` — own UPDATE e campos restritos; blob `496e76b7a179da518723a777967301693505f1e6`.
- `supabase/migrations/20260830080000_fn_is_admin_and_fix_permissions_rls.sql:40–57` — trigger vencedor omite can_download; blob `f1ea0afaa371f86c9b024d4d86719b3dc5ad796d`.
- `supabase/schema-manifest.json:6662–6666` — grant UPDATE profiles authenticated no snapshot; blob `0a608dc2072999f1a3aded5bf6693e7e8c761537`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Restringir can_download à autoridade administrativa no banco por privilégio de coluna/RPC ou validação equivalente, mantendo o autoatendimento somente dos campos pessoais autorizados.
- Em ambiente isolado, own UPDATE de can_download deve ser negado para agente e permitido ao administrador; verificar também a revogação/refetch do gate.
- Definir o alcance real da política de download na UI; não apresentar ocultação de botão como garantia de impossibilidade de copiar mídia já legível.

**Limites:**

- Não abre leitura de imagens ou objetos adicionais: ImagePreview já exibe a mídia. O impacto demonstrado é alteração indevida de um flag administrativo e do comportamento oficial de download.
- role/access_level/permissions/is_active possuem proteções verificadas. O achado não afirma elevação a administrador ou reativação irrestrita.
- Sucessão de policies/trigger e grant corroborada pela área database; comparação aqui usa o snapshot e arquivos exatos, sem PATCH real.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-028 — Detalhe do contato mostra zero mensagens e inatividade por props nunca fornecidas

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ContactsView abre ContactDetailPanel(contact) → defaults messageCount=0/lastMessageAt=undefined → ContactEngagementScore e quadro Atividade.

**Precondição:** Qualquer contato com histórico de mensagens ou mensagem recente aberto pelo fluxo de detalhes da página Contatos.

**Falha e consequência:** O único consumidor de produção de ContactDetailPanel não passa messageCount nem lastMessageAt. O painel utiliza os defaults para mostrar 0 Mensagens e nenhuma Última msg e calcula score 0/Inativo. A consulta useContactsSearch chega a enriquecer last_message_at na lista, mas o painel não a utiliza. A timeline possui consulta própria e pode mostrar atividade ao lado desse resumo falso. A ausência da prop é apresentada como ausência de atividade, sem estado desconhecido/loading.

**Evidências na fonte:**

- `src/components/contacts/ContactsView.tsx:221–227` — montagem omite dados de atividade; blob `805de473b266d4bb067c7bd9875eefeaa612f4dc`.
- `src/components/contacts/ContactDetailPanel.tsx:122–124` — defaults de atividade; blob `8211a8274c76126952c8f01dee30ce558e9df540`.
- `src/components/contacts/ContactDetailPanel.tsx:202–207` — dados enviados ao score; blob `8211a8274c76126952c8f01dee30ce558e9df540`.
- `src/components/contacts/ContactDetailPanel.tsx:306–332` — resumo zero/data ausente e timeline separada; blob `8211a8274c76126952c8f01dee30ce558e9df540`.
- `src/components/contacts/ContactEngagementScore.tsx:21–59` — zero e ausência de recência viram Inativo; blob `e697d1012301818b44fa8e506683eeb913c538e2`.
- `src/hooks/crm/useContactsSearch.ts:140–154` — consulta de última mensagem existente; blob `001291ef8b983e934fc3691fe92516168a7549f1`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Obter contagem e última mensagem por consulta canônica de atividade do contato e conectar os valores ao painel.
- Separar zero confirmado, carregamento, indisponibilidade e dado não solicitado; só calcular engajamento quando os insumos necessários forem conhecidos.
- Validar contato com mensagens recentes, sem mensagens e consulta com erro, inclusive coerência entre timeline e resumo.

**Limites:**

- Não afirma perda de mensagens; a falha está na representação e classificação de atividade.
- Não duplica as falhas do Dashboard central: este consumidor e cálculo são componentes específicos da página Contatos.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-029 — Analytics de Contatos rotula agregados da página atual como totais

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** useContactsSearch busca página de 50 → ContactsView filteredContacts → ContactContentArea modo analytics → ContactAnalyticsDashboard.

**Precondição:** Resultado filtrado com mais de uma página; há contatos, empresas, tipos, tags ou datas fora da página carregada.

**Falha e consequência:** Todos os agregados de Analytics usam apenas o array da página atual. O cabeçalho apresenta contacts.length como total, e distribuição por tipo, Top Empresas/Tags e crescimento de 14 dias são calculados sobre o mesmo subconjunto sem identificação de amostra/página. Ordenar ou paginar altera os indicadores sem alterar o universo filtrado. A paginação é de substituição, não acumulação. Já useContactsKpi pagina toda a base elegível: essa proteção foi conferida e não é o consumidor desse dashboard.

**Evidências na fonte:**

- `src/hooks/crm/useContactsSearch.ts:11–19` — limite 50 e ordenação; blob `001291ef8b983e934fc3691fe92516168a7549f1`.
- `src/hooks/crm/useContactsSearch.ts:89–115` — consulta com offset e página retornada; blob `001291ef8b983e934fc3691fe92516168a7549f1`.
- `src/components/contacts/ContactsView.tsx:199–207` — envio de filteredContacts; blob `805de473b266d4bb067c7bd9875eefeaa612f4dc`.
- `src/components/contacts/ContactContentArea.tsx:125–130` — montagem de Analytics; blob `84fa3cee69c7e14e8b4311041cf41e2fe4400150`.
- `src/components/contacts/ContactAnalyticsDashboard.tsx:26–84` — agregação local e rótulo total; blob `df2c96b6afa676690314d46c19d315ecf24128ba`.
- `src/hooks/crm/useContactsKpi.ts:81–105` — controle existente: KPIs paginam toda a base; blob `08c8131332c4864ebaa0b1fba0460b472136dc29`.

**Comparação com os 104 anteriores:** DASH-METRICS-001 e DASH-CONTROLS-001 anteriores abrangem o Dashboard central. Este caminho específico ContactsView→ContactAnalyticsDashboard não aparece nos 104 e tem causa independente: o array paginado da lista alimenta os gráficos.

**Critérios de aceite para correção:**

- Calcular os agregados sobre o universo filtrado no servidor ou carregar explicitamente todas as páginas necessárias.
- Se a intenção for analisar somente a página, identificar esse escopo em todos os totais/gráficos e separar o total do universo.
- Conferir conjunto com mais de 50 registros: trocar ordenação/página não deve alterar os agregados do mesmo universo.

**Limites:**

- A ordenação/paginação e os filtros da lista são efetivos; o problema é o escopo apresentado nos indicadores.
- Não amplia a conclusão para os KPIs superiores, cuja paginação completa está implementada.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-030 — Configurações globais de cadastro, grupos, reabertura e chave ElevenLabs não têm consumidor operacional local

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SettingsView aba global → GlobalSettingsSection/IntegrationKeysSection → useGlobalSettings grava global_settings; fluxos de cadastro, mensagens e ElevenLabs usam outros contratos.

**Precondição:** Administrador altera user_creation, check_msg_is_group, group_tickets_enabled, auto_reopen_hours ou salva uma nova elevenlabs_api_key nessa UI esperando o comportamento descrito.

**Falha e consequência:** A busca de todos os consumidores de global_settings encontrou leituras operacionais de outras chaves, mas nenhum uso dessas cinco configurações. Os quatro controles globais gravam tabela e anunciam sucesso sem mudar os caminhos locais indicados. A chave ElevenLabs salva fica como Configurada na UI, enquanto a Edge TTS obtém ELEVENLABS_API_KEY do ambiente e a envia ao provedor; não consulta o valor salvo. A persistência por si só não cumpre o efeito que esses controles anunciam.

**Evidências na fonte:**

- `src/components/settings/SettingsView.tsx:173–179` — montagem da aba global; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/GlobalSettingsSection.tsx:14–30` — sucesso após updateSetting; blob `aed28a268824b050b0737ccd6f92a4bba8f35101`.
- `src/components/settings/GlobalSettingsSection.tsx:47–50` — promessas de cadastro/grupos; blob `aed28a268824b050b0737ccd6f92a4bba8f35101`.
- `src/components/settings/GlobalSettingsSection.tsx:86–101` — promessa de reabertura por horas; blob `aed28a268824b050b0737ccd6f92a4bba8f35101`.
- `src/components/settings/IntegrationKeysSection.tsx:19–25` — chave persistida e finalidade prometida; blob `324ab15044adc79255aabf561cdfb71c6030dbf3`.
- `src/components/settings/IntegrationKeysSection.tsx:42–56` — salvar chave e anunciar sucesso; blob `324ab15044adc79255aabf561cdfb71c6030dbf3`.
- `src/hooks/system/useGlobalSettings.ts:55–78` — UPDATE/UPSERT somente em global_settings; blob `fd11dfb307d58536fe54b15664a20cb9b49419c6`.
- `supabase/functions/elevenlabs-tts/index.ts:16–35` — credencial efetiva obtida do ambiente; blob `f49c89be09d3410275bd194fcafbd119ccb8d4a1`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Conectar cada configuração a um consumidor operacional obrigatório e documentar sua semântica, ou remover/identificar claramente o controle sem efeito.
- Definir uma única autoridade segura para a chave de integração e mostrar o estado da configuração realmente usada.
- Provar em ambiente isolado que cada alteração muda o efeito anunciado e que erros de aplicação não geram mensagem de conclusão.

**Limites:**

- VPS, integrações externas e infraestrutura não incluídas na fonte não foram inspecionadas; um consumidor externo permanece não demonstrado, não é declarado inexistente.
- Existem outras chaves global_settings efetivamente consumidas: manutenção WhatsApp, múltiplas conexões, transcrição automática e Meta. Não é um achado sobre a tabela inteira.
- RLS de leitura permite admin/supervisor e escrita apenas admin; nenhum valor real de credencial foi lido, exportado ou incluído.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-031 — Resposta de verificação da senha anterior pode substituir o veredito da senha atual

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** Cadastro/ResetPassword → PasswordStrengthMeter(password) → efeito com debounce → consulta por prefixo de hash → estado isBreached/breachCount.

**Precondição:** Usuário altera uma senha A com consulta já iniciada para senha B; as respostas concluem fora de ordem ou a resposta antiga termina durante o debounce da nova.

**Falha e consequência:** A limpeza do efeito cancela somente o timer, não a consulta já iniciada. checkBreach fecha sobre a senha de sua renderização e grava o estado compartilhado sem comparar a senha/requisição atual. Assim a resposta negativa de A pode sobrescrever o resultado positivo de B e exibir Senha não encontrada em vazamentos conhecidos para B, ou exibir falso comprometimento no sentido inverso. O início da troca também conserva o resultado anterior até a próxima consulta. O feedback de segurança não está vinculado ao valor que ele descreve.

**Evidências na fonte:**

- `src/components/auth/PasswordStrengthMeter.tsx:78–128` — debounce sem cancelamento/identidade de request; blob `7b4b33691a370fd30791e6df12980b3bb1d2132d`.
- `src/components/auth/PasswordStrengthMeter.tsx:200–230` — veredito apresentado para password atual; blob `7b4b33691a370fd30791e6df12980b3bb1d2132d`.
- `src/pages/Auth.tsx:247–248` — consumidor de cadastro; blob `e46405258feeca90108090ebcecdd5d4a42d7325`.
- `src/pages/ResetPassword.tsx:166–175` — consumidor de recuperação; blob `e753267c38793665b3ace3b715488f7da3d6c177`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Associar veredito ao valor/hash e geração da consulta; cancelar ou ignorar respostas obsoletas.
- Ao mudar senha, apresentar estado não verificado/loading, sem reutilizar a confirmação da senha anterior.
- Provar duas consultas em ordem inversa, alteração para senha curta/vazia e falha de rede; só a resposta do valor atual pode controlar a UI.

**Limites:**

- Não afirma que o Auth implantado aceite senhas comprometidas: a configuração e validação final do servidor não foram medidas.
- Nenhuma senha real nem consulta de senha a serviço externo foi utilizada; a falha decorre da ordem possível de callbacks do código.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-032 — Auditoria não inclui concessões e revogações de roles nos filtros e no contador sensível

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** INSERT/DELETE user_roles → trigger audit_role_changes grava role_granted/role_revoked com entity_type=user_roles → AuditLogDashboard classifica e filtra.

**Precondição:** Há uma concessão ou revogação de role entre os registros de auditoria consultados por um administrador.

**Falha e consequência:** O writer vencedor grava role_granted e role_revoked. O contador Ações Sensíveis só reconhece action contendo delete, role_change ou export, portanto essas duas operações de acesso não entram. O filtro de entidade Usuários consulta igualdade com user, e não user_roles, retirando também os registros de concessão/revogação/alteração da lista. A persistência da trilha está implementada; é o consumidor que interpreta outro vocabulário e pode mostrar ausência de mudanças de acesso.

**Evidências na fonte:**

- `supabase/migrations/20260409224329_51d839cf-6068-4a17-b32b-9a7e12866a61.sql:51–54` — trigger ativo de user_roles; blob `fd5fc4f6ad77392976819f631f91bb867e4bd150`.
- `supabase/migrations/20260924125400_fix_audit_role_changes_function_name_mismatch.sql:22–72` — writer vencedor de ações e entidade; blob `570d872e5259e2c04d98c71acd1a1e66f2d55626`.
- `src/components/security/AuditLogDashboard.tsx:68–91` — filtros exatos e classificação sensível; blob `eeb1ec4850ef61f8c939d7dcf798e0556395db89`.
- `src/components/security/AuditLogDashboard.tsx:130–134` — contador anunciado; blob `eeb1ec4850ef61f8c939d7dcf798e0556395db89`.
- `src/components/security/AuditLogDashboard.tsx:185–196` — opção Usuários usa user; blob `eeb1ec4850ef61f8c939d7dcf798e0556395db89`.
- `src/components/security/SecurityView.tsx:144–145` — montagem ativa; blob `f98bce6c4ae825ec3591cd58a346ba7390e6caa7`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Derivar filtros/categorias de um contrato compartilhado de ações e entidades, incluindo grant, revoke, change e auto-provisionamento conforme política.
- Validar end-to-end isolado INSERT/DELETE/UPDATE de role e conferir filtro de Usuários e contador de ações sensíveis.
- Distinguir consulta sem resultados de erro de carregamento; informar recorte/paginação quando exibir contagens parciais.

**Limites:**

- Os eventos continuam gravados e podem aparecer no filtro Todas ou em outros consumidores. Não é falha de criação nem apagamento da trilha.
- Cadeia do trigger/corpo final foi corroborada pela área database.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-033 — Página de roles usa embed inexistente e transforma erro de consulta em listas vazias

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** Rota /admin/roles → RolesPage → useRolesPageState.fetchUsers → user_roles com embed profiles!user_roles_user_id_fkey.

**Precondição:** Administrador abre a página sobre o schema descrito pelas migrations e pelo manifesto fixado.

**Falha e consequência:** A FK user_roles_user_id_fkey foi criada para auth.users(id); não há FK para public.profiles nesse nome. A consulta exige justamente profiles por essa FK, e os tipos exportados registram Relationships=[] para user_roles. O erro de relação no PostgREST não é tratado: fetchUsers apenas pula setUsers e termina loading. As quatro colunas ficam em zero/Nenhum usuário com esta role, embora roles existam, e a lista de atribuição considera todos os profiles como sem role porque users permaneceu vazio. A página AdminView faz outra consulta e join manual por user_id, portanto não está indisponível por esta mesma causa.

**Evidências na fonte:**

- `src/pages/admin/RolesPage.tsx:23–43` — consumidor e gate administrativo; blob `2570d2624fff497e2a0b241a5578b10b1f26cc65`.
- `src/pages/admin/useRolesPageState.ts:29–52` — embed inválido, erro ignorado e efeito nas opções; blob `fbc2cdb99980e754bc1bb8641224a6a571fb5b4f`.
- `src/pages/admin/RolesPage.tsx:77–112` — listas vazias apresentadas como ausência de roles; blob `2570d2624fff497e2a0b241a5578b10b1f26cc65`.
- `supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql:4–11` — FK real aponta auth.users; blob `c5af0f701bcf7259e01de8785950f9595bf143fb`.
- `supabase/schema-manifest.json:4562–4562` — presença da FK no snapshot; blob `0a608dc2072999f1a3aded5bf6693e7e8c761537`.
- `src/integrations/supabase/types.ts:8838–8858` — Relationships vazio no tipo exportado; blob `f641f0d8bd81656165019ced14cf862be7eac489`.
- `src/components/admin/useAdminData.ts:57–75` — controle existente: join manual em outra página; blob `9c74e75a5e998a94189ff292ffbdfc113973ef9d`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Usar consulta/RPC/view ou relação real autorizada para ligar roles aos perfis pelo user_id, sem inventar relacionamento no select.
- Propagar estado de erro com retry; não transformar falha estrutural de consulta em Nenhum usuário.
- Validar consulta real em schema isolado com admin/supervisor/agente/especial e usuários com e sem role; conferir a lista e as opções de atribuição.

**Limites:**

- Não se afirma que roles foram removidas, nem que a autorização Auth/RLS deixa de funcionar.
- Não foi disparada consulta contra PostgREST implantado; incompatibilidade da relação é estabelecida pela cadeia SQL/snapshot e pela semântica oficial de resource embedding.
- Schema cache/configuração externa fora da fonte não foram medidos.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-034 — Aba Notas trata erros devolvidos pelo serviço como conclusão e descarta o texto antes de salvar

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ConversationTabContent aba notes → NotesTab AddInline/PromiseItem → useContactNotes mutations → ContactService.addNote/updateNote/deleteNote → resposta Supabase.

**Precondição:** A requisição de adicionar, alterar ou excluir nota devolve error no objeto Supabase: por exemplo, INSERT negado após perda de visibilidade, erro de validação/servidor ou alteração de promessa de outro autor.

**Falha e consequência:** ContactService devolve a resposta integral nas três mutations, sem throwOnError nem inspeção de error. useContactNotes retorna essa promessa como mutationFn, também sem conferir error; por isso a promessa resolvida com erro aciona onSuccess. Adicionar/excluir emitem toast de sucesso e atualizar apenas invalida, sem o aviso de falha. Na adição, AddInline chama onSave e limpa value/dueDate imediatamente; NoteCategoryCard fecha o editor antes de aguardar. Assim o operador pode receber Nota adicionada sem persistência e perde o texto que precisaria reenviar. PromiseItem oferece toggle para notas de qualquer autor, embora o botão excluir nesse consumidor compare corretamente author_id.

**Evidências na fonte:**

- `src/components/inbox/chat/ConversationTabContent.tsx:111–117` — montagem ativa da aba Notas; blob `bd077b3c1c296dfc877f6152e15a927b1b6a5a0a`.
- `src/components/inbox/tabs/NotesTab.tsx:25–39` — submit descarta rascunho sem aguardar onSave; blob `9433ea3939aba07342996759a45416b0bf5f8487`.
- `src/components/inbox/tabs/NotesTab.tsx:80–111` — fechamento imediato e gate correto de excluir; blob `9433ea3939aba07342996759a45416b0bf5f8487`.
- `src/components/inbox/tabs/NotesTab.tsx:155–168` — checkbox sem gate de autoria; blob `9433ea3939aba07342996759a45416b0bf5f8487`.
- `src/hooks/crm/useContactNotes.ts:54–107` — mutationFn devolve resultado sem verificar error; blob `e0d514eabe45c0c91b308b1beba975fa736dc154`.
- `src/hooks/crm/useContactNotes.ts:109–123` — mutateAsync exposto aos consumidores; blob `e0d514eabe45c0c91b308b1beba975fa736dc154`.
- `src/services/contact.service.ts:126–154` — resposta Supabase não convertida em exceção; blob `4b61093c59aeb3aa0700a98163614180b167253f`.
- `supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql:154–180` — SELECT visível e UPDATE somente pelo autor; blob `a0c2e2f7484bfdd3808b3e30f2ca87cb4104428c`.
- `src/components/email/EmailContactPanel.tsx:294–307` — consumidor de email aguarda promessa mas error não provoca catch; blob `e6654b221d11f9eec8975aef0bf28e3fa864caa4`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Converter erros de dados em rejeição explícita no serviço ou no mutationFn e confirmar a linha afetada antes de acionar onSuccess.
- Aguardar a mutation no editor, manter o texto em caso de falha e desabilitar envios duplicados enquanto pendente.
- Exibir capacidades coerentes para alterar promessas e excluir notas; testar retorno {data:null,error}, zero linhas e sucesso com linha confirmada.
- Conferir que erro de persistência gera aviso de erro, mantém editor/rascunho e não emite Nota adicionada ou Nota removida.

**Limites:**

- É outro consumidor/contrato de serviço que AUTH026: ContactNotes da página Contatos confere error, mas não count; aqui o hook ignora error no objeto resolvido.
- Exceções JavaScript realmente lançadas, como perfil ausente, entram no onError existente. A falha se refere ao contrato normal de retorno de erro do cliente Supabase.
- EmailContactPanel também usa o hook e limpa o mesmo texto após await. Ele protege texto novo digitado durante a requisição, mas não percebe o error engolido; essa proteção foi preservada na análise.
- Nenhuma nota real foi criada, alterada ou removida. A garantia de RLS não é contornada; a falha é de feedback e preservação do trabalho.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-035 — Status WhatsApp converte indisponibilidade em ausência de status e apresenta Offline sem medição

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ContactDetails → ContactAccordionSections Status WhatsApp → useWhatsAppStatus → find-status-messages/send-chat-presence → WhatsAppStatusSection.

**Precondição:** Operador abre a seção para contato com uma instância resolvida; modo Evolution GO ou resposta de erro/indisponibilidade na consulta de status.

**Falha e consequência:** O backend GO devolve explicitamente success:false/notSupported:true. extractStatusRecords aceita somente array ou messages.records, e fetchData não lê error/notSupported: o objeto vira lista vazia. A UI passa a dizer Nenhum status disponível e explica expiração em24h, sem revelar a indisponibilidade. Em toda conclusão normal, mesmo com dados, o hook fixa isOnline:false e lastSeen:null; a segunda chamada envia a própria presença paused, não consulta a presença do contato. Portanto Offline é um valor inventado, não um estado observado.

**Evidências na fonte:**

- `src/components/inbox/contact-details/ContactAccordionSections.tsx:70–72` — montagem ativa da seção; blob `97f3a98d20dc468cb4b8c54fe79f1d3fa35f24ed`.
- `src/hooks/integrations/useWhatsAppStatus.ts:106–118` — objetos não reconhecidos viram array vazio; blob `8e84cb398425173b7cf683e252cb09695462e27c`.
- `src/hooks/integrations/useWhatsAppStatus.ts:191–219` — actions e resultado fulfilled sem inspeção de error; blob `8e84cb398425173b7cf683e252cb09695462e27c`.
- `src/hooks/integrations/useWhatsAppStatus.ts:251–260` — lista e presença fixa; blob `8e84cb398425173b7cf683e252cb09695462e27c`.
- `src/components/inbox/contact-details/WhatsAppStatusSection.tsx:67–85` — ausência e Offline exibidos como fatos; blob `e1091b2e92073a3771f208350a2e63e1168fbe46`.
- `supabase/functions/evolution-api/index.ts:727–733` — gate GO explícito e retorno do ramo v2; blob `9cdb8a370723f17a03c0296316ff937636dc1844`.
- `supabase/functions/evolution-api/index.ts:845–845` — action envia presença própria; blob `9cdb8a370723f17a03c0296316ff937636dc1844`.
- `supabase/functions/_shared/evolution-sync-actions.ts:93–100` — resposta notSupported explícita; blob `89b3b26f1ce05ce9284c6e313b94489fd8a9e30d`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Propagar indisponibilidade/notSupported e erros HTTP/provedor para um estado visual diferente de vazio confirmado.
- Mostrar presença desconhecida/indisponível quando não há fonte real; só afirmar Online/Offline/lastSeen a partir de medição válida.
- Não executar envio de presença como se fosse leitura; manter a decisão de stories desabilitados claramente identificada, sem reabrir sua ativação por inferência.
- Validar resposta GO notSupported, erro no objeto do SDK, lista vazia confirmada e lista real, sem rede de produção.

**Limites:**

- Não afirma que stories devam ser habilitados: GO_GAPS e StoryViewer documentam desativação/ausência de suporte. O achado é a representação enganosa dessa capacidade.
- Correlação por nome/sufixo de telefone no ramo com dados também foi lida, mas não se contou vazamento ou associação real indevida sem cenário/retorno externo demonstrado.
- Não houve consulta de status real nem envio de presença; confirmação do action backend foi corroborada pela área providers.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-036 — Sala de Crise calcula alertas operacionais com mensagens respondidas e contas habilitadas

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AdminView aba crisis → CrisisRoom.loadMetrics → quatro contagens Supabase → severidades/queueRatio → MODO CRISE ATIVO ou Operação normal.

**Precondição:** Há mais de30 mensagens recebidas na última hora, mesmo já respondidas, ou contas habilitadas que não representam agentes online; a sala é aberta pelo staff.

**Falha e consequência:** Msgs sem resposta conta todas as mensagens sender=contact da última hora, sem verificar resposta ou estado da conversa. Esse volume é dividido por profiles.is_active e rotulado conv/agente, embora numerador seja mensagens e denominador contas habilitadas. O mesmo denominador aparece como agentes online. Mais de30 mensagens recebidas já respondidas basta para acionar crise. SLA é contado sem janela/estado e erros de consulta viram zero. O monitor anunciado em tempo real só carrega na montagem ou no botão, sem assinatura/polling, portanto mudanças posteriores também ficam invisíveis até atualização manual.

**Evidências na fonte:**

- `src/components/admin/AdminView.tsx:278–284` — montagem da aba crisis; blob `3e7e78463cbe8c8ab9d310a5f4a1988e2daafd7b`.
- `src/components/admin/CrisisRoom.tsx:23–43` — queries e transformação de unidades; blob `bdac65a1d88c0a8b0f16f789c9369b38cafb9d5f`.
- `src/components/admin/CrisisRoom.tsx:45–83` — rótulos, thresholds e decisão de crise; blob `bdac65a1d88c0a8b0f16f789c9369b38cafb9d5f`.
- `src/components/admin/CrisisRoom.tsx:85–108` — carregamento inicial e promessa de tempo real; blob `bdac65a1d88c0a8b0f16f789c9369b38cafb9d5f`.
- `src/components/admin/CrisisRoom.tsx:158–162` — única atualização adicional manual; blob `bdac65a1d88c0a8b0f16f789c9369b38cafb9d5f`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Definir e implementar métricas canônicas de pendência/resposta, conversas atribuídas e presença de agentes, com unidades coerentes.
- Definir a janela e estado do SLA usado na crise e separar erro/indisponibilidade de zero confirmado.
- Conectar atualização operacional real ou identificar claramente o snapshot e a hora da última consulta.
- Conferir fixture com mensagens todas respondidas, contas habilitadas offline, SLA histórico e falha de consulta; nenhum desses proxies deve criar conclusão gerencial sem fundamento.

**Limites:**

- Não é o Dashboard principal coberto por DASH-METRICS-001/DASH-REALTIME-001; CrisisRoom possui suas próprias queries e decisão de severidade, sem referências nos104.
- Nenhuma operação de mitigação é disparada pelo modo crise: o efeito comprovado é alerta/diagnóstico gerencial incorreto.
- Não se mediu operação, presença ou incidentes reais.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-037 — Treinamento apresenta e persiste avaliação de desempenho baseada apenas em sorteio

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AdminView aba training → TrainingMode.startScenario/sendResponse → finalScore aleatório → feedback sobre empatia/resolução → training_sessions e histórico.

**Precondição:** Usuário conclui as respostas do cenário de treinamento com qualquer conteúdo não vazio.

**Falha e consequência:** A nota usa exclusivamente secureRandomFloat, produzindo inteiro entre60 e100, sem avaliar as mensagens do agente. O feedback Excelente/boa empatia e resolução ou Bom/mais proativo depende só dessa nota. Ela é gravada como score/status completed e apresentada no resultado e histórico sem identificar que a avaliação é aleatória. O texto Simulador de atendimento e os roteiros fixos explicam a conversa simulada, mas não tornam um juízo de desempenho por sorteio uma medição. A resposta que exigiria melhorar nunca é alcançada pela faixa atual.

**Evidências na fonte:**

- `src/components/admin/AdminView.tsx:280–282` — montagem do treinamento; blob `3e7e78463cbe8c8ab9d310a5f4a1988e2daafd7b`.
- `src/components/admin/TrainingMode.tsx:108–145` — resposta, sorteio, feedback e persistência; blob `198205753719626442ddd81e7599c0864506420e`.
- `src/lib/secureRandom.ts:14–17` — fonte uniforme independente do conteúdo; blob `476661d7819c1a27d1bc04b106ba3e2a537d5b8c`.
- `src/components/admin/TrainingMode.tsx:181–197` — notas no histórico de sessões; blob `198205753719626442ddd81e7599c0864506420e`.
- `src/components/admin/TrainingMode.tsx:235–245` — nota e juízo apresentados ao usuário; blob `198205753719626442ddd81e7599c0864506420e`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Identificar claramente notas/dados de demonstração e evitar persistir feedback aleatório como avaliação de desempenho.
- Se a intenção é avaliar, definir critérios verificáveis ligados às respostas e revisão humana adequada; se não, remover os juízos avaliativos e registrar apenas conclusão do exercício.
- Conferir respostas diferentes e repetições da mesma resposta: a saída deve respeitar o contrato de simulação/avaliação comunicado ao usuário.
- Tratar falhas de gravação e manter estado consistente antes de declarar sessão concluída.

**Limites:**

- Não se afirma que o resultado seja usado para promoção, punição ou avaliação definitiva de empregados; nenhum consumidor com esse efeito foi demonstrado.
- Roteiros fixos de simulação são compatíveis com treinamento e não são defeito por si só. O achado se limita à nota/feedback sem fundamento e sua apresentação/persistência.
- Nenhuma sessão de treinamento real foi criada nem pontuação alterada.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-038 — Mapa conta contatos com coordenadas também como localização apenas aproximada

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ContactContentArea modo map → ContactMapView agrupa todos por DDD e extrai preciseContacts → ContactRegionMap desenha ambos e publica duas contagens.

**Precondição:** Existe ao menos um contato carregado com latitude/longitude numéricas e telefone cujo DDD corresponde a uma região plotada. O mapa carrega normalmente.

**Falha e consequência:** O conjunto regions inclui todos os contatos, inclusive aqueles enviados em preciseContacts. ContactRegionMap soma regions para Aproximado pelo DDD e desenha uma bolha por região; em seguida desenha o pino confirmado para o mesmo contato e conta-o de novo em Endereço confirmado. Um único contato com coordenada e DDD conhecido resulta em1 confirmado e1 aproximado, embora haja1 contato mapeado. Pode aparecer em dois locais quando o endereço e o centro do DDD divergem. A legenda promete distinguir quantos contatos estão só por aproximação, mas as populações se sobrepõem.

**Evidências na fonte:**

- `src/components/contacts/ContactContentArea.tsx:125–130` — montagem ativa do mapa; blob `84fa3cee69c7e14e8b4311041cf41e2fe4400150`.
- `src/components/contacts/ContactMapView.tsx:43–60` — agrupamento inclui todos e extração independente de coordenadas; blob `3077b8584decaeecdfdcc1aeffebdcf14c700da7`.
- `src/components/contacts/ContactMapView.tsx:65–82` — total de contatos e dois conjuntos passados ao mapa; blob `3077b8584decaeecdfdcc1aeffebdcf14c700da7`.
- `src/components/contacts/ContactRegionMap.tsx:59–65` — contagem aproximada sem exclusão dos precisos; blob `5eab1972370062e84b2164a5f8a931b7e8c91d41`.
- `src/components/contacts/ContactRegionMap.tsx:146–180` — duas séries de marcadores; blob `5eab1972370062e84b2164a5f8a931b7e8c91d41`.
- `src/components/contacts/ContactRegionMap.tsx:218–234` — legenda com contagens de confirmação e aproximação; blob `5eab1972370062e84b2164a5f8a931b7e8c91d41`.
- `supabase/migrations/20260930450000_contacts_include_legacy_filter.sql:22–34` — search_contacts vigente devolve latitude/longitude do contato; blob `f4acf38fcd554ab0c8af81785721ddb416f1c858`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Definir conjuntos exclusivos para os pinos precisos e as bolhas de contatos sem coordenada; calcular a legenda sobre os conjuntos efetivamente plotados.
- Manter o agrupamento comercial por DDD nos cartões se desejado, mas separar essa classificação do mapa de localização física e dos seus totais.
- Conferir um contato preciso, um apenas aproximado e outro de região não plotável: nenhum contato deve inflar a contagem de localizações por aparecer nos dois conjuntos.

**Limites:**

- Não se reabre a decisão de usar DDD como aproximação quando falta coordenada. A falha é a sobreposição do conjunto de aproximação com os endereços já coordenados.
- Não depende de coordenadas de produção, nem afirma que o endereço de um cliente real esteja incorreto. Trata-se do contrato do mapa para dados válidos.
- Os dados continuam sujeitos ao recorte da lista carregada; AUTH029 trata separadamente do escopo de Analytics.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-039 — Recálculo atrasado grava coordenadas do endereço anterior e apaga o aviso de desatualização

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ContactDialogs edição → ContactForm campos de endereço/Recalcular → getMapboxToken/searchPlaces → onChange funcional → useContactsCRUD.handleEditContact → contacts UPDATE.

**Precondição:** No mesmo formulário e contato, há coordenada anterior; o operador altera o endereço paraB e aciona Recalcular. Antes da resposta, altera um campo paraC e depois salva após a resposta deB.

**Falha e consequência:** recalcularCoordenada captura o endereço alvo e aguarda duas operações, sem versão/cancelamento nem comparação com os valores atuais. Os campos continuam editáveis. A edição paraC marca a coordenada como possivelmente velha, mas a resposta deB escreve latitude/longitude no estado atual por onChange e limpa incondicionalmente o aviso. O salvamento posterior envia o endereçoC junto das coordenadasB. O botão Recalcular evita duas buscas simultâneas, mas não protege a correlação da resposta com o endereço vigente.

**Evidências na fonte:**

- `src/components/contacts/ContactDialogs.tsx:115–129` — formulário e handlers ativos de edição; blob `58090d806f7bae4a01a77d70f2dc2011e31c2778`.
- `src/components/contacts/ContactForm.tsx:117–123` — aviso quando endereço muda com coordenada existente; blob `7001d84ebda623d6bd8f2903b2afd73fcb730c18`.
- `src/components/contacts/ContactForm.tsx:145–172` — alvo capturado, await e commit sem comparação; blob `7001d84ebda623d6bd8f2903b2afd73fcb730c18`.
- `src/components/contacts/ContactForm.tsx:326–365` — input de endereço permanece editável; blob `7001d84ebda623d6bd8f2903b2afd73fcb730c18`.
- `src/components/contacts/ContactForm.tsx:393–435` — outros campos editáveis e bloqueio apenas do botão; blob `7001d84ebda623d6bd8f2903b2afd73fcb730c18`.
- `src/components/contacts/useContactsCRUD.ts:300–306` — onChange aplica valores ao estado mais recente; blob `8be3bec66e4631d55516b740125ceddcb240cf41`.
- `src/components/contacts/useContactsCRUD.ts:187–219` — endereço e coordenadas atuais compõem o UPDATE; blob `8be3bec66e4631d55516b740125ceddcb240cf41`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Vincular a resposta à assinatura/versão do endereço consultado e descartar conclusão que perdeu essa correspondência.
- Cancelar ou invalidar a consulta ao editar novamente, e só remover o aviso após confirmar que a coordenada pertence ao endereço vigente.
- Conferir B→busca pendente→C→respostaB→salvar no mesmo contato; coordenadaB não deve ser apresentada ou gravada como correspondente aC.
- Preservar a decisão de não apagar automaticamente coordenadas antigas: a correção deve tratar a resposta obsoleta, não remover dados sem ação autorizada.

**Limites:**

- O cenário não depende de alternar contatos nem de remontagem do componente; React.memo não bloqueia a edição, pois os valores mudam.
- Se o operador não muda o endereço enquanto a consulta está em voo, essa corrida não ocorre. Nenhum endereço real foi geocodificado nem salvo.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-040 — Janela relativa do painel de uso de IA fica presa à hora de abertura

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ViewRouter ai-usage → AIUsageDashboard Última1h/Atualizar → useAIUsageDashboard memo since → polls/refetch de resumo e logs → totais e histórico.

**Precondição:** O painel permanece montado com o mesmo filtro por algum tempo, há logs que deixam de pertencer à janela relativa e ocorre polling de30s ou atualização manual.

**Falha e consequência:** since é calculado com Date apenas na montagem ou troca de timeFilter. As consultas periódicas e o botão Atualizar continuam usando esse limite inferior antigo. ai_usage_summary resolve p_until=null para now; a lista usa somente created_at>=since. Logo a janela cresce: selecionada Última1h às12h, a consulta feita às13h ainda inclui registros desde11h, cobrindo duas horas sob o mesmo rótulo. Trocar filtro/remontar recalcula o início, mas o uso contínuo do painel altera o significado dos totais, taxas e gráficos.

**Evidências na fonte:**

- `src/pages/ViewRouter.tsx:92–96` — view ai-usage registrada; blob `9964a4ea364a29ff6a59c5e49e199c2eeab22ec9`.
- `src/pages/lazyViews.ts:55–55` — componente importado pela view; blob `25ec6997136245c412cbee7db745690c03a62bc3`.
- `src/components/admin/AIUsageDashboard.tsx:13–38` — consumidor, filtros relativos e atualização manual; blob `70d210e6b14eea8bebfe8dbc42c2c2580cab18c8`.
- `src/hooks/analytics/useAIUsageDashboard.ts:107–115` — cálculo relativo ao relógio; blob `0513a0133af0880244ce50be2f672d9e6d3b0aca`.
- `src/hooks/analytics/useAIUsageDashboard.ts:147–175` — since memoizado e polling do resumo; blob `0513a0133af0880244ce50be2f672d9e6d3b0aca`.
- `src/hooks/analytics/useAIUsageDashboard.ts:198–214` — lista paginada com o mesmo limite antigo; blob `0513a0133af0880244ce50be2f672d9e6d3b0aca`.
- `src/hooks/analytics/useAIUsageDashboard.ts:287–303` — refetch sem renovar since; blob `0513a0133af0880244ce50be2f672d9e6d3b0aca`.
- `supabase/migrations/20261003072707_ia056_agregacao_no_servidor.sql:35–59` — RPC amplia fim até now preservando p_since; blob `08b2636612f6a3aa062c8fb497bd490e92b95dfc`.

**Comparação com os 104 anteriores:** IA-QUOTA-001 trata ação/tentativa/contabilização, e os antigos achados DASH tratam outro painel. Não foi localizado nos104 o timestamp memoizado deste hook.

**Critérios de aceite para correção:**

- Calcular limites coerentes para cada ciclo de atualização e compartilhá-los entre resumo, custos e paginação; renovar a janela conforme o filtro relativo anunciado.
- Se a intenção for um intervalo fixo, exibir início/fim absolutos e manter ambos estáveis, sem rótulo de últimas horas.
- Usar relógio controlado em ambiente isolado: após avançar uma hora e refazer Última1h, excluir registros mais antigos que uma hora e conferir limites equivalentes nos consumidores.

**Limites:**

- As agregações no servidor e a paginação real da lista existem; este achado não reabre o antigo limite de1000 linhas nem afirma que o resumo some apenas a página.
- O custo possui contrato próprio com p_until; sua resposta não foi usada para provar crescimento da janela neste registro.
- Nenhuma métrica real ou valor faturado foi consultado.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-041 — Consulta de custo de IA passa fim nulo e elimina todas as chamadas da janela

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** AIUsageDashboard → useAIUsageDashboard consulta de custos → ai_usage_cost_summary(p_since,p_until:null) → janela SQL vazia → custoTexto → nenhuma chamada com tarifa aplicável.

**Precondição:** Usuário com acesso ao painel e à RPC; existem logs visíveis no período com quantidade medida e tarifa válida para o modelo. A migração versionada está aplicada.

**Falha e consequência:** O cliente envia p_until:null explicitamente em todas as consultas. A função de custo exige created_at<p_until e não converte null em now. A comparação com null não é verdadeira para nenhuma linha, portanto janela/com_tarifa/medido ficam vazios, chamadas=0 e custo_medido=null independentemente das tarifas existentes. A UI interpreta isso como nenhuma chamada com tarifa aplicável. ai_usage_summary possui COALESCE para now, mas a função de custo é um contrato separado e não herda esse comportamento. O bloco de uso pode mostrar chamadas ao lado de uma ausência de custo fabricada pelo parâmetro.

**Evidências na fonte:**

- `src/components/admin/AIUsageDashboard.tsx:13–19` — consumo do hook e custoTexto; blob `70d210e6b14eea8bebfe8dbc42c2c2580cab18c8`.
- `src/hooks/analytics/useAIUsageDashboard.ts:181–196` — RPC de custo recebe p_until null; blob `0513a0133af0880244ce50be2f672d9e6d3b0aca`.
- `supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql:26–46` — definição única e predicado com limite nulo; blob `8ccd359ad959cf7be4775ba4e9364f9c0dff2321`.
- `supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql:80–135` — agregação vazia produz zero chamadas e custo nulo; blob `8ccd359ad959cf7be4775ba4e9364f9c0dff2321`.
- `src/hooks/analytics/useAIUsageDashboard.ts:271–284` — formatação preserva custo nulo e ausência de tarifa zero; blob `0513a0133af0880244ce50be2f672d9e6d3b0aca`.
- `src/components/admin/AIUsageDashboard.tsx:122–134` — causa falsa exibida no painel; blob `70d210e6b14eea8bebfe8dbc42c2c2580cab18c8`.
- `supabase/migrations/20261003072707_ia056_agregacao_no_servidor.sql:47–59` — controle positivo: resumo de uso resolve fim nulo; blob `08b2636612f6a3aa062c8fb497bd490e92b95dfc`.

**Comparação com os 104 anteriores:** Nenhum dos104 achados anteriores menciona ai_usage_cost_summary ou o parâmetro final nulo. IA-QUOTA-001 trata quota por ação/tentativa, não esta consulta de tarifa IA-055.

**Critérios de aceite para correção:**

- Definir o contrato de limite final e usar a mesma janela válida nas duas RPCs; converter null explicitamente ou enviar fim não nulo pelo consumidor.
- Verificar em ambiente isolado uma chamada tarifada, uma sem tarifa, moedas diferentes e janela vazia real, com o mesmo payload usado pela UI.
- Não apresentar ausência de tarifa quando a consulta perdeu todas as linhas por parâmetro inválido; expor validação/erro de contrato quando necessário.
- Preservar o tratamento existente de moedas diferentes, vigência de tarifa, RLS e ausência real de medição.

**Limites:**

- Sucessão da função conferida por busca da cadeia e corroborada pelo agente database: única criação no arquivo20261003102707. Não houve execução em banco vivo.
- Não afirma custo faturado incorreto ou cobrança indevida; o efeito demonstrado é a falha de medição/apresentação no relatório local.
- Comparação SQL com NULL documentada na fonte primária PostgreSQL. O problema é independente da janela que cresce em AUTH040.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-042 — Página Conquistas apresenta progresso simulado como pertencente ao usuário

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ViewRouter achievements(userId) → AchievementsSystem → timer de800ms carrega MOCK_ACHIEVEMENTS → níveis/progresso/data → AchievementDetailDialog Reivindicar Recompensa.

**Precondição:** Usuário abre a view Conquistas, inclusive conta nova sem mensagens/conquistas. O componente termina o timer local de carregamento.

**Falha e consequência:** O componente ignora userId para obter dados: sempre carrega os mesmos oito mocks com três conquistas desbloqueadas,400 XP e progressos fixos como756 conversas resolvidas. Datas são sintetizadas a partir de Date.now. A interface não identifica demonstração. Reivindicar a conquista nova emite celebração/toast de XP e muda apenas isNew localmente; não grava recompensa nem altera saldo. Reabrir remonta os mesmos dados e a recompensa pode aparecer nova de novo. Existe outro painel que consulta agent_stats/agent_achievements, mas a view roteada não o utiliza.

**Evidências na fonte:**

- `src/pages/ViewRouter.tsx:109–113` — view achievements montada com userId; blob `9964a4ea364a29ff6a59c5e49e199c2eeab22ec9`.
- `src/components/gamification/AchievementsSystem.tsx:45–81` — dados fixos, carregamento sintético e claim local; blob `3cdf421925fe46502f3218787c4eeade264f57e1`.
- `src/components/gamification/AchievementsSystem.tsx:130–187` — nível, XP e progresso apresentados sem rótulo de demonstração; blob `3cdf421925fe46502f3218787c4eeade264f57e1`.
- `src/components/gamification/AchievementDetailDialog.tsx:61–79` — recompensa e botão reivindicar; blob `360bbe28d4e455ae225453aa4d08b06159907af6`.
- `src/hooks/gamification/useAgentGamification.ts:32–61` — controle positivo: consultas reais existentes no outro painel; blob `033d36c21d9cc59f985972d1581893f274cdd889`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Conectar a view ao estado autorizado do usuário e distinguir carregamento, ausência real, erro e demonstração.
- Se os mocks permanecerem como demonstração, identificar esse modo e não apresentá-los como saldo ou desempenho da conta.
- Vincular resgate à operação autorizada/idempotente confirmada e atualizar o saldo, ou remover a promessa de recompensa real.
- Conferir conta nova, conta com conquistas e reabertura após resgate: valores e datas devem vir da fonte correspondente e não se repetir por remontagem.

**Limites:**

- Não se afirma uso dessas pontuações em decisões trabalhistas. O efeito comprovado é a atribuição visual de desempenho e saldo inexistentes na fonte consumida.
- Leaderboard e AchievementsPanel têm consultas reais; não se afirma que toda a infraestrutura de gamificação seja mock.
- Nenhuma conquista real foi criada, reivindicada ou alterada.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-043 — Mini-games anunciam ganho de XP sem consumidor que credite a recompensa

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** Dashboard GamificationSection → DashboardWidgetRenderer mini-games → TrainingMiniGames sem onXPEarned → conclusão do jogo → toast Você ganhou XP.

**Precondição:** Usuário abre o widget de mini-games e conclui um dos jogos implementados com pontuação positiva.

**Falha e consequência:** A única montagem produtiva de TrainingMiniGames não fornece onXPEarned. handleGameComplete chama opcionalmente essa prop e sempre informa Você ganhou N XP. Seus únicos writes efetivos são score/estado local e miniGameHighScores no localStorage, sem usuário, RPC ou integração ao saldo agent_stats. Assim a conclusão anuncia recompensa, mas nenhuma operação de crédito é executada no caminho atual. O componente oferecer callback não comprova que ele esteja conectado.

**Evidências na fonte:**

- `src/components/dashboard/overview/GamificationSection.tsx:18–40` — widget visível encaminhado ao renderer; blob `0f52d78baef6aa404998c7fc98d1d38da60da27d`.
- `src/components/dashboard/DashboardWidgetRenderer.tsx:144–148` — único consumidor omite onXPEarned; blob `566782938f8de0bebcd166ded452b4f89970abe3`.
- `src/components/gamification/TrainingMiniGames.tsx:11–44` — callback opcional, writes locais e confirmação incondicional; blob `5ed087017c1fa5b97603845b75316d785b2b9129`.
- `src/components/gamification/MiniGameDialogs.tsx:87–95` — conclusão do quiz com pontuação e XP; blob `8569ac3983114bb1e1c4f00b7d7fead20a1727cc`.
- `src/hooks/gamification/mutations.ts:8–20` — operação real de XP existe, mas não está ligada ao mini-game; blob `1889a388d52b105a028ad8c133dbd5960bbb6948`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Definir se XP do jogo é apenas pontuação local ou recompensa da conta e comunicar essa distinção na interface.
- Se houver crédito real, conectar a conclusão ao contrato autorizado e idempotente e confirmar somente após persistência; não confiar apenas em número fornecido pelo cliente.
- Conferir saldo antes/depois e após reload, conclusão repetida e falha do crédito. O texto de sucesso deve corresponder ao efeito confirmado.
- Separar recordes locais por usuário quando a apresentação for pessoal e validar o formato salvo antes de carregar.

**Limites:**

- O jogo e o recorde local existem; a falha não é ausência de toda mecânica de treinamento.
- Não houve invocação real da RPC de XP. Políticas e autorização dessa RPC pertencem à análise SQL, e sua existência não foi tratada como garantia de crédito pelo frontend.
- O problema de fechar o jogo seguinte é independente e está em AUTH044.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-044 — Speed Typing encerrado conclui o jogo seguinte e grava seu recorde sem jogá-lo

**Severidade:** medium (P2). **Status:** CONFIRMED_OFFLINE_PROBE.

**Consumidor → efeito:** TrainingMiniGames mantém os três componentes montados → SpeedTypingGame timer chega a zero → onComplete inline muda no rerender → effect de conclusão roda mesmo fechado → handleGameComplete captura novo selectedGame.

**Precondição:** Na mesma montagem do widget, o usuário conclui Speed Typing e depois abre outro jogo, por exemplo Quiz.

**Falha e consequência:** SpeedTypingGame não redefine isActive ao concluir/fechar e seu effect chama onComplete sempre que timeLeft===0, sem gate isOpen nem marca de conclusão. O pai recria handleGameComplete em cada render e mantém o componente montado mesmo com o Dialog fechado. Ao selecionar Quiz, a nova closure continua sendo chamada pelo Speed Typing já encerrado: ela usa selectedGame=quiz, grava o score de digitação como recorde do Quiz, anuncia sua conclusão e fecha o diálogo recém-aberto. A prova offline terminou uma frase de33 pontos, observou duas conclusões e depois um Quiz fechado com33 pontos e16 XP anunciados, sem responder pergunta.

**Evidências na fonte:**

- `src/components/gamification/MiniGameDialogs.tsx:18–37` — state do timer e effect sem gate de abertura/conclusão; blob `8569ac3983114bb1e1c4f00b7d7fead20a1727cc`.
- `src/components/gamification/TrainingMiniGames.tsx:25–44` — callback usa selectedGame atual, salva recorde e fecha jogo; blob `5ed087017c1fa5b97603845b75316d785b2b9129`.
- `src/components/gamification/TrainingMiniGames.tsx:53–58` — seleção do próximo jogo; blob `5ed087017c1fa5b97603845b75316d785b2b9129`.
- `src/components/gamification/TrainingMiniGames.tsx:78–80` — componentes permanecem montados e callback inline compartilhado; blob `5ed087017c1fa5b97603845b75316d785b2b9129`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Reprodução:** P-AUTH-11 em `../../probes/auth/results.json`/`source-probes.cjs` (01–08), `../../probes/auth/second-pass-results.json`/`second-pass-probes.cjs` (09–10) ou `../../probes/auth/gamification-results.json`/`gamification-probe.cjs` (11).

**Critérios de aceite para correção:**

- Encerrar/cancelar timer e marcar cada partida como concluída uma única vez, considerando isOpen e uma identidade estável da partida.
- Vincular score à partida que o produziu, sem depender do selectedGame da closure recriada posteriormente.
- Conferir terminar/fechar digitação, abrir Quiz e Emoji, reabrir digitação e rerender do dashboard: não pode haver conclusão, crédito ou recorde sem evento válido da respectiva partida.
- Cancelar callbacks pendentes no fechamento/desmontagem e preservar os jogos novos de conclusões tardias dos anteriores.

**Limites:**

- P-AUTH-11 executa declarações reais e constantes fixadas com scheduler React sintético de useState/useEffect e60 ticks virtuais. Outros jogos são elementos stub; nenhuma resposta do Quiz é submetida.
- O teste não é navegador/E2E e não comprova frequência em produção. Ele reproduz o ordenamento e os writes locais sem rede ou banco.
- Não é inflação de saldo real: AUTH043 documenta que o consumidor atual não credita XP no banco.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-045 — CSAT carrega a configuração sem sincronizar o formulário e pode sobrescrevê-la com defaults

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SettingsView aba CSAT → CSATAutoConfig consulta csat_auto_config → estados locais → Salvar Configuração atualiza a linha carregada.

**Precondição:** Staff autorizado abre a aba com cache de csat-auto-config vazio; existe uma configuração com ao menos um valor diferente dos defaults. A consulta termina depois da primeira renderização e o operador salva o formulário.

**Falha e consequência:** Os quatro estados recebem defaults na primeira renderização. O trecho rotulado Sync state when data loads usa useState com initializer, executado somente na inicialização, e não acompanha a chegada de config. Após o retorno, a UI continua desativada, com atraso 5, mensagem padrão e nenhuma conexão. O callback de salvar já enxerga config.id e faz UPDATE dessa linha com os estados antigos. Assim uma abertura normal com cache vazio pode desativar uma configuração existente e apagar conexão/mensagem personalizada. isLoading é obtido mas não bloqueia nem inicializa o formulário.

**Evidências na fonte:**

- `src/components/settings/SettingsView.tsx:209–213` — montagem ativa com gate staff; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/CSATAutoConfig.tsx:27–48` — consulta assíncrona, defaults e initializer usado como sincronização; blob `859fe36d2678fc57ac847fb6d77fc79662b1a6d0`.
- `src/components/settings/CSATAutoConfig.tsx:50–75` — payload local atualiza id carregado e anuncia sucesso; blob `859fe36d2678fc57ac847fb6d77fc79662b1a6d0`.
- `src/components/settings/CSATAutoConfig.tsx:100–120` — estado do switch e atraso; blob `859fe36d2678fc57ac847fb6d77fc79662b1a6d0`.
- `src/components/settings/CSATAutoConfig.tsx:126–166` — conexão/template e Save sem gate de loading; blob `859fe36d2678fc57ac847fb6d77fc79662b1a6d0`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Inicializar os campos somente depois de resolver a consulta e distinguir ausência real de configuração de erro ou carregamento.
- Sincronizar dados carregados sem substituir edições locais novas; resetar deliberadamente o formulário por identidade/versão da configuração.
- Validar cache vazio com configuração ativa, atraso diferente de 5, conexão e mensagem customizada: abrir e salvar sem alterações deve preservar cada campo.
- Em falha de leitura, não permitir inserção ou sobrescrita de defaults apresentada como atualização da configuração existente.

**Limites:**

- A gravação requer as permissões do usuário e pode ser negada por RLS. A falha não contorna autorização.
- Cache já preenchido antes da montagem pode inicializar os valores corretamente; a precondição é a chegada assíncrona após a primeira renderização.
- Não houve envio de pesquisa, alteração real de configuração nem afirmação sobre o executor CSAT externo.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-046 — Seletor de proficiência sempre cadastra nível 3 independentemente da escolha

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SettingsView aba Roteamento → SkillBasedRoutingSettings seletor Nível → adicionar habilidade → INSERT agent_skills.skill_level.

**Precondição:** Staff autorizado seleciona um agente, informa uma nova habilidade, escolhe nível 1, 2, 4 ou 5 e adiciona com sucesso.

**Falha e consequência:** O Select começa em 3, oferece 1–5 e usa onValueChange vazio. O botão de adicionar envia literalmente level:3, que o mutationFn grava como skill_level. A escolha visível não participa do payload: competências novas são cadastradas com proficiência diferente da informada. Após refetch, a UI exibe três estrelas. O contrato SQL skill_based_assign compara skill_level>=min_level, mas o único hook encontrado não tem consumidor produtivo demonstrado; portanto o achado se limita ao cadastro e não afirma atribuição automática incorreta em produção.

**Evidências na fonte:**

- `src/components/settings/SettingsView.tsx:221–225` — aba ativa de roteamento; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/SkillBasedRoutingSettings.tsx:67–80` — mutation grava level como skill_level; blob `0defc5b754ad0a9e8d2bf684fcb53caf89667538`.
- `src/components/settings/SkillBasedRoutingSettings.tsx:150–157` — estrelas refletem valor persistido; blob `0defc5b754ad0a9e8d2bf684fcb53caf89667538`.
- `src/components/settings/SkillBasedRoutingSettings.tsx:166–194` — onValueChange vazio e level 3 literal; blob `0defc5b754ad0a9e8d2bf684fcb53caf89667538`.
- `supabase/migrations/20260828000000_guard_secdef_batch.sql:142–171` — contrato consumidor SQL e fallback; não prova chamada ativa; blob `e86202aca15619acfe8f4a3e8d2aab93e92a5a5a`.
- `src/hooks/system/useSkillBasedAssign.ts:9–28` — único wrapper RPC encontrado, sem consumidor ativo; blob `6a49bc54ca4748e2f983d402c3031263daf31517`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Controlar o nível selecionado em estado e usar esse valor validado no payload de criação.
- Conferir criação dos cinco níveis e recarregamento da lista; cada registro deve mostrar exatamente o nível escolhido.
- Separar validação do cadastro da integração de roteamento; somente afirmar atribuição por habilidade quando existir consumidor que execute e aplique a decisão.

**Limites:**

- Não há elevação de papel nem escrita sem permissão demonstrada. Trata-se de integridade de um dado administrativo.
- O seletor de nível mínimo da fila possui estado e envia o valor escolhido corretamente; não é afetado por este literal.
- skill_based_assign também possui fallback sem requisito quando não encontra candidato. Esse comportamento não foi julgado sem regra de negócio correspondente.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-047 — Aba Sons altera um estado privado que o botão Salvar não persiste nem aplica aos alertas

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SettingsView aba Sons → SoundCustomizationPanel instancia useUserSettings próprio → controles locais; Salvar Alterações usa outra instância do hook no pai; alertas usam useNotificationSettings.

**Precondição:** Usuário altera Sons habilitados, horário silencioso, tipo de som ou Volume geral na aba Sons, clica Salvar Alterações e espera a preferência nos próximos alertas/reabertura.

**Falha e consequência:** O painel chama useUserSettings sem receber os settings/callbacks do pai. updateSettings apenas muda useState dentro de cada instância. Nenhum callback do painel chama saveSettings; o botão geral salva os valores antigos da instância de SettingsView. Além disso, o hook nem lê nem inclui os cinco *_sound_type no payload. masterVolume só controla a legenda e o slider; o preview usa gain 0.3 fixo. O upload grava um arquivo mas descarta o caminho, sem acrescentar opção ou vinculá-lo a categoria. Os alertas reais consultam outro hook e continuam com as preferências persistidas. A UI pode mostrar som desligado ou silencioso e confirmar Configurações salvas enquanto alertas mantêm o comportamento anterior.

**Evidências na fonte:**

- `src/components/settings/SettingsView.tsx:37–60` — instância do pai e botão Salvar Alterações; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/SettingsView.tsx:165–171` — painel de Sons montado sem props de estado; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/SoundCustomizationPanel.tsx:22–64` — gain fixo, hook privado, volume local, tipos e upload sem associação; blob `841c102f63385924d18dc1f0707c0dcbefdaffd5`.
- `src/components/settings/SoundCustomizationPanel.tsx:73–108` — toggles/sliders/categorias usam apenas estado privado; blob `841c102f63385924d18dc1f0707c0dcbefdaffd5`.
- `src/hooks/system/useUserSettings.ts:106–146` — mapping omite tipos e updateSettings somente local; blob `2ed33a6cf26d8a2dcd977b9c5b8fa3e2efac09a3`.
- `src/hooks/system/useUserSettings.ts:149–204` — salvar usa closure da própria instância, omite tipos e confirma sucesso; blob `2ed33a6cf26d8a2dcd977b9c5b8fa3e2efac09a3`.
- `src/hooks/system/useNotificationSettings.ts:84–102` — alertas leem preferências persistidas pelo hook canônico; blob `d576442b7696f7eb30c9043d57c7dc0d1b3d486a`.
- `src/hooks/realtime/useRealtimeNotifications.ts:31–43` — player real recebe tipo/volume canônicos; blob `408174af1e23336ed41e9e75b99513a77e8052e1`.
- `src/components/notifications/SoundVolumeControl.tsx:40–60` — controle positivo: volume rápido usa updateSettings canônico; blob `16e774c3f6bc02d1154f44654788341805bce155`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Compartilhar uma fonte de preferências e callbacks de persistência entre painel e botão Salvar, ou salvar explicitamente cada alteração no hook canônico.
- Usar vocabulário e valores de tipos reconhecidos pelo player/banco; vincular volume de preview ao controle anunciado e ao volume real.
- Completar associação, seleção e uso do som enviado, ou limitar a UI a upload de arquivo com estado claro de que ainda não foi aplicado.
- Validar desligar som, horário silencioso, tipo e volume: depois de salvar, refetch/reabrir e disparar alerta isolado devem produzir a mesma configuração. Falha de persistência deve manter pendência/erro.

**Limites:**

- R2-PLAT-003 trata os três booleans de eventos omitidos pelo hook canônico; aqui a causa é outra instância local de useUserSettings e a ausência de chamada a salvar. Não duplica os toggles desse achado.
- SoundVolumeControl e NotificationSettingsPanel possuem caminho canônico de persistência; não se afirma que todos os controles de som estejam inoperantes.
- Upload bem-sucedido continua criando um arquivo. O efeito ausente é aplicá-lo a alertas, não a existência do upload.
- Nenhum som foi reproduzido, arquivo enviado ou preferência real alterada.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-048 — Classificar Recentes contabiliza respostas de erro como conversas classificadas

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SettingsView Tags IA → AIAutoTagsConfig Classificar Recentes → invoke ai-auto-tag para até 20 contatos → processed → toast de conclusão.

**Precondição:** Há contato selecionado e ao menos uma chamada ai-auto-tag devolve o contrato normal {data:null,error}, por exemplo HTTP 429/402/502, ou a consulta inicial de contatos devolve error e data null.

**Falha e consequência:** O loop aguarda invoke sem inspecionar data/error e incrementa processed após cada promessa resolvida. O contrato documentado do cliente devolve erros HTTP/relay/fetch em error; eles não acionam esse catch. Dessa forma, mesmo todas as chamadas devolvendo erro, o mutation resolve com o número solicitado e exibe Tags atualizadas/N conversas classificadas por IA. Se a consulta inicial falha, return sem valor também aciona onSuccess e imprime undefined conversas. O endpoint possui recusas explícitas antes da gravação, portanto há respostas sem classificação que esse consumidor transforma em conclusão.

**Evidências na fonte:**

- `src/components/settings/SettingsView.tsx:203–207` — consumidor ativo com gate staff; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/AIAutoTagsConfig.tsx:40–73` — consulta inicial, erros ignorados, processed e toast; blob `89241a915ef1bba9b5b2cec3a60dc76edc6d872e`.
- `src/components/settings/AIAutoTagsConfig.tsx:99–110` — botão ativo da operação em lote; blob `89241a915ef1bba9b5b2cec3a60dc76edc6d872e`.
- `supabase/functions/ai-auto-tag/index.ts:19–35` — gates Auth/IA e retorno 429; blob `8a8a7bb0a20af5bc38fdbed09ec142bdd1cec103`.
- `supabase/functions/ai-auto-tag/index.ts:128–165` — respostas 402/429/502 sem resultado persistido; blob `8a8a7bb0a20af5bc38fdbed09ec142bdd1cec103`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Inspecionar error e o envelope de cada resposta; contar sucesso apenas quando o contrato confirmar a classificação correspondente.
- Retornar resumo estruturado com êxitos, falhas e itens sem conversa/dados, preservando motivo e possibilidade de retry.
- Se a consulta inicial falhar, rejeitar a mutation e exibir erro, sem interpolar undefined como contagem.
- Validar lote com todos os erros, sucesso parcial e nenhuma mensagem elegível; nenhuma recusa pode aumentar o contador de classificadas.

**Limites:**

- IA-METRICS-001/AutoTicketClassifier tratam outro consumidor que descarta o resultado de ai-classify-tickets; o mecanismo específico deste lote e o caminho AIAutoTagsConfig não constam nos 104 anteriores.
- R2-API-033 aborda persistência/limpeza de tags vazias no handler. Aqui não se afirma que o handler deixou de classificar após resposta válida; a falha está no resumo de chamadas com error no frontend.
- Nenhuma chamada de IA, classificação de contato real ou gasto externo foi realizado.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-049 — Abas de horário, mensagens e automação persistem preferências sem ligação aos executores versionados

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** SettingsView abas Horário/Mensagens/Automação → useUserSettings.saveSettings → user_settings do operador; rotinas locais de transcrição/fechamento/horários usam contratos separados.

**Precondição:** Staff altera horário/dias, mensagens automáticas ou parâmetros de automação dessas abas e salva, esperando o comportamento anunciado na operação versionada.

**Falha e consequência:** A UI anuncia envio de boas-vindas/ausência/encerramento, distribuição entre agentes, encerramento após minutos de inatividade e transcrição automática. Esses controles são gravados exclusivamente na linha pessoal user_settings. A busca de todos os consumidores locais encontrou leituras para UI/onboarding, mas nenhum executor desses campos em src/Edge; o catálogo SQL vigente não contém corpo que leia user_settings nem trigger de sincronização além de updated_at. O pipeline de áudio lê global_settings.auto_transcription_enabled; auto-close lê auto_close_config.inactivity_hours/close_message, e o módulo de conexão grava business_hours/away_messages. Portanto salvar esses campos não altera os contratos operacionais locais que foram rastreados. A persistência da preferência existe, mas a promessa de efeito global não está ligada ao executor versionado.

**Evidências na fonte:**

- `src/components/settings/SettingsView.tsx:37–60` — contexto operacional/staff e Save de preferências pessoais; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/SettingsView.tsx:132–150` — abas ligadas ao estado pessoal do pai; blob `c576115115689b975b3897df601519e09de34f53`.
- `src/components/settings/ScheduleSettings.tsx:29–61` — promessa de mensagem fora do horário e campos pessoais; blob `29cd27bb067e0f0f1ee0e8059134c85571fed8db`.
- `src/components/settings/MessagesSettings.tsx:14–64` — três promessas de mensagem automática e callbacks; blob `7355c277968bbb0bfa5895e5c26ce7bd844ea980`.
- `src/components/settings/AutomationSettings.tsx:25–96` — distribuição/inatividade/transcrição gravadas em settings; blob `33cb5f89a79d8748550c7805e7d7092be987654e`.
- `src/hooks/system/useUserSettings.ts:149–188` — único destino da gravação dos campos; blob `2ed33a6cf26d8a2dcd977b9c5b8fa3e2efac09a3`.
- `supabase/functions/_shared/evolution-webhook-messages.ts:705–727` — executor de transcrição consulta global_settings; blob `8dffb0359b8cf0c137b612b4c863840b34558930`.
- `supabase/functions/auto-close-conversations/index.ts:15–32` — executor consulta auto_close_config e inactivity_hours; blob `a983968235af033f560f2014dea71d9a4abc2fcb`.
- `src/hooks/business/useBusinessHours.ts:41–81` — horário/ausência por conexão vêm de outras tabelas; blob `84165629b83bee50fc9a0a518403d563526d09ba`.
- `src/hooks/inbox/useAutoCloseConversations.ts:18–42` — controle separado grava o config efetivo do auto-close; blob `e932a7cda769f4021f58d638f73af6a653404d38`.
- `supabase/migrations/20260315172343_620fdf49-ed46-4dd2-a33e-d1cd4bd89870.sql:84–84` — único trigger vigente de user_settings atualiza timestamp; blob `909e580860fd515173c018f01e9a4228aba34053`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Definir explicitamente escopo pessoal/global/por conexão e conectar os controles ao contrato realmente consumido pelas rotinas.
- Se o executor for externo, versionar ou referenciar seu contrato e demonstrar a leitura das chaves corretas antes de marcar a função concluída.
- Enquanto não houver consumidor demonstrado, apresentar esses controles como integração pendente e evitar a promessa automática de efeito na operação.
- Validar em ambiente isolado a mudança de cada campo até o efeito correspondente, incluindo preservação de outro usuário/conexão e sinalização de falha.

**Limites:**

- A conclusão é ausência de consumidor/sincronização no código e SQL versionados. Não prova inexistência de worker, automação ou serviço externo fora deste checkout.
- Há implementações separadas de horários, auto-close e transcrição. Não se afirma que essas funcionalidades inteiras sejam inexistentes ou que todos os seus controles estejam quebrados.
- A avaliação do algoritmo de auto-close e dos provedores pertence às áreas correspondentes; este registro limita-se ao vínculo entre controles e configuração consumida.
- AUTH030 trata outras chaves em global_settings. O registro atual identifica os campos operacionais de user_settings, com outro consumidor e outro destino de gravação.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-050 — Solicitação de exclusão de dados é confirmada mesmo quando o registro de auditoria falha

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ViewRouter privacy → LGPDComplianceView Confirmar Exclusão → RPC log_audit_event → toast de solicitação registrada e fechamento da confirmação.

**Precondição:** Usuário autenticado confirma a solicitação e o RPC devolve error no objeto de resposta, por exemplo por falha de transporte, sessão expirada ou recusa do banco.

**Falha e consequência:** handleDeleteRequest aguarda a chamada sem ler data/error. Uma resposta Supabase resolvida com error passa para toast.success e fecha o diálogo, afirmando que a solicitação foi registrada e será processada por administrador em até 30 dias. O único efeito chamado é o logger de auditoria. Não há confirmação de recebimento nem protocolo que diferencie falha e registro. Assim o solicitante pode encerrar o fluxo acreditando que existe um pedido quando nenhuma linha foi gravada. Exceção JavaScript lançada chega ao catch, mas o contrato normal de error devolvido não chega.

**Evidências na fonte:**

- `src/pages/ViewRouter.tsx:64–67` — view privacy ativa; blob `9964a4ea364a29ff6a59c5e49e199c2eeab22ec9`.
- `src/pages/lazyViews.ts:25–27` — import do componente real; blob `25ec6997136245c412cbee7db745690c03a62bc3`.
- `src/components/compliance/LGPDComplianceView.tsx:27–51` — RPC sem inspeção e confirmação incondicional; blob `82e0c7e6e69473a860a0d2b79dab15a02701c1ad`.
- `src/components/compliance/LGPDComplianceView.tsx:115–153` — texto de solicitação e confirmação do usuário; blob `82e0c7e6e69473a860a0d2b79dab15a02701c1ad`.
- `supabase/migrations/20260405230135_2bb8cb81-ac0c-44ad-b81e-d1bd2d4001a0.sql:39–62` — função de auditoria registra evento do ator; nenhum retorno de protocolo; blob `28ef88504d068a60fe421fe8f26cd099ef98df58`.

**Comparação com os 104 anteriores:** Comparados os 104 registros anteriores por assunto, caminho e cadeia de efeito; não foi localizado equivalente material.

**Critérios de aceite para correção:**

- Inspecionar e propagar error antes de afirmar recebimento; manter a confirmação aberta e informar possibilidade de tentar novamente quando falhar.
- Definir um contrato de solicitação com confirmação de gravação e identificador rastreável, preservando o fluxo administrativo de atendimento.
- Validar resposta {error}, exceção e sucesso: somente pedido confirmado deve produzir Solicitação registrada; nenhuma confirmação pode anteceder a persistência.
- Documentar o canal administrativo responsável e o estado do pedido sem tratar prazo textual como prova de processamento.

**Limites:**

- Não se afirma exclusão imediata nem ausência de procedimento administrativo/manual externo. O defeito provado é falso recebimento quando o RPC falha.
- O bloqueio de exportação é explícito e foi preservado como decisão existente; não é contado como novo no-op.
- Referências e prazo de 30 dias são textos da interface, não parecer sobre obrigações legais, conformidade ou prazo aplicável. Nenhum pedido real de exclusão foi enviado.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-051 — Resumo pós-chamada descarta a anotação ainda em edição ao fechar automaticamente

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** TelefoniaView sem linha selecionada → ActiveCallPanel em ended → PostCallSummary textarea → timer de 3 s → dispatch RESET → slot troca para NewCallPanel.

**Precondição:** A sessão terminou e o resumo está montado com ID de chamada. O usuário começa uma anotação, ainda não a salvou e o valor do contexto da sessão permanece estável durante os 3 segundos do timer.

**Falha e consequência:** O rascunho existe apenas em useState de PostCallSummary. O efeito agenda fechar incondicionalmente e depende somente da callback fechar, que depende da sessão, não do conteúdo ou do estado salvando. Digitar não adia nem cancela esse timer. Ao vencer, RESET leva ended a idle, o consumidor desmonta o resumo e o texto não salvo desaparece. O mesmo timer não protege uma gravação em curso; isso não prova cancelamento do request já enviado. O T64 oferece anotação rápida junto com resumo de 3 s, mas a implementação não concilia os dois comportamentos.

**Evidências na fonte:**

- `src/components/calls/PostCallSummary.tsx:23–55` — rascunho local, timer sem guarda de edição e persistência explícita; blob `b05c6fa19f749fb071fd67d5b6a9994331d21ea1`.
- `src/components/calls/PostCallSummary.tsx:70–83` — editor visível e ação de salvar; blob `b05c6fa19f749fb071fd67d5b6a9994331d21ea1`.
- `src/components/calls/ActiveCallPanel.tsx:42–55` — montagem do resumo no estado ended; blob `5a25d89dd259360fc9f03edee941e76f97b212d5`.
- `src/components/calls/TelefoniaView.tsx:66–69` — qualquer sessão não idle ocupa o painel ativo; blob `bc93425fb4ace67d66eba3611739e414e136e343`.
- `src/components/calls/TelefoniaView.tsx:269–278` — RESET para idle desmonta o painel e o rascunho; blob `bc93425fb4ace67d66eba3611739e414e136e343`.
- `src/lib/calls/session.ts:313–317` — RESET de ended retorna initialState; blob `45be0b4a8d5a9916a585255d644c974fa5d0338d`.
- `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md:150–155` — T64 combina duração do resumo e anotação rápida; blob `a9fd397db86fe6783ed5aa464a34f4f870020ebf`.

**Comparação com os 104 anteriores:** TEL-RUNTIME-001 anterior e CALL006–008 tratam transporte/overlay/identidade, e MOD013 trata nota aplicada ao ID trocado. O caso atual é descarte do rascunho pelo timer do resumo de encerramento, em uma única chamada.

**Critérios de aceite para correção:**

- Preservar os 3 s do resumo sem edição, suspendendo o fechamento enquanto houver rascunho ou gravação pendente, ou persistir o rascunho por ID fora do componente desmontado.
- Definir confirmação de descarte quando o usuário optar por fechar com texto não salvo e manter a anotação após falha de gravação.
- Verificar ended → digitar por mais de 3 s → salvar/falhar/fechar; o texto não pode desaparecer sem gravação ou descarte explícito.

**Limites:**

- O prazo de 3 s é decisão documentada e não foi tratado isoladamente como defeito; o problema é o descarte do editor ofertado na mesma superfície.
- Não se afirma perda de nota já persistida nem cancelamento do request. addCallNotes examina error e a invalidação de queries com prefixo calls corresponde a useMyCalls, controles positivos verificados.
- Não se reproduziu o cenário no navegador. O efeito depende da janela declarada de estabilidade do contexto; atualizações do provider podem reiniciar o timer.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-052 — A tabela de ligações cancela o acionamento por teclado do botão Ligar de volta

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** TelefoniaView → CallHistoryTable → foco no botão Ligar de volta → keydown Enter/Space borbulha ao tr → seleção da linha com preventDefault, sem dispatchStartCall.

**Precondição:** Histórico possui uma linha com telefone e o usuário focaliza seu botão Ligar de volta usando teclado; o acionamento é feito por Enter ou Espaço.

**Falha e consequência:** O tr tratador de onKeyDown não distingue o próprio alvo dos controles descendentes. Enter/Space executa preventDefault e onSelecionar mesmo quando o foco está no botão nativo. O botão tem somente onClick, e seu stopPropagation protege apenas click, não keydown. Cancelada a ação padrão de ativação do botão, o handler que prepara a ligação não recebe o click e a operação observada pelo código é selecionar o detalhe. O wrapper Button não sintetiza uma ativação alternativa. Trata-se de quebra do contrato de teclado do controle, não de bloqueio do caminho por mouse.

**Evidências na fonte:**

- `src/components/calls/CallHistoryTable.tsx:42–58` — handler da linha cancela também keydown dos descendentes; blob `95875db4d53ed37a3434193556f810127e0afedb`.
- `src/components/calls/CallHistoryTable.tsx:81–94` — botão de callback depende de click e só interrompe esse evento; blob `95875db4d53ed37a3434193556f810127e0afedb`.
- `src/components/ui/button.tsx:51–73` — wrapper renderiza button nativo sem fallback de teclado; blob `62ae6190d3f261f987deb3299358839e6b11cd56`.
- `src/components/calls/TelefoniaView.tsx:129–142` — callback ativo prepara a ligação pelo evento do domínio; blob `bc93425fb4ace67d66eba3611739e414e136e343`.
- `src/components/calls/TelefoniaView.tsx:253–259` — ligação real do callback ao componente; blob `bc93425fb4ace67d66eba3611739e414e136e343`.

**Comparação com os 104 anteriores:** A busca nos 104 achados anteriores e nos relatórios Calls/Módulos não localizou este locus de teclado. MOD014 trata a paginação ao selecionar e CALL007 trata encaminhamento de alerta; não são o mecanismo deste registro.

**Critérios de aceite para correção:**

- Restringir o atalho de seleção ao foco da própria linha, preservando o comportamento nativo dos controles internos.
- Validar separadamente linha e botão com Tab/Enter/Espaço: linha seleciona, Ligar de volta prepara exatamente uma ligação para o número correto; Escape preserva o contrato de seleção.
- Verificar em navegador a ação padrão e a ordem dos eventos, incluindo usuários de tecnologia assistiva, sem acionar chamadas reais.

**Limites:**

- Conclusão estática apoiada no contrato normativo de UI Events para ativação e cancelamento de keydown; não se afirma E2E, teste de leitor de tela ou cobertura de todos os navegadores.
- O caminho de click executa o callback e foi preservado como controle positivo. A ausência de telefone é uma guarda explícita e não é a precondição deste achado.
- Nenhuma chamada foi discada e nenhum evento de produto foi disparado durante esta revisão.
- Fonte fixada e contratos estáticos; não houve alteração de dados, execução de SQL vivo nem comprovação de incidente em produção.

### R2-AUTH-053 — O tema Diversity remove o indicador de foco definido para botões padrão e cards de tema

**Severidade:** medium (P2). **Status:** CONFIRMED_STATIC.

**Consumidor → efeito:** ViewRouter themes → ThemeCustomizer → PresetCard Diversity → useThemePreset.applyPreset → applyThemePreset escreve html[data-preset-id="diversity"] → override CSS casa com focus-visible:ring-2 do Button Salvar e dos cards.

**Precondição:** O preset Diversity está aplicado; o usuário navega por teclado até um botão padrão habilitado, como Salvar em ThemeCustomizer, ou um PresetCard. O consumidor demonstrado não declara um indicador de foco alternativo que vença o override.

**Falha e consequência:** O seletor [class*="ring-2"] examina a string de classes, portanto também casa com a classe variante focus-visible:ring-2, mesmo sem uma classe ring-2 isolada. Sob Diversity, box-shadow:none!important e as variáveis de ring zeradas vencem tanto o ring do Button quanto o box-shadow de :focus-visible global. Esses consumidores também removem outline. A regra criada para suprimir halos decorativos assim remove o indicador explícito de posição do foco, incluindo o botão Salvar ativo nas configurações. PresetCard apresenta o mesmo mecanismo. A conclusão é a remoção dos indicadores definidos no código nesses consumidores; a capacidade de receber foco e de ativar a ação por teclado não é cancelada por essa regra.

**Evidências na fonte:**

- `src/index.css:1–8` — entrada de estilos importa base e override Diversity; blob `254f24ac2540ee32491672d39fc3e537c629c518`.
- `src/pages/ViewRouter.tsx:70–80` — view themes registrada para ThemeCustomizer; blob `9964a4ea364a29ff6a59c5e49e199c2eeab22ec9`.
- `src/pages/lazyViews.ts:30–38` — import lazy do consumidor ativo; blob `25ec6997136245c412cbee7db745690c03a62bc3`.
- `src/components/settings/ThemeCustomizer.tsx:51–56` — botão Salvar padrão sem indicador de foco alternativo local; blob `d18de5ddd91aec626dc424aa7a6fec3f1e6e7369`.
- `src/components/settings/ThemeCustomizer.tsx:115–125` — catálogo clássico liga seleção do card a applyPreset; blob `d18de5ddd91aec626dc424aa7a6fec3f1e6e7369`.
- `src/components/settings/theme/presets.ts:394–400` — identidade do preset Diversity; blob `7dd4cfebae5f73aa69f079dde256bf4f6edfba93`.
- `src/components/settings/theme/presets.ts:554–564` — Diversity incluído no catálogo de presets; blob `7dd4cfebae5f73aa69f079dde256bf4f6edfba93`.
- `src/components/settings/theme/useThemePreset.ts:30–60` — seleção atualiza config e efeito aplica preset ao documento; blob `5f86f28d3b92ff7b5c75c32091bcbfbb951418a1`.
- `src/components/settings/theme/presets.ts:667–677` — applyThemePreset estampa data-preset-id no elemento html; blob `7dd4cfebae5f73aa69f079dde256bf4f6edfba93`.
- `src/styles/diversity-overrides.css:71–81` — seletor substring casa com focus-visible:ring-2 e remove sombras com important; blob `30d18102ff74eac76eaf6efdc692d36ec27f2b57`.
- `src/components/ui/button.tsx:8–18` — Button usa outline-none e ring para sinalizar foco; variação padrão não substitui esse indicador; blob `62ae6190d3f261f987deb3299358839e6b11cd56`.
- `src/components/ui/button.tsx:51–60` — wrapper aplica classes do Button ao elemento nativo; blob `62ae6190d3f261f987deb3299358839e6b11cd56`.
- `src/styles/base.css:209–223` — fallback global remove outline e usa box-shadow sem important; blob `dae510567cab6de8a7452dccc076c674ecec575b`.
- `src/components/settings/theme/PresetCard.tsx:37–51` — cards focalizáveis usam a mesma combinação outline-none/ring-2; blob `1567601abad8e24f29384cd3734e27a1758985f8`.

**Comparação com os 104 anteriores:** Busca por Diversity, foco/ring e box-shadow nos 104 achados prévios e relatórios atuais não localizou esse mecanismo. AUTH052 trata cancelamento de keydown na tabela de ligações; este achado trata exclusivamente a cascata do indicador visual sob um preset. O root realizou leitura integral de diversity-overrides.css; esta é revisão independente das faixas e da cadeia ativa de consumidores.

**Critérios de aceite para correção:**

- Restringir a supressão de sombras decorativas para preservar :focus-visible, ou definir um indicador explícito de foco que permaneça visível na cascata do preset.
- Verificar Tab e Shift+Tab no botão Salvar e nos PresetCards com Diversity em light e dark: o controle focalizado deve ter indicador distinto e a seleção/ativação deve permanecer funcional.
- Cobrir o estilo computado do foco no consumidor real e manter controles com outro preset; avaliar separadamente alto contraste e preferências do navegador, sem deduzir conformidade visual apenas das classes.

**Limites:**

- Conclusão estática de seletor, classes e precedência important, sem navegador, captura de tela, DOM executado, medição de contraste ou certificação WCAG.
- O seletor depende explicitamente de data-preset-id="diversity"; não se generaliza a perda de foco a outros presets ou a componentes que possuam indicador alternativo efetivo.
- O outline-none e o fallback global de box-shadow foram verificados; estilos de usuário, forced-colors do navegador e tecnologia assistiva não foram executados nem certificados.
- Não há novo probe: as onze provas offline anteriores permanecem preservadas, sem reexecução ou nova contagem. Nenhuma fonte ou dado de produto foi alterado.

## Reavaliação dos achados anteriores

- **TC-001:** Mantida evidência frontend de locators/payload de mídia; SQL/Storage final delegado ao agente banco. Não duplicada nos novos IDs.
- **TC-002, TC-003, TC-004, TC-009:** Delegados para reassessment SQL/grants/RLS pelo agente banco; não encerrados por esta revisão UI.
- **TC-005, TC-006:** Revalidada montagem/props/hooks e ampliada emR2-AUTH-017; não contar como novo defeito independente.
- **TC-007:** Mute continua com consumidor user_settings versus writer members; notifications montadas na view. Sem sinal de eliminação no caminho revisado.
- **TC-008:** Hook de departamento conserva contracts de audit/authUUID e tabela/RPC; entrada UI continua ausente. SQL final delegado.
- **TC-010:** Envio continua limpando texto/reply antes de await. R2-AUTH-010 adiciona outro mecanismo: troca de destinatário/conta; não substitui a perda pós-falha.
- **TC-011, TC-012, TC-013, TC-014, TC-015:** Histórico/qualidade de testes/scripts/quarentena preservado; não reexecutado como comprovação deste subescopo.
- **SV-001, SV-002:** Sem evidência de correção: agregado comercial continua completed/approved; fetchStats estima resposta com200 primeiras mensagens. Não recontados.
- **SV-003, SV-004, OTH-013, OTH-015:** Evidência visual/externa/histórica não substituída por leitura de código. Mantidas necessidades de aceite e reconciliação documental, sem novo runtime inventado.

## Casos não contabilizados: integrações, hipóteses rejeitadas e observações menores

Estes itens não entram na contagem de achados materiais novos. O status distingue integração pendente, precondição não demonstrada, hipótese rejeitada e observação estática de baixo impacto. A presença de um hook/componente/teste, ou a conexão do arquivo em um grafo de módulos, não prova que a operação exista no fluxo do usuário.

- **D-AUTH-01 — INTEGRATION_PENDING:** Hooks públicos sem private:true, mas zero importação/chamada de produção encontrada. Não classificar exposição ativa. Se ativados, validar membership no canal privado e identidade de payload. Caminhos: `src/hooks/team-chat/useTeamPresence.ts`, `src/hooks/team-chat/useTeamTyping.ts`.
- **D-AUTH-02 — NO_ACTIVE_CONSUMER:** CRMSyncButton retém contactNotFound/lastSyncTime e score0 por truthiness, porém somente export/definição foi encontrada. Header usa CrmSyncMenuItem em ContactActionButtons. Não incluir como bug do botão atual. Caminhos: `src/components/inbox/CRMAutoSync.tsx`.
- **D-AUTH-03 — INTEGRATION_PENDING:** lookup:sidebar não é aceito pelo gateway360/intelligence; hook não tem consumidor UI de produção. DTO/hook/testes existem, não integração atual concluída. Caminhos: `src/hooks/crm/useContactSidebar.ts`, `src/services/crm/external-crm.service.ts`, `src/types/contactSidebar.ts`.
- **D-AUTH-04 — INTEGRATION_PENDING:** Códigos gerados localmente sem persistência/redeemer, mas componente não aparece em fluxo MFA de produção. Não afirmar que usuário recebe códigos inválidos atualmente. Caminhos: `src/components/mfa/MFABackupCodes.tsx`.
- **D-AUTH-05 — INTEGRATION_PENDING:** Há shape/ID incorreto em GroupManagementDialog e transferência só atualiza created_by; ausência de consumidor impede classificar operação ativa. Integração de gestão é refinamentoTC005/006. Caminhos: `src/components/team-chat/GroupManagementDialog.tsx`, `src/components/team-chat/TransferConversationDialog.tsx`, `src/hooks/team-chat/useTeamUnreadCount.ts`, `src/hooks/team-chat/useTeamPerformance.ts`.
- **D-AUTH-06 — NO_ACTIVE_CONSUMER_FOR_SUSPECT_SYMBOL:** useSecureProfile não consumido em produção; hasPermission genérico do hook usePermissions também não é autorização efetiva do app. Não atribuir falha ao consumidor que usa RoleService/RPC. Caminhos: `src/hooks/auth/useSecureProfile.ts`, `src/hooks/system/usePermissions.ts`.
- **D-AUTH-07 — NO_ACTIVE_CONSUMER_FOR_SUSPECT_SYMBOL:** Promise de requiredPermission não cancela resposta antiga apesar do reset de estado; rotas atuais usam requiredRoles, e não foi encontrado uso ativo de withPermission. Navegação atual usa consultas escopadas. Mantido como revisão futura. Caminhos: `src/components/auth/ProtectedRoute.tsx`.
- **D-AUTH-08 — LIMITED_CONSUMER_REVIEW:** Estado/fetch não reinicia por contato. Consumidores atuais encontrados são amostra do TalkXWizard, não editor/sidebar; uso só leitura. Transferido ao escopo TalkX sem alegar alteração do contato errado. Caminhos: `src/hooks/crm/useContactCustomFields.ts`.
- **D-AUTH-09 — ACCEPTED_EXISTING_LIMIT:** Acesso direto ao password grant GoTrue é limite explicitamente aceito79–85. Não reaberto como achado novo. Cliente oficial efetivamente usa auth-login fail-closed. Caminhos: `docs/adr/ADR-006-login-lockout-server-side.md`.
- **D-AUTH-10 — DESIGN_REQUIREMENT_PRESERVED:** Ocultar erro/offline do painel360 atende tarefa1.4 do prompt antigo; não transformar retorno null nesse painel em novo defeito sem requisito mais recente. Caminhos: `src/components/inbox/contact-details/ExternalContact360Panel.tsx`, `src/services/crm/external-crm.service.ts`.
- **D-AUTH-11 — DISABLED_CAPABILITY_EXPLICIT:** PUSH_NOTIFICATIONS_ENABLED=false; a UI informa indisponibilidade. Subscription sem entrega backend não foi contada como falha ativa de push. Polling/toast existe somente onde montado; entrega fechada depende de ativação futura. Caminhos: `src/hooks/system/usePushNotifications.ts`, `src/config/service_worker.ts`, `src/components/security/SecurityNotificationsPanel.tsx`.
- **D-AUTH-12 — EXTERNAL_EFFECT_UNVERIFIED:** UI promete storage delete/liberação/whitelist. Hook e Edge (peer providers) só atualizam media_quarantine.decision/reviewed_at; não há fonte de triggers/worker VPS. Marcar efeito externo sem evidência, não afirmar no-op definitivo. Edge exige admin/supervisor para update. Caminhos: `src/hooks/integrations/useQuarantineMedia.ts`, `src/components/security/QuarantinePanel.tsx`, `supabase/functions/external-db-proxy/index.ts`.
- **D-AUTH-13 — PRECONDITION_UNVERIFIED:** Peer SQL identificou guard com NULL quando JWT não possui email em clear_login_attempts. Fluxos de autenticação locais examinados usam email; não há evidência de sessões phone/anonymous/custom sem claim. Não contada exploração de configuração não demonstrada. Caminhos: `supabase/migrations/20260829100000_fix_clear_login_operator_triple_arrow.sql`.
- **D-AUTH-14 — CROSS_CONVERSATION_VARIANT_REJECTED:** Painel é remontado por key conversation.id. R2-AUTH-025 conserva somente caso de enriquecimento assíncrono na mesma instância e reabertura de rascunho; hipótese de estado atravessar conversas foi retirada. Caminhos: `src/components/inbox/contact-details/ContactInfoSection.tsx`, `src/components/inbox/RealtimeInboxView.tsx`.
- **D-AUTH-55 — UNCONSUMED_LEGACY_PATHS_DISTINGUISHED_FROM_ACTIVE_NOTES:** Busca de símbolos/imports em produção não encontrou consumidor da barra genérica raiz nem SearchInput. A barra ativa de Contatos é outra implementação (AUTH013). No useCalls, os consumidores atuais desestruturam addCallNotes; start/answer/end/miss e getContactCalls não tiveram chamada produtiva localizada. Comentários que ainda atribuem mutations diretas a CallDialog/IncomingCallAlert estão superados pelos consumidores atuais do provider. DELETE/UPDATE sem count e callbacks genéricos não foram apresentados como jornada operacional nova. Caminhos: `src/components/BulkActionsBar.tsx`, `src/components/SearchInput.tsx`, `src/hooks/communication/useCalls.ts`.
- **D-AUTH-56 — POSITIVE_CONTROL_PRIOR_FILTER_CONTRACT:** KPI converte períodos em datas a cada queryFn, envia p_from/p_to e normaliza canal all para undefined; errors são propagados. São controles positivos já citados no TEL-PERIOD-001 anterior, que trata a divergência do histórico. A query key omite usuário, mas AuthProvider limpa queryClient em SIGNED_OUT/signOut; não foi demonstrado reaproveitamento entre usuários por essa chave. Datas usam o fuso local do navegador e end-of-day; não foi medida divergência de fuso nem caso produtivo de precisão submilissegundo. Não há novo finding Calls. Caminhos: `src/hooks/calls/useCallsKpi.ts`, `src/components/calls/CallsKpiGrid.tsx`, `src/hooks/auth/useAuth.tsx`.
- **D-AUTH-57 — PRIOR_FINDING_CONFIRMED_NO_NEW_COUNT:** SK02 anterior permanece aplicável: readStored pode devolver null após JSON.parse e loadThemeConfig acessa stored.v antes de fallback. ThemeInitializer chama essa função no efeito de aplicação sem catch local. Não há novo mecanismo contado. Listener storage tem catch para JSON inválido e cleanup; não se confirmou efeito visual no navegador. Caminhos: `src/components/ThemeInitializer.tsx`, `src/components/settings/theme/presets.ts`.
- **D-AUTH-58 — POSITIVE_BOUNDARY_AND_LOW_IMPACT_SCHEMA_LIMIT:** O guard é efetivamente consumido antes de aceitar company/candidates; a query é particionada por usuário/conta/thread/contato. String(status/resolution) pode aceitar formatos coercíveis como arrays de uma string, porém o consumidor compara status estritamente e cai em not_linked; sem payload produtivo inválido ou bypass demonstrado, permanece limite de robustez do schema. Gmail wrapper propaga invoke.error, e o item usa remetente real. tags é string[] não nullable no tipo gerado, afastando hipótese de crash normal por tags null. Datas futuras/invalidas e rótulos são limites de apresentação; API059/060/COM não duplicados. Caminhos: `src/types/emailContactContext.ts`, `src/hooks/crm/useEmailContactContext.ts`, `src/components/gmail/ThreadListItem.tsx`, `src/hooks/gmail/gmailApi.ts`.
- **D-AUTH-59 — ACTIVE_HELP_PRESENTATION_LIMIT:** Diálogo é montado sob demanda no provider global. Lista principal usa formatShortcut dos bindings e rótulos lazy; a lista adicional de atalhos globais é texto fixo e não acompanha personalização. Não se atribui implementação de atalho à existência da ajuda nem se afirma ausência de qualquer listener alternativo. Handler real de atalhos preserva escopo e exceções para campos de texto. Este lote não executou teclado, foco, leitor de tela ou verificação visual. Caminhos: `src/components/keyboard/KeyboardShortcutsDialog.tsx`, `src/components/keyboard/GlobalKeyboardProvider.tsx`, `src/hooks/ui/useGlobalKeyboardShortcuts.ts`.
- **D-AUTH-51 — STATIC_SCOPE_LIMIT_NO_DUPLICATE_ACTIVE_INSTANCE_PROVEN:** Keypad escuta window e apenas verifica que existe algum data-keypad-scope; não verifica se o alvo está contido nele nem filtra teclas modificadoras. INPUT/TEXTAREA/contentEditable e disabled são protegidos e há cleanup do listener. A busca encontrou instâncias atuais alternativas em NewCallPanel e ActiveCallPanel; DialPad não tem consumidor produtivo localizado. Não se afirma envio duplo de DTMF, discagem involuntária ou duas instâncias montadas. Limite do escopo físico permanece para QA de interação. Caminhos: `src/components/calls/Keypad.tsx`, `src/components/calls/ActiveCallPanel.tsx`, `src/components/calls/NewCallPanel.tsx`, `src/components/calls/DialPad.tsx`.
- **D-AUTH-52 — SUPERSEDED_COMMENT_AND_CONDITIONAL_PRESENTATION_LIMIT:** Comentários antigos dizem que gravação nunca está disponível/D3=b, mas o hook vigente define serviço ativo e invoca get-call-recording quando status=available e há ID. RecordingPlayer tem audio nativo e download reais. O ícone Ouvir da tabela não possui handler próprio; o click borbulha e seleciona o detalhe, onde o player pode ser montado. Sem prova de arquivo disponível no ambiente e sem contrato de autoplay, não foi promovido a falha de reprodução nem foi reaberta decisão revogada sobre a fonte da gravação. Caminhos: `src/components/calls/CallHistoryTable.tsx`, `src/components/calls/RecordingPlayer.tsx`, `src/hooks/calls/useCallRecording.ts`.
- **D-AUTH-53 — INDEPENDENT_REVIEW_NO_DUPLICATE_COUNT:** Revisão independente de CALL006–008 e call_overlay_probes.cjs (104 linhas) com resultados CALL-P08–P11: HEAD, manifesto, SHA do script e 12 blobs/SHA256 conferidos, sem reexecução. As precondições de notificação retida, diálogo persistente, WhatsApp B/SIP A simultâneos e evento remoto com ID observado distinto da sessão foram confrontadas com callbacks e JSX reais. O harness comprova contratos/reducer, não browser, toque audível ou teardown de SIP. Nota independente em calls-cross-review.md/json; nenhum ID material duplicado. Caminhos: `src/hooks/communication/useIncomingCallListener.ts`, `src/components/calls/IncomingCallAlert.tsx`, `src/components/calls/CallDialog.tsx`, `src/hooks/calls/useTerminoRemoto.ts`, `src/lib/calls/session.ts`.
- **D-AUTH-54 — POSITIVE_CONTROLS_AND_PRESENTATION_LIMITS:** Histórico/KPIs distinguem erro de vazio/zero e possuem retry. Escopo é controlado por papel fornecido pelo consumidor e filtros são controlados; debounce tem cleanup e sincronização externa. Paginação limita botões e fronteiras, sem reabrir o clamp de dados já coberto por MOD015. Badge usa nomes de tom como classes diretas; cores/contraste e ordenação visual não foram validados no navegador. Não se presume autorização de backend apenas pelo seletor escondido. Caminhos: `src/components/calls/CallHistoryCard.tsx`, `src/components/calls/CallHistoryStates.tsx`, `src/components/calls/CallHistoryToolbar.tsx`, `src/components/calls/CallsKpiGrid.tsx`, `src/components/calls/CallsPagination.tsx`, `src/components/calls/CallStatusBadge.tsx`.
- **D-AUTH-46 — NO_ACTIVE_CONSUMER:** Busca integral de import/símbolos encontrou declarações e re-export, sem consumidor produtivo. FeatureSpotlight mede targetRef em initializer useState, não acompanha montagem, scroll, resize ou troca de alvo. ShowMore limita aberto a 1000px; Tooltip só reage ao mouse; DisclosureProvider começa básico sem persistência. São limitações do código dormente. EnhancedProgressiveDisclosure do Dashboard é outra implementação ativa e não herda essas conclusões. Caminhos: `src/components/cognitive/FeatureSpotlight.tsx`, `src/components/cognitive/ProgressiveDisclosure.tsx`.
- **D-AUTH-47 — STATIC_VERIFICATION_UI_LIMITS_NO_AUTH_BYPASS:** Rota verify-email é ativa. Sucesso é inferido de sessão existente/SIGNED_IN sem vincular a um token/tentativa específica. No estado error, email começa vazio e só é definido em caminhos de sucesso; Reenviar Email pode chamar resend com endereço vazio, sem campo para corrigir. Estado expired só redireciona ao login. Não foi demonstrada criação de sessão, confirmação de email no servidor ou bypass de autorização por essa UI; fluxo real do link/template e auto-detect da SDK não foi executado. Limitação preservada sem novo achado de segurança. Caminhos: `src/pages/VerifyEmail.tsx`, `src/routes/AppRoutes.tsx`.
- **D-AUTH-48 — LOW_IMPACT_STATIC_OBSERVATION:** Termos de Uso e Política de Privacidade são botões sem handler/link no formulário de cadastro. Registrado como conteúdo inacessível nesse ponto; não se conclui ausência desses documentos fora do checkout nem validade jurídica do consentimento. Caminhos: `src/pages/Auth.tsx`.
- **D-AUTH-49 — PRIOR_CONTRACT_AND_LOW_IMPACT_OBSERVATION:** Consumidor DashboardWidgetRenderer:139 é ativo e usa useLeaderboard real. Botão Ver ranking completo e seta de linha não possuem handler. previousRank igual ao atual e indicador isOnline derivado de is_active pertencem ao contrato do hook já confrontado com achados anteriores; não contam novamente. Partículas são somente ornamentais, sem interferir em XP/score. Não houve teste de contraste ou animação no navegador. Caminhos: `src/components/leaderboard/Leaderboard.tsx`, `src/components/leaderboard/LeaderboardHelpers.tsx`.
- **D-AUTH-50 — LOW_IMPACT_CONFIGURATION_CONTRACT_OBSERVATION:** AppearanceSettings persiste theme/language em user_settings, mas não chama os setters reais de useTheme/useLanguage, que utilizam estado global/localStorage. Busca de leituras locais não achou ponte desses dois campos ao tema/idioma efetivos. Seletor independente LanguageSelector e ThemeCustomizer possuem caminho real. Observação de personalização separada das configurações operacionais AUTH049, sem nova contagem material. Caminhos: `src/components/settings/AppearanceSettings.tsx`, `src/hooks/system/useUserSettings.ts`, `src/hooks/ui/useTheme.ts`, `src/i18n/index.ts`.
- **D-AUTH-42 — STATIC_FAILURE_LIMITS_NOT_PROMOTED:** Create grava sequência e passos em chamadas separadas, sem compensação se a segunda falha; input permite passo vazio e não há edição da sequência já criada. Query de lista ignora error; histórico devolve error ao Query mas UI não diferencia de vazio. Falhas condicionais de manutenção/feedback foram catalogadas, sem declarar que o worker envia mensagem vazia, que sequência órfã foi criada realmente ou que falta de transação prova incidente. Caminhos: `src/components/settings/FollowUpSequences.tsx`, `src/components/settings/FollowUpExecutionsHistory.tsx`.
- **D-AUTH-43 — DESIGN_PRESERVED_AND_REVIEW_LIMIT:** Prazo de primeira resposta fixo5 aparece explicitamente desabilitado, consistente com decisão posterior; não reabrir como seletor quebrado. Dialog delega mutate e fecha sem aguardar confirmação; queries de opções não mostram erro e listas de empresas/cargos não paginam. Lifecycle por key foi localizado no pai, afastando inicialização de outro registro. Contrato de SLA/backend e política final são da área correspondente; não inferir violação ou notificação por rótulo da metadata. Caminhos: `src/components/settings/sla/SLARuleFormDialog.tsx`, `src/components/settings/SLAConfigurationManager.tsx`, `src/components/settings/sla/SLARuleRow.tsx`.
- **D-AUTH-44 — LOW_IMPACT_STATIC_OBSERVATION:** Salvar explícito verifica retorno de localStorage; auto-save/reset atualizam savedConfig mesmo se writeStored retorna false, podendo perder preferência ao reabrir. Aplicação CSS continua efetiva na sessão e dados são cosméticos. PresetCard usa hsl(...) seguido de15 como alpha no gradiente, formato de cor não montado corretamente. Leitura completa sem QA visual/contraste; preservada decisão documentada de superfícies dark também no light e sem afirmar catálogo cromático externamente validado. Caminhos: `src/components/settings/theme/useThemePreset.ts`, `src/components/settings/theme/presets.ts`, `src/components/settings/theme/PresetCard.tsx`.
- **D-AUTH-45 — NO_ACTIVE_CONSUMER:** Busca de símbolo encontrou apenas declaração e barrel export. O RPC devolve UUID e não atualiza atribuição; toast Agente atribuído é inadequado a esse contrato, mas sem consumidor montado não foi contado como ação operacional falsa. AUTH046 limita-se ao cadastro ativo de nível. Caminhos: `src/hooks/system/useSkillBasedAssign.ts`.
- **D-AUTH-15 — NO_ACTIVE_CONSUMER:** Utilitários genéricos têm limitações de query key/count/retorno de erro, mas a busca encontrou apenas definição, re-export e exemplo. Não contados como falha ativa de cache ou mutation. Caminhos: `src/hooks/system/useCRUD.ts`, `src/hooks/system/useSupabaseMutation.ts`.
- **D-AUTH-16 — ACTIVE_FLOW_DISTINGUISHED_FROM_DORMANT_RPC:** Peer SQL identificou search_team_messages sem filtro is_deleted. A UI atual não chama essa RPC e faz DELETE físico; a pesquisa local do Panel não prova reexposição de conteúdo soft-deleted. Resultado encaminhado ao agente SQL. Caminhos: `src/hooks/team-chat/useTeamChatMutations.ts`, `src/components/team-chat/useTeamChatPanel.ts`.
- **D-AUTH-17 — IDENTITY_SWITCH_PRECONDITION_UNVERIFIED:** Hook conserva settings entre user.id e não cancela fetch anterior; save usa usuário atual. O fluxo normal de logout desmonta a view, portanto não se afirma cópia entre contas sem demonstrar troca direta de identidade com componente preservado. Revisão do mecanismo feita; classificação ativa retida. Caminhos: `src/hooks/system/useUserSettings.ts`.
- **D-AUTH-18 — LOW_IMPACT_STATIC_OBSERVATION:** clearSearch não cancela debounce pendente. Se resultado anterior vazio mantém botão de limpar e usuário digita outro termo e clica antes dos 400ms, o callback pode recolocar termo no filtro com input vazio. O X do input chama handleSearchChange e cancela corretamente. Registrado como observação de UI de baixo impacto, não agregado aos achados materiais. Caminhos: `src/hooks/crm/useContactsSearch.ts`, `src/components/contacts/ContactContentArea.tsx`.
- **D-AUTH-19 — LOW_IMPACT_STATIC_OBSERVATION:** DirectProfileHeader mostra Online/Offline pelo profiles.is_active, que indica ativação administrativa, e não presença. Para admin/supervisor que consegue ler o colega, conta habilitada sem sessão aparece Online. Sem impacto provado em roteamento; observação visual separada de AUTH020 e da RLS em AUTH011. Caminhos: `src/components/team-chat/TeamMemberProfileHeader.tsx`, `src/hooks/team-chat/useTeamMemberDetails.ts`.
- **D-AUTH-20 — LOW_IMPACT_STATIC_OBSERVATION:** TotalRequests soma request_count; Bloqueados e percentual contam linhas; Alertas Ativos é o número de logs históricos blocked, sem consulta de alertas/resolução. A aba promete últimas100 mas renderiza somente20 sem paginação. A unidade e o recorte do painel não são coerentes. Não altera enforcement; nenhum dado real foi consultado. Caminhos: `src/pages/admin/RateLimitDashboard.tsx`, `src/hooks/system/useRateLimitLogs.ts`.
- **D-AUTH-21 — STATIC_PRESENTATION_LIMIT:** Histórico busca no máximo20 e soma os não-cancelados como Valor total; não identifica o recorte. Lê currency mas rotula qualquer quantia como R$. Moedas diferentes dependem de dados/produtor não validados; não se afirma soma financeira real incorreta no ambiente. Carga/erro também não são separados de Nenhuma compra. Consulta e cálculos revisados integralmente. Caminhos: `src/components/contacts/ContactPurchaseHistory.tsx`.
- **D-AUTH-22 — LOW_IMPACT_STATIC_OBSERVATION:** Polling só chama setAlerts e atualiza lastKnownIds se surgir ID novo. Resolver todos os alertas em outra sessão produz fresh=[] e conserva alertas antigos até remontagem/novo evento. Dismiss oculta antes do UPDATE e ignora falha. Gate admin existe; não se afirma incidente de entrega nem ausência de todo alerta. Caminhos: `src/components/security/RateLimitRealtimeAlerts.tsx`.
- **D-AUTH-23 — STATIC_PRESENTATION_LIMIT:** Consulta só últimos200, pesquisa texto somente nesse subconjunto e rotula data.length Total de Logs sem explicitar recorte. Erro conserva listas/stats antigos ou zero sem aviso. Os fatos de vocabulário com efeito comprovado em mudanças de acesso estão em AUTH032; retenção/paginação integral não foi executada. Caminhos: `src/components/security/AuditLogDashboard.tsx`.
- **D-AUTH-24 — NO_ACTIVE_CONSUMER:** SkipLink, Announcer, useFocusTrap e usePrefersReducedMotion têm implementação, mas nenhum consumidor de produção foi localizado por busca de símbolo. Não contar como acessibilidade integrada; detalhes de foco dinâmico ficam para o aceite de integração. Caminhos: `src/components/team-chat/TeamChatA11y.tsx`.
- **D-AUTH-25 — NO_ACTIVE_CONSUMER:** Cache de prefetch global não inclui identidade e utilitários de leitura não verificam TTL; a busca de símbolos achou definições/re-export, sem consumidor de produção. Não é uma exposição ativa comprovada. O usePrefetch de outros módulos é função diferente e não foi confundido com esta implementação. Caminhos: `src/hooks/system/useResourcePrefetch.ts`.
- **D-AUTH-26 — LOCAL_UI_CONTROL_LIMIT:** Proteção de tela instala efeitos locais e pode ser desativada pelo próprio usuário; não equivale a DLP ou bloqueio de captura pelo sistema operacional. Não foi apresentado como bypass de autorização, porque essa UI oferece toggle pessoal e dados já são legíveis ao usuário. Remoção de listeners/overlay no cleanup foi verificada. Caminhos: `src/hooks/ui/useScreenProtection.ts`, `src/components/notifications/ScreenProtectionToggle.tsx`.
- **D-AUTH-27 — STATIC_PRESENTATION_LIMIT:** Top5 clientes usa vendedor_nome como nome; distribuição RFM agrega no máximo200 registros e não identifica amostra. Erros das métricas viram zero/vazio, mas IntegrationHealth valida shape e mostra Health check indisponível. Não se afirma dado financeiro real incorreto; recorte externo não executado. Caminhos: `src/components/admin/AdminCRMDashboard.tsx`.
- **D-AUTH-28 — PRIOR_FINDING_CONFIRMED_NO_NEW_COUNT:** IA-METRICS-001 anterior já cobre contexto insuficiente para SLA/backlog/performance. Leitura integral confirma o mesmo problema e erros de consultas tratados como zero; nenhum achado novo contado por esta repetição. Caminhos: `src/components/admin/SupervisorCopilot.tsx`.
- **D-AUTH-29 — STRUCTURAL_AUTH_MISMATCH_REJECTED:** Resumo comercial faz UPDATE sem count e UI fecha editor após promessa, mas SELECT e UPDATE contacts finais usam o mesmo can_edit_contact (SQL corroborado). Não se demonstrou usuário com leitura permitida e UPDATE negado estruturalmente. Conflito concorrente/deleção pode produzir zero rows e permanece risco genérico, não novo bypass ou finding material. Caminhos: `src/hooks/crm/useContactSummaryNote.ts`, `src/components/inbox/tabs/NotesTab.tsx`.
- **D-AUTH-30 — CROSS_REVIEW_NO_DUPLICATE_COUNT:** Revisão independente de R2-PLAT-002 do root: unreadCount é estado separado, markAsRead pode decrementar item já lido e UPDATE realtime pode intercalar. Root mantém o achado e probes PLAT-P02/P03. Outros limites visuais: query cap100 sem count, DELETE realtime sem ajuste e popover sem erro/loading. Não duplicados aqui; não se afirma perda de registro. Caminhos: `src/hooks/system/useNotifications.ts`, `src/components/notifications/NotificationItem.tsx`, `src/components/notifications/NotificationsPopover.tsx`.
- **D-AUTH-31 — CROSS_REVIEW_NO_DUPLICATE_COUNT:** Revisão independente de R2-PLAT-004 do root: resetSettings atualiza cache e aguarda upsert sem ler error; handleReset não aguarda e anuncia reset imediato. Root mantém achado e probe PLAT-P05. updateSettings principal checa error e informa falha com invalidação, controle positivo verificado. Caminhos: `src/hooks/system/useNotificationSettings.ts`, `src/components/notifications/NotificationSettingsPanel.tsx`.
- **D-AUTH-32 — CROSS_REVIEW_NO_DUPLICATE_COUNT:** Revisão independente de R2-PLAT-003 do root: newMessageSound/mentionSound/slaBreachSound não entram no SELECT/mapDbToSettings/dbUpdates e voltam true ao refetch. useRealtimeNotifications25–63 também ignora newMessageSound; controles SLA53–56 e menção74–79 são efetivos em memória. Root mantém achado/probe PLAT-P04 e ampliou consumo com a evidência enviada. Candidato AUTH038 de notificações não foi publicado nem contado; ID038 é do mapa. Caminhos: `src/hooks/system/useNotificationSettings.ts`, `src/components/notifications/NotificationTypeCards.tsx`, `src/hooks/realtime/useRealtimeNotifications.ts`, `src/hooks/sla/useSLANotifications.ts`, `src/hooks/inbox/useSentimentAlerts.ts`.
- **D-AUTH-33 — GENERIC_ERROR_LIMIT_NO_DETERMINISTIC_AUTH_MISMATCH:** DELETE não lê error antes do toast; UPDATE não confirma count. Porém policies finais de playbooks permitem escrita a admin/supervisor, conforme SQL20260409014536:130–133 corroborado pelo agente database. Não há no-op determinístico de supervisor provado. Falha eventual de transporte permanece observação, sem novo achado material. Caminhos: `src/components/admin/PlaybooksManager.tsx`.
- **D-AUTH-34 — EXTERNAL_CLAIMS_NOT_VERIFIED:** Métricas comerciais, selo SOC2/LGPD e disponibilidade99.9% são textos estáticos. A fonte local não comprova essas declarações; ausência de evidência local não prova que certificação/disponibilidade sejam falsas. Não contado como defeito de segurança nem validação externa concluída. Caminhos: `src/components/auth/HeroBenefits.tsx`, `src/components/auth/SocialProof.tsx`.
- **D-AUTH-35 — LOW_IMPACT_STATIC_OBSERVATION:** Tabela ordena o array da página localmente; percentuais por região usam a maior região como100%, não o total; geometria de Sparkline merece QA visual com muitas amostras. São limites de apresentação/escopo, sem mutação ou inferência de vazamento. O mapa com conjuntos sobrepostos é tratado materialmente em AUTH038. Caminhos: `src/components/contacts/ContactsTable.tsx`, `src/components/contacts/ContactMapView.tsx`, `src/components/contacts/ContactKpiCard.tsx`.
- **D-AUTH-36 — STATIC_PRESENTATION_LIMIT:** Gráfico de áreas enumera somente seis chaves fixas FUNCTION_COLORS, embora o resumo retorne chaves dinâmicas; pizza/lista de funções suportam nomes novos. Erros das queries não são expostos pelo hook ao painel. Agregação de totais e paginação real são controles positivos. Recorte visual separado dos contratos temporais/custo AUTH040/041. Caminhos: `src/components/admin/AIUsageDashboard.tsx`, `src/hooks/analytics/useAIUsageDashboard.ts`.
- **D-AUTH-37 — UNMOUNTED_PROVIDER_AND_ACTIVE_NOOP_DEMO:** Nenhuma montagem produtiva de GamificationProvider foi localizada por símbolo/import e leitura da árvore. DemoAchievements é montado no widget e recebe NOOP_CONTEXT: seus botões de teste não persistem/mostram conquistas apesar do texto Suas conquistas são salvas automaticamente. Fila/processQueue que captura currentAchievement antigo, toast de prêmio após erro e grant repetido são limitações do provider dormente, não bugs operacionais contados. AchievementsPanel acessado por Ver Conquistas consulta dados reais de forma independente. Não se propõe ligar provider sem revisar autorização/recompensas. Caminhos: `src/components/gamification/GamificationProvider.tsx`, `src/components/gamification/DemoAchievements.tsx`, `src/providers/AppProviders.tsx`, `src/App.tsx`.
- **D-AUTH-38 — LOW_IMPACT_STATIC_OBSERVATION:** Response Match é um dos quatro cartões oferecidos, mas só há diálogos de Speed Typing/Quiz/Emoji: clicar nele apenas muda selectedGame/isPlaying sem jogo. Emoji considera resposta vazia correta porque qualquer answer inclui string vazia. Quiz conserva setTimeout sem cancelamento no fechamento. Recordes são locais sem namespace de usuário/validação JSON. Observações do catálogo/avaliação/estado; não se afirma crédito real de XP, pois AUTH043 mostra ausência de consumidor. Lifecycle reproduzido de outro jogo é AUTH044. Caminhos: `src/components/gamification/miniGamesData.ts`, `src/components/gamification/MiniGameDialogs.tsx`, `src/components/gamification/TrainingMiniGames.tsx`.
- **D-AUTH-39 — PRIOR_CONFIRMED_AND_PRESENTATION_LIMITS:** DASH-REALTIME-001 já descreve resposta antiga por período no useLeaderboard; leitura integral confirma ausência de cancelamento/geração e previousRank igual ao atual (DASH-METRICS-001), sem nova contagem. Período p_period é efetivo, contrariando documento antigo. AchievementsPanel filtra/conta apenas últimos20 da query e não expõe error; limite visual sem novo finding material. Caminhos: `src/hooks/gamification/useLeaderboard.ts`, `src/components/gamification/AchievementsPanel.tsx`, `src/components/gamification/AchievementsStats.tsx`, `src/hooks/gamification/useAgentGamification.ts`.
- **D-AUTH-40 — PRIOR_FINDING_REFINED_NO_NEW_COUNT:** IA-METRICS-001 já exige que erro não produza sucesso local. Leitura completa amplia evidência: AutoTicketClassifier122–135 descarta data do invoke, cujo endpoint só devolve results/summary sem persistir, e depois relê tags pelas regras inline. Mesmo erro de invoke gera toast.success Classificação local aplicada. Switch autoClassify43/158 só altera estado decorativo. Backend existe e protege autenticação/RLS; não se alega função inexistente. Churn também mantém fallback/scores locais já descritos. Coordenado com infra, sem novo ID independente. Caminhos: `src/components/ai/AutoTicketClassifier.tsx`, `supabase/functions/ai-classify-tickets/index.ts`, `src/components/ai/ChurnPredictionDashboard.tsx`.
- **D-AUTH-41 — HELPER_NOT_CONSUMED_BY_PRODUCTION_COMPONENT:** Helpers groupTagsIntoTickets e computeChurnRisk não são importados pelos componentes, que conservam cópias inline. Validação de linhas malformadas e clamp de datas futuras presentes nos helpers não demonstram proteção na UI. Busca de símbolos de produção não encontrou consumidor; testes do helper não foram executados nem usados como prova da integração. Evidência compartilhada com infra. Caminhos: `src/components/ai/ticketClassification.ts`, `src/components/ai/churnRisk.ts`, `src/components/ai/AutoTicketClassifier.tsx`, `src/components/ai/ChurnPredictionDashboard.tsx`.

## Reconciliação CRM360 e sucessão de planos

### T1: Implementado na fonte, requisito visual antigo sujeito à sucessão

Hoje em Mais detalhes, gate runtime crm.integration; mover entre acordeões não reaberto. Contrato mudou de telefone para ID canônico via Edge.

- `src/components/inbox/contact-details/ContactAccordionSections.tsx:95–98`; blob `97f3a98d20dc468cb4b8c54fe79f1d3fa35f24ed`.
- `src/components/inbox/contact-details/ExternalContact360Panel.tsx:21–43`; blob `c870ade2e7add55f099e58e56aa2ee174a8fb64f`.

### T2: Fluxo integrado, aceite visual/externo não executado

AdvancedCRMSearch tem400ms debounce, Sheet/paginação e gate server-side. Importação é imediata no clique se não encontra local; não inventar6gaps. D5 do planoContatos100 linha184 exclui CRM daquele plano, mas HEAD atual passa props; depende da reconciliação de sucessão pelo root.

- `src/components/contacts/ContactsView.tsx:175–176`; blob `805de473b266d4bb067c7bd9875eefeaa612f4dc`.
- `src/components/contacts/ContactsView.tsx:230–236`; blob `805de473b266d4bb067c7bd9875eefeaa612f4dc`.
- `src/components/contacts/ContactCRMDialog.tsx:16–60`; blob `1c4187abdb488bea454162b2d2d56647211ddc15`.

### T5: Parcial demonstrável; vendedor no header não encontrado

Logo, tratamento/apelido eVIP existem. Vendedor não aparece no header atual; não presumir requisito vigente sem sucessão design. BancoÚnico151 prevê ficha com vendedor. Root coordenaT3/T4/T6.

- `src/components/inbox/contact-details/ContactHeaderSection.tsx:63–83`; blob `e150d4976513971845879922d8746687e2fbc6c9`.
- `src/components/inbox/contact-details/ContactHeaderSection.tsx:146–168`; blob `e150d4976513971845879922d8746687e2fbc6c9`.
- `src/components/inbox/contact-details/ContactHeaderSection.tsx:199–203`; blob `e150d4976513971845879922d8746687e2fbc6c9`.

## Cobertura e microáreas restantes

O catálogo desta subárea contém 623 arquivos: 474 semantic, 89 structural, 60 targeted. A enumeração de caminhos não é revisão semântica do repositório inteiro. `coverage.json` contém nível, faixas efetivamente lidas, símbolos, hash e gaps por arquivo.

- Arquivos structural permanecem sem leitura semântica nesta subárea: testes preexistentes, GmailWebhookMonitor e componentes de settings/notifications já atribuídos a outros agentes (IA/provedores/mídia/atalhos/SLA). A matriz consolidada reúne essas declarações independentes; este JSON lista cada caminho sem tomar emprestada uma leitura integral.
- Nos arquivos targeted, apenas as faixas indicadas foram lidas; não se presume o corpo inteiro a partir de um trecho ou referência de outro agente.
- MFA enrollment visual, dispositivos/alertas, SSO OAuth, entrega de recuperação e gamificação real: não houve E2E/browser externo. Os onze probes offline têm fronteiras sintéticas explícitas.
- Formulários externos: integridade do schema Singu efetivo e contratos RPC externos continuam dependentes de evidência externa autorizada.
- SQL final/RLS/grants, storage e last-owner/department RPCs: relatório database coordenado. Provedores, envio e TalkX são subáreas próprias; evidência compartilhada não substitui suas matrizes de cobertura.
- Grafo AST local confirma conectividade de módulo, não uso de export específico; casos dormentes classificados por busca de símbolo/imports e leitura dos consumidores.

## Fontes primárias externas consultadas

As fontes externas fundamentam semântica de APIs/protocolo. As conclusões específicas do projeto estão ancoradas nos blobs e faixas acima.

- [https://www.w3.org/TR/webauthn-2/](https://www.w3.org/TR/webauthn-2/) — Requisitos de validação de assertion/origin/RP/signature e contador, R2-AUTH-001.
- [https://supabase.com/docs/reference/javascript/auth-signinwithotp](https://supabase.com/docs/reference/javascript/auth-signinwithotp) — Envio de OTP/magic link é etapa de início, R2-AUTH-002.
- [https://supabase.com/docs/reference/javascript/auth-admin-generatelink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) — generateLink gera dados/link para envio próprio, R2-AUTH-007.
- [https://supabase.com/docs/guides/auth/auth-mfa](https://supabase.com/docs/guides/auth/auth-mfa) — AAL e enforcement de MFA, R2-AUTH-003.
- [https://supabase.com/docs/guides/realtime/authorization](https://supabase.com/docs/guides/realtime/authorization) — Validação de suspeita em hooks dormentes; não usada para contar exposição ativa.
- [https://supabase.com/changelog](https://supabase.com/changelog) — Changelog obrigatório do skill Supabase, consultado antes de recomendações.
- [https://docs.postgrest.org/en/stable/references/api/resource_embedding.html](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html) — Resource embedding é determinado pelas FKs; !fk seleciona relação existente, R2-AUTH-033.
- [https://supabase.com/docs/reference/javascript/insert](https://supabase.com/docs/reference/javascript/insert) — Contrato de retorno data/error do cliente Supabase, R2-AUTH-034.
- [https://tanstack.com/query/latest/docs/framework/react/guides/mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations) — Callbacks de mutation conforme promessa resolvida/rejeitada, R2-AUTH-034.
- [https://www.postgresql.org/docs/current/functions-comparison.html](https://www.postgresql.org/docs/current/functions-comparison.html) — Comparações ordinárias com NULL produzem resultado desconhecido; efeito do p_until nulo em R2-AUTH-041.
- [https://react.dev/reference/react/useState](https://react.dev/reference/react/useState) — Argumento initialState não reaplica após inicialização; contrato de R2-AUTH-045.
- [https://supabase.com/docs/reference/javascript/functions-invoke](https://supabase.com/docs/reference/javascript/functions-invoke) — invoke devolve data/error; erro HTTP é examinado no campo error, R2-AUTH-048.
- [https://www.w3.org/TR/uievents/](https://www.w3.org/TR/uievents/) — Seção 3.5.6.1: ativação por Enter/Espaço e cancelamento de keydown; contrato estático de R2-AUTH-052.

## Artefatos de reprodução

- Casos01–08: `/workspace/scratch/f8f9b9cbce53/reaudit/probes/auth/results.json` e `source-probes.cjs`.
- Casos09–10: `/workspace/scratch/f8f9b9cbce53/reaudit/probes/auth/second-pass-results.json` e `second-pass-probes.cjs`.
- Caso11: `/workspace/scratch/f8f9b9cbce53/reaudit/probes/auth/gamification-results.json` e `gamification-probe.cjs`.
- README de probes documenta parâmetros por ambiente e preflight de HEAD/manifesto/blobs; os programas recusam fonte divergente antes de executar os trechos de produto.
- Arquivos de fonte são lidos em memória; os únicos writes ocorrem em relatórios/probes. Não há credenciais reais nos fixtures.
