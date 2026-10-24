# Backlog verificado — Zapp Web V2 (04/10/2026)

Fila única para o Kanban da nova arquitetura. Montado só com leitura: `origin/main` = `7a1585279` e banco de produção `tnnnlkbymytvtqngbbqh` lido pelo `zapp-db-ler` (última leitura 15:05 UTC). Nada foi corrigido.

**Regra de contagem:** as fontes **não foram somadas nem renumeradas** (104 do GPT, 372 R2 e 15 R3 se sobrepõem). Cada linha mantém o ID de origem; quando o mesmo problema aparece em mais de uma fonte, vira uma linha só com todos os IDs. Itens CORRIGIDO ficam no anexo, fora da fila.

## Resumo

- **Linhas na fila:** 499 · **anexo (CORRIGIDO):** 3 · IDs de origem cobertos: 524
- **Por estado (fila):** DE_PE: **472** · PARCIAL: **7** · A_DECIDIR: **4** · DEPENDE_DO_DONO: **16**
- **Por severidade (fila):** P0: **2** · P1: **106** · P2: **352** · P3: **38** · P4: **1** (P1 segurança: **28**, P1 funcional: **78**)
- **Por área (fila):** features: **2** · components: **188** · pages: **2** · hooks: **87** · services: **17** · edge: **77** · migrations: **67** · testes: **10** · ci: **30** · docs: **19**
- **Por executor (fila):** worker: **383** · designer: **19** · complexo: **77** · dono: **20**
- **Por tamanho (fila):** P: **114** · M: **344** · G: **41** (P < 90 min · M · G = quebrar antes de executar)
- **Fontes:** 104 GPT (104 IDs) · R2 (372 IDs) · R3 (15 IDs) · incidentes/mapa M-*/DELTA (13) · caixa (20)

## As 10 primeiras da fila, em linguagem simples

1. **Motor do Talk X parado** (M-DB-01 = R3-DELTA-006/007, P0). A tarefa que roda a cada minuto quebra sempre, porque tenta apagar arquivos do Storage direto pelo banco, e o Supabase proíbe isso. Sem ela não há envio de campanha, alerta nem limpeza. Hoje: 180 falhas em 180 tentativas nas últimas 3 h. *Complexo, M.*
2. **Porta aberta para gravar chamadas falsas** (M-DB-02 = R2-DB-001, P0 segurança). Uma função do banco pode ser chamada por qualquer pessoa só com a chave pública do site, sem login, e grava chamada e notificação em nome de qualquer contato. Confirmado no banco hoje. Correção pequena, mas mexe em produção. *Complexo, P.*
3. **Webhooks aceitam mensagens sem prova de origem** (R2-API-021). As portas que recebem eventos do WhatsApp e do Gmail não barram pedido sem assinatura. Um estranho consegue injetar eventos que o servidor processa com acesso total. *Complexo, M.*
4. **Rotinas de e-mail e manutenção não conferem quem chamou** (R2-API-022). Qualquer usuário logado consegue mandar e-mail pela conta da empresa, gerar relatório ou fechar conversas em massa. *Complexo, G.*
5. **Qualquer usuário pode desconectar ou reconfigurar o WhatsApp** (R2-API-001). Desligar, reiniciar ou trocar o webhook da instância só exige estar logado. Não pede papel de admin. *Complexo, M.*
6. **Desativar usuário não derruba a sessão dele** (R2-AUTH-004). "Forçar logout" e "desativar" só marcam um campo. A pessoa continua dentro do sistema. *Complexo, G.*
7. **Download de mídia aceita qualquer endereço** (R2-API-009). O servidor baixa a URL que vier no evento, inclusive endereço interno, sem filtro nem limite de tamanho. *Complexo, M.*
8. **Grupos do Team Chat sem regra de dono e com permissão larga** (TC-003). Confirmado no banco: a criação de grupo depende de truque, o último dono pode sair e deixar o grupo órfão, e usuários logados podem alterar a tabela de conversas inteira. *Complexo, M.*
9. **Ensaio do deploy pode trocar os segredos de verdade** (R2-INF-001). O modo "só testar" do deploy das funções ainda regrava as chaves do projeto. *Complexo, M.*
10. **A verificação em duas etapas (MFA) não é exigida** (R2-AUTH-003). Existe a tela, mas nenhuma rota obriga o segundo fator, então quem tem a senha entra direto. *Complexo, M.*

Na fila, logo depois das 10 primeiras: o resto de P1 de segurança (WebAuthn, replay do webhook de voz, policies de arquivos/mídia…) e depois os **P1 funcionais**. Eles abrem com os incidentes ativos: **TC-004** (sair ou remover membro do Team Chat dá erro, confirmado no banco), **401 da IA** (DeepSeek recusa a chave; o Joaquim precisa trocá-la), **R3-DELTA-001** (alertas do Talk X não gravam) e **M-INF-03** (os domínios oficiais ainda servem o V3).

## Como ler as colunas

- **Estado:** DE_PE = defeito existe hoje; PARCIAL = parte feita, falta o resto; A_DECIDIR = precisa de decisão antes; DEPENDE_DO_DONO = só o Joaquim pode fazer/autorizar; CORRIGIDO = no anexo.
- **Prova:** "re-pino … evidência intacta" = os arquivos citados pelo auditor não mudaram desde a auditoria (o defeito continua por inferência, sem nova leitura linha a linha); "REVERIF." = conferido hoje no código atual; "vivo" = conferido hoje no banco de produção.
- **Quem:** worker = tarefa simples para agente comum; complexo = segurança, banco de produção, P0/P1 sensível ou tarefa G; designer = visual/contraste/layout; dono = Joaquim.
- **Área:** onde a correção principal mora (derivada dos arquivos de evidência; "migrations" inclui funções/policies SQL).

## Fila


### P0 incidente

| # | ID(s) | Sev | Problema | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|---|---|
| 1 | M-DB-01, R3-DELTA-006, R3-DELTA-007 | P0 | Motor do Talk X parado: cron talkx-scheduler-1min falha todo minuto (expurgo apaga storage.objects por SQL e derruba o tick) | migrations | DE_PE | vivo 04/10 15:05: 180/180 execuções falharam nas últimas 3 h | M | complexo |
| 2 | M-DB-02, R2-DB-001 | P0 | record_incoming_call_event (7 args) SECURITY DEFINER executável por anon: qualquer um grava chamada/notificação com a chave pública | migrations | DE_PE | vivo 04/10 15:05: has_function_privilege(anon)=true na versão de 7 args | P | complexo |

### P1 segurança

| # | ID(s) | Sev | Problema | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|---|---|
| 3 | R2-API-021 | P1 | Autenticidade dos webhooks permanece apenas observada em caminhos públicos | edge | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 4 | R2-API-022 | P1 | Rotinas privilegiadas de e-mail, manutenção e integração não autorizam o chamador | edge | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 5 | R2-API-001 | P1 | Ações de controle Evolution não exigem papel nem escopo de conexão | edge | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 6 | R2-AUTH-004 | P1 | Desativar usuário, forçar logout e encerrar dispositivos não revogam sessões Auth | migrations | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 7 | R2-API-009 | P1 | Download de mídia do webhook aceita URL arbitrária sem política de egress | edge | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 8 | TC-003 | P1 | Membership não protege bootstrap e último owner; grants de conversa continuam amplos | migrations | DE_PE | REVERIF.+vivo: policies tcm_insert/delete | M | complexo |
| 9 | R2-INF-001 | P1 | O dry_run de Edge Functions pode reescrever secrets do projeto | ci | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 10 | R2-AUTH-003 | P1 | MFA no login está fora da cadeia de autorização das rotas | hooks | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 11 | R2-AUTH-001 | P1 | WebAuthn aceita verificação sem assinatura, authenticatorData ou validação de origem | edge | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 12 | IA-WEBHOOK-001 | P1 | Webhook assinado ainda aceita replay e não verifica falha de insert | edge | DE_PE | REVERIF.+vivo: sem índice único em audit_logs | M | complexo |
| 13 | R2-DB-020 | P1 | Policy de arquivos do Team Chat compara o caminho com o nome do perfil e perde o vínculo com o objeto | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 14 | R2-DB-022 | P1 | Referência de mídia gravável pelo agente funciona como autorização para outro objeto privado | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 15 | R2-INF-022 | P1 | Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário | edge | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 16 | R2-API-027 | P1 | Transcrição aceita mensagem visível sem mídia e baixa objeto escolhido pelo cliente com service role | edge | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 17 | R2-COM-009 | P1 | Retorno OAuth do Gmail prossegue apesar de state ausente ou inválido | edge | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 18 | TRA-002 | P1 | Rotas de várias conexões ainda podem usar a credencial global da instância padrão | edge | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 19 | MX07 | P1 | Adapter GO recebe chave global sem token da instância | edge | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 20 | IA-EGRESS-001 | P1 | Endpoint e nome de secret configuráveis não têm vinculação segura completa | migrations | DE_PE | REVERIF.+vivo: ai-providers.ts:108; ai_providers sem CHECK | M | complexo |
| 21 | MX08 | P1 | API de rascunho mistura identidades/colunas e aceita destinatário do cliente | edge | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 22 | TRA-006 | P1 | Renomear ou apagar label do WhatsApp opera globalmente sem a instância | migrations | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 23 | R2-API-029 | P1 | Prévia e validação Multiplix aceitam destinatário de outro disparo | edge | DE_PE | re-pino R2: evidência intacta | P | complexo |
| 24 | R2-AUTH-009 | P1 | Matriz anuncia permissão removida mesmo quando a revogação retorna erro | hooks | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 25 | R2-AUTH-010 | P1 | Rascunho e resposta do Team Chat atravessam conversas e permanecem entre contas | components | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 26 | R2-AUTH-018 | P1 | Inteligência CRM aceita pessoa externa diferente do vínculo estável | edge | DE_PE | REVERIF.: crm-integration/index.ts:189-192, 676-688 | M | complexo |
| 27 | R2-AUTH-022 | P1 | Bloqueios de IP/país e regras configuráveis não dirigem a autorização local | components | DE_PE | REVERIF.: validation.ts:301-304; is_ip_blocked sem consumidor | G | complexo |
| 28 | R2-DB-003 | P1 | Resolver Singu devolve metadados de empresas e contatos classificados fora do escopo | edge | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 29 | R2-INF-002 | P1 | Artifact de deploy pode ser publicado depois de falhar a remoção de secrets | ci | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 30 | R2-INF-003 | P1 | DB Migrate sobrescreve o DSN endurecido e perde verify-full no transporte | migrations | DE_PE | re-pino R2: evidência intacta | M | complexo |

