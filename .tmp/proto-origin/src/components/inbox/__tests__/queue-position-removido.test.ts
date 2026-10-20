import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Item L4 / critério 1 do cartão (chore(inbox): remover QueuePositionNotifier órfão):
// o componente era código morto — a posição na fila é tratada pelos cartões de
// fila (talk_me_list_waiting / contacts.conversation_status='waiting' + queue_id)
// e `queue_positions` nunca recebe INSERT. Este teste guarda a REMOÇÃO: o
// componente não pode voltar a existir (nem ser referenciado) sem um consumidor
// real. Auditoria ESTÁTICA da fonte, no mesmo estilo de
// team-chat-exhaustive-audit.test.ts.

const root = path.resolve(__dirname, '../..'); // src/
const esteTeste = path.resolve(__filename);

function arquivosDeSrc(dir: string, acc: string[] = []): string[] {
  for (const nome of fs.readdirSync(dir)) {
    if (nome === 'node_modules') continue;
    const completo = path.join(dir, nome);
    if (fs.statSync(completo).isDirectory()) arquivosDeSrc(completo, acc);
    else acc.push(completo);
  }
  return acc;
}

describe('QueuePositionNotifier removido (item L4)', () => {
  const arquivos = arquivosDeSrc(root);

  it('o componente não existe mais', () => {
    expect(fs.existsSync(path.join(root, 'components/inbox/QueuePositionNotifier.tsx'))).toBe(false);
  });

  it('nenhum arquivo de src/ referencia QueuePositionNotifier', () => {
    const comReferencia = arquivos
      .filter((f) => f !== esteTeste)
      .filter((f) => /\bQueuePositionNotifier\b/.test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.relative(root, f));
    expect(comReferencia).toEqual([]);
  });

  it('o teste enxerga a árvore de src/ (sanidade do varredor)', () => {
    expect(arquivos.length).toBeGreaterThan(100);
  });
});
