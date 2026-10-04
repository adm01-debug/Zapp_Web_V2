# Revisão independente de R2-GOV-003 e R2-GOV-004

Parecer: **aprovados com limites explícitos, após as correções de redação e evidência**. Fonte fixada em `da307ba5626dce892f0b37cb6762463f55d14a96`. Todos os blobs e limites de linhas das evidências citadas foram reconferidos. O JSON anexo fixa também os hashes dos artefatos de auditoria avaliados.

R2-GOV-003 é refinamento de TC-011. As assertivas literais, as regras locais duplicadas e o UUID constante nos mocks não discriminam as propriedades alegadas. Isso não prova que o serviço real de idempotência esteja quebrado, nem invalida os testes legítimos no mesmo arquivo. Foram preservados controles positivos com helpers/hooks reais: confiança zero em scenario-simulation, resposta obsoleta/desabilitação em useMessages e paginação/assinatura em useContactMedia.

Foram aceitas três correções: usar `loading=false`, como faz o teste de comparação de filas; citar o catch/finally de useQueuesComparison:139–144; e citar os imports reais de scenario-simulation:8–13. O caso isolado useMessages:107–110 apenas exige objeto definido; a evidência positiva de desabilitação vem de 171–199. Nenhuma suíte foi executada por esta revisão.

R2-GOV-004 trata de um runner diferente do R2-INF-014. O validador testa o status final do pipeline com tee, sem pipefail, e não propaga falhas na geração dos artefatos. Li o runner do probe e seus resultados existentes: uma reprodução de falha simulada do comando e dois controles, um com métrica FAIL e outro com sucesso sintético. Não repeti a execução.

A redação corrigida delimita a falha a validate_destino.sh. import.sh possui `set -e`: se o Node que aplica um bloco falhar, o script aborta. A ausência de um bloco é outro caminho, que permite o anúncio prematuro de importação concluída; o resultado final da cadeia ainda depende do validador. Foram adicionadas as linhas 1–2 do import.sh para manter essa distinção verificável.

Não houve importação, consulta a banco real ou execução de serviço. O controle de sucesso usa métricas sintéticas e não certifica o SQL. O campo runtime_observed=false é compatível apenas com ausência de observação do sistema implantado; a execução local do harness permanece documentada. Nenhum bloqueio material restante foi identificado dentro desse escopo.
