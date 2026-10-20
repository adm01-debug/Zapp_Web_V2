## Tipo de Mudança
fix

## Descrição
Corrigido step={1} → step={3} na row "Conexão WhatsApp" de TalkXWizardReview (TalkXWizardDelivery.tsx:220). A row de WhatsApp na etapa de review agora exibe o passo correto (3) em vez do passo 1, alinhando o estado visual com o passo real da conexão.

## Plano
1. Alterar step={1} para step={3} na row "Conexão WhatsApp" de TalkXWizardDelivery.tsx:220.
2. Criar teste TalkXWizardReview.step3.test.tsx que verifica que clicar "Editar" na row de WhatsApp chama onEditStep(3).
3. Rodar o teste e confirmar que passa (1/1).

## Testes Realizados
- Teste TalkXWizardReview.step3.test.tsx criado e aprovado (1/1 passando) — verifica que clicar "Editar" na row "Conexão WhatsApp" chama onEditStep(3).
- Verificação manual: grep confirma step={3} na linha da Conexão WhatsApp.

## Checklist
- [x] Fix aplicado e verificado
- [x] Teste criado e passando
- [x] Sem alterações em arquivos alheios
- [x] Sem regressões

## Banco de dados
Nenhuma migration necessária.

## Achados fora do escopo
Nenhum.
