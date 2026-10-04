# Riscos e aceites ainda abertos no produto

Os riscos abaixo foram identificados pela auditoria concluída. A tabela reúne causas e limites; as evidências completas e severidades originais estão em [FINDINGS.json](FINDINGS.json). Não há alegação de exploração real ou de observação de produção que não esteja explicitamente documentada.

**Atualização posterior ao baseline:** o [adendo final](reports/git/FINAL_REMOTE_DELTA.md) examinou o avanço para `4e73c7767858f00c577c29efd8cc86f5bea117a9` (PR #1870, 03/10 às 22:50:32 UTC). Ele reconhece a integração e o deploy de Talk X X028, conserva o aceite real pendente e registra três riscos residuais, além da persistência do placar defasado. As contagens deste corpo continuam no baseline original.

| Frente | Referências | Risco observado | Próxima prova necessária |
| --- | --- | --- | --- |
| Integridade de execução | MX01–MX08; TC-001–TC-006 | Fila, payload, concorrência e contratos de mídia/membership não convergem em todos os consumidores. | Revisão e testes de contrato por caminho ativo; sem merge integral de branch. |
| Isolamento por conexão | TRA-002–TRA-006; MX07; IA-CHATBOT-001 | Fallback global, seleção de flow e labels podem cruzar escopos. | Provar identidade/conexão de origem em cada caminho e em cenários com IDs coincidentes. |
| Autenticação/replay de webhook | IA-WEBHOOK-001; Cline054 | Assinatura válida não garante idempotência; OIDC Gmail é observacional no baseline. | Confirmar contrato do provedor, rejeição, dedupe e resultado de persistência em ambiente autorizado. |
| Correção de métricas | DASH-*; IA-SENTIMENT-001; SV-001/002 | Identidade, joins, vocabulário e amostras alteram o significado dos números. | Fixtures com ambiguidades, evidência SQL verdadeira e rótulos que descrevam o denominador. |
| Prova de aceite | TEL-RUNTIME-001; DASH-ACCEPTANCE-001; OTH-008 a OTH-014 | Presença de código e CI verde não encerram SIP, medição, ambiente externo ou observação. | Evidência datada depois da última alteração, com critério literal e ambiente. |
| Fidelidade do histórico | Banco Único; Team Chat F/TC; _superseded | Executar o plano antigo literalmente pode restaurar desenho cancelado ou guarda fraca. | Resolver autoridade, preservar cancelamentos e comparar por contrato. |
| Confiança em CI | #1862/#1854/#1863; TRA-007/008 | Agregados verdes, 403 e falha de bootstrap ocultam resultados diferentes. | Ler check-runs e causalidade; recuperar observação sem afirmar configuração errada. |
| Limpeza prematura | 84 candidatos AST; 197 commits exclusivos | Nenhum importador estático ou patch-id igual não é prova de morte. | Auditar consumidores dinâmicos, efeitos e alcance antes da missão de remoção. |

## Qualificações que fazem parte da conclusão

A função Dashboard examinada continua SECURITY INVOKER com RLS/ACL anteriores. A tela de gerenciamento de departamentos está inacessível, tornando parte dos defeitos latente. Retorno completed:true de mock do worker não demonstra função SQL correta. O exit2 do DB offline ocorreu antes dos contratos. Credenciais globais dos probes são fixtures e não segredos reais. O guard de tipografia aprovado não certifica contraste nem todos os estilos injetados. Os detalhes estão no [laudo independente](reports/adversarial/INDEPENDENT_REVIEW_2026-10-03.md).

A execução de correções e a coleta de novos aceites reais permanecem fora da autorização desta auditoria. O [registro global](MASTER_LEDGER.json) conserva estados UNKNOWN/NEEDS_REVALIDATION quando a evidência não permite concluir mais.
