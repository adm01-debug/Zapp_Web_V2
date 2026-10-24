# Cruzamento R2 (372) × main atual — Zapp Web V2

Fonte: `docs/reconciliation/reaudit/2026-10-03/reports/*/findings.json` (pin `da307ba5`). Main atual `2b4dac2d` (20 commits depois; 97 arquivos de produto alterados, sem contar `docs/reconciliation`). Mesma regra do cruzamento dos 104.

| | Total | P1 | P2 | P3 |
|---|---|---|---|---|
| Intactos | 331 | 56 | 260 | 15 |
| Reverificar | 41 | 7 | 32 | 2 |
| Total | 372 | 63 | 292 | 17 |

## P1 (todos)

| ID | Área | Título | Situação |
|---|---|---|---|
| R2-AUTH-001 | auth | WebAuthn aceita verificação sem assinatura, authenticatorData ou validação de origem | de pé |
| R2-AUTH-002 | auth | Login com passkey anuncia autenticação mas somente inicia OTP por email | de pé |
| R2-AUTH-003 | auth | MFA no login está fora da cadeia de autorização das rotas | de pé |
| R2-AUTH-004 | auth | Desativar usuário, forçar logout e encerrar dispositivos não revogam sessões Auth | de pé |
| R2-AUTH-006 | auth | Recuperação anônima consulta profiles protegido e não cria solicitação | de pé |
| R2-AUTH-007 | auth | Aprovar recuperação gera link que a UI descarta e anuncia email não enviado | de pé |
| R2-AUTH-008 | auth | Troca de papel apaga privilégios antes de confirmar a nova atribuição | de pé |
| R2-AUTH-009 | auth | Matriz anuncia permissão removida mesmo quando a revogação retorna erro | de pé |
| R2-AUTH-010 | auth | Rascunho e resposta do Team Chat atravessam conversas e permanecem entre contas | de pé |
| R2-AUTH-018 | auth | Inteligência CRM aceita pessoa externa diferente do vínculo estável | **reverificar** (supabase/functions/crm-integration/index.ts, src/components/inbox/contact-details/ContactAccordionSections.tsx) |
| R2-AUTH-022 | auth | Bloqueios de IP/país e regras configuráveis não dirigem a autorização local | **reverificar** (supabase/functions/_shared/validation.ts) |
| R2-CALL-001 | calls | Evento tardio da sessão SIP anterior altera a chamada seguinte | de pé |
| R2-CALL-007 | calls | Atender e ignorar alerta WhatsApp usam comandos SIP sem identidade da notificação | de pé |
| R2-COM-001 | communication | Conversa de Email entra em ciclo de atualização ao repassar contexto ao painel | de pé |
| R2-COM-009 | communication | Retorno OAuth do Gmail prossegue apesar de state ausente ou inválido | de pé |
| R2-DB-001 | database | Nova sobrecarga de registro de chamadas permite escrita privilegiada por PUBLIC | **reverificar** (supabase/schema-manifest.json, scripts/db-audit/grants-baseline.json) |
| R2-DB-003 | database | Resolver Singu devolve metadados de empresas e contatos classificados fora do escopo | de pé |
| R2-DB-004 | database | Reserva de orçamento de IA aceita chave já encerrada enquanto o consumidor chama o provedor novamente | de pé |
| R2-DB-007 | database | As duas rotinas de concluir dispatch ainda atribuem CASE text a coluna enum | **reverificar** (supabase/schema-catalog.json) |
| R2-DB-009 | database | Conquista de mensagens bloqueia o envio do agente ao atingir um marco | **reverificar** (supabase/schema-manifest.json) |
| R2-DB-020 | database | Policy de arquivos do Team Chat compara o caminho com o nome do perfil e perde o vínculo com o objeto | **reverificar** (supabase/schema-manifest.json) |
| R2-DB-022 | database | Referência de mídia gravável pelo agente funciona como autorização para outro objeto privado | **reverificar** (supabase/schema-manifest.json) |
| R2-INB-001 | inbox | Resposta/citação selecionada no Composer perde o ID antes do transporte | de pé |
| R2-INB-002 | inbox | Encaminhar mensagem pelo chat anuncia conclusão sem executar envio | de pé |
| R2-INB-003 | inbox | Construtor de mensagens interativas confirma envio sem transporte | de pé |
| R2-INB-004 | inbox | Histórico anterior às últimas 1000 mensagens não é alcançável pela UI ativa | de pé |
| R2-INB-005 | inbox | Janela global de mensagens transforma conversas ativas em histórico vazio e zero não lidas | de pé |
| R2-INB-006 | inbox | Falha após enqueue remove o anexo persistido e retry cria outra ação | de pé |
| R2-INB-007 | inbox | Retry de texto duplica assinatura e rompe a idempotência | de pé |
| R2-INB-008 | inbox | Gravador não interrompe captura no limite de duração nem no unmount | de pé |
| R2-INB-009 | inbox | Transferência do chat e em lote viola o contrato do diálogo | de pé |
| R2-INB-010 | inbox | Agendamento fecha e apaga draft antes de confirmar persistência | de pé |
| R2-INB-014 | inbox | Editar e apagar mensagem exibem sucesso mesmo com operação rejeitada | de pé |
| R2-INB-022 | inbox | Falha ao enviar áudio desmonta gravador e descarta gravação recuperável | de pé |
| R2-INB-049 | inbox | Excluir uma figurinha compartilhada pode remover o arquivo da mensagem original | de pé |
| R2-INB-057 | inbox | VoiceChangerPicker mantém ou inicia captura depois de fechar ou desmontar | de pé |
| R2-INF-001 | infra | O dry_run de Edge Functions pode reescrever secrets do projeto | de pé |
| R2-INF-002 | infra | Artifact de deploy pode ser publicado depois de falhar a remoção de secrets | de pé |
| R2-INF-003 | infra | DB Migrate sobrescreve o DSN endurecido e perde verify-full no transporte | de pé |
| R2-INF-004 | infra | Os 12 contratos de runtime são Bash enviados como SQL; 767 versões não têm arquivo | de pé |
| R2-INF-005 | infra | Consulta pós-apply do ledger contém comentários Bash inválidos em SQL | de pé |
| R2-INF-006 | infra | Limpeza de E2E apaga todas as reações do usuário logado | de pé |
| R2-INF-007 | infra | E2E de mensagens envia para o primeiro contato sem validar a fixture | de pé |
| R2-INF-022 | infra | Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário | de pé |
| R2-MOD-001 | modules | Editor de automações reutiliza estado de outro registro | de pé |
| R2-MOD-002 | modules | Salvar automação substitui condições e lista de ações por configuração incompleta | de pé |
| R2-MOD-007 | modules | Catálogo em lote classifica falha integral de texto como sucesso e limpa seleção falhada | de pé |
| R2-MOD-013 | modules | Anotação de chamada acompanha troca de linha e pode sobrescrever outra chamada | de pé |
| R2-MOD-024 | modules | Respostas atrasadas de variantes e histórico são aplicadas ao template seguinte | de pé |
| R2-MOD-025 | modules | Reabrir rascunho TalkX grande pode reduzir audiência pelo autosave da primeira página | de pé |
| R2-MOD-068 | modules | Roundtrip de Chatbot grava JSON como string e reabre o grafo vazio | de pé |
| R2-API-001 | providers | Ações de controle Evolution não exigem papel nem escopo de conexão | de pé |
| R2-API-006 | providers | Opt-out e atribuição podem se perder após o ingest, sem recuperação no replay | de pé |
| R2-API-009 | providers | Download de mídia do webhook aceita URL arbitrária sem política de egress | de pé |
| R2-API-011 | providers | Gmail webhook/cron avançam cursor compartilhado sem aplicar todo o histórico | de pé |
| R2-API-021 | providers | Autenticidade dos webhooks permanece apenas observada em caminhos públicos | de pé |
| R2-API-022 | providers | Rotinas privilegiadas de e-mail, manutenção e integração não autorizam o chamador | de pé |
| R2-API-027 | providers | Transcrição aceita mensagem visível sem mídia e baixa objeto escolhido pelo cliente com service role | de pé |
| R2-API-029 | providers | Prévia e validação Multiplix aceitam destinatário de outro disparo | de pé |
| R2-QUE-001 | root | Analytics de filas apresentam estimativas fixas como resultados medidos | de pé |
| R2-QUE-002 | root | Contagem de espera zerada impede os alertas configurados de filas | de pé |
| R2-QUE-003 | root | Totais de filas são calculados sobre amostras truncadas | de pé |
| R2-SLA-003 | root | Configurações granulares de prazo não governam o SLA efetivo | de pé |

