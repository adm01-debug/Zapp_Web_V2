# Fase 16 — Qualidade e release (X192–X200)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 01–17. 9 etapas.
>
> **Entrega da fase:** Acessibilidade, telas menores, desempenho, régua como trava, banco conferido, documentação refeita, aceite tela a tela, primeira campanha para clientes e release.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

### X192 · Fechar acessibilidade nas 17 telas: teclado, foco, leitor de tela e contraste nos dois temas

- **Fase:** 16 · **Tela:** 01–17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X191
- **Fecha:** —
- **Dependências, em detalhe:** todas as etapas de tela (fases 7 a 15)
- **Hoje:** O módulo não tem verificação de acessibilidade: `@axe-core/react` está nas dependências, mas não há teste que o rode sobre as telas do Talk X. O repo já teve regressão de contraste por fundo fixo sem variante de tema (`CLAUDE.md`, "Lição de UI (2026-09-25)": 1,24:1 no tema claro).
- **Fazer:** Acrescentar ao `e2e/talkx-visual.spec.ts` uma passada de acessibilidade por tela (regras WCAG 2.1 AA) nos temas claro e escuro, e um teste de teclado por tela: Tab percorre na ordem visual, Esc fecha modal e painel devolvendo o foco, Enter/Espaço acionam, setas navegam abas, e toda ação de linha é alcançável sem mouse. Corrigir o que aparecer: rótulos de botão só com ícone, `aria-sort` em colunas ordenáveis, `aria-live` nos contadores do monitor, foco visível, contraste de texto sobre os cartões do módulo usando só os tokens do tema (`--background`, `--card`, `--card-elevated`, `--border`, `--input`). Gráficos ganham tabela equivalente acessível.
- **Aceite:** 0 violações "serious" ou "critical" nas 17 telas, nos dois temas; o teste de teclado completa o fluxo criar campanha → revisar → confirmar (com a fixture) sem mouse; contraste ≥ 4,5:1 medido nos dois temas.
- **V3:** V93
- **Negócio:** o módulo funciona inteiro pelo teclado e continua legível no tema claro, sem texto apagado sobre fundo escuro.

### X193 · Fechar o comportamento em telas menores: 1280, 1024 e 390 px

- **Fase:** 16 · **Tela:** 01–17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X191
- **Fecha:** —
- **Dependências, em detalhe:** todas as etapas de tela (fases 7 a 15)
- **Hoje:** Os mocks só definem 1672 px. No código, o painel lateral da Visão geral some abaixo de `xl` sem alternativa e o histórico de versões do template só aparece em `xl+` (auditoria de 29/09, E24 e E46).
- **Fazer:** Definir e aplicar, tela por tela, a regra: em 1280 px o painel lateral continua visível com largura menor; em 1024 px vira gaveta aberta por botão no cabeçalho; em 390 px as tabelas viram cartões empilhados, o wizard fica em coluna única com rodapé fixo, os gráficos mantêm a leitura (rolagem horizontal só dentro do gráfico) e nenhum conteúdo fica inacessível. Estender a régua de X004 com capturas em 1280, 1024 e 390 para as 17 telas.
- **Aceite:** 51 capturas adicionais no artefato da régua; teste que falha se houver rolagem horizontal da página em qualquer das três larguras; no celular (390 px) é possível pausar uma campanha e ler o monitor.
- **V3:** V93
- **Negócio:** dá para acompanhar e pausar uma campanha pelo celular e usar o módulo num notebook sem perder o painel lateral.

### X194 · Garantir desempenho: cada tela em arquivo próprio, listas grandes e orçamento do carregamento inicial

