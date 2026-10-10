# Catálogo de achados

104 registros de achados no baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Incluem defeitos, limitações de prova e decisões; causas podem afetar vários planos. [JSON completo](FINDINGS.json).

## OTH-001 — Encaminhar N omite arquivos selecionados fora do filtro

**Prioridade:** P1. **Origem:** `modules/other/findings.json`.

**Conclusão:** A seleção persiste por ID quando o filtro muda, mas selectedItems usa somente filtered. A barra calcula N com todos os IDs e encaminha o subconjunto visível. Com todos os selecionados fora do filtro, o botão continua habilitado e openForward([]) retorna sem abrir o diálogo.

**Efeito:** O operador confirma um conjunto diferente do apresentado, ou recebe uma ação sem resultado. Não se trata de perda de dados armazenados; são arquivos omitidos do encaminhamento pretendido.

**Limite:** Reprodução offline da expressão exata, com 2 itens; não houve envio WhatsApp, render React ou incidente de produção observado. A revisão independente confirmou o caminho completo estaticamente.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P025:32](tasks/P025.json), [P025:38](tasks/P025.json), [P025:46](tasks/P025.json)

## OTH-002 — Contagens de Arquivos permanecem em cache após exclusão

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** A PR #1865 introduziu media-gallery-counts. useFilesActions invalida somente media-gallery e conversation-tab-counts após a exclusão. O novo total não é invalidado; eventos UPDATE e DELETE também não o fazem. staleTime não agenda atualização e os defaults globais desligam refetch ao montar e ao focar.

**Efeito:** A galeria e o badge podem diminuir enquanto chips e total do header mantêm o número antigo. Sem outra invalidação ou reconexão, a divergência pode persistir.

**Limite:** Não foi executada a query viva nem o cache React Query. A falta de invalidação é comprovada no código e foi confirmada pela revisão independente; não se presume que toda sessão de usuário permanecerá obsoleta.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P025:35](tasks/P025.json), [P025:42](tasks/P025.json), [P025:45](tasks/P025.json), [P025:46](tasks/P025.json)

## OTH-003 — Sincronização Gmail parcial gera toast de sucesso

**Prioridade:** P1. **Origem:** `modules/other/findings.json`.

**Conclusão:** gmail-sync retorna HTTP 207, success:false e failed maior que zero. O wrapper lança apenas response.error; o callback de sucesso mostra a quantidade sincronizada sem a falha e não invalida gmail-accounts. A reprodução exata do callback exibiu sucesso para 4 itens sincronizados e 1 falha. O revisor executou também o FunctionsClient oficial da versão do lockfile e confirmou error:null para 207.

**Efeito:** O operador não recebe o estado parcial recuperável exigido e pode acreditar que a caixa foi sincronizada integralmente. O estado de erro salvo na conta pode continuar oculto pelo cache.

**Limite:** As reproduções são locais e controladas. Não foi feita chamada ao Gmail nem sincronização de dados do usuário. O artefato independente está em evidence/cross-module-probes.json.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P018:EN-081](tasks/P018.json), [P018:EN-086](tasks/P018.json), [P018:EN-097](tasks/P018.json), [P018:EN-100](tasks/P018.json)

## OTH-004 — Exportação de Catálogo pode omitir produtos com nomes empatados

**Prioridade:** P1. **Origem:** `modules/other/findings.json`.

**Conclusão:** A edge pagina por offset ordenando somente pelo campo escolhido, cujo padrão é nome. collectCatalogExportRows remove IDs duplicados, mas não recupera linhas deslocadas entre páginas. Com duas ordenações legais de quatro nomes iguais, as páginas A,B e B,D produziram CSV com A,B,D, omitindo C.

**Efeito:** O arquivo exportado pode parecer completo mesmo contendo menos produtos que o resultado pretendido. Remover duplicatas não garante ausência de omissões.

**Limite:** Reprodução da função exata com ordens permitidas pelo contrato SQL; não afirma ocorrência real no banco atual nem que toda exportação falha. Exportação de uma seleção já materializada tem caminho distinto.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P014:CT-20](tasks/P014.json), [P014:CT-21](tasks/P014.json), [P014:CT-28](tasks/P014.json)

## OTH-005 — Email ainda filtra e pagina a lista em memória por offset

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** useGmail coleta todas as páginas da conta por range/offset, com limite de 50 mil linhas; só o filtro de conta vai ao servidor. Estado, período, marcadores, anexos e busca são filtrados no array, e a UI recorta 20 itens. EN-025 exigia cursor last_message_at + id e filtros no servidor.

**Efeito:** Custo cresce com o tamanho total da caixa; alterações concorrentes na ordenação podem deslocar páginas. O resultado não cumpre o contrato de volume solicitado, apesar de ultrapassar corretamente o antigo teto de mil linhas em fixtures estáveis.

**Limite:** A ordenação já inclui id, portanto não se atribui a este caso o mesmo defeito de empate puro do Catálogo. Nenhum benchmark de produção foi realizado.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P018:EN-025](tasks/P018.json), [P018:EN-026](tasks/P018.json), [P018:EN-028](tasks/P018.json), [P018:EN-046](tasks/P018.json), [P018:EN-088](tasks/P018.json)

## OTH-006 — Continuação do histórico Gmail não é consumida

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** syncMessages faz uma chamada de listagem de mensagens e retorna nextPageToken; não aceita pageToken. O schema da ação e o front também não oferecem a continuação. A paginação de history incremental foi implementada, mas não substitui a hidratação e a continuação do histórico de mensagens exigidas.

**Efeito:** O botão padrão sincroniza no máximo a primeira página de 50 mensagens da consulta; o contrato permitido chega a 200 por chamada, sem completar páginas posteriores por esse caminho.

**Limite:** Não se afirma que as contas atuais contenham somente 50 mensagens nem que a sincronização incremental esteja ausente. O achado é específico ao caminho sync-inbox e à hidratação exigida.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P018:EN-029](tasks/P018.json), [P018:EN-083](tasks/P018.json)

## OTH-007 — Filtro Novidades não implementa a janela de 30 dias

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** O requisito define is_new OU created_at nos últimos 30 dias. A edge aplica somente is_new=true; o parâmetro new_or_recent e a alternativa temporal não estão no caminho examinado.

**Efeito:** Produtos recentes sem a flag podem ser excluídos de Novidades, e a contagem pode divergir do contrato de agregados.

**Limite:** Não houve amostra viva que prove quantos produtos são afetados; a divergência é de implementação contra requisito.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P014:CT-64](tasks/P014.json), [P014:CT-77](tasks/P014.json)

## OTH-008 — Meta de desempenho do Catálogo continua sem medição aprovada

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** A última medição após a correção do strip registrou desempenho 44 e CLS 0,2452, contra 90 e menos de 0,05. A atribuição foi corrigida e a PR #1735 removeu a troca de header; essa PR declara que a nova Lighthouse ficou pendente.

**Efeito:** A falha histórica é conhecida, mas não há prova de que a última correção atingiu o alvo. Não se deve fechar por inspeção de JSX ou screenshot estática.

**Limite:** VALIDATED_FAIL se refere ao último resultado disponível, não a uma medição feita por esta auditoria depois da PR #1735.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P014:CT-74](tasks/P014.json), [P014:CT-76](tasks/P014.json)

## OTH-009 — Medição de payload foi fechada apesar de exceder a meta

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** O plano marcou CT-73 como feito porque mediu 81,5 KB por 24 produtos; o mesmo enunciado exigia menos de 30 KB e cortar campos quando excedesse. O relatório registra aproximadamente 2,7 vezes o teto.

**Efeito:** Uma atividade de medição concluída está sendo confundida com o aceite de desempenho concluído.

**Limite:** O número é histórico e não foi medido nesta frente; não se estima o tamanho atual por inspeção do código.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P014:CT-73](tasks/P014.json)

## OTH-010 — Teste CT-94 comprova HTTP 429, mas não a reação da interface

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** O spec observa todas as respostas da edge e só exige que exista um 429. Não afirma mensagem, cooldown ou recuperação na UI; a screenshot é capturada em uma página após nova navegação, sem correlação garantida com a resposta que gerou o 429.

**Efeito:** A proteção do backend pode estar provada enquanto o operador continua sem feedback de limite. O critério de UI não está fechado.

**Limite:** Não foi disparada rajada nesta auditoria. A screenshot versionada foi inspecionada e não contém aviso de limite, mas isso sozinho não prova ausência de toda implementação de UI.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P014:CT-59](tasks/P014.json), [P014:CT-94](tasks/P014.json)

## OTH-011 — Validador do plano histórico de Catálogo falha no baseline

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** node scripts/catalog/validate-plan.mjs termina com exit code 1: E54 tem zero subetapas, zero itens de checklist e nenhum Objetivo. O parser conta apenas caixas [ ], apesar de CT-99 pedir marcação de caixas conforme o estado real.

**Efeito:** O gate nominal continua vermelho e incentiva alteração documental artificial se executado sem considerar a sucessão do plano.

**Limite:** Foi executado somente um validador local de Markdown; não houve mudança no plano ou no script.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P014:CT-99](tasks/P014.json)

## OTH-012 — Arquivos não tem os entregáveis finais de QA no baseline

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** Não foram localizados e2e/files-tab.spec.ts e o relatório final exigido. Há implementação de ARIA e testes unitários, mas não a matriz medida de teclado, contraste, modos, laterais e temas. O log posterior mostra duas fixtures de mídia no ledger remoto, sem arquivos locais correspondentes; isso prova preparação parcial, não homologação.

**Efeito:** O plano de 50 etapas foi implementado por lotes até a paginação, mas a conclusão visual e funcional integral permanece sem artefatos rastreáveis.

**Limite:** Ausência restrita ao baseline e aos caminhos/artefatos rastreados. Trabalho posterior, privado ou fora de main não é descartado nem promovido automaticamente.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P025:47](tasks/P025.json), [P025:48](tasks/P025.json), [P025:49](tasks/P025.json), [P025:50](tasks/P025.json)

## OTH-013 — Email Sidebar falta fechar o contrato empresarial real

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** As PRs #1812, #1846 e #1855 implementam DTO, leitura específica, vínculo estável, escolha de empresa e permissão granular. Não foi encontrada matriz final que comprove, no Singu vivo e na UI publicada, os seis campos empresariais exigidos. O dry-run bloqueado de #1855 é histórico e não demonstra ausência atual da migration.

**Efeito:** Campos podem estar corretos em fixtures e ainda faltar o aceite da fonte real, especialmente para contato somente com e-mail, múltiplas empresas e role de atendimento.

**Limite:** Nenhuma chamada foi feita ao Singu nesta frente. Contrato TypeScript, preflight e HTTP 401 anônimo não certificam payload autorizado. Comparador posterior sugere aplicação das migrations locais, mas não imprime cada uma individualmente.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P019:ES-03](tasks/P019.json), [P019:ES-15](tasks/P019.json), [P019:ES-40](tasks/P019.json), [P019:ES-46](tasks/P019.json), [P019:ES-49](tasks/P019.json), [P019:ES-50](tasks/P019.json)

## OTH-014 — Medição de memória e consultas do Email não foi localizada

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** Fixtures de 1.000 threads e 40 anexos existem e há testes de renderização e ciclo de object URLs. EN-088 também exige medir consultas, memória, iframes, listeners, blobs e apresentar antes/depois com orçamento. A contagem de testes do relatório não demonstra essas medições.

**Efeito:** A afirmação de fechamento técnico integral excede a evidência de custo e retenção disponível.