### P1 funcional

| # | ID(s) | Sev | Problema | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|---|---|
| 31 | TC-004 | P1 | RPCs de saída e remoção referem uma coluna role inexistente | migrations | DE_PE | vivo 04/10: leave_team_group/remove_team_member usam tcm.role; coluna é member_role | M | complexo |
| 32 | CAIXA-4fe7 (IA 401) | P1 | IA de texto: provedor padrão DeepSeek recusa a chave (HTTP 401) e cai no fallback; trocar a chave no segredo do Supabase | edge | DEPENDE_DO_DONO | vivo: 6/6 chamadas 401 em 02/10; nenhuma chamada desde 02/10 17:31 (não dá p/ confirmar correção) | P | dono |
| 33 | R3-DELTA-001 | P1 | Talk X: view emite outcome_unknown_24h mas CHECK de talkx_alerts só aceita outcome_unknown — lote de alertas não grava | migrations | DE_PE | caderno §11.1 + vivo (CHECK); sem migration depois de 65679f38 | P | complexo |
| 34 | M-INF-03, M-INF-02 | P1 | Domínios oficiais (zapp.atomicabr.com.br, zappweb.app.br) servem o V3 abandonado; V2 só em *.vercel.app, em 2 projetos Vercel duplicados — escolher hospedagem e apontar domínios | ci | DEPENDE_DO_DONO | MAPA_INFRA §1–2 (Portainer/Vercel 04/10) | M | dono |
| 35 | DASH-ACCEPTANCE-001 | P1 | Testes e documentos atuais não encerram RLS, integração e liberação das 100 etapas | testes | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 36 | DASH-METRICS-001, R2-MOD-018, R2-MOD-019, R2-MOD-030, R2-MOD-075 | P1 | Totais e ausência de dados ainda usam proxies, caps e fallbacks incorretos | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 37 | DASH-REALTIME-001 | P1 | Realtime/refresh misturam escopo, conexão, batch mutável e janelas | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 38 | DASH-SQL-REGRESSION-001 | P1 | Migration de soft-delete reintroduz corpo antigo de dashboard_contact_counts | migrations | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 39 | IA-CHATBOT-001 | P1 | Chatbot não usa connectionId para selecionar flow e histórico | edge | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 40 | IA-CIRCUIT-001 | P1 | IA-050 não possui circuit breaker apesar de frase de fechamento do bloco | edge | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 41 | IA-METRICS-001 | P1 | Ferramentas gerenciais ainda derivam conclusões de dados incompatíveis | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 42 | IA-QUOTA-001, R2-DB-004 | P1 | Separação ação/tentativa/cobrança não foi ligada à quota real | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 43 | IA-SENTIMENT-001 | P1 | Consumidores do Dashboard divergem do vocabulário canônico PT-BR | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 44 | IA-TIMEOUT-001 | P1 | Prazo de IA não cobre consumo do corpo e log essencial continua best effort | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 45 | MX01 | P1 | Composer inicia rascunho sem materializar a fila por itens | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 46 | MX02 | P1 | Worker envia template e mídia globais, divergindo do bloco e da prévia | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 47 | MX03 | P1 | Conclusão usa a fila antiga de recipients após enviar itens | migrations | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 48 | MX04 | P1 | Cota por conexão subconta o novo Multiplix e aceita medição inválida | migrations | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 49 | MX05 | P1 | Erro429 definitivo do provedor não recebe retentativa limitada | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 50 | MX06 | P1 | Worker ignora variável ausente e envia texto vazio no lugar | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 51 | OTH-001 | P1 | Encaminhar N omite arquivos selecionados fora do filtro | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 52 | OTH-003 | P1 | Sincronização Gmail parcial gera toast de sucesso | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 53 | OTH-004 | P1 | Exportação de Catálogo pode omitir produtos com nomes empatados | components | DE_PE | REVERIF.: index.ts:390 só .order(order_by) | M | worker |
| 54 | TC-001 | P1 | Fluxo de mídia usa três contratos incompatíveis entre storage, mensagem e renderização | migrations | DE_PE | re-pino 04/10: evidência intacta | G | complexo |
| 55 | TC-002 | P1 | RPC ativa de conversa direta perdeu a proteção contra criação concorrente | migrations | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 56 | TC-005, R2-AUTH-017 | P1 | Gerenciamento de departamento está inacessível e contém contratos de banco inválidos | migrations | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 57 | TC-006 | P1 | Paginação, reações e ticks existem parcialmente fora do Panel ativo | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 58 | TC-014 | P1 | Branch em quarentena contém substituição incompatível das guardas globais | migrations | DE_PE | re-pino 04/10: evidência intacta | M | complexo |
| 59 | TC-015 | P1 | Implementações exclusivas da branch não são substitutos prontos dos contratos atuais | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 60 | TEL-PERIOD-001 | P1 | Contrato de filtros do histórico: all literal e período ausente | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 61 | TEL-RECONCILIATION-001 | P1 | Reconciliação Bitrix escolhe chamada por sufixo e perde semântica de encerramento | edge | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 62 | TEL-RECORDING-001 | P1 | Player espera JSON de URL, mas Edge retorna stream de áudio | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 63 | TEL-RUNTIME-001 | P1 | Persistência SIP e código de gravação não encerram homologação real | services | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 64 | TRA-001 | P1 | Banco Único presume origem VPS e destino Singu distintos do Cloud ZAPP canônico | services | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 65 | TRA-003 | P1 | GO logada sem socket é classificada como conexão aberta | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 66 | TRA-005 | P1 | Excluir conexão pode esconder falha na GO e apagar o vínculo local | hooks | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 67 | TX02 | P1 | Preflight verde foi emitido sem conferir remoto nem secrets | ci | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 68 | VOL-02 | P1 | Player atual de gravação de Telefonia ficou fora do volume global | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 69 | R2-API-006 | P1 | Opt-out e atribuição podem se perder após o ingest, sem recuperação no replay | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 70 | R2-API-011 | P1 | Gmail webhook/cron avançam cursor compartilhado sem aplicar todo o histórico | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 71 | R2-AUTH-002 | P1 | Login com passkey anuncia autenticação mas somente inicia OTP por email | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 72 | R2-AUTH-006 | P1 | Recuperação anônima consulta profiles protegido e não cria solicitação | migrations | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 73 | R2-AUTH-007 | P1 | Aprovar recuperação gera link que a UI descarta e anuncia email não enviado | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 74 | R2-AUTH-008 | P1 | Troca de papel apaga privilégios antes de confirmar a nova atribuição | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 75 | R2-CALL-001 | P1 | Evento tardio da sessão SIP anterior altera a chamada seguinte | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 76 | R2-CALL-007 | P1 | Atender e ignorar alerta WhatsApp usam comandos SIP sem identidade da notificação | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 77 | R2-COM-001 | P1 | Conversa de Email entra em ciclo de atualização ao repassar contexto ao painel | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 78 | R2-DB-007 | P1 | As duas rotinas de concluir dispatch ainda atribuem CASE text a coluna enum | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 79 | R2-DB-009 | P1 | Conquista de mensagens bloqueia o envio do agente ao atingir um marco | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 80 | R2-INB-001 | P1 | Resposta/citação selecionada no Composer perde o ID antes do transporte | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 81 | R2-INB-002 | P1 | Encaminhar mensagem pelo chat anuncia conclusão sem executar envio | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 82 | R2-INB-003 | P1 | Construtor de mensagens interativas confirma envio sem transporte | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 83 | R2-INB-004 | P1 | Histórico anterior às últimas 1000 mensagens não é alcançável pela UI ativa | hooks | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 84 | R2-INB-005 | P1 | Janela global de mensagens transforma conversas ativas em histórico vazio e zero não lidas | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 85 | R2-INB-006 | P1 | Falha após enqueue remove o anexo persistido e retry cria outra ação | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 86 | R2-INB-007 | P1 | Retry de texto duplica assinatura e rompe a idempotência | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 87 | R2-INB-008 | P1 | Gravador não interrompe captura no limite de duração nem no unmount | hooks | DE_PE | re-pino R2: evidência intacta | M | designer |
| 88 | R2-INB-009 | P1 | Transferência do chat e em lote viola o contrato do diálogo | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 89 | R2-INB-010 | P1 | Agendamento fecha e apaga draft antes de confirmar persistência | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 90 | R2-INB-014 | P1 | Editar e apagar mensagem exibem sucesso mesmo com operação rejeitada | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 91 | R2-INB-022 | P1 | Falha ao enviar áudio desmonta gravador e descarta gravação recuperável | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 92 | R2-INB-049 | P1 | Excluir uma figurinha compartilhada pode remover o arquivo da mensagem original | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 93 | R2-INB-057 | P1 | VoiceChangerPicker mantém ou inicia captura depois de fechar ou desmontar | components | DE_PE | re-pino R2: evidência intacta | M | designer |
| 94 | R2-INF-004 | P1 | Os 12 contratos de runtime são Bash enviados como SQL; 767 versões não têm arquivo | migrations | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 95 | R2-INF-005 | P1 | Consulta pós-apply do ledger contém comentários Bash inválidos em SQL | ci | DE_PE | re-pino R2: evidência intacta | M | worker |
| 96 | R2-INF-006 | P1 | Limpeza de E2E apaga todas as reações do usuário logado | testes | DE_PE | re-pino R2: evidência intacta | P | worker |
| 97 | R2-INF-007 | P1 | E2E de mensagens envia para o primeiro contato sem validar a fixture | ci | DE_PE | re-pino R2: evidência intacta | P | worker |
| 98 | R2-MOD-001 | P1 | Editor de automações reutiliza estado de outro registro | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 99 | R2-MOD-002 | P1 | Salvar automação substitui condições e lista de ações por configuração incompleta | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 100 | R2-MOD-007 | P1 | Catálogo em lote classifica falha integral de texto como sucesso e limpa seleção falhada | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 101 | R2-MOD-013 | P1 | Anotação de chamada acompanha troca de linha e pode sobrescrever outra chamada | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 102 | R2-MOD-024 | P1 | Respostas atrasadas de variantes e histórico são aplicadas ao template seguinte | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 103 | R2-MOD-025 | P1 | Reabrir rascunho TalkX grande pode reduzir audiência pelo autosave da primeira página | migrations | DE_PE | re-pino R2: evidência intacta | M | complexo |
| 104 | R2-MOD-068 | P1 | Roundtrip de Chatbot grava JSON como string e reabre o grafo vazio | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 105 | R2-QUE-001 | P1 | Analytics de filas apresentam estimativas fixas como resultados medidos | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 106 | R2-QUE-002 | P1 | Contagem de espera zerada impede os alertas configurados de filas | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 107 | R2-QUE-003 | P1 | Totais de filas são calculados sobre amostras truncadas | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 108 | R2-SLA-003 | P1 | Configurações granulares de prazo não governam o SLA efetivo | components | DE_PE | re-pino R2: evidência intacta | G | complexo |

