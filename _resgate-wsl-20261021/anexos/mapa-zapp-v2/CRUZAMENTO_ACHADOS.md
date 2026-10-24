# Cruzamento dos achados × estado atual — Zapp Web V2

Fonte: `docs/reconciliation/FINDINGS.json` do PR #1869 (baseline `2e7cf81c`, 03/10). Re-pino em `origin/main` de 04/10 (20 commits, 102 arquivos alterados). Regra: se nenhum arquivo citado como evidência mudou, o achado continua de pé no código; se mudou, precisa reverificação antes de virar cartão. Não somar com R2 (372) nem R3 (15).

| Situação | Achados |
|---|---|
| Evidência intacta | 93 |
| Evidência tocada (reverificar) | 11 |
| Confirmados no banco vivo nesta fase | 1 |

## Reverificar (evidência mudou depois do baseline)

| ID | Sev | Título | Arquivo alterado |
|---|---|---|---|
| OTH-004 | P1 | Exportação de Catálogo pode omitir produtos com nomes empatados | supabase/functions/promogifts-catalog/index.ts |
| IA-WEBHOOK-001 | P1 | Webhook assinado ainda aceita replay e não verifica falha de insert | supabase/schema-manifest.json |
| IA-EGRESS-001 | P1 | Endpoint e nome de secret configuráveis não têm vinculação segura completa | supabase/schema-catalog.json |
| TC-003 | P1 | Membership não protege bootstrap e último owner; grants de conversa continuam amplos | supabase/schema-manifest.json |
| TC-004 | P1 | RPCs de saída e remoção referem uma coluna role inexistente | supabase/schema-catalog.json |
| OTH-007 | P2 | Filtro Novidades não implementa a janela de 30 dias | supabase/functions/promogifts-catalog/index.ts |
| TX01 | P2 | STATUS V4 está defasado e mede marcadores de commit | docs/talkx/v4/STATUS.md |
| TX03 | P2 | X047 deixou adoção dos estados em uma etapa informal fora do plano | src/components/talkx/TalkXTemplates.tsx |
| TRA-008 | P2 | Types-sync ainda tem gates e recuperação menos precisos que o plano | .github/workflows/types-sync.yml |
| SV-003 | P2 | Matriz visual tem estado cheio duplicado do vazio e faltam referências | docs/design/salesview-journey/VERIFICACAO_S38_S41_S42_S43_2026-10-02.md |
| TC-008 | P2 | Contrato de convites e vocabulário de auditoria permanecem legados | supabase/schema-manifest.json |

## De pé no código (evidência intacta), por severidade

