Especialista: workertestes

## O que mudou e por quê (refazer 1 — só os 5 pontos da recusa; entrega anterior mantida)

- Trabalho anterior aproveitado sem recomeçar: o workspace já continha exatamente 1 commit deste cartão
  (`33918e88ee`, sobre `dia/2026-10-13`; `git log --oneline dia/2026-10-13..HEAD` lista só ele). Nenhum
  cherry-pick, nenhuma FAIXA DO PAI, nenhum arquivo de produção alterado.
- `src/components/ui/__tests__/dialog.test.tsx`: teste tautológico trocado por asserção real (Ponto 4).
- `src/components/ui/__tests__/offline-indicator.test.tsx`: teste do `ConnectionToast` com timers falsos (Ponto 5).
- `src/components/ui/__tests__/motion-variants.test.tsx`: comentário e título com encoding corrompido regravados
  em UTF-8 pt-BR (Ponto 3).
- `.tmp/relato.md` (este arquivo): primeira linha exata, linhas de `dialog`/`sheet` corrigidas e linha de
  resultado do vitest incluída (Pontos 1 e 2).

## Prova

- verde depois: `npx vitest run src/components/ui/__tests__/` →
  `Test Files 30 passed (30)` | `Tests 182 passed | 3 expected fail (185)`.
- verde depois (4 arquivos da recusa): `npx vitest run .../dialog.test.tsx .../offline-indicator.test.tsx
  .../motion-variants.test.tsx .../sheet.test.tsx` →
  `Test Files 4 passed (4)` | `Tests 23 passed | 3 expected fail (26)`.
