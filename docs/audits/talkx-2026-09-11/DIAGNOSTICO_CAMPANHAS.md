# Campanhas / Talk X — diagnóstico de paridade e funcionamento

> **STATUS: HISTÓRICO (baseline de 11/09/2026).** Este documento descreve o estado observado em `9251ac45` e não deve ser usado como retrato da `main` atual. Os achados de integridade C01, C04–C10 e C13–C15 receberam correções totais ou parciais nas PRs [#368](https://github.com/adm01-debug/Zapp_Web_V2/pull/368), [#369](https://github.com/adm01-debug/Zapp_Web_V2/pull/369) e [#371](https://github.com/adm01-debug/Zapp_Web_V2/pull/371). Paridade visual, CRM 360°, telas dedicadas e aceite 17/17 continuam pendentes. Consulte o [registro de triagem](../TALKX_AUDIT_ARCHIVE_2026-09-11.md) e o [estado atual do plano](../../talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md#estado-de-execução-em-12092026).

Data: 11/09/2026. Escopo: as 17 referências fornecidas, o plano TalkX, os caminhos de UI/dados relacionados e sondagens locais sem serviços externos.

## 1. Veredito

O módulo tem uma implementação real e aproveitável, mas **não está entregue com a paridade das 17 referências**. A distância não decorre principalmente de uma versão antiga no Vercel nem de uma simples troca de cores. Há quatro problemas distintos:

1. O plano foi executado parcialmente e alguns requisitos foram simplificados já na especificação.
2. Há itens registrados como concluídos que não estão conectados à interface ou não satisfazem o requisito descrito.
3. Existem defeitos funcionais em rascunhos, filtros, navegação e agendamento, reproduzidos nesta auditoria.
4. O processo de validação não exige a prova visual e funcional necessária para declarar paridade.

**Não atribuir nota 10/10 nem percentual de paridade.** Nenhuma comparação pixel a pixel autenticada das 17 telas foi executada nesta rodada. Ter um componente com nome correspondente ao mock não prova a entrega da tela.

O tema carvão deve permanecer. A regra 1 do próprio plano exige carvão e a regra 2 limita azul a acentos. Portanto, o objetivo correto é fidelidade de composição, densidade, hierarquia e interação adaptada ao carvão — não identidade de pixels com os fundos navy dos PNGs.

## 2. Bases verificadas e limites

| Camada | Evidência desta rodada | Interpretação |
|---|---|---|
| Checkout local | `b78011d2ddf8c8e2089e80559b5fde9bf0379e8a` | Uma atualização atrás da main consultada. Não foi feito pull/reset. |
| GitHub main | `9251ac45fbee046a9a8f70e3cce8fdd1ea83387c` | PR #361: campanha em andamento e edição de limites. Seu conteúdo foi considerado no diagnóstico. |
| Alias público Vercel | GET `/version.json` → 200, `buildId=9251ac45fbee046a9a8f70e3cce8fdd1ea83387c` | O frontend público anuncia a mesma versão da main consultada. Não é um caso explicado apenas por deploy atrasado. |
| Checks do SHA remoto | CI/CD, DB Live Guard, DB Guard offline, CodeQL e Deploy Edge Functions: success | Evidência de infraestrutura/contratos, não de fidelidade visual. |
| Código dos defeitos reproduzidos | Diff vazio local→remote para `useCampaignEditor`, wizard, delivery, suppression e `useTalkXSegments` | As sondagens não estão denunciando apenas código local já corrigido na main. |
| Navegador público | A URL solicitada redirecionou para `/auth` | Não foi possível observar a UI autenticada de produção. |
| Navegador autenticado via MCP | Falha: extensão Playwright não instalada no perfil configurado | Nenhuma sessão foi inventada e nenhum controle de autenticação foi contornado. |
| Banco | Tipos gerados, migrations, funções e resultado do DB Live Guard inspecionados | Não foi feito SQL direto no banco canônico nesta rodada; não se afirma incidência/volume real dos defeitos nos dados. |
| Referências | Diretório local com os 17 PNGs, manifesto e leia-me | Diretório estava untracked e foi preservado. Não equivale a baseline visual automatizada. |

O Graphify disponível não retornou nós relevantes para TalkX. Por isso, a investigação prosseguiu com leitura de arquivos e histórico Git, sem reconstruir o grafo.

Nenhum envio de WhatsApp, insert/update/delete de produção, migration, push ou deploy foi executado. Os únicos arquivos mantidos por esta auditoria são este relatório e as sondagens opt-in no mesmo diretório.

## 3. O problema específico da URL e da tela Nova campanha

### C01 — Deep link incompleto

**Evidência:** `TalkXView.tsx` inicializa `topView` como `tabs`. `useCampaignEditor.ts:76` inicializa `step` em 1. `TalkXCampaignWizard.tsx:53` escreve `wizard` e `step` usando `history.replaceState`, mas não existe leitura desses parâmetros para reconstruir o fluxo. A main remota adiciona `running`, não corrige essa inicialização.

**Efeito:** copiar/recarregar a URL `?view=talkx&wizard=new&step=1` não garante abrir o wizard; `step=3` também não restaura o passo 3. A URL aparenta representar um estado que o aplicativo não sabe restaurar. Ao sair, também não existe limpeza explícita desses parâmetros em `backToList`.

**Correção indicada:** definir um único contrato de rota, resolver ID/permissão antes de abrir edição, restaurar os passos somente com pré-requisitos válidos, sincronizar Voltar/Avançar do navegador e limpar parâmetros ao retornar à lista. Testar link direto, refresh, ID inexistente, acesso negado e mudança de campanha.

### C02 — A composição do wizard foi alterada, não apenas reestilizada

| Item da referência 08 | Código atual | Consequência |
|---|---|---|
| Nome, objetivo, responsável | Nome, objetivo, conexão WhatsApp; descrição adicional aberta | Organização e fluxo diferentes; responsável não foi implementado nesse formulário. |
| Origem ZAPP / CRM 360° / segmento | ZAPP / segmento / CRM, este sempre disabled | Ordem diferente e uma opção indisponível. |
| Grade ampla de filtros | Card aninhado de seleção manual de contatos | Densidade e uso do espaço mudam radicalmente. |
| Mensagem visível abaixo do público no PNG 08 | `StepMessage` só renderiza com `step === 2` | Na URL step=1, nunca será igual a essa composição. |
| Selecionar arquivo | Campo para URL pública de mídia | Interação diferente, não um detalhe cosmético. |
| Resumo e ações à direita | Resumo à direita; botões no fluxo da coluna esquerda | Hierarquia e posição das ações divergem. |
| Rail persistente / ações sempre disponíveis | `space-y-4`, sem sticky no rail; rodapé sem fixed/sticky | O comportamento prometido no E61 não está implementado. |
| Resumo em Sheet em telas pequenas, no plano | Grid vira uma coluna com rail abaixo | Falta o comportamento responsivo especificado. |

O plano E64 deliberadamente coloca Mensagem no passo 2. Isso precisa ser reconciliado com o PNG 08: a especificação não pode simultaneamente exigir as duas composições sem definir o comportamento. Não é necessário mudar o carvão para resolver nada disso.

Fontes: `TalkXCampaignWizard.tsx:107`, `:112`, `:185`, `:214`, `:263`, `:320`, `:398`; plano E61–E64.

### C03 — Filtros registrados como concluídos não estão entregues

`PARIDADE.md` declara seis filtros em E63. Porém:

- `TalkXContactSelector.tsx` só recebe e apresenta empresa e tag, além da busca textual.
- O hook declara cidade, grupo, inatividade e aniversário, mas o wizard não passa controles correspondentes ao seletor.
- A query de contatos seleciona apenas `id, name, nickname, phone, company, avatar_url, tags`.
- As regras de cidade/grupo tentam ler `city`/`group`; aniversário tenta ler `birth_month`; inatividade tenta ler `last_contact`. Esses campos não vêm da consulta.
- Na simulação, selecionar uma cidade deixa zero resultados; o comportamento independe da cidade real dos contatos, porque ela não foi carregada.
- “Próximos 30 dias” compara mês atual e seguinte, não uma janela real de 30 dias.
- O requisito original também incluía status, estágio e vendedor; ele foi substituído por outro conjunto de estados no hook sem equivalência funcional.
- A lista renderiza `.map` de todos os contatos carregados; não é virtualizada como pede E63.

**Correção indicada:** estabelecer campos reais e uma única semântica de filtros; UI → regras → consulta/contagem → persistência → destinatários. Não basta acrescentar setters. Testar cada filtro isoladamente e em combinações, incluindo nulos e fronteiras de datas.

## 4. Defeitos funcionais confirmados por sondagens locais

As sondagens importam o hook real e, em dois casos, renderizam o wizard real. O acesso à rede é substituído por fixtures. As chamadas não previstas ao Supabase lançam erro. Os testes **assertam o comportamento defeituoso observado**, portanto PASS significa “defeito reproduzido”, não “funcionalidade aprovada”.

| # | Cenário | Resultado observado | Prioridade |
|---|---|---|---|
| R01 | Salvar duas vezes o mesmo editor de campanha nova | Dois IDs de campanha; dois creates, zero updates | P1 |
| R02 | Alterar nome, esperar autosave; alterar descrição, esperar outro autosave | Duas campanhas criadas | P1 |
| R03 | Filtrar cidade no hook com a projeção usada pela query | A seleção fica vazia, pois city não foi carregado | P1 |
| R04 | Selecionar contato cujo telefone está na blacklist, sem bloqueio por contact_id | Resumo mostra 0 suprimidos e 1 elegível antes de salvar | P1 |
| R05 | Buscar texto e clicar limpar filtros | Busca textual continua ativa | P2 |
| R06 | Inicializar editor com `step=3` na URL | Estado inicial continua 1 | P1 |
| R07 | Autosave inicial sem contatos; selecionar somente um contato depois | Nenhum novo autosave e nenhum addRecipients | P1 |
| R08 | Abrir agendamento `12:00Z`, definir São Paulo e salvar | Regrava `15:00Z`: deslocamento de 3 horas | P1 |
| R09 | Renderizar step 1 | CRM disabled; mensagem e filtros avançados não aparecem | Gap de escopo/layout |
| R10 | Formulário inválido, botão Continuar | Botão HTML continua habilitado; apenas CSS bloqueia ponteiro | P1/a11y |
| R11 | Duplicata representada por objeto de campanha com `id=''` | O hook tenta update com ID vazio em vez de create | P1 |

### C04 — Falta identidade persistente do rascunho

`handleSave` decide entre create/update exclusivamente pelo objeto `campaign` recebido na abertura. Depois do primeiro create, não guarda o ID para próximos saves. O autosave reutiliza o mesmo caminho. Além de poluir a lista de rascunhos, o mesmo usuário pode acabar editando cópias diferentes do que acredita ser um único registro.

A comparação do autosave também omite seleção manual, filtros e `scheduleTimezone`. No branch de edição, o hook atualiza a campanha, mas não reconcilia destinatários. O seletor esconde a seleção quando recebe uma campanha existente.

**Correção indicada:** ID de draft persistente, serialização de saves, revisão otimista e recuperação após erro parcial. Separar salvar rascunho de materializar a audiência de envio. Testar rede lenta, digitação durante save, mudança só de público, refresh, retomar rascunho e clique duplo. Não apagar possíveis duplicatas reais sem inventário e aprovação.

Fonte: `useCampaignEditor.ts:305`, `:313`, `:317`, `:374`; `TalkXContactSelector.tsx:64`, `:103`.

### C05 — Duplicação e transição após lançamento

Duplicação: `TalkXView.tsx:46` cria um objeto truthy com ID vazio. O hook usa `if (campaign)` e entra em update. R11 reproduz o contrato entre esses dois caminhos.

Navegação: `TalkXCampaignWizard.tsx:116` chama `onLaunched(id)` e em seguida `onClose()`. No pai, o primeiro abre monitor, mas `backToList` volta a `tabs` e limpa `monitorId`. A composição de callbacks contradiz a intenção de abrir o monitor. Esse ponto foi identificado por leitura do fluxo; não houve lançamento em produção.

**Correção indicada:** duplicata deve ser um payload de criação sem identidade antiga; usar transições exclusivas para salvar, fechar, agendar e lançar. Não encadear fechar genérico depois de uma navegação de sucesso.

### C06 — Fuso e validação incompletos

O editor inicializa `scheduledAt` por `toISOString().slice(0,16)`, ou seja, hora UTC apresentada como se fosse hora local. Na gravação, interpreta esse valor usando o fuso selecionado. O resultado confirmado é deslocamento ao reabrir e salvar.

Prévia e rail usam `new Date(ed.scheduledAt)` e o fuso do navegador, não a mesma conversão do payload. A janela do backend é fixa em São Paulo, independentemente do fuso escolhido para início. O fuso selecionado não é persistido no payload da campanha.

**Correção indicada:** converter UTC para o fuso da campanha ao editar, manter uma só função de interpretação para payload/prévia/validação e definir explicitamente o fuso das janelas. Testar round-trip sem alteração, meia-noite, mudança de dia, fusos com horário de verão e data passada. `canProceed[3]` atualmente verifica apenas se há string de data.

Fonte: `useCampaignEditor.ts:44`, `:83`, `:110`, `:278`, `:296`; `TalkXWizardDelivery.tsx:48`, `:73`; `talkx-send/index.ts:190`.

### C07 — CSS usado como validação

O botão Continuar recebe `opacity-50 pointer-events-none`, mas `PrimaryButton` não recebe/propaga `disabled`. O callback `next()` não revalida o passo. Isso não constitui bloqueio semântico de teclado ou de acionamento do handler.

**Correção indicada:** disabled real, guard no handler e validação independente na operação de persistência/lançamento. Revalidar todos os passos na confirmação; não confiar apenas nos três checkboxes finais.

## 5. Analytics e dados: não há correspondência entre todos os indicadores e os eventos reais

### C08 — Funil com dados fabricados

`TalkXAnalytics.tsx:149` contém:

```ts
Entregues = stats.delivered || Math.round(stats.sent * 0.964)
Lidas = Math.round((stats.delivered || stats.sent) * 0.128)
Conversões = Math.round((stats.delivered || stats.sent) * 0.046)
```

Com 1.000 envios e zero entregas registradas, o gráfico produz 964 entregas, 128 leituras e 46 conversões. Zero real é tratado como motivo para inventar um valor positivo. Não é projeção rotulada. Essa lógica permanece na main consultada; a alteração recente em Analytics foi uma anotação de tipo, não uma correção das fórmulas.

Isso viola a regra 3 do plano: “Zero número fabricado”. Retirar `Math.random()` de outro gráfico não resolveu essa categoria de problema.

**Correção indicada:** remover fallback fictício; distinguir zero, desconhecido, carregando, indisponível e estimativa. Criar contrato por métrica com evento fonte, unidade, numerador, denominador, janela, atribuição e timezone. Nenhum KPI comercial deve ser aprovado apenas porque parece o mock.

### C09 — Métricas com unidades/semântica incorretas

- Overview mostra `sent` como “Contatos alcançados”: é soma de envios, não contatos únicos.
- “Em andamento” inclui pausadas e usa a própria quantidade como delta percentual, sem período anterior.
- Suppression calcula `totals.total` pelo número de entradas e o apresenta no rail como “campanhas protegidas”.
- “Opt-outs 30 dias” filtra somente `origin==='optout'`, sem recorte temporal; o webhook usa também `auto_optout`.
- O rail de supressão exibe LGPD como string fixa `'0'`.
- O construtor classifica audiência >10.000 como risco baixo apenas pelo tamanho, sem saúde da base, consentimento ou evidência de entrega. É uma heurística inadequada para afirmar segurança operacional.
- A coluna “Desempenho” da biblioteca de segmentos usa `estimated_count / maior estimated_count`, isto é, tamanho relativo de público, não desempenho de campanha.
- Analytics infere respostas por mensagens de contato em uma janela de 24h após algum envio; não é atribuição inequívoca por campanha. Consultas limitadas a 5.000 linhas podem distorcer a taxa.
- O mapa de calor atual contabiliza envios, não respostas/conversões. Pode ser útil, mas não entrega a métrica ilustrada nos mocks de relatório.

Fontes: `TalkXOverview.tsx:95`, `:121`; `TalkXSuppression.tsx:94`, `:176`, `:239`; `TalkXSegments.tsx:237`; `TalkXAnalytics.tsx:43`, `:88`.

### C10 — Faltam contratos para vários blocos dos modelos

No schema versionado, `talkx_recipients` possui sent/delivered/status/variant, mas não os campos de correlação e eventos previstos para leitura/resposta/clique/conversão. O caminho de sucesso do sender grava status e sent_at, não o identificador externo retornado pelo provedor. Não foi localizado o vínculo completo de ACK com destinatário que sustentaria todos os painéis.

Também não foi encontrada a tabela prevista `talkx_campaign_segments`. A campanha mantém um `segment_id`. Consequentemente, filas e resultados genuinamente multissegmento não estão entregues simplesmente por haver uma tabela/gráfico no frontend.

O plano já reconhecia essas lacunas e as deslocava para E75 e E86–E90. Isso é backlog de produto/backend, não tarefa de CSS e não evidência de que migrations aplicadas incorretamente sejam a causa atual.

**Correção indicada:** identidade do envio, ingestão idempotente de eventos, atribuição explicitada, agregação no servidor, multi-segmento e histórico. Preservar unknown para eventos antigos sem prova — não retropreencher leituras/conversões presumidas.

## 6. Supressão: banco avançou mais que a interface

### C11 — Hook novo não conectado; tabela ainda segue modelo antigo

As migrations e `useTalkXSuppression.ts` introduzem telefone avulso, códigos e expiração. Porém a busca de consumidores desse hook em `src` não encontrou integração com a tela. `TalkXSuppression.tsx` mantém consulta/CRUD próprios.

Conflitos com `PARIDADE.md`:

| Registrado como entregue | Implementação acessível |
|---|---|
| Telefone avulso e `reason_code` na UI | Interface `BlacklistEntry` não os contempla; inclusão exige contato existente. |
| Export com fallback para `b.phone` | Export usa exclusivamente `b.contacts?.phone`. |
| Coluna Expira em | Não encontrada na tabela renderizada. |
| Alternância Ativas / Histórico | Consulta fixa `removed_at IS NULL`; não há alternância. |
| Card Motivos / Expiram em breve | Não encontrado na composição atual. |

Além disso, o select “por página” recebe `onPageSize={() => {}}`: a ação visual existe, mas não altera o tamanho da página. A consulta da tela não exclui expirados, enquanto o sender exclui. Uma entrada pode aparecer como bloqueio ativo na tela e não bloquear o envio.

O hook novo também precisa revisão antes de ser ligado: `isSuppressed` considera expiração, mas não filtra `removed_at IS NULL`; ligá-lo cegamente reintroduziria bloqueios removidos.

**Correção indicada:** consolidar um contrato de supressão consumido pela tela, contagem, importação e sender; normalização de telefone consistente; exclusão lógica, expiração e motivo com a mesma semântica. Corrigir tabela, busca, CSV e indicadores usando testes de telefone avulso, contato removido e bloqueio expirado.

### C12 — Resumo de elegibilidade não é o mesmo cálculo do envio

R04 prova ausência de supressão por telefone no resumo antes de salvar. Para segmentos, `suppressedCount` retorna 0 por definição. Não significa que todos os contatos do segmento sejam elegíveis.

A contagem por telefone é preenchida apenas em `handleSave`, tarde demais para a revisão exibida. O usuário confirma números que não são a simulação fiel do envio.

**Correção indicada:** endpoint/RPC de preflight com contagens mutuamente exclusivas: selecionados, duplicados, telefone inválido, suprimidos, sem consentimento, elegíveis. Mesmo predicado no lançamento e rechecagem no consumo da fila. Não somar contagens sobrepostas de contact_id e telefone.

## 7. Escala e motor: riscos adicionais identificados por leitura

Estes pontos não foram exercitados enviando mensagens. São riscos técnicos demonstrados pelos caminhos de código, não relatos de incidentes confirmados em produção.

### C13 — Audiência estimada pode ser maior que a resolvida/enviada

`countAudience` usa contagem exata; `resolveAudience` usa uma única query com `limit=5000`. O editor e o sender também carregam coleções sem paginação completa. O limite configurado no PostgREST pode restringir ainda mais a resposta.

Uma estimativa de 8.432 contatos não garante que 8.432 destinatários tenham sido materializados. O sender marca completed ao terminar o conjunto carregado, sem uma prova final de inexistência de pending no banco.

**Correção indicada:** resolver/materializar no servidor ou paginar com ordem estável e comprovar cardinalidade. Simular bases 0, 1, 999, 1.000, 1.001, 5.000 e 5.001+, além de supressões e contatos duplicados. Só marcar concluída após verificar a fila real.

### C14 — Loop longo sem garantias suficientes de concorrência/retomada

O sender processa destinatários em um loop com sleeps na mesma request. Não há claim atômico da campanha/destinatário visível nesse fluxo. Duas inicializações concorrentes podem ler a mesma fila. Reinício após falha pode reencontrar status sending sem chave idempotente externa persistida.

As janelas de envio e blacklist são verificadas antes do loop. Durante o loop, a consulta por destinatário verifica pause/cancel, mas não refaz a elegibilidade completa. A atualização `skipped` no filtro inicial é construída sem `await`/consumo da promise; não deve ser considerada uma gravação comprovada.

A main recente relê parâmetros a cada 20 envios. Isso melhora edição de limites, mas não substitui enforcement de janela e supressão antes de cada despacho.

**Correção indicada:** job durável, claim com lease, idempotência, lotes limitados, rechecagem por destinatário, contadores derivados/reconciliados e erro explícito em escrita. Simular dois workers, timeout após resposta do provedor, pausa durante lote e opt-out recebido após início. Nunca usar clientes reais como massa de carga.

### C15 — Novos ajustes em andamento ainda não fecham o ciclo

Na main `9251ac45`, há realmente `TalkXCampaignRunning.tsx` com seis abas, donut e edição de limites. Não deve ser contado como ausente. Contudo:

- Pausadas reutilizam a tela running, não o layout completo específico do PNG 13.
- Concluídas seguem para monitor, não para o relatório analítico do PNG 14.
- O gráfico carrega as primeiras 2.000 linhas em ordem crescente e depois pega os últimos 20 buckets dessa amostra; não garante representar os últimos minutos de uma campanha longa.
- Em `TalkXLiveMonitor.tsx`, o catch de pause/cancel mostra erro, mas o código continua a registrar evento paused/cancelled. A timeline pode declarar uma ação que falhou.

Esses pontos exigem testes de transição e semântica dos eventos, não apenas que todas as abas montem sem exception.

## 8. Matriz de paridade das 17 referências

“Parcial” significa elementos presentes, mas sem equivalência integral de estrutura, comportamento e dados. “Não entregue” refere-se ao fluxo específico ilustrado, não à inexistência de qualquer funcionalidade parecida em outro módulo. A matriz é baseada em código e referências, não em porcentagem de pixels.

| Ref. | Tela | Diagnóstico | Principais lacunas |
|---|---|---|---|
| 01 | Visão geral | Parcial | KPIs/tabela/rail existem. Falta ajuda; importar é ação sem rota tratada; criadores usam nome de campanha; deltas/unidades precisam correção. |
| 02 | Segmentos — biblioteca/detalhes | Parcial | Lista/regras/favoritos e amostra existem. Não há composição demográfica, sincronização CRM comprovada, desempenho da última campanha e sugestões equivalentes. |
| 03 | Construtor de segmentos | Parcial | Grupos/regras/estimativa existem. Faltam RFM/compras/CRM, abas de sobreposição e insights; risco baseado apenas em tamanho. AND/OR entre grupos precisa contrato explícito. |
| 04 | Templates — biblioteca | Parcial | Grade, preview, tags e usos existem. Grade atual até 3 colunas em 2xl versus 4 no modelo; não há toggle lista; filtros/indicadores e ranking de conversão não equivalem a use_count. |
| 05 | Editor de template | Parcial | Editor, variáveis, histórico e A/B existem; composição em abas e apresentação não equivalentes. Preview e upload devem ser validados para cada mídia; suporte existente não prova paridade. |
| 06 | Supressão | Parcial com divergências documentais | V2 no banco não consumida integralmente. Telefone avulso, expiração, histórico, export e paginação incompletos. |
| 07 | Analytics global | Parcial com métricas inválidas | Funil fabricado, atribuição aproximada, filtros/receita/IA não entregues como modelo. |
| 08 | Nova campanha | Parcial com defeitos | Deep link, filtros, responsável, uploader, rail/rodapé e persistência incompletos. Mensagem deslocada para step 2. |
| 09 | Revisão final/confirmar | Parcial | Resumo/checks existem; números de elegibilidade e data podem divergir; falta phone frame equivalente e prognósticos/IA reais. Navegação após sucesso conflitante. |
| 10 | Agendada | Parcial | Tela dedicada existe. Recorrência e fuso persistente ausentes no contrato observado; round-trip de data defeituoso; não é toda a composição do mock. |
| 11 | Monitor ao vivo | Parcial | Há assinatura/consultas, progresso e controles. Sem telemetria completa para leituras/respostas/opt-outs e fila multissegmento; riscos de paginação e eventos. |
| 12 | Em andamento | Parcial, recém-entregue | Considerada a implementação #361. Faltam dados/consistência para todos os blocos; gráfico limitado e lifecycle ainda incompleto. |
| 13 | Pausada/retomada | Não entregue como tela específica | Reutilização de running/monitor não fornece banner, segmentos pendentes, checklist e composição própria completa. |
| 14 | Relatório concluída | Não entregue como fluxo específico | “Ver relatório” encaminha ao monitor. CSV de destinatários não substitui gráfico, funil, receita/ROI, links, heatmap de respostas e insights. |
| 15 | Importação/vinculação CRM | Não entregue no TalkX | Sem workspace de importação, correspondência, confiança, conflito e ações. CRM do wizard disabled. |
| 16 | Ajuda TalkX | Não entregue no TalkX | Sem rota e tela dedicadas de busca, artigos, guias, checklist, vídeos e suporte. |
| 17 | Estados/modais | Parcial | Componentes compartilhados existem, mas erro/CRM indisponível/sem permissão/desconectado não são consumidos integralmente pelos fluxos. Não basta exportar a função. |

Pontos concretos de ligação faltante:

- `TalkXOverview` dispara `onGoTab('import')`; `TalkXView` trata somente templates e segments. Botão aparenta funcionalidade, mas não navega.
- `creators` é construído como `m[c.created_by] = c.name`, não nome do perfil.
- `TalkXErrorState`, `TalkXDataUnavailableState`, `TalkXWhatsAppDisconnectedState` e `TalkXNoPermissionState` não têm consumidores encontrados no módulo além de suas definições.
- Há shell externo e padding do módulo: `ViewContainer` aplica `px-4` compacto e `TalkXView` aplica padding próprio. A soma altera o orçamento horizontal; o efeito visual exato precisa captura no viewport alvo.
- Raios, espaçamentos e rails variam entre componentes: 280, 300, 320 e 400px. Variação pode ser deliberada, mas não há prova por tela de que corresponde ao modelo aprovado.

## 9. Por que as validações anteriores não detectaram isso

### 9.1 Critério de aceite diferente do objetivo do usuário

O plano cita fidelidade e prints por fase, mas o gate geral centra-se em TypeScript, lint, Vitest e checklist. O artefato de paridade aceita expressões como “existia” ou o nome de uma função como prova. Isso mede presença de código, não a experiência entregue.

E99 prevê screenshot regression nas 17 telas; E100 prevê prints lado a lado. Na main consultada, `e2e` contém apenas auth, conversation e messaging. Não há specs TalkX nem o diretório de screenshots prometido versionado. `docs/talkx` tem seis documentos, sem o pacote de evidência visual final.

Adiar o gate visual para E99 permite 98 etapas divergirem antes de um aceite efetivo. Esse é um problema de processo e dependências, não falta de capacidade do React/Tailwind.

### 9.2 A suíte existente não testa o que se afirma

Rodada executada: **43 testes existentes aprovados** entre TalkX.test, useTalkXMonitor e talkxExport. Há seis testes do hook geral, helpers de monitor e export; parte das funções de personalização/tempo/filtro é reimplementada dentro do teste, em vez de importar a lógica produtiva.

Também houve execução ampliada: **227 arquivos, 3.031 testes aprovados e 35 TODO**, incluindo as 11 sondagens. Isso corresponde a 3.020 testes existentes mais 11 probes, não a 3.031 critérios de aceite do TalkX. A configuração opt-in foi ajustada depois para executar somente os probes, sem concatenar o include geral.

Não há nesses 43 testes prova de criação completa, autosave idempotente, refresh de rota, persistência de seleção, correspondência entre filtros e query ou comparação dos PNGs.

`vitest.config.ts` calcula cobertura de `src/lib` e `src/services`, não dos componentes/hooks TalkX. Um percentual global dessa configuração não demonstra cobertura do módulo.

### 9.3 Smoke de deploy não é smoke de campanha

`scripts/edge-deploy/smoke-functions.mjs` verifica OPTIONS/CORS, negação de origem e 401 anônimo nas funções aplicáveis. Isso é útil, mas **não cria rascunho, não agenda, não confirma a audiência e não entrega mensagem**. “65 funções passaram” não pode virar “65 funcionalidades de negócio funcionam”.

### 9.4 Documentação não é fonte confiável isoladamente

PARIDADE contém entregas que a UI não consome. README descreve apenas Fase 0 e fases seguintes como futuras, enquanto outras fontes chegam a Fase 6/7. A numeração em comentários também não é índice confiável de conclusão. Não existe base para dizer “E78 significa 78% pronto”.

## 10. Ordem recomendada de recuperação

Não reescrever tudo nem continuar abrindo novas fases para compensar a aparência. Recuperar por fatias verticais verificáveis.

### Lote A — Integridade funcional antes de expansão

1. Corrigir ID persistente do draft e concorrência de autosave.
2. Persistir/reconciliar seleção e filtros; definir quando materializar destinatários.
3. Corrigir duplicação e transições após salvar/agendar/lançar.
4. Corrigir round-trip UTC/fuso e a prévia; validar agenda/janelas.
5. Garantir bloqueios semânticos e validação de lançamento.
6. Unificar contagem de supressão e remover KPIs fictícios.
7. Testar sender com provedor stub: concorrência, timeout, janela e opt-out durante execução.

Aceite: cenários adversos passam com asserções de comportamento CORRETO, sem criar campanhas extras e sem enviar a público indevido. Os probes desta auditoria não são esses testes de aceite.

### Lote B — Fechar exatamente a tela 08 em carvão

1. Produzir especificação única do PNG 08: posição da mensagem, responsável/conexão, filtros reais e estados indisponíveis.
2. Fixar medidas de shell, área útil, rail, títulos, cards, campos e ações em 1672×941.
3. Implementar os filtros com dados reais; não habilitar CRM apenas visualmente.
4. Substituir URL manual por uploader quando o fluxo suportar armazenamento/envio seguro.
5. Ajustar sticky/scroll/rodapé e responsividade em 1280/1672/390px, além de zoom 200% e teclado.
6. Capturar fixture local determinística e validar também sessão autenticada com dados representativos.
7. Comparar com referência adaptada ao carvão; registrar cada diferença deliberada.

Aceite: aprovação visual da tela e prova de salvar/reabrir o mesmo draft. Só então propagar componentes para outras telas.

### Lote C — Completar dependências de dados

1. Conectar supressão V2 sem ressuscitar entradas removidas.
2. Resolver audiência sem truncamento silencioso.
3. Definir contrato CRM externo → contatos elegíveis → snapshot de campanha.
4. Implementar correlação do envio/ACK e eventos idempotentes.
5. Definir atribuição de resposta/clique/conversão; depois agregações de analytics.
6. Implementar multi-segmento e recorrência se mantidos no escopo.
7. Escrever migrations forward-only, testes de RLS/ACL e de comportamento; aplicar em staging antes do canônico.

Aceite: cada número da interface rastreável a consulta/evento e fixture conhecida. Schema sincronizado é requisito necessário, não aceite suficiente.

### Lote D — Fechar telas restantes com gate desde o início

Ordem sugerida: revisão/agendada → monitor/andamento/pausada → relatório → supressão → biblioteca/editor de segmentos → templates → importação CRM → ajuda → estados. Cada tela precisa contrato visual, cenários de dados, interações e acessibilidade.

Para não repetir a falha, nenhum PR deve usar “paridade concluída” sem:

- referência identificada e versão do código;
- screenshot no viewport aprovado e diferenças justificadas;
- estados vazio/carregando/erro/permissão/serviço indisponível;
- teste dos botões principais e persistência real em ambiente de teste;
- indicação de capacidade ausente, bloqueada ou apenas estimada;
- aprovação do fluxo inteiro, não só do componente isolado.

## 11. Reprodução e preservação

Executar da raiz do repositório:

Os probes que afirmavam o comportamento defeituoso não foram promovidos: mantê-los na suíte faria uma regressão parecer sucesso. As garantias úteis foram reescritas como testes positivos e hoje são executadas por:

```bash
bunx vitest run src/components/talkx/__tests__/useCampaignEditor.test.tsx src/components/talkx/__tests__/TalkXView.route.test.tsx src/components/talkx/__tests__/talkxCampaignDraft.test.ts src/hooks/integrations/__tests__/useTalkXSegments.test.ts
bash scripts/db-audit/talkx-campaign-state-transitions.test.sh
bash scripts/db-audit/talkx-delivery-leases.test.sh
```

O primeiro comando é opt-in e está fora do include normal da CI. **11 PASS significam 11 cenários divergentes reproduzidos**, incluindo discrepâncias deliberadas de escopo. Após correções, os probes precisam ser revistos ou substituídos por testes do comportamento esperado; não devem ser preservados como obrigação de manter o bug.

As sondagens não fazem SQL nem envio. Captura pública de login disponível temporariamente em `/tmp/talkx-production-anonymous.png`; não é screenshot do wizard e não constitui evidência de paridade.

## 12. Conclusão executiva

O pedido é tecnicamente viável no stack atual. O que falta não é “mais brilho” nem um novo framework: falta alinhar especificação, implementação, dados e aceite no mesmo fluxo.

Há progresso real que deve ser preservado: componentes compartilhados, tabelas/migrations, edição de templates e histórico, grupos de regras, quatro passos do wizard, agendamento, monitor e a nova tela em andamento. Mas **o produto implantado ainda é uma entrega parcial com defeitos e lacunas**, e o relatório anterior de estabilidade/CI não deveria ter sido interpretado como aprovação das 17 telas.

Recomendação: começar pela integridade de draft/audiência/agendamento e pelo fechamento visual da tela 08, com prova lado a lado em carvão. Não prometer novamente conclusão integral antes de os gates visual, funcional e de dados estarem vinculados a cada tela.
