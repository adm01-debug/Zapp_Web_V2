# Paridade V3 → V2: documento 09 (contato, lista, IA e figurinhas), 12/10/2026

Documento auditado: `Zapp_Web_V3/docs/estado/09-features-inbox-components-contato-lista-ia.md`. São cerca de 60 arquivos em quatro módulos: `ai-tools`, `contact-details`, `conversation-list` e `stickers`.

Código V2 comparado: branch viva `.integrador`.

## Método

- Três frentes paralelas, só de leitura, compararam função por função.
- Cada frente recebeu os planos e as decisões que já existiam, para não duplicar: Contatos por jornada (CT), Figurinhas, remoção de etiquetas de 12/10 e reconciliação.
- Confirmei no código o achado de maior impacto: o bloqueio e o VIP dependem de etiquetas.
- Detalhe de método: o `origin/main` da V3 já corrigiu os achados A7 e A8 de figurinhas que o documento descreve, então a comparação foi feita com o código atual.

## Lacunas, com cartão criado e delegado (faixa P, 18 cartões)

| Cartões | Lacuna |
|---|---|
| AY1 | Ferramentas de IA sem acessibilidade: anúncios, nomes de botões, filtro de período pelo teclado e painel que não funciona como diálogo. Também corrige defeitos de exibição herdados. |
| CI1 | A inteligência comercial (risco de churn e melhores horários) existe pronta na V2, mas nenhuma tela a usa. |
| CQ1 | O painel faz duas consultas cujo resultado descarta. |
| SLT1, SLT2 | Linha do tempo de SLA por contato. |
| CF1 | Campos personalizados (locais do Zapp, não do Singu) invisíveis no atendimento. |
| WS1 | Stories do WhatsApp do contato. A presença online continua fora, pela decisão R2-INB-030. |
| EG1 | Pontuação de engajamento inventada: parte de 50 fixo e o bônus nunca soma. |
| MV1 | Memória da conversa sem tela. |
| BK1-3 | **O bloqueio depende da etiqueta "Bloqueado"**, e o plano de remoção das etiquetas não o trata. Passa a ter campo próprio, com os dados migrados **antes** de a migration apagar as etiquetas (ligado ao cartão `t_b7b5d9f3`). |
| VP1, VP2 | O VIP passa a ter campo próprio, como a decisão D-T2 previa, com os dados migrados antes da remoção. |
| LS1, LS2 | Lista de conversas: selo de falha de envio com motivo, "digitando…", nome completo, telefone quando não há nome, status no avatar e prévia ao passar o mouse. |
| KN1 | Atalhos Alt+↑/↓ anunciados e sem efeito; navegação por setas na lista. |
| SK1 | Gerenciador de figurinhas: enviar figurinha nova, erros visíveis, contador de uso, "Recentes" coerente e rótulos. |

**Também feito:** arquivei o cartão `t_77267920` (`[retomar]` das funções de adicionar e remover etiqueta), que contrariava a decisão de remover as etiquetas.

## Descartes com motivo

- **Etiquetas do contato e etiquetas automáticas de IA:** decisão do dono.
- **Presença online:** decisão R2-INB-030.
- **Cache de resumo no cliente:** dependia de um bug da V3.
- **Botão "Resumo" dentro do assistente:** a função existe em outro ponto da tela.
- **Vídeo:** fica atrás de flag e mostra "em breve".
- **Editar com trava otimista:** a edição vai para o Singu (CT).
- **Estatísticas inventadas (A16):** a V2 usa dados reais.
- **SLA de entrega por contato:** já coberto por SD1-4.
- **A3, A4 e A11:** não se aplicam à V2.

## Equivalente na V2 (resumo)

- **Ferramentas de IA:** abas, resumo, sentimento (melhor na V2), pontos-chave, histórico (melhor), filtro de período, leitura em voz, tons, cartão de resposta, objeções e Ajuda dos Universitários.
- **Persistência dos resumos:** feita por uma Edge com o erro visível, sem o defeito A1.
- **Painel do contato:** atribuição pelo Transferir, estatísticas reais, mídias na aba Arquivos, acordeão salvo, ligação, e-mail, arquivar, CRM360 e DISC/rapport no Singu.
- **Lista:** três densidades, canal, SLA, sentimento, não lidas, fixadas, atribuição e seleção múltipla.
- **Figurinhas no seletor:** prévia, WebP, favoritar, excluir com confirmação, recategorizar e busca.

## Totais da frente

- 262 cartões.
- Reconciliação com 215 achados: 150 com cartão e 65 descartados com motivo.
