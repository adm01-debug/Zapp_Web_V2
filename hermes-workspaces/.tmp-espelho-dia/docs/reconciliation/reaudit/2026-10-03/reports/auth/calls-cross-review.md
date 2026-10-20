# Revisão independente das provas de chamadas

Fonte: `da307ba5626dce892f0b37cb6762463f55d14a96`. Área revisora: Auth/usuários, em revisão cruzada do relatório Calls. Esta nota não cria achados adicionais.

## Conclusão

Os registros R2-CALL-006, R2-CALL-007 e R2-CALL-008 são sustentados pelos contratos examinados, com as precondições e limitações já escritas pelo autor. Os quatro resultados CALL-P08 a CALL-P11 correspondem ao script e aos arquivos fixados. Nenhum caso foi reexecutado nesta revisão.

| Registro | Contrato conferido | Limite preservado |
|---|---|---|
| R2-CALL-006 | O listener guarda a notificação até dismiss ou mudança de identidade; não acompanha o estado terminal do provider. `showDialog` não se reinicializa por callId, e o JSX transmite `initialStatus="answered"`. | Notificação persistente e diálogo entre chamadas pressupõem ausência de fechamento explícito. O probe não monta ReactDOM nem produz áudio, e não demonstra aceite de transporte de B. |
| R2-CALL-007 | O alerta escolhe capacidade pelo canal, mas seus handlers chamam `accept`/`reject` sem a identidade da notificação. O provider encaminha ambos ao SIP. O contrato local do adapter WhatsApp não é usado por essa cadeia. | Interferência sobre SIP A exige a entrada WhatsApp B simultânea declarada no cenário. O limite de áudio do WhatsApp é uma escolha existente, não o defeito alegado. |
| R2-CALL-008 | O hook compara o payload com o ID que observa, mas não com o ID do estado global. Seu único evento remoto é aplicado ao reducer sem identidade e é inválido em `ringing_in`. | O efeito comprovado é transição local do reducer. Não se infere encerramento do transporte SIP, escrita no banco ou ocorrência produtiva. |

Foram preservados controles positivos: filtragem de replay terminal antes da entrega, dismiss explícito, guarda de identidade do usuário, comparação do payload com o ID observado e mapeamento mais completo de término dentro do provider. A prova não nega essas proteções.

## Método e proveniência

Foi lido integralmente `../../tools/call_overlay_probes.cjs` (104 linhas) e o arquivo de resultados `../calls/overlay-probe-results.json`. Também foram examinados os corpos do listener, hook de término e regras puras de término/toque, além dos trechos consumidores do alerta, diálogo, capacidades, provider, SIP, adapter WhatsApp e montagem global.

O script recebe checkout, manifesto, TypeScript e destino por argumentos. Antes de carregar TypeScript ou avaliar código do produto, compara HEAD com o manifesto e verifica os 12 blobs carregados. O compilador carrega callbacks extraídos por AST e módulos completos com dependências explicitamente substituídas; uma dependência não prevista é rejeitada. As primitivas React, query, entrega de notificação e SIP são sintéticas, e esse limite está declarado nos resultados.

Nesta revisão, foram recalculados o SHA256 do script, o SHA256 do manifesto e SHA256/blob de cada um dos 12 arquivos usados. Todos coincidem com o resultado preservado, e o checkout está limpo. A verificação de integridade não foi apresentada como nova execução dos casos, teste negativo dos pins ou validação do ambiente real.

- Script SHA256: `042d6966b21af3f0f42259e42bdd536b3e01ee108078a940f26574fa5ebc67fb`.
- Manifesto SHA256: `b1a772a2698b193cb0abb3d7c445d4e35ca1b259618d0cebcb6f302f69d30fc4`.
- Resultado preservado: quatro casos PASS, TypeScript 5.9.3, sem chamadas reais a serviços.

As faixas de código lidas por esta subárea estão em `coverage.json`; leitura integral de arquivos feita por outra área não foi promovida a leitura própria. Os 20 componentes restantes de Calls foram examinados em lote separado e deram origem a R2-AUTH-051/052, sem duplicar os registros Calls/Módulos.