**Limite:** É lacuna de prova, não alegação de vazamento de memória observado. Não foi feito benchmark vivo nesta auditoria.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P018:EN-088](tasks/P018.json), [P018:EN-097](tasks/P018.json)

## OTH-015 — Contatos tem divergência histórica com legados ativados

**Prioridade:** P2. **Origem:** `modules/other/findings.json`.

**Conclusão:** A própria etapa fechada registra que o cenário padrão tinha Total = Todos, mas ao ativar legados o Total foi 3.095 e Todos 3.124. A ressalva de 29 não foi reconciliada com nova medição neste baseline.

**Efeito:** O aceite de paridade não cobre todos os estados exigidos; a etapa não pode usar o caso padrão para certificar o caso com legados.

**Limite:** Os valores são históricos; não se afirma que a divergência permaneça igual nem que o banco atual tenha essa quantidade de registros.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P002:98](tasks/P002.json)

## MX01 — Composer inicia rascunho sem materializar a fila por itens

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Fluxo alcançável: MultiplixView abre Composer; useCreateMultiplixDispatch chama multiplix-audience/create_draft e em seguida multiplix-send/start. A última multiplix_create_draft insere somente dispatches e recipients, sem bloco/item. O worker novo lista exclusivamente delivery_items. Não existe propagação por trigger no schema versionado; confirm é a transação que criaria a fila, mas não é chamada por esse fluxo.

**Efeito:** Salvar e iniciar pode produzir sending com recipients pending e nenhum item processável. A infraestrutura de confirm e do worker existe, mas não compõe um fluxo funcional para o UI atual.

**Limite:** Nenhum dispatch foi criado no banco vivo. Os mocks do probe fabricam itens, portanto não provam esta falha de materialização; ela foi provada por grafo de chamadas e últimas definições SQL, revisadas independentemente por pr_issue_audit.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F08](tasks/P039.json), [P039:F10](tasks/P039.json), [P039:F44](tasks/P039.json), [P039:F51](tasks/P039.json), [P039:F55](tasks/P039.json), [P039:F72](tasks/P039.json), [P039:F79](tasks/P039.json), [P039:F89](tasks/P039.json)

## MX02 — Worker envia template e mídia globais, divergindo do bloco e da prévia

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** O worker carrega block.content, mas personaliza dispatch.message_template com company e custom variables vazias; decide mídia por dispatch.media_url/media_type. De content usa apenas media.fileName. Preview usa content.text/voice.script/media.caption e variables_snapshot. A forma file_name do preview também difere de fileName no worker.

**Efeito:** Múltiplos blocos podem repetir o texto/arquivo global em vez do que o operador revisou. Voz personalizada e estimativas não representam o envio. Probe local com GLOBAL {{empresa}} e bloco BLOCO CORRETO {{empresa}} enviou GLOBAL Empresa1.

**Limite:** Probe executa o worker fonte com banco/provedor injetados em memória; demonstra decisão JS e payload, sem chamar provider, SQL, TTS ou produção. Não prova entrega real.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F33](tasks/P039.json), [P039:F43](tasks/P039.json), [P039:F45](tasks/P039.json), [P039:F48](tasks/P039.json), [P039:F50](tasks/P039.json), [P039:F51](tasks/P039.json), [P039:F55](tasks/P039.json), [P039:F56](tasks/P039.json), [P039:F67](tasks/P039.json), [P039:F79](tasks/P039.json)

## MX03 — Conclusão usa a fila antiga de recipients após enviar itens

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Worker chama complete_multiplix_dispatch_if_drained ao final. Última definição desta RPC consulta pending/sending em multiplix_recipients. record_multiplix_item_sent/complete_multiplix_item atualizam itens e counters do dispatch, sem atualizar status/sent_at do recipient. Existe complete_multiplix_dispatch_if_items_drained, mas o worker não a chama.

**Efeito:** Mesmo com itens terminais, recipients podem permanecer pending; dispatch nunca conclui no fluxo atual. Contadores/UI podem ficar inconsistentes, repetindo cron desnecessariamente.

**Limite:** completed:true nos probes vem do mock default, não de SQL. A falha de drenagem é inferência estrutural da última definição, confirmada em revisão independente. F59 já corrige cancelamento de itens e casts de transition; esses defeitos antigos não são alegados aqui.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F10](tasks/P039.json), [P039:F11](tasks/P039.json), [P039:F13](tasks/P039.json), [P039:F55](tasks/P039.json), [P039:F57](tasks/P039.json), [P039:F59](tasks/P039.json), [P039:F89](tasks/P039.json)

## MX04 — Cota por conexão subconta o novo Multiplix e aceita medição inválida

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** multiplix_connection_daily_usage e talkx_connection_send_budget contam multiplix_recipients.sent_at. O sender atual registra envio em delivery_items.sent_at sem refletir esse carimbo no recipient. Além disso, resolveDailyRoom retorna null para remaining não numérico e trata dispatch sem connection_id como sem cota.

**Efeito:** Envios Multiplix por item podem desaparecer do teto diário/minuto compartilhado; reinvocações renovam saldo aparente e TalkX pode usar uma cota já consumida. Contagem por destinatário também precisa definição quando há vários blocos/mensagens.

**Limite:** Não medida utilização real da conexão. Conclusão vem do SQL vigente e dos campos que o worker atual escreve; pode haver divergência remota ainda não inspecionada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F17](tasks/P039.json), [P039:F55](tasks/P039.json), [P046:X018](tasks/P046.json), [P046:X019](tasks/P046.json)

## MX05 — Erro429 definitivo do provedor não recebe retentativa limitada

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** classifyProviderError é usado para rotular o erro, porém ramo de resposta não OK completa o item como failed. reschedule_multiplix_item só é chamado se nenhum POST foi tentado. Probe429 retornou failed1 e zero rescheduleCalls.

**Efeito:** Rejeição temporária por taxa vira falha terminal apesar do plano garantir retentativa30s/2min/10min. Texto de erro legível não corrige a decisão operacional.

**Limite:** Provedor simulado local, nenhum envio real. Não se recomenda repetir automaticamente todo5xx: o tratamento atual outcome_unknown é proteção de idempotência e deve ser mantido quando necessário.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F42](tasks/P039.json), [P039:F43](tasks/P039.json), [P039:F55](tasks/P039.json), [P039:F88](tasks/P039.json)

## MX06 — Worker ignora variável ausente e envia texto vazio no lugar

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** personalize retorna text,missing,unknown após X020. Multiplix extrai só .text e fornece apenas company; teste legado ainda intitula string vazia para company null. Probe Ola {{empresa}} com company null enviou Ola e reportou missing empresa.

**Efeito:** Mensagem aprovada pode sair com lacuna, variável desconhecida ou sem dados de customização; a validação da prévia não protege o envio real.

**Limite:** Teste local comprova texto enviado ao adaptador mock. Não afirma que houve envio real com lacuna; impacto de produção depende do deploy do baseline.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F37](tasks/P039.json), [P039:F43](tasks/P039.json), [P039:F48](tasks/P039.json), [P039:F88](tasks/P039.json)

