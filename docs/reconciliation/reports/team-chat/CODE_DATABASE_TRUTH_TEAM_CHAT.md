# Team Chat — Code/Database Truth

Baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Auditoria somente leitura.
## Conclusão

Os dois planos concorrentes de cem etapas permanecem incompletos e precisam de reconciliação de autoridade. Existem correções relevantes em SQL e componentes aproveitáveis, mas a interface ativa ainda usa contratos legados e deixa fluxos centrais sem integração. Nenhuma etapa foi promovida a DONE apenas por existir um arquivo ou um PR mergeado.
## Autoridade dos planos

O plano F foi commitado em 2026-09-29 às 14:00:41Z pela PR1171. O plano TC foi commitado às 14:02:35Z pela PR1174, 114segundos depois. TC cita uma base mais recente, mas não substitui explicitamente o documento F, que se declara ledger único. Não foi encontrada ponte que resolva o conflito em README, AGENTS ou CLAUDE. A data torna TC um candidato mais recente, sem resolver a autoridade automaticamente.

As duas listas foram verificadas por conteúdo. `team_chat_f_tc_crosswalk.json` relaciona os escopos sem equiparar números. **Duzentas linhas de plano não representam duzentas funcionalidades independentes.** Os sete conflitos documentais estão em `team_chat_plan_authority_conflicts.json`, incluindo contrato seguro de WhatsApp, retorno de reação, rota de reconciliação e referências incorretas.
## Cobertura e método

- 100 etapas F e 100 etapas TC com origem, linha, status, prova e pendência.
- Inventário completo por caminho: 801 migrations SQL, sendo 779 ativas e 22 arquivadas; 73 entradas de Edge Functions; 51 arquivos do escopo Team Chat. A revisão semântica foi concentrada no módulo e seus objetos relacionados; não se afirma revisão semântica integral de todas as migrations.
- Graphify 0.9.68: 3452 fontes, 19319 nós e 49910 arestas. Extração AST sem chamadas LLM, instalação isolada e nenhuma alteração de hooks ou source.
- Grafo TypeScript independente da frente global usado para refinar candidatos sem importador.
- Usage guard executado offline: uma violação conhecida, zero novas, exit 0. Docker/psql indisponíveis; nenhum SQL, teste de produção ou consulta direta ao banco foi executado.
## Estados por plano

| Status | F100 | TC100 |
|---|---:|---:|
| ACTIVE_REGRESSION | 3 | 3 |
| BLOCKED_EXTERNAL | 1 | 1 |
| HUMAN_ACCEPTANCE | 1 | 3 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 4 | 1 |
| NEEDS_REVALIDATION | 3 | 5 |
| NOT_IMPLEMENTED | 40 | 39 |
| OBSERVATION_WINDOW | 1 | 1 |
| PARTIAL | 42 | 42 |
| PRODUCT_DECISION_REQUIRED | 1 | 2 |
| VALIDATED_FAIL | 4 | 3 |

## Achados prioritários

### TC-001 — Fluxo de mídia usa três contratos incompatíveis entre storage, mensagem e renderização (P1)

Áudio é enviado para cid/arquivo, enquanto INSERT no storage exige o primeiro segmento igual a current_profile_id(). O hook grava bucket/path/type sem media_url, contrariando CHECKs da mensagem. O Panel ativo só renderiza mídia se media_url existe. Upload de arquivo e colagem usam profile.id/cid, mas persistem URL legada sem os locators exigidos pela policy mais recente de leitura.

**Impacto:** Áudio e anexos de membros comuns podem falhar em etapas independentes; mesmo uma linha com locators válidos fica invisível no renderer ativo. SELECT/DELETE ainda usam auth.uid no segmento de proprietário quando a convenção é profiles.id.

**Correção necessária:** Unificar uploader em profile.id/cid/UUID retornando bucket/path; migrar CHECKs e policies por nova migration; integrar um renderer que resolva locators.

