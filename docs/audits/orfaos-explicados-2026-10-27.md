# Zapp Web V2 — Arquivos órfãos explicados

27/10/2026 · complemento de `mapa-branches-importadas-2026-10-27.md`

Ninguém apaga nada sem conferência antes. E nenhum trabalho se perde: tudo o que veio das máquinas locais continua guardado no GitHub, nas refs `refs/importado/*`.

## O que é um órfão

Pense na `main` como uma casa. Cada arquivo é um móvel, e a tela é o cômodo onde ele fica. Um órfão é um móvel que foi entregue mas ficou na garagem: existe, foi pago, mas ninguém usa, porque nenhuma tela chama aquele código.

Esses móveis vieram das branches locais: alguém construiu a peça e não chegou a encaixá-la. São 116 arquivos, juntados em 69 grupos (um componente, o hook dele e a lógica dele contam como uma peça só). Cada grupo caiu em uma de três caixas.

| Caixa | Grupos | O que fazer |
| --- | --- | --- |
| Vale ligar | 26 | Encaixar na tela certa |
| Duplicado | 26 | Comparar com a versão viva antes de apagar |
| Morto | 17 | Apagar, depois de conferir o histórico |

## Caixa 1: vale ligar (26 grupos)

É trabalho bom e pronto que só falta encaixar na tela. Estas são as peças que mais precisam de atenção, porque é trabalho começado e não terminado.

| Funcionalidade | Onde encaixa | O que muda para o negócio |
| --- | --- | --- |
| Selo "fora do horário" e emoji de sentimento | Cabeçalho da conversa | O atendente vê na hora se o cliente escreveu fora do expediente e se está irritado. |
| Ações do grupo no chat interno (renomear, tirar pessoas, sair) | Team chat (os itens de menu já estão na tela, sem conexão) | Quem criou o grupo consegue administrá-lo. |
| Aba Jornada completa (filtros, estatísticas, linha do tempo) | Inbox, aba Jornada (ainda mostra a versão antiga) | O histórico do cliente junta mensagens, ligações e e-mails, filtrável por período e pessoa. |
| Links de pagamento | Novo item no menu (a tela e a tabela no banco existem) | O vendedor gera um link de cobrança e acompanha se foi pago. |

A lista completa dos 26 grupos está em `mapa-branches-importadas-2026-10-27.md`.

## Caixa 2: duplicados (26 grupos)

São versões antigas de algo que já funciona, com outro arquivo fazendo o mesmo trabalho. Exemplo: a paleta de comandos (Ctrl+K) tem duas versões, e o sistema usa a nova.

**O risco aqui é o que mais importa:** a versão órfã pode ter um detalhe que a versão em uso não tem. A primeira análise comparou o propósito de cada uma, não linha por linha. Por isso, antes de apagar qualquer duplicado, as duas versões são comparadas, e o que só existir na órfã é trazido para a versão viva.

Três casos pedem cuidado especial:

| Peça | Por que olhar com cuidado |
| --- | --- |
| Discador SIP (`components/calls/DialPad.tsx`) | A versão órfã está descrita como "completa". Pode ter recursos que o discador em uso não tem. |
| Ações da mensagem (`components/inbox/MessageContextActions.tsx`) | A versão órfã mexe no "apagar mensagem", justamente uma funcionalidade que falta: apagar guardando o texto original. |
| Regras de público do Talk X (`segments/segmentRules.ts`, v2) | O nome "v2" sugere uma versão mais nova do que a que está em uso. |

## Caixa 3: mortos (17 grupos)

São atalhos e índices sem conteúdo próprio ("apelidos" de outros arquivos) ou enfeites removidos de propósito. Exemplo: o seletor global de velocidade de áudio foi tirado num commit chamado "Remove global SpeedSelector", porque cada player ganhou o seu.

Mesmo nesta caixa apareceram duas peças que **não são lixo**:

| Peça | O que é | Decisão |
| --- | --- | --- |
| Painel da fase 7 do Copiloto RADAR (`components/copilot/RadarPhase7Panel.tsx`) | Só estava exposto por um arquivo-índice que ninguém usa. Era funcionalidade desligada, não morta. | Ligado na caixa de digitação da Inbox pela PR #2288. |
| Validação de importação de contatos e campanhas (`lib/zappSchemas.ts`) | Esqueleto de CRUD de 02/01/2026 (commit `ffae51b95`), com nomes de campo genéricos. Não existe tela de importação na `main` para ele alimentar. | Manter como está até existir uma importação; não é trabalho interrompido. |

## Como garantimos que nada se perde

1. **Nada é apagado nesta etapa.** O mapa foi feito só em leitura.
2. **Antes de qualquer limpeza,** cada duplicado é comparado com a versão viva, e cada morto, com o histórico. O que tiver comportamento próprio vira item de "vale ligar".
3. **As branches importadas continuam intactas no GitHub.** Mesmo depois de uma limpeza, o código original pode ser recuperado de lá.
