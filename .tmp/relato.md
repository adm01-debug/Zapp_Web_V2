Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/ui/phone-input.tsx` (novo): campo de telefone com máscara `+55 XX XXXXX-XXXX` (celular) e `+55 XX XXXX-XXXX` (fixo), aceita internacional sem formatar, só dígitos, e `onChange` devolve `(formatado, bruto)` — comportamento portado do `PhoneInput` da V3. O valor exibido é derivado do `value` controlado com `useMemo` (sem `setState` em effect), o que também evita a ocorrência nova do ratchet de lint `react-hooks/set-state-in-effect`.
- `src/components/connections/ConnectionsView.tsx` (só o diálogo de nova conexão): troca o `Input` livre pelo `PhoneInput`; o valor que sobe para `handleAddConnection` continua formatado, como o fluxo atual já recebia. Mostra a mensagem de erro DENTRO do diálogo com `role=alert` (`data-testid="add-connection-error"`) e NÃO fecha o diálogo no erro.
- `src/hooks/inbox/useConnectionsManager.ts`: expõe `addConnectionError` — a MESMA mensagem que já ia para o toast, preenchida nos mesmos pontos (validação e catch), sem mudar lógica nem segurança. Necessário para o erro de borda/banco ter de onde ser lido pelo diálogo. Fronteira registrada em `kanban_comment`: arquivo é da área de hooks, toque mínimo.

Concluí o cartão.

## Prova
- Vermelho antes: `npx vitest run src/components/ui/__tests__/phone-input.test.tsx src/components/connections/__tests__/ConnectionsView.erro-dialogo.test.tsx` → FAIL (módulo `phone-input` inexistente; máscara e alerta ausentes).
- Verde depois: mesmo comando → `Test Files 2 passed (2); Tests 8 passed (8)`.
- Regressão da área tocada: `npx vitest run src/components/connections src/hooks/inbox/__tests__` → `Test Files 26 passed (26); Tests 120 passed | 1 expected fail`.

## O que NÃO fiz e por quê
- Seletor de tipo de API (Evolution/oficial): fica para a auditoria do doc 16, como o próprio cartão determina.