**Aceite:** Dois perfis com id diferente de auth.uid conseguem enviar, ler após reload e excluir anexos próprios; estranho não lê; áudio sem URL legada é renderizado.

**Prova:** STATIC; alcance `reachable`.

Evidências: `src/components/team-chat/useTeamChatPanel.ts:244–270`; `src/components/team-chat/TeamFileUploader.tsx:66–79`; `src/hooks/chat/useTeamChatDraft.ts:65–80`; `src/components/team-chat/TeamChatPanel.tsx:33–60`; `supabase/migrations/20260928560000_team_chat_e20_storage_team_chat_files.sql:6–12`; `supabase/migrations/20260928600000_team_chat_e25_team_messages_integrity.sql:10–12`; `supabase/migrations/20260927270012_team_chat_e21_storage_select_policy.sql:1–3`.

### TC-002 — RPC ativa de conversa direta perdeu a proteção contra criação concorrente (P1)

A migration29190000 substitui a RPC que preenchia o par ordenado e usava ON CONFLICT por SELECT seguido de INSERT apenas(type,created_by). O par direct_member_a/b fica NULL e o índice do par deixa de arbitrar duas inserções concorrentes.

**Impacto:** Duas requisições simultâneas podem criar conversas diretas duplicadas; o front ativo chama essa RPC.

**Correção necessária:** Restabelecer identidade canônica do par e UPSERT protegido por índice único em migration forward-only.

**Aceite:** Duas transações concorrentes para o mesmo par retornam o mesmo id e deixam uma conversa com ambos os membros; caso self é rejeitado.

**Prova:** STATIC; alcance `reachable`.

Evidências: `supabase/migrations/20260927270018_team_chat_e28_fix_find_or_create_race.sql:3–3`; `supabase/migrations/20260929190000_team_chat_e29_conversations_constraints.sql:10–10`; `src/hooks/team-chat/useTeamChatMutations.ts:87–101`; `supabase/migrations/20260927270007_team_chat_e16_find_or_create_direct_conversation.sql:1–3`.

### TC-003 — Membership não protege bootstrap e último owner; grants de conversa continuam amplos (P1)

Insert de membership exige membro prévio ou profiles.role admin, impedindo o bootstrap normal de um grupo criado em duas requests. A policy DELETE permite saída própria sem guarda de último owner. Não exige member_role=member no INSERT. REVOKEs de colunas de team_conversations coexistem com grant UPDATE na tabela inteira.

**Impacto:** Criação de grupo por agente pode deixar conversa órfã após falha na segunda request; papéis e identidade da conversa não têm todas as invariantes anunciadas pelo plano.

**Correção necessária:** Centralizar criação e regras de membership em operação atômica, autorização canônica e grants efetivos por coluna.

**Aceite:** Testes com roles distintos provam bootstrap, rollback, saída do owner, promoção e negação de alterações de identidade não permitidas.

**Prova:** STATIC; alcance `reachable`.

Evidências: `supabase/migrations/20260928580000_team_chat_e22_team_conversation_members_policies.sql:20–24`; `supabase/migrations/20260928570000_team_chat_e21_team_conversations_update_policy.sql:6–10`; `supabase/schema-manifest.json:9462–9462`; `src/hooks/team-chat/useTeamChatMutations.ts:104–138`.

### TC-004 — RPCs de saída e remoção referem uma coluna role inexistente (P1)

A última definição de leave_team_group e remove_team_member usa tcm.role e SET role. O catálogo e tipos possuem apenas member_role.

**Impacto:** Essas RPCs não entregam a promoção e remoção anunciadas; a falha é latente no front atual, que ainda executa DELETE direto.

**Correção necessária:** Corrigir as referências para member_role em nova migration e revisar as invariantes de owner antes de migrar o front.

**Aceite:** Owner deixa grupo de três, outro membro é promovido; membro comum não remove terceiros; último grupo vazio é tratado conforme decisão.

