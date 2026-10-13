Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/knowledge/KnowledgeBaseView.tsx: cada linha da aba Arquivos ganhou o botão "Reprocessar" (outline, text-secondary, ícone RefreshCw) e o botão "Excluir" (ghost, text-destructive, ícone Trash2), ambos com `aria-label` único por arquivo (`Reprocessar arquivo: <nome>` / `Excluir arquivo: <nome>`). "Reprocessar" fica desabilitado quando `processing_status === 'processing'` e os dois botões marcam `aria-busy` e se desabilitam enquanto a ação daquela linha corre, sem disparar duas vezes no mesmo clique (trava por id num `ref`, para o duplo clique no mesmo tick). A ação é por arquivo: uma linha ocupada não bloqueia outra.
- src/components/knowledge/__tests__/KnowledgeBaseView.fileActions.test.tsx (novo): prova pela TELA real — nomes acessíveis únicos por arquivo, os três estados (completed/processing/failed) com o mesmo layout (ícone, selo e as duas ações), Reprocessar bloqueado em "processing", ação chamada uma única vez com o id da linha e `aria-busy` durante a exclusão.
- src/components/knowledge/__tests__/KnowledgeBaseView.a11y.test.tsx: só o mock do hook ganhou `deleteFile`/`reprocessFile`, para o contrato do mock bater com o que a tela consome. Nenhuma asserção foi alterada ou afrouxada.

O contrato consumido vem do cartão pai (t_e2e71096): `deleteFile(id): Promise<boolean>` e `reprocessFile(id): Promise<boolean>`. A faixa do pai não estava no meu workspace; trouxe por `git cherry-pick 8be436a39` (só o commit de código; o commit de relato do pai não traz nada para esta tela).

Arquivos do pai que aparecem no diff e que o meu cartão não lista — explicação do aviso do juiz: `src/hooks/integrations/useKnowledgeBase.ts`, `src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx` e `src/hooks/integrations/__tests__/useKnowledgeBase.uploadIngest.test.tsx` NÃO foram tocados por mim; vêm inteiros do commit cf346403b (cherry-pick de 8be436a39, cartão pai). Foram indispensáveis porque a tela chama `deleteFile`/`reprocessFile`, que só existem nesse commit; sem a faixa, o meu teste nem compila. Meus commits são d3a1cc700 (tela + teste) e o de relato; `git show --stat d3a1cc700` mostra só arquivos de `src/components/knowledge/**`.

Observação (registrada em comentário, fora da minha área): a tela não decide permissão nem o que vai ao Storage — isso é do hook/Edge. O parecer do revisor sobre o cartão pai (URL assinada com validade de 1 dia gravada em `file_url`) é do pai, não desta tela.

## Prova
- vermelho antes: `git show HEAD:src/components/knowledge/KnowledgeBaseView.tsx > <arquivo> && npx vitest run src/components/knowledge/__tests__/KnowledgeBaseView.fileActions.test.tsx` (componente de HEAD, sem os botões) → `Tests 6 failed (6)`, primeira linha `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Reprocessar arquivo: manual.pdf"`
- verde depois: `npx vitest run src/components/knowledge src/components/integrations/__tests__/corCruaTokens.test.tsx` → `Test Files 3 passed (3); Tests 20 passed (20)` (inclui os 11 do diretório knowledge: 6 novos + 5 de acessibilidade)

## O que NÃO fiz e por quê
- Não toquei no hook (`useKnowledgeBase`), na Edge Function nem no banco: a tela só chama as ações já entregues pelo cartão pai. O encadeamento "Excluir pede confirmação" não foi pedido pelo cartão e não foi acrescentado.
