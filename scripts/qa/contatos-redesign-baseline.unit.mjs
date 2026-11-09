import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./contatos-redesign-baseline.cjs', import.meta.url), 'utf8');

test('rodada ainda instavel depois das tentativas aborta antes de publicar resultado', () => {
  const guarda = source.indexOf('if (!r || r.requisicoesFalhas > 0 || r.errosPagina > 0)');
  const publica = source.indexOf('resultados.push(r)');
  const escreve = source.indexOf('fs.writeFileSync(RELATORIO');
  assert.ok(guarda >= 0, 'guarda de rodada limpa ausente');
  assert.ok(guarda < publica, 'resultado instavel nao pode entrar na lista publicada');
  assert.ok(publica < escreve, 'relatorio deve ser escrito apenas depois das medicoes validadas');
});