**Prova:** STATIC; alcance `latent_rpc`.

Evidências: `supabase/migrations/20260929430000_team_chat_e46_leave_remove_last_owner_promotion.sql:10–16`; `supabase/schema-catalog.json:1837–1839`; `src/hooks/team-chat/useTeamChatMutations.ts:180–218`.

### TC-005 — Gerenciamento de departamento está inacessível e contém contratos de banco inválidos (P1)

TeamChatView não passa canManageDepartments; o único setter do diálogo depende dessa prop. Se integrado, os hooks ainda chamam credenciais service_role-only, escrevem tabela inexistente sob ts-expect-error, usam convites legados e gravam auditoria diretamente com auth user.id.

**Impacto:** Hoje o usuário não alcança essa gestão pela interface. Ligar apenas o botão exporia fluxos que falham; nenhum vazamento ativo de credenciais foi demonstrado.

**Correção necessária:** Corrigir contratos e teste da aba antes de passar a permissão canônica e expor a interface; safe config deve retornar mode,instance_id,has_api_key.

**Aceite:** Admin abre a gestão, executa cada ação com RPC correta, sem INSERT direto em audit_logs nem segredo retornado; agente tem negação explícita.

**Prova:** STATIC; alcance `latent_ui`.

Evidências: `src/components/team-chat/TeamChatView.tsx:31–36`; `src/components/team-chat/TeamConversationList.tsx:191–210`; `src/hooks/team-chat/useDepartmentManagement.ts:108–142`; `src/hooks/team-chat/useDepartmentManagement.ts:215–248`; `supabase/migrations/20260928550000_team_chat_e19_department_whatsapp_cred_rpc.sql:6–18`; `supabase/migrations/20260928530000_team_chat_e17_department_audit_logs_hardening.sql:6–6`.

### TC-006 — Paginação, reações e ticks existem parcialmente fora do Panel ativo (P1)

O hook carrega200 mensagens; fetchOlderMessages não está ligado ao scroll. TeamMessageItem/Wrapper/parts não são usados pelo Panel, que mantém markup inline. O cursor SQL corrigido por#1266 continua baseado só em created_at, sem desempate de id.

**Impacto:** Mensagens antigas podem ficar inacessíveis; timestamps empatados podem ser pulados na futura adoção do RPC; consultas de reação existem sem reação e recibo integrados no renderer principal.

**Correção necessária:** Definir cursor composto, usar cache paginado e compor os componentes existentes com ligação real ao scroll e read state.

**Aceite:** mais de 120 mensagens com timestamps repetidos em três páginas sem repetição/perda; reação e leitura de B refletem no Panel de A sem reload.

**Prova:** STATIC; alcance `reachable`.

Evidências: `src/hooks/team-chat/useTeamMessages.ts:15–38`; `src/components/team-chat/useTeamChatPanel.ts:136–165`; `src/components/team-chat/TeamChatPanel.tsx:160–264`; `supabase/migrations/20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql:69–78`.

### TC-007 — Mute é lido e escrito em locais diferentes e notificações só funcionam com a view montada (P2)

Panel lê user_settings.muted_conversations, enquanto useMuteConversation altera team_conversation_members.is_muted. O listener de notificações é chamado apenas em TeamChatView e não existe badge global do inbox Team Chat.

**Impacto:** Estado exibido de mute pode não refletir o banco; notificações e badges esperados com módulo fechado não estão implementados.

**Correção necessária:** Usar membership como fonte única, invalidar o cache correto e montar um listener global sem duplicação.

**Aceite:** Silenciar, reabrir e reativar preservam o estado; usuário em Contatos recebe alerta de conversa permitida e não recebe alerta de conversa silenciada.

**Prova:** STATIC; alcance `reachable`.

Evidências: `src/components/team-chat/useTeamChatPanel.ts:61–69`; `src/hooks/team-chat/useTeamChatMutations.ts:143–158`; `src/components/team-chat/TeamChatView.tsx:16–21`; `src/hooks/chat/useTeamChatNotifications.ts:122–139`.

