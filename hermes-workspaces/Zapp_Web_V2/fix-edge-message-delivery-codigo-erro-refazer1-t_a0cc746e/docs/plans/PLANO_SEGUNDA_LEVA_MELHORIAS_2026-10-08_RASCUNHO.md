# Segunda leva de melhorias e correções — RASCUNHO para decisão (08/10/2026)

Base: `docs/audits/INVENTARIO_MELHORIAS_2026-10-07` (1.110 itens, 720 em aberto). **Nada aqui foi criado no quadro.** Cartões só nascem depois de você aprovar, com plano commitado, pelo motor de gatilhos.

## Como dividir (resumo)

| Leva | O quê | Itens | Quem executa | Precisa de você? |
|---|---|--:|---|---|
| **2A** | Segurança do banco (policies, grants, guards) — migrations locais + testes | 15 | workersql / workerauth / workertestes | aplicar em produção (como o lote #1902) |
| **2B** | Segurança de Edge Functions e IA (ai-proxy, vozes, kill switch, quota, ledger) | 11 | edgar / workertestes | deploy das Edges |
| **2C** | Provas que faltam (it.todo de RLS/telefonia, E2E vermelhos) | 11 | workertestes | não |
| **2D** | Funcional importante (bugs de tela, mensageria, telefonia, promessas "em breve") | 15 | iris / hugo / complexo | 3 decisões (abaixo) |
| **Checklist do Joaquim** | GitHub, credenciais, VPS, backup, envios reais em produção | 29 | **você** (eu preparo os passos) | sim |
| **2E** | Polimento P2/P3 por módulo (fundo, prioridade 1) | 396 | agentes, em lotes por módulo | não |
| **3** | Roadmap Talk X (V4, 200 etapas) e Multiplix (100) | 243 | por fases | você decide se e quando continua |

## Ordem e ritmo

1. **Primeiro esvaziar a leva 1**: hoje há ~190 itens aprovados esperando integração. A leva 2 só entra quando a fila cair abaixo de ~100 (o motor de gatilhos libera por dependência e por carga).
2. **2A e 2C primeiro** (segurança e provas), depois 2B, depois 2D. 2E roda em segundo plano com prioridade 1.
3. **No máximo 6 a 8 cartões novos por dia por área** para não repetir a fila de ontem (61% de lotes vermelhos).
4. Cada tema vira **um plano commitado** em `docs/plans/` (etapas numeradas, critérios de aceite, rollback) antes de qualquer cartão.

## Decisões que dependem de você

1. **Promessas "Em breve" na tela** (Videochamada, Encaminhar arquivo em 5 pontos, módulos "em desenvolvimento"): implementar, ou esconder até existirem? _Recomendo: implementar "Encaminhar arquivo" (fica dentro do sistema) e esconder Videochamada e os módulos sem tela._
2. **Push notifications** (desativadas por segurança): reativar com o service worker revisado, ou manter fora desta leva? _Recomendo manter fora; é uma frente própria._
3. **Talk X e Multiplix**: continuar o roadmap V4 agora (183 + 62 itens) ou congelar até a leva de segurança terminar? _Recomendo congelar e retomar na leva 3._
4. **Aplicação em produção** das migrations da 2A: mesmo método do lote #1902 (você autoriza; eu aplico no banco canônico com conferência de hash).

**Verificado hoje no banco canônico (só leitura):** `search_contacts` é SECURITY DEFINER, mas o corpo filtra pelo usuário (`auth.uid()` / visibilidade do contato). O item "todos veem todos os contatos" parece desatualizado: na 2A ele entra como **verificação com teste de 2 usuários**, não como correção às cegas.

## Leva 2A — Segurança do banco

- **F06-F14** · Banco/Migrations · Storage, mídia, índices, auditoria, WhatsApp, membership, padronização de autorização — _falta:_ Storage (R1: policies de team-chat-files ainda por auth.uid()) e vocabulário de auditoria (R5) sem correção; F
- **C-04** · Banco/Migrations · 20260930120000 nunca aplicada (reprodução confirmada) — _falta:_ Estado do ledger de produção não verificável
- **F15-F20** · Banco/Migrations · CHECKs de department_invitations, create/accept_department_invite, CHECKs de receipts, COMMENTs — _falta:_ F15-F17 (convite novo formato) sem evidência; F18 CHECK de receipts existe (e33)
- **CT-03** · Catálogo · REVOKE EXECUTE em zapp_catalog_stats() para authenticated (PromoGifts) — _falta:_ DDL no banco externo PromoGifts não existe no repo; nenhum REVOKE em supabase/
- **L3** · IA · INSERT em conversation_analyses valida visibilidade (analyzed_by IS NULL) — _falta:_ Política de leitura alinhada; policy de INSERT não confirmada
- **B15** · IA · RLS de messages ignora ciclo de vida (is_deleted) e bucket audio-memes público — _falta:_ Sem prova nas migrations lidas
- **M4** · Segurança/RLS · user_roles sem guard de trigger e audit_role_changes não loga UPDATE — _falta:_ Não confirmado se há trigger BEFORE UPDATE em user_roles nem cobertura de UPDATE na auditoria
- **GATE C / F97** · Segurança/RLS · Revogar GRANT anon das 5 RPCs antigas (get_contact_360_by_phone etc.) e migrar para service key + guard HMAC (F22) — _falta:_ crm-integration nao tem o guard F22 (HMAC do escopo); revogacao de anon no banco Singu nao verificavel.
- **—** · Segurança/RLS · Corrigir guard logico auth.uid() IS NOT NULL AND NOT (...) nas RPCs SECURITY DEFINER de gamificacao (add_agent_xp, grant_agent_ach — _falta:_ Reescrever o guard como auth.uid() IS NULL OR NOT (...) (defesa em profundidade, independente de ACL) e cobrir
- **R1** · Segurança/RLS · Corrigir policies SELECT/DELETE do bucket team-chat-files (auth.uid() vs current_profile_id()) — _falta:_ Recriar policies SELECT/DELETE de team-chat-files usando current_profile_id() (pasta = profile id)
- **Pend 2 (M-01)** · Segurança/RLS · search_contacts SECURITY DEFINER ignora RLS (todos veem todos os contatos) — _falta:_ Decisão de produto sobre visibilidade; conferir se o predicado cobre o caso e se a RPC ainda é DEFINER
- **A2** · Segurança/RLS · tcm_insert_member: restringir quem pode inscrever OUTRO perfil (só admin/supervisor) — _falta:_ tcm_insert_member exige member_role=member e autor membro/admin/criador, mas qualquer membro ainda inscreve qu
- **Aberto 1** · Segurança/RLS · 5 funções DEFINER com authenticated=X sem guard (cleanup_*, reassign_*, skill_based_assign) — _falta:_ Sem REVOKE/guard localizado para reassign_absent_agents, reassign_overloaded_agents e skill_based_assign
- **R5** · Team chat · Unificar vocabulário de department_audit_logs.action (CHECK × hook × badges) — _falta:_ CHECK existe; falta provar que hook e badges usam o mesmo vocabulário
- **R7** · Team chat · Convites: código 8 chars A-Z0-9, não gravar código em auditoria, p_role/p_email, status accepted/already_member — _falta:_ Código ainda tem 12 chars base64, não 8 A-Z0-9; p_role/p_email e status accepted/already_member não localizado

## Leva 2B — Edge Functions e IA

- **B3** · IA · elevenlabs-voice-design exige papel e audita criação de voz — _falta:_ supabase/functions/elevenlabs-voice-design/index.ts sem checagem de papel
- **B4** · IA · Lista fechada de vozes/modelos TTS aceitos (voice_id livre) — _falta:_ schemas.ts:166 aceita voice_id livre; sem allowlist
- **B8** · IA · feature_flags lidas no servidor para desligar capacidade de IA — _falta:_ git grep feature_flags em supabase/functions só em crm-integration; IA-009 declara implementação futura
- **IA-009** · IA · Kill switch por capacidade/bot/provedor operável no servidor — _falta:_ Desenho feito; implementação prometida nos blocos 02/05/11 sem sinal em _shared
- **IA-058** · IA · Alertas de consumo anômalo (apenas projeto DESIGN_ONLY) — _falta:_ Nenhum alerta/bloqueio por capacidade em operação
- **A6/B14** · IA · Quota/rate limit atômico compartilhado (não por isolate) — _falta:_ Guard ainda falha aberto em erro de infra (ai-guards.ts); 10 endpoints com identidade sem cota
- **B6** · IA · Toda chamada paga gera linha no ledger (elevenlabs-*, voice-agent, classify-*) — _falta:_ Nenhum logAiUsage em supabase/functions/elevenlabs-*; teste que garante o ledger em toda função não confirmado
- **B5** · IA · ai-proxy não aceita provider_id/model do cliente — _falta:_ Campos model/provider_id ainda aceitos no schema; restrição só no campo test (IA-040)
- **L4** · IA · voice-copilot-action:assign_conversation checa papel — _falta:_ Checa visibilidade; checagem de papel não confirmada
- **Auto-Anonymize** · Segurança/RLS · Mascarar CPF/cartoes em logs de IA no ai-proxy (P0) — _falta:_ Nenhuma logica de mascaramento/anonimizacao em supabase/functions/ai-proxy.
- **HMAC** · Segurança/RLS · HMAC em strictMode=false (Evolution GO não assina) — _falta:_ Autenticação real depende do instanceToken; strictMode só quando a GO assinar

## Leva 2C — Provas que faltam

- **E09** · CI/DevOps · Corrigir os 3 specs vermelhos do E2E logado (media-volume, reactions, talkx webkit) ou marcar fixme com issue e prazo — _falta:_ Se os 3 specs ficaram verdes depende do histórico de runs do CI (não há fixme/quarentena ativa no código)
- **A4b** · CI/DevOps · Criar teste de CI para a trava de escalada de privilégio em profiles — _falta:_ Criar teste scripts/db-audit para a trava de escalada de privilégio em profiles e ligar ao db-guard.yml
- **E03-E08** · CI/DevOps · Snapshot baseline, teste de contrato RLS no db-guard, fixtures E2E, team-chat-local-gates.sh — _falta:_ scripts/ci/team-chat-local-gates.sh não existe; fixtures e2e/team-chat e e2e/team-chat.spec.ts ausentes
- **CT-91** · Catálogo · Testar RLS com 2 usuários reais (agente x supervisor) — _falta:_ Teste de runtime com duas sessões autenticadas
- **CT-82** · Catálogo · e2e/catalog.spec.ts verde atravessando login até o envio — _falta:_ Spec existe e atravessa o fluxo mas não está verde nos 3 browsers
- **—** · Segurança/RLS · it.todo: provar RLS real (papeis e policies) contra Postgres descartavel — _falta:_ Criar scripts/db-audit/team-chat-rls.test.sh com papel real (anon/agente/outro tenant) provando negacoes e per
- **—** · Segurança/RLS · 3 it.todo: rls_forced=false nas 10 tabelas criticas, service_role ausente de src/, contagem de policies nao regride — _falta:_ Mover os 3 itens para db-audit/CI: query pg_class (relforcerowsecurity), guard no CI (ja existe) e baseline de
- **P1-7** · Talk X · E2E talkx.spec.ts "wizard advances to step 2" vermelho na main — _falta:_ Não há como provar o verde do CI a partir do repositório
- **—** · Telefonia · it.todo T43/T45: useMyCalls nunca envia p_scope=all quando o usuario nao e admin/supervisor — _falta:_ Escrever teste do hook garantindo scope=own para nao-admin e confirmar que a RPC tambem restringe no servidor
- **—** · Telefonia · it.todo: enforcement de SRTP explicito nas opcoes do SessionDescriptionHandler — _falta:_ Exigir SRTP/DTLS no SessionDescriptionHandler (rejeitar RTP claro) e provar em teste
- **—** · Telefonia · it.todo: espera (hold), transferencia e conferencia de chamada — _falta:_ Implementar hold/transferencia/conferencia SIP e testes; hoje funcionalidade de telefonia basica ausente

## Leva 2D — Funcional importante

- **R3-04** · CRM360 · format(new Date('yyyy-MM-dd')) mostra data de nascimento/fundação um dia antes — _falta:_ Trocar por parse de data local (parseISO/calendarDayKey) nos dois pontos
- **BUG-1** · CRM360 · Aba Journey servindo chunk JourneyTab 404 em produção — _falta:_ Bug de produção/deploy; sem prova no repo de correção
- **—** · Configurações/Notificações · Push notifications e alertas push de seguranca \"temporariamente desativados nesta versão\" (SERVICE_WORKER_ENABLED=false) — _falta:_ Reintroduzir service worker/VitePWA + web-push (VAPID, subscricao no banco, envio por Edge Function) ou remove
- **F2 E15-E22** · Edge Functions · Envio e proxy por instância; aposentar EVOLUTION_INSTANCE_TOKEN/NAME e o literal PRINCIPAL — _falta:_ Fallback global e nome PRINCIPAL ainda presentes; circuit breaker por instância (E22) não localizado
- **A3/A4/A5** · IA · Aplicar resultado do backend em churn/classificação; campos do histórico; fontes gerenciais — _falta:_ Blocos 03/12 do plano IA-200 fora desta frente; sem prova direta no código
- **F53-F63** · Inbox/Chat · Hooks passam a usar get_team_inbox / get_team_messages_page / mark_team_conversation_read / toggle_team_reaction / set_team_member — _falta:_ Nenhum dos RPCs novos é chamado em src (aparecem só em integrations/supabase/types.ts); front segue caminho an
- **passo 3** · Inbox/Chat · Alerta automatico ao admin quando conexao fica disconnected por 2 amostras — _falta:_ Nenhum trigger/funcao de alerta em supabase/migrations.
- **—** · Inbox/Chat · Botao Videochamada mostra toast \"Em breve\" — _falta:_ Implementar videochamada (WhatsApp/VoIP com video) ou remover o botao ate existir backend; hoje promete funcao
- **—** · Inbox/Chat · Acao Encaminhar arquivo desabilitada \"Disponível em breve\" (5 pontos: FileCard, FileDetailPanel:82, FilesListView:114, FilesTabl — _falta:_ Implementar encaminhamento de midia/arquivo a outro contato (reuso do fluxo de envio de midia) e liberar os 4 
- **F0 E01-E07** · Inbox/Chat · Janela do bloqueio da Meta: banner honesto, retomada controlada, runbook — _falta:_ Banner "WhatsApp indisponível" e trava de envio (E02), política de retomada (E05) não localizados no código
- **F5 E35-E41** · Inbox/Chat · Uma conexão padrão atômica; resposta pela conexão do contato; departamento->conexão — _falta:_ Unicidade atômica da padrão, regra departamento->conexão e whatsapp_connection_queues (E38) sem evidência
- **Sprint 3** · Inbox/Chat · Retry com exponential backoff, dead-letter de mensagens, job de reconciliacao e alertas de desconexao — _falta:_ Sem tabela failed_messages nem backoff em src/hooks/evolution/useEvolutionMessaging.ts para o envio do Inbox.
- **—** · Outros · FallbackView \"Este módulo está em desenvolvimento e será disponibilizado em breve\" para qualquer view sem componente em VIEW_MAP — _falta:_ Cruzar registro de modulos x VIEW_MAP e listar os modulos que mostram a tela \"Em construção\"; esconder do me
- **checklist** · Segurança/RLS · Campos LGPD, purge automatico semanal, exportacao e anonimizacao de titular, DPO, RIPD — _falta:_ Purge generico por tabela, anonimizacao, DPO definido ([A definir]) e RIPD nao encontrados; so Talk X tem expu
- **RPC-ORFA** · Talk X · RPCs de agregação talkx_overview_stats/campaign_report/segment_tags/benchmarks sem consumidor no front — _falta:_ git grep em src (exceto types.ts) não encontra nenhum .rpc dessas funções; Visão geral/Analytics/relatório seg

## Checklist do Joaquim (ações fora do alcance dos agentes)

- **E04** · Banco/Migrations · Reconciliar a version duplicada 20260930390000 via reserve_migration_version — _falta:_ Estado do ledger de produção não verificável; sem commit identificado
- **§6 backup** · Banco/Migrations · Teste de restore real em ambiente descartável com RPO/RTO — _falta:_ Exige ambiente isolado e aprovação do dono; nenhum registro de restore executado
- **E24** · Banco/Migrations · Evidência de PITR e teste de restore real documentado — _falta:_ Exige acesso ao painel Supabase e ambiente descartável (dono)
- **checklist** · Banco/Migrations · PITR, backup semanal, teste de restore, widget de saude do backup, drill trimestral — _falta:_ PITR/backup sao config do Supabase; nao ha widget (grep BackupStatus=0) nem registro de drill.
- **—** · Banco/Migrations · Configurar vault secret sicoob_service_role_key para ativar o envio HTTP do bridge Sicoob (notify_sicoob_on_reply) — _falta:_ Confirmar no banco que o secret existe e esta rotacionado; se sim, apagar o TODO do comentario da migration
- **E03** · CI/DevOps · Mergear a PR #1343 de types-sync — _falta:_ Ação operacional em PR do GitHub; não verificável no código
- **passo 2** · CI/DevOps · Monitor de uptime externo em /version.json com alerta — _falta:_ Nenhum uptime check/URL de painel registrado no repo.
- **E10** · CI/DevOps · Decidir o Quality Gate do SonarCloud (ajustar/desinstalar/manter) — _falta:_ Decisão do dono sobre ajustar/desinstalar/manter o gate não está registrada no repo
- **Fase 4** · CRM360 · Encerrar modo legado: revogar EXECUTE de anon nas RPCs do CRM externo, remover secrets VITE_CLIENTES_*, rotacionar anon key extern — _falta:_ Requer acesso admin ao projeto CRM externo pgxfvjmuubtbowutlide; secrets VITE_CLIENTES_* ainda citados em docs
- **CT-10** · Catálogo · Envio real de produto (2 fotos) em produção para número de teste — _falta:_ Depende de sessão autenticada e execução manual do Joaquim; sem registro em ENVIO_E2E.md
- **E08** · Catálogo · Envio real ponta a ponta nunca testado em produção (confirmado aberto em 29/09) — _falta:_ Depende do CT-10 executado por Joaquim
- **CT-11** · Catálogo · Envio real com falha induzida (foto inválida) resultando em partial — _falta:_ Depende do CT-10; só há teste unitário (e690bc458)
- **CT-12/CT-18/CT-50/CT-56/CT-88** · Catálogo · Fechamentos de bloco A/B/E/F/I (PR mergeada + smoke/envio real em produção) — _falta:_ Faltam smokes em produção e e2e verde nos 3 browsers (bloqueio por login de teste)
- **F1** · Edge Functions · Aplicar cron_secret_dedicado_l5 (jobs 4,8,12 ainda usam zapp_anon_key) — _falta:_ Aplicação em produção não verificável pelo código
- **C-05/#2** · Edge Functions · Publicar send-email, detect-new-device, send-scheduled-report (correção do from arbitrário) e corrigir concurrency do deploy — _falta:_ Publicação em produção das 3 funções não verificável pelo código
- **E24** · Segurança/RLS · Mover SUPABASE_SERVICE_ROLE_KEY para environment e2e-producao — _falta:_ Mover o secret para environment e2e-producao com aprovação e referenciá-lo no job
- **E07** · Segurança/RLS · SUPABASE_SERVICE_ROLE_KEY em secret de repositório público; migrar para environment — _falta:_ Mover para environment protegido, apagar o secret de repositório e ajustar os workflows
- **97** · Segurança/RLS · Rotacionar credenciais expostas (service_role, senha DB, MCP_TOKEN, GLOBAL_API_KEY Evolution) — _falta:_ Sem registro de rotacao no repo.
- **E25** · Segurança/RLS · Trocar curl DELETE com service_role por RPC e2e_cleanup_conversation_closures() — _falta:_ RPC não existe em supabase/migrations (só citada no plano e em P006.json)
- **E26** · Segurança/RLS · Criar role ci_readonly e secret DESTINO_URL_RO para guardas — _falta:_ Nenhuma ocorrência de ci_readonly/DESTINO_URL_RO
- **secao 2** · Segurança/RLS · Registrar data da ultima rotacao da service_role key e rotacionar a cada 90 dias — _falta:_ Preencher a tabela na proxima rotacao.
- **—** · Segurança/RLS · API publica suspensa por seguranca; autenticacao a ser substituida por credenciais server-side hashadas com escopo por empresa, ro — _falta:_ Projetar e implementar chaves de API hashadas (escopo por empresa, rotacao, auditoria) e reabrir o painel
- **E29** · Segurança/RLS · Rotacionar EVOLUTION_API_KEY/INSTANCE_TOKEN e chaves de IA com mais de 90 dias — _falta:_ Rotação exige acesso aos provedores e risco de derrubar o WhatsApp; decisão do dono
- **E90** · Segurança/RLS · Restringir por URL o token publico da Mapbox no painel Mapbox — _falta:_ Acao fora do repo; nao ha como provar pelo codigo.
- **16** · Segurança/RLS · Hardening SSH da VPS (PasswordAuthentication no, PermitRootLogin prohibit-password) — _falta:_ Config da VPS fora do repo.
- **pre-requisitos** · Segurança/RLS · Hostname dedicado + rota Traefik + secrets na VPS/Edge + smoke negativo em producao — _falta:_ Estado de producao da VPS/secrets fora do repo.
- **P4/QW2** · Segurança/RLS · Confirmar EVOLUTION_WEBHOOK_ENFORCE=token no Dashboard + regex de preview no CORS — _falta:_ Valor do secret em produção não verificável (só no Dashboard)
- **E29 rotação** · Segurança/RLS · Sem data de última rotação rastreável para secrets das edges — _falta:_ Falta inventário com data de rotação para EVOLUTION_*, OPENROUTER, RESEND, ELEVENLABS etc. e rotação >90d (dec
- **T96/T97** · Telefonia · Homologação de áudio com agente real e reconciliação de chamadas presas em ringing — _falta:_ Depende de agente real/banco

## Leva 2E — Polimento P2/P3 (por módulo)

| Módulo | Itens |
|---|--:|
| CI/DevOps | 74 |
| Segurança/RLS | 38 |
| Inbox/Chat | 37 |
| Outros | 32 |
| Banco/Migrations | 31 |
| Performance | 22 |
| Telefonia | 22 |
| Contatos | 20 |
| Catálogo | 19 |
| Edge Functions | 18 |
| Design System/UI | 17 |
| IA | 17 |
| Dashboard/Analytics | 11 |
| E-mail | 8 |
| Tarefas/Quadro | 8 |
| Acessibilidade | 6 |
| CRM360 | 6 |
| Configurações/Notificações | 5 |
| Filas/SLA | 4 |
| Documentação | 1 |

Lista completa e filtrável: `INVENTARIO_MELHORIAS_2026-10-07.tsv` (coluna `prioridade`).
