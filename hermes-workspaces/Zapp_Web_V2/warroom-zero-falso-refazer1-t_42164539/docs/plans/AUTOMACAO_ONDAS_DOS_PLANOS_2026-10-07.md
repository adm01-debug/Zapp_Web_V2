# AUTOMAÇÃO DAS ONDAS DOS PLANOS DE 07/10/2026 — VISÃO GERAL

O dono pediu que **tudo que foi decidido fique documentado e planejado, sem nada para depois**. Por isso as **ondas 2 e 3 de todos os planos** de 07/10 (miniaturas, link do e-mail, alertas de e-mail, filtro de data em Arquivos, volume da sidebar, cartão de arquivo, Journey, fase K de design e consistência) estão **escritas e programadas** num motor de gatilhos, em vez de dependerem de lembrete.

## Como funciona
- Especificações: `~/arquitetura-v2/gatilhos/cartoes_a.py` e `cartoes_b.py` (55 cartões: perfil, dependências, arquivos permitidos, critério de pronto, regras permanentes).
- Motor: `~/arquitetura-v2/gatilhos/gatilhos.py` cria o cartão (`hermes kanban create`, chave de idempotência `gatilho-<prefixo>`, criado por `claude`) quando **todos** os cartões de que ele depende estão **integrados** na branch do dia (a fila do integrador diz `integrado`; refazeres do mesmo cartão contam).
- Execução: timer do usuário `v2-gatilhos.timer` a cada 5 minutos (instalação: `bash ~/arquitetura-v2/gatilhos/instalar.sh`) e o lembrete do Claude a cada ~30 minutos.
- Visibilidade: painel `Desktop/GATILHOS_07-10.md` (criados, aguardando e por quê) e log `~/arquitetura-v2/gatilhos/gatilhos.log`.
- O que só o Claude faz (verificação visual na pré-visualização) fica em `~/arquitetura-v2/pendencias/pendencias.py`.

## Regras permanentes que todo cartão carrega
Nenhuma informação pode sair do sistema (sem exportar, baixar, copiar tudo, imprimir ou compartilhar novos; download só pelo caminho `useDownloadPermission`) · só as cores que o sistema já tem · efeitos sutis com `motion-safe` e reduzir movimento · sem selo de canal/origem · sem DDL, Edge Function ou migration · sem dependência nova.