### TC-008 — Contrato de convites e vocabulário de auditoria permanecem legados (P2)

RPC create usa assinatura antiga, código12 caracteres de base64 e profiles.role; accept usa status used e não valida already_member/e-mail. Audit CHECK possui12 verbos antigos e RPCs registram o código em details. O front continua na tabela department_invites e seus grants authenticated de escrita persistem.

**Impacto:** Código novo de oito caracteres, limite de uso, revogação e auditoria não estão alinhados. Remover tabela ou funções agora quebraria consumidores ativos.

**Correção necessária:** Consolidar tabela, códigos, status e oito verbos com migração de dados/consumidores, removendo código de details.

**Aceite:** Casos de código inválido, esgotado, revogado, e-mail divergente e duas aceitações concorrentes têm resultados definidos e auditáveis.

**Prova:** STATIC; alcance `reachable`.

Evidências: `supabase/migrations/20260928500000_team_chat_e14_department_invitations_schema.sql:6–14`; `supabase/migrations/20260928510000_team_chat_e15_accept_department_invite_rpc.sql:6–6`; `supabase/migrations/20260928520000_team_chat_e16_create_department_invite_rpc.sql:6–6`; `supabase/migrations/20260928530000_team_chat_e17_department_audit_logs_hardening.sql:12–16`; `supabase/schema-manifest.json:9333–9336`; `src/hooks/team-chat/useDepartmentManagement.ts:121–165`.

### TC-009 — Recibos e reações não forçam conversation_id derivado da mensagem (P2)

O trigger de receipts só preenche cid NULL no INSERT. Não corrige cid não nulo incorreto nem UPDATE de message_id. A reação não tem trigger equivalente;#1265 corrigiu membership e cid da RPC, mas não o contrato do INSERT direto.

**Impacto:** Linhas permitidas pela mensagem podem carregar cid inconsistente, quebrando agregações e filtros de realtime; não foi demonstrado acesso a conteúdo de outra conversa.

**Correção necessária:** Derivar cid invariavelmente em trigger seguro e ampliar checks de status/tempo para receipts.

**Aceite:** INSERT com cid incorreto e UPDATE de message_id são corrigidos ou rejeitados; casos legítimos e cross-team permanecem distintos.

**Prova:** STATIC; alcance `reachable`.

Evidências: `supabase/migrations/20260929440000_team_chat_e51_receipts_conversation_id_not_null_trigger.sql:6–12`; `supabase/migrations/20260929220000_team_chat_e32_reactions_hardening.sql:6–16`; `supabase/migrations/20260930260000_team_reaction_membership_guard.sql:45–71`; `src/hooks/team-chat/useTeamMessageReactions.ts:92–97`.

### TC-010 — Marcação de leitura e envio podem perder estado após erro silencioso (P2)

useTeamMessages marca a referência local antes de concluir upserts e ignora o resultado dos writes de receipts e last_read_at. O envio textual limpa text e reply antes de await, sem restaurar no erro.

**Impacto:** Falha de rede ou autorização pode aparentar leitura salva ou perder o rascunho do usuário sem recuperação automática.

**Correção necessária:** Usar RPC atômica com resultado validado para leitura; preservar ou restaurar draft até sucesso do envio.

**Aceite:** Mocks de erro mostram aviso e recuperação; retry não duplica recibos ou mensagens; aba oculta não marca como lida.

**Prova:** STATIC; alcance `reachable`.

Evidências: `src/hooks/team-chat/useTeamMessages.ts:40–75`; `src/components/team-chat/useTeamChatPanel.ts:190–205`.

### TC-011 — 271 asserts tautológicos não validam Team Chat e os testes de RLS simulam schema fictício (P2)

Há219 asserts true===true em comprehensive e52 em security-gaps. rls-contract.test.ts compara fixtures em memória com campos que não representam o schema real. Há harnesses SQL úteis, mas parciais; não há spec E2E Team Chat.