- **Fase:** 16 · **Tela:** 01–17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X191
- **Fecha:** —
- **Dependências, em detalhe:** todas as etapas de tela (fases 7 a 15)
- **Hoje:** O carregamento inicial do app está no limite do orçamento medido por `scripts/ci/bundle-budget.mjs` (4.054,9 de 4.100 KB em 01/10, PR #1385). O Talk X entra por `src/pages/lazyViews.ts`, mas dentro do módulo as telas são importadas juntas; relatório, importação, ajuda e leitor de planilha vão somar código novo.
- **Fazer:** Carregar sob demanda cada tela do módulo (relatório, importação, ajuda, editor de template, construtor de segmento, monitor) e as bibliotecas pesadas (gráficos, PDF, leitor de planilha, leitor de markdown) só na tela que usa. Medir e registrar em `docs/talkx/v4/DESEMPENHO.md`: tamanho do arquivo de cada tela, tempo até a tela utilizável com a fixture de X003 e com 5.000 destinatários simulados, e o plano de execução (`EXPLAIN`) das RPCs de listagem. Listas com mais de 200 linhas usam paginação no servidor (já exigida nas etapas de tela) — conferir que nenhuma ficou com teto fixo no navegador.
- **Aceite:** `bundle-budget.mjs` continua passando sem aumentar o orçamento; `grep -rn "\.limit(" src/components/talkx src/hooks/integrations/useTalkX*` não encontra teto fixo fora de paginação; cada tela abre em até 2 s com a fixture no CI; documento de desempenho commitado.
- **V3:** V94
- **Negócio:** o sistema não fica mais lento para quem só usa o chat, e o módulo continua rápido com campanhas de milhares de contatos.

### X195 · Tornar a régua visual uma trava: regressão visual obrigatória nas 17 telas

- **Fase:** 16 · **Tela:** 01–17 · **Camada:** testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X004, X192, X193
- **Fecha:** —
- **Hoje:** A régua de X004 só informa. `e2e-talkx-pr.yml` não é check obrigatório da `main` (cabeçalho do workflow).
- **Fazer:** Gravar as capturas aprovadas das 17 telas (4 larguras) como referência versionada e trocar a captura simples por comparação com tolerância definida (`toHaveScreenshot` com `maxDiffPixelRatio`), no projeto `chromium-talkx`. Atualizar a referência passa a exigir, no corpo da PR, a dupla "antes | depois". Depois de duas semanas de execuções verdes, incluir o job nos checks obrigatórios da `main` (mudança de proteção de branch: decisão do dono, a PR fica aberta).
- **Aceite:** alterar de propósito a cor de um botão do kit numa PR de teste faz o job falhar apontando as telas afetadas; PR sem mudança visual passa.
- **V3:** V95, V97
- **Negócio:** depois de pronta, nenhuma tela muda de aparência sem alguém ver e aprovar a diferença.

### X196 · Provar o banco limpo: ledger, catálogo, replay do zero e permissões do módulo

- **Fase:** 16 · **Tela:** — · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X191
- **Fecha:** —
- **Dependências, em detalhe:** todas as etapas com DDL (fases 1 a 15)
- **Hoje:** O V4 soma dezenas de migrations novas. O histórico do módulo já teve DDL aplicado fora do Git, policy alterada sem ter sido criada em migration (`20260910100000`) e `GRANT ALL` a `anon` em `talkx_settings` (`20260930410000:31`).
- **Fazer:** Rodar o replay completo das migrations num Postgres 17 descartável (o mesmo de `db-guard.yml`) e corrigir, por migration nova e idempotente, o que não reproduzir. Conferir paridade arquivos ↔ ledger (contagem e conteúdo de `statements`), `supabase-usage-guard.mjs` com `novas: 0`, `schema-catalog.json` e `types.ts` regenerados. Auditar, objeto por objeto do módulo (`talkx_*`, RPCs, views, bucket `talkx-media`), grants e policies contra a matriz de papéis definida na fase 2, com um teste SQL que tenta cada ação como `anon`, agente, supervisor e admin. Registrar o resultado em `docs/talkx/v4/BANCO.md`.
- **Aceite:** replay do zero termina sem erro; `db-live-guard` verde na `main`; o teste de matriz de papéis passa (agente não cria, não agenda, não lê supressão; `anon` não lê nada do módulo); nenhuma migration `talkx` sem linha no ledger.
- **V3:** V98
- **Negócio:** garantia de que o banco de produção é exatamente o que está escrito no repositório e de que só quem deve consegue disparar campanha.

### X197 · Reescrever a documentação do módulo a partir da evidência

- **Fase:** 16 · **Tela:** — · **Camada:** docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X002, X196
- **Fecha:** —
- **Hoje:** `README.md`, `CHANGELOG_TALKX.md`, `PARIDADE.md`, `ARQUITETURA.md` e `OPERACAO.md` de `docs/talkx/` têm mais de 40 afirmações refutadas pela auditoria de 29/09 (§6), inclusive componentes que nunca existiram.
- **Fazer:** Regerar `PARIDADE.md` a partir do placar de X002 (uma linha por elemento do inventário, com a etapa e a PR que o fechou e o print). Reescrever `ARQUITETURA.md` (fluxo real do motor em lotes, tabelas, RPCs, edges, cron, papéis) e `OPERACAO.md` (como lançar, pausar, retomar; o que fazer quando o monitor acusa campanha parada; como implantar edge e aplicar migration; como ler os alertas) conferindo cada afirmação no código e no banco. Mover os três planos antigos e os documentos de sessão para `docs/talkx/_arquivo/`. Acrescentar ao CI um verificador que falha se um documento de `docs/talkx/` citar arquivo de código que não existe.
- **Aceite:** o verificador de referências passa; `PARIDADE.md` é saída do script (rodar de novo não muda o arquivo); `grep -c "✅" docs/talkx/PARIDADE.md` é igual ao número de elementos fechados do `STATUS.md`.
- **V3:** V96
- **Negócio:** a documentação passa a dizer só o que existe; quem chegar depois não é enganado por um "pronto" que não está.

### X198 · Fazer o aceite visual 17/17 em produção, tela a tela, com o dono

- **Fase:** 16 · **Tela:** 01–17 · **Camada:** testes + docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X192, X193, X194, X195, X196
- **Fecha:** —
- **Hoje:** Nenhuma tela foi comparada ao mock com o sistema real aberto; o diagnóstico de 01/10 foi feito por código e banco.
- **Fazer:** Com o sistema em produção e dados reais (as campanhas do ensaio e das primeiras campanhas), capturar as 17 telas autenticadas em 1672×941 e montar o caderno de aceite `docs/talkx/v4/ACEITE.md`: para cada tela, mock, captura real, lista dos elementos do inventário com estado final e, onde o real diverge do mock de propósito (lista de excluídos e decisões de negócio), o motivo. O dono percorre o caderno e marca cada tela como aceita ou devolve com o item; item devolvido vira etapa de correção antes do release.
- **Aceite:** 17 telas marcadas como aceitas pelo dono no caderno; nenhum elemento do inventário em estado diferente de "fechado" ou "excluído com motivo".
- **V3:** V97
- **Negócio:** o Joaquim confere, tela por tela, que o que foi desenhado é o que está no ar — e o que ficou diferente está explicado.

### X199 · Rodar a primeira campanha para clientes reais, pequena, e observar por 7 dias

- **Fase:** 16 · **Tela:** 08–14 · **Camada:** testes + docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X198
- **Fecha:** —
- **Hoje:** O módulo nunca enviou mensagem a cliente: 0 campanhas em produção. O ensaio da fase 3 prova o motor com números da equipe, não a operação com clientes.
- **Fazer:** Com público, mensagem e horário escolhidos pelo dono (recomendado: um segmento de 30 a 50 clientes que já conversaram com a empresa, ritmo no padrão conservador), lançar pelo wizard, acompanhar pelo monitor e fechar pelo relatório. Durante 7 dias, registrar em `docs/talkx/v4/PRIMEIRA_CAMPANHA.md`: enviados, entregues, lidas, respostas, pedidos de saída, falhas, alertas disparados, tempo do motor, e qualquer diferença entre o que a tela mostrou e o que o banco tem (conferência por query). Ajustes que surgirem viram PR própria.
- **Aceite:** campanha concluída sozinha; contadores da tela iguais aos do banco; nenhum cliente recebeu mensagem duplicada (query por contato); pedidos de saída aparecem na lista de supressão com a campanha de origem; nenhum alerta sem tratamento ao fim dos 7 dias.
- **V3:** V99
- **Negócio:** primeira campanha de verdade no ar, com acompanhamento de perto antes de liberar volume.

### X200 · Publicar o release: versão, registro de mudanças, pendências assumidas e encerramento

- **Fase:** 16 · **Tela:** — · **Camada:** docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X197, X198, X199
- **Fecha:** —
- **Hoje:** A tag `talkx-v1.0.0` foi criada com a mensagem "F0 (E01–E10) + F1 (E11–E20)" quando nem a fase 1 estava completa (auditoria de 29/09, §1).
- **Fazer:** Criar a tag `talkx-v2.0.0` na `main` só com o placar em 200/200 e o caderno de aceite assinado. Escrever o registro de mudanças a partir das PRs `(X<NNN>)`. Publicar em `docs/talkx/v4/POS_RELEASE.md` o que ficou conscientemente de fora (lista de excluídos do plano), as decisões de negócio tomadas com data, os limites em vigor (ritmo, horário, retenção) e o que reavaliar em 30 dias (teto de ritmo, botões, IA). Fechar as branches do V4 que restarem.
- **Aceite:** `STATUS.md` em 200/200 e 0 elementos abertos; tag criada; `POS_RELEASE.md` commitado; nenhuma branch `*talkx-x*` remota sem PR mergeada ou fechada com motivo.
- **V3:** V100
- **Negócio:** entrega fechada com data, com a lista honesta do que ficou de fora e do que será revisto.
