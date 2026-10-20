Especialista: iris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/tabs/NotesTab.tsx:97 — movi `<p>Nenhum registro ainda</p>` para fora do `<ul>`. Antes era filho direto de `<ul>` (HTML inválido, quebra a anunciação de lista no leitor de tela). Agora é irmão do `<ul>`, conforme o critério de pronto.
- src/components/inbox/tabs/__tests__/NotesTab.test.tsx:129-132 — adicionei teste que falha antes da correção (pai é UL) e passa depois (pai não é UL).

## Prova
- vermelho antes: `<p>` era filho direto de `<ul>` → `message.parentElement?.tagName` retornava `UL`
- verde depois: `<p>` está fora do `<ul>` → `message.parentElement?.tagName` não é `UL`
- `git diff --stat` confere com o título: 2 arquivos, mínimo

## Pontos do revisor
- Ponto 1: o `<p>` "Nenhum registro ainda" era filho de `<ul>`, violando a regra axe 'list' e quebrando a anunciação do leitor de tela. Corrigido movendo para fora da lista.
- Ponto 2: teste novo prova o comportamento (vermelho→verde) sem mock que já traga a resposta.