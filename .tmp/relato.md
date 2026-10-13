Especialista: workersql (refazer por senior; area-sql-banco)

## Pontos da recusa

Ponto 1: impedir troca de created_by em UPDATE por qualquer papel.
- O que mudei: em `supabase/migrations/20261012112503_email_templates_rls.sql`, mantive a policy de UPDATE para dono/staff em modelo compartilhado, mas removi o GRANT de UPDATE de tabela inteira e troquei por GRANT colunar apenas para `name`, `subject`, `body`, `category`, `is_shared` e `updated_at`. `created_by` ficou sem privilégio de UPDATE para `authenticated`, então nem dono nem staff conseguem reatribuir autoria. Não usei gatilho/função; por isso o rollback executável continua correto ao dropar a tabela nova, que remove grants, policies, triggers e índices criados nela.
- Teste que prova: `scripts/db-audit/email-templates-rls.test.sh` agora confere B33 (`authenticated sem UPDATE em created_by`) e B34 (`authenticated com UPDATE nas 6 colunas editaveis`).

Ponto 2: teste real em que staff e dono tentam mudar created_by e falham, com vermelho→verde.
- O que mudei: em `scripts/db-audit/email-templates-rls.test.sh`, acrescentei B20/B21 para staff tentando reatribuir `created_by` de modelo compartilhado e B22/B23 para dono tentando reatribuir `created_by` do próprio modelo. Os passos executam a migration real em PostgreSQL descartável e rodam como papel `authenticated`, não por mock nem regex de SQL.
- Vermelho antes: com a migration anterior restaurada temporariamente e o teste novo mantido, `bash scripts/db-audit/email-templates-rls.test.sh` saiu com `RED_STATUS=1` e `[FAIL] B20 staff nao reatribui created_by do compartilhado: deveria falhar, mas passou`.
- Verde depois: com a correção aplicada, `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/email-templates-rls.test.sh` passou até `B38 reaplicar recria a tabela` e terminou com `== TODOS OS PASSOS PASSARAM ==`.

Ponto 3: corrigir relato/comentário que prometia garantia que a policy não dava.
- O que mudei: no comentário de decisão 5 da migration, removi a afirmação de que `WITH CHECK = USING` impedia reatribuição; agora o comentário diz a garantia real: INSERT exige `created_by = auth.uid()` e UPDATE não recebe grant na coluna `created_by`. Também ajustei a decisão de ACL para explicar que UPDATE é colunar, não grant irrestrito de tabela.
- Teste que prova: os mesmos B20–B23 exercitam a impossibilidade prática de reatribuição; B33/B34 provam o contrato de grant que sustenta a garantia.

## Arquivos do diff
O diff tem 5 arquivos no total e 1 arquivo de teste alterado (`scripts/db-audit/email-templates-rls.test.sh`).
`.github/workflows/db-guard.yml`
`.tmp/relato.md`
`scripts/db-audit/email-templates-rls.test.sh`
`src/integrations/supabase/types.ts`
`supabase/migrations/20261012112503_email_templates_rls.sql`

## Verificações executadas
- `bash scripts/db-audit/email-templates-rls.test.sh` com a migration anterior restaurada temporariamente: falhou em B20 como esperado (`staff ... deveria falhar, mas passou`).
- `bash scripts/db-audit/email-templates-rls.test.sh`: passou e terminou com `== TODOS OS PASSOS PASSARAM ==`.
- `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/email-templates-rls.test.sh`: passou e terminou com `== TODOS OS PASSOS PASSARAM ==`.
- `git diff --name-only $(git merge-base HEAD dia/2026-10-13)...HEAD`: lista exatamente os 5 arquivos acima.
- Varredura local dos arquivos de código/teste do diff pelo identificador do banco de produção: `prod_id_found=no`.

## Arquivos fora da lista literal do pedido original
- `scripts/db-audit/email-templates-rls.test.sh`: indispensável porque o fluxo de banco do repositório roda contratos SQL descartáveis em `scripts/db-audit/`; o motivo da recusa anterior registrou que este arquivo de teste já estava justificado.
- `.github/workflows/db-guard.yml`: indispensável para colocar esse contrato no DB Guard offline; o motivo da recusa anterior também registrou que o passo no CI já estava justificado.

## O que não fiz
- Não adicionei gatilho/função porque o GRANT colunar resolve o ponto com diff menor; por isso não houve novo objeto para acrescentar ao rollback além da tabela nova já dropada pelo bloco executável.
