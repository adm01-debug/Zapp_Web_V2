Especialista: iris
## O que mudou e por quê
Tradução dos textos de acessibilidade dos primitivos de UI para pt-BR (Fechar, Mais, "Ir para a página anterior", Anterior, "Ir para a próxima página", Próximo, "Mais páginas", "Alternar barra lateral"; `aria-label="Fechar"` restaurado em ToastClose) nos 6 arquivos do pedido: src/components/ui/dialog.tsx, sheet.tsx, breadcrumb.tsx, pagination.tsx, toast.tsx e sidebar/sidebar-primitives.tsx. Estado presente e verificado nesta branch (base dia/2026-10-15, via commit 77fc9ad75b do cartão 261013142433b0); o cherry-pick do trabalho anterior 70605fb51f foi avaliado e dispensado por conteúdo idêntico ao já integrado, e o fix da recusa está byte-idêntico ao commit c9876d6014 (`git diff c9876d6014 HEAD -- src/components/talkx/__tests__/TalkXSuppressionReasons.test.tsx` vazio).

## Prova
- `grep -rn` de textos em inglês nos 6 arquivos retorna só nomes de API (DialogPrimitive.Close, showCloseButton, ToastPrimitives.Close); pt-BR confirmado: Fechar (dialog:82, sheet:62, toast:74), Mais (breadcrumb:77), Ir para a página anterior/Anterior, Ir para a próxima página/Próximo, Mais páginas (pagination:50,52,59,68), Alternar barra lateral (sidebar-primitives:107,121,124).
- `grep -rn` por buscas ao texto inglês em testes/e2e: só prop `onClose`, chave i18n en `actions.close` e asserções negativas do teste novo; os 4 testes atualizados usam o texto em português.
- `npx vitest run src/components/talkx/__tests__/TalkXSuppressionReasons.test.tsx src/components/ui/__tests__/primitivos-a11y-pt.test.tsx` → `Test Files 2 passed (2); Tests 9 passed (9)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (106s)` (tipos OK, lint OK, migrations OK; sem migration no cartão).
- vermelho antes (teste TalkX revertido ao pré-fix c9876d6014^): `Tests 2 failed | 1 passed (3)`, `TestingLibraryElementError: Found multiple elements with the role "button" and name /^Fechar$/i` nos 2 casos; verde depois (fix restaurado): 9/9 passam.

## Pontos do revisor
- Ponto 1 (quebra no empilhamento em src/components/talkx/__tests__/TalkXSuppressionReasons.test.tsx; correção do cartão t_651b51d4): resolvido — helper `botaoFecharDoRodape` com `getAllByRole('button', { name: /^Fechar$/i })` escolhendo o botão sem `svg` (o do rodapé), sem afrouxar asserção; prova vermelho/verde acima.
