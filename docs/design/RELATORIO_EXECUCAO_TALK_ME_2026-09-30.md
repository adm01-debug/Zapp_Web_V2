# TALK ME — Relatório de execução e validação

**Data:** 30/09/2026
**Plano-base:** `PLANO_TALK_ME_100_ETAPAS_2026-09-30.md`
**Migration:** `20260930290000_talk_me_queue_claim.sql`
**Projeto canônico:** Supabase `tnnnlkbymytvtqngbbqh`

## Resultado entregue

O Inbox passa a oferecer a ação **TALK ME** no extremo direito da barra superior, no espaço anteriormente usado pelo Zen e acima dos avatares de conversas fixadas. O Zen permanece no cabeçalho da lista “Conversas”. Em telas estreitas, a ação também aparece na lista para continuar acessível quando o painel central está oculto.

Ao abrir, o TALK ME apresenta uma tela dedicada com seletor de departamento, busca no servidor e carrossel manual. Cada cartão exibe foto, nome, empresa, cargo, espera, posição, quantidade pendente e a mensagem recebida mais recente. “Aceitar e conversar” adquire o atendimento no servidor e só abre o chat depois da confirmação.

## Decisões fechadas antes do código

| Tema | Decisão implementada |
|---|---|
| Departamento | Fila ativa em `queues`; atendentes veem apenas filas das quais são membros ativos. Administradores e supervisores podem operar todas as filas ativas. |
| Unidade | Um contato/conversa elegível gera um cartão. |
| Elegibilidade | Sem responsável, não excluído, `open` ou `waiting`, WhatsApp individual e última mensagem efetiva enviada pelo contato. |
| Prioridade | Primeira mensagem do contato após a resposta mais recente do agente; mais antigo primeiro, com UUID como desempate estável. |
| Seleção | Navegar apenas destaca. O vínculo ocorre somente no CTA explícito. |
| Concorrência | Bloqueio de linha e atualização condicional. Em dois aceites simultâneos, apenas um vence. |
| Dados | Foto e cadastro existentes, sem inferir campos ausentes. Mídia recebe texto alternativo por tipo. |
| Busca | Nome, empresa, cargo e conteúdo; executada no servidor antes da paginação. |
| Contador | Total de conversas elegíveis no departamento selecionado. |
| Atualização | Eventos de contatos e mensagens disparam reconciliação com debounce. |
| Segurança | RPCs `SECURITY DEFINER` conferem autenticação e escopo novamente; `anon` e `PUBLIC` não têm execução. |
| Liberação | Feature flag `inbox.talk-me`, com fallback seguro desabilitado e valor inicial habilitado pela mesma migration. |
| Reversão | Desabilitar a flag remove a entrada sem alterar atendimentos aceitos, auditoria ou dados de conversa. |

## Arquitetura implementada

1. `LiquidMetalButton` carrega `@paper-design/shaders` dinamicamente e mantém acabamento estático se WebGL 2, shader ou animação não estiverem disponíveis.
2. `useTalkMeQueue` concentra autorização percebida pela UI, filas, busca, paginação por cursor, cancelamento de requisições antigas, realtime e aceite.
3. `TalkMeView` mantém o Inbox montado atrás do diálogo de tela ampla, preservando conversa e rascunho.
4. `talk_me_list_queues` calcula filas autorizadas e contagens.
5. `talk_me_list_waiting` devolve projeção mínima, posição absoluta, total e cursor estável.
6. `talk_me_claim` repete todas as condições dentro da transação, bloqueia o contato, atribui ao perfil autenticado e grava `talk_me_claim` em `audit_logs`.
7. O contrato PostgreSQL descartável replica conflitos reais com duas sessões independentes.

## Simulações e falhas prevenidas

| Cenário | Resultado esperado e verificado |
|---|---|
| Cadastro sem mensagem | Não entra na fila. |
| Última mensagem do agente | Não entra, mesmo sem responsável. |
| Contato resolvido, excluído, atribuído, em grupo ou outro canal | Não entra. |
| Mensagens novas sucessivas | Não reiniciam o relógio de espera. |
| Busca por empresa fora da primeira página | Retorna pelo filtro no servidor. |
| Duas sessões aceitam o mesmo contato | Exatamente uma recebe sucesso; não há sobrescrita. |
| Permissão revogada com a tela aberta | O aceite é recusado pelo servidor. |
| Atendente de outra fila | Não lista e não aceita o contato. |
| Falha de shader ou movimento reduzido | Botão permanece legível, focável e acionável. |
| Mudança rápida de busca/fila | Requisição antiga é abortada e não substitui o resultado atual. |
| Contato aceito por terceiro durante a seleção | A tela informa o conflito, atualiza e apresenta o próximo item. |
| Contrato ainda ausente durante o deploy | A flag inexistente usa `false`; a UI não chama RPCs nem mostra a entrada. |
| Desligamento operacional | A flag em `false` remove a entrada sem desfazer atribuições existentes. |

## Evidências técnicas antes da publicação

