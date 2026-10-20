Especialista: semisenior (skill de área: area-sql-banco)

# Relato — [refazer 1] excluir conexão só por admin (t_2adf3c34)

## Ponto 1 — quebra os TESTES no empilhamento (src/lib/__tests__/rlsGroupAccess.test.ts)
Causa: a migration 20261012113232 troca o predicado do DELETE de
`is_admin_or_supervisor(auth.uid())` para `is_admin(auth.uid())`, mas o teste
exigia `ADMIN_OU_SUPERVISOR` para INSERT, UPDATE e DELETE. Empilhado sobre
dia/2026-10-14, o teste falha com `DELETE sem cobertura admin/supervisor`.
O que mudei: só `src/lib/__tests__/rlsGroupAccess.test.ts` — DELETE passa a
exigir `APENAS_ADMIN` (`/is_admin\(\s*auth\.uid\(\)\s*\)/`, não casa com
`is_admin_or_supervisor`); INSERT/UPDATE continuam exigindo admin-ou-supervisor.
É FORTALECIMENTO (menos papéis podem excluir), nunca afrouxamento: sem a
migration, o teste corrigido falha (`DELETE sem cobertura admin`).
Teste que prova (harness com as 851 migrations do tip + vitest 4.1.11):
- tip só: rlsGroupAccess 7/7 verde (base).
- tip + migration, sem correção: 6/7, falha `DELETE sem cobertura
  admin/supervisor` — reproduz a recusa do limpador.
- tip + migration + correção: rlsGroupAccess + rlsConversationAccess +
  rlsSchemaGuard = 37/37 verde.
- mutação: correção aplicada SEM a migration → 1 falha (`DELETE sem cobertura
  admin`); o teste não é verde vazio, ele fixa a postura admin-only.
- vizinhos com a migration aplicada passam (30/30), então o defeito era só este.

## Arquivos (diff final desta entrega — só 1 arquivo)
- src/lib/__tests__/rlsGroupAccess.test.ts (2 hunks, +13/-5; patch anexado:
  fix-rlsGroupAccess-admin-only-delete.patch)
- Nada em migration/Edge/auditoria: o conteúdo de f601930f0c está preservado
  byte a byte no branch v2/excluir-conexao-admin-only-26101208285a67; o rename
  do `it(...)` não quebra nada (nenhuma referência ao nome antigo em
  scripts/docs — grep na ponta do dia retorna vazio; o allowlist do
  check-test-inventory.mjs é por nome de arquivo .sh, inalterado).

## Comandos de verificação (resultado real)
- `bunx vitest run src/lib/__tests__/rlsGroupAccess.test.ts` (tip+migration,
  sem correção): 1 failed | 6 passed — `DELETE sem cobertura admin/supervisor`.
- `bunx vitest run rlsGroupAccess rlsConversationAccess rlsSchemaGuard`
  (tip+migration+correção): 3 passed, 37 passed.
- `zapp-verify full` não executável nesta sessão: `hermes-tarefa-iniciar` e
  `git` de escrita seguem bloqueados pela guarda (CONGELADO sem MODO_V2 — o
  mesmo bloqueio registrado em t_49fd1a94); por isso não há commit novo.

## Como integrar (para o integrador/Claude)
Aplicar `fix-rlsGroupAccess-admin-only-delete.patch` sobre o branch
v2/excluir-conexao-admin-only-26101208285a67 (que já contém f601930f0c) e
rodar `bunx vitest run src/lib/__tests__/rlsGroupAccess.test.ts`.
