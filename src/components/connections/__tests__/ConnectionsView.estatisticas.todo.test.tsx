/**
 * Cartões de estatística de conexões (plural e subtexto) — LACUNA com cartão.
 *
 * Na V2 os cartões de estatística são rótulos fixos (`ConnectionsView.tsx`,
 * ~135-146) sem plural nem subtexto, e não existe estado “Desconectando...”.
 * A melhoria é do cartão PD-26 — enquanto não integrada, o caso fica como
 * `it.todo` em vez de um teste que finge cobrir o que não existe.
 *
 * Ver `~/hermes-workspaces/.assets/paridade-16/achados_5_inventario_testes.md`
 * (linhas 24, 76) e `achados_1_conexoes_cartao_qr.md` (linha 24).
 */
import { describe, it } from 'vitest';

describe('Estatística de conexões (PD-26 — não integrado)', () => {
  it.todo('PD-26: cartões usam plural correto (“1 conexão” x “N conexões”)');
  it.todo('PD-26: cartões trazem subtexto explicativo e “Ações necessárias”');
  it.todo('PD-26: estado “Desconectando...” (pulso) no cartão durante a desconexão');
});