| Verificação | Resultado |
|---|---|
| Testes focados Vitest | 5 arquivos e 30 testes aprovados. |
| Contrato PostgreSQL | 19 asserções aprovadas, incluindo duas conexões concorrentes. |
| TypeScript | `tsc -b --force` aprovado. |
| Build de produção | Aprovado; shader isolado em chunk assíncrono. |
| ESLint nos arquivos alterados | Zero erro e zero alerta após tratar a linha-base local. |
| Guard de tipografia | Aprovado; todos os tamanhos novos usam tokens da escala do projeto. |
| Guard de uso Supabase | Zero violação nova. |
| Consulta equivalente no banco canônico | 33 atendimentos elegíveis; execução observada em aproximadamente 2,3 ms antes do índice dedicado. |
| Revisão visual | Desktop, celular, tema escuro, fallback e posição final acima dos favoritos verificados. |
| Suíte global | 4.526 testes aprovados e 40 pendentes; o comando termina com erro por dois timers antigos de `useSendProduct`, fora dos arquivos deste trabalho. |
| Lint global | Reproduz a linha-base histórica de 949 ocorrências fora do escopo; nenhum novo erro foi introduzido. |

## Dimensões de fechamento: orçamento, piloto, humano e observação

Código publicado e operação validada são evidências distintas. Cada dimensão abaixo é registrada em separado; onde não há dado individual, a ausência fica explícita e não é suprida por contagem de testes nem por registro de deploy.

| Dimensão | Requisito | Evidência existente | Situação |
|---|---|---|---|
| BASELINE | Orçamento com condições declaradas | Consulta equivalente no banco canônico, antes do índice dedicado, sobre a base vigente em 30/09/2026. | Condições registradas. |
| BASELINE | Orçamento com amostra declarada | 33 atendimentos elegíveis no departamento observado. | Amostra registrada. |
| BASELINE | Orçamento com métrica declarada | Execução única observada em aproximadamente 2,3 ms antes do índice dedicado. | Métrica pontual registrada; não é p95. |
| P95 | p95 de leitura/claim | Nenhuma série de latência foi coletada. | Ausente: p95 de leitura e de claim não medidos. |
| PILOT | Piloto com público declarado | Nenhum piloto foi executado. | Ausente: público não definido; não executar piloto com clientes sem autorização específica. |
| PILOT | Piloto com critério declarado | Nenhum piloto foi executado. | Ausente: critério de sucesso não definido. |
| PILOT | Piloto com resultado declarado | Nenhum piloto foi executado. | Ausente: resultado não registrado. |
| HUMAN | Homologação nominal | A revisão visual local usou dados sintéticos e navegadores locais; não houve aceite por pessoa nomeada. | Ausente: homologação nominal não registrada. |
| OBSERVATION | Janela de observação registrada | A faixa 091–100 registra a publicação, não um período de operação acompanhada. | Ausente: janela de observação não registrada. |

A amostra de 33 itens, a navegação sintética com 500 itens e o registro da faixa 091–100 durante a publicação comprovam implementação e deploy, não operação validada. Enquanto P95, PILOT, HUMAN e OBSERVATION seguirem sem evidência individual, permanecem pendências explícitas de fechamento operacional.

## Rastreabilidade das 100 etapas

| Faixa | Entrega comprovada |
|---|---|
| 001–010 | Base atualizada; produto traduzido em regras explícitas de fila, canal, prioridade, contagem e navegação. |
| 011–020 | Cabeçalho, seleção de conversa, cadastro, permissões, realtime, schema canônico, dados reais e dependências auditados. |
| 021–030 | Fluxo principal e alternativos desenhados; tela, carrossel, cartões, erro, vazio, indisponibilidade e responsividade validados visualmente. |
| 031–040 | Dimensões, metal, movimento, fallback, contraste, semântica, teclado, anúncios e foco implementados. |
| 041–050 | Leitura mínima protegida, elegibilidade, contagem, paginação, mensagens, busca, índice e migration implementados. |
| 051–060 | Aceite atômico, conflito, permissão revalidada, auditoria, realtime e recuperação de falhas implementados e testados. |
| 061–070 | Arquivos organizados, shader assíncrono, botão no local correto, badge, entrada, saída, preservação do Inbox, seletor e disponibilidade concluídos. |
| 071–080 | Estrutura da tela, carrossel manual, dados reais, mídia, paginação, teclado, toque, aceite e reconciliação concluídos. |
| 081–090 | Matriz sintética, concorrência real, autorização, fluxos, acessibilidade, responsividade, desempenho, regressões e revisão visual executados. |
| 091–100 | PR, flag, ordem de release, aplicação canônica e reversão foram registrados no PR e nos sistemas de GitHub, Vercel e Supabase durante a publicação. O registro da publicação não equivale a observabilidade medida: P95, PILOT, HUMAN e OBSERVATION seguem sem evidência individual (ver “Dimensões de fechamento”). |

## Critérios de operação

- O conteúdo das mensagens não é enviado a telemetria; a auditoria do aceite contém apenas contato, fila, usuário e origem.
- Uma reversão de interface não devolve automaticamente contatos já aceitos para a fila.
- A operação pode interromper novas entradas mudando `inbox.talk-me` para `false`.
- Aceites reais de clientes não são usados como teste técnico. O contrato descartável cobre a mutação e a concorrência sem interferir na operação.
