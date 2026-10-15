Especialista: edgar
## O que mudou e por quê
- supabase/functions/gmail-sync/index.ts (linhas 43-49): o superRefine do GmailSyncActionSchema agora valida `name` também em `update-label` quando `name !== undefined` — vazio ou só-espaços recusado, espaços nas pontas recusados; acima de 225 caracteres já era barrado pelo `z.string().max(225)` do campo. Motivo: Ponto 1 da recusa (update aceitava nome inválido e o handler enviava ao Gmail).
- supabase/functions/gmail-sync/gmail-labels-schema.test.ts (linhas 67-90): 5 testes Deno novos — os 3 exigidos (vazio, só espaços, espaços nas pontas) + trava de 226 recusado/225 aceito no update + update só-cor sem name continua aceito (name segue opcional).
- .tmp/relato.md: primeira linha corrigida e contagens atualizadas. Motivo: Ponto 2 da recusa.
## Prova
- vermelho antes: `deno test --allow-net --allow-env --allow-read gmail-sync/gmail-labels-schema.test.ts` (sem a correção) → `FAILED | 10 passed | 3 failed` (falham exatamente os 3 exigidos: nome vazio, só com espaços, espaços nas pontas)
- verde depois: `deno test --allow-net --allow-env --allow-read gmail-sync/` → `ok | 19 passed | 0 failed`
- suite completa em supabase/functions: `deno test --allow-net --allow-env --allow-read gmail-sync/ _shared/__tests__/` → `ok | 637 passed | 0 failed | 2 ignored`
## Pontos do revisor
- Ponto 1: resolvido — supabase/functions/gmail-sync/index.ts:43-49; testes em gmail-labels-schema.test.ts:67-86 (vermelho `10 passed | 3 failed` antes, verde `19 passed | 0 failed` depois).
- Ponto 2: resolvido — primeira linha deste relato agora é exatamente `Especialista: edgar`; linha de verificação acima traz comando + resultado; contagens atualizadas (schema 8→13 testes; casos novos do módulo 14→19).
## O que NÃO fiz e por quê
- Não alterei o handler nem os testes de mutação: o handler usa `parsed.data` (corpo já validado pelo schema), então nenhum chamador muda de comportamento além da validação pedida; sem arquivo fora do módulo gmail-sync.
