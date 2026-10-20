# Inventário de melhorias planejadas — 07/10/2026

**1110 itens** catalogados em planos, auditorias, ADRs, runbooks e marcas no código (ref `dia/2026-10-07`).

| Status | Itens |
|---|---|
| IMPLEMENTADA | 330 |
| PARCIAL | 305 |
| NAO_IMPLEMENTADA | 258 |
| NAO_VERIFICAVEL | 157 |
| OBSOLETA | 60 |

**Em aberto (parcial + não feita + não verificável): 720** — prioridade (antes da verificação acima): P0=20, P1=63, P2=184, P3=215, sem=238

Lista completa e filtrável: `INVENTARIO_MELHORIAS_2026-10-07.tsv` (abre no Excel). `NAO_VERIFICAVEL` = depende do banco vivo ou de ação do dono.

## Por módulo

| Módulo | Feita | Parcial | Não feita | Não verific. | Obsoleta | Em aberto |
|---|--:|--:|--:|--:|--:|--:|
| Talk X | 26 | 122 | 51 | 10 | 9 | 183 |
| CI/DevOps | 46 | 29 | 21 | 30 | 9 | 80 |
| Segurança/RLS | 47 | 19 | 27 | 17 | 3 | 63 |
| Multiplix | 12 | 38 | 17 | 7 | 1 | 62 |
| Inbox/Chat | 29 | 11 | 20 | 13 | 9 | 44 |
| Banco/Migrations | 29 | 12 | 11 | 16 | 9 | 39 |
| Outros | 14 | 8 | 20 | 5 | 3 | 33 |
| IA | 15 | 10 | 14 | 5 | 0 | 29 |
| Catálogo | 9 | 11 | 9 | 6 | 1 | 26 |
| Telefonia | 6 | 4 | 16 | 6 | 1 | 26 |
| Performance | 3 | 11 | 6 | 5 | 0 | 22 |
| Edge Functions | 19 | 10 | 8 | 3 | 1 | 21 |
| Contatos | 30 | 6 | 6 | 8 | 7 | 20 |
| Design System/UI | 11 | 1 | 10 | 6 | 2 | 17 |
| Dashboard/Analytics | 6 | 2 | 8 | 1 | 0 | 11 |
| CRM360 | 4 | 1 | 2 | 6 | 0 | 9 |
| E-mail | 2 | 2 | 2 | 4 | 0 | 8 |
| Tarefas/Quadro | 8 | 2 | 2 | 4 | 1 | 8 |
| Acessibilidade | 7 | 3 | 1 | 2 | 1 | 6 |
| Configurações/Notificações | 3 | 1 | 4 | 1 | 0 | 6 |
| Filas/SLA | 0 | 1 | 2 | 1 | 0 | 4 |
| Team chat | 1 | 1 | 0 | 1 | 0 | 2 |
| Documentação | 3 | 0 | 1 | 0 | 3 | 1 |

## P0 em aberto (segurança e dados primeiro)

