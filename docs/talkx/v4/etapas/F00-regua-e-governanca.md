# Fase 0 — Régua e governança (X001–X005)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: —. 5 etapas.
>
> **Entrega da fase:** Um plano só valendo, placar automático de etapas e de elementos por tela, e a foto de cada tela ao lado do mock em toda PR do módulo.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

### X001 · Tornar o V4 o plano vigente e marcar os planos anteriores como substituídos

- **Fase:** 0 · **Tela:** — · **Camada:** docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** —
- **Hoje:** `CLAUDE.md` (seção "Talk X / Campanhas") aponta para `docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md`, de 08/09. Em `docs/talkx/` convivem três planos de 100 etapas (`PLANO_IMPLEMENTACAO_TALKX_100.md`, `PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md`, `PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`) e `PARIDADE.md` com cabeçalho "DESATUALIZADO". Sessões diferentes seguem planos diferentes.
- **Fazer:** Trocar o ponteiro de `CLAUDE.md` e de `docs/talkx/README.md` para `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`. Acrescentar no topo dos três planos antigos e de `PARIDADE.md` uma linha "SUBSTITUÍDO pelo V4 em <data> — não executar" (sem apagar nada: são histórico e critério de aceite citado pelo V4). Registrar no `CLAUDE.md` a convenção do V4: branch `<agente>/<tipo>-talkx-x<NNN>-<slug>-<AAMMDD-HHMM>`, título de PR terminando em `(X<NNN>)`, uma etapa = uma PR, e que a etapa em curso do V3 (se houver PR aberta) termina pelo número V4 equivalente da tabela "V3 → V4". Não mexer em nenhum outro trecho do `CLAUDE.md`.
- **Aceite:** `grep -n "PLANO_TALKX_V4" CLAUDE.md docs/talkx/README.md` devolve o ponteiro nos dois; `grep -c "SUBSTITUÍDO pelo V4"` = 1 em cada um dos 4 arquivos antigos; `git diff --stat` da PR mostra só esses 6 arquivos.
- **V3:** V96 (parte de documentação), V100 (encerramento do plano anterior)
- **Negócio:** todos os agentes passam a seguir a mesma lista de trabalho; acaba a situação de três planos valendo ao mesmo tempo.

### X002 · Criar o placar do V4: etapas fechadas e elementos do mock por tela

- **Fase:** 0 · **Tela:** — · **Camada:** docs + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X001
- **Fecha:** —
- **Hoje:** "Pronto" foi, nos três planos anteriores, um ✅ escrito à mão; a auditoria de 29/09 refutou mais de 40 deles (`docs/talkx/AUDITORIA_PLANO_TALKX_2026-09-29.md` §6). Não existe arquivo de estado (`docs/talkx/STATUS*` não existe) nem script que relacione PR, etapa e elemento do mock.
- **Fazer:** Criar `scripts/talkx/v4-status.mjs`. Ele lê as etapas em `docs/talkx/v4/etapas/*.md` (campo **Fecha**) e os inventários em `docs/talkx/v4/inventario/*.md` (IDs `T<tela>-<seq>` e estado inicial), descobre as etapas concluídas pelos commits da `main` cujo título termina em `(X<NNN>)` (`git log --format=%s`) e gera `docs/talkx/v4/STATUS.md`: etapas concluídas sobre 200, por fase; e, por tela, elementos fechados sobre o total — um elemento só conta como fechado quando **todas** as etapas que o citam em **Fecha** estão na `main`. Modo `--check` falha se `STATUS.md` commitado divergir do gerado. Incluir o `--check` no job de lint do `ci.yml` (mudança de CI: a PR fica aberta para aprovação do dono) e o teste unitário `scripts/talkx/v4-status.unit.mjs` com um repositório de fixture.
- **Aceite:** `node scripts/talkx/v4-status.mjs --check` passa na PR; o teste unitário cobre: etapa sem commit → aberta; elemento citado por duas etapas com só uma concluída → aberto; título com `(X999)` → erro "etapa inexistente". `STATUS.md` inicial mostra as etapas concluídas até a data e, por tela, o número de elementos `OK` do inventário (217 de 1.135 no total).
- **V3:** V96 (PARIDADE por evidência), V100
- **Negócio:** passa a existir um placar que ninguém edita à mão: quantas das 200 etapas entraram e, tela por tela, quanto do desenho já existe.

### X003 · Criar a base de demonstração determinística das 17 telas para captura

