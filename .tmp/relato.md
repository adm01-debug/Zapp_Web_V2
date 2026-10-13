Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- Arquivos novos em `src/components/ui/__tests__/`, contrato dos primitivos de overlay, dos boundaries e das
  variantes de motion: `dialog`, `alert-dialog`, `sheet`, `select`, `dropdown-menu`, `popover`, `tabs`, `switch`,
  `checkbox`, `section-error-boundary`, `offline-indicator`, `error-boundary-retry`, `motion-variants`.
  Cada arquivo renderiza o componente REAL do projeto (nenhum mock do sujeito): abre/fecha pelo papel ARIA, prova
  `aria-expanded`/`aria-checked`/`aria-selected`, foco inicial e retorno ao gatilho, Esc, clique fora, o backoff do
  auto-retry, o `reportClientError` do boundary de seção, a sonda `/favicon.ico` do indicador offline e a regra das
  variantes (só transform/opacidade; todo deslocamento volta a zero no estado final).
- Nenhum arquivo de produção foi alterado: `git status --short` mostra só os `?? ...test.tsx` novos e `git diff --stat`
  veio vazio (as mutações usadas como prova foram revertidas).

## Prova
- vermelho antes (mutação em `src/components/ui/error-boundary-retry.tsx:63`, auto-retry desligado):
  `npx vitest run .../error-boundary-retry.test.tsx` →
  `Unable to find an element with the text: Tentando novamente... (1/2)` (1 falha).
- vermelho antes (mutação em `src/components/ui/section-error-boundary.tsx:41`, `handleRetry` sem reset):
  `npx vitest run .../section-error-boundary.test.tsx` → falha em "Tentar novamente reseta e remonta os filhos".
- vermelho antes (mutação em `src/components/ui/offline-indicator.tsx:36`, `method: 'HEAD'` → `'GET'`):
  `npx vitest run .../offline-indicator.test.tsx` →
  `expected "vi.fn()" to be called with arguments: [ '/favicon.ico', ObjectContaining{…} ]`.
- verde depois (após reverter as três mutações): `npx vitest run src/components/ui/__tests__/` → a suíte da pasta da
  UI passa inteira, com os `it.fails` esperados.
- `npx eslint src/components/ui/__tests__/*.test.tsx` → sem saída (0 avisos).

## Achados (defeito real do produto, deixado vermelho de propósito como `it.fails`; correção é do cartão de UI)
- `src/components/ui/dialog.tsx:72` e `src/components/ui/sheet.tsx:70`: o botão de fechar do overlay ainda anuncia
  "Close" em inglês; o teste espera o texto final pt-BR ("Fechar"), que o UI-03 troca. `it.fails` cita o arquivo:linha.
- `src/components/ui/offline-indicator.tsx:69`: o botão "Tentar novamente" não declara `type="button"` (o V3 declara).
  `it.fails` cita o arquivo:linha.

## O que NÃO fiz e por quê
- Não corrigi nenhum componente de produção (este cartão é só de teste); os achados acima ficam registrados aqui.
- O atraso de 3 s do `ConnectionToast`: provo o valor com `vi.spyOn(window, 'setTimeout')` chamado com `3000` e espero
  a saída real do `AnimatePresence`. Com timers falsos a animação de saída do framer (rAF) não conclui no jsdom e o nó
  não seria removido, deixando o teste frágil — por isso a espera real e o registro da escolha aqui.