- **E03** (nao verificavel) Mergear a PR #1343 de types-sync — _falta:_ Ação operacional em PR do GitHub; não verificável no código
- **E04** (nao verificavel) Reconciliar a version duplicada 20260930390000 via reserve_migration_version — _falta:_ Estado do ledger de produção não verificável; sem commit identificado
- **E09** (nao verificavel) Corrigir os 3 specs vermelhos do E2E logado (media-volume, reactions, talkx webkit) ou marcar fixme com issue e prazo — _falta:_ Se os 3 specs ficaram verdes depende do histórico de runs do CI (não há fixme/quarentena ativa no código)
- **E24** (nao implementada) Mover SUPABASE_SERVICE_ROLE_KEY para environment e2e-producao — _falta:_ Mover o secret para environment e2e-producao com aprovação e referenciá-lo no job
- **F06-F14** (parcial) Storage, mídia, índices, auditoria, WhatsApp, membership, padronização de autorização — _falta:_ Storage (R1: policies de team-chat-files ainda por auth.uid()) e vocabulário de auditoria (R5) sem correção; F10 get_department_whatsapp_config inexistente
- **E07** (nao implementada) SUPABASE_SERVICE_ROLE_KEY em secret de repositório público; migrar para environment — _falta:_ Mover para environment protegido, apagar o secret de repositório e ajustar os workflows
- **M4** (nao verificavel) user_roles sem guard de trigger e audit_role_changes não loga UPDATE — _falta:_ Não confirmado se há trigger BEFORE UPDATE em user_roles nem cobertura de UPDATE na auditoria
- **CT-10** (nao verificavel) Envio real de produto (2 fotos) em produção para número de teste — _falta:_ Depende de sessão autenticada e execução manual do Joaquim; sem registro em ENVIO_E2E.md
- **L3** (parcial) INSERT em conversation_analyses valida visibilidade (analyzed_by IS NULL) — _falta:_ Política de leitura alinhada; policy de INSERT não confirmada
- **E08** (nao verificavel) Envio real ponta a ponta nunca testado em produção (confirmado aberto em 29/09) — _falta:_ Depende do CT-10 executado por Joaquim
- **97** (nao verificavel) Rotacionar credenciais expostas (service_role, senha DB, MCP_TOKEN, GLOBAL_API_KEY Evolution) — _falta:_ Sem registro de rotacao no repo.
- **GATE C / F97** (parcial) Revogar GRANT anon das 5 RPCs antigas (get_contact_360_by_phone etc.) e migrar para service key + guard HMAC (F22) — _falta:_ crm-integration nao tem o guard F22 (HMAC do escopo); revogacao de anon no banco Singu nao verificavel.
- **Auto-Anonymize** (nao implementada) Mascarar CPF/cartoes em logs de IA no ai-proxy (P0) — _falta:_ Nenhuma logica de mascaramento/anonimizacao em supabase/functions/ai-proxy.
- **** (parcial) Corrigir guard logico auth.uid() IS NOT NULL AND NOT (...) nas RPCs SECURITY DEFINER de gamificacao (add_agent_xp, grant_agent_achievement, increment_ — _falta:_ Reescrever o guard como auth.uid() IS NULL OR NOT (...) (defesa em profundidade, independente de ACL) e cobrir com teste db-audit
- **** (nao implementada) it.todo: provar RLS real (papeis e policies) contra Postgres descartavel — _falta:_ Criar scripts/db-audit/team-chat-rls.test.sh com papel real (anon/agente/outro tenant) provando negacoes e permissoes
- **** (parcial) 3 it.todo: rls_forced=false nas 10 tabelas criticas, service_role ausente de src/, contagem de policies nao regride — _falta:_ Mover os 3 itens para db-audit/CI: query pg_class (relforcerowsecurity), guard no CI (ja existe) e baseline de contagem de policies; apagar os todo do unit test
- **** (nao implementada) it.todo T43/T45: useMyCalls nunca envia p_scope=all quando o usuario nao e admin/supervisor — _falta:_ Escrever teste do hook garantindo scope=own para nao-admin e confirmar que a RPC tambem restringe no servidor
- **** (nao implementada) it.todo: enforcement de SRTP explicito nas opcoes do SessionDescriptionHandler — _falta:_ Exigir SRTP/DTLS no SessionDescriptionHandler (rejeitar RTP claro) e provar em teste

**Verificado em 07/10 no banco canônico (só leitura):** os dois P0 sobre "anon" (123 tabelas/views com SELECT e 3 funções com EXECUTE) NÃO são exposição real — 115 tabelas com RLS ligado, 8 views `security_invoker`, 0 policies abertas para anon/public, e só 1 função de trigger (não DEFINER) executável por PUBLIC. Foram rebaixados para P2/P3 (revogar é defesa em profundidade).

## P1 em aberto, por módulo

### Banco/Migrations (6)
- **F15-F20** (parcial) CHECKs de department_invitations, create/accept_department_invite, CHECKs de receipts, COMMENTs — _falta:_ F15-F17 (convite novo formato) sem evidência; F18 CHECK de receipts existe (e33)
- **C-04** (nao verificavel) 20260930120000 nunca aplicada (reprodução confirmada) — _falta:_ Estado do ledger de produção não verificável
- **§6 backup** (nao verificavel) Teste de restore real em ambiente descartável com RPO/RTO — _falta:_ Exige ambiente isolado e aprovação do dono; nenhum registro de restore executado
- **E24** (nao verificavel) Evidência de PITR e teste de restore real documentado — _falta:_ Exige acesso ao painel Supabase e ambiente descartável (dono)
- **checklist** (nao verificavel) PITR, backup semanal, teste de restore, widget de saude do backup, drill trimestral — _falta:_ PITR/backup sao config do Supabase; nao ha widget (grep BackupStatus=0) nem registro de drill.
- **** (nao verificavel) Configurar vault secret sicoob_service_role_key para ativar o envio HTTP do bridge Sicoob (notify_sicoob_on_reply) — _falta:_ Confirmar no banco que o secret existe e esta rotacionado; se sim, apagar o TODO do comentario da migration

### CI/DevOps (4)
- **A4b** (nao implementada) Criar teste de CI para a trava de escalada de privilégio em profiles — _falta:_ Criar teste scripts/db-audit para a trava de escalada de privilégio em profiles e ligar ao db-guard.yml
- **E10** (parcial) Decidir o Quality Gate do SonarCloud (ajustar/desinstalar/manter) — _falta:_ Decisão do dono sobre ajustar/desinstalar/manter o gate não está registrada no repo
- **E03-E08** (parcial) Snapshot baseline, teste de contrato RLS no db-guard, fixtures E2E, team-chat-local-gates.sh — _falta:_ scripts/ci/team-chat-local-gates.sh não existe; fixtures e2e/team-chat e e2e/team-chat.spec.ts ausentes
- **passo 2** (nao implementada) Monitor de uptime externo em /version.json com alerta — _falta:_ Nenhum uptime check/URL de painel registrado no repo.

### CRM360 (3)
- **R3-04** (nao implementada) format(new Date('yyyy-MM-dd')) mostra data de nascimento/fundação um dia antes — _falta:_ Trocar por parse de data local (parseISO/calendarDayKey) nos dois pontos
- **BUG-1** (nao verificavel) Aba Journey servindo chunk JourneyTab 404 em produção — _falta:_ Bug de produção/deploy; sem prova no repo de correção
- **Fase 4** (nao verificavel) Encerrar modo legado: revogar EXECUTE de anon nas RPCs do CRM externo, remover secrets VITE_CLIENTES_*, rotacionar anon key externa — _falta:_ Requer acesso admin ao projeto CRM externo pgxfvjmuubtbowutlide; secrets VITE_CLIENTES_* ainda citados em docs/security/secret-surface-inventory.md.

### Catálogo (5)
- **CT-03** (nao implementada) REVOKE EXECUTE em zapp_catalog_stats() para authenticated (PromoGifts) — _falta:_ DDL no banco externo PromoGifts não existe no repo; nenhum REVOKE em supabase/
- **CT-11** (nao verificavel) Envio real com falha induzida (foto inválida) resultando em partial — _falta:_ Depende do CT-10; só há teste unitário (e690bc458)
- **CT-12/CT-18/CT-50/CT-56/CT-88** (parcial) Fechamentos de bloco A/B/E/F/I (PR mergeada + smoke/envio real em produção) — _falta:_ Faltam smokes em produção e e2e verde nos 3 browsers (bloqueio por login de teste)
- **CT-82** (parcial) e2e/catalog.spec.ts verde atravessando login até o envio — _falta:_ Spec existe e atravessa o fluxo mas não está verde nos 3 browsers
- **CT-91** (nao implementada) Testar RLS com 2 usuários reais (agente x supervisor) — _falta:_ Teste de runtime com duas sessões autenticadas

### Configurações/Notificações (1)
- **** (nao implementada) Push notifications e alertas push de seguranca \"temporariamente desativados nesta versão\" (SERVICE_WORKER_ENABLED=false) — _falta:_ Reintroduzir service worker/VitePWA + web-push (VAPID, subscricao no banco, envio por Edge Function) ou remover as telas de configuracao

### Edge Functions (3)
- **F1** (nao verificavel) Aplicar cron_secret_dedicado_l5 (jobs 4,8,12 ainda usam zapp_anon_key) — _falta:_ Aplicação em produção não verificável pelo código
- **C-05/#2** (parcial) Publicar send-email, detect-new-device, send-scheduled-report (correção do from arbitrário) e corrigir concurrency do deploy — _falta:_ Publicação em produção das 3 funções não verificável pelo código
- **F2 E15-E22** (parcial) Envio e proxy por instância; aposentar EVOLUTION_INSTANCE_TOKEN/NAME e o literal PRINCIPAL — _falta:_ Fallback global e nome PRINCIPAL ainda presentes; circuit breaker por instância (E22) não localizado

### IA (11)
- **A6/B14** (parcial) Quota/rate limit atômico compartilhado (não por isolate) — _falta:_ Guard ainda falha aberto em erro de infra (ai-guards.ts); 10 endpoints com identidade sem cota
- **B6** (parcial) Toda chamada paga gera linha no ledger (elevenlabs-*, voice-agent, classify-*) — _falta:_ Nenhum logAiUsage em supabase/functions/elevenlabs-*; teste que garante o ledger em toda função não confirmado
- **A3/A4/A5** (nao verificavel) Aplicar resultado do backend em churn/classificação; campos do histórico; fontes gerenciais — _falta:_ Blocos 03/12 do plano IA-200 fora desta frente; sem prova direta no código
- **B3** (nao implementada) elevenlabs-voice-design exige papel e audita criação de voz — _falta:_ supabase/functions/elevenlabs-voice-design/index.ts sem checagem de papel
- **B4** (nao implementada) Lista fechada de vozes/modelos TTS aceitos (voice_id livre) — _falta:_ schemas.ts:166 aceita voice_id livre; sem allowlist
- **B5** (parcial) ai-proxy não aceita provider_id/model do cliente — _falta:_ Campos model/provider_id ainda aceitos no schema; restrição só no campo test (IA-040)
- **B8** (nao implementada) feature_flags lidas no servidor para desligar capacidade de IA — _falta:_ git grep feature_flags em supabase/functions só em crm-integration; IA-009 declara implementação futura
- **B15** (nao verificavel) RLS de messages ignora ciclo de vida (is_deleted) e bucket audio-memes público — _falta:_ Sem prova nas migrations lidas
- **IA-009** (nao implementada) Kill switch por capacidade/bot/provedor operável no servidor — _falta:_ Desenho feito; implementação prometida nos blocos 02/05/11 sem sinal em _shared
- **IA-058** (nao implementada) Alertas de consumo anômalo (apenas projeto DESIGN_ONLY) — _falta:_ Nenhum alerta/bloqueio por capacidade em operação
- **L4** (parcial) voice-copilot-action:assign_conversation checa papel — _falta:_ Checa visibilidade; checagem de papel não confirmada

### Inbox/Chat (7)
- **F53-F63** (nao implementada) Hooks passam a usar get_team_inbox / get_team_messages_page / mark_team_conversation_read / toggle_team_reaction / set_team_member_pref — _falta:_ Nenhum dos RPCs novos é chamado em src (aparecem só em integrations/supabase/types.ts); front segue caminho anterior
- **F0 E01-E07** (parcial) Janela do bloqueio da Meta: banner honesto, retomada controlada, runbook — _falta:_ Banner "WhatsApp indisponível" e trava de envio (E02), política de retomada (E05) não localizados no código
- **F5 E35-E41** (parcial) Uma conexão padrão atômica; resposta pela conexão do contato; departamento->conexão — _falta:_ Unicidade atômica da padrão, regra departamento->conexão e whatsapp_connection_queues (E38) sem evidência
- **passo 3** (nao implementada) Alerta automatico ao admin quando conexao fica disconnected por 2 amostras — _falta:_ Nenhum trigger/funcao de alerta em supabase/migrations.
- **Sprint 3** (parcial) Retry com exponential backoff, dead-letter de mensagens, job de reconciliacao e alertas de desconexao — _falta:_ Sem tabela failed_messages nem backoff em src/hooks/evolution/useEvolutionMessaging.ts para o envio do Inbox.
- **** (nao implementada) Botao Videochamada mostra toast \"Em breve\" — _falta:_ Implementar videochamada (WhatsApp/VoIP com video) ou remover o botao ate existir backend; hoje promete funcao inexistente
- **** (nao implementada) Acao Encaminhar arquivo desabilitada \"Disponível em breve\" (5 pontos: FileCard, FileDetailPanel:82, FilesListView:114, FilesTableView:167) — _falta:_ Implementar encaminhamento de midia/arquivo a outro contato (reuso do fluxo de envio de midia) e liberar os 4 botoes

### Outros (1)
- **** (nao verificavel) FallbackView \"Este módulo está em desenvolvimento e será disponibilizado em breve\" para qualquer view sem componente em VIEW_MAP/SPECIAL_VIEWS — _falta:_ Cruzar registro de modulos x VIEW_MAP e listar os modulos que mostram a tela \"Em construção\"; esconder do menu os que nao tem tela

### Segurança/RLS (16)
- **A2** (parcial) tcm_insert_member: restringir quem pode inscrever OUTRO perfil (só admin/supervisor) — _falta:_ tcm_insert_member exige member_role=member e autor membro/admin/criador, mas qualquer membro ainda inscreve qualquer perfil; falta restringir inscrição de terce
- **E25** (nao implementada) Trocar curl DELETE com service_role por RPC e2e_cleanup_conversation_closures() — _falta:_ RPC não existe em supabase/migrations (só citada no plano e em P006.json)
- **E26** (nao implementada) Criar role ci_readonly e secret DESTINO_URL_RO para guardas — _falta:_ Nenhuma ocorrência de ci_readonly/DESTINO_URL_RO
- **R1** (nao implementada) Corrigir policies SELECT/DELETE do bucket team-chat-files (auth.uid() vs current_profile_id()) — _falta:_ Recriar policies SELECT/DELETE de team-chat-files usando current_profile_id() (pasta = profile id)
- **P4/QW2** (parcial) Confirmar EVOLUTION_WEBHOOK_ENFORCE=token no Dashboard + regex de preview no CORS — _falta:_ Valor do secret em produção não verificável (só no Dashboard)
- **Aberto 1** (parcial) 5 funções DEFINER com authenticated=X sem guard (cleanup_*, reassign_*, skill_based_assign) — _falta:_ Sem REVOKE/guard localizado para reassign_absent_agents, reassign_overloaded_agents e skill_based_assign
- **Pend 2 (M-01)** (nao verificavel) search_contacts SECURITY DEFINER ignora RLS (todos veem todos os contatos) — _falta:_ Decisão de produto sobre visibilidade; conferir se o predicado cobre o caso e se a RPC ainda é DEFINER
- **E29** (nao verificavel) Rotacionar EVOLUTION_API_KEY/INSTANCE_TOKEN e chaves de IA com mais de 90 dias — _falta:_ Rotação exige acesso aos provedores e risco de derrubar o WhatsApp; decisão do dono
- **E29 rotação** (parcial) Sem data de última rotação rastreável para secrets das edges — _falta:_ Falta inventário com data de rotação para EVOLUTION_*, OPENROUTER, RESEND, ELEVENLABS etc. e rotação >90d (decisão do dono)
- **HMAC** (parcial) HMAC em strictMode=false (Evolution GO não assina) — _falta:_ Autenticação real depende do instanceToken; strictMode só quando a GO assinar
- **E90** (nao verificavel) Restringir por URL o token publico da Mapbox no painel Mapbox — _falta:_ Acao fora do repo; nao ha como provar pelo codigo.
- **16** (nao verificavel) Hardening SSH da VPS (PasswordAuthentication no, PermitRootLogin prohibit-password) — _falta:_ Config da VPS fora do repo.
- **pre-requisitos** (nao verificavel) Hostname dedicado + rota Traefik + secrets na VPS/Edge + smoke negativo em producao — _falta:_ Estado de producao da VPS/secrets fora do repo.
- **secao 2** (nao implementada) Registrar data da ultima rotacao da service_role key e rotacionar a cada 90 dias — _falta:_ Preencher a tabela na proxima rotacao.
- **checklist** (parcial) Campos LGPD, purge automatico semanal, exportacao e anonimizacao de titular, DPO, RIPD — _falta:_ Purge generico por tabela, anonimizacao, DPO definido ([A definir]) e RIPD nao encontrados; so Talk X tem expurgo.
- **** (nao implementada) API publica suspensa por seguranca; autenticacao a ser substituida por credenciais server-side hashadas com escopo por empresa, rotacao e auditoria — _falta:_ Projetar e implementar chaves de API hashadas (escopo por empresa, rotacao, auditoria) e reabrir o painel

### Talk X (2)
- **P1-7** (nao verificavel) E2E talkx.spec.ts "wizard advances to step 2" vermelho na main — _falta:_ Não há como provar o verde do CI a partir do repositório
- **RPC-ORFA** (nao implementada) RPCs de agregação talkx_overview_stats/campaign_report/segment_tags/benchmarks sem consumidor no front — _falta:_ git grep em src (exceto types.ts) não encontra nenhum .rpc dessas funções; Visão geral/Analytics/relatório seguem sem fonte (X077, X075, X161)

### Team chat (2)
- **R5** (nao verificavel) Unificar vocabulário de department_audit_logs.action (CHECK × hook × badges) — _falta:_ CHECK existe; falta provar que hook e badges usam o mesmo vocabulário
- **R7** (parcial) Convites: código 8 chars A-Z0-9, não gravar código em auditoria, p_role/p_email, status accepted/already_member — _falta:_ Código ainda tem 12 chars base64, não 8 A-Z0-9; p_role/p_email e status accepted/already_member não localizados

### Telefonia (2)
- **T96/T97** (nao verificavel) Homologação de áudio com agente real e reconciliação de chamadas presas em ringing — _falta:_ Depende de agente real/banco
- **** (nao implementada) it.todo: espera (hold), transferencia e conferencia de chamada — _falta:_ Implementar hold/transferencia/conferencia SIP e testes; hoje funcionalidade de telefonia basica ausente