| ID | Sev | Título | Nota viva |
|---|---|---|---|
| DASH-ACCEPTANCE-001 | P1 | Testes e documentos atuais não encerram RLS, integração e liberação das 100 etapas |  |
| DASH-METRICS-001 | P1 | Totais e ausência de dados ainda usam proxies, caps e fallbacks incorretos |  |
| DASH-REALTIME-001 | P1 | Realtime/refresh misturam escopo, conexão, batch mutável e janelas |  |
| DASH-SQL-REGRESSION-001 | P1 | Migration de soft-delete reintroduz corpo antigo de dashboard_contact_counts |  |
| IA-CHATBOT-001 | P1 | Chatbot não usa connectionId para selecionar flow e histórico |  |
| IA-CIRCUIT-001 | P1 | IA-050 não possui circuit breaker apesar de frase de fechamento do bloco |  |
| IA-METRICS-001 | P1 | Ferramentas gerenciais ainda derivam conclusões de dados incompatíveis |  |
| IA-QUOTA-001 | P1 | Separação ação/tentativa/cobrança não foi ligada à quota real |  |
| IA-SENTIMENT-001 | P1 | Consumidores do Dashboard divergem do vocabulário canônico PT-BR |  |
| IA-TIMEOUT-001 | P1 | Prazo de IA não cobre consumo do corpo e log essencial continua best effort |  |
| MX01 | P1 | Composer inicia rascunho sem materializar a fila por itens |  |
| MX02 | P1 | Worker envia template e mídia globais, divergindo do bloco e da prévia |  |
| MX03 | P1 | Conclusão usa a fila antiga de recipients após enviar itens |  |
| MX04 | P1 | Cota por conexão subconta o novo Multiplix e aceita medição inválida |  |
| MX05 | P1 | Erro429 definitivo do provedor não recebe retentativa limitada |  |
| MX06 | P1 | Worker ignora variável ausente e envia texto vazio no lugar |  |
| MX07 | P1 | Adapter GO recebe chave global sem token da instância |  |
| MX08 | P1 | API de rascunho mistura identidades/colunas e aceita destinatário do cliente |  |
| OTH-001 | P1 | Encaminhar N omite arquivos selecionados fora do filtro |  |
| OTH-003 | P1 | Sincronização Gmail parcial gera toast de sucesso |  |
| TC-001 | P1 | Fluxo de mídia usa três contratos incompatíveis entre storage, mensagem e renderização |  |
| TC-002 | P1 | RPC ativa de conversa direta perdeu a proteção contra criação concorrente |  |
| TC-005 | P1 | Gerenciamento de departamento está inacessível e contém contratos de banco inválidos |  |
| TC-006 | P1 | Paginação, reações e ticks existem parcialmente fora do Panel ativo |  |
| TC-014 | P1 | Branch em quarentena contém substituição incompatível das guardas globais |  |
| TC-015 | P1 | Implementações exclusivas da branch não são substitutos prontos dos contratos atuais |  |
| TEL-PERIOD-001 | P1 | Contrato de filtros do histórico: all literal e período ausente |  |
| TEL-RECONCILIATION-001 | P1 | Reconciliação Bitrix escolhe chamada por sufixo e perde semântica de encerramento |  |
| TEL-RECORDING-001 | P1 | Player espera JSON de URL, mas Edge retorna stream de áudio |  |
| TEL-RUNTIME-001 | P1 | Persistência SIP e código de gravação não encerram homologação real |  |
| TRA-001 | P1 | Banco Único presume origem VPS e destino Singu distintos do Cloud ZAPP canônico |  |
| TRA-002 | P1 | Rotas de várias conexões ainda podem usar a credencial global da instância padrão |  |
| TRA-003 | P1 | GO logada sem socket é classificada como conexão aberta |  |
| TRA-005 | P1 | Excluir conexão pode esconder falha na GO e apagar o vínculo local |  |
| TRA-006 | P1 | Renomear ou apagar label do WhatsApp opera globalmente sem a instância |  |
| TX02 | P1 | Preflight verde foi emitido sem conferir remoto nem secrets |  |
| VOL-02 | P1 | Player atual de gravação de Telefonia ficou fora do volume global |  |
| DASH-CONTROLS-001 | P2 | Controles e rótulos do Dashboard não correspondem ao dado calculado |  |
| DASH-DOC-DRIFT-001 | P2 | README reabre correções antigas e aponta plano de 50 etapas ausente |  |
| IA-AUDIO-001 | P2 | Classificador de áudio-meme ainda usa apenas nome e URL |  |
| IA-DESIGN-001 | P2 | IA-058 entregue como projeto, sem alertas em operação |  |
| IA-TALKX-001 | P2 | Insights TalkX têm métricas e amostras com semântica insuficiente |  |
| LT-LAYOUT-01 | P2 | Padding de TalkX e Multiplix soma-se ao padding do ViewContainer |  |
| LT-LAYOUT-02 | P2 | Dois dos cinco apontamentos do layoutguard são limitações de análise |  |
| LT-LAYOUT-03 | P2 | Teste de largura verifica overflow, não faixa morta nem ocupação do main |  |
| LT-TYPE-02 | P2 | Família literal no screen protection escapa do guard de tipografia |  |
| LT-TYPE-03 | P2 | Scanner de pesos aceita pesos intermediários ausentes em listas estáticas |  |
| LT-TYPE-04 | P2 | Densidade está ativa, mas token de tamanho do texto continua sem consumidor |  |
| LT-TYPE-05 | P2 | Contatos exige reconciliação entre decisão Navy e header visual removido |  |
| MX09 | P2 | Permissão dispatch.create do agente não permite iniciar seu próprio dispatch |  |
| OTH-002 | P2 | Contagens de Arquivos permanecem em cache após exclusão |  |
| OTH-005 | P2 | Email ainda filtra e pagina a lista em memória por offset |  |
| OTH-006 | P2 | Continuação do histórico Gmail não é consumida |  |
| OTH-008 | P2 | Meta de desempenho do Catálogo continua sem medição aprovada |  |
| OTH-009 | P2 | Medição de payload foi fechada apesar de exceder a meta |  |
| OTH-010 | P2 | Teste CT-94 comprova HTTP 429, mas não a reação da interface |  |
| OTH-011 | P2 | Validador do plano histórico de Catálogo falha no baseline |  |
| OTH-012 | P2 | Arquivos não tem os entregáveis finais de QA no baseline |  |
| OTH-013 | P2 | Email Sidebar falta fechar o contrato empresarial real |  |
| OTH-014 | P2 | Medição de memória e consultas do Email não foi localizada |  |
| OTH-015 | P2 | Contatos tem divergência histórica com legados ativados |  |
| SK01 | P2 | Autosave marca como salvo o estado que a gravação por quota rejeitou |  |
| SK02 | P2 | Formato JSON null no storage faz loadThemeConfig lançar em vez de recuperar |  |
| SK03 | P2 | Checkpoints técnicos marcados coexistem com gates visuais e globais não demonstrados |  |
| SV-001 | P2 | Compras não informa que o resumo conta somente compras concluídas |  |
| SV-002 | P2 | Journey apresenta uma amostra de tempo médio como histórico completo |  |
| TC-007 | P2 | Mute é lido e escrito em locais diferentes e notificações só funcionam com a view montada |  |
| TC-009 | P2 | Recibos e reações não forçam conversation_id derivado da mensagem |  |
| TC-010 | P2 | Marcação de leitura e envio podem perder estado após erro silencioso |  |
| TC-011 | P2 | 271 asserts tautológicos não validam Team Chat e os testes de RLS simulam schema fictício |  |
| TC-012 | P2 | Validator legado possui contratos incorretos e sucesso falso para respostas de erro |  |
| TC-013 | P2 | Dois planos de finalização coexistem sem autoridade reconciliada e contêm contratos divergentes |  |
| TEL-DOC-DRIFT-001 | P2 | Cabeçalho de Telefonia não acompanha fases e resolução do login |  |
| TM-01 | P2 | Prévia não oferece leitura integral nem mensagens anteriores antes do aceite |  |
| TM-02 | P2 | Resposta incerta de claim não tem recuperação específica e offline não desabilita o CTA |  |
| TM-03 | P2 | Fechamento 50/50 trata build publicado como revisão visual autenticada |  |
| TM-04 | P2 | Baseline, piloto e observabilidade não sustentam fechamento operacional completo |  |
| TRA-004 | P2 | Troca de conexão padrão não é atômica e anuncia sucesso sem verificar erros |  |
| TRA-007 | P2 | Auditoria de branches confunde erro de git cherry com equivalência |  |
| TRA-009 | P2 | Documentação canônica de CI e checkboxes divergem da baseline |  |
| TRA-010 | P2 | Remoção de Etiquetas deixou compatibilidade de rota e resíduos documentais |  |
| TRA-011 | P2 | Lista distinta de etiquetas deriva de consulta não paginada a contatos |  |
| TX04 | P2 | X057 entregou schema multi-segmento sem salvar/resolver vários segmentos |  |
| VOL-01 | P2 | Play nativo cria AudioContext sem caminho de liberação |  |
| VOL-03 | P2 | Contraste abaixo da régua foi aceito ao restaurar a skin azul |  |
| VOL-04 | P2 | Fallback de vídeo em iOS e matriz física continuam sem prova |  |
| LT-TYPE-01 | P3 | Revisão de fontes ainda descreve PRs abertas e gráficos pendentes já resolvidos |  |
| SV-004 | P3 | Placar e instruções mantêm estados anteriores aos sucessores |  |
| TM-05 | P3 | E2E específico e artefatos visuais não ficaram rastreáveis no fechamento |  |
| TX05 | P3 | Régua visual tem dados para1das17telas |  |
| VOL-05 | P3 | E2E publicado comprova controles e persistência, com exceção de áudio aceita |  |
| VOL-06 | P3 | Encerramento E50 não comprova exclusão imediata da branch final |  |
| SK04 | P4 | Contraste: correções de precedência sobrevivem, ajuste global AA foi revertido por decisão |  |

## Pendente nesta camada
- Cruzar os 372 registros R2 (`REAUDIT_MICROFUNCTIONS`) e os 15 R3 com o vivo (R3 já feito: seção 11.1 do caderno).
- Confirmar no vivo os demais achados que dependem do banco (TC-003, TC-008, DASH-SQL-REGRESSION-001, IA-WEBHOOK-001…).
