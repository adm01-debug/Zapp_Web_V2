# Talk X · Campanhas — Plano V4: 200 etapas para o módulo ter tudo o que as 17 imagens mostram

**Gerado em:** 2026-10-01 · **Base do levantamento:** `main` `3d09433` e banco `tnnnlkbymytvtqngbbqh` conferido ao vivo em 01/10
**Estado:** proposto — passa a ser o plano vigente quando a etapa X001 for executada. Até lá vale o [V3](PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md).
**Substitui:** as etapas ainda em aberto do V3 (**V27–V100**); **V01–V11** já na `main` e **V12–V26 entregues com PR** (V22 #1464, V23 #1475, V24 #1498, V25 #1508, V26 #1520/#1526/#1532; as demais, V12–V21, entregues por migration — registro completo no [V3 congelado](PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md)).

Arquivos deste plano:

| O quê | Onde |
|---|---|
| Este documento: retrato, regras, fases, índice das 200 etapas, cobertura | `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` |
| As 200 etapas por extenso (Hoje · Fazer · Aceite), um arquivo por fase | [`docs/talkx/v4/etapas/`](v4/etapas/) |
| Inventário: cada elemento das 17 imagens contra o código, com `arquivo:linha` | [`docs/talkx/v4/inventario/`](v4/inventario/README.md) |
| Decisões de arquitetura e de negócio | [`docs/talkx/v4/DECISOES.md`](v4/DECISOES.md) |
| As mesmas etapas em formato de máquina (para o placar) | [`docs/talkx/v4/etapas.json`](v4/etapas.json) |

---

## 1. Retrato em 01/10/2026

As 17 imagens foram decompostas em **1.135 elementos** (cada KPI, coluna, filtro, botão, modal, aba, gráfico). Cada elemento foi procurado no código atual.

| Estado do elemento | Quantos | % |
|---|---|---|
| Existe e funciona com dado real | 217 | 19% |
| Existe pela metade | 338 | 30% |
| Não existe | 555 | 49% |
| Aparece na tela com número ou rótulo sem fonte | 25 | 2% |

Por tela:

| Tela | Elementos | Prontos | A fechar | Cobertos por etapa | Excluídos com motivo |
|---|---|---|---|---|---|
| 01 · Campanhas · visão geral | 68 | 20 | 48 | 36 | 12 |
| 02 · Segmentos · biblioteca e detalhes | 68 | 18 | 50 | 50 | 0 |
| 03 · Segmentos · criar e editar | 102 | 20 | 82 | 80 | 2 |
| 04 · Templates · biblioteca | 54 | 16 | 38 | 38 | 0 |
| 05 · Templates · criar e editar | 77 | 20 | 57 | 57 | 0 |
| 06 · Lista de supressão | 73 | 11 | 62 | 62 | 0 |
| 07 · Analytics | 84 | 12 | 72 | 72 | 0 |
| 08 · Nova campanha | 65 | 28 | 37 | 37 | 0 |
| 09 · Revisão final e confirmação | 50 | 19 | 31 | 31 | 0 |
| 10 · Campanha agendada | 46 | 12 | 34 | 34 | 0 |
| 11 · Monitor ao vivo | 76 | 11 | 65 | 65 | 0 |
| 12 · Campanha em andamento | 69 | 20 | 49 | 49 | 0 |
| 13 · Campanha pausada e retomada | 71 | 2 | 69 | 69 | 0 |
| 14 · Relatório de campanha concluída | 81 | 3 | 78 | 78 | 0 |
| 15 · Importação e vinculação CRM 360° | 59 | 0 | 59 | 59 | 0 |
| 16 · Ajuda do Talk X | 40 | 0 | 40 | 36 | 4 |
| 17 · Estados do sistema e modais | 52 | 5 | 47 | 45 | 2 |
| **Total** | **1.135** | **217** | **918** | **898** | **20** |

Por trás das telas, o motor de envio foi decomposto em **110 capacidades** ([inventário do motor](v4/inventario/H_motor_backend.md)): 17 prontas, 48 pela metade, 45 inexistentes.

Cinco fatos que mudam a ordem do trabalho:

1. **O Talk X nunca enviou uma mensagem em produção.** 0 campanhas, 0 destinatários, 0 supressões. O motor só foi exercitado em teste com 1 destinatário falso.
2. **O envio é um laço único dentro de uma requisição.** Pela leitura do código, com o ritmo padrão cabem cerca de 8 contatos antes de a plataforma encerrar a chamada (o limite exato do projeto não foi medido); ninguém retoma uma campanha que ficou em "enviando". Uma campanha real de 50 contatos pararia sozinha.
3. **Os filtros do desenho não têm dado.** Dos 3.106 contatos: etiquetas em 3, cidade e UF em 0, empresa em 1, origem em 0. No CRM, só 2 clientes têm data de última compra e o RFM está parado desde abril. O vínculo ZAPP ↔ CRM (`crm_contact_links`) tem 0 linhas. Sem a fase 4, o construtor de segmentos do mock devolveria zero em quase tudo.
4. **Papel só é checado na tela.** Pelo código, qualquer usuário autenticado consegue criar e agendar uma campanha chamando o banco direto, e o agendador dispara com chave de serviço (não foi exercitado).
5. **As imagens se contradizem em alguns números** (42 e 200 mensagens por minuto, com intervalo de 8–20 s entre mensagens). O plano constrói o controle; o valor padrão é o conservador (decisão N01).

---

## 2. Como o plano foi construído

1. **Inventário.** Oito levantamentos independentes: sete leram as imagens elemento por elemento contra o código (um arquivo por grupo de telas) e um leu o motor inteiro (edges, migrations, webhook, testes).
2. **Banco ao vivo.** Contagens, colunas, restrições, políticas, cron e preenchimento real de cada campo usado em filtro, nos dois bancos (ZAPP e CRM).
3. **Etapas.** Cada elemento que não está pronto foi atribuído a uma etapa; cada etapa cita os elementos que fecha no campo **Fecha**.
4. **Conferência mecânica.** Um script verifica: 200 etapas, nenhuma depende de etapa posterior, e todo elemento a fechar está em alguma etapa ou na lista de excluídos. Resultado: 898 cobertos, 20 excluídos, **0 sem cobertura**.

O que este plano tem que os três anteriores não tinham: rastreio elemento → etapa → PR; ordem verificada; o motor e os dados antes das telas; e "pronto" definido por evidência, não por marcação.

---

## 3. Regras de execução

1. **Uma etapa = uma PR.** Branch `<agente>/<tipo>-talkx-x<NNN>-<slug>-<AAMMDD-HHMM>`, a partir da `main` atualizada; título terminando em `(X<NNN>)`.
2. **Ordem.** Uma etapa só começa quando as de **Exige antes** estão na `main` — e, se têm migration ou edge, aplicadas e implantadas. A ordem numérica é sempre válida; as trilhas da seção 6 dizem o que pode andar em paralelo.
3. **Pronto =** PR mergeada **+** migration aplicada e registrada no ledger (se houver) **+** edge implantada (se houver) **+** o **Aceite** da etapa demonstrado no corpo da PR **+**, em etapa de tela, a foto 1672×941 ao lado do mock. Faltou um, a etapa está aberta.
4. **Nenhum número sem fonte.** Métrica que o banco não sabe responder não aparece; no lugar entra o estado "sem dados ainda".
5. **Diff mínimo.** Estender o que funciona; nada é removido da tela sem pedido do dono (decisões N34 e N35).
6. **Tema.** O carvão do app fica; o azul das imagens é acento. Só os tokens do tema.
7. **Banco.** Fluxo do `CLAUDE.md`: versão reservada por `reserve_migration_version`, arquivo → PR → merge → DDL + ledger na mesma chamada, catálogo e tipos regenerados, `supabase-usage-guard` com `novas: 0`. Só o banco `tnnnlkbymytvtqngbbqh`. O CRM (`pgxfvjmuubtbowutlide`) e o Bitrix24 são **somente leitura** em todo o plano.
8. **Edge.** Merge não implanta: só vale depois de `deploy-functions.yml` disparado e aprovado.
9. **Gates de toda PR:** typecheck 0, lint sem novas, testes unitários, build, orçamento do carregamento inicial, `db:guard`, testes Deno da edge tocada, testes SQL novos registrados em `db-guard.yml`.
10. **Testes automáticos nunca gravam nem enviam em produção.** E2E usa respostas interceptadas (X003); envio real só nas etapas de ensaio, com números da equipe.

---

## 4. Decisões

**Arquitetura** (valem para todas as etapas; detalhe em [DECISOES.md](v4/DECISOES.md)): layout único do app; motor em lotes com retomada automática; audiência resolvida no servidor; vários segmentos por campanha; dados comerciais numa projeção local alimentada pelo CRM e pelo Bitrix24; mídia em bucket privado; botões com fallback em texto; aprovação interna de template; previsões só com histórico; IA atrás de chave e com teto; limites de ritmo no servidor; papel checado no banco; eventos gravados só pelo servidor; exportação restrita e registrada; central de ajuda em markdown; um kit único de componentes; régua visual.

**Negócio:** 45 decisões, cada uma com um padrão recomendado **já aplicado no texto das etapas**. Lista completa em [DECISOES.md](v4/DECISOES.md). As que mais pesam:

| Nº | Decisão | Padrão aplicado |
|---|---|---|
| N01 | Teto de ritmo por número | 6 mensagens/min e 500/dia por conexão |
| N03 | Botões pela Evolution GO | Texto com link como padrão; botão só após teste real |
| N10 | Consentimento (100% da base "desconhecido") | Bloquear só quem revogou; gravar a confirmação do operador |
| N12 | Ignorar a lista de supressão | Nunca |
| N21–N23 | Excluir campanha, segmento ou template já usado | Arquivar em vez de apagar |
| N28 | Contato sem valor para variável | Bloquear o lançamento ou pular o contato; nunca enviar o nome da variável |
| N41 | IA | Desligada no início |
| N42 | Exportar/importar arquivo | Só no Talk X, com permissão e registro |
| N43 | 63 etapas com migration | Autorização permanente para migration aditiva em `talkx_*` |
| N44 | 23 deploys de edge | Uma janela de deploy por dia |

**Dependem de informação do dono:** N04 (números e chip do ensaio real), N36 (nome do funil de vendas no Bitrix24), N40 (quem atende "suporte" e "especialista").

---

## 5. Fases

| Fase | Etapas | Qtde | Telas | Migration | Edge | Entrega |
|---|---|---|---|---|---|---|
| [0 · Régua e governança](v4/etapas/F00-regua-e-governanca.md) | X001–X005 | 5 | — | — | — | Um plano só valendo, placar automático de etapas e de elementos por tela, e a foto de cada tela ao lado do mock em toda PR do módulo. |
| [1 · Correções imediatas](v4/etapas/F01-correcoes-imediatas.md) | X006–X009 | 4 | 03, 07, 08, 12 | 1 | — | Quatro defeitos que aparecem no primeiro uso real: limite de envio gravado em milissegundos, Analytics que quebra na primeira campanha, construtor de segmento que zera a contagem e rascunho que não salva. |
| [2 · Motor seguro para o primeiro disparo](v4/etapas/F02-motor-seguro-para-o-primeiro-disparo.md) | X010–X023 | 14 | motor | 7 | 7 | Envio em lotes que continua sozinho, lançamento que responde na hora, papel checado no banco, audiência montada pelo servidor, teto de ritmo, conversão autenticada e prova de que o que está no ar é o que está no repositório. |
| [3 · Integridade, observabilidade e ensaio real](v4/etapas/F03-integridade-observabilidade-e-ensaio-real.md) | X024–X035 | 12 | motor | 7 | 5 | Eventos gravados pelo servidor, lidas e respostas, pedido de saída configurável, reenvio, LGPD, alertas — e o ensaio com 50 ou mais números da equipe e queda proposital. |
| [4 · Dados comerciais e vínculo com o CRM](v4/etapas/F04-dados-comerciais-e-vinculo-com-o-crm.md) | X036–X041 | 6 | dados | 6 | 3 | Contatos do ZAPP ligados aos clientes do CRM, atributos comerciais num lugar só (empresa, cidade, vendedor, estágio, última compra, ticket médio, RFM) e vendas do Bitrix24 virando resultado de campanha. |
| [5 · Kit, estados, modais e navegação](v4/etapas/F05-kit-estados-modais-e-navegacao.md) | X042–X056 | 15 | 17 | 1 | — | Um conjunto único de tabela, KPI, filtros, estados e modais usado por todas as telas; endereço próprio para cada aba; busca do módulo. |
| [6 · Capacidades novas do motor e agregações](v4/etapas/F06-capacidades-novas-do-motor-e-agregacoes.md) | X057–X076 | 20 | motor | 18 | 5 | Vários segmentos por campanha, recorrência, dias e horário de silêncio, mídia por upload, botões e enquete, A/B completo, aprovação de template, previsões, números de visão geral e analytics calculados no servidor, base de IA. |
| [7 · Visão geral](v4/etapas/F07-visao-geral.md) | X077–X082 | 6 | 01 | — | — | A tela de entrada do módulo igual ao desenho, com números reais. |
| [8 · Templates](v4/etapas/F08-templates.md) | X083–X098 | 16 | 04, 05 | 4 | — | Biblioteca e editor de templates completos: prévia fiel, upload de mídia, botões, A/B, versões, aprovação, desempenho por template. |
| [9 · Segmentos](v4/etapas/F09-segmentos.md) | X099–X117 | 19 | 02, 03 | 4 | — | Biblioteca e construtor de segmentos completos: todos os filtros do desenho com dado real, grupos E/OU, prévia, sobreposição, versões. |
| [10 · Criar, revisar e agendar campanha](v4/etapas/F10-criar-revisar-e-agendar-campanha.md) | X118–X139 | 22 | 08, 09, 10 | 3 | — | Wizard completo com as três origens de público, vários segmentos, mídia, links medidos, revisão com checagens reais, confirmação gravada e agendamento com repetição. |
| [11 · Acompanhar campanha](v4/etapas/F11-acompanhar-campanha.md) | X140–X160 | 21 | 11, 12, 13 | 3 | — | Monitor ao vivo, campanha em andamento e campanha pausada como no desenho, com fila por segmento, ações por contato e checklist de retomada. |
| [12 · Relatório](v4/etapas/F12-relatorio.md) | X161–X169 | 9 | 14 | 2 | 1 | Relatório da campanha concluída com as 8 abas, funil, mapa de calor, links, receita e ROI, exportação e compartilhamento. |
| [13 · Importação e vínculo com o CRM](v4/etapas/F13-importacao-e-vinculo-com-o-crm.md) | X170–X175 | 6 | 15 | 3 | 2 | Importar planilha de contatos com regras de correspondência, fila de pendentes e resolução de conflitos. |
| [14 · Supressão e Analytics](v4/etapas/F14-supressao-e-analytics.md) | X176–X188 | 13 | 06, 07 | 2 | — | Lista de supressão completa (motivos, importação, trilha, centro de proteção) e Analytics com gráficos, funil, horários e recomendações. |
| [15 · Ajuda](v4/etapas/F15-ajuda.md) | X189–X191 | 3 | 16 | 1 | — | Central de ajuda com artigos, guias e checklist ligado à campanha em edição. |
| [16 · Qualidade e release](v4/etapas/F16-qualidade-e-release.md) | X192–X200 | 9 | 01–17 | 1 | — | Acessibilidade, telas menores, desempenho, régua como trava, banco conferido, documentação refeita, aceite tela a tela, primeira campanha para clientes e release. |
| **Total** | X001–X200 | **200** | | **63** | **23** | |

Marcos (o que o dono vê):

| Marco | Ao fim da fase | O que passa a existir |
|---|---|---|
| A | 0 | Placar automático e a foto de cada tela ao lado do mock em toda PR |
| B | 3 | Ensaio real: campanha interna com 50 ou mais números da equipe, com queda proposital, sem duplicar e concluindo sozinha |
| C | 7 | Visão geral igual ao desenho, com números reais |
| D | 11 | Campanha criada, revisada, lançada e acompanhada pelas telas novas |
| E | 14 | Todas as telas de trabalho (relatório, importação, supressão, analytics) |
| F | 16 | Aceite tela a tela, primeira campanha para clientes e release |

**Prazo (estimativa, não compromisso).** Ritmo medido no V3: 11 etapas em 2,5 dias numa frente. Com três frentes em paralelo (seção 6) são cerca de 25 a 35 dias úteis de execução, mais a observação de 7 dias da primeira campanha. O que mais alonga: aprovação de migration e de deploy (N43, N44), o ensaio real (N04) e a chegada dos dados do Bitrix24 (N36).

---

## 6. Trilhas paralelas e pontos de colisão

Depois da fase 0, três frentes andam ao mesmo tempo sem tocar nos mesmos arquivos:

| Frente | Etapas | Arquivos |
|---|---|---|
| Motor | fases 2 e 3, depois a fase 6 | `supabase/functions/talkx-*`, `_shared/talkx-*`, migrations `talkx_*` |
| Dados | fase 4 | `supabase/functions/crm-integration`, `bitrix-api`, tabelas novas de projeção |
| Kit | fase 5 (exceto X048, X051, X056, que esperam o motor e os dados) | `src/components/talkx/kit/` |

Da fase 7 em diante, cada tela é uma frente: Visão geral, Templates, Segmentos, Wizard, Acompanhamento, Relatório, Importação, Supressão e Analytics. A ordem numérica entre elas resolve as dependências cruzadas (o wizard usa o editor de mensagem dos templates e o catálogo de filtros dos segmentos).

Pontos em que duas sessões se atropelam — **uma PR aberta por vez em cada um**:

| Ponto | Etapas que tocam |
|---|---|
| `supabase/functions/talkx-send/index.ts` | X011, X013, X015, X019, X020, X022, X023, X025, X033, X035, X062, X064, X067 |
| RPC `save_talkx_campaign_draft` | X009, X014, X017, X018, X024, X032, X057, X059, X060, X061, X066, X119, X137 |
| Trigger `enforce_talkx_campaign_mutability` | X010, X014, X026 |
| `evolution-webhook` (recibos, respostas, opt-out) | X023, X028, X030 |
| `talkxShared.tsx` até a divisão em `kit/` (X042) | toda etapa de tela anterior à X042: X006, X007, X008 |
| Job do pg_cron (já falha com "job startup timeout", 16 vezes em 24 h) | X012, X032, X033, X036, X037, X038, X039, X040, X041, X059, X103, X173 — não criar job novo sem necessidade: reaproveitar os existentes |
| Versão de migration | as 63 etapas com DDL — sempre `reserve_migration_version` |

---

## 7. Índice das 200 etapas

O texto completo de cada etapa (Hoje, Fazer, Aceite) está no arquivo da fase. "Exige" são as etapas que precisam estar prontas antes.

### Fase 0 — Régua e governança ([etapas por extenso](v4/etapas/F00-regua-e-governanca.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X001 | Tornar o V4 o plano vigente e marcar os planos anteriores como substituídos | — | docs | — | — | — |
| X002 | Criar o placar do V4: etapas fechadas e elementos do mock por tela | — | docs + testes | — | — | X001 |
| X003 | Criar a base de demonstração determinística das 17 telas para captura | 01–17 | testes | — | — | — |
| X004 | Criar a régua visual: captura 1672×941 de cada tela ao lado do mock em toda PR do Talk X | 01–17 | testes | — | — | X003 |
| X005 | Exigir a definição de pronto no corpo da PR de cada etapa do V4 | — | testes + docs | — | — | X002, X004 |

### Fase 1 — Correções imediatas ([etapas por extenso](v4/etapas/F01-correcoes-imediatas.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X006 | Corrigir unidade (ms × s) e efeito da velocidade no modal "Editar limites" | 12 | front + testes | — | — | — |
| X007 | Corrigir quebra de hooks do Analytics; abas com dropdown, deep link e casca com rail | 06, 07 | front + testes | — | — | — |
| X008 | Corrigir condição incompleta no construtor e tirar da tela o que não tem fonte | 03, 02 | front + testes | — | — | — |
| X009 | Aceitar rascunho sem mensagem e gravar passo e responsável na RPC de rascunho | 08 | banco + testes | sim | — | — |

### Fase 2 — Motor seguro para o primeiro disparo ([etapas por extenso](v4/etapas/F02-motor-seguro-para-o-primeiro-disparo.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X010 | Aceitar `start` repetido em `sending` e criar lease de worker, fila e segredo do cron | motor | banco | sim | — | — |
| X011 | Processar a campanha em lotes com orçamento de tempo no `talkx-send` | motor | edge | — | sim | X010 |
| X012 | Criar o tick do motor: reaper, conclusão, re-invocação e cron com segredo e timeout | motor | banco + cron | sim | — | X010, X011 |
| X013 | Tornar o lançamento assíncrono: `start` só transiciona e dispara o primeiro lote | 09, 10, 11 | edge + front (hook) | — | sim | X011, X012 |
| X014 | Exigir papel admin/supervisor no banco para criar, agendar e alterar campanha | 08, 17 | banco | sim | — | — |
| X015 | Autenticar o `talkx-scheduler` por segredo e limitar o tempo de cada chamada | motor | edge | — | sim | X012, X013 |
| X016 | Criar a RPC única de audiência com elegibilidade, supressão e paginação | 03, 08, 09 | banco | sim | — | X014 |
| X017 | Gerar os destinatários no servidor a partir do rascunho salvo | 06, 08, 09, 10 | banco + front (hook) | sim | — | X016 |
| X018 | Criar no banco os limites por minuto, por dia e por conexão e os perfis de velocidade | 09, 11, 12, 13 | banco | sim | — | X014 |
| X019 | Enviar pela conexão escolhida e aplicar os limites de ritmo no `talkx-send` | 09, 10, 11, 13 | edge | — | sim | X011, X018 |
| X020 | Impedir texto errado: variável sem valor, variável desconhecida e precedência do A/B | 05, 08, 09 | edge + front (lib de prévia) | — | sim | X011 |
| X021 | Abrir no banco a escrita de links, a leitura de cliques/conversões e o investimento | motor, 08, 14 | banco | sim | — | X014 |
| X022 | Enviar vários links por rótulo com UTM e domínio próprio; autenticar a conversão | motor, 08, 14 | edge | — | sim | X020, X021 |
| X023 | Provar a paridade de deploy das 5 edges e dos segredos antes do primeiro disparo | motor | docs + testes | — | sim | X011, X013, X015, X019, X020, X022 |

### Fase 3 — Integridade, observabilidade e ensaio real ([etapas por extenso](v4/etapas/F03-integridade-observabilidade-e-ensaio-real.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X024 | Gravar eventos de ciclo de vida no servidor com ator e motivo e fechar a fila ao cancelar | 10, 11, 12, 13, 14, 17 | banco | sim | — | X010 |
| X025 | Passar ator e motivo pelo `talkx-send` e remover os eventos gravados pelo navegador | 10, 11, 12, 13 | edge + front (hooks) | — | sim | X024 |
| X026 | Fechar contadores, uso de template, checklist de retomada e excluir/duplicar no banco | 04, 13, 17 | banco + front (hook) | sim | — | X025 |
| X027 | Registrar lidas, respostas e tempo de resposta no banco | 01, 07, 11, 12, 13, 14 | banco | sim | — | — |
| X028 | Ligar o webhook aos recibos de leitura e à atribuição de resposta | 07, 11, 12, 14 | edge | — | sim | X027 |
| X029 | Tornar o opt-out configurável e ligado à campanha no banco | 06, 10, 11, 14 | banco | sim | — | — |
| X030 | Usar palavras, autoresposta e campanha do opt-out no webhook | 06, 11 | edge | — | sim | X028, X029 |
| X031 | Criar reenvio manual e resolução de `outcome_unknown` por RPC, com trilha | 11, 12, 14 | banco | sim | — | X012, X024 |
| X032 | Aplicar LGPD no motor: consentimento no lançamento e expurgo por prazo | 03, 09 | banco + cron | sim | — | X012, X016, X024, X029 |
| X033 | Criar log por destinatário, visão de saúde do motor e alertas | 12, 14 | banco + edge + cron | sim | sim | X012, X019, X032 |
| X034 | Cobrir o motor com provedor falso: integração multi-destinatário e E2E de lançamento | 08, 09, 11 | testes | — | — | X010, X011, X012, X013, X014, X015, X016, X017, X018, X019, X020, X023, X024, X025, X026, X031 |
| X035 | Executar o ensaio real: campanha interna com ≥ 50 destinatários e queda proposital | 10, 11, 12, 13, 14 | testes + docs | — | sim | X010, X011, X012, X013, X014, X015, X016, X017, X018, X019, X020, X023, X024, X025, X026, X027, X028, X029, X030, X033 |

### Fase 4 — Dados comerciais e vínculo com o CRM ([etapas por extenso](v4/etapas/F04-dados-comerciais-e-vinculo-com-o-crm.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X036 | Vincular em lote contatos do ZAPP ao CRM 360 por telefone, com trilha e divergências | dados | banco + edge + cron | sim | sim | — |
| X037 | Criar a projeção `talkx_contact_attributes` com RLS e os atributos de fonte local | dados | banco + cron | sim | — | X036 |
| X038 | Atualizar a projeção com dados do CRM 360 por job em lotes, com limite e métricas | dados | edge + banco + cron | sim | sim | X036, X037 |
| X039 | Trazer negócios ganhos do Bitrix24 para `contact_purchases` em modo somente leitura | dados | banco + edge + cron | sim | sim | X036 |
| X040 | Calcular recência, frequência, valor e segmento RFM a partir das compras locais | dados | banco + cron | sim | — | X037, X039 |
| X041 | Registrar negócio ganho como conversão na janela de atribuição; receita e ROI | motor, 14, 07 | banco + cron | sim | — | X021, X028, X039 |

### Fase 5 — Kit, estados, modais e navegação ([etapas por extenso](v4/etapas/F05-kit-estados-modais-e-navegacao.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X042 | Dividir `talkxShared.tsx` em `kit/*` com barrel, sem mudar comportamento | 01, 17 | front + testes | — | — | — |
| X043 | Completar `TalkXTable`: ordenação, seleção em massa, ações de linha e células padrão | 01, 17 | front + testes | — | — | X042 |
| X044 | `KpiCard` com comparativo de período calculado, anel e estado "sem dados ainda" | 01, 17 | front + testes | — | — | X042 |
| X045 | Unificar a barra de filtros: rótulo "Todos os …", período, atualizar e limpar | 01, 17 | front + testes | — | — | X042 |
| X046 | Reescrever os 6 estados do sistema com os textos e botões do mock 17 | 17, 01 | front + testes | — | — | X042 |
| X047 | Expor erro nos hooks e aplicar carregando/erro/vazio em todas as telas do módulo | 17, 01 | front + testes | — | — | X046 |
| X048 | Aplicar WhatsApp desconectado, CRM indisponível e sem permissão, com botões ligados | 17 | front + testes | — | — | X014, X046, X047 |
| X049 | Modal único do kit com barra de título, tom aplicado, espera da ação e presets do mock | 17, 01 | front + testes | — | — | X042 |
| X050 | Trocar diálogos soltos e `window.confirm` de Supressão, Templates e limites pelo kit | 17 | front + testes | — | — | X049 |
| X051 | Unificar pausar, retomar, cancelar e disparar em um fluxo só nas 5 telas | 17, 01 | front + testes | — | — | X013, X024, X025, X049, X050 |
| X052 | Colocar aba e campanha aberta na URL e criar abas com menu (Templates, Analytics) | 01, 17 | front + testes | — | — | X042 |
| X053 | Cabeçalho do módulo: trilha, botão "Ajuda" com rótulo e indicador de campanha em andamento | 01, 17 | front + testes | — | — | X052 |
| X054 | Busca ⌘K do módulo: uma paleta só, itens sem abrir o módulo e que abrem o item certo | 01 | front + testes | — | — | X052 |
| X055 | Prancha de referência (`TalkXKit`), estado forçado por URL e matriz tela × estado | 17 | front + testes + docs | — | — | X043, X044, X045, X046, X049, X053 |
| X056 | Preencher cidade, UF e origem em `contacts` e expor a cobertura por atributo | dados, 02, 03, 08 | banco + front | sim | — | X037, X038, X040, X046 |

### Fase 6 — Capacidades novas do motor e agregações ([etapas por extenso](v4/etapas/F06-capacidades-novas-do-motor-e-agregacoes.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X057 | Permitir vários segmentos por campanha e gravar o segmento de cada destinatário | 09, 11, 12, 13, 14 | banco | sim | — | X017 |
| X058 | Expor fila por segmento, ordem de envio e lista paginada de destinatários | 11, 12, 13, 14 | banco | sim | — | X056, X057 |
| X059 | Gerar a próxima ocorrência de campanha recorrente no tick, com chave única | 10 | banco + cron | sim | — | X012, X017, X024 |
| X060 | Aplicar dias da semana, não perturbe e horário comercial configurável na janela de envio | 10, 12 | banco + edge | sim | sim | X018, X019 |
| X061 | Criar o bucket privado `talkx-media` e aceitar caminho de mídia nas RPCs | 04, 05, 08, 10 | storage + banco | sim | — | X014 |
| X062 | Assinar a mídia do bucket no envio e mandar documento com nome de arquivo | 04, 05, 08, 10 | edge | — | sim | X019, X061 |
| X063 | Modelar mensagem interativa (botões, lista, enquete) em template e campanha | 04, 05, 09 | banco | sim | — | X014 |
| X064 | Enviar mensagem interativa com fallback em texto e registrar a resposta | 04, 05, 09 | edge | — | sim | X028, X030, X063 |
| X065 | Fechar o A/B no banco: pesos, atribuição estável, métrica por variante e vencedor | 05, 14, 17 | banco | sim | — | X017, X020, X027 |
| X066 | Exigir aprovação interna de template e gravar a versão usada pela campanha | 04, 05, 09, 13, 14 | banco | sim | — | X024, X063 |
| X067 | Refazer o envio de teste com trilha, limite, conexão escolhida e mídia assinada | 05, 08 | banco + edge | sim | sim | X019, X020, X062 |
| X068 | Calcular no servidor ETA, série prevista, sobreposição de segmentos e risco | 02, 03, 08, 09, 10, 11 | banco | sim | — | X016, X018, X060 |
| X069 | Fechar escala, realtime, histórico da conversa e auditoria de permissões do módulo | 06, 07, 11, 12, 14 | banco + testes | sim | — | X027, X033, X057, X058 |
| X070 | Criar tabela de motivos de supressão e ligar `reason_code` a ela | 06 | banco + testes | sim | — | — |
| X071 | Gravar trilha da supressão por trigger e encerrar o DELETE físico | 06 | banco + testes | sim | — | X070 |
| X072 | Corrigir e parametrizar `talkx_overview_stats` (status, alcance, séries, período anterior) | 07 (e 01) | banco + testes | sim | — | — |
| X073 | Acrescentar lidas, conversões, receita e funil a `talkx_overview_stats` | 07 | banco + testes | sim | — | X021, X022, X028, X041, X057, X072 |
| X074 | Criar RPCs de mapa de calor, top segmentos e ranking de campanhas | 07 | banco + testes | sim | — | X021, X057, X072 |
| X075 | Benchmarks por período com nomes e `talkx_insights` por regra no servidor | 07 (e 01, 02, 04) | banco + testes | sim | — | X057, X074 |
| X076 | Criar a infra de IA do Talk X: edge `talkx-ai` via `ai-proxy` com teto de custo e trilha | 02, 03, 04, 07, 09, 11, 12, 14 | banco + edge | sim | sim | X075 |

### Fase 7 — Visão geral ([etapas por extenso](v4/etapas/F07-visao-geral.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X077 | KPIs da Visão geral lidos da RPC, com fonte correta e comparativo | 01 | front + testes | — | — | X028, X044, X045, X047, X072 |
| X078 | Listagem de campanhas paginada no servidor, com tempo real completo | 01 | front + testes | — | — | X047, X057 |
| X079 | Tabela da Visão geral nas colunas do mock, sobre `TalkXTable` | 01 | front + testes | — | — | X028, X043, X057, X061, X078 |
| X080 | Ações de linha persistidas: duplicar, excluir com regra, pausar, retomar e cancelar | 01, 17 | front + testes | — | — | X014, X024, X025, X026, X043, X049, X051, X052, X078 |
| X081 | Filtros da Visão geral (status, canal, segmento, criador, período), grade e massa | 01, 17 | front + testes | — | — | X043, X045, X078, X079, X080 |
| X082 | Painel lateral: Talk X com 3 números reais, ações rápidas, últimas campanhas e dica do dia | 01 | front + testes | — | — | X021, X027, X028, X052, X061, X072, X075, X077, X078, X080 |

### Fase 8 — Templates ([etapas por extenso](v4/etapas/F08-templates.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X083 | Adicionar colunas de canal, ícone, mídia, interativo e arquivo aos templates | 04, 05 | banco | sim | — | X061, X064 |
| X084 | Criar RPC `save_talkx_template` com versão condicional, nota, limite e restauração | 05 | banco | sim | — | X066, X083 |
| X085 | Criar no banco variantes em conjunto, duplicar, arquivar, guarda de exclusão e importação | 04, 05 | banco | sim | — | X014, X026, X065, X083, X084 |
| X086 | Criar RPCs de métricas de template: desempenho, usos, KPIs da biblioteca e sugestões | 04, 05 | banco | sim | — | X021, X028, X030, X041, X066, X083 |
| X087 | Extrair `TalkXMessageEditor` único para template e wizard, com variáveis e validação | 05 | front + testes | — | — | X020, X022, X055 |
| X088 | Criar `TalkXMessagePreview` fiel ao WhatsApp com mídia, interativo e tela cheia | 04, 05 | front + testes | — | — | X055, X061, X083, X087 |
| X089 | Refazer a galeria do mock 04: cartão fiel, filtros, lista, paginação e estados | 04 | front + testes | — | — | X026, X055, X061, X083, X086, X087, X088 |
| X090 | Unificar ações de template (menu ⋮, duplicar, testar, arquivar, excluir) e aprovação | 04, 05 | front + testes | — | — | X055, X066, X067, X085, X089 |
| X091 | Ligar KPIs das telas 04 e 05, "Desempenho deste template" e "Em andamento" às RPCs | 04, 05 | front + testes | — | — | X021, X030, X041, X055, X066, X086 |
| X092 | Montar o painel lateral da tela 04: Mais convertidos, Sugestões e Ações rápidas | 04 | front + testes | — | — | X055, X076, X085, X086, X090, X091 |
| X093 | Importar e exportar templates em CSV ou JSON com prévia, conflitos e trilha | 04 | front + testes + docs | — | — | X055, X085, X087 |
| X094 | Encaixar a tela 05 no shell: rota, cabeçalho, sub-abas, biblioteca lateral e campos | 04, 05 | front + testes | — | — | X055, X083, X086, X089, X090, X091 |
| X095 | Trocar o campo de URL por envio de arquivo com validação de 16 MB e metadados | 05 | front + testes | — | — | X061, X062, X067, X083, X088, X094 |
| X096 | Adicionar botões e enquete à mensagem do template, com texto reserva e teste real | 04, 05 | front + testes + docs | — | — | X064, X083, X088, X090 |
| X097 | Construir a aba Variações A/B: lado a lado, pesos em 100, resultado e vencedora | 05 | front + testes | — | — | X065, X085, X087, X088, X090, X094 |
| X098 | Salvar com nota e atalho, proteger alterações e construir a aba Histórico de Versões | 05 | front + testes | — | — | X055, X084, X094 |

### Fase 9 — Segmentos ([etapas por extenso](v4/etapas/F09-segmentos.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X099 | Extrair `TalkXSegmentBuilder` com reducer, desfazer/refazer e validação | 03 | front + testes | — | — | X008 |
| X100 | Criar o compilador de regras no servidor com os campos do mock e os operadores novos | 03, 02 | banco + testes | sim | — | X016, X017, X037, X038, X039, X040 |
| X101 | Criar o ciclo de vida do segmento no banco: rascunho, versões, tags e guarda de uso | 02, 03 | banco + testes | sim | — | X057, X100 |
| X102 | Criar a RPC de saúde do segmento: risco de entrega, sinais, composição e sugestões | 03, 02 | banco + testes | sim | — | X016, X017, X038, X075, X100 |
| X103 | Criar a RPC da biblioteca e o histórico diário de contagem dos segmentos | 02, 03 | banco + cron + testes | sim | — | X016, X021, X057, X101 |
| X104 | Adotar o modelo de regras v2 no front e ler contagem e amostra da RPC de audiência | 03 | front + testes | — | — | X016, X017, X099, X100 |
| X105 | Desenhar os grupos E/OU como no mock 03: selo, divisor, árvore e menu do grupo | 03 | front + testes | — | — | X099, X104 |
| X106 | Criar os campos de valor por tipo: vários valores, período, data, moeda e sim/não | 03 | front + testes | — | — | X055, X104, X105 |
| X107 | Montar o catálogo "Filtros Disponíveis" por categoria, com busca, contadores e arrastar | 03 | front + testes | — | — | X037, X038, X039, X040, X104, X106 |
| X108 | Completar o "Resumo do Segmento" e a amostra de contatos com números do servidor | 03 | front + testes | — | — | X055, X068, X102, X103, X104 |
| X109 | Criar as sub-abas "Prévia e Contatos" e "Sobreposição" do construtor | 03 | front + testes | — | — | X016, X055, X068, X104, X108 |
| X110 | Separar Salvar (rascunho) de Publicar, com salvamento automático e histórico de versões | 03 | front + testes | — | — | X099, X101, X104 |
| X111 | Encaixar a tela 03 no módulo: breadcrumb, cabeçalho, abas superiores e link direto | 03, 02 | front + docs + testes | — | — | X055, X060, X099 |
| X112 | Criar a lista lateral "Meus Segmentos" com abas, busca, filtro e cartões | 03 | front + testes | — | — | X055, X101, X110, X111 |
| X113 | Dar conteúdo real às abas Regras Avançadas, Audiências e Modelos | 03 | front + testes | — | — | X057, X103, X105, X106, X110, X111 |
| X114 | Refazer KPIs, filtros, seleção em massa, grade e paginação da biblioteca (tela 02) | 02 | front + testes | — | — | X055, X075, X101, X103, X111, X112 |
| X115 | Refazer colunas e ações de linha da biblioteca: critérios legíveis, uso e desempenho | 02 | front + testes | — | — | X055, X101, X103, X104, X112, X114 |
| X116 | Completar o painel "Detalhes do segmento": critérios, origem, composição e tags | 02 | front + testes | — | — | X038, X055, X101, X102, X104, X115 |
| X117 | Ligar sugestões e as abas "Insights com IA" a regras calculadas, com botão que aplica | 02, 03 | front + testes | — | — | X060, X076, X102, X103, X109, X113, X116 |

### Fase 10 — Criar, revisar e agendar campanha ([etapas por extenso](v4/etapas/F10-criar-revisar-e-agendar-campanha.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X118 | Criar o gerenciador de links rastreáveis no editor de mensagem | 08, 05, 14 | front | — | — | X021, X022, X055 |
| X119 | Gravar na RPC de rascunho os campos novos de público, mídia, botões e entrega | 08, 10 | banco + testes | sim | — | X009, X016, X017, X019, X057, X059, X060, X061, X064, X066 |
| X120 | Criar a RPC de checagens de lançamento `talkx_campaign_launch_checks` | 09, 10 | banco + testes | sim | — | X014, X016, X017, X019, X020, X032, X066, X118, X119 |
| X121 | Persistir as 3 confirmações e quem lançou; confirmar e agendar por RPC | 09 | banco + testes | sim | — | X014, X025, X120 |
| X122 | Encaixar o wizard no shell: stepper com teclado, rodapé fixo e saída com pendência | 08, 09 | front + testes | — | — | X014, X055 |
| X123 | Restaurar o rascunho inteiro (filtros, passo, opções) e salvar sozinho desde o passo 1 | 08 | front + testes | — | — | X009, X025, X119 |
| X124 | Passo 1 — nome com validação, objetivo com ícone e campo Responsável | 08 | front + testes | — | — | X009, X123 |
| X125 | Origem do público: Contatos ZAPP e CRM 360° resolvidos no servidor | 08 | front + testes | — | — | X016, X017, X036, X038, X055, X119, X123 |
| X126 | Os 7 filtros de audiência com o catálogo de filtros dos segmentos | 08 | front + testes | — | — | X016, X037, X038, X040, X107, X125 |
| X127 | Origem "Segmento salvo": escolher vários segmentos ativos, sem contar contato em dobro | 08, 09 | front + testes | — | — | X016, X057, X058, X119, X125 |
| X128 | Mensagem no wizard com o editor único: abas, barra, variáveis do mock e limite 4096 | 08 | front + testes | — | — | X020, X022, X062, X066, X087, X118, X122 |
| X129 | Anexar mídia por upload ("Selecionar arquivo") no wizard | 08 | front + testes | — | — | X061, X062, X119, X128 |
| X130 | Botões na mensagem da campanha: edição, prévia e aviso de fallback | 09 | front + testes | — | — | X064, X067, X096, X119, X128 |
| X131 | Painel "Resumo da campanha" calculado no servidor | 08 | front + testes | — | — | X016, X017, X058, X068, X125, X127 |
| X132 | Prévia em moldura de celular, contato de amostra real e "Ver no celular" | 08, 09 | front + testes | — | — | X016, X055, X062, X067, X125, X128 |
| X133 | Passo Entrega: conexão, velocidade, janela, horário comercial, dias, fuso e limites | 08, 10 | front + testes | — | — | X017, X018, X019, X060, X119, X124 |
| X134 | Revisão: linhas com dado real e "Editar" que leva ao passo certo e volta | 09 | front + testes | — | — | X016, X066, X120, X124, X127, X131, X133 |
| X135 | Revisão: Resumo operacional, recomendações acionáveis e "Tudo pronto" por checagens | 09 | front + testes | — | — | X055, X068, X074, X075, X076, X120, X131 |
| X136 | Modal "Confirmar disparo?" com 3 confirmações gravadas e lançamento que abre o monitor | 09 | front + testes | — | — | X013, X014, X016, X025, X055, X121, X135 |
| X137 | Tela 10 — data, horário, fuso, repetição, janela, throttle e supressão; salvar | 10 | front + testes | — | — | X017, X018, X055, X059, X060, X119, X133 |
| X138 | Tela 10 — calendário em português e "Resumo da Programação" em linha do tempo | 10 | front + testes | — | — | X025, X059, X068, X137 |
| X139 | Tela 10 — cabeçalho, "Resumo da Campanha" com dados reais e estado "pronta para envio" | 10 | front + testes | — | — | X009, X019, X055, X061, X068, X120, X127, X137 |

### Fase 11 — Acompanhar campanha ([etapas por extenso](v4/etapas/F11-acompanhar-campanha.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X140 | Criar a RPC `talkx_monitor_panel` (KPIs, comparativos, série por minuto, saúde do worker) | 11, 12, 13 | banco + testes | sim | — | X014, X019, X028, X030, X057, X068 |
| X141 | Criar as RPCs de leitura paginada: destinatários e linha do tempo da campanha | 11, 12, 13 | banco + testes | sim | — | X014, X024, X025, X028, X031, X033, X057, X058 |
| X142 | Criar as RPCs de leitura: progresso por segmento e pré-checagem de retomada | 11, 13 | banco + testes | sim | — | X019, X030, X057, X058, X059, X060, X066 |
| X143 | Rotear a campanha pela situação e dar endereço (URL) a cada tela de acompanhamento | 11, 12, 13 | front + testes | — | — | X055 |
| X144 | Trocar leituras com teto fixo por hooks das RPCs, com tempo real e modo degradado | 11, 12, 13 | front + testes | — | — | X055, X057, X140, X141, X142 |
| X145 | Tela 11: criar a aba "Monitor" no módulo, com cabeçalho, filtros e seletor de campanha | 11 | front + testes | — | — | X055, X057, X143, X144 |
| X146 | Mostrar KPIs ao vivo com comparativos e mini-gráficos nas telas 11 e 12 | 11, 12 | front + testes | — | — | X028, X030, X031, X055, X068, X140, X144 |
| X147 | Desenhar o ritmo com séries do servidor, janela, previsto e término (telas 11 e 12) | 11, 12 | front + testes | — | — | X019, X068, X140, X144 |
| X148 | Montar "Saúde da campanha", Pausar/Cancelar com modais do kit e chip de insights | 11, 12 | front + testes | — | — | X012, X013, X014, X024, X025, X055, X075, X076, X140, X144 |
| X149 | Criar o card "Fila por segmento" com total, enviadas, restante e progresso | 11 | front + testes | — | — | X055, X057, X058, X142, X144 |
| X150 | Unificar a tabela de destinatários: colunas, estados, busca, filtro e paginação | 11, 12 | front + testes | — | — | X028, X031, X055, X057, X058, X141, X144 |
| X151 | Adicionar ações por linha: abrir conversa, reenviar e bloquear o contato | 11, 12 | front + testes | — | — | X014, X030, X031, X055, X069, X071, X150 |
| X152 | Ler a "Linha do tempo operacional" do servidor, com tipos, ícones e "Ver todos" | 11 | front + testes | — | — | X025, X028, X030, X031, X141, X144 |
| X153 | Tela 12: montar cabeçalho, seletor, abas, anel de progresso e "Pico de respostas" | 12 | front + testes | — | — | X028, X055, X075, X143, X144, X146, X147, X150 |
| X154 | Tela 12: montar "Ações da campanha", "Configurações atuais" e a aba Configurações | 12 | front + testes | — | — | X006, X018, X019, X024, X055, X060, X148 |
| X155 | Tela 12: dar conteúdo real às abas Destinatários, Mensagens, Resultados e Logs | 12 | front + testes | — | — | X027, X028, X033, X141, X144, X150, X151 |
| X156 | Tela 13: criar `TalkXCampaignPaused.tsx` com cabeçalho, banner, Retomar e Encerrar | 13 | front + testes | — | — | X013, X014, X024, X025, X055, X143, X144, X148 |
| X157 | Tela 13: montar as 8 abas com conteúdo real | 13 | front + testes | — | — | X057, X059, X060, X142, X149, X150, X152, X154, X155, X156 |
| X158 | Tela 13: montar os 4 KPIs, o anel por audiência e o card "Segmentos da campanha" | 13 | front + testes | — | — | X057, X058, X140, X142, X146, X149, X153, X156 |
| X159 | Tela 13: criar o "Checklist para retomar" com 5 itens, verificação e persistência | 13 | front + testes | — | — | X019, X026, X030, X059, X060, X066, X142, X156 |
| X160 | Tela 13: montar linha do tempo, "Resumo de enviados" e "Principais métricas" | 13 | front + testes | — | — | X025, X027, X028, X057, X066, X075, X140, X152, X156 |

### Fase 12 — Relatório ([etapas por extenso](v4/etapas/F12-relatorio.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X161 | Reescrever `talkx_campaign_report`: KPIs, comparativo, séries, funil e período | 14 | banco | sim | — | X021, X028, X030, X041, X057, X066 |
| X162 | Criar os detalhamentos do relatório (calor, segmento, link, insights) e listas paginadas | 14 | banco | sim | — | X028, X030, X037, X038, X040, X057, X065, X074, X075, X161 |
| X163 | Criar `TalkXCampaignReport`: rota, cabeçalho, período, abas e 6 KPIs | 14, 01 | front + testes | — | — | X030, X055, X161 |
| X164 | Desenhar desempenho (4 séries), funil de 5 degraus e mapa de calor da campanha | 14 | front | — | — | X057, X161, X162, X163 |
| X165 | Montar "Resumo da campanha" e "Insights" com ações | 14 | front | — | — | X041, X057, X066, X075, X076, X161, X162, X163 |
| X166 | Entregar as abas Segmentos, Links, Audiência e Conversões e seus cartões-resumo | 14 | front | — | — | X037, X038, X040, X056, X057, X162, X163 |
| X167 | Entregar as abas Mensagens, Respostas e Logs com paginação no servidor | 14 | front | — | — | X025, X027, X028, X033, X055, X162, X163 |
| X168 | Exportar o relatório em PDF (sem `window.print`) e CSV, com permissão e trilha | 14 | front + testes | — | — | X162, X163, X164, X165 |
| X169 | Compartilhar o relatório por link interno e por e-mail; menu de mais ações | 14 | edge + front | — | sim | X021, X026, X161, X163, X165 |

### Fase 13 — Importação e vínculo com o CRM ([etapas por extenso](v4/etapas/F13-importacao-e-vinculo-com-o-crm.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X170 | Criar tabelas e RPCs de ingestão da importação de contatos | 15 | banco | sim | — | X014, X021, X036 |
| X171 | Criar a tela de importação: entrada, envio seguro do arquivo, mapeamento, prévia e regras | 15, 01 | front + testes | — | — | X055, X168, X170 |
| X172 | Detectar duplicados e aplicar a importação com carteira, consentimento e supressão | 15 | banco | sim | — | X017, X032, X036, X170 |
| X173 | Sugerir vínculo no CRM 360 pelas regras ligadas e executar a importação em lotes | 15 | edge + banco + cron | sim | sim | X036, X170, X172 |
| X174 | Executar a importação com progresso, KPIs e fila de pendentes de vínculo | 15 | front | — | — | X055, X170, X171, X172, X173 |
| X175 | Entregar as abas "CRM 360" (trazer contatos em lote) e "Resolver Conflitos" | 15, 08 | edge + front | — | sim | X036, X055, X170, X172, X173, X174 |

### Fase 14 — Supressão e Analytics ([etapas por extenso](v4/etapas/F14-supressao-e-analytics.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X176 | Criar RPCs de leitura da supressão: listagem paginada, KPIs e atividade | 06 | banco + testes | sim | — | X017, X029, X070, X071 |
| X177 | Criar RPCs de lote da supressão: importar com prévia e exportar por página | 06 | banco + testes | sim | — | X029, X071, X176 |
| X178 | Unificar o hook de supressão e paginar a tabela no servidor com colunas reais | 06 | front + testes | — | — | X030, X055, X176 |
| X179 | KPIs da supressão com janela e comparativo; Centro de proteção com medidor | 06 | front + docs + testes | — | — | X017, X176, X178 |
| X180 | Cinco filtros, busca por nome/telefone/e-mail, ordenação e visão em grade | 06 | front + testes | — | — | X055, X178 |
| X181 | Ações de linha, seleção em massa e modais de editar e remover com trilha | 06 | front + testes | — | — | X055, X071, X178 |
| X182 | Card Ações da lista, modal Adicionar contato e modal Gerenciar motivos | 06 | front + testes | — | — | X029, X070, X071, X178 |
| X183 | Importar CSV/XLSX/TXT e exportar CSV da lista de supressão | 06 | front + testes | — | — | X168, X171, X177, X182 |
| X184 | Atividade recente da supressão lida dos eventos de entidade | 06 | front + testes | — | — | X071, X176, X179 |
| X185 | Barra de filtros do Analytics, 5 KPIs com comparativo e card Comparativo de períodos | 07 | front + testes | — | — | X007, X055, X072, X073 |
| X186 | Gráfico Performance de campanhas com 4 séries e funil em SVG proporcional | 07 | front + testes | — | — | X072, X073, X185 |
| X187 | Top segmentos, mapa de calor por engajamento e tabela de melhor resultado | 07 | front + testes | — | — | X007, X074, X185 |
| X188 | Painel Insights com ações que aplicam de verdade e Resumo com estimativa condicionada | 07 (e 01) | front + testes | — | — | X007, X055, X075, X076, X185 |

### Fase 15 — Ajuda ([etapas por extenso](v4/etapas/F15-ajuda.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X189 | Transformar a Ajuda em central com artigos em markdown, índice, busca e leitor | 16 | front + docs + testes | — | — | X055 |
| X190 | Escrever os 8 tópicos e os 5 guias da Ajuda | 16 | docs + testes | — | — | X118, X163, X164, X165, X166, X167, X168, X169, X171, X172, X173, X174, X175, X189 |
| X191 | Ligar checklist, guia rápido, suporte, especialista e vídeos da Ajuda | 16, 08 | banco + front + docs | sim | — | X016, X017, X020, X021, X060, X189, X190 |

### Fase 16 — Qualidade e release ([etapas por extenso](v4/etapas/F16-qualidade-e-release.md))

| Etapa | O que faz | Tela | Camada | Banco | Edge | Exige |
|---|---|---|---|---|---|---|
| X192 | Fechar acessibilidade nas 17 telas: teclado, foco, leitor de tela e contraste nos dois temas | 01–17 | front + testes | — | — | X191 |
| X193 | Fechar o comportamento em telas menores: 1280, 1024 e 390 px | 01–17 | front + testes | — | — | X191 |
| X194 | Garantir desempenho: cada tela em arquivo próprio, listas grandes e orçamento do carregamento inicial | 01–17 | front + testes | — | — | X191 |
| X195 | Tornar a régua visual uma trava: regressão visual obrigatória nas 17 telas | 01–17 | testes | — | — | X004, X192, X193 |
| X196 | Provar o banco limpo: ledger, catálogo, replay do zero e permissões do módulo | — | banco + testes | sim | — | X191 |
| X197 | Reescrever a documentação do módulo a partir da evidência | — | docs | — | — | X002, X196 |
| X198 | Fazer o aceite visual 17/17 em produção, tela a tela, com o dono | 01–17 | testes + docs | — | — | X192, X193, X194, X195, X196 |
| X199 | Rodar a primeira campanha para clientes reais, pequena, e observar por 7 dias | 08–14 | testes + docs | — | — | X198 |
| X200 | Publicar o release: versão, registro de mudanças, pendências assumidas e encerramento | — | docs | — | — | X197, X198, X199 |

---

## 8. Cobertura

- **Elementos das imagens:** 1.135 no inventário; 217 prontos; 918 a fechar → 898 em etapas, 20 excluídos com motivo, **0 sem cobertura** (tabela por tela na seção 1).
- **Capacidades do motor:** 93 a fechar → 92 em etapas, 1 excluída (CAP-095, campanha por e-mail — decisão N45).
- **Etapas do V3:** as 89 em aberto (V12–V100) estão absorvidas — seção 10.

### Excluídos conscientemente

Só entram aqui: o que é do app e não do módulo, o que depende de gravação humana, o que é ilegível na imagem e número sem significado definível.

| Elemento | Motivo |
|---|---|
| T01-002 | Shell global — badge do Chat na sidebar (A1) |
| T01-004 | Shell global — badge do Email na sidebar (A1) |
| T01-005 | Shell global — itens e ordem da sidebar (A1) |
| T01-006 | Shell global — posição e ícone de "Campanhas" na sidebar (A1) |
| T01-007 | Shell global — grupos da sidebar (A1) |
| T01-008 | Shell global — grupo "Vendas & CRM" da sidebar (A1) |
| T01-009 | Shell global — rodapé da sidebar (A1) |
| T01-011 | Shell global — 6 ícones da barra superior (A1) |
| T01-012 | Shell global — pílula "Online" da barra superior (A1) |
| T01-013 | Shell global — ícone de tema na barra superior (A1) |
| T01-014 | Shell global — sino de notificações (A1) |
| T01-015 | Shell global — avatar na barra superior (A1) |
| T03-025 | Elemento ilegível no mock: glifo diferente do ⋮ nos cartões "Recompra" e "Leads Quentes", não identificável nem com ampliação 2×. Os cartões recebem o ⋮ padrão (X112). |
| T03-075 | Elemento ilegível no mock: 6º cartão de "Básicos" encoberto pela seta →. A categoria é preenchida com os filtros reais do anexo (X107). |
| T16-035 | Vídeo "Criando uma campanha do zero · 04:32": depende de gravação humana (A16). A seção e o player entram em X191; o item aparece quando o arquivo existir. |
| T16-036 | Vídeo "Segmentação com CRM 360° · 05:18": idem. |
| T16-037 | Vídeo "Analisando resultados no Talk X · 06:24": idem. |
| T16-040 | "Tempo médio de resposta · < 5 minutos": número sem significado definível — o destino é um WhatsApp/chat/e-mail configurado, não uma fila de suporte com medição. No lugar entra o horário de atendimento configurado (X191). |
| T17-002 | Shell global — sinos e avatar no topo da prancha (A1) |
| T17-010 | Shell global — sidebar da prancha (A1) |
| CAP-095 | Campanha por e-mail / multicanal: o motor envia só WhatsApp (decisão N45). A coluna e o filtro "canal" existem com o valor real. |

Exclusões parciais dentro de elementos cobertos (o elemento entra; um detalhe do mock não):

- **Rótulos de CRM que a empresa não usa** (HubSpot, Salesforce, Pipedrive, RD Station, tela 15): a coluna "Origem" entra com a origem real (CRM 360, Bitrix24, planilha).
- **Opções de canal além de WhatsApp e ícone de e-mail** (telas 01, 04, 07): decisão N45.
- **Contagens ilustrativas** ("8 artigos", "+32%", "38%", "2,3×"): entram só quando calculadas de dado real; até lá, "sem dados ainda".
- **Selos "(Oficial)" e "Conta comercial"** (tela 09): a conexão é Evolution GO, não a API oficial; o selo não é exibido.
- **Barra superior global do mock** (6 ícones, "Online", sino, avatar) e sidebar: são do app; só a busca do módulo entra (X054).

---

## 9. Riscos do próprio plano

| Risco | Efeito | Tratamento |
|---|---|---|
| Vendas não chegam do Bitrix24 ligadas a um telefone | Filtros de compra, ticket, RFM e a receita do relatório ficam em "sem dados ainda" | X039, X040, X056 medem a cobertura por atributo antes de qualquer tela depender dela; decisão N36 |
| Botão/enquete não aparece no aparelho (conexão não oficial) | Parte dos mocks 04 e 09 não se sustenta | Fallback em texto + link; X064, X096 só fecham com teste em aparelho; decisão N03 |
| O número de campanha é o mesmo do atendimento | Bloqueio do número para a empresa toda | Teto de ritmo, limite diário, horário de silêncio e uma campanha por conexão (X018, X019, X060); ensaio antes de cliente (X035) |
| pg_cron já falha ao iniciar jobs | Retomada automática e agendamento atrasam | X012 reaproveita o job existente, com timeout; X033 alerta campanha parada |
| 63 migrations e 23 deploys esperando aprovação | O prazo vira o tempo de resposta do dono | Decisões N43 e N44 |
| Várias sessões no mesmo arquivo | Trabalho sobrescrito, como em setembro | Pontos de colisão da seção 6; X042 divide o arquivo compartilhado |
| Repositório público | Este plano e o inventário descrevem fragilidades ainda abertas (papel só na tela, agendador sem segredo próprio, conversão sem autenticação) | São as primeiras a fechar: X014, X015, X022, na fase 2 |
| O plano envelhecer como os anteriores | ✅ sem prova | Placar gerado por script (X002) e verificador do corpo da PR (X005) |

---

## 10. V3 → V4

V01–V11 já estão na `main`:

| V3 | PRs |
|---|---|
| V01 · Fechar o vazamento da view `talkx_campaign_metrics` (P0-1) | #1169 |
| V02 · Eliminar a ambiguidade de `transition_talkx_campaign` (P1-1) | #1175 |
| V03 · Scheduler só retoma pausas automáticas (P1-2) | #1190 |
| V04 · Corrigir FK `blocked_by`/`removed_by` e padronizar autoria (P1-4) | #1183 |
| V05 · Reconciliar os drifts de `talkx_blacklist` | #1239 |
| V06 · Migrations replayáveis + policy de UPDATE em `talkx_settings` (P2-6, P1-6) | #1253, #1382 (resta a PR #1333, aberta) |
| V07 · Unicidade parcial na supressão (P2-1) | #1264, #1269, #1340 |
| V08 · Remover todo número fabricado e confirmações que não bloqueiam (P1-5) | #1272 |
| V09 · "Editar limites" via RPC (P1-3) | #1287, #1326, #1344, #1346, #1361 |
| V10 · E2E `talkx.spec.ts:160` verde e rodando em PR (P1-7) | #1292 |
| V11 · Ampliar o contrato de eventos | #1186, #1220 |

V12–V100, e onde cada uma foi parar:

| V3 | Título no V3 | Etapas do V4 |
|---|---|---|
| V12 | Servidor grava os eventos do ciclo de vida | X024, X025, X152 |
| V13 | Pausa com motivo, retomada idempotente | X010, X013, X024, X025, X148, X156 |
| V14 | Cancelar marca pendentes e estados terminais consistentes | X024 |
| V15 | Contadores íntegros: `replied_count` protegido, `use_count` único (P2-7, P2-4) | X026 |
| V16 | Séries temporais contam `sent` + `delivered` (P2-5) | X072, X074, X140, X161, X186, X187 |
| V17 | Lidas reais (`read_at`) e KPI liberado | X027, X028, X073, X186 |
| V18 | Respostas: janela configurável, tempo médio, sem recálculo no cliente | X027, X028, X155, X160, X185 |
| V19 | Retry manual, política de `outcome_unknown` e eventos de conexão | X012, X025, X031, X033, X151 |
| V20 | Limite diário por conexão e horário comercial configurável | X018, X019, X060, X133, X154 |
| V21 | Flags de lançamento persistidas | X017, X032, X119, X121, X136 |
| V22 | Botões "Editar" da revisão respeitam a rota | X134 |
| V23 | Rascunho restaura tudo | X009, X123 |
| V24 | Filtros de audiência reais e compartilhados com segmentos | X016, X100, X125, X126 |
| V25 | Passo 1: responsável, validação e segmentos ativos | X009, X124, X127, X133 |
| V26 | Um editor de mensagem para template e wizard | X009, X066, X087, X128 |
| V27 | Mídia: bucket privado, upload, URL assinada, snapshot | X061, X062, X083, X095, X119, X129 |
| V28 | Rail do wizard com `PhonePreview` e "Ver no celular" | X088, X131, X132 |
| V29 | Layout do wizard: sticky, Sheet, breadcrumb, dirty real | X122 |
| V30 | Recorrência e validação de agendamento | X015, X059, X119, X137, X138 |
| V31 | Roteamento por status completo | X139, X143, X145, X163 |
| V32 | Tela Agendada completa (10) | X119, X137, X138, X139 |
| V33 | Monitor: KPIs completos, ETA, janela, previsto | X058, X068, X140, X145, X146, X147, X153 |
| V34 | Saúde real e fila por status | X058, X140, X142, X144, X148, X149 |
| V35 | Destinatários e timeline acionáveis | X058, X141, X144, X150, X151, X152, X155 |
| V36 | Tela Pausada (13) — `TalkXCampaignPaused.tsx` | X026, X142, X156, X157, X158, X159, X160 |
| V37 | Relatório (14) — base: `TalkXCampaignReport.tsx` + `useTalkXReport` | X161, X162, X163, X166, X167 |
| V38 | Relatório: funil e heatmap por campanha | X162, X164, X186 |
| V39 | Relatório: resumo, links, insights, "Ver campanha" | X021, X041, X165, X166 |
| V40 | Exportar relatório e compartilhar | X168, X169 |
| V41 | KPIs por RPC (`useTalkXStats`) | X044, X072, X077, X185 |
| V42 | Tabela sobre `TalkXTable`: ordenação, massa, entregues, virtualização | X043, X078, X079, X081, X114 |
| V43 | Ações de linha: presets, persistência, optimistic | X026, X049, X051, X080 |
| V44 | Grade completa | X081, X114 |
| V45 | Deep link de aba, `ModuleTabs`, breadcrumb | X007, X052, X053, X094, X111 |
| V46 | Rail da Visão geral | X082 |
| V47 | FilterBarV2 completa e ⌘K que navega | X045, X054, X081, X094, X111 |
| V48 | `talkxConstants.ts`, IconTile, TalkXKit | X042, X055 |
| V49 | Motion aplicado e `InsightCard` no carvão | X044, X082, X188 |
| V50 | Estados do sistema aplicados + QA visual da tela 01 | X046, X047, X048 |
| V51 | Extrair `TalkXSegmentBuilder.tsx` com reducer, undo/redo e validação | X008, X099 |
| V52 | Semântica visual AND/OR fiel ao mock 03 | X105, X106 |
| V53 | Catálogo de filtros e operadores | X100, X104, X106, X107 |
| V54 | Resumo do segmento em tempo real | X102, X104, X108 |
| V55 | Tags, status, descrição, favorito otimista | X101, X112, X114, X116 |
| V56 | Autosave e versões do segmento | X101, X110 |
| V57 | Sobreposição entre segmentos | X068, X100, X109 |
| V58 | Prévia e contatos do segmento | X109 |
| V59 | Painel de detalhes completo | X102, X116, X117 |
| V60 | KPIs e biblioteca honestos + QA telas 02/03 | X103, X114, X115 |
| V61 | Galeria fiel ao mock 04 | X083, X088, X089, X090, X091 |
| V62 | Rail de templates honesto | X092 |
| V63 | Editor: sub-tabs, emoji/link, dropzone | X094, X095, X098 |
| V64 | Importar/exportar templates | X085, X093 |
| V65 | Variáveis completas com fallback e paridade | X020, X087, X128 |
| V66 | Versões de template completas | X066, X084, X098 |
| V67 | "Testar" com trilha, limite e conexão escolhida | X067, X090, X132 |
| V68 | A/B robusto | X020, X065, X085, X097 |
| V69 | Benchmarks liberados | X074, X075, X086, X091, X103, X135, X185, X187 |
| V70 | QA telas 04/05 | aceite de tela embutido em cada etapa de templates (X083–X098) e na régua (X004) |
| V71 | Um único hook de supressão | X176, X178 |
| V72 | KPIs e tabela reais | X176, X178, X179 |
| V73 | Filtros, ações e seleção em massa | X180, X181 |
| V74 | Rail "Centro de proteção" real | X177, X179, X182, X183, X184 |
| V75 | Importar contatos para a supressão | X177, X183 |
| V76 | Adicionar e editar com expiração | X071, X181, X182 |
| V77 | Motivos personalizados | X070, X182 |
| V78 | Opt-out automático configurável e idempotente | X029, X030, X071 |
| V79 | Remover com trilha, desfazer e bloqueio 24h | X071, X181, X184 |
| V80 | Supressão em todo o funil + QA tela 06 | X016, X017, X025 |
| V81 | UI de links rastreáveis | X021, X022, X118, X128 |
| V82 | Conversão autenticada e relatório de links (P2-8) | X021, X022 |
| V83 | Insights com ação e sem regra morta | X075, X076, X117, X135, X162, X165, X188 |
| V84 | Configurações vivas | X014, X018, X069 |
| V85 | Alertas e observabilidade | X012, X033 |
| V86 | Importação de contatos: upload seguro e preview (15) | X170, X171 |
| V87 | Matcher e criação em lote | X172, X173 |
| V88 | CRM 360 (Bitrix24): vínculos e pendentes | X036, X125, X173, X174, X175 |
| V89 | CRM 360 no wizard e nos segmentos | X037, X038, X100, X125, X175 |
| V90 | Conversões pelo CRM + QA tela 15 | X039, X041 |
| V91 | Ajuda real (16) | X189, X190, X191 |
| V92 | Modais e estados padronizados (17) | X049, X050, X051, X055 |
| V93 | Acessibilidade e mobile | X192, X193 |
| V94 | Performance e bundle | X069, X194 |
| V95 | E2E completo e regressão visual | X003, X004, X034, X195 |
| V96 | Documentação verdadeira | X001, X002, X190, X197 |
| V97 | Aceite visual 17/17 autenticado | X004, X195, X198 |
| V98 | Banco: ledger, catálogo e replay limpos | X014, X069, X071, X196 |
| V99 | Smoke em produção e observação | X023, X035, X199 |
| V100 | Release honesta e encerramento | X001, X002, X057, X127, X200 |

Doze lacunas do V3 que o inventário do motor apontou e que agora têm etapa: continuidade do envio em lotes e retomada (X010, X011, X012, X013); papel no banco (X014); segredo do agendador (X015); audiência no servidor (X016, X017); vários segmentos e fila por segmento (X057, X058); botões e enquete (X063, X064); envio pela conexão escolhida (X019); variável sem valor (X020); precedência e vencedor do A/B (X020, X065); pedido de saída ligado à campanha (X029, X030); consentimento e retenção (X032); previsões no servidor (X068).
