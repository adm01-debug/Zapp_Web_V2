Especialista: worker (geral)

## O que mudou e por quê
- Nenhum arquivo de código mudou. Este cartão está "já resolvido": o chip "Arquivadas" e a suíte que
  o prova já integram a base dia/2026-10-12 (commit 32c68d56a). O próprio cartão prescreve, nesse
  caso, "PROVA e relata — sem commit novo"; o diff de código é vazio e o único conteúdo do commit é
  este relato (`.tmp/relato.md`, arquivo que a base versiona por acidente e que o fechar exclui dos
  diffs via `:(exclude).tmp`).

## Prova
- Comando: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx`
- Resultado: `Test Files  1 passed (1)` / `Tests  12 passed (12)`
- Implementação (src/components/inbox/conversation-list/StatusChips.tsx):
  - linha 10: `ChipTab` inclui `'archived'`
  - linhas 18–25: `COUNTER_TONE.archived` reusa o tom dos demais chips (`bg-muted text-foreground`)
  - linhas 37–40: filtro que tira as arquivadas dos contadores de lista ativa
  - linhas 49 e 57: `archived = conversations.filter(c => c.contact.conversation_status === 'archived')`
  - linha 67: `{ id: 'archived', label: 'Arquivadas', count: counts.archived, icon: Archive }`
  - linha 78: `data-testid={`status-chip-${chip.id}`}` → `status-chip-archived`
- Testes (src/components/inbox/__tests__/StatusChips.test.tsx):
  - linha 48: chip `status-chip-archived` renderiza
  - linha 83: contagem 0 na fixture padrão (sem archived)
  - linhas 93–98: clique emite `onChipTabChange('archived')`
  - linhas 100–118: mesmo estilo ativo dos demais chips
  - linhas 120–138: contagem exata pelo status real (3 arquivadas → '3') e exclusão de Todas/Não lidas/Em atendimento/Aguardando
  - linhas 140–146: ícone Archive só no chip Arquivadas

## Critério de pronto
- "Diff restrito aos 2 arquivos": atendido — `git diff --numstat dia/2026-10-12..HEAD -- .
  ':(exclude).tmp'` é vazio; nenhum arquivo fora dos 2 citados foi tocado.
- "Teste vermelho antes e verde depois": atendido pelo caminho que o cartão define para "já resolvido".
  O estado pré-correção (sem o chip "Arquivadas") não existe neste workspace, porque 32c68d56a já é
  base — logo não há comportamento antigo contra o qual o teste falhe. A prova é a suíte VERDE acima
  (12/12), que cobre o chip, o clique, o estilo ativo, a contagem por `conversation_status` real e o ícone.

CONCLUÍ.