- **Fase:** 0 · **Tela:** 01–17 · **Camada:** testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** —
- **Hoje:** O E2E do módulo (`e2e/talkx.spec.ts`, 7 testes) roda com login real contra o banco de produção (`.github/workflows/e2e-talkx-pr.yml`, `e2e-logado.yml`), que tem 0 campanhas, 0 destinatários e 0 supressões. Não há como renderizar uma tela com os dados do mock sem gravar em produção; não existe `page.route` em `e2e/` (0 ocorrências).
- **Fazer:** Criar `e2e/fixtures/talkx-demo/` com um arquivo JSON por tela reproduzindo os dados visíveis no mock correspondente (as 8 campanhas da tela 01, os 8 segmentos da 02, os 8 templates da 04, os 10 suprimidos da 06, a campanha "Black Friday VIP" da 10, etc.) e `e2e/fixtures/talkx-demo.ts` com `mockTalkXBackend(page, tela)`: intercepta por `page.route` as chamadas de `rest/v1/talkx_*`, `rest/v1/rpc/talkx_*` e `functions/v1/talkx-*` e responde com a fixture; qualquer chamada de escrita não prevista aborta o teste. Relógio fixado com `page.clock`. Nenhuma linha é gravada no banco. Documentar em `e2e/README.md` que a fixture cresce junto com cada etapa de tela (a etapa que cria uma RPC acrescenta a resposta dela).
- **Aceite:** `e2e/talkx-demo.spec.ts`: abre a Visão geral com a fixture da tela 01 e encontra "Lançamento Linha Office" e "24" no KPI "Total de campanhas"; uma chamada `POST rest/v1/talkx_campaigns` dentro do teste falha com "escrita não prevista". Depois do run, `select count(*) from talkx_campaigns` em produção continua 0.
- **V3:** V95 (parte: stub para E2E)
- **Negócio:** as telas passam a poder ser mostradas "cheias", com os mesmos dados do desenho, sem criar campanha falsa no sistema real.

### X004 · Criar a régua visual: captura 1672×941 de cada tela ao lado do mock em toda PR do Talk X

- **Fase:** 0 · **Tela:** 01–17 · **Camada:** testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X003
- **Fecha:** —
- **Hoje:** Não existe comparação visual: `toHaveScreenshot`/`toMatchSnapshot` têm 0 ocorrências em `e2e/` e `src/`; `docs/talkx/screens/` não existe; nenhuma das 17 telas tem print registrado. Os mocks estão em `docs/talkx/references/*.png` (1672×941).
- **Fazer:** Criar `e2e/talkx-visual.spec.ts` (projeto `chromium-talkx`, viewport 1672×941, tema escuro, fixture de X003) com um teste por tela do mock que navega até a rota da tela e salva `captura-NN.png`; tela cujo componente ainda não existe grava o resultado "tela ainda não existe" em vez de falhar. Criar `scripts/talkx/lado-a-lado.mjs`, que monta, para cada tela, uma imagem `mock | captura` e um `index.html` com as 17 duplas. Em `e2e-talkx-pr.yml`, rodar o spec e publicar a pasta como artefato do run, com a lista de telas capturadas no resumo do job (mudança de CI: a PR fica aberta para aprovação do dono). Nesta etapa a régua informa, não bloqueia; vira trava em X195.
- **Aceite:** run do workflow na PR publica o artefato `talkx-lado-a-lado` com 17 duplas; o resumo do job lista quais telas têm captura e quais "ainda não existem" (hoje: 13, 14 e 15). Abrir o `index.html` do artefato mostra mock e captura na mesma escala.
- **V3:** V95 (regressão visual), V97 (aceite visual)
- **Negócio:** toda mudança no módulo passa a vir acompanhada da foto da tela ao lado do desenho aprovado — dá para ver a diferença sem depender da palavra de quem fez.

### X005 · Exigir a definição de pronto no corpo da PR de cada etapa do V4

- **Fase:** 0 · **Tela:** — · **Camada:** testes + docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X002, X004
- **Fecha:** —
- **Hoje:** O modelo de PR do repo (`.github/PULL_REQUEST_TEMPLATE.md`) é genérico. Nada verifica se a PR de uma etapa diz o que fechou, se o DDL foi aplicado ou se a edge foi implantada — e neste projeto merge não é deploy (`CLAUDE.md`, "Decisões de 2026-09-26").
- **Fazer:** Criar `scripts/ci/check-talkx-pr-body.mjs`: quando o título da PR termina em `(X<NNN>)`, exige no corpo as seções `## Etapa` (número e título iguais aos do plano), `## Fecha` (os mesmos IDs do campo **Fecha** da etapa, ou a justificativa de cada ID que ficou de fora), `## Evidência` (nome do teste que falhava antes e passa agora, ou a query com o resultado), `## Print` (obrigatória quando a etapa tem tela: nome do artefato da régua), `## Banco` (versão da migration e se já foi aplicada e registrada no ledger, ou "sem DDL") e `## Edge` (id do run de `deploy-functions.yml`, ou "sem edge", ou "aguardando aprovação do deploy"). Rodar o script num job sem secrets com gatilho `pull_request` (lê só `github.event.pull_request`). Documentar as seções em `docs/talkx/v4/README.md`.
- **Aceite:** `scripts/ci/check-talkx-pr-body.unit.mjs`: corpo sem `## Evidência` → falha; etapa com DDL e `## Banco` vazio → falha; título sem `(X<NNN>)` → o verificador não se aplica. Uma PR de teste com corpo completo passa.
- **V3:** contrato de evidência do `PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md`
- **Negócio:** nenhuma etapa entra dizendo "pronto" sem mostrar o teste, a foto da tela e se já está no ar de verdade.
