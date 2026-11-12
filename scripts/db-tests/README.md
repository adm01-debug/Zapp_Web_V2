# scripts/db-tests

Testes SQL de RLS, contratos de schema e transições de FSM. Rodados contra um banco
de desenvolvimento via `node scripts/db-tests/run-all.mjs`.

Arquivos `.sql`: assertions executados no banco (cada `SELECT` que retorne linha
vazia representa falha). `rpc-envelope.mjs` serializa e envia os scripts.