**Impacto:** Quantidade de testes e CI verde podem superestimar cobertura e esconder os defeitos de integração detectados.

**Correção necessária:** Substituir tautologias por testes comportamentais e ampliar os contratos PG17 existentes por risco, sem recriar testes que apenas espelham código.

**Aceite:** Teste falha ao reintroduzir cada defeito relevante e distingue negação adversarial de caminho legítimo; cobertura reportada com escopo transparente.

**Prova:** STATIC; alcance `reachable`.

Evidências: `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts:21–23`; `src/components/team-chat/__tests__/team-chat-security-gaps.test.ts:15–17`; `src/hooks/team-chat/__tests__/rls-contract.test.ts:1–30`; `scripts/db-audit/team-reaction-membership.test.sh:294–334`.

### TC-012 — Validator legado possui contratos incorretos e sucesso falso para respostas de erro (P2)

scripts/team-chat-db-validate.mjs consulta team_members e department_invites.token e chama accept com p_token. Seu check de RPC aceita qualquer resposta diferente de404, incluindo erros de autenticação e servidor. O arquivo possui um consumidor real no teste de sanitização de logs.

**Impacto:** Pode reportar validação satisfatória sem validar o banco; executar seu POST com credenciais privilegiadas não é uma simples leitura. Não deve ser considerado script morto só por ausência de import em src.

**Correção necessária:** Retirar ou reescrever junto com seu teste consumidor, usando contratos canônicos e ambiente descartável; preservar teste de log se ainda necessário.

**Aceite:** Erros401/403/500 causam falha e testes distinguem disponibilidade do endpoint de correção de contrato.

**Prova:** STATIC; alcance `maintenance_script`.

Evidências: `scripts/team-chat-db-validate.mjs:30–98`; `scripts/team-chat-db-validate.unit.mjs:12–28`.

### TC-013 — Dois planos de finalização coexistem sem autoridade reconciliada e contêm contratos divergentes (P2)

F100, da PR1171, se declara o único ledger vivo. TC 100, da PR1174, foi commitado114 segundos depois e substitui apenas planos E anteriores. Não resolve a coexistência com F100 e diverge em RPC de WhatsApp, retorno de reação e rota da PR1151. Ambos possuem cem caixas abertas e placeholders. Há referências internas incorretas e decisão de publication desatualizada no F.

**Impacto:** Reexecutar o texto literalmente pode repetir ações históricas, remover consumidores de realtime ou atribuir conclusões sem evidência atual.

**Correção necessária:** Ratificar uma linha de execução com a comparação por conteúdo entreF/TC, mantendo a linhagem e decisões atuais. Não repetir ações históricas ou somar as duas listas como200 funcionalidades.

**Aceite:** Todos100 itens têm status, origem, evidência e pendência; ações externas fechadas não são repetidas e publication corresponde aos consumidores.

**Prova:** STATIC; alcance `documentation_and_governance`.

Evidências: `docs/audits/PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md:1–8`; `docs/audits/PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md:37–42`; `docs/audits/PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md:173–200`; `scripts/db-audit/realtime-publication-baseline.json:30–34`; `src/hooks/team-chat/useTeamConversations.ts:110–124`; `docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md:3–10`; `docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md:113–115`; `docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md:214–216`; `docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md:132–134`.

### TC-014 — Branch em quarentena contém substituição incompatível das guardas globais (P1)

A branch confident-babbage troca o teste isolado de runtime por psql DESTINO_URL que retorna SKIP com exit 0 após falha de conexão. Também troca schema_version/project_ref/tables da baseline global por team_chat_tables com cinco objetos.

**Impacto:** Merge integral dessa branch poderia enfraquecer a validação global e tornar falha de conexão um resultado aprovado. Conteúdo funcional inédito não autoriza importar essas alterações.

