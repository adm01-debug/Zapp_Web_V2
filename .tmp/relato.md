Especialista: hugo
(refazer executado pelo semisenior na área de hooks do hugo — cartão reencaminhado de senior para semisenior no piloto de 13/10; escopo de código inalterado.)

Ponto 1 — filtro de data em UTC em vez do fuso local. Troquei em `src/components/admin/useAdminData.ts` o `gte` por `new Date(`${auditFrom}T00:00:00`).toISOString()` e o `lte` por `new Date(`${auditTo}T23:59:59.999`).toISOString()`, e ajustei o comentário de "em UTC" para fuso local. Teste: `aplica gte/lte com o dia inteiro no fuso local e range 1-based` em `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts`, que calcula o esperado com `new Date(...)` e confere a ida-e-volta no horário local (gte à 00:00 do dia pedido, lte às 23:59). Vermelho antes (TZ=America/Sao_Paulo, hook antigo): `Tests 1 failed | 8 passed (9)` — esperado `2026-10-01T03:00:00.000Z`, recebido `2026-10-01T00:00:00.000Z`. Verde depois: `Tests 9 passed (9)`.

Ponto 2 — comentário do AuditLogFilter. Reescrito em `src/components/admin/useAdminData.ts`: o parâmetro é opcional e a tela (AdminView) ainda vai ligar o filtro; o hook só monta a consulta. Sem mudança de comportamento; coberto pelos mesmos testes do ponto 1 (filtro continua opcional — `usa o range padrão`, 9 passed).

Ponto 3 — relato dizia que a tela usa a régua. Corrijo aqui: `MIN_PASSWORD_LENGTH = 8` é exportado pelo hook para a tela usar depois; o `PasswordStrengthMeter` continua fora do escopo deste cartão (só `AdminView.tsx`, que este cartão não pode tocar). Pendência registrada fora deste diff: ligar no `AdminView.tsx` o `PasswordStrengthMeter`, o filtro de data, a paginação e a exibição do `error` — nenhum desses fios existe ainda na tela. Teste: `expõe a régua de 8 caracteres da Edge` (9 passed).

Ponto 4 — primeira linha do relato. Agora é exatamente `Especialista: hugo`; a explicação do roteamento está na linha 2 acima. Sem mudança de código.

Ponto 5 — `vi.unstubAllGlobals()` no fim de cada teste. Removidos os dois `vi.unstubAllGlobals()` do fim dos testes de senha e adicionado `afterEach(() => { vi.unstubAllGlobals(); })` no describe de senha em `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts`; o `fetch` falso é restaurado mesmo se uma asserção falhar no meio do teste. Teste: os dois testes de senha (`recusa 7 caracteres sem chamar a Edge`, `aceita 8 caracteres e chama a Edge`) passam com o `afterEach` (9 passed); o `afterEach` executa em todo teste do describe por construção do vitest.

Arquivos (git diff --name-only 96dd72dc5f...HEAD):
src/components/admin/useAdminData.ts
src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts
src/components/admin/__tests__/useAdminDataColumns.test.ts
.tmp/relato.md

Prova:
- vermelho: `TZ=America/Sao_Paulo npx vitest run src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` → `Test Files 1 failed (1); Tests 1 failed | 8 passed (9)`
- verde: mesmo comando → `Test Files 1 passed (1); Tests 9 passed (9)`
- módulo: `npx vitest run src/components/admin/__tests__` → `Test Files 17 passed (17); Tests 60 passed (60)`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (9s)` (sem migration neste cartão; banco não aplicável)
