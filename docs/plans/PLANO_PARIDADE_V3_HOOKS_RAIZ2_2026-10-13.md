# Paridade V3 → V2: hooks da raiz, doc 24 (`24-hooks-raiz-2.md`), SEGUNDA PASSADA (13/10/2026)

> **Fonte:** `docs/estado/24-hooks-raiz-2.md` da V3 (59 hooks: contato, dashboard, e-mail/Gmail, Evolution, APIs externas, metas, grupos; retrato de 09/08, o código real da V3 manda). **Método:** o doc já tinha sido tocado pela rodada PE (12/10) e por outras frentes (378 cartões de paridade existentes, listados para os agentes). Três agentes de leitura (contato/dashboard/metas/grupos, e-mail/Gmail, Evolution/APIs externas/segurança) compararam o CÓDIGO da V3 com a branch viva da V2 comportamento a comportamento e listaram só o que não tinha cartão. O Claude conferiu os achados P0/P1 no código e nas migrations antes de criar cada cartão: **um achado P0 foi corrigido na conferência** (ver PM-01).

**Resultado:** 43 cartões novos (PM-01..PM-47): 1 P0, 18 P1, 24 P2, todos criados e delegados ao especialista da área, com dependências explícitas por arquivo (sem corrida) e por cartão existente.

## O que a segunda passada achou de mais grave
- **PM-01 (P0):** o atendente grava no PRÓPRIO perfil `can_download` (o bloqueio de download, gate de LGPD), `max_chats`, `department_id` e `session_invalidated_at`. A política restritiva já protege `role`, `access_level`, `permissions` e `is_active`; o relatório do agente dizia que `is_active` também estava aberto, e a conferência nas migrations mostrou que não.
- **PM-30 (P1):** a V2 ainda tem 'Exportar CSV' do histórico de envios do catálogo (com nome do contato e do atendente) e 'Exportar JSON' do desempenho da equipe, contra a regra do dono (EX1/EX2 não os cobrem).
- **PM-31..33 (P1):** o bloqueio geográfico pode trancar a empresa inteira com um clique (whitelist vazia ou país ausente nega todos, inclusive o admin, e o login também passa pela política).
- **PM-34 (P1):** ações de leitura da Evolution sem nenhum chamador (`get-openai`, `get-pusher`, `find-*`, `check-numbers`...) estão abertas a qualquer usuário logado e podem devolver chaves de integração; `check-numbers` sem teto de lista.
- **PM-20..24 (P1, e-mail):** a lixeira de mensagem não atualiza o banco; ações de e-mail falham em silêncio e a desconexão parcial é anunciada como sucesso; token recusado é tentado a cada 5 min para sempre (4 cópias do refresh); o sync só traz `in:inbox`, então as pastas do PE-44 abririam vazias.
- **PM-02/03 (P1):** os limites de fila (50/75/100 %) não alertam em segundo plano e a 'taxa de atribuição' do painel é uma fórmula inventada.
- **PM-04, PM-05, PM-07, PM-08 (P1):** grupos do WhatsApp só sincronizam no clique; o seletor de encaminhar corta em 1.000 contatos e oferece contato apagado; metas pessoais travam em 1.000 e repetem a conquista a cada recarga; 'enviar para N grupos' roda no navegador, fora da fila.

## Achados do doc que NÃO existem na V2 (conferido)
A1 e A8 (e-mail duplicado e nome de arquivo ≠ export): a V2 tem um só hook (`useGmail.ts`) e os nomes batem; A4, A5 e A9 não existem como defeito; A6 só se aplica ao nome do arquivo; A7 (simulação por localStorage) não existe; A2 está corrigido na V3 e a V2 tem outra função; A3 (`useDashboardDataBatch` órfão) é usado na V3. `useExportData` e `useImportData` não existem na V2 e **não devem ser portados**.

## Decisões adotadas (padrão do Claude; o Joaquim pode vetar)
1. **Escopo do sync de e-mail (PM-24):** `in:inbox OR in:sent` com janela de 12 meses; Spam, Lixeira e Rascunhos só como contagem do rótulo, sem baixar conteúdo (LGPD).
2. **NÃO portar:** busca remota no Gmail (a V3 devolve só snippet e id), atribuir conversa de e-mail (código morto na V3; a V2 tem uma conta por usuário), auto-inserção de instâncias da Evolution, painel de entrega por participante (decisão do dono pendente), gatilho automático de follow-up (decisão de produto).
3. **Push do Gmail (`setup-watch`):** nenhum código chama; hoje o e-mail novo chega por polling de 5 min. Fica como está; o PE-110 (renovar o watch) pressupõe um watch que nunca foi registrado: comentário no cartão.