**Correção necessária:** Manter branch e patches em quarentena. Qualquer resgate deve ser revisão por arquivo em branch atual, preservando as guardas globais.

**Aceite:** Testes globais continuam isolados e falham quando a validação não ocorre; baseline conserva contrato e cobertura de todos os módulos.

**Prova:** STATIC; alcance `unmerged_branch`.

Evidências: `scripts/db-audit/runtime-config.test.sh:1–28` (branch em quarentena); `scripts/db-audit/realtime-publication-baseline.json:1–11` (branch em quarentena).

### TC-015 — Implementações exclusivas da branch não são substitutos prontos dos contratos atuais (P1)

Na branch, paginação usa o primeiro id de uma página DESC como cursor, ocasionando sobreposição; read state compara UUIDs lexicalmente e não comprova todos os membros. Hooks de departamento passam assinatura errada para RPC de segredos. Tipos manuais declaram role quando DB usa member_role.

**Impacto:** A branch contém trabalho aproveitável, mas importar os arquivos em bloco criaria regressões. Seu atraso de687 commits exige revisão de compatibilidade também em AppShell, Sidebar e types.ts.

**Correção necessária:** Preservar evidência dos87 arquivos e37 commits; resgatar seletivamente a intenção com contratos atuais e testes de comportamento.

**Aceite:** Cursor usa último item/tuple correto; agregação não compara UUID como tempo e conta membros sem recibos; cada RPC corresponde ao tipo gerado.

**Prova:** STATIC; alcance `unmerged_branch`.

Evidências: `src/hooks/team-chat/useTeamMessages.ts:30–32` (branch em quarentena); `src/hooks/team-chat/useTeamReadState.ts:65–67` (branch em quarentena); `src/hooks/team-chat/useDepartmentManagement.ts:114–116` (branch em quarentena); `src/hooks/team-chat/teamChatTypes.ts:9–11` (branch em quarentena).

## Correções históricas e estado vivo

As PRs 1309 e 1313 corrigem o vínculo de reações e a ambiguidade/recursão no código. As issues 1265 e 1266 continuam abertas no snapshot de metadados. A policy recursiva de membros atingia uma tabela já lida pelos hooks, portanto não era toda ela latente, apesar do comentário amplo da migration. Os harnesses incluem controles negativos intencionais: uma linha ERROR isolada não demonstra falha. A prova histórica não substitui conferência do corpo vivo atual.

O log DB vivo coletado pela frente de PRs registra duas migrations de fixtures extras no ledger. O job offline falhou no bootstrap do Postgres descartável; isso não deve ser apresentado como falha de RLS. Detalhes e timestamps estão nos artefatos da frente de PRs.

## Branch e resíduos

A branch confident-babbage está preservada com 87 arquivos alterados, 37 commits exclusivos e 21 commits posteriores ao head da PR1151 fechada sem merge. Cada caminho tem hashes do merge-base, main e branch na matriz de quarentena. Os quarenta arquivos históricos de migrations já existem em main; isso não torna seguros os arquivos de front e guardas exclusivos da branch.

Componentes sem importador que os planos exigem foram classificados como integração pendente. CSS, i18n e A11y são candidatos a revisão de retirada. O validator possui consumidor de teste real. RPCs deprecated de previews/unread continuam ativas. Nenhum arquivo, branch, tabela ou função foi apagado, e nenhum item foi classificado DEAD_CONFIRMED com base em grep.

## Limites da conclusão

Tipos, catálogo e manifesto são capturas, não um atestado do estado vivo. Uma incompatibilidade estática de contrato não é uma exploração executada. Gerenciamento de departamento está inacessível na UI; os erros de WhatsApp são latentes, sem exposição de segredo demonstrada. Graphify confirma dependências extraídas e precisa ser combinado com revisão de importação dinâmica, roteamento, strings e SQL. Aceites com dois usuários, confirmação de deployment e observação de uma semana permanecem pendentes por sua natureza.
