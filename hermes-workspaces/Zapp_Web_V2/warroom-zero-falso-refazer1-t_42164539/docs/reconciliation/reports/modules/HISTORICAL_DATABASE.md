# Planos históricos de banco — reconciliação de 200etapas

Baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Somente leitura.

Foram preservados 100IDs da seção 6 da auditoria de 27/08 e 100IDs da seção 9 da auditoria de 28/08. Cada linha mantém requisito, origem, linha, status, review_level e evidência atual/histórica. O relatório de 28/08 revalida a rodada anterior, mas não transforma todos os seus itens em concluídos nem autoriza repetir operações de agosto.

## Cancelamentos e sucessões que impedem execução literal

- Os passos 3–6 de 27/08 estão expressamente cancelados. Seus arquivos permanecem em `_superseded`; registrar suas versões como aplicadas seria afirmar uma execução que não ocorreu.
- `mask_channel_credentials` era NO-OP e foi removida. Anexar o trigger agora ressuscitaria uma proteção fictícia. `prevent_role_escalation`, `validate_reset_token`, `get_reset_requests_safe` e `get_own_reset_requests` também têm migrations posteriores de retirada.
- Lockout usa `auth-login` e resposta server-side; MFA usa `supabase.auth.mfa`. Não é necessário recriar acessos às tabelas/RPCs antigas para cumprir a intenção de segurança.
- Gmail possui consumidores e produtores reais de sync/send/anexos/labels. A descrição de funções sem chamador em agosto não pode ser repetida como estado atual.
- Sete migrations estrangeiras continuam preservadas fora do glob ativo. As instruções do projeto continuam designando apenas o Supabase Cloud oficial como alvo.

## Guardas atuais e limite de prova

O ferramental de catálogo/manifesto/drift, a guarda de MCP e o workflow vivo diário com alertas existem. A verificação de cron, porém, declara `COUNTS_ONLY`: não compara a lista exata de jobs exigida no plano. `docs/DB-INVENTORY.md` continua ausente. Arquivo de tipos, manifesto e catálogo são capturas; o run corrente deve provar paridade.

O inventário atual contém 164 tabelas e 779 migrations ativas, portanto as metas 123/124 tabelas e 277 migrations de agosto são premissas históricas. As observações de 30 dias, rotação, configurações Auth, E2E e backup/restore permanecem dependentes de evidência datada. Nenhuma credencial, dado ou ambiente foi alterado; nenhuma mensagem foi enviada.

## Contagens

| Status | Itens |
|---|---:|
| DONE_VERIFIED | 7 |
| NEEDS_REVALIDATION | 85 |
| NO_LONGER_APPLICABLE | 4 |
| PARTIAL | 41 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 23 |
| SUPERSEDED | 12 |
| PRODUCT_DECISION_REQUIRED | 19 |
| NOT_IMPLEMENTED | 3 |
| HUMAN_ACCEPTANCE | 1 |
| BLOCKED_EXTERNAL | 1 |
| OBSERVATION_WINDOW | 4 |

## Nível de revisão

A base de todas as 200 linhas é leitura do requisito histórico e triangulação com caminhos/símbolos atuais. Cancelamentos, arquivos arquivados, migrations de DROP, fluxo Auth/MFA/Gmail e guardas receberam revisão direcionada. Itens que exigem operação externa ou comportamento completo permanecem `NEEDS_REVALIDATION`, decisão de produto, aceite humano ou janela de observação. Referências textuais são anexadas como evidência auxiliar, nunca como conclusão de código morto ou funcionalidade pronta.