## MX07 — Adapter GO recebe chave global sem token da instância

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Na chamada send o worker passa evolutionKey/flavor/signal, mas não instanceToken. O adaptador GO usa deps.instanceToken ?? deps.evolutionKey em apikey. Contrato do repo distingue credencial global de /instance/* e token da instância para /send/*.

**Efeito:** No flavor GO, conexão selecionada pode enviar com credencial incorreta. Testes de F56 usam v2 e não captam a ausência; probe registra instanceTokenPresent=false.

**Limite:** Falha remota403 não foi observada. O achado é incompatibilidade com contrato GO documentado e chamada local; ambientes em v2 ou com chave compatível podem não manifestar o erro.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F41](tasks/P039.json), [P039:F43](tasks/P039.json), [P039:F55](tasks/P039.json), [P039:F56](tasks/P039.json)

## MX08 — API de rascunho mistura identidades/colunas e aceita destinatário do cliente

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** DraftCreateSchema aceita recipients arbitrários e handler encaminha a RPC service_role com p_created_by=auth.userId, sem re-resolver Singu nem gate global dispatch.create. Banco valida profiles.id; identidade pode ser diferente. draft.get seleciona template/recipient_count, mas schema usa message_template/total_recipients, e compara created_by com auth.userId. Outros handlers já mapearam profile corretamente, tornando comportamento inconsistente.

**Efeito:** Usuário legítimo pode receber502/404 e criar/editar falhar; corrigir apenas ID deixaria um caminho de destinatário fornecido pelo cliente contrário a F08. Escopo de acesso não está uniformemente demonstrado.

**Limite:** Não foi explorado ambiente vivo nem comprovado envio não autorizado. A falha de identity pode impedir a via insegura; por isso ela é risco contratual condicionado, não declaração de exploração bem-sucedida.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F08](tasks/P039.json), [P039:F44](tasks/P039.json), [P039:F45](tasks/P039.json), [P039:F46](tasks/P039.json), [P039:F51](tasks/P039.json), [P039:F54](tasks/P039.json)

## MX09 — Permissão dispatch.create do agente não permite iniciar seu próprio dispatch

**Prioridade:** P2. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Matriz F25 concede a agent customers.own e multiplix.dispatch.create, e front usa essa permissão. Worker JWT exige is_admin_or_supervisor ou manage_all antes da checagem de owner, sem aceitar dispatch.create.

**Efeito:** Papel autorizado a entrar/criar pelo produto recebe403 ao iniciar seu próprio disparo no fluxo UI→start, se não acumular role/permissão ampla.

**Limite:** Nenhum JWT real utilizado. A composição efetiva de roles em produção não foi consultada; incompatibilidade existe para o papel mínimo descrito pelo plano.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P039:F25](tasks/P039.json), [P039:F44](tasks/P039.json), [P039:F71](tasks/P039.json)

## TX01 — STATUS V4 está defasado e mede marcadores de commit

**Prioridade:** P2. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Arquivo STATUS informa35/200; cálculo read-only em baseline retorna36/200 e242/1135elementos. --check falha comexit1. Os IDs são extraídos de assunto Git com escopo talkx, sem inspecionar DoD. X047/X057 parcialmente entregues são contados inteiros.

**Efeito:** Percentual de merge pode ser apresentado indevidamente como produto concluído; omissões parciais tornam-se invisíveis no placar.

**Limite:** 31units dos verificadores passam; o erro não implica gerador defeituoso. Ele implementa contador Git previsto; limitação é semântica de conclusão e estado commitado desatualizado.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P046:X002](tasks/P046.json), [P046:X197](tasks/P046.json), [P046:X200](tasks/P046.json)

## TX02 — Preflight verde foi emitido sem conferir remoto nem secrets

**Prioridade:** P1. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Artifact X023 registra git_sha:null, divergidas.remoto:null e secrets.ausentes:null/missing:null, com conclusao preflight verde. Script trata remoto/secrets como opcionais e null como ausência de problema.

**Efeito:** Gate exigido antes do disparo não demonstra paridade deploy/código/segredos. Mudanças de send/scheduler depois de X023 ampliam a lacuna do snapshot histórico.

**Limite:** O relatório PR cita runs de deploy históricos, mas não foi consultado código remoto; não se afirma que deploy falhou, somente que o artifact não o prova.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P046:X023](tasks/P046.json), [P046:X011](tasks/P046.json), [P046:X012](tasks/P046.json), [P046:X015](tasks/P046.json), [P046:X025](tasks/P046.json)

## TX03 — X047 deixou adoção dos estados em uma etapa informal fora do plano

**Prioridade:** P2. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Boundary/hook error existem, porém PR#1837 admite infra agora e migração X047b depois. Baseline tem só import não usado do QueryBoundary em Templates, error genérico Analytics e texto Carregando campanha… em View; matriz testa boundary isolado, não cada tela.

**Efeito:** Falha de consulta pode continuar aparecendo como vazio/carregamento sem retry; contador marca X047 concluída apesar do saldo principal.

**Limite:** Não executado browser/screenshot; achado de wiring estático, não medição visual de produção.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P046:X047](tasks/P046.json), [P046:X048](tasks/P046.json), [P046:X055](tasks/P046.json), [P046:X192](tasks/P046.json)

## TX04 — X057 entregou schema multi-segmento sem salvar/resolver vários segmentos

**Prioridade:** P2. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Migration #1706 adiciona campaign_segments/segment_id/backfill/realtime e declara não alterar funções. Fazer/Aceite exigem save_draft com1–10segment_ids e snapshot ordenado/dedupe. Essas funções não recebem a extensão nessa entrega; PR chama a fatia X057a.

**Efeito:** Estrutura existe, mas campanha ainda não obtém os destinatários dos vários segmentos conforme ordem; contador V4 fecha capacidade prematuramente.

**Limite:** DDL no runtime não verificado. Existência estrutural reconhecida; não alegar ausência completa de multi-segmento.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P046:X057](tasks/P046.json), [P046:X058](tasks/P046.json), [P046:X119](tasks/P046.json), [P046:X127](tasks/P046.json)

## TX05 — Régua visual tem dados para1das17telas

**Prioridade:** P3. **Origem:** `modules/talkx_multiplix/findings.json`.

**Conclusão:** Diretório contém17JSONs; só01-campanhas-visao-geral tem chaves,02–17são vazios e test.skip é intencional no contrato de crescimento revisado. Telas13/14/15 não existem.

**Efeito:** Artefato de infraestrutura não certifica fidelidade visual17/17 nem qualidade final; cobertura deve crescer a cada tela.

**Limite:** Não é bug isolado da infraestrutura X003/X004: a redução foi documentada/mergeada. Nenhuma escrita de fixture em produção é necessária ou autorizada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P046:X003](tasks/P046.json), [P046:X004](tasks/P046.json), [P046:X195](tasks/P046.json), [P046:X198](tasks/P046.json)

## TEL-PERIOD-001 — Contrato de filtros do histórico: all literal e período ausente

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** useTelefoniaFilters define channel/dir/result=all; TelefoniaView repassa esses valores e useMyCalls envia-os crus para search_my_calls. A RPC interpreta somente NULL como sem filtro, logo o default exige c.channel=all/c.direction=all e pode devolver zero linhas. Além disso, period só muda queryKey, nunca p_from/p_to. O KPI faz a conversão do canal e envia datas, portanto histórico e KPI divergem.

**Efeito:** Histórico padrão vazio ou com janela incorreta; operador pode concluir que não há chamadas e controles parecem funcionar apenas porque a cache muda.

**Limite:** Reprodução local independente executou hooks extraídos com dependências em memória e predicado SQL; não usou SDK/React/DB real.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P035:T35](tasks/P035.json), [P035:T36](tasks/P035.json), [P035:T37](tasks/P035.json), [P035:T45](tasks/P035.json), [P035:T52](tasks/P035.json), [P035:T53](tasks/P035.json), [P035:T81](tasks/P035.json), [P035:T83](tasks/P035.json)

## TEL-RECORDING-001 — Player espera JSON de URL, mas Edge retorna stream de áudio

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** useCallRecording interpreta data como {url}; get-call-recording devolve new Response(upstream.body) com Content-Type de áudio. Dados de áudio/Blob não possuem .url e RecordingPlayer retorna null. Os testes de UI mockam JSON que a Edge não entrega; os seis testes da Edge só verificam cabecalhosDoAudio, sem autenticação/handler.

**Efeito:** Gravação disponível pode nunca aparecer para ouvir; os testes atuais não detectam a incompatibilidade e não provam 200/401/403 do aceite.

**Limite:** Reprodução em memória comprovou disponivel=false para áudio/Blob e true para JSON{url}; sem download de áudio real.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P035:T52](tasks/P035.json), [P035:T67](tasks/P035.json), [P035:T73](tasks/P035.json), [P035:T74](tasks/P035.json)

## TEL-RECONCILIATION-001 — Reconciliação Bitrix escolhe chamada por sufixo e perde semântica de encerramento

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** escolherCandidata compara últimos nove dígitos e retorna o primeiro candidato em ±90s. A consulta não limita canal/direção/provedor e não rejeita ambiguidade. dadosDaReconciliacao grava CALL_FAILED_CODE cru em end_reason e substitui campos por null quando a origem não os traz. Falta fonte Bitrix/N8N comprovada; zero sem configuração não constitui sincronização bem-sucedida.

**Efeito:** Possível associação de gravação/identificador a chamada de outro DDD/canal e sobrescrita de desfecho canônico. Impacto em privacidade depende do pareamento real; nenhuma exposição foi demonstrada.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P035:T14](tasks/P035.json), [P035:T65](tasks/P035.json), [P035:T72](tasks/P035.json), [P035:T74](tasks/P035.json)

## TEL-RUNTIME-001 — Persistência SIP e código de gravação não encerram homologação real

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** T11 permanece desmarcado porque não há chamada real de aceite com provider_call_id/end_reason e três transições no mesmo UUID. A persistência/retentativa está implementada. Provisionamento SIP teve 503 documentado; T94–T97 ainda exigem publicação/configuração, áudio real e ausência de ringing preso após os ensaios.

**Efeito:** Código incorporado não autoriza afirmar que Telefonia funciona em produção ou que a integração Bitrix entrega gravação.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P035:T100](tasks/P035.json), [P035:T11](tasks/P035.json), [P035:T15](tasks/P035.json), [P035:T94](tasks/P035.json), [P035:T95](tasks/P035.json), [P035:T96](tasks/P035.json), [P035:T97](tasks/P035.json)

## TEL-DOC-DRIFT-001 — Cabeçalho de Telefonia não acompanha fases e resolução do login

**Prioridade:** P2. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** Topo do plano diz fase 2 não iniciada e #1494 aguardando responsável. PRs #1494/#1585/#1703/#1830/#1851/#1858/#1864 estão incorporados. Nota de 03/10 declara login 200 e screenshot 06-after, tornando o bloqueio antigo de autenticação obsoleto. Isso não cria 00-before nem fecha T11.

**Efeito:** Execução futura pode repetir fases prontas ou continuar citando um bloqueio resolvido.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P035:T06](tasks/P035.json), [P035:T22](tasks/P035.json), [P035:T32](tasks/P035.json), [P035:T42](tasks/P035.json), [P035:T54](tasks/P035.json)

## IA-WEBHOOK-001 — Webhook assinado ainda aceita replay e não verifica falha de insert

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** Assinatura/timestamp/corpo original são checados, mas cada evento válido chega novamente a audit_logs.insert. Não há dedupe por evento e o retorno {error} do insert não é examinado antes do 200. O manifest/catalog versionado não tem unique/event-id/trigger de deduplicação em audit_logs.

**Efeito:** Evento repetido pode gerar múltiplos registros; falha de persistência pode ser respondida como sucesso. Critério explícito IA-013 de repetição sem novo efeito não é cumprido.

**Limite:** Catálogo/manifesto são snapshots versionados, não uma consulta viva; não foi enviado evento real ao webhook.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-013](tasks/P007.json)

## IA-EGRESS-001 — Endpoint e nome de secret configuráveis não têm vinculação segura completa

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** ai-generate consulta Deno.env.get(provider.api_key_secret_name/secretName). ai-providers faz fetch(params.endpoint) e pode enviar Authorization. Allowlist de chaves/headers não valida nome de secret, destino, DNS, redirects e portas. ai_providers tem escrita administrativa; risco exige configuração privilegiada maliciosa/errada, não usuário comum com acesso à tabela.

**Efeito:** Configuração privilegiada pode direcionar credencial de infraestrutura/provedor a destino impróprio ou rede interna. Não foi realizada tentativa de SSRF/exfiltração.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-016](tasks/P007.json), [P007:IA-017](tasks/P007.json), [P007:IA-038](tasks/P007.json)

## IA-SENTIMENT-001 — Consumidores do Dashboard divergem do vocabulário canônico PT-BR

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** SENTIMENT_VALUES é positivo/neutro/negativo/critico. useAIStats compara positive/negative/neutral, enquanto SentimentHelpers/RecentAlerts usam PT-BR sem normalizar legados, crítico e desconhecido. O helper de normalização existe e é reexportado; sua existência não prova consumo uniforme.

**Efeito:** Contagens/trends podem zerar classes válidas ou transformar dados críticos/desconhecidos em neutros. Claims de unificação global IA-021 e README ficam incorretos.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P062:DASH-020](tasks/P062.json), [P062:DASH-065](tasks/P062.json), [P062:DASH-068](tasks/P062.json), [P062:DASH-070](tasks/P062.json), [P062:DASH-073](tasks/P062.json), [P007:IA-021](tasks/P007.json), [P007:IA-068](tasks/P007.json), [P007:IA-142](tasks/P007.json), [P007:IA-198](tasks/P007.json)

## IA-TIMEOUT-001 — Prazo de IA não cobre consumo do corpo e log essencial continua best effort

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** Timer do AbortController é limpo após fetch resolver os headers. ai-generate chama response.json fora desse prazo. withRetry limita tentativas/fetch, não todo o trabalho de corpo/DB. ai-usage captura falhas sem persistência durável de reenvio.

**Efeito:** Resposta com headers rápidos e corpo travado pode exceder prazo; log essencial pode desaparecer em falha de banco apesar do rótulo garantido.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-041](tasks/P007.json), [P007:IA-042](tasks/P007.json), [P007:IA-049](tasks/P007.json), [P007:IA-185](tasks/P007.json)

## IA-CIRCUIT-001 — IA-050 não possui circuit breaker apesar de frase de fechamento do bloco

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** README reconhece IA-050 não entregue e ausência de mecanismo de suspensão por falhas repetidas; seção Próximos blocos diz 001..050 entregues. Dispatcher possui retry/fallback/erros explícitos, sem estado fechado/aberto/meia-abertura por provedor/capacidade.

**Efeito:** Falhas repetidas continuam gerando tentativas; avanço documental pode esconder a tarefa não implementada.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-009](tasks/P007.json), [P007:IA-050](tasks/P007.json), [P007:IA-198](tasks/P007.json), [P007:IA-200](tasks/P007.json)

## IA-QUOTA-001 — Separação ação/tentativa/cobrança não foi ligada à quota real

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** reconciliarConsumo, identidadeDaAcao e contaParaQuota estão no helper e testes, sem consumidor produtivo externo encontrado. enforceAiGuards ainda conta linhas ai_usage_logs por usuário/função; summary SQL agrega count(*). A decisão de quota não aplica a identidade de ação.

**Efeito:** Retry/fallback pode contar como várias ações para limite diário; helper testado não prova regra do sistema em execução.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-043](tasks/P007.json), [P007:IA-044](tasks/P007.json), [P007:IA-054](tasks/P007.json), [P007:IA-056](tasks/P007.json)

## IA-DESIGN-001 — IA-058 entregue como projeto, sem alertas em operação

**Prioridade:** P2. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** O próprio requisito pede projetar mecanismo futuro. #1839 entrega documento com incidentes, limiares e bloqueio por capacidade; afirma explicitamente que nada é implementado nesta etapa.

**Efeito:** Contar o PR como alerta/worker disponível falsearia o estado do produto; também seria incorreto tratar ausência de código como falha do escopo puramente documental.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-058](tasks/P007.json)

## IA-CHATBOT-001 — Chatbot não usa connectionId para selecionar flow e histórico

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** chatbot-l1 recebe connectionId, mas seleciona primeiro chatbot_flow ativo ai_l1 sem filtro de conexão; histórico limita 15 mensagens por contact_id. transfer_to_human é retornado como flag e não comprova por si a transferência efetiva.

**Efeito:** Bot pode escolher configuração/contexto de conexão inadequada; cadeia de transferência e disputa com humano não está homologada.

**Limite:** RLS/autorização existente continua relevante; não foi demonstrado envio cruzado real nem lida integração viva.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-104](tasks/P007.json), [P007:IA-106](tasks/P007.json), [P007:IA-107](tasks/P007.json), [P007:IA-108](tasks/P007.json), [P007:IA-109](tasks/P007.json), [P007:IA-110](tasks/P007.json)

## IA-METRICS-001 — Ferramentas gerenciais ainda derivam conclusões de dados incompatíveis

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** Churn usa updated_at como última interação, ignora resultado recebido de ai-churn-analysis e recalcula score local. AutoTicketClassifier usa primeira tag por contato. NextBestAction consulta pending e descarta erros de quatro leituras. SupervisorCopilot recebe apenas contagens gerais, embora pergunte SLA/backlog/performance.

**Efeito:** Interface pode afirmar sucesso ou ausência de pendência sem dados suficientes, e produzir recomendação gerencial sem sustentação.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-111](tasks/P007.json), [P007:IA-112](tasks/P007.json), [P007:IA-113](tasks/P007.json), [P007:IA-114](tasks/P007.json), [P007:IA-115](tasks/P007.json), [P007:IA-116](tasks/P007.json), [P007:IA-117](tasks/P007.json), [P007:IA-118](tasks/P007.json)

## IA-AUDIO-001 — Classificador de áudio-meme ainda usa apenas nome e URL

**Prioridade:** P2. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** generateWithRouting foi integrado, mas o prompt pede classificar pelo file_name/audio_url; não há transcrição ou conteúdo sonoro no pedido.

**Efeito:** Roteamento corrigido pode ser confundido com entendimento de áudio entregue; categoria reflete metadados, não necessariamente o som.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-131](tasks/P007.json)

## IA-TALKX-001 — Insights TalkX têm métricas e amostras com semântica insuficiente

**Prioridade:** P2. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** Horário usa até 2000 envios e hora local. Melhor template ordena número absoluto de replies e só depois calcula taxa. lowClickCampaigns conta campanhas finished sem filtrar taxa de clique.

**Efeito:** Recomendações de horário/template/baixo clique podem ter rótulo mais forte do que sua base calculada.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P007:IA-167](tasks/P007.json), [P007:IA-168](tasks/P007.json), [P007:IA-170](tasks/P007.json)

## DASH-SQL-REGRESSION-001 — Migration de soft-delete reintroduz corpo antigo de dashboard_contact_counts

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** A última das quatro definições da RPC no diretório root, 20260930400000 (#1371), copia a versão inicial e adiciona deleted_at IS NULL. Reintroduz assigned_to=auth.uid, remove resolução efetiva de p_agent e guard de staff, perde timezone São Paulo e SET search_path, e faz LEFT JOIN de conversation_sla sem pré-agregação. Índice parcial SLA só impede múltiplas primeiras respostas pendentes; vários SLAs respondidos no dia continuam possíveis e multiplicam waiting/in_service.

**Efeito:** Contagem pessoal pode zerar com UUIDs distintos, fila pode inflar e janela diária pode mudar. Regressão de escopo precisa prioridade, mas não prova vazamento irrestrito.

**Limite:** Validação independente confirmou que não há definição/ALTER posterior no baseline. SECURITY INVOKER padrão e RLS permanecem; CREATE OR REPLACE preserva ownership/ACL já concedidas/revogadas. Corpo vivo não foi lido; nenhum bypass de RLS demonstrado.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P062:DASH-003](tasks/P062.json), [P062:DASH-004](tasks/P062.json), [P062:DASH-005](tasks/P062.json), [P062:DASH-008](tasks/P062.json), [P062:DASH-011](tasks/P062.json), [P062:DASH-013](tasks/P062.json), [P062:DASH-018](tasks/P062.json), [P062:DASH-022](tasks/P062.json), [P062:DASH-024](tasks/P062.json), [P062:DASH-025](tasks/P062.json), [P062:DASH-026](tasks/P062.json), [P062:DASH-031](tasks/P062.json), [P062:DASH-051](tasks/P062.json), [P062:DASH-091](tasks/P062.json), [P062:DASH-096](tasks/P062.json)

## DASH-DOC-DRIFT-001 — README reabre correções antigas e aponta plano de 50 etapas ausente

**Prioridade:** P2. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** README ainda diz ranking all-time, DemandPrediction Previsão IA, relatório compartilhado e ausência de leitura audit_logs. Código atual tem ranking p_period #809, rótulo Média7dias #781 e owner-only; AIStats ainda lê audit_logs. Arquivo claude/PLANO_DASHBOARD_50_ETAPAS.md não existe no HEAD nem foi encontrado na história completa. Documento externo de 100 etapas é origem distinta e não o substitui.

**Efeito:** Risco de refazer correções concluídas e confundir linhagens ou contar E53 de Search Box como Dashboard100.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P062:DASH-002](tasks/P062.json), [P062:DASH-003](tasks/P062.json), [P062:DASH-015](tasks/P062.json), [P062:DASH-059](tasks/P062.json), [P062:DASH-075](tasks/P062.json)

## DASH-REALTIME-001 — Realtime/refresh misturam escopo, conexão, batch mutável e janelas

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** useRealtimeDashboard não recebe filtros do topo; fetch marca isConnected=true, erros nem sempre são checados, batch captura pending mutável que é logo zerado, contadores de unread não verificam todas as transições/duplicatas e janela da última hora não expira eventos. useDashboardStats.refetch retorna void; useLeaderboard não descarta resposta antiga por período.

**Efeito:** Números podem mudar sem refletir o filtro/janela, mostrar conexão falsa, perder deltas ou voltar ao período anterior.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P062:DASH-041](tasks/P062.json), [P062:DASH-042](tasks/P062.json), [P062:DASH-043](tasks/P062.json), [P062:DASH-044](tasks/P062.json), [P062:DASH-045](tasks/P062.json), [P062:DASH-046](tasks/P062.json), [P062:DASH-047](tasks/P062.json), [P062:DASH-048](tasks/P062.json), [P062:DASH-049](tasks/P062.json), [P062:DASH-050](tasks/P062.json), [P062:DASH-095](tasks/P062.json)

## DASH-METRICS-001 — Totais e ausência de dados ainda usam proxies, caps e fallbacks incorretos

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** SLA usa 100 sem denominador; Goals usa criação de contato e análise IA para atendimento/resolução; NPS limita 500, alertas de sentimento400 e AIStats5, realtime distinct5000. Ranking usa is_active como presença e previousRank igual ao rank atual. Sentimento pondera dias igualmente. Mutations de relatório não checam linhas afetadas e hooks omitem error.

**Efeito:** Cards podem superestimar desempenho, subcontar volume, afirmar presença inexistente ou confirmar mutação sem efeito.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P062:DASH-006](tasks/P062.json), [P062:DASH-009](tasks/P062.json), [P062:DASH-020](tasks/P062.json), [P062:DASH-024](tasks/P062.json), [P062:DASH-027](tasks/P062.json), [P062:DASH-028](tasks/P062.json), [P062:DASH-029](tasks/P062.json), [P062:DASH-032](tasks/P062.json), [P062:DASH-033](tasks/P062.json), [P062:DASH-034](tasks/P062.json), [P062:DASH-035](tasks/P062.json), [P062:DASH-036](tasks/P062.json), [P062:DASH-051](tasks/P062.json), [P062:DASH-052](tasks/P062.json), [P062:DASH-053](tasks/P062.json), [P062:DASH-054](tasks/P062.json), [P062:DASH-055](tasks/P062.json), [P062:DASH-057](tasks/P062.json), [P062:DASH-058](tasks/P062.json), [P062:DASH-059](tasks/P062.json), [P062:DASH-060](tasks/P062.json), [P062:DASH-062](tasks/P062.json), [P062:DASH-063](tasks/P062.json), [P062:DASH-064](tasks/P062.json), [P062:DASH-067](tasks/P062.json), [P062:DASH-068](tasks/P062.json), [P062:DASH-069](tasks/P062.json), [P062:DASH-073](tasks/P062.json), [P062:DASH-074](tasks/P062.json), [P062:DASH-079](tasks/P062.json), [P062:DASH-080](tasks/P062.json), [P062:DASH-087](tasks/P062.json), [P062:DASH-088](tasks/P062.json)

## DASH-CONTROLS-001 — Controles e rótulos do Dashboard não correspondem ao dado calculado

**Prioridade:** P2. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** AIQuickAccess tem análises recentes fixas e insightPeriod sem efeito em dados. SatisfactionMetrics desenha CSAT mesmo quando NPS é selecionado. Heatmap usa mensagens para todos os tipos. DemandPrediction mantém confiança95% heurística e capacidade35. biweekly recebe rótulos Quinzenal e Personalizada/Sob demanda.

**Efeito:** Operador interpreta controles como mudança real de análise e alegações estatísticas como medição validada.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P062:DASH-063](tasks/P062.json), [P062:DASH-071](tasks/P062.json), [P062:DASH-072](tasks/P062.json), [P062:DASH-075](tasks/P062.json), [P062:DASH-076](tasks/P062.json), [P062:DASH-077](tasks/P062.json), [P062:DASH-078](tasks/P062.json), [P062:DASH-080](tasks/P062.json), [P062:DASH-082](tasks/P062.json)

## DASH-ACCEPTANCE-001 — Testes e documentos atuais não encerram RLS, integração e liberação das 100 etapas

**Prioridade:** P1. **Origem:** `modules/telefonia_ia_dashboard/findings.json`.

**Conclusão:** Testes SQL usam service_role, skips/casos comentados e fórmulas isoladas. O novo plano exige usuários distintos, dataset acima dos caps, nove abas, concorrência, replay, carga e revisão de negócio. Cadeia de relatórios até ocorrência/entrega não foi provada; nenhum desses gates foi executado neste recorte.

**Efeito:** Marcar 100 etapas como concluídas por migrações/PRs ocultaria falhas já observadas e exposição ainda não testada.

**Limite:** Conclusão sobre o baseline versionado; sem execução do fluxo vivo nem certificação da versão publicada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P062:DASH-083](tasks/P062.json), [P062:DASH-084](tasks/P062.json), [P062:DASH-085](tasks/P062.json), [P062:DASH-086](tasks/P062.json), [P062:DASH-091](tasks/P062.json), [P062:DASH-092](tasks/P062.json), [P062:DASH-093](tasks/P062.json), [P062:DASH-094](tasks/P062.json), [P062:DASH-095](tasks/P062.json), [P062:DASH-096](tasks/P062.json), [P062:DASH-097](tasks/P062.json), [P062:DASH-098](tasks/P062.json), [P062:DASH-099](tasks/P062.json), [P062:DASH-100](tasks/P062.json)

## TRA-001 — Banco Único presume origem VPS e destino Singu distintos do Cloud ZAPP canônico

**Prioridade:** P1. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** O plano chama o ZAPP de self-hosted/VPS e propõe migrá-lo para o Singu pgxfvjmuubtbowutlide. CLAUDE fixa o Cloud tnnnlkbymytvtqngbbqh e diz que a stack self-hosted atende outros sistemas. O plano ainda quer fundir tags/contact_tags removidas na #999 e remover a integração CRM que possui consumidores atuais.

**Efeito:** Executar mecanicamente as 201 tarefas pode retargetar Auth/dados, remover integração viva ou descomissionar infraestrutura que não é o ZAPP atual. Também contaminaria evidência se PR #45 do Singu fosse associada à #45 do ZAPP.

**Limite:** Não foi consultado Singu_V2 nem o banco Singu nesta frente; os números e entregas FEITO do documento permanecem históricos. Decisões antigas 1/2/5 foram preservadas, não reabertas automaticamente.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P001:2](tasks/P001.json), [P001:25](tasks/P001.json), [P001:94](tasks/P001.json), [P001:107](tasks/P001.json), [P001:144](tasks/P001.json), [P001:148](tasks/P001.json), [P001:197](tasks/P001.json), [P001:198](tasks/P001.json), [P001:200](tasks/P001.json)

## TRA-002 — Rotas de várias conexões ainda podem usar a credencial global da instância padrão

**Prioridade:** P1. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** evoFetch aceita token individual, mas na sua ausência usa EVOLUTION_INSTANCE_TOKEN sem comparar o nome. O proxy, message-delivery e health não resolvem o token correspondente; goTokenMatches do webhook compara com um global. Probe por import real com fetcher em memória enviou a rota SECONDARY ao tradutor e capturou a credencial dummy PRIMARY quando token explícito foi omitido.

**Efeito:** O nome no path não prova isolamento: o tradutor reduz a rota a /send/text e a GO seleciona a instância pela credencial. Saúde, operações e envio podem refletir a padrão em vez da conexão escolhida. Ativar enforcement de token antes da migração bloquearia outra credencial.

**Limite:** local-semantic-probes.json registra entradas sintéticas e zero requests de rede. Não é relato de mensagem enviada ao número errado em produção; valor atual de multi_connection_enabled/enforcement não foi lido. TalkX X019 já resolveu seu caminho principal e não foi rotulado inteiramente ausente.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P009:E15](tasks/P009.json), [P009:E16](tasks/P009.json), [P009:E18](tasks/P009.json), [P009:E21](tasks/P009.json), [P009:E23](tasks/P009.json), [P009:E24](tasks/P009.json), [P009:E30](tasks/P009.json), [P009:E31](tasks/P009.json), [P009:E50](tasks/P009.json)

## TRA-003 — GO logada sem socket é classificada como conexão aberta

**Prioridade:** P1. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** extractConnectionState ignora Connected e retorna open quando LoggedIn é verdadeiro. Importação direta do arquivo TypeScript inalterado confirmou que {Connected:false,LoggedIn:true} retorna open, quando o contrato E25 requer connecting.

**Efeito:** connection-health-check traduz open para healthy/connected e pode apresentar disponibilidade falsa durante reconexão.

**Limite:** Três entradas sintéticas testadas por import real: duas atenderam ao contrato e uma falhou. Nenhuma instância GO foi consultada ou modificada. Resultado em local-semantic-probes.json.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P009:E24](tasks/P009.json), [P009:E25](tasks/P009.json), [P009:E28](tasks/P009.json), [P009:E50](tasks/P009.json)

## TRA-004 — Troca de conexão padrão não é atômica e anuncia sucesso sem verificar erros

**Prioridade:** P2. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** handleSetDefault executa dois UPDATE separados, desmarca outras linhas, marca a escolhida e atualiza UI/toast sem ler error de nenhuma operação. Há índice parcial único no DDL, mas não a transação/RPC consumida proposta pelo plano.

**Efeito:** Falha entre as duas operações pode deixar zero padrão e interface afirmando que a mudança terminou. Concorrência também não é resolvida pelo estado local.

**Limite:** Não foram alteradas conexões nem executados testes concorrentes no banco. O índice único impede duas verdadeiras, mas não garante pelo menos uma.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P009:E08](tasks/P009.json), [P009:E35](tasks/P009.json), [P009:E41](tasks/P009.json)

## TRA-005 — Excluir conexão pode esconder falha na GO e apagar o vínculo local

**Prioridade:** P1. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** handleDelete descarta a rejeição de deleteInstance com catch vazio e segue para DELETE em whatsapp_connections. O caminho não fornece confirmação de limpeza do Vault nem prova de ausência da instância na GO.

**Efeito:** A interface pode confirmar exclusão local mesmo com instância remota ainda viva, emitindo webhooks ou ocupando recursos; credencial fica sem ciclo de vida comprovado.

**Limite:** Nenhum DELETE foi executado nesta auditoria. Presença de compensação na criação não comprova o caminho de exclusão solicitado pelo usuário.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P009:E12](tasks/P009.json), [P009:E27](tasks/P009.json), [P009:E50](tasks/P009.json)

## TRA-006 — Renomear ou apagar label do WhatsApp opera globalmente sem a instância

**Prioridade:** P1. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** handleLabelsEdit recebe _instance e a ignora. Gera prefixo wa:<labelId>: e chama RPC de rename/delete global. As versões atuais endurecidas das RPCs exigem autorização, mas o WHERE continua apenas por prefixo, sem whatsapp_connection_id.

**Efeito:** Duas contas WhatsApp com o mesmo labelId compartilham o identificador local. Renomear/apagar numa pode alterar arrays de contatos vinculados à outra. É um bloqueador de isolamento antes de habilitar multi-conexão.

**Limite:** Não se observou incidente vivo e não se executou SQL. O gate multi_connection_enabled pode estar desligado; seu valor não foi consultado. authenticated com require_contact_access/global_admin não foi tratado como grant irrestrito.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P010:12](tasks/P010.json), [P010:38](tasks/P010.json), [P010:39](tasks/P010.json), [P010:43](tasks/P010.json), [P009:E39](tasks/P009.json), [P009:E50](tasks/P009.json)

## TRA-007 — Auditoria de branches confunde erro de git cherry com equivalência

**Prioridade:** P2. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** O workflow calcula n com git cherry 2>/dev/null | grep -c ^+ || true e imprime a branch se n=0. Erro Git sem saída pode resultar em zero; merge commits também não são analisados por git cherry. updatedAt é apresentado como sem push, embora comentários também atualizem a PR.

**Efeito:** A issue automática pode sugerir poda sem evidência suficiente e ocultar PRs sem push que receberam comentários. Ela não deve autorizar exclusão.

**Limite:** Workflow publica diagnóstico e não exclui branches. Nossa auditoria completa usa grafo, patch-id e blobs; nenhum cleanup foi realizado.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P006:E91](tasks/P006.json)

## TRA-008 — Types-sync ainda tem gates e recuperação menos precisos que o plano

**Prioridade:** P2. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** Gate 3 conta linhas removidas (>10) e admite force_gate3; não identifica remoção de objetos/call-sites. Registrar falha comenta sem hash/janela; aprovação de runs filtra head_sha/status sem head_branch. PR é criada com label types-sync, sem habilitação explícita do auto-merge pedido.

**Efeito:** Remoção significativa pode escapar por tamanho, ruído de comentários se repetir e aprovação ser decidida por contexto incompleto. Status combined success não cobre esses checks individualmente.

**Limite:** Nenhum run foi aprovado/disparado nem configuração foi alterada. Proposta de debounce está em PR aberta; não foi tratada como código da main.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P006:E19](tasks/P006.json), [P006:E20](tasks/P006.json), [P006:E21](tasks/P006.json), [P006:E22](tasks/P006.json)

## TRA-009 — Documentação canônica de CI e checkboxes divergem da baseline

**Prioridade:** P2. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** CLAUDE mantém contagem de workflows antiga e instrução histórica para repetir strict:false, enquanto baseline posterior usa strict:true. Há 19 etapas sem checkbox com entrega/alternativa/código já identificado. E62 tem 1.515 linhas depois da extração e E76 tem Playwright 1.63.0 tanto no lock quanto nos três workflows.

**Efeito:** Leitura mecânica gera trabalho duplicado, alteração da política de proteção e falsos achados de versão. 403 administrativo deve permanecer limite de evidência, não confirmação de configuração errada.

**Limite:** 150 testes existentes e cinco guardas CLI passaram, mas main tem DB/sonar failure e E2E logado cancelled. Nenhuma redução automática de proteção é sugerida.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P006:E01](tasks/P006.json), [P006:E11](tasks/P006.json), [P006:E55](tasks/P006.json), [P006:E56](tasks/P006.json), [P006:E62](tasks/P006.json), [P006:E76](tasks/P006.json), [P006:E93](tasks/P006.json), [P006:E95](tasks/P006.json), [P006:E96](tasks/P006.json)

## TRA-010 — Remoção de Etiquetas deixou compatibilidade de rota e resíduos documentais

**Prioridade:** P2. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** TagsView/useTags foram removidos e catálogo não possui as tabelas locais, porém não há redirect explícito view=tags→view=contacts. TagsEmptyState ainda é definido/reexportado; comentário do barril importa useTags e featuresSectionsData lista tags/contact_tags. Cabeçalho do plano ainda diz Nada foi removido ainda.

**Efeito:** Links/favoritos antigos podem cair no fallback de view e o inventário de produto continua ensinando um modelo removido. Regex genérica de contact_tags apagaria também o contrato externo contact_tags_ext indevidamente.

**Limite:** Não foram acessados favoritos reais ou navegador de produção. Ausência do redirect foi verificada na árvore estática; fallback não foi descrito como tela branca comprovada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P010:60](tasks/P010.json), [P010:62](tasks/P010.json), [P010:69](tasks/P010.json), [P010:73](tasks/P010.json), [P010:74](tasks/P010.json), [P010:98](tasks/P010.json), [P010:100](tasks/P010.json)

## TRA-011 — Lista distinta de etiquetas deriva de consulta não paginada a contatos

**Prioridade:** P2. **Origem:** `modules/transversal/findings.json`.

**Conclusão:** useInboxFilterTags e a carga de allTags na busca global executam contacts.select(tags).not(tags,is,null) em uma única requisição sem range/paginação. A unicidade é calculada apenas sobre as linhas retornadas.

**Efeito:** Se o conjunto visível exceder o limite de resposta do endpoint, etiquetas presentes somente nas linhas omitidas não aparecem na seleção/sugestões. A migração eliminou a tabela legada, mas não garante enumeração completa.

**Limite:** Não foi consultado max_rows nem volume vivo sob o usuário; a omissão é condicional ao limite de resposta. Não se declarou incidente observado nem quantidade exata de etiquetas faltantes.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P010:26](tasks/P010.json), [P010:32](tasks/P010.json), [P010:34](tasks/P010.json)

## TM-01 — Prévia não oferece leitura integral nem mensagens anteriores antes do aceite

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** TalkMeCard e TalkMeQueueCard exibem messagePreview em line-clamp-2. O tipo/RPC contém somente a última mensagem; não há controle ler mais nem consulta de histórico neste módulo. O relatório agrupa as etapas de prévia como concluídas, mas as partes de expansão e mensagens anteriores não estão materializadas.

**Efeito:** Atendente precisa decidir com um resumo truncado, embora o plano tenha exigido ler a mensagem completa sem assumir o atendimento.

**Limite:** Inspeção estática; não houve sessão visual atual. Mídia por rótulo é decisão já documentada e está classificada SUPERSEDED, não como player quebrado.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P032:025](tasks/P032.json), [P032:037](tasks/P032.json), [P032:046](tasks/P032.json), [P032:074](tasks/P032.json)

## TM-02 — Resposta incerta de claim não tem recuperação específica e offline não desabilita o CTA

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** O servidor é idempotente para o vencedor, mas o cliente trata erro do RPC como falha genérica. Não foi localizado estado outcome-unknown, consulta de confirmação após resposta perdida nem guarda de conectividade no CTA/hook. Polling e retorno à aba reconsultam a fila, que já exclui contato atribuído, e não equivalem a confirmar o resultado do claim.

**Efeito:** Uma atribuição concluída no servidor com resposta perdida pode ser apresentada como falha, sem caminho dedicado de descoberta. O clique offline segue até a falha de rede.

**Limite:** Não foi induzido timeout real nem executado SQL; o achado é diferença de contrato cliente/aceite, sem alegar que houve atribuição incorreta em produção. Falha de abertura do chat após sucesso já é tratada separadamente.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P032:053](tasks/P032.json), [P032:060](tasks/P032.json), [P032:078](tasks/P032.json)

## TM-03 — Fechamento 50/50 trata build publicado como revisão visual autenticada

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** A etapa 049 exige revisão autenticada do layout publicado e rejeita version.json/HTTP200 isolado como prova. O relatório declara essa etapa concluída pelo deploy/buildId e explicita que SSO impediu o preview; a aparência foi verificada localmente com fixtures.

**Efeito:** O consolidado pode apresentar homologação online que não foi comprovada pelas próprias fontes de fechamento.

**Limite:** Não houve tentativa de autenticação nesta auditoria. A publicação histórica por buildId é válida no seu alcance e não está sendo negada.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P029:049](tasks/P029.json), [P029:050](tasks/P029.json), [P032:090](tasks/P032.json), [P032:094](tasks/P032.json), [P032:095](tasks/P032.json), [P032:100](tasks/P032.json)

## TM-04 — Baseline, piloto e observabilidade não sustentam fechamento operacional completo

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** Os documentos trazem uma amostra de 33 itens/2,3 ms, navegação sintética de 500 itens e uma faixa 091–100 descrita como registro durante publicação. Não documentam p95 de leitura/claim, série de operação, público/aceite de piloto, janela de observação ou homologação nominal.

**Efeito:** Confundir código entregue com operação validada esconde aceites humanos e medições que ainda não têm evidência individual.

**Limite:** Busca delimitada às fontes do módulo, inventário de PRs e código. Ausência documental não prova que pessoas nunca usaram o recurso.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P032:018](tasks/P032.json), [P032:049](tasks/P032.json), [P032:088](tasks/P032.json), [P032:090](tasks/P032.json), [P032:096](tasks/P032.json), [P032:097](tasks/P032.json), [P032:099](tasks/P032.json), [P032:100](tasks/P032.json), [P029:041](tasks/P029.json), [P029:050](tasks/P029.json)

## TM-05 — E2E específico e artefatos visuais não ficaram rastreáveis no fechamento

**Prioridade:** P3. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** Existem testes duráveis de componente/hook/SQL e relatos de navegadores locais. Não foi localizado spec E2E Talk Me dedicado, pacote antes/depois/vídeo ou storyboard que cubra todas as entregas exigidas. Playwright auth 18/18 é uma evidência distinta do fluxo de fila/claim completo.

**Efeito:** Auditoria futura pode repetir trabalho ou tratar uma rodada de autenticação como prova de navegação, paginação, aceite e preservação do Inbox.

**Limite:** Não se afirma que a sessão local de navegador não aconteceu; a falta é de artefato durável e cobertura específica demonstrável no baseline.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P032:040](tasks/P032.json), [P032:085](tasks/P032.json), [P032:100](tasks/P032.json), [P029:003](tasks/P029.json), [P029:004](tasks/P029.json), [P029:005](tasks/P029.json), [P029:044](tasks/P029.json), [P029:045](tasks/P029.json), [P029:050](tasks/P029.json)

## VOL-01 — Play nativo cria AudioContext sem caminho de liberação

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** bindMediaVolume registra um handler de play que chama getMediaAudioContext antes de apply. Quando o volume nativo funciona, applyMediaVolumeGain retorna sem criar GainNode. releaseMediaElement sai se não encontra GainNode, deixando o contexto singleton retido até a página terminar.

**Efeito:** Um contexto desnecessário permanece por sessão/instância do módulo. Não foi medido impacto de bateria nem atingimento do limite de contextos; a ausência de cleanup contradiz o contrato E10.

**Limite:** Probe usa DOM/WebAudio simulados e não comprova áudio de iOS nem uso de recursos medido em navegador real.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P042:E08](tasks/P042.json), [P042:E10](tasks/P042.json)

## VOL-02 — Player atual de gravação de Telefonia ficou fora do volume global

**Prioridade:** P1. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** TelefoniaView mantém uma ref órfã e chamada ao hook. O áudio efetivo agora nasce em RecordingPlayer sem ref nem hook. A cadeia real passa de TelefoniaView para SelectedCallPanel e RecordingPlayer; o contrato textual continua verde porque busca o nome do hook no shell.

**Efeito:** Quando uma gravação disponível retorna URL, seu <audio> não recebe ganho/mute do store e pode reproduzir independentemente de a mídia estar muda. Não foi consultada produção para confirmar existência de gravações.

**Limite:** O caminho é condicional a recording_status=available e uma URL retornada; análise estática e de histórico, sem chamada externa nem audição real.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P042:E35](tasks/P042.json), [P042:E37](tasks/P042.json)

## VOL-03 — Contraste abaixo da régua foi aceito ao restaurar a skin azul

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** O plano registrou seis pares reprovados. A correção global #1435 foi revertida explicitamente no #1458; a precedência do alto contraste corrigida no #1416 permanece ativa.

**Efeito:** 50/50 no plano significa execução encerrada, não todos os pares AA aprovados. É risco aceito, com decisão de aparência explícita.

**Limite:** Os valores numéricos da seção 7.2 são históricos; não foram recalculados em DOM atual nesta auditoria.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P042:E18](tasks/P042.json)

## VOL-04 — Fallback de vídeo em iOS e matriz física continuam sem prova

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** Os probes exercitam APIs simuladas. VideoFullscreen ainda monta vídeo sem crossOrigin e playsInline, e os checks de suporte verificam construtor/volume nativo, não a viabilidade audível de cada URL. O checklist admite que Safari iOS e outras condições dependem de aparelho.

**Efeito:** A aplicação real de ganho em vídeo no fallback e a permanência dos controles do app no iOS não estão estabelecidas. Não se declara que o áudio falhou em um aparelho específico.

**Limite:** Sem navegador/aparelho real nesta subauditoria. A antiga alegação de contexto criado no mount foi superada; não é usada como achado atual.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P042:E09](tasks/P042.json), [P042:E21](tasks/P042.json), [P042:E23](tasks/P042.json), [P042:E24](tasks/P042.json), [P042:E26](tasks/P042.json), [P042:E46](tasks/P042.json)

## VOL-05 — E2E publicado comprova controles e persistência, com exceção de áudio aceita

**Prioridade:** P3. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** O spec que passou depois do merge mede slider, persistência, mute e aria-label do botão de alertas. O caso que mede <audio>.volume está fixme e não há caso de vídeo/audição do alerta. A prova audiovisual ampla do texto original não é equivalente à prova de UI registrada no fechamento.

**Efeito:** Não se deve promover um run de UI a prova de playback real nem reabrir o seed recusado. A conclusão 50/50 precisa manter essas qualificações.

**Limite:** O run 36882291819 foi lido como registro histórico no plano; não foi reexecutado nem reconsultado nesta subauditoria.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P042:E45](tasks/P042.json), [P042:E46](tasks/P042.json), [P042:E49](tasks/P042.json)

## VOL-06 — Encerramento E50 não comprova exclusão imediata da branch final

**Prioridade:** P3. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** O plano registra branch hermes/plano-volume-50-etapas-finalizacao-2610011018e48d e merge #1395. A ref remota local com esse nome permanece no snapshot auditado.

**Efeito:** Resíduo Git a reconciliar no inventário global. Não altera o funcionamento do volume e não autoriza remoção nesta auditoria.

**Limite:** Ref local pode estar desatualizada; não equivale a consulta ao estado remoto atual.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P042:E50](tasks/P042.json)

## SK01 — Autosave marca como salvo o estado que a gravação por quota rejeitou

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** updateConfig chama saveThemeConfig(next) e setSavedConfig(next) sem verificar o booleano. Sob quota, o estado em tela difere do storage mas hasUnsavedChanges retorna false; applyPreset emite somente sucesso. O handler Salvar trata false corretamente, o que não corrige o caminho de autosave.

**Efeito:** O usuário perde a sinalização de alterações não salvas e pode perder a skin/raio após recarregar.

**Limite:** O probe usa estado síncrono em memória e não mede renderização, batching React ou uma falha de armazenamento em navegador real. Não há incidente de usuário observado.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P031:42](tasks/P031.json), [P031:43](tasks/P031.json), [P031:85](tasks/P031.json)

## SK02 — Formato JSON null no storage faz loadThemeConfig lançar em vez de recuperar

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** readStored faz cast do resultado de JSON.parse sem validar se é objeto não nulo. Quando a chave theme-custom-colors contém o texto null, o parse não lança, mas stored.v em loadThemeConfig lança TypeError. Initializer e o estado inicial do hook chamam essa função sem captura própria.

**Efeito:** Uma preferência local com formato incompatível pode interromper a inicialização do tema ou a montagem da página de Skins; o fallback para corporate não é alcançado nesse formato.

**Limite:** Não há prova de que o escritor normal gere null nem de ocorrência em produção. Trata-se de robustez diante de estado local incompatível; JSON null é sintaticamente válido.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P031:20](tasks/P031.json), [P031:32](tasks/P031.json), [P031:70](tasks/P031.json)

## SK03 — Checkpoints técnicos marcados coexistem com gates visuais e globais não demonstrados

**Prioridade:** P2. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** O ledger é honesto sobre login, ausência de screenshots, CP8/CP9 bloqueados e produção não verificada. Porém CP0/4/5/6/10/11 marcados não podem ser contados como cumprimento de cada gate: falta o antes exigido, prova visual e suíte inteira adiada. A aceitação funcional também tem falha atual SK01.

**Efeito:** Somar marcadores ou o merge produziria um total artificial de 100 concluídas e ocultaria o que foi realmente testado.

**Limite:** A auditoria não tentou autenticar nem consultar a Vercel; bloqueio histórico não é diagnóstico de disponibilidade atual.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P031:8](tasks/P031.json), [P031:30](tasks/P031.json), [P031:51](tasks/P031.json), [P031:54](tasks/P031.json), [P031:57](tasks/P031.json), [P031:61](tasks/P031.json), [P031:62](tasks/P031.json), [P031:75](tasks/P031.json), [P031:76](tasks/P031.json), [P031:77](tasks/P031.json), [P031:78](tasks/P031.json), [P031:79](tasks/P031.json), [P031:80](tasks/P031.json), [P031:81](tasks/P031.json), [P031:82](tasks/P031.json), [P031:83](tasks/P031.json), [P031:84](tasks/P031.json), [P031:86](tasks/P031.json), [P031:87](tasks/P031.json), [P031:88](tasks/P031.json), [P031:89](tasks/P031.json), [P031:90](tasks/P031.json), [P031:91](tasks/P031.json), [P031:96](tasks/P031.json), [P031:99](tasks/P031.json), [P031:100](tasks/P031.json)

## SK04 — Contraste: correções de precedência sobrevivem, ajuste global AA foi revertido por decisão

**Prioridade:** P4. **Origem:** `modules/secondary/findings.json`.

**Conclusão:** #1416 corrigiu a disputa entre cor inline e high-contrast; #1847 acrescentou resposta à preferência do sistema. #1435 alterou luminosidades globais para AA e foi revertido deliberadamente por #1458 para restaurar o azul corporate, aceitando na época a reabertura de seis pares. #1533 ajustou depois muted-foreground claro em ambos os espelhos.

**Efeito:** A exigência de 76 pares sólidos ≥3:1 da etapa 68 continua passando, mas isso não certifica todas as composições AA. Reaplicar #1435 sem decisão nova desfaria uma preferência explícita.

**Limite:** Nenhum dos seis pares compostos históricos foi reamostrado em pixels nesta auditoria; alterações posteriores podem mudar valores individuais.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P031:21](tasks/P031.json), [P031:26](tasks/P031.json), [P031:64](tasks/P031.json), [P031:68](tasks/P031.json), [P031:69](tasks/P031.json)

## SV-001 — Compras não informa que o resumo conta somente compras concluídas

**Prioridade:** P2. **Origem:** `modules/salesview/findings.json`.

**Conclusão:** CommercialSummaryStrip renderiza Compras (n), mas aggregateCrm360 inclui apenas approved/completed. O plano exigiu explicitamente Compras concluídas e um teste com compra pending; o teste atual consolida o rótulo incompleto.

**Efeito:** Novo registro pending aparece na lista e no badge sem aumentar esse tile, com semântica não explicada ao operador.

**Limite:** Não houve escrita de compras nem leitura viva; o gap é de semântica explícita entre código e requisito.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P030:S14](tasks/P030.json), [P030:S18](tasks/P030.json)

## SV-002 — Journey apresenta uma amostra de tempo médio como histórico completo

**Prioridade:** P2. **Origem:** `modules/salesview/findings.json`.

**Conclusão:** O título da faixa diz Desde o início do relacionamento e o subtítulo do tempo médio diz apenas Resposta ao cliente. fetchStats ainda lê as 200 primeiras mensagens. A revisão do plano pediu Independe do período abaixo e identificação dessa amostra.

**Efeito:** O operador pode interpretar a média amostral como média do relacionamento inteiro; o escopo do número continua oculto.

**Limite:** A antiga contagem de dias e os percentuais inventados foram superados por #1640. Este achado é somente a amostra ainda usada para tempo médio.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P030:S24](tasks/P030.json), [P030:S26](tasks/P030.json), [P030:S27](tasks/P030.json)

## SV-003 — Matriz visual tem estado cheio duplicado do vazio e faltam referências

**Prioridade:** P2. **Origem:** `modules/salesview/findings.json`.

**Conclusão:** 02-salesview-vazio.png e 03-salesview-cheio.png têm SHA256 idêntico. Os arquivos 00-antes-barra.png e 00-antes-sidebar.png não existem. O próprio relatório admite ausência do par escuro e uso de capturas Journey com erro.

**Efeito:** A quantidade de PNGs não demonstra os estados exigidos; o placar fechado excede a prova visual.

**Limite:** A comparação binária foi executada localmente; nenhuma imagem foi alterada e nenhuma captura nova de produção foi feita.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P030:S20](tasks/P030.json), [P030:S38](tasks/P030.json), [P030:S42](tasks/P030.json)

## SV-004 — Placar e instruções mantêm estados anteriores aos sucessores

**Prioridade:** P3. **Origem:** `modules/salesview/findings.json`.

**Conclusão:** O cabeçalho ainda diz nenhuma etapa executada; o placar agrupa cinco fases em vez das 50 linhas pedidas. Apêndices preservam Journey 404, aba não restaurada e alto-contraste sem controle, apesar de #1797, #1807, #1829 e #1847. #1640 também tornou reais os percentuais cuja proibição literal continua na documentação.

**Efeito:** Reexecução baseada só no plano pode duplicar trabalho corrigido ou remover funcionalidade legítima.

**Limite:** A presença dos consertos no baseline foi conferida. Não se afirma que todos os deploys e sessões atuais estejam sem erros.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P030:S25](tasks/P030.json), [P030:S41](tasks/P030.json), [P030:S43](tasks/P030.json), [P030:S46](tasks/P030.json), [P030:S47](tasks/P030.json), [P030:S50](tasks/P030.json)

## LT-TYPE-01 — Revisão de fontes ainda descreve PRs abertas e gráficos pendentes já resolvidos

**Prioridade:** P3. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** #590/#593/#595/#596/#611/#801/#1428 estão mergeadas. Relato47% e fila de branches são históricos.

**Limite:** Reconciliação documental; não é bug de runtime nem nova medição visual.

**Limite:** Reconciliação documental; não é bug de runtime nem nova medição visual.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P048:8](tasks/P048.json), [P048:21](tasks/P048.json), [P048:62](tasks/P048.json), [P048:95](tasks/P048.json), [P048:98](tasks/P048.json)

## LT-TYPE-02 — Família literal no screen protection escapa do guard de tipografia

**Prioridade:** P2. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** HTML injetado usa font-family:system-ui; scanner CSS só captura família entre aspas e scanner TS procura fontFamily. Fixture real confirmou0 achados.

**Limite:** Prova de fonte fora do token e de cobertura incompleta; não se inferiu quebra de segurança do screen protection.

**Limite:** Prova de fonte fora do token e de cobertura incompleta; não se inferiu quebra de segurança do screen protection.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P048:64](tasks/P048.json), [P048:88](tasks/P048.json)

## LT-TYPE-03 — Scanner de pesos aceita pesos intermediários ausentes em listas estáticas

**Prioridade:** P2. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** min/max da lista300/400/500/600/700 inclui450 apesar de não estar carregado; probe confirma0 achados.

**Limite:** Limitação explicitada no teste existente. URL atual usa variável; não afirmar peso renderizado atual incorreto.

**Limite:** Limitação explicitada no teste existente. URL atual usa variável; não afirmar peso renderizado atual incorreto.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P048:89](tasks/P048.json)

## LT-TYPE-04 — Densidade está ativa, mas token de tamanho do texto continua sem consumidor

**Prioridade:** P2. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** useDensity seta data-density e há consumidores de espaçamento/lista. --density-text-size permanece declarado3 vezes e consumido0.

**Limite:** Refuta diagnóstico histórico de sistema inteiro morto; não transforma modo de densidade em obrigação nova de mudar todas as fontes.

**Limite:** Refuta diagnóstico histórico de sistema inteiro morto; não transforma modo de densidade em obrigação nova de mudar todas as fontes.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P048:72](tasks/P048.json)

## LT-TYPE-05 — Contatos exige reconciliação entre decisão Navy e header visual removido

**Prioridade:** P2. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** Plano50 encerrado; D3=Navy aprovado. #1262 removeu header visual;38px continua no componente compartilhado, não no header visível de ContactsView.

**Limite:** Não reintroduzir reduções antigas nem recriar o header por leitura isolada dos tokens.

**Limite:** Não reintroduzir reduções antigas nem recriar o header por leitura isolada dos tokens.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P048:33](tasks/P048.json), [P048:34](tasks/P048.json), [P017:19](tasks/P017.json), [P017:22](tasks/P017.json)

## LT-LAYOUT-01 — Padding de TalkX e Multiplix soma-se ao padding do ViewContainer

**Prioridade:** P2. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** TalkX recebe gutter compacto e p3/4/6 próprio; Multiplix recebe gutter padrão e p6 próprio. Diverge do dono único de padding.

**Limite:** Soma CSS confirmada; viewport e julgamento estético não foram medidos. Números antigos de gutter foram alterados por decisões posteriores.

**Limite:** Soma CSS confirmada; viewport e julgamento estético não foram medidos. Números antigos de gutter foram alterados por decisões posteriores.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P017:7](tasks/P017.json), [P017:9](tasks/P017.json), [P017:27](tasks/P017.json)

## LT-LAYOUT-02 — Dois dos cinco apontamentos do layoutguard são limitações de análise

**Prioridade:** P2. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** VoIPPanel reexporta TelefoniaView; raiz real w-full/min-w-0. Regex h-full captura substring min-h-full em TalkX. Probes reais confirmam ambos.

**Limite:** O exit1 é real; não equivale a cinco bugs visuais. TasksModule semw-full não foi promovido a bug de sizing sem DOM.

**Limite:** O exit1 é real; não equivale a cinco bugs visuais. TasksModule semw-full não foi promovido a bug de sizing sem DOM.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P017:6](tasks/P017.json), [P017:27](tasks/P017.json)

## LT-LAYOUT-03 — Teste de largura verifica overflow, não faixa morta nem ocupação do main

**Prioridade:** P2. **Origem:** `modules/layout_type/findings.json`.

**Conclusão:** Script mede document.scrollWidth vs innerWidth a1280x800; não compara conteúdo vs main a1920x1080. Conteúdo menor pode passar sem preencher.

**Limite:** Contraprova lógica do predicado; não afirma que o bug visual original persista em produção.

**Limite:** Contraprova lógica do predicado; não afirma que o bug visual original persista em produção.

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P017:28](tasks/P017.json), [P017:29](tasks/P017.json), [P017:30](tasks/P017.json)

## TC-001 — Fluxo de mídia usa três contratos incompatíveis entre storage, mensagem e renderização

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** Áudio é enviado para cid/arquivo, enquanto INSERT no storage exige o primeiro segmento igual a current_profile_id(). O hook grava bucket/path/type sem media_url, contrariando CHECKs da mensagem. O Panel ativo só renderiza mídia se media_url existe. Upload de arquivo e colagem usam profile.id/cid, mas persistem URL legada sem os locators exigidos pela policy mais recente de leitura.

**Efeito:** Áudio e anexos de membros comuns podem falhar em etapas independentes; mesmo uma linha com locators válidos fica invisível no renderer ativo. SELECT/DELETE ainda usam auth.uid no segmento de proprietário quando a convenção é profiles.id.

**Limite:** ["Não é correto inferir exposição pública por getPublicUrl: o helper global reconhece URLs legadas de buckets privados e as assina.", "Os pontos de falha são deduzidos do código e DDL; não houve upload real nesta auditoria."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F06](tasks/P011.json), [P011:F07](tasks/P011.json), [P011:F56](tasks/P011.json), [P011:F57](tasks/P011.json), [P047:TC-12](tasks/P047.json), [P047:TC-23](tasks/P047.json), [P047:TC-24](tasks/P047.json), [P047:TC-50](tasks/P047.json), [P047:TC-51](tasks/P047.json)

## TC-002 — RPC ativa de conversa direta perdeu a proteção contra criação concorrente

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** A migration29190000 substitui a RPC que preenchia o par ordenado e usava ON CONFLICT por SELECT seguido de INSERT apenas(type,created_by). O par direct_member_a/b fica NULL e o índice do par deixa de arbitrar duas inserções concorrentes.

**Efeito:** Duas requisições simultâneas podem criar conversas diretas duplicadas; o front ativo chama essa RPC.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F29](tasks/P011.json), [P047:TC-25](tasks/P047.json)

## TC-003 — Membership não protege bootstrap e último owner; grants de conversa continuam amplos

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** Insert de membership exige membro prévio ou profiles.role admin, impedindo o bootstrap normal de um grupo criado em duas requests. A policy DELETE permite saída própria sem guarda de último owner. Não exige member_role=member no INSERT. REVOKEs de colunas de team_conversations coexistem com grant UPDATE na tabela inteira.

**Efeito:** Criação de grupo por agente pode deixar conversa órfã após falha na segunda request; papéis e identidade da conversa não têm todas as invariantes anunciadas pelo plano.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F11](tasks/P011.json), [P011:F12](tasks/P011.json), [P011:F29](tasks/P011.json), [P011:F46](tasks/P011.json), [P011:F58](tasks/P011.json), [P047:TC-20](tasks/P047.json), [P047:TC-22](tasks/P047.json), [P047:TC-25](tasks/P047.json), [P047:TC-38](tasks/P047.json), [P047:TC-52](tasks/P047.json)

## TC-004 — RPCs de saída e remoção referem uma coluna role inexistente

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** A última definição de leave_team_group e remove_team_member usa tcm.role e SET role. O catálogo e tipos possuem apenas member_role.

**Efeito:** Essas RPCs não entregam a promoção e remoção anunciadas; a falha é latente no front atual, que ainda executa DELETE direto.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F46](tasks/P011.json), [P047:TC-38](tasks/P047.json)

## TC-005 — Gerenciamento de departamento está inacessível e contém contratos de banco inválidos

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** TeamChatView não passa canManageDepartments; o único setter do diálogo depende dessa prop. Se integrado, os hooks ainda chamam credenciais service_role-only, escrevem tabela inexistente sob ts-expect-error, usam convites legados e gravam auditoria diretamente com auth user.id.

**Efeito:** Hoje o usuário não alcança essa gestão pela interface. Ligar apenas o botão exporia fluxos que falham; nenhum vazamento ativo de credenciais foi demonstrado.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F62](tasks/P011.json), [P011:F70](tasks/P011.json), [P011:F76](tasks/P011.json), [P011:F77](tasks/P011.json), [P011:F81](tasks/P011.json), [P047:TC-63](tasks/P047.json), [P047:TC-69](tasks/P047.json), [P047:TC-70](tasks/P047.json), [P047:TC-71](tasks/P047.json), [P047:TC-73](tasks/P047.json)

## TC-006 — Paginação, reações e ticks existem parcialmente fora do Panel ativo

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** O hook carrega200 mensagens; fetchOlderMessages não está ligado ao scroll. TeamMessageItem/Wrapper/parts não são usados pelo Panel, que mantém markup inline. O cursor SQL corrigido por#1266 continua baseado só em created_at, sem desempate de id.

**Efeito:** Mensagens antigas podem ficar inacessíveis; timestamps empatados podem ser pulados na futura adoção do RPC; consultas de reação existem sem reação e recibo integrados no renderer principal.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F39](tasks/P011.json), [P011:F54](tasks/P011.json), [P011:F59](tasks/P011.json), [P011:F60](tasks/P011.json), [P011:F64](tasks/P011.json), [P011:F68](tasks/P011.json), [P047:TC-32](tasks/P047.json), [P047:TC-48](tasks/P047.json), [P047:TC-53](tasks/P047.json), [P047:TC-54](tasks/P047.json), [P047:TC-57](tasks/P047.json), [P047:TC-61](tasks/P047.json)

## TC-007 — Mute é lido e escrito em locais diferentes e notificações só funcionam com a view montada

**Prioridade:** P2. **Origem:** `code/findings.json`.

**Conclusão:** Panel lê user_settings.muted_conversations, enquanto useMuteConversation altera team_conversation_members.is_muted. O listener de notificações é chamado apenas em TeamChatView e não existe badge global do inbox Team Chat.

**Efeito:** Estado exibido de mute pode não refletir o banco; notificações e badges esperados com módulo fechado não estão implementados.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F55](tasks/P011.json), [P011:F66](tasks/P011.json), [P011:F83](tasks/P011.json), [P011:F84](tasks/P011.json), [P047:TC-49](tasks/P047.json), [P047:TC-59](tasks/P047.json), [P047:TC-76](tasks/P047.json), [P047:TC-77](tasks/P047.json)

## TC-008 — Contrato de convites e vocabulário de auditoria permanecem legados

**Prioridade:** P2. **Origem:** `code/findings.json`.

**Conclusão:** RPC create usa assinatura antiga, código12 caracteres de base64 e profiles.role; accept usa status used e não valida already_member/e-mail. Audit CHECK possui12 verbos antigos e RPCs registram o código em details. O front continua na tabela department_invites e seus grants authenticated de escrita persistem.

**Efeito:** Código novo de oito caracteres, limite de uso, revogação e auditoria não estão alinhados. Remover tabela ou funções agora quebraria consumidores ativos.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F09](tasks/P011.json), [P011:F15](tasks/P011.json), [P011:F16](tasks/P011.json), [P011:F17](tasks/P011.json), [P011:F35](tasks/P011.json), [P011:F76](tasks/P011.json), [P011:F78](tasks/P011.json), [P047:TC-17](tasks/P047.json), [P047:TC-18](tasks/P047.json), [P047:TC-19](tasks/P047.json), [P047:TC-28](tasks/P047.json), [P047:TC-71](tasks/P047.json), [P047:TC-74](tasks/P047.json)

## TC-009 — Recibos e reações não forçam conversation_id derivado da mensagem

**Prioridade:** P2. **Origem:** `code/findings.json`.

**Conclusão:** O trigger de receipts só preenche cid NULL no INSERT. Não corrige cid não nulo incorreto nem UPDATE de message_id. A reação não tem trigger equivalente;#1265 corrigiu membership e cid da RPC, mas não o contrato do INSERT direto.

**Efeito:** Linhas permitidas pela mensagem podem carregar cid inconsistente, quebrando agregações e filtros de realtime; não foi demonstrado acesso a conteúdo de outra conversa.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F18](tasks/P011.json), [P011:F32](tasks/P011.json), [P011:F40](tasks/P011.json), [P047:TC-11](tasks/P047.json), [P047:TC-26](tasks/P047.json), [P047:TC-27](tasks/P047.json), [P047:TC-33](tasks/P047.json)

## TC-010 — Marcação de leitura e envio podem perder estado após erro silencioso

**Prioridade:** P2. **Origem:** `code/findings.json`.

**Conclusão:** useTeamMessages marca a referência local antes de concluir upserts e ignora o resultado dos writes de receipts e last_read_at. O envio textual limpa text e reply antes de await, sem restaurar no erro.

**Efeito:** Falha de rede ou autorização pode aparentar leitura salva ou perder o rascunho do usuário sem recuperação automática.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F55](tasks/P011.json), [P011:F61](tasks/P011.json), [P047:TC-49](tasks/P047.json), [P047:TC-55](tasks/P047.json)

## TC-011 — 271 asserts tautológicos não validam Team Chat e os testes de RLS simulam schema fictício

**Prioridade:** P2. **Origem:** `code/findings.json`.

**Conclusão:** Há219 asserts true===true em comprehensive e52 em security-gaps. rls-contract.test.ts compara fixtures em memória com campos que não representam o schema real. Há harnesses SQL úteis, mas parciais; não há spec E2E Team Chat.

**Efeito:** Quantidade de testes e CI verde podem superestimar cobertura e esconder os defeitos de integração detectados.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F21](tasks/P011.json), [P011:F89](tasks/P011.json), [P011:F90](tasks/P011.json), [P011:F91](tasks/P011.json), [P011:F94](tasks/P011.json), [P047:TC-09](tasks/P047.json), [P047:TC-83](tasks/P047.json), [P047:TC-84](tasks/P047.json), [P047:TC-85](tasks/P047.json), [P047:TC-88](tasks/P047.json), [P047:TC-89](tasks/P047.json), [P047:TC-92](tasks/P047.json)

## TC-012 — Validator legado possui contratos incorretos e sucesso falso para respostas de erro

**Prioridade:** P2. **Origem:** `code/findings.json`.

**Conclusão:** scripts/team-chat-db-validate.mjs consulta team_members e department_invites.token e chama accept com p_token. Seu check de RPC aceita qualquer resposta diferente de404, incluindo erros de autenticação e servidor. O arquivo possui um consumidor real no teste de sanitização de logs.

**Efeito:** Pode reportar validação satisfatória sem validar o banco; executar seu POST com credenciais privilegiadas não é uma simples leitura. Não deve ser considerado script morto só por ausência de import em src.

**Limite:** ["Script não foi executado; foi lido e sua dependência em teste foi confirmada."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F92](tasks/P011.json), [P047:TC-86](tasks/P047.json)

## TC-013 — Dois planos de finalização coexistem sem autoridade reconciliada e contêm contratos divergentes

**Prioridade:** P2. **Origem:** `code/findings.json`.

**Conclusão:** F100, da PR1171, se declara o único ledger vivo. TC 100, da PR1174, foi commitado114 segundos depois e substitui apenas planos E anteriores. Não resolve a coexistência com F100 e diverge em RPC de WhatsApp, retorno de reação e rota da PR1151. Ambos possuem cem caixas abertas e placeholders. Há referências internas incorretas e decisão de publication desatualizada no F.

**Efeito:** Reexecutar o texto literalmente pode repetir ações históricas, remover consumidores de realtime ou atribuir conclusões sem evidência atual.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F01](tasks/P011.json), [P011:F03](tasks/P011.json), [P011:F04](tasks/P011.json), [P011:F05](tasks/P011.json), [P011:F24](tasks/P011.json), [P011:F49](tasks/P011.json), [P011:F98](tasks/P011.json), [P011:F100](tasks/P011.json), [P047:TC-01](tasks/P047.json), [P047:TC-04](tasks/P047.json), [P047:TC-05](tasks/P047.json), [P047:TC-06](tasks/P047.json), [P047:TC-08](tasks/P047.json), [P047:TC-82](tasks/P047.json), [P047:TC-92](tasks/P047.json), [P047:TC-97](tasks/P047.json), [P047:TC-98](tasks/P047.json), [P047:TC-99](tasks/P047.json), [P047:TC-100](tasks/P047.json)

## TC-014 — Branch em quarentena contém substituição incompatível das guardas globais

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** A branch confident-babbage troca o teste isolado de runtime por psql DESTINO_URL que retorna SKIP com exit0 após falha de conexão. Também troca schema_version/project_ref/tables da baseline global por team_chat_tables com cinco objetos.

**Efeito:** Merge integral dessa branch poderia enfraquecer a validação global e tornar falha de conexão um resultado aprovado. Conteúdo funcional inédito não autoriza importar essas alterações.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F49](tasks/P011.json)

## TC-015 — Implementações exclusivas da branch não são substitutos prontos dos contratos atuais

**Prioridade:** P1. **Origem:** `code/findings.json`.

**Conclusão:** Na branch, paginação usa o primeiro id de uma página DESC como cursor, ocasionando sobreposição; read state compara UUIDs lexicalmente e não comprova todos os membros. Hooks de departamento passam assinatura errada para RPC de segredos. Tipos manuais declaram role quando DB usa member_role.

**Efeito:** A branch contém trabalho aproveitável, mas importar os arquivos em bloco criaria regressões. Seu atraso de687 commits exige revisão de compatibilidade também em AppShell, Sidebar e types.ts.

**Limite:** ["Conclusão estática no commit fixado; nenhuma chamada ou exploração do banco de produção."]

O registro JSON preserva os trechos, fontes, reprodução e aceites específicos. Referências canônicas:

[P011:F39](tasks/P011.json), [P011:F46](tasks/P011.json), [P011:F51](tasks/P011.json), [P011:F54](tasks/P011.json), [P011:F60](tasks/P011.json), [P011:F62](tasks/P011.json), [P047:TC-32](tasks/P047.json), [P047:TC-38](tasks/P047.json), [P047:TC-46](tasks/P047.json), [P047:TC-48](tasks/P047.json), [P047:TC-54](tasks/P047.json), [P047:TC-69](tasks/P047.json)