### P2

| # | ID(s) | Sev | Problema | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|---|---|
| 109 | CAIXA-2ff5 | P2 | Aprovar "Perímetro do GitHub" no CLAUDE.md e criar PAT/App com administration:read (Settings Guard está falhando) | ci | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 110 | CAIXA-320b | P2 | Restringir no painel Mapbox o token público aos domínios da Vercel | services | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 111 | CAIXA-5fb0 | P2 | IA-037: definir o texto do system_prompt por provedor (vazio nas 4 linhas) | edge | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 112 | CAIXA-85d1 | P2 | Informar BITRIX_WEBHOOK_URL e agendar a sync no n8n (gravações; liga com TEL-RECONCILIATION-001) | edge | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 113 | CAIXA-ba9f, CAIXA-4f9c | P2 | Login: fundir as chamadas de rate limit numa RPC (checar is_account_locked antes) e fixar auth-login na região do banco; medir p95 antes/depois | edge | DE_PE | caixa: decisão tomada (PENDENCIAS) | M | complexo |
| 114 | CAIXA-bbf6 | P2 | Criar o segredo searchbox_alert_cron_secret (Vault + CRON_SECRET da edge) | edge | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 115 | CAIXA-c183 | P2 | Telefonia T11: fazer uma ligação real no preview (liga com TEL-RUNTIME-001) | testes | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 116 | CAIXA-ccb5 | P2 | Actions: destino do db-migrate.yml (E62) e teste de rollback automático com o dono presente (E61) | ci | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 117 | CAIXA-dc60 | P2 | Catálogo: autorizar DDL no PromoGifts (CT-03/CT-22), um envio real de WhatsApp (CT-10/11/12/18) e confirmar credencial de QA | edge | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 118 | M-DB-03, R3-DELTA-002 | P2 | talkx_engine_cron_runs executável por authenticated sem checar papel | migrations | DE_PE | vivo (grants) + caderno §11.1 | P | worker |
| 119 | M-DB-06 | P2 | pg_cron "job startup timeout" em massa (2.006 em 03/10); criar detector no sensor (timeouts e ≥5 falhas seguidas) e achar a causa (pool/CPU) | ci | PARCIAL | vivo 04/10 15:05: 0 timeouts nas últimas 24 h; detector e causa pendentes | M | complexo |
| 120 | M-INF-ACESSO | P2 | Sem acesso à Evolution API (401) e Cloudflare (conector desconectado): instâncias, webhooks e Workers fora do mapa | ci | DEPENDE_DO_DONO | MAPA_INFRA §6 | P | dono |
| 121 | R2-API-010, R3-DELTA-010 | P2 | Talk X: horário comercial salvo, worker, scheduler e SQL de saúde usam contratos diferentes de janela | edge | DE_PE | REVERIF.: _shared/talkx-window.ts:42; talkx-resume-policy.ts:129 | M | worker |
| 122 | R3-DELTA-003 | P2 | Talk X: cursor de log por timestamp perde linhas empatadas | migrations | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 123 | R3-DELTA-004 | P2 | Talk X: retry em lote aceita IDs inexistentes e pode reabrir campanha sem destinatário | migrations | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 124 | R3-DELTA-005 | P2 | Talk X: reabertura por retry não exige a nova confirmação de lançamento | migrations | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 125 | R3-DELTA-008 | P2 | Talk X: lote único diário de expurgo não prova a retenção em volume | migrations | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 126 | R3-DELTA-009 | P2 | Talk X: purga muda updated_at e vira "falha recente" na saúde | migrations | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 127 | R3-DELTA-011 | P2 | Talk X: exceção num destinatário perde logs já acumulados no lote | edge | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 128 | R3-DELTA-013 | P2 | Template n8n de alertas testa $json.length por item (template nem está importado no n8n) | docs | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 129 | R3-DELTA-014 | P2 | Template n8n: Never Error sem ramificar por status esconde falha HTTP | docs | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 130 | R3-DELTA-015 | P2 | Expurgo "Talk X" apaga ai_jobs de outros módulos | migrations | DE_PE | caderno §11.1; evidência sem mudança depois de 65679f38 | P | worker |
| 131 | DASH-CONTROLS-001, R2-MOD-031, R2-MOD-065, R2-MOD-076 | P2 | Controles e rótulos do Dashboard não correspondem ao dado calculado | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 132 | DASH-DOC-DRIFT-001 | P2 | README reabre correções antigas e aponta plano de 50 etapas ausente | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 133 | IA-AUDIO-001 | P2 | Classificador de áudio-meme ainda usa apenas nome e URL | edge | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 134 | IA-DESIGN-001 | P2 | IA-058 entregue como projeto, sem alertas em operação | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 135 | IA-TALKX-001, R2-MOD-033, R2-MOD-037 | P2 | Insights TalkX têm métricas e amostras com semântica insuficiente | hooks | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 136 | LT-LAYOUT-01 | P2 | Padding de TalkX e Multiplix soma-se ao padding do ViewContainer | components | DE_PE | re-pino 04/10: evidência intacta | M | designer |
| 137 | LT-LAYOUT-02 | P2 | Dois dos cinco apontamentos do layoutguard são limitações de análise | components | DE_PE | re-pino 04/10: evidência intacta | M | designer |
| 138 | LT-LAYOUT-03 | P2 | Teste de largura verifica overflow, não faixa morta nem ocupação do main | ci | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 139 | LT-TYPE-02 | P2 | Família literal no screen protection escapa do guard de tipografia | hooks | DE_PE | re-pino 04/10: evidência intacta | M | designer |
| 140 | LT-TYPE-03 | P2 | Scanner de pesos aceita pesos intermediários ausentes em listas estáticas | ci | DE_PE | re-pino 04/10: evidência intacta | P | designer |
| 141 | LT-TYPE-04 | P2 | Densidade está ativa, mas token de tamanho do texto continua sem consumidor | hooks | DE_PE | re-pino 04/10: evidência intacta | M | designer |
| 142 | LT-TYPE-05 | P2 | Contatos exige reconciliação entre decisão Navy e header visual removido | components | DE_PE | re-pino 04/10: evidência intacta | M | designer |
| 143 | MX09 | P2 | Permissão dispatch.create do agente não permite iniciar seu próprio dispatch | migrations | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 144 | OTH-002 | P2 | Contagens de Arquivos permanecem em cache após exclusão | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 145 | OTH-005 | P2 | Email ainda filtra e pagina a lista em memória por offset | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 146 | OTH-006 | P2 | Continuação do histórico Gmail não é consumida | edge | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 147 | OTH-007 | P2 | Filtro Novidades não implementa a janela de 30 dias | edge | DE_PE | REVERIF.: catalogExport.ts:157, index.ts:357 | M | worker |
| 148 | OTH-008 | P2 | Meta de desempenho do Catálogo continua sem medição aprovada | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 149 | OTH-009 | P2 | Medição de payload foi fechada apesar de exceder a meta | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 150 | OTH-010 | P2 | Teste CT-94 comprova HTTP 429, mas não a reação da interface | testes | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 151 | OTH-011 | P2 | Validador do plano histórico de Catálogo falha no baseline | ci | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 152 | OTH-012 | P2 | Arquivos não tem os entregáveis finais de QA no baseline | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 153 | OTH-013 | P2 | Email Sidebar falta fechar o contrato empresarial real | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 154 | OTH-014 | P2 | Medição de memória e consultas do Email não foi localizada | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 155 | OTH-015 | P2 | Contatos tem divergência histórica com legados ativados | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 156 | SK01 | P2 | Autosave marca como salvo o estado que a gravação por quota rejeitou | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 157 | SK02 | P2 | Formato JSON null no storage faz loadThemeConfig lançar em vez de recuperar | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 158 | SK03 | P2 | Checkpoints técnicos marcados coexistem com gates visuais e globais não demonstrados | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 159 | SV-001 | P2 | Compras não informa que o resumo conta somente compras concluídas | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 160 | SV-002 | P2 | Journey apresenta uma amostra de tempo médio como histórico completo | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 161 | SV-003 | P2 | Matriz visual tem estado cheio duplicado do vazio e faltam referências | docs | DE_PE | REVERIF.: PNGs 02/03 mesmo blob d4c0e63 | P | designer |
| 162 | TC-007 | P2 | Mute é lido e escrito em locais diferentes e notificações só funcionam com a view montada | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 163 | TC-008 | P2 | Contrato de convites e vocabulário de auditoria permanecem legados | migrations | DE_PE | REVERIF.+vivo: RPCs legadas, CHECK 12 verbos | G | complexo |
| 164 | TC-009, R2-DB-011 | P2 | Recibos e reações não forçam conversation_id derivado da mensagem | migrations | DE_PE | re-pino 04/10: evidência intacta | G | complexo |
| 165 | TC-010 | P2 | Marcação de leitura e envio podem perder estado após erro silencioso | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 166 | TC-011, R2-GOV-003 | P2 | 271 asserts tautológicos não validam Team Chat e os testes de RLS simulam schema fictício | testes | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 167 | TC-012 | P2 | Validator legado possui contratos incorretos e sucesso falso para respostas de erro | ci | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 168 | TC-013 | P2 | Dois planos de finalização coexistem sem autoridade reconciliada e contêm contratos divergentes | migrations | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 169 | TEL-DOC-DRIFT-001 | P2 | Cabeçalho de Telefonia não acompanha fases e resolução do login | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 170 | TM-01 | P2 | Prévia não oferece leitura integral nem mensagens anteriores antes do aceite | features | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 171 | TM-02 | P2 | Resposta incerta de claim não tem recuperação específica e offline não desabilita o CTA | features | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 172 | TM-03 | P2 | Fechamento 50/50 trata build publicado como revisão visual autenticada | docs | DE_PE | re-pino 04/10: evidência intacta | P | designer |
| 173 | TM-04 | P2 | Baseline, piloto e observabilidade não sustentam fechamento operacional completo | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 174 | TRA-004 | P2 | Troca de conexão padrão não é atômica e anuncia sucesso sem verificar erros | migrations | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 175 | TRA-007 | P2 | Auditoria de branches confunde erro de git cherry com equivalência | ci | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 176 | TRA-008 | P2 | Types-sync ainda tem gates e recuperação menos precisos que o plano | ci | PARCIAL | REVERIF.: #1439 fez E17/E18; Gate3 ainda conta linhas | P | worker |
| 177 | TRA-009 | P2 | Documentação canônica de CI e checkboxes divergem da baseline | ci | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 178 | TRA-010 | P2 | Remoção de Etiquetas deixou compatibilidade de rota e resíduos documentais | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 179 | TRA-011 | P2 | Lista distinta de etiquetas deriva de consulta não paginada a contatos | hooks | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 180 | TX01 | P2 | STATUS V4 está defasado e mede marcadores de commit | ci | PARCIAL | REVERIF.: STATUS regenerado #1713; contador ainda é git | P | worker |
| 181 | TX03, R2-MOD-036 | P2 | X047 deixou adoção dos estados em uma etapa informal fora do plano | components | PARCIAL | REVERIF.: 5 telas adotaram (#1877–#1885); falta View e outras | G | complexo |
| 182 | TX04, CAIXA-c92b | P2 | X057 entregou schema multi-segmento sem salvar/resolver vários segmentos (decisão da caixa: fatiar em X057a/X057b depois da Fase M) | migrations | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 183 | VOL-01 | P2 | Play nativo cria AudioContext sem caminho de liberação | services | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 184 | VOL-03 | P2 | Contraste abaixo da régua foi aceito ao restaurar a skin azul | components | DE_PE | re-pino 04/10: evidência intacta | M | designer |
| 185 | VOL-04 | P2 | Fallback de vídeo em iOS e matriz física continuam sem prova | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 186 | R2-API-002 | P2 | Receipt GO de saída ainda fica fora de Multiplix e do estado da mensagem no inbox | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 187 | R2-API-003 | P2 | Edições e reações do webhook não correlacionam o evento à conexão | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 188 | R2-API-004 | P2 | Falha de lookup de conexão vira cache negativo e amplia o escopo de mutações | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 189 | R2-API-005 | P2 | Mensagem de grupo GO pode entrar no inbox como conversa direta do participante | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 190 | R2-API-007 | P2 | Indecisão sobre palavra de opt-out é interpretada como ausência de opt-out | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 191 | R2-API-008 | P2 | Autoresposta de opt-out anuncia envio mesmo com HTTP de erro | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 192 | R2-API-012 | P2 | Gmail webhook não persiste metadados de anexos exigidos para download | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 193 | R2-API-013 | P2 | Heartbeat Multiplix descarta o builder RPC e não renova o lease | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 194 | R2-API-014 | P2 | Falha ao consultar privacidade transforma atualização parcial em abertura de outros campos | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 195 | R2-API-015 | P2 | Controle de sessão usa rotas GO mesmo com EVOLUTION_API_FLAVOR=v2 | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 196 | R2-API-017 | P2 | scheduled_messages tem produtor e estados, mas executor não foi encontrado no código versionado | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 197 | R2-API-018 | P2 | Bitrix pode devolver sucesso de criação mesmo quando o provedor rejeita | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 198 | R2-API-019 | P2 | Webhook WhatsApp oficial confirma entrada sem persistir mensagem e pode rebaixar status | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 199 | R2-API-023 | P2 | Relatório agendado avança last_sent_at e anuncia sucesso após falha de envio | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 200 | R2-API-024 | P2 | Diálogo ElevenLabs envia script e omite o campo inputs obrigatório do provedor | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 201 | R2-API-025 | P2 | Geração musical envia duração no nome e unidade do contrato de efeitos sonoros | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 202 | R2-API-026 | P2 | Worker de IA deixa lease expirar durante o handler e permite reexecução após efeito externo iniciado | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 203 | R2-API-028 | P2 | Auto-close conta encerramento mesmo quando mensagem, closure e desatribuição falham | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 204 | R2-API-030 | P2 | Resumo e estimativa Multiplix tratam a primeira página de destinatários como público completo | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 205 | R2-API-031 | P2 | Presença humanizada pode bloquear o envio além do prazo do chamador | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 206 | R2-API-032 | P2 | Modo de teste do AI Proxy permite chamada paga sem cota nem registro de consumo | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 207 | R2-API-033 | P2 | Auto-tag conserva etiquetas antigas quando a nova classificação válida não tem tags | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 208 | R2-API-034 | P2 | Recuperação de áudio reutiliza a conexão da primeira mensagem em todo o lote | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 209 | R2-API-035 | P2 | Timestamp não assinado permite repetir conversões Talk X fora da janela de frescor | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 210 | R2-API-036 | P2 | Conversão Talk X fornece defaults que a RPC final rejeita | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 211 | R2-API-037 | P2 | Diagnóstico por conexão usa o tráfego global para declarar saúde | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 212 | R2-API-038 | P2 | Relatório Talk X transforma destinatários ignorados fora da página em pendentes | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 213 | R2-API-039 | P2 | Resposta e polling antigos misturam identidades no diálogo de QR Code | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 214 | R2-API-040 | P2 | Editor de privacidade envia padrões locais sem carregar a configuração atual | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 215 | R2-API-041 | P2 | Desativar integração esconde o único botão capaz de persistir a desativação | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 216 | R2-API-042 | P2 | Grupos e banner de reconexão contam erro lógico Evolution como sucesso | hooks | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 217 | R2-API-043 | P2 | Painel de saúde exclui chamadas de IA registradas fora de ai-proxy | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 218 | R2-API-044 | P2 | Aquecimento e limite de número têm configuração local sem motor identificado | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 219 | R2-API-045 | P2 | Mensagem automática fora do expediente é persistida sem consumidor de entrega identificado | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 220 | R2-API-046 | P2 | Exclusão de provedor promete fallback automático que o roteamento não executa | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 221 | R2-API-047 | P2 | Tela Sentry confirma ativação e métricas sem executar integração | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 222 | R2-API-048 | P2 | Teste de conexão Bitrix ignora a URL e o domínio informados na tela | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 223 | R2-API-049 | P2 | Insights Talk X escolhem engajamento por contagem e deixam concluídas fora do alerta | hooks | DE_PE | REVERIF.: useTalkXInsights.ts:62-66, 85 | M | worker |
| 224 | R2-API-050 | P2 | Reabrir WhatsApp Flow pode sobrescrever telas que já foram salvas | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 225 | R2-API-051 | P2 | Pasta de figurinhas pessoais falha para administradores com vários perfis visíveis | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 226 | R2-API-053 | P2 | Operações de emoji e exclusão de conteúdo confirmam sucesso sem verificar persistência | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 227 | R2-API-054 | P2 | Upload de documentos da base de conhecimento não tem processamento até a IA demonstrado | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 228 | R2-API-056 | P2 | Alerta de rate limit substitui bloqueio permanente por expiração de quinze minutos | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 229 | R2-API-057 | P2 | Alerta e notificação afirmam bloqueio mesmo quando gravar blocked_ips falha | edge | DE_PE | re-pino R2: evidência intacta | P | worker |
| 230 | R2-API-058 | P2 | Alerta mensal de custo repete e-mail em cada execução diária do cron | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 231 | R2-API-059 | P2 | Telas Gmail convertem falha de consulta em conta desconectada ou histórico vazio | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 232 | R2-API-060 | P2 | Botão Arquivar da thread Gmail legada está habilitado sem ação | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 233 | R2-API-061 | P2 | Enviar mensagem pelo menu de um grupo já selecionado retira esse grupo dos destinatários | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 234 | R2-API-062 | P2 | Broadcast de grupos apaga texto e destinatários mesmo quando todos os envios falham | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 235 | R2-API-063 | P2 | Painéis Omnichannel apresentam cadastro pendente como canal conectado e fixam WhatsApp em um | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 236 | R2-API-064 | P2 | Inbox Omnichannel projeta contatos limitados sem carregar nem abrir conversas | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 237 | R2-API-065 | P2 | Cadastro de canais adicionais e regras de roteamento não têm executor versionado demonstrado | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 238 | R2-API-066 | P2 | Monitor de quarentena conserva decisão antiga após liberação e para em erro transitório | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 239 | R2-AUTH-005 | P2 | Resposta atrasada de perfil repõe identidade antiga após logout ou troca de usuário | hooks | DE_PE | re-pino R2: evidência intacta | P | worker |
| 240 | R2-AUTH-011 | P2 | Team Chat busca perfis de colegas por tabela proibida aos agentes | hooks | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 241 | R2-AUTH-012 | P2 | Ações VIP, arquivar, bloquear e tags no detalhe do contato não persistem | components | PARCIAL | REVERIF.: tags sumiram (#1654); VIP/arquivar/bloquear só toast (ContactActionButtons.tsx:190) | M | worker |
| 242 | R2-AUTH-013 | P2 | Mutations de Contatos ainda informam sucesso em erros ou lotes parciais | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 243 | R2-AUTH-014 | P2 | Menus de gerenciamento de agentes possuem opções clicáveis sem ação | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 244 | R2-AUTH-015 | P2 | Convite de agente não cria convite autenticável nem provisiona papel escolhido | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 245 | R2-AUTH-016 | P2 | Criação de usuário retorna sucesso mesmo com role/perfil/contas auxiliares falhos | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 246 | R2-AUTH-019 | P2 | Edição de empresa/contato no CRM externo aceita zero linhas como sucesso | components | DE_PE | REVERIF.: crm-integration/index.ts:762-764 | M | worker |
| 247 | R2-AUTH-020 | P2 | Capacidade de agentes conta todos os contatos atribuídos como chats ativos | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 248 | R2-AUTH-021 | P2 | Indisponibilidade do Auth é registrada como tentativa de senha incorreta | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 249 | R2-AUTH-023 | P2 | Salvar regras de rate limit pode apagar a configuração e descarta a ação escolhida | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 250 | R2-AUTH-024 | P2 | Overview de segurança apresenta estados e pontuação sem medição válida | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 251 | R2-AUTH-026 | P2 | Excluir nota de colega some da UI mesmo quando RLS preserva a nota | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 252 | R2-AUTH-027 | P2 | Usuário pode liberar o próprio flag administrativo de download | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 253 | R2-AUTH-028 | P2 | Detalhe do contato mostra zero mensagens e inatividade por props nunca fornecidas | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 254 | R2-AUTH-029 | P2 | Analytics de Contatos rotula agregados da página atual como totais | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 255 | R2-AUTH-030 | P2 | Configurações globais de cadastro, grupos, reabertura e chave ElevenLabs não têm consumidor operacional local | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 256 | R2-AUTH-031 | P2 | Resposta de verificação da senha anterior pode substituir o veredito da senha atual | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 257 | R2-AUTH-032 | P2 | Auditoria não inclui concessões e revogações de roles nos filtros e no contador sensível | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 258 | R2-AUTH-033 | P2 | Página de roles usa embed inexistente e transforma erro de consulta em listas vazias | pages | DE_PE | REVERIF.: useRolesPageState.ts:33-44 | G | complexo |
| 259 | R2-AUTH-034 | P2 | Aba Notas trata erros devolvidos pelo serviço como conclusão e descarta o texto antes de salvar | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 260 | R2-AUTH-036 | P2 | Sala de Crise calcula alertas operacionais com mensagens respondidas e contas habilitadas | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 261 | R2-AUTH-037 | P2 | Treinamento apresenta e persiste avaliação de desempenho baseada apenas em sorteio | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 262 | R2-AUTH-038 | P2 | Mapa conta contatos com coordenadas também como localização apenas aproximada | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 263 | R2-AUTH-039 | P2 | Recálculo atrasado grava coordenadas do endereço anterior e apaga o aviso de desatualização | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 264 | R2-AUTH-040 | P2 | Janela relativa do painel de uso de IA fica presa à hora de abertura | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 265 | R2-AUTH-041 | P2 | Consulta de custo de IA passa fim nulo e elimina todas as chamadas da janela | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 266 | R2-AUTH-042 | P2 | Página Conquistas apresenta progresso simulado como pertencente ao usuário | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 267 | R2-AUTH-043 | P2 | Mini-games anunciam ganho de XP sem consumidor que credite a recompensa | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 268 | R2-AUTH-044 | P2 | Speed Typing encerrado conclui o jogo seguinte e grava seu recorde sem jogá-lo | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 269 | R2-AUTH-045 | P2 | CSAT carrega a configuração sem sincronizar o formulário e pode sobrescrevê-la com defaults | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 270 | R2-AUTH-046 | P2 | Seletor de proficiência sempre cadastra nível 3 independentemente da escolha | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 271 | R2-AUTH-047 | P2 | Aba Sons altera um estado privado que o botão Salvar não persiste nem aplica aos alertas | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 272 | R2-AUTH-048 | P2 | Classificar Recentes contabiliza respostas de erro como conversas classificadas | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 273 | R2-AUTH-049 | P2 | Abas de horário, mensagens e automação persistem preferências sem ligação aos executores versionados | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 274 | R2-AUTH-050 | P2 | Solicitação de exclusão de dados é confirmada mesmo quando o registro de auditoria falha | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 275 | R2-AUTH-051 | P2 | Resumo pós-chamada descarta a anotação ainda em edição ao fechar automaticamente | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 276 | R2-AUTH-052 | P2 | A tabela de ligações cancela o acionamento por teclado do botão Ligar de volta | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 277 | R2-AUTH-053 | P2 | O tema Diversity remove o indicador de foco definido para botões padrão e cards de tema | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 278 | R2-CALL-002 | P2 | Duração gravada da chamada inclui espera após o encerramento | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 279 | R2-CALL-003 | P2 | Aba líder suspensa retoma sem ceder à nova líder | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 280 | R2-CALL-004 | P2 | Contrato desconectar e reconectar mantém referência de UA encerrado | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 281 | R2-CALL-005 | P2 | Conexão SIP pendente não é invalidada pelo cancelamento e permite criação concorrente | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 282 | R2-CALL-006 | P2 | Alerta recebido conserva a notificação encerrada e o diálogo da chamada anterior | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 283 | R2-CALL-008 | P2 | Encerramento por Realtime compara o ID observado, mas despacha sobre outra sessão e evento inválido em ringing | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 284 | R2-COM-002 | P2 | Prévia de anexo recebe conteúdo de uma seleção anterior | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 285 | R2-COM-003 | P2 | Descartar rascunho fecha e apaga a sessão local mesmo com rejeição remota | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 286 | R2-COM-004 | P2 | Anexos originais que carregam depois da abertura não entram no encaminhamento | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 287 | R2-COM-005 | P2 | Conclusão da resposta rápida apaga texto novo digitado durante o envio | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 288 | R2-COM-006 | P2 | Rascunho da resposta rápida se perde ao trocar de conversa | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 289 | R2-COM-007 | P2 | Histórico de mensagens de Email não continua além do limite de resposta | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 290 | R2-COM-010 | P2 | OAuth do Gmail anuncia sucesso após falha de armazenamento ou desconexão | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 291 | R2-COM-011 | P2 | Bloqueio de imagens externas do Email deixa passar URL relativa ao protocolo | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 292 | R2-DB-002 | P2 | Atribuição de respostas perde identidade por telefone e não deduplica o evento recebido | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 293 | R2-DB-005 | P2 | Migração de lembretes associa tarefas pelo título, sem preservar a identidade da origem | migrations | DE_PE | re-pino R2: evidência intacta | P | worker |
| 294 | R2-DB-006 | P2 | Fila de blocos Multiplix deixa sucessores pending atrás de um item terminal | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 295 | R2-DB-008 | P2 | Índice de um fechamento por dia impede encerrar novamente uma conversa reaberta | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 296 | R2-DB-010 | P2 | Usuário pode zerar o contador de requisições do catálogo pela RPC pública autenticada | migrations | DE_PE | REVERIF.: migration 20261003122707 l.60-72 | M | worker |
| 297 | R2-DB-012 | P2 | Reclassificação de IA converte etiqueta humana homônima em etiqueta removível pela IA | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 298 | R2-DB-013 | P2 | Segundo UPDATE do template pode ser rejeitado pela guarda de snapshot da própria RPC | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 299 | R2-DB-014 | P2 | Cancelamento em voo pode descartar a confirmação do provedor e impedir reconciliação | migrations | DE_PE | REVERIF.: migration 20261003232707 l.720-737; process-recipient.ts:551 | M | worker |
| 300 | R2-DB-015 | P2 | Retry terminal do TalkX pode voltar a pending sem se tornar elegível ao worker | migrations | PARCIAL | REVERIF.: #1872 RPCs novas ok; talkx-send/index.ts:265 usa retry antigo | M | worker |
| 301 | R2-DB-016 | P2 | Mesclagem autorizada de contato com nota é bloqueada pelo guard posterior de identidade | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 302 | R2-DB-019 | P2 | Reações do WhatsApp não vinculam a autoria ao usuário que grava | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | G | complexo |
| 303 | R2-DB-021 | P2 | A segunda reação ao mesmo emoji conflita com a chave reservada ao contato | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | M | worker |
| 304 | R2-DB-023 | P2 | Trigger de recuperação ainda escreve campo removido e bloqueia o pedido autenticado | migrations | DE_PE | manifest só regenerado (#1863); nenhuma migration nova toca o objeto; drift 0 | M | worker |
| 305 | R2-GOV-001 | P2 | Duas fontes com tarefas explícitas ficaram sem adjudicação no registro de planos | docs | DE_PE | re-pino R2: evidência intacta | P | designer |
| 306 | R2-GOV-002 | P2 | Catálogo histórico com 349 marcações de conclusão não comprova os fluxos ativos | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 307 | R2-GOV-004 | P2 | Validação do export anuncia sucesso após falha do comando de banco | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 308 | R2-INB-011 | P2 | Seletor de anexos permite seleção múltipla mas aproveita somente o primeiro | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 309 | R2-INB-012 | P2 | Galeria classifica áudio WebM como vídeo e diverge dos contadores | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 310 | R2-INB-013 | P2 | Overlay de realtime antigo sobrescreve snapshot mais novo no refetch | hooks | DE_PE | re-pino R2: evidência intacta | P | worker |
| 311 | R2-INB-015 | P2 | Cache offline válido é abandonado após falha de carga e não alimenta chat selecionado | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 312 | R2-INB-016 | P2 | Enter contorna limite de caracteres aplicado ao botão Enviar | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 313 | R2-INB-017 | P2 | Atalhos de busca têm dois handlers concorrentes no Composer | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 314 | R2-INB-018 | P2 | Ações rápidas e seleção da busca embutida fecham sem executar intenção | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 315 | R2-INB-019 | P2 | Navegação da busca gera NaN quando não há resultados e ignora ações rápidas | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 316 | R2-INB-020 | P2 | Filtro por tag na busca limita contatos tarde demais e não limita mensagens | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 317 | R2-INB-021 | P2 | Menu do balão, menu do header e comandos anunciam ações ainda sem implementação | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 318 | R2-INB-023 | P2 | Popup remapeia Message como linha crua e remove dados necessários ao balão | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 319 | R2-INB-024 | P2 | Erro na carga de mensagens selecionadas é transformado em conversa vazia | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 320 | R2-INB-025 | P2 | Mensagem nova e indicador de digitação forçam rolagem ao fim durante leitura | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 321 | R2-INB-026 | P2 | Presença de digitação entre agentes colide na identidade literal agent | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 322 | R2-INB-027 | P2 | Filtro Última interação reintroduz sessões antigas do mesmo dia | hooks | DE_PE | re-pino R2: evidência intacta | P | worker |
| 323 | R2-INB-028 | P2 | Lista virtualizada descarta a prioridade de não lidas calculada pelos filtros | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 324 | R2-INB-029 | P2 | Adiar conversa grava snooze, mas efeito operacional e retomada não são consumidos pela Inbox | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 325 | R2-INB-031 | P2 | Botão Baixar documento não respeita o controle can_download do perfil | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 326 | R2-INB-032 | P2 | Reações confirmam a mutação local mesmo quando o transporte rejeita | hooks | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 327 | R2-INB-033 | P2 | Refresh antigo de URL assinada deixa a próxima mídia sem URL e presa em carregamento | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 328 | R2-INB-034 | P2 | Carregar mais na Jornada não ultrapassa as janelas fixas das consultas | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 329 | R2-INB-035 | P2 | Jornada mostra tarefas concluídas no modelo atual como Pendente | hooks | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 330 | R2-INB-036 | P2 | GPS atrasado pode substituir um ponto manual escolhido depois no mesmo picker | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 331 | R2-INB-037 | P2 | Mudar o termo durante retrieve ainda permite aplicar o endereço antigo | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 332 | R2-INB-038 | P2 | Salvar figurinha na biblioteca confirma sucesso sem verificar o insert | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 333 | R2-INB-039 | P2 | Busca manual de localização não mostra os vários candidatos devolvidos pelo fallback | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 334 | R2-INB-040 | P2 | TTS do chat continua após desmontagem e aceita duas gerações simultâneas da mesma mensagem | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 335 | R2-INB-041 | P2 | Parar TTS e prévias de memes conserva inscrições dos players descartados | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 336 | R2-INB-042 | P2 | Mutações de áudio meme e stickers omitem erros e aceitam exclusão parcial | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 337 | R2-INB-043 | P2 | Fechar pickers de áudio meme e stickers abandona uploads pendentes | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 338 | R2-INB-044 | P2 | Evento final do ditado anterior desliga o indicador da nova sessão de voz | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 339 | R2-INB-045 | P2 | Notificação de transcrição pendente escapa à desativação do hook | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 340 | R2-INB-046 | P2 | Comandos de voz anunciam busca, filtros e ordenação sem aplicar os parâmetros | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 341 | R2-INB-047 | P2 | Interromper a fala do assistente deixa a ação aguardando uma Promise que não termina | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 342 | R2-INB-048 | P2 | Comando antigo de voz ainda aplica ação depois de um comando mais recente | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 343 | R2-INB-050 | P2 | Importação de mídia e salvamento de áudio gerado deixam objetos órfãos quando a entrada falha | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 344 | R2-INB-051 | P2 | Biblioteca de mídia e seletor de stickers limitam catálogo a mil itens sem caminho para os demais | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 345 | R2-INB-052 | P2 | Figurinhas com referência de bucket privado são renderizadas sem resolver a URL | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 346 | R2-INB-053 | P2 | Reclassificação de mídia não conta erros retornados pela função e limpa a seleção | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 347 | R2-INB-054 | P2 | Editar resposta rápida reutiliza o formulário anterior e pode gravá-lo em outro template | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 348 | R2-INB-055 | P2 | Filtro de grupos remove o hífen que sua própria expressão exige | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 349 | R2-INB-056 | P2 | Contador Em atendimento e badge de responsável comparam auth ID com profile ID | components | DE_PE | REVERIF.: StatusChips.tsx:28-31; VirtualizedRealtimeList.tsx:107 | M | worker |
| 350 | R2-INB-058 | P2 | Áudio gerado e voz transformada descartam a prévia antes do resultado do envio | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 351 | R2-INB-059 | P2 | Miniatura com assinatura em lote não consegue renovar a URL que falha | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 352 | R2-INB-060 | P2 | Detalhes de arquivo conservam o erro da imagem anterior ao selecionar outro item | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 353 | R2-INB-063 | P2 | Card de resposta rápida anuncia cópia sem escrever no clipboard | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 354 | R2-INB-064 | P2 | Ações de alertas de sentimento não oferecem navegação para a conversa | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 355 | R2-INF-008 | P2 | Ratchets de TypeScript tratam falha do compilador como zero erros | ci | DE_PE | REVERIF.: typecheck-ratchet.mjs:96, 242 | M | worker |
| 356 | R2-INF-009 | P2 | Gate de dependências aceita erro de registry como relatório sem vulnerabilidade | ci | DE_PE | re-pino R2: evidência intacta | M | worker |
| 357 | R2-INF-010 | P2 | Suite scripts/db-tests não entende a RPC e pode passar com zero assertivas | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 358 | R2-INF-011 | P2 | Prova de IA coloca senha/token em argv e deixa sessão Auth no arquivo de saída | ci | DE_PE | re-pino R2: evidência intacta | P | worker |
| 359 | R2-INF-012 | P2 | Prova de orçamento/rate limit termina com ok sem verificar o comportamento | ci | DE_PE | re-pino R2: evidência intacta | P | worker |
| 360 | R2-INF-013 | P2 | Inventário de testes ignora quatro suites Node fora dos globs de CI | ci | DE_PE | REVERIF.: check-test-inventory.mjs:2, 22-42 | M | worker |
| 361 | R2-INF-014 | P2 | Replay local reutiliza nome destrutivamente e tem exit0 após falhas de migrations | migrations | PARCIAL | REVERIF.: #1879 pôs ON_ERROR_STOP; falta nome fixo/bootstrap/digest (replay-local.sh:17,36) | P | worker |
| 362 | R2-INF-015 | P2 | Três probes anteriores rotulam baseline fixo sem validar a fonte executada | services | DE_PE | re-pino R2: evidência intacta | M | designer |
| 363 | R2-INF-016 | P2 | Guarda de exposição de erro não encontra respostas 500 presentes no repositório | edge | DE_PE | REVERIF.: check-edge-error-exposure.mjs:29-46 | M | worker |
| 364 | R2-INF-017 | P2 | Atestação de Edge aceita inventário anterior sem prova de no-op do deploy | ci | DE_PE | re-pino R2: evidência intacta | M | worker |
| 365 | R2-INF-018 | P2 | KPI semanal limita runs a 100 e publica ranking de jobs sem consultá-los | ci | DE_PE | re-pino R2: evidência intacta | M | worker |
| 366 | R2-INF-019 | P2 | Runner de mutação conta falha de infraestrutura como mutante morto | ci | DE_PE | re-pino R2: evidência intacta | P | worker |
| 367 | R2-INF-020 | P2 | Prova dos classificadores pode aprovar consumo sem comprovar seus registros | ci | DE_PE | re-pino R2: evidência intacta | P | worker |
| 368 | R2-INF-021 | P2 | Falha dos fixtures E2E é omitida do veredito e do alerta do DB Live Guard | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 369 | R2-INF-023 | P2 | Revalidação de contexto fora da RPC deixa análise antiga substituir uma projeção concorrente | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 370 | R2-INF-024 | P2 | Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação | edge | DE_PE | REVERIF.: ai-suggest-reply/index.ts:166-182 | M | worker |
| 371 | R2-INF-025 | P2 | Reescrita atrasada substitui edição mais nova do mesmo rascunho | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 372 | R2-INF-026 | P2 | Diagnóstico marca falhas rápidas de banco/Storage e Realtime não testado como saudáveis | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 373 | R2-INF-027 | P2 | SLA de 24h e disponibilidade de 7 dias usam janela selecionada e aprovam ausência de checks | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 374 | R2-INF-028 | P2 | Gráfico de mensagens perde linhas válidas ao montar buckets de 7 dias e colapsa buckets de 1 hora | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 375 | R2-INF-029 | P2 | Score de desempenho trata APIs ausentes como memória livre, RTT zero e conexão 4g | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 376 | R2-INF-030 | P2 | Limpar snapshots informa remoção mesmo quando DELETE devolve erro | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 377 | R2-INF-032 | P2 | Busca antiga do catálogo pode substituir os resultados da consulta atual na paleta | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 378 | R2-INF-033 | P2 | Três ações padrão da paleta são exibidas sem executor e apenas fecham o diálogo | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 379 | R2-INF-037 | P2 | Controle de movimento reduzido e transições de rota usam preferências desconectadas | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 380 | R2-INF-038 | P2 | Tour padrão aponta para dois alvos ausentes e avança até a conclusão sem mostrá-los | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 381 | R2-INF-039 | P2 | Modais próprios anunciam modalidade sem implementar o contrato de foco | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 382 | R2-INF-040 | P2 | Falha de leitura da telemetria aparece como sistema com bom desempenho | pages | DE_PE | re-pino R2: evidência intacta | M | worker |
| 383 | R2-INF-041 | P2 | ErrorBoundary ignora fallback nulo usado para retirar overlays com falha | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 384 | R2-INF-042 | P2 | Gate E98 de contraste descarta violações serious da regra que promete proteger | ci | DE_PE | REVERIF.: e2e/a11y-contraste.spec.ts:32 | P | designer |
| 385 | R2-INF-043 | P2 | Fixture para dispensar onboarding procura nome acessível removido e deixa o modal ativo | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 386 | R2-MOD-003 | P2 | Editor de automação fecha sem aguardar confirmação da persistência | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 387 | R2-MOD-005 | P2 | Campanhas aceita público e mídia sem campos ou materialização correspondente | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 388 | R2-MOD-006 | P2 | Campanha pausada não tem comando de retomada | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 389 | R2-MOD-008 | P2 | Pré-validação de envio do catálogo ausente em lote e permissiva quando a consulta falha | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 390 | R2-MOD-009 | P2 | Retorno à primeira página não consulta produtos no catálogo do chat e na gestão | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 391 | R2-MOD-010 | P2 | Catálogo conta seleção persistente mas envia somente produtos do filtro visível | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 392 | R2-MOD-011 | P2 | Limite de dez imagens não é aplicado à seleção inicial ou ao envio | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 393 | R2-MOD-012 | P2 | University reaplica resposta de análise após a troca do período | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 394 | R2-MOD-014 | P2 | Selecionar chamada fora da primeira página retorna à primeira e perde o detalhe | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 395 | R2-MOD-015 | P2 | Histórico anuncia correção de página inválida sem refazer a consulta | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 396 | R2-MOD-017 | P2 | Relatórios comparam períodos de duração desigual e mostram início anterior diferente do consultado | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 397 | R2-MOD-020 | P2 | Taxa de abandono trata mensagem anterior do agente como resposta e não identifica sessões | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 398 | R2-MOD-021 | P2 | Monitor Multiplix depende dos cinquenta disparos mais recentes e UI só abre oito | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 399 | R2-MOD-022 | P2 | Lista de destinatários Multiplix descarta continuação e não diferencia falha de vazio | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 400 | R2-MOD-023 | P2 | Idempotência do composer Multiplix é descartada em falha de resposta da criação | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 401 | R2-MOD-026 | P2 | Debounce global TalkX descarta atualização de outra campanha e desliga polling | hooks | DE_PE | re-pino R2: evidência intacta | P | worker |
| 402 | R2-MOD-027 | P2 | Sair do wizard antes do autosave perde edição sem a proteção beforeunload | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 403 | R2-MOD-028 | P2 | Estatísticas CSAT podem continuar no snapshot anterior após atualizar as avaliações | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 404 | R2-MOD-029 | P2 | Agenda filtra pendentes depois de uma consulta global que pode ser ocupada pelo histórico | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 405 | R2-MOD-032 | P2 | Conclusão remota da campanha não limpa seleção e modais em andamento | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 406 | R2-MOD-034 | P2 | Lista de supressão não identifica nem encontra bloqueios cadastrados somente por telefone | components | DE_PE | REVERIF.: TalkXSuppression.tsx:87, 177 | M | worker |
| 407 | R2-MOD-035 | P2 | Cadastro de supressão busca contato somente no primeiro lote carregado | components | DE_PE | REVERIF.: TalkXSuppression.tsx:69-80 | P | worker |
| 408 | R2-MOD-038 | P2 | Detalhe de segmento conserva cópia antiga depois de salvar e pode reabrir campos obsoletos | components | DE_PE | REVERIF.: TalkXSegments.tsx:76-78, 187 | M | worker |
| 409 | R2-MOD-040 | P2 | Resposta tardia de geração de áudio pode iniciar reprodução após fechar o diálogo | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 410 | R2-MOD-041 | P2 | Exportar catálogo perde quase todos os filtros da listagem | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 411 | R2-MOD-042 | P2 | Histórico de envios do catálogo esconde registros além dos 500 mais recentes | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 412 | R2-MOD-043 | P2 | Favoritar em lote anuncia sucesso antes da escrita e oculta falhas de persistência | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 413 | R2-MOD-044 | P2 | Ranking Mais enviados do catálogo conta tentativas que falharam totalmente | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 414 | R2-MOD-045 | P2 | Enviar variação perde a cor escolhida no catálogo de gestão | components | DE_PE | re-pino R2: evidência intacta | M | designer |
| 415 | R2-MOD-046 | P2 | Reabrir detalhe do cartão A pode continuar exibindo o produto B navegado anteriormente | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 416 | R2-MOD-048 | P2 | Favoritos convertem preço e estoque desconhecidos em zero real na interface e no envio | components | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 417 | R2-MOD-049 | P2 | Editar contato da tarefa não persiste o vínculo escolhido | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 418 | R2-MOD-050 | P2 | Salvar tarefa reconstrói datas locais sem offset e pode deslocar prazo e alarme | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 419 | R2-MOD-051 | P2 | Salvar tarefa fecha com escritas pendentes e divide a edição em operações concorrentes | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 420 | R2-MOD-052 | P2 | Reagendar alarme pelo Salvar não rearma uma tarefa que já foi notificada | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |
| 421 | R2-MOD-053 | P2 | Desfazer cancelamento/conclusão não restaura todo o estado e anuncia sucesso antes da gravação | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 422 | R2-MOD-054 | P2 | Tarefas e filtros consultam somente a primeira resposta da API sem continuação | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 423 | R2-MOD-055 | P2 | Arrastar tarefa entre colunas filtradas persiste índice em relação à lista não filtrada | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 424 | R2-MOD-056 | P2 | Agenda restaura o prazo do dia anterior se o dia for trocado durante a criação | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 425 | R2-MOD-057 | P2 | Cartão de tarefa concluída oferece lembrete que o executor exclui por estado | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 426 | R2-MOD-059 | P2 | Filtro de período do Talk X aparece nas quatro telas sem consumidor | components | DE_PE | REVERIF.: kit/filters.tsx:128 | M | worker |
| 427 | R2-MOD-061 | P2 | Atalho Duplicar template abre o editor do original | components | DE_PE | REVERIF.: TalkXTemplates.tsx:164 | M | worker |
| 428 | R2-MOD-063 | P2 | Duas metas configuráveis nunca entram no cálculo das notificações de conquista | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 429 | R2-MOD-064 | P2 | Restaurar padrões das metas perde IDs e Salvar tenta reinserir configurações existentes | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 430 | R2-MOD-066 | P2 | Fallback de imagem volta à URL quebrada e o erro persiste ao trocar de foto | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 431 | R2-MOD-067 | P2 | Templates WhatsApp são apresentados como oficiais com aprovação escolhida localmente | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 432 | R2-MOD-069 | P2 | Editor de Chatbot oferece condição, ação e transferência sem configuração correspondente | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 433 | R2-MOD-070 | P2 | Gerar Voz chama a listagem de vozes e anuncia geração sem áudio | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 434 | R2-MOD-071 | P2 | Repetir conversão de áudio após erro do codificador fica aguardando o script que já falhou | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 435 | R2-MOD-072 | P2 | Atualização automática recarrega ao ocultar a aba sem preservar edição ou sessão ativa | services | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 436 | R2-MOD-073 | P2 | Detector de ataques do codec ignora oito posições de análise por índices fracionários | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 437 | R2-MOD-074 | P2 | Monitor do War Room recria alertas continuamente quando violações superam a página de 50 | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 438 | R2-MOD-077 | P2 | Histórico de transcrições oferece Todo período e busca sobre uma única página implícita | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 439 | R2-PLAT-001 | P2 | Avançar no histórico para uma tela repetida seleciona a ocorrência anterior | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 440 | R2-PLAT-002 | P2 | Contagem de notificações não lidas diverge da lista após leitura e eventos | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 441 | R2-PLAT-003 | P2 | Três controles de notificação só alteram cache e voltam ao padrão após recarga | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 442 | R2-PLAT-004 | P2 | Restaurar preferências anuncia sucesso e mantém cache alterado quando o banco rejeita | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 443 | R2-PLAT-005 | P2 | Falha de carregamento de notificações aparece como ausência confirmada | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 444 | R2-PLAT-006 | P2 | Buscas recentes persistem entre usuários no mesmo perfil de navegador | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 445 | R2-PLAT-007 | P2 | Desfazer no aviso anterior reverte a operação seguinte de arquivamento | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 446 | R2-PLAT-008 | P2 | Editar atalhos em instâncias separadas perde personalizações e mantém o listener antigo | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 447 | R2-PLAT-009 | P2 | Atalho Ir para Dashboard anuncia navegação sem selecionar a view Dashboard | hooks | DE_PE | re-pino R2: evidência intacta | G | complexo |
| 448 | R2-PLAT-010 | P2 | Botão Buscar do cabeçalho mobile só altera um estado sem consumidor | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 449 | R2-PLAT-011 | P2 | Notificações mobile usam lista vazia local e contador fixado em zero | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 450 | R2-PLAT-012 | P2 | Sidebar das rotas de SLA muda a seleção sem abrir o módulo escolhido | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 451 | R2-QUE-004 | P2 | Agrupamento de 30 dias conta o último dia duas vezes | hooks | DE_PE | re-pino R2: evidência intacta | P | worker |
| 452 | R2-QUE-005 | P2 | Salvar metas fecha o formulário mesmo quando a gravação falha | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 453 | R2-QUE-006 | P2 | Ações Editar e Configurar fila estão visíveis sem operação | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 454 | R2-QUE-007 | P2 | Período personalizado aceita início posterior ao fim | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 455 | R2-QUE-008 | P2 | Filas com o mesmo nome compartilham indevidamente a série do radar | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 456 | R2-QUE-009 | P2 | Falha ao buscar atendentes é apresentada como fila já completa | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 457 | R2-QUE-010 | P2 | Resposta de um período antigo sobrescreve a comparação mais recente | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 458 | R2-SLA-001 | P2 | Métricas e histórico de SLA usam denominadores incompatíveis | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 459 | R2-SLA-002 | P2 | Períodos de SLA não correspondem aos rótulos Todos e 7d | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 460 | R2-SLA-004 | P2 | Marco de medição do SLA omite o tempo entre criação e envio | migrations | DE_PE | re-pino R2: evidência intacta | M | worker |

### P3

| # | ID(s) | Sev | Problema | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|---|---|
| 461 | CAIXA-0a02 | P3 | Remover worktree/branch da E37 (entrou pelo #1820) depois de conferir que não há commit local único | ci | DE_PE | caixa: decisão tomada | P | worker |
| 462 | CAIXA-30ae | P3 | Volume de mídia: aprovar lição no CLAUDE.md e fixture de áudio no banco de produção para o E2E (E45) | testes | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 463 | CAIXA-7c06 | P3 | CI: incluir --project=chromium-mapa no job obrigatório do ci.yml | ci | DE_PE | caixa: decisão tomada | P | worker |
| 464 | CAIXA-7eb1 | P3 | Talk X E27: registrar divergência de replay e, se preciso, corrigir com migration nova idempotente (sem editar migration aplicada) | migrations | DE_PE | caixa: decisão tomada | M | worker |
| 465 | CAIXA-8ff3 | P3 | Arquivos etapa 50: fornecer prints de referência ou aceitar prints próprios | docs | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 466 | CAIXA-9789 | P3 | Aprovar 6 linhas na seção Contatos do CLAUDE.md (etapa 94) | docs | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 467 | CAIXA-c772 | P3 | Enviar 1 localização real no WhatsApp para número de teste (E94) | testes | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 468 | CAIXA-db20 | P3 | Escolher a cor do chip de filtro ativo no alto-contraste | components | DEPENDE_DO_DONO | caixa 🔒 (PENDENCIAS_CAIXA_DECISOES) | P | dono |
| 469 | DELTA-71MB | P3 | docs/reconciliation (71 MB) entrou na main pelo #1869: tirar do repositório ou mover para branch órfão | docs | A_DECIDIR | MAPA_DELTA §1 | P | dono |
| 470 | DELTA-BANCO-LOCAL | P3 | Banco local × produção: 119 diferenças; arquivo de reconciliação (resolve 64) fora do repo aguardando decisão | migrations | A_DECIDIR | MAPA_BANCO_LOCAL / MAPA_DELTA §2.5 | M | dono |
| 471 | DELTA-CRON-ANUAL | P3 | Cron vacuum-messages-post-expurgo roda 1×/ano (VACUUM FULL em messages): resto de tarefa pontual, remover | migrations | DE_PE | vivo: agenda 20 3 2 9 * | P | worker |
| 472 | DELTA-RESERVA-20261003272707 | P3 | Reserva de versão de migration 20261003272707 sem arquivo no repo (sessão joaquim-ataides-37) | migrations | A_DECIDIR | MAPA_DELTA §2.4 | P | dono |
| 473 | M-DB-04 | P3 | 99 de 166 tabelas vazias (Talk X, Multiplix, campanhas, chatbot, KB…): decidir quais módulos ficam, desligam ou somem | migrations | A_DECIDIR | vivo: contagem por tabela (MAPA_BANCO §5) | M | dono |
| 474 | M-DB-05 | P3 | 13 funções SECURITY DEFINER sem checagem do chamador (vazamento de papel/permissão/config para qualquer logado) | migrations | DE_PE | MAPA_BANCO §7 (vivo 04/10); nenhuma migration nova toca | M | worker |
| 475 | R3-DELTA-012 | P3 | Logger: contexto de quarentena sobrescreve o attempt do logger filho | edge | DE_PE | origin/main validation.ts:45, 58-59 | P | worker |
| 476 | LT-TYPE-01 | P3 | Revisão de fontes ainda descreve PRs abertas e gráficos pendentes já resolvidos | services | DE_PE | re-pino 04/10: evidência intacta | P | designer |
| 477 | SV-004 | P3 | Placar e instruções mantêm estados anteriores aos sucessores | components | DE_PE | re-pino 04/10: evidência intacta | M | worker |
| 478 | TM-05 | P3 | E2E específico e artefatos visuais não ficaram rastreáveis no fechamento | testes | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 479 | TX05 | P3 | Régua visual tem dados para1das17telas | testes | DE_PE | re-pino 04/10: evidência intacta | P | designer |
| 480 | VOL-05 | P3 | E2E publicado comprova controles e persistência, com exceção de áudio aceita | testes | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 481 | VOL-06 | P3 | Encerramento E50 não comprova exclusão imediata da branch final | docs | DE_PE | re-pino 04/10: evidência intacta | P | worker |
| 482 | R2-API-016 | P3 | Status não string aceito pelo envelope derruba lote de receipts | edge | DE_PE | re-pino R2: evidência intacta | M | worker |
| 483 | R2-API-020 | P3 | Distribuição A/B por hash depende da ordem não especificada das variantes | edge | DE_PE | REVERIF.: process-recipient.ts:57-71 | P | worker |
| 484 | R2-API-052 | P3 | Limpar a busca de conhecimento não cancela o debounce pendente | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 485 | R2-API-055 | P3 | Contador de uso da figurinha pessoal descarta a operação PostgREST | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 486 | R2-COM-008 | P3 | Atalho do compositor ignora a exigência de assunto aplicada ao botão | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 487 | R2-INB-030 | P3 | Header declara contato Online sem consultar presença online | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 488 | R2-INB-062 | P3 | Controle Recentes do administrador de figurinhas não muda a coleção | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 489 | R2-INF-031 | P3 | Coletor local rotula agregações incompatíveis como CLS e INP | services | DE_PE | re-pino R2: evidência intacta | M | worker |
| 490 | R2-INF-034 | P3 | Acesso rápido inicial fica fora da navegação por setas e Enter da paleta | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 491 | R2-INF-035 | P3 | Progress aplica value à barra visual e o descarta antes do Root semântico | components | DE_PE | re-pino R2: evidência intacta | M | designer |
| 492 | R2-INF-036 | P3 | Checklist marca tema como concluído quando a consulta não devolve configuração | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 493 | R2-MOD-016 | P3 | Discador mantém chip do contato após alterar o número pelo teclado | components | DE_PE | re-pino R2: evidência intacta | M | worker |
| 494 | R2-MOD-039 | P3 | Ação Novo template abre o wizard de campanha | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 495 | R2-MOD-047 | P3 | Galeria mantém índice fora do intervalo ao navegar para produto com menos imagens | components | DE_PE | re-pino R2: evidência intacta | P | worker |
| 496 | R2-MOD-058 | P3 | Prazo vencido hoje aparece como atraso no menu e como não atrasado no módulo | hooks | DE_PE | re-pino R2: evidência intacta | M | worker |
| 497 | R2-MOD-060 | P3 | Tamanho de página em Templates, Segmentos e Supressão é um controle sem efeito | components | DE_PE | REVERIF.: onPageSize={() => {}} nas 3 telas | M | worker |
| 498 | R2-MOD-062 | P3 | Gramática de variáveis do editor/Resumo diverge da personalização com fallback | components | DE_PE | re-pino R2: evidência intacta | M | worker |

### P4

| # | ID(s) | Sev | Problema | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|---|---|
| 499 | SK04 | P4 | Contraste: correções de precedência sobrevivem, ajuste global AA foi revertido por decisão | components | DE_PE | re-pino 04/10: evidência intacta | M | designer |

## Anexo — CORRIGIDO (fora da fila)

| ID | Sev | Problema | Prova |
|---|---|---|---|
| R2-AUTH-025 | P2 | Editor inline de empresa/cargo conserva vazio inicial e pode apagar dado carregado | REVERIF.: removido como órfão (#1886, #1654); EditContactDialog.tsx:92-113 |
| R2-AUTH-035 | P2 | Status WhatsApp converte indisponibilidade em ausência de status e apresenta Offline sem medição | REVERIF.: UI removida (#1886); hook useWhatsAppStatus ainda defeituoso, sem consumidor |
| R2-INB-061 | P2 | Falha ao carregar scoring habilita salvar defaults sobre dados existentes | REVERIF.: LeadRiskScorePanel removido (#1886) |

## Notas e limites

- **"De pé por inferência".** São 331 R2 e 93 dos 104 cujos arquivos de evidência não mudaram. Eles não foram relidos linha a linha hoje. O estado DE_PE deles vem do re-pino, não de nova leitura.
- **Reverificados hoje no código atual (`origin/main`):** os 11 do GPT (ver `REVERIFICACAO_11_ACHADOS.md`) e 29 dos 41 R2 de evidência tocada. Desses 29: 22 DE_PE, 4 PARCIAL e 3 CORRIGIDO (por remoção de código órfão, #1886/#1654).
- **Os outros 12 R2 de evidência tocada são de banco.** Em 11 deles só mudou o `schema-manifest.json`, regenerado pelo #1863. Nenhuma migration nova toca esses objetos e o drift é zero, por isso continuam DE_PE. R2-DB-001 foi conferido no banco vivo e está na linha do M-DB-02.
- **Junções entre fontes.** Juntei 14 R2 na linha do achado do GPT quando o próprio R2 se declara extensão ou aprofundamento dele (`EXTENSION_OF_PRIOR`, `refines_existing`, "aprofundamento"). Exemplos: DASH-METRICS-001 recebeu R2-MOD-018/019/030/075; TX03 recebeu R2-MOD-036. Os R2 que só citam um achado como "relacionado", mas com causa diferente, ficaram em linha própria.
- **Outras junções:** M-DB-01 = R3-DELTA-006/007; M-DB-02 = R2-DB-001; M-DB-03 = R3-DELTA-002; R2-API-010 = R3-DELTA-010; TX04 = caixa c92b; M-INF-03 = M-INF-02; caixa ba9f = 4f9c.
- **Pacote R3 duplicado.** Existe um segundo pacote R3 na main (`reaudit/2026-10-04-delta-65679f3/FINDINGS.json`, 12 registros R3-GOV/TX/OBS/SEC/DAT/AUTO/UX). Ele repete os mesmos temas dos 15 R3-DELTA. Não entrou como linha própria, para não duplicar.
- **Área, tamanho e executor saíram de regra automática, com ajuste à mão.** A área é o tipo de arquivo mais citado na evidência. O tamanho conta os arquivos de código citados: até 1 = P, de 2 a 5 = M, 6 ou mais = G. Revisar ao puxar o cartão; achados de auditoria costumam citar mais arquivos do que a correção mexe.
- **Severidade:** é a do auditor de origem. Os incidentes e itens M-*/DELTA usam a severidade do mapa da Fase M. M-DB-04 é "info" no mapa e entrou como P3.
- **Sem acesso:** Evolution API (401) e Cloudflare (desconectado). Os achados de instâncias e webhooks de lá não foram conferidos.


## Acréscimos de 04/10 tarde (sessão joaquim-ataides-37, Fase 0)
| ID | Sev | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|
| F0-01 | P1 | services | DE_PE | `src/config/supabase.ts` e `src/integrations/supabase/client.ts` têm URL e chave anon de PRODUÇÃO fixas e, por decisão registrada no código, não leem `VITE_SUPABASE_URL` → dev server e E2E não conseguem apontar para o banco local. Maior lacuna da Fase 0 | M | complexo |
| M-DB-02 (local) | P0 | migrations | DE_PE | reproduz no banco local: POST anônimo em `/rest/v1/rpc/record_incoming_call_event` (7 args) → HTTP 200; a correção pode ser testada sem tocar a produção | P | complexo |

## Acréscimos da campanha de testes QA1–QA5 (04/10 tarde) — não corrigíveis pelo cliente
| ID | Sev | Área | Estado | Prova | Tam | Quem |
|---|---|---|---|---|---|---|
| QA5-01 | P0 | migrations | DE_PE | O gateway `public.mcp_exec` roda como `postgres` (`transaction_read_only=off`) e, se a leitura linha a linha falha, faz `EXCEPTION WHEN OTHERS THEN NULL` e `execute q` com o texto bruto (aceita DDL/DML/várias instruções). O `zapp-db-ler` v2 (pglast + embrulho) fecha o lado do cliente; o servidor continua executando qualquer texto para quem tiver a URL do gateway. Correção: `mcp_query_ro(sql)` SECURITY INVOKER num papel `ro_reader` só com SELECT nos schemas permitidos, `SET LOCAL transaction_read_only = on`, sem fallback | M | complexo (lote, revisão do Claude) |
| QA5-02 | P1 | migrations | DE_PE | 112 de 266 funções SECURITY DEFINER em `public` têm EXECUTE para `authenticated` (herança do `pg_default_acl` de postgres); revisar em lote quais precisam | G | complexo (quebrar) |
| QA5-03 | P3 | migrations | DE_PE | `record_talkx_campaign_lifecycle_event()` com EXECUTE para PUBLIC (retorna trigger, não é chamável) | P | worker |
| QA5-04 | P2 | ci | DE_PE | `db-guard.yml` usa `postgres:17-alpine` sem schema `storage`: testes que dependem de `storage.objects` passam "de graça" (`to_regclass` nulo). Fixture com `storage.objects` + gatilho FOR EACH STATEMENT | P | worker |
| M-DB-06 | P1 | migrations | PARCIAL | 4.000 "job startup timeout" do pg_cron em 7 dias; 936 de 983 minutos com TODOS os jobs em timeout; acabou depois do reinício do banco (03/10 10:25 UTC). Causa provável: banco travado por CPU/memória (não pool). Detector ligado no sensor (≥3 em 10 min → `banco_travando`); falta métrica de CPU/memória do Supabase | M | dono (plano/instância) |