## Reverificar (P2/P3)

- R2-AUTH-012 P2 — Ações VIP, arquivar, bloquear e tags no detalhe do contato não persistem (src/components/inbox/ContactDetails.tsx, src/components/inbox/contact-details/ContactAccordionSections.tsx)
- R2-AUTH-019 P2 — Edição de empresa/contato no CRM externo aceita zero linhas como sucesso (supabase/functions/crm-integration/index.ts)
- R2-AUTH-025 P2 — Editor inline de empresa/cargo conserva vazio inicial e pode apagar dado carregado (src/components/inbox/contact-details/ContactAccordionSections.tsx, src/components/inbox/contact-details/contactDetailSections.ts)
- R2-AUTH-027 P2 — Usuário pode liberar o próprio flag administrativo de download (supabase/schema-manifest.json)
- R2-AUTH-033 P2 — Página de roles usa embed inexistente e transforma erro de consulta em listas vazias (supabase/schema-manifest.json, src/integrations/supabase/types.ts)
- R2-AUTH-035 P2 — Status WhatsApp converte indisponibilidade em ausência de status e apresenta Offline sem medição (src/components/inbox/contact-details/ContactAccordionSections.tsx)
- R2-DB-008 P2 — Índice de um fechamento por dia impede encerrar novamente uma conversa reaberta (supabase/schema-manifest.json)
- R2-DB-010 P2 — Usuário pode zerar o contador de requisições do catálogo pela RPC pública autenticada (supabase/functions/promogifts-catalog/index.ts)
- R2-DB-011 P2 — Policy de recibos permite registrar leitura própria em conversa da qual o usuário não participa (supabase/schema-manifest.json)
- R2-DB-014 P2 — Cancelamento em voo pode descartar a confirmação do provedor e impedir reconciliação (supabase/functions/talkx-send/process-recipient.ts)
- R2-DB-015 P2 — Retry terminal do TalkX pode voltar a pending sem se tornar elegível ao worker (supabase/functions/talkx-send/index.ts)
- R2-DB-016 P2 — Mesclagem autorizada de contato com nota é bloqueada pelo guard posterior de identidade (supabase/schema-manifest.json)
- R2-DB-019 P2 — Reações do WhatsApp não vinculam a autoria ao usuário que grava (supabase/schema-manifest.json)
- R2-DB-021 P2 — A segunda reação ao mesmo emoji conflita com a chave reservada ao contato (supabase/schema-manifest.json)
- R2-DB-023 P2 — Trigger de recuperação ainda escreve campo removido e bloqueia o pedido autenticado (supabase/schema-manifest.json)
- R2-INB-056 P2 — Contador Em atendimento e badge de responsável comparam auth ID com profile ID (src/integrations/supabase/types.ts)
- R2-INB-061 P2 — Falha ao carregar scoring habilita salvar defaults sobre dados existentes (src/components/inbox/contact-details/ContactAccordionSections.tsx)
- R2-INF-008 P2 — Ratchets de TypeScript tratam falha do compilador como zero erros (.github/workflows/types-sync.yml)
- R2-INF-013 P2 — Inventário de testes ignora quatro suites Node fora dos globs de CI (scripts/ci/check-test-inventory.mjs, .github/workflows/db-guard.yml)
- R2-INF-014 P2 — Replay local reutiliza nome destrutivamente e tem exit0 após falhas de migrations (scripts/db-audit/replay-local.sh, docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md)
- R2-INF-016 P2 — Guarda de exposição de erro não encontra respostas 500 presentes no repositório (supabase/functions/_shared/validation.ts)
- R2-INF-024 P2 — Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação (tests/contracts/_adv_edge_legacy_producers.test.ts)
- R2-INF-042 P2 — Gate E98 de contraste descarta violações serious da regra que promete proteger (playwright.config.ts)
- R2-MOD-034 P2 — Lista de supressão não identifica nem encontra bloqueios cadastrados somente por telefone (src/components/talkx/TalkXSuppression.tsx)
- R2-MOD-035 P2 — Cadastro de supressão busca contato somente no primeiro lote carregado (src/components/talkx/TalkXSuppression.tsx)
- R2-MOD-036 P2 — Consumidores Talk X ainda convertem erro de leitura em vazio ou carregamento indefinido (src/components/talkx/TalkXSegments.tsx, src/components/talkx/TalkXSuppression.tsx)
- R2-MOD-037 P2 — Analytics Talk X rotula taxa de envio como entrega e usa volume para recomendar abertura (src/components/talkx/TalkXAnalytics.tsx)
- R2-MOD-038 P2 — Detalhe de segmento conserva cópia antiga depois de salvar e pode reabrir campos obsoletos (src/components/talkx/TalkXSegments.tsx)
- R2-MOD-059 P2 — Filtro de período do Talk X aparece nas quatro telas sem consumidor (src/components/talkx/TalkXTemplates.tsx, src/components/talkx/TalkXSegments.tsx, src/components/talkx/TalkXSuppression.tsx)
- R2-MOD-061 P2 — Atalho Duplicar template abre o editor do original (src/components/talkx/TalkXTemplates.tsx)
- R2-API-010 P2 — Horário comercial salvo, worker e scheduler usam contratos diferentes (supabase/functions/talkx-send/index.ts)
- R2-API-049 P2 — Insights Talk X escolhem engajamento por contagem e deixam concluídas fora do alerta (src/components/talkx/TalkXAnalytics.tsx)
- R2-MOD-060 P3 — Tamanho de página em Templates, Segmentos e Supressão é um controle sem efeito (src/components/talkx/TalkXTemplates.tsx, src/components/talkx/TalkXSegments.tsx, src/components/talkx/TalkXSuppression.tsx)
- R2-API-020 P3 — Distribuição A/B por hash depende da ordem não especificada das variantes (supabase/functions/talkx-send/process-recipient.ts)

## P2/P3 de pé: 275 registros — lista completa em `dados/m_r2_repin.json`.