- `npx eslint` nos 4 arquivos acima → sem saída (0 avisos).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (14s)` (banco_local AVISO: sem nome de conjunto;
  sem migration neste cartão, nada a verificar no banco).
- Cobertura: `ls src/components/ui/__tests__/*.test.tsx | wc -l` → `30` (critério: ao menos 30).
- Encoding: `grep -rPn "\xC3\x83" src/components/ui/__tests__/` → vazio (sem mojibake).

## Ponto 1: relato (primeira linha + linha de resultado do vitest) — resolvido neste arquivo

- Primeira linha agora é exatamente `Especialista: workertestes`.
- Linha de resultado incluída acima em Prova (`Test Files 30 passed (30)`, `Tests 182 passed | 3 expected fail`).

## Ponto 2: arquivo:linha incoerente (dialog:72/sheet:70 no relato × dialog:82/sheet:62 nos it.fails) — resolvido

- Conferi a linha real do texto 'Close': `grep -n "Close" src/components/ui/dialog.tsx
  src/components/ui/sheet.tsx` → `dialog.tsx:82: <span className="sr-only">Close</span>` e
  `sheet.tsx:62: <span className="sr-only">Close</span>`.
- Os títulos dos `it.fails` já estavam certos (`dialog.test.tsx:98` cita `dialog.tsx:82`;
  `sheet.test.tsx:76` cita `sheet.tsx:62`) e NÃO foram alterados.
- Corrigi o relato: `dialog.tsx:72` → `dialog.tsx:82`, `sheet.tsx:70` → `sheet.tsx:62` (seção Achados abaixo).
- `sheet.test.tsx` não precisou de nenhuma mudança de código.

## Ponto 3: encoding corrompido em motion-variants.test.tsx — resolvido

- `src/components/ui/__tests__/motion-variants.test.tsx:84-89`: comentário ('preferência', 'lê', 'não', 'à')
  e título do `it` regravados em UTF-8 legível, em pt-BR. Nenhuma asserção alterada.
- Prova: `grep -rPn "\xC3\x83" src/components/ui/__tests__/` vazio + suíte verde acima.

## Ponto 4: teste tautológico em dialog.test.tsx — resolvido com asserção real (não removido)

- Removido `o gatilho de fechar traz o ícone dentro de um nome acessível` (`fechar.length > 0`, sempre
  verdadeiro com o botão Cancelar).
- Novo teste `src/components/ui/__tests__/dialog.test.tsx:83`: `o botão X fecha o diálogo e é distinto do
  "Cancelar" do rodapé` — localiza o X (nem gatilho nem Cancelar), clica nele e prova que o diálogo fecha.
  Não fixa o texto inglês (sobrevive à troca do UI-03 para "Fechar").
- Vermelho antes (mutação temporária em `dialog.tsx`, bloco `{showCloseButton && (` → `{false && (`,
  revertida em seguida, `git diff` de produção vazio): `npx vitest run .../dialog.test.tsx` →
  `Test Files 1 failed (1)` | `Tests 1 failed | 5 passed | 1 expected fail (7)`.
- Verde depois (mutação revertida): incluído nos `Tests 23 passed | 3 expected fail (26)` acima.

## Ponto 5: ConnectionToast com espera real de 3 s (flaky) — resolvido com timers falsos

- `src/components/ui/__tests__/offline-indicator.test.tsx:106`: `vi.useFakeTimers()`; prova o agendamento
  (`setTimeout` chamado com `3000`), avança `2999 ms` (toast ainda visível) e `1 ms` (estado cai); a saída
  do `AnimatePresence` roda com timers reais (`vi.useRealTimers()` + `waitFor` padrão). Sem `it(..., 10000)`,
  sem espera real de 3 s: o arquivo inteiro roda em ~2 s (`tests 388ms`).
- A justificativa antiga ("timers falsos não concluem a saída no jsdom") fica superada pela execução: a
  saída conclui com timers reais após o estado cair sob relógio falso.
- Vermelho antes (mutação temporária em `offline-indicator.tsx:91`, `3000` → `2000`, revertida em seguida,
  `git diff` de produção vazio): `npx vitest run .../offline-indicator.test.tsx` →
  `Test Files 1 failed (1)` | `Tests 1 failed | 6 passed | 1 expected fail (8)`.
- Verde depois (mutação revertida): incluído nos `Tests 23 passed | 3 expected fail (26)` acima.

## Achados (defeito real do produto, deixado vermelho de propósito como `it.fails`; correção é do cartão de UI)

- `src/components/ui/dialog.tsx:82` e `src/components/ui/sheet.tsx:62`: o botão de fechar do overlay ainda anuncia
  "Close" em inglês; o teste espera o texto final pt-BR ("Fechar"), que o UI-03 troca. `it.fails` cita o arquivo:linha.
- `src/components/ui/offline-indicator.tsx:69`: o botão "Tentar novamente" não declara `type="button"` (o V3 declara).
  `it.fails` cita o arquivo:linha.

## O que NÃO fiz e por quê

- Não corrigi nenhum componente de produção (este cartão é só de teste); os achados acima ficam registrados aqui.
- Não alterei `sheet.test.tsx` (o Ponto 2 nele se resolveu só no relato) nem nenhum outro teste da pasta:
  `git diff --name-only` (mudanças desta rodada, ainda não commitadas) lista exatamente:
  `.tmp/relato.md`
  `src/components/ui/__tests__/dialog.test.tsx`
  `src/components/ui/__tests__/motion-variants.test.tsx`
  `src/components/ui/__tests__/offline-indicator.test.tsx`

## Comandos de verificação (resultado real)

- `npx vitest run src/components/ui/__tests__/dialog.test.tsx src/components/ui/__tests__/offline-indicator.test.tsx src/components/ui/__tests__/motion-variants.test.tsx src/components/ui/__tests__/sheet.test.tsx` → `Test Files 4 passed (4)`, `Tests 23 passed | 3 expected fail (26)`.
- `npx vitest run src/components/ui/__tests__/` → `Test Files 30 passed (30)`, `Tests 182 passed | 3 expected fail (185)`.
- `npx eslint` nos 4 arquivos → sem saída (0 avisos).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (14s)`.
- `git log --oneline dia/2026-10-13..HEAD` → só `33918e88ee` (entrega anterior) + o commit desta rodada.