## Decisões que dependem do Joaquim (sem cartão por isso)
- **Retenção de e-mail depois de desconectar (LGPD):** `disconnect` apaga os tokens, mas `email_threads`, `email_messages` (corpo e HTML) e `email_attachments` permanecem. Manter para auditoria ou apagar? Se apagar, vira cartão (workersql + edgar).
- **Segunda tela de e-mail (`GmailInboxView`, rota `gmail`):** carrega a caixa inteira em memória (1.738 threads numa só conta). Manter e paginar, ou retirar a rota e os componentes?
- **Painel de entrega por participante** (`DeliveryStatsPanel` da V3): existe só na V3; se quiser, entra por RPC agregada e só com dado real.

## Correções em cartões JÁ existentes (comentários)
- **PE-06:** o PM-23 estende a classificação de `invalid_grant` às 4 cópias do refresh e ao `skip`/espera do cron. **PE-44:** o PM-24 amplia o sync (senão as pastas abrem vazias). **PE-110:** não há watch registrado hoje (ninguém chama `setup-watch`).
- **RC2 (reconexão automática no servidor):** critérios que a V3 aprendeu em produção: parar o ciclo em 401/403/`no_credentials`, avisar UMA vez ao esgotar (a V3 repetiu o aviso 57 vezes) e ignorar `qr_pending`/`connecting`.
- **QL7:** o lote do CRM não tem `placeholderData` (a empresa pisca na lista); acrescentar no cartão em vez de abrir outro.
- **EX2:** os exports do catálogo e da equipe agora têm cartão próprio (PM-30).

## Cartões

