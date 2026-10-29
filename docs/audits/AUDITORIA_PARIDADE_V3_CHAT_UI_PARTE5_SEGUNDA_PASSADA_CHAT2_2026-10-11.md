# Paridade V3 → V2: segunda passada do documento 08-chat-2 (11/10/2026, tarde)

Documento auditado: `Zapp_Web_V3/docs/estado/08-features-inbox-components-chat-2.md` (49 arquivos: 22 de lógica e hooks e 27 testes).
Código V2 comparado: branch viva `.integrador` (HEAD cff97c98a).
Antecedentes: Partes 2 e 3 (primeira passada) e Parte 4 (segunda passada do chat-1).

## Método

Duas frentes paralelas, ambas só de leitura. Uma delas foi interrompida por uma queda de energia às 13:45 e retomada.

1. **Lógica:** os 15 arquivos de lógica e hooks da V3 lidos inteiros e comparados ramo a ramo com a V2.
2. **Testes:** os 25 testes da V3 (sem os dois descartados) cruzados com os testes da V2 e com os corpos dos cartões. Para cada bug que um teste da V3 prova corrigido (BUG-xx, P0-x), conferi se ele ainda existe no código da V2.

Cada achado novo foi conferido no código antes de virar cartão.

## Achados novos, com cartão criado

| Cartão | Especialista | Achado | Gravidade |
|---|---|---|---|
| JG1 | hugo | Editar, reagir e apagar em conversa de **grupo** montam `<id>@s.whatsapp.net`. O webhook grava o grupo sem `@g.us` (`evolution-webhook-handlers.ts` ~l.153). É o P0-1 que a V3 prova. | alta |
| UN1 | iris | Depois de enviar, o aviso oferece "Desfazer" e, ao clicar, diz "Ação desfeita", mas a mensagem já foi entregue ao cliente. A V3 rotula "Restaurar texto". | média |
| SC1 | iris | Faltam os comandos `/whisper` (alterna o sussurro) e `/files` (abre Arquivos da Equipe). | baixa |

## Conferido e já coberto

- Filtro de falhas na URL: FF1 e FF2.
- Link direto com repetição: DL1, DL2 e SM1.
- SLA de entrega: SD1 a SD4. Nota para o SD2: a V3 não deduplica o alerta e mede o tempo desde a última mensagem entregue.
- Respostas rápidas por "/": QR1.
- Clique em botão interativo (BUG-08): IB1.
- Trava única entre áudio e texto, e `/summary`: PH2.
- Rajada de consultas: PF1.
- Vocabulário "Lido": VC1.
- Altura estimada: PL1.
- Agrupamento de bolhas: GR1.
- Prévias e anexo no envio (BUG-11/12): AX1. A entrega foi recusada e o refazer está na fila.
- Testes sem equivalente: TT2, TT3 e RG1.

## Já equivalente ou melhor na V2

- Edição (WhatsApp primeiro, confere linhas, editor aberto se falhar).
- Cópia com confirmação.
- Envio interativo.
- Produto (pelo catálogo, com estoque).
- Encaminhar (resultado por destino).
- Rascunho por dono.
- Agendamento: localizador privado, assinado só no envio, e limpeza de anexo órfão.
- `/remind`: cria uma tarefa real.
- Reducer de diálogos e estado da busca (o painel remonta a cada conversa).

## Descartes com motivo

- **Guards da fila no cliente:** a V2 não tem fila no cliente.
- **`sendContract` com `onProgress`:** o contrato da V2 é outro e o progresso está no AX1.
- **P0-4:** o cache da V2 é por UUID do contato.
- **URL assinada de 7 dias:** não se aplica.
- **Achados de estilo próprios do código da V3** (A8, A10, A11, A13, A14): sem efeito para o usuário na V2.

## Totais da frente após esta passada

- 140 cartões.
- Reconciliação com 124 itens: 97 com cartão, 27 descartados com motivo, 0 erros.
