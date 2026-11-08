# Regras ESLint locais

Regras customizadas carregadas pela configuração raiz do ESLint.

- `no-secret-compare.js` (Z012) — proíbe comparação direta (`===`/`!==`) de
  identificadores que aludam a credenciais (`secret|token|key|password`, case
  insensitive). Exige `timingSafeStringEqual`
  (`supabase/functions/_shared/cron-secret-auth.ts`) em vez de comparação
  direta, para evitar timing attack. Pega `token !== serviceRole`,
  `key === expected`; não pega literais nem expressões sem nome legível.
