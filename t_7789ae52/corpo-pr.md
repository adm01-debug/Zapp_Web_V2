## Descrição

Correção do defeito em que a row "Conexão WhatsApp" no TalkXWizardReview usava step={1} em vez de step={3}, fazendo com que o botão "Editar" na row de conexão navegasse para o passo 1 (Nome da campanha) em vez do passo 3 (Entrega). Ajuste do step para step={3} e adição de teste red-first que confirma onEditStep(3) ao clicar em Editar na row de Conexão WhatsApp.

## Tipo de Mudança

- [ ] 🐛 Bug fix (correção de bug)
- [x] ✅ Testes

## Plano

- Plano do Claude: TL-145 Talk X: Passo Entrega
- Passos executados: alterar step={1} para step={3} na row Conexão WhatsApp de TalkXWizardReview; criar teste TalkXWizardReview.step3.test.tsx com padrão red-first (vermelho antes, verde depois)
- Divergências do plano: nenhuma

## Banco de dados

não se aplica

## Rollback

não se aplica

## Testes Realizados

- [x] testes unitários: npx vitest run src/components/talkx/__tests__/TalkXWizardReview.step3.test.tsx — 1 passed

## Checklist

- [x] Código segue o padrão do projeto
- [x] Teste red-first executado e passando
- [x] Sem console.log ou debug code
- [x] Sem secrets/credenciais hardcoded
- [x] Tipos TypeScript corretos

## Achados fora do escopo (NÃO corrigidos)

nenhum

## Notas para Reviewer

Defeito: row "Conexão WhatsApp" no TalkXWizardReview usava step={1} em vez de step={3}. Correção aplicada em TalkXWizardDelivery.tsx linha 220. Teste adicionado em TalkXWizardReview.step3.test.tsx.
