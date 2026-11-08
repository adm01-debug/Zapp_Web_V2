# Talk X — placar, régua visual e matriz de estados

- `v4-status.mjs` (X002) — placar automático do plano V4. Lê
  `docs/talkx/v4/etapas.json` (campo `fecha`), os mocks em
  `docs/talkx/v4/inventario/*.md` e a avaliação verificada em
  `docs/reconciliation/tasks/P046.json` (fonte de verdade; só
  `DONE_VERIFIED` conta como concluído); gera `docs/talkx/v4/STATUS.md`.
  ```bash
  node scripts/talkx/v4-status.mjs --check --ref HEAD
  ```
- `lado-a-lado.mjs` — régua visual: compara mockups de referência
  (`docs/talkx/references/`) com capturas determinísticas do app
  (`e2e/talkx-visual/`), reportando o motivo real de cada ausência
  (`sem-dados`, `sem-componente`, `sem-captura`).
- `gen-estados.mjs` (X055) — gera `docs/talkx/ESTADOS.md`, a matriz
  tela × estado, lida diretamente de `src/components/talkx/*.tsx`.
  ```bash
  node scripts/talkx/gen-estados.mjs --check   # rc 1 se divergir
  ```

Testes: `node --test scripts/talkx/*.unit.mjs`.