## Os 55 cartões
| Cartão | Perfil | Nasce quando estiverem INTEGRADOS | O que faz |
|---|---|---|---|
| **M04** | iris | M01, M02 | Miniaturas Arquivos: miniatura de PDF no tile de documentos |
| **M06** | workertestes | M04, M05 | Miniaturas Arquivos: testes do tile de PDF e do filtro de figurinhas |
| **M07** | vera | M04, M05, M06 | Miniaturas Arquivos: documentação da aba Arquivos |
| **L06** | workertestes | C03 | E-mail link do contato: testes adversariais do saneamento |
| **L07** | workertestes | C03 | E-mail link do contato: acessibilidade do ícone |
| **L08** | workertestes | C03 | E-mail link do contato: teste de ponta a ponta |
| **L09** | vera | C03 | E-mail link do contato: documentação |
| **U03** | iris | C03, U01, U02 | E-mail não lido: chip 'E-mail' na barra de abas do chat |
| **U04** | iris | C02, C03, U02, U03 | E-mail não lido: selo no ícone de e-mail do painel do contato |
| **U05** | workertestes | U03, U04 | E-mail não lido: testes de acessibilidade e tempo real |
| **U06** | vera | U03, U04 | E-mail não lido: documentação |
| **F07** | workertestes | F01 | Filtro de data em Arquivos: testes adversariais |
| **F10** | vera | F01 | Filtro de data em Arquivos: documentação |
| **Q05** | workertestes | Q01, Q02, Q03, Q04 | Volume da sidebar: teste de ponta a ponta |
| **Q06** | workertestes | Q02, Q03, A01 | Volume: o som obedece de verdade nos players |
| **Q08** | iris | A01, Q02 | Volume: player de áudio do cartão obedece o volume das mídias |
| **Q07** | vera | Q01, Q02, Q03, Q04, Q05 | Volume da sidebar: documentação |
| **Q10** | hugo | Q03 | Volume: documentar e testar o teto de ganho do toque de chamada |
| **R11** | iris | R02 | Cartão de arquivo: remover o selo de canal do SenderAvatar |
| **R04** | iris | R01, R02, R03, R11, A01, M02 | Cartão de arquivo: layout igual ao mockup (nome, tipo, tamanho, data, remetente) |
| **R05** | iris | R04, M04 | Cartão de arquivo: play e duração dentro da miniatura (vídeo e áudio) |
| **R06** | iris | R04 | Cartão de arquivo: Lista e Tabela com quem enviou |
| **R07** | iris | R04 | Cartão de arquivo: painel de detalhes igual ao mockup |
| **R08** | iris | R04, F01, C04 | Cartão de arquivo: cabeçalho, subtítulo e funil com filtro de remetente |
| **R09** | workertestes | R04, R05, R06, R07, R08 | Cartão de arquivo: teste de ponta a ponta |
| **R10** | vera | R04, R05, R06, R07, R08 | Cartão de arquivo: documentação |
| **J06** | hugo | J01 | Journey: linhas cruas e fontes de ligação e e-mail |
| **J07** | hugo | J01, J06 | Journey: mapeadores de todas as fontes para eventos do histórico |
| **J08** | hugo | J01, J02, J06, J07 | Journey: hook novo da timeline (período, tipo, usuários, paginação) |
| **J09** | hugo | J01, R01 | Journey: resolver quem agiu (foto e nome) |
| **J10** | iris | J01, J02, J05, R02 | Journey: barra de filtros (período, tipo e usuários) |
| **J11** | iris | J01, J05, R02 | Journey: cartão do episódio e lista da timeline |
| **J12** | iris | J03, J04, J08, J09, J10, J11 | Journey: ligar tudo na aba (hero, filtros, timeline, novo hook) |
| **J13** | iris | J12 | Journey: clique abre o episódio — contrato e mensagens do chat |
| **J14** | iris | J13 | Journey: clique abre a nota e a tarefa |
| **J15** | iris | J13, F01, C04, R08 | Journey: clique abre o arquivo e a proposta |
| **J16** | iris | J13, C03 | Journey: clique abre o e-mail e a ligação |
| **J17** | iris | J13 | Journey: clique abre o detalhe de transferência, atribuição e encerramento |
| **J18** | workertestes | J12 | Journey: testes de filtros, teclado e garantia de que nada sai do sistema |
| **J19** | workertestes | J14, J15, J16, J17 | Journey: teste de ponta a ponta |
| **J20** | vera | J19 | Journey: documentação |
| **K01** | iris | J12 | Journey design: marcos no trilho |
| **K02** | iris | K01 | Journey design: separador de silêncio |
| **K03** | iris | K02 | Journey design: direção, ligação perdida, borda colorida e selo da categoria na foto |
| **K04** | iris | K03 | Journey design: barra de filtros fixa no topo da rolagem |
| **K05** | iris | K04 | Journey design: faixa de saúde do relacionamento |
| **K06** | iris | K05 | Journey design: esqueleto, estado vazio e erro |
| **K07** | iris | K06 | Journey design: mensagens agrupadas como balões |
| **K08** | iris | K07 | Journey design: filtros em folha deslizante no celular |
| **K09** | iris | K08 | Journey design: dica com a data e hora completas |
| **K10** | workertestes | K09 | Journey design: testes de ponta a ponta da fase K |
| **K11** | vera | K10 | Journey design: documentação da fase K |
| **Z01** | hugo | F01, J02 | Consistência: uma fonte única para o cálculo de período (Arquivos e Journey) |
| **Z02** | iris | J01, J14 | Consistência: ícones das abas Tarefas, Notas e CRM 360° com o mapa de categorias |
| **Z03** | iris | Q01, Q04 | Consistência: dica e legenda uniformes nos controles rápidos |