| Cartão | Pri | Quem | O que | Espera por |
|---|---|---|---|---|
| **PM-01** | P0 | workersql | fix(seguranca): atendente não grava no próprio perfil o bloqueio de download, a carga de chats nem a reativação | — |
| **PM-02** | P1 | workersql | feat(db): métricas reais para os limites de fila (espera, taxa de atribuição, pendentes) | — |
| **PM-03** | P1 | hugo | feat(filas): avisos de limite de fila (50/75/100 %) em qualquer tela, com métrica real | PM-02, t_36560a6e |
| **PM-04** | P1 | edgar | fix(webhook): grupos do WhatsApp se atualizam sozinhos quando mudam no celular | — |
| **PM-05** | P1 | hugo | fix(chat): o seletor de encaminhar acha qualquer contato (hoje corta em 1.000) e não oferece contato apagado | t_a51d398a, t_6042a8bb |
| **PM-06** | P1 | iris | fix(chat): diálogo de encaminhar com busca paginada e sem 'carregando' eterno | PM-05 |
| **PM-07** | P1 | hugo | fix(metas): metas pessoais contam certo, usam a mesma semana e não repetem a conquista a cada recarga | t_36560a6e |
| **PM-08** | P1 | hugo | fix(grupos): 'Enviar para N grupos' continua mesmo se a aba fechar e deixa registro por grupo | t_e904dcff |
| **PM-20** | P1 | edgar | fix(gmail): mover uma mensagem para a lixeira atualiza o banco na hora | — |
| **PM-21** | P1 | hugo | fix(email): ações do e-mail avisam quando falham e a desconexão parcial não vira 'sucesso' | — |
| **PM-22** | P1 | iris | fix(email): excluir, arquivar e restaurar conversa de e-mail mostram erro e não deixam a tela pendurada | PM-21 |
| **PM-23** | P1 | edgar | fix(gmail): token recusado deixa de ser tentado a cada 5 minutos e o envio avisa que é preciso reconectar | t_10bdc717, PM-20 |
| **PM-24** | P1 | edgar | fix(gmail): o sync traz enviados e acompanha exclusões e rótulos feitos no Gmail | PM-23, t_050946a8 |
| **PM-30** | P1 | iris | chore(catalogo): retirar a exportação do histórico de envios e do desempenho da equipe | t_24a63b85 |
| **PM-31** | P1 | workersql | feat(db): o admin vê o país que o sistema detecta para ele antes de ligar o bloqueio geográfico | — |
| **PM-32** | P1 | hugo | feat(seguranca): bloqueio geográfico recusa a ativação que trancaria o próprio admin | PM-31 |
| **PM-33** | P1 | iris | feat(seguranca): painel de bloqueio geográfico confirma antes de ativar e mostra o país detectado | PM-32, t_5f904bf8, t_91e5805f |
| **PM-34** | P1 | edgar | fix(edge): ações de leitura da Evolution que ninguém usa deixam de ser abertas a qualquer usuário logado | — |
| **PM-35** | P1 | iris | fix(painel): saúde do sistema e cartão de conexão não escondem conexão com credencial ou sonda falhando | t_51b28e1b |
| **PM-09** | P2 | hugo | perf(grupos): sincronizar grupos em um lote só e mostrar a ordem dos fixados | PM-08 |
| **PM-10** | P2 | hugo | perf(conversa): análises de conversa com cache compartilhado e sem consulta de id inválido | — |
| **PM-11** | P2 | iris | feat(admin): tela 'Tarefas agendadas' para ver e pausar os agendadores do banco | t_ac2fa555 |
| **PM-12** | P2 | hugo | feat(sla): a linha do tempo de SLA diz quem respondeu e de qual fila | — |
| **PM-13** | P2 | iris | fix(followup): o aviso de 'automático' não promete o que ainda não executa | t_f7560b37 |
| **PM-14** | P2 | hugo | fix(grupos): categoria do grupo sem 'LIKE' e com erro tratado | PM-09 |
| **PM-15** | P2 | hugo | fix(config): configurações globais compartilham o estado entre telas | — |
| **PM-16** | P2 | hugo | chore(app): título da aba com o nome do produto | — |
| **PM-25** | P2 | edgar | fix(gmail): reconectar limpa o erro antigo e permite assumir um Gmail desconectado por outro usuário | PM-23 |
| **PM-26** | P2 | hugo | feat(email): a faixa 'reconectar o Gmail' aparece sozinha e o cabeçalho mostra a última sincronização | PM-21, t_0b7f6ba4 |
| **PM-27** | P2 | edgar | perf(gmail): marcar como lido em lote usa uma chamada só | PM-20, PM-23 |
| **PM-28** | P2 | workertestes | test(email): testes das ações de e-mail, do lixo, do token recusado e do cron | PM-21, PM-23 |
| **PM-36** | P2 | edgar | feat(conexoes): admin vê instâncias órfãs (só no provedor ou só no banco), sem importar nada | PM-34 |
| **PM-37** | P2 | iris | feat(conexoes): tela de Conexões mostra as instâncias órfãs ao admin | PM-36 |
| **PM-38** | P2 | edgar | fix(crm): sugestões de empresa e cargo do formulário de contato funcionam para o atendente, sem baixar contatos inteiros | — |
| **PM-39** | P2 | hugo | fix(crm): formulário de contato usa a ação estreita e não dá erro para o atendente | PM-38 |
| **PM-40** | P2 | hugo | perf(multiplix): retornos de um disparo consultam o banco em lotes, não uma vez por telefone | — |
| **PM-41** | P2 | hugo | fix(evolution): chamadas à API da Evolution têm tempo limite e cancelamento, com teste | — |
| **PM-42** | P2 | edgar | fix(evolution): disjuntor e limite de taxa da Evolution valem para todas as instâncias da função | PM-34, PM-36 |
| **PM-43** | P2 | workersql | feat(db): admin destrava conta bloqueada por tentativas de login, com auditoria | — |
| **PM-44** | P2 | iris | feat(admin): botão 'Desbloquear' na lista de tentativas de login | PM-43, t_6309be4c |
| **PM-45** | P2 | hugo | chore(evolution): remover ações do front sem tratador na Edge e o hook externo desligado | — |
| **PM-46** | P2 | workertestes | test(doc24): testes da API da Evolution, do CRM externo e do esqueci a senha | PM-41, PM-39 |
| **PM-47** | P2 | workertestes | test(doc24): testes de previsão de demanda, grupos, ações de conversa e dos casos novos de metas | PM-05, PM-07, PM-09 |

## O que NÃO foi verificado (e por quê)
- **Banco de produção:** o conector ficou fora do ar; políticas RLS vigentes das tabelas de e-mail e de `profiles`, contagens reais e `cron.job` ficam para quem aplicar as migrations, sempre em banco local primeiro. O PM-01 deve ser confirmado em produção antes de aplicar.
- **Execução real:** os agentes só leram código; os achados P0/P1 foram conferidos no código e nas migrations, nenhum foi reproduzido em execução.
- **Provedor e Google:** o que as rotas `get-*` devolvem na Evolution GO real; se o tópico Pub/Sub do Gmail existe; se `cf-ipcountry` chega em produção; o limite de tempo da Edge no full sync de uma caixa grande.

## Riscos
- A integração está lenta (fábrica sobrecarregada em 13/10): estes cartões entram na fila. Ordem de ataque sugerida: PM-01, PM-34, PM-30, PM-31..33, PM-20/21 antes dos P2.
- Vários cartões tocam arquivos disputados por outros planos (`useGmail.ts`, `evolution-api/index.ts`, `useForwardMessage.ts`, `actions.ts` de grupos): a cadeia entre os PM está explícita e há dependência dos cartões existentes (FW1, FW3/FW4, PE-06, PE-44, CR1).
