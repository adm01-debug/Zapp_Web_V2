# Team Chat DB validation (E97-E99)

Verifica, via Supabase REST API, que as tabelas, colunas e RPC do Team Chat
estão acessíveis e respondem com o contrato canônico.

```bash
SUPABASE_URL=https://tnnnlkbymytvtqngbbqh.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<key> \
node scripts/team-chat/team-chat-db-validate.mjs
```

Exit: `0` = todas as verificações passaram; `1` = uma ou mais falharam.

Cobre: `team_conversations`, `team_messages`, `team_conversation_members`,
`department_invites`, `department_audit_logs`, colunas críticas e o RPC
`accept_department_invite(p_code text)`.

Teste: `node --test scripts/team-chat/team-chat-db-validate.unit.mjs` — roda o
script de verdade em processo filho com `fetch` stubado (injeção de log
jssecurity:S5145 e regressão TC-012 do contrato de RPC).
