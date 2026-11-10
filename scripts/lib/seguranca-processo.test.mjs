import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  RAIZ_REPO,
  RAIZES_PERMITIDAS,
  estaDentro,
  resolverCaminhoPermitido,
  resolverExecutavel,
} from './seguranca-processo.mjs';

test('resolverExecutavel devolve caminho absoluto existente igual ao do shell', () => {
  const resolvido = resolverExecutavel('node');
  assert.equal(path.isAbsolute(resolvido), true, 'caminho resolvido nao e absoluto: ' + resolvido);
  assert.equal(fs.existsSync(resolvido), true, 'binario nao existe: ' + resolvido);

  // `which` resolvido pelo mesmo helper: o que se compara aqui e o que cada um
  // acha para `node`, nao a busca em si — `which` faz a propria busca no PATH.
  const which = spawnSync(resolverExecutavel('which'), ['node'], { encoding: 'utf8' });
  assert.equal(which.status, 0, which.stderr);
  const doShell = which.stdout.trim();
  // E o MESMO binario que o shell resolveria: nao pode pegar outro shim do PATH.
  assert.equal(resolvido, doShell);
});

test('resolverExecutavel lanca para comando inexistente', () => {
  assert.throws(
    () => resolverExecutavel('comando-que-nao-existe-xyz'),
    /comando nao encontrado no PATH: comando-que-nao-existe-xyz/,
  );
});

test('estaDentro aceita a raiz e subpastas', () => {
  assert.equal(estaDentro('/a/b', '/a/b'), true, 'a propria raiz conta como dentro');
  assert.equal(estaDentro('/a/b', '/a/b/sub'), true);
  assert.equal(estaDentro('/a/b', '/a/b/sub/deep'), true);
});

test('estaDentro recusa ".." puro, irmao com prefixo igual e caminho fora', () => {
  // '..' puro relativo a raiz nao esta dentro dela.
  assert.equal(estaDentro('/a/b', path.join('/a/b', '..')), false);
  // Erro classico do prefixo de string: '/a/bc' NAO e subpasta de '/a/b'.
  assert.equal(estaDentro('/a/b', '/a/bc/x'), false);
  assert.equal(estaDentro('/a/b', '/etc/passwd'), false);
});

test('resolverCaminhoPermitido aceita caminho do repositorio e do tmpdir', () => {
  const doRepo = path.join(RAIZ_REPO, 'package.json');
  assert.equal(resolverCaminhoPermitido(doRepo, 'recurso'), doRepo);

  const doTmp = path.join(os.tmpdir(), 'seguranca-processo-teste.json');
  assert.equal(resolverCaminhoPermitido(doTmp, 'recurso'), doTmp);
});

test('resolverCaminhoPermitido recusa ".." relativo, absoluto fora e escape do repo', () => {
  assert.throws(
    () => resolverCaminhoPermitido('../../etc/passwd', 'entrada'),
    /fora das raizes permitidas/,
  );
  assert.throws(
    () => resolverCaminhoPermitido('/etc/passwd', 'entrada'),
    /fora das raizes permitidas/,
  );
  assert.throws(
    () => resolverCaminhoPermitido(path.join(RAIZ_REPO, '..', 'fora.json'), 'entrada', [RAIZ_REPO]),
    /fora das raizes permitidas/,
  );
});

test('resolverCaminhoPermitido respeita o array de raizes explicito do chamador', () => {
  const sub = path.join(RAIZ_REPO, 'scripts');
  const dentro = path.join(sub, 'lib', 'seguranca-processo.mjs');
  assert.equal(resolverCaminhoPermitido(dentro, 'entrada', [sub]), dentro);
  // Um caminho valido do repo, mas FORA da raiz explicita, tem de ser recusado.
  assert.throws(
    () => resolverCaminhoPermitido(path.join(RAIZ_REPO, 'package.json'), 'entrada', [sub]),
    /fora das raizes permitidas/,
  );
});

test('resolverCaminhoPermitido recusa arquivo existente acessado por symlink que escapa da raiz', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'seguranca-processo-raiz-'));
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'seguranca-processo-fora-'));
  try {
    const arquivoFora = path.join(fora, 'segredo.json');
    fs.writeFileSync(arquivoFora, '{}');
    fs.symlinkSync(fora, path.join(raiz, 'escape'));
    assert.throws(
      () => resolverCaminhoPermitido(path.join(raiz, 'escape', 'segredo.json'), 'entrada', [raiz]),
      /fora das raizes permitidas/,
    );
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(fora, { recursive: true, force: true });
  }
});

test('resolverCaminhoPermitido recusa alvo inexistente sob diretorio symlink que escapa da raiz', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'seguranca-processo-raiz-'));
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'seguranca-processo-fora-'));
  try {
    fs.symlinkSync(fora, path.join(raiz, 'escape'));
    assert.throws(
      () => resolverCaminhoPermitido(path.join(raiz, 'escape', 'novo.json'), 'saida', [raiz]),
      /fora das raizes permitidas/,
    );
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(fora, { recursive: true, force: true });
  }
});

test('RAIZ_REPO aponta para o pacote Zapp_Web_V2 e esta entre as raizes permitidas', () => {
  const pacote = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, 'package.json'), 'utf8'));
  assert.equal(pacote.name, 'zapp-web-v2');
  assert.equal(RAIZES_PERMITIDAS.includes(RAIZ_REPO), true);
});

function comDiretorioTemporario(executar) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seguranca-processo-cenarios-'));
  try { executar(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

for (const estilo of ['absoluto', 'relativo']) {
  for (const profundidade of [0, 1, 3]) {
    for (const tipo of ['existente-dentro', 'ausente-dentro', 'existente-fora', 'ausente-fora']) {
      test(`caminho: link ${estilo}, profundidade ${profundidade}, alvo ${tipo}`, () => {
        comDiretorioTemporario((dir) => {
          const raiz = path.join(dir, 'permitido');
          const fora = path.join(dir, 'fora');
          const paiLink = path.join(raiz, ...Array.from({ length: profundidade }, (_, i) => `nivel-${i}`));
          fs.mkdirSync(paiLink, { recursive: true });
          fs.mkdirSync(fora);
          const dentro = tipo.endsWith('dentro');
          const alvo = path.join(dentro ? raiz : fora, 'novo.json');
          if (tipo.startsWith('existente')) fs.writeFileSync(alvo, '{}');
          const link = path.join(paiLink, 'link.json');
          fs.symlinkSync(estilo === 'absoluto' ? alvo : path.relative(paiLink, alvo), link);
          if (dentro) {
            assert.equal(resolverCaminhoPermitido(link, 'saida', [raiz]), alvo);
          } else {
            assert.throws(() => resolverCaminhoPermitido(link, 'saida', [raiz]), /fora das raizes permitidas/);
            assert.equal(fs.existsSync(alvo), tipo.startsWith('existente'));
          }
        });
      });
    }
  }
}

test('caminho: preserva criacao de novo arquivo sob diretorios ainda ausentes', () => {
  comDiretorioTemporario((dir) => {
    const novo = path.join(dir, 'sub', 'outra', 'novo.json');
    assert.equal(resolverCaminhoPermitido(novo, 'saida', [dir]), novo);
    fs.mkdirSync(path.dirname(novo), { recursive: true });
    fs.writeFileSync(novo, '{}');
    assert.equal(fs.readFileSync(novo, 'utf8'), '{}');
  });
});

for (const dentro of [true, false]) {
  test(`caminho: resolve ancestral dangling para ${dentro ? 'dentro' : 'fora'} da raiz`, () => {
    comDiretorioTemporario((dir) => {
      const raiz = path.join(dir, 'permitido');
      const fora = path.join(dir, 'fora');
      fs.mkdirSync(raiz); fs.mkdirSync(fora);
      const alvo = path.join(dentro ? raiz : fora, 'pasta-ausente');
      fs.symlinkSync(alvo, path.join(raiz, 'alias'));
      const entrada = path.join(raiz, 'alias', 'sub', 'novo.json');
      if (dentro) assert.equal(resolverCaminhoPermitido(entrada, 'saida', [raiz]), path.join(alvo, 'sub', 'novo.json'));
      else assert.throws(() => resolverCaminhoPermitido(entrada, 'saida', [raiz]), /fora das raizes permitidas/);
    });
  });
}

for (const dentro of [true, false]) {
  test(`caminho: link relativo usa pai real com destino ${dentro ? 'dentro' : 'fora'}`, () => {
    comDiretorioTemporario((dir) => {
      const raiz = path.join(dir, 'permitido');
      const paiReal = path.join(dir, 'fora', 'base');
      fs.mkdirSync(raiz); fs.mkdirSync(paiReal, { recursive: true });
      fs.symlinkSync(paiReal, path.join(raiz, 'alias'));
      const alvo = path.join(dentro ? raiz : path.join(dir, 'fora', 'segredo'), 'novo.json');
      fs.symlinkSync(path.relative(paiReal, alvo), path.join(paiReal, 'filho'));
      const entrada = path.join(raiz, 'alias', 'filho');
      if (dentro) assert.equal(resolverCaminhoPermitido(entrada, 'saida', [raiz]), alvo);
      else assert.throws(() => resolverCaminhoPermitido(entrada, 'saida', [raiz]), /fora das raizes permitidas/);
    });
  });
}

for (const quantidade of [2, 40, 41]) {
  test(`caminho: cadeia de ${quantidade} links dangling tem limite finito`, () => {
    comDiretorioTemporario((dir) => {
      for (let i = 0; i < quantidade; i += 1) {
        fs.symlinkSync(i + 1 === quantidade ? 'novo.json' : `link-${i + 1}`, path.join(dir, `link-${i}`));
      }
      const executar = () => resolverCaminhoPermitido(path.join(dir, 'link-0'), 'saida', [dir]);
      if (quantidade <= 40) assert.equal(executar(), path.join(dir, 'novo.json'));
      else assert.throws(executar, (erro) => erro.code === 'ELOOP');
    });
  });
}

for (const ciclo of ['proprio', 'duplo']) {
  test(`caminho: ciclo ${ciclo} falha com ELOOP`, () => {
    comDiretorioTemporario((dir) => {
      fs.symlinkSync(ciclo === 'proprio' ? 'link-a' : 'link-b', path.join(dir, 'link-a'));
      if (ciclo === 'duplo') fs.symlinkSync('link-a', path.join(dir, 'link-b'));
      assert.throws(() => resolverCaminhoPermitido(path.join(dir, 'link-a'), 'saida', [dir]), (erro) => erro.code === 'ELOOP');
    });
  });
}

test('caminho: arquivo existente nao vira ancestral de diretorio inexistente', () => {
  comDiretorioTemporario((dir) => {
    const arquivo = path.join(dir, 'arquivo');
    fs.writeFileSync(arquivo, '{}');
    assert.throws(() => resolverCaminhoPermitido(path.join(arquivo, 'novo.json'), 'saida', [dir]), (erro) => erro.code === 'ENOTDIR');
  });
});

const modulo = new URL('./seguranca-processo.mjs', import.meta.url).href;
function resolverEmProcessoSeparado(cwd, envPath, comando, cwdFilho) {
  const env = { ...process.env };
  if (envPath === undefined) delete env.PATH; else env.PATH = envPath;
  const codigo = `
    import { spawnSync } from 'node:child_process';
    import { resolverExecutavel } from ${JSON.stringify(modulo)};
    let resultado;
    try {
      const resolvido = resolverExecutavel(process.argv[1]);
      const filho = spawnSync(resolvido, [], { cwd: process.argv[2], encoding: 'utf8' });
      resultado = { resolvido, status: filho.status, stdout: filho.stdout, erroFilho: filho.error?.code };
    } catch (erro) { resultado = { erro: erro.message }; }
    console.log(JSON.stringify(resultado));
  `;
  const filho = spawnSync(process.execPath, ['--input-type=module', '-e', codigo, comando, cwdFilho], { cwd, env, encoding: 'utf8' });
  assert.equal(filho.status, 0, filho.stderr);
  return JSON.parse(filho.stdout);
}

function criarExecutavel(arquivo, texto) {
  fs.writeFileSync(arquivo, `#!/bin/sh\nprintf '${texto}\\n'\n`, { mode: 0o755 });
}

for (const tipo of ['executavel', 'sem-permissao', 'diretorio', 'ausente', 'link-arquivo', 'link-diretorio']) {
  for (const estilo of ['absoluto', 'relativo', 'prefixo-ponto', 'vazio-inicio', 'vazio-meio', 'ponto']) {
    test(`executavel: ${tipo} no PATH ${estilo} preserva ordem com cwd diferente`, () => {
      comDiretorioTemporario((dir) => {
        const primeiro = path.join(dir, 'primeiro'), fallback = path.join(dir, 'fallback'), outroCwd = path.join(dir, 'outro-cwd');
        fs.mkdirSync(primeiro); fs.mkdirSync(fallback); fs.mkdirSync(outroCwd);
        const usaCwd = ['vazio-inicio', 'vazio-meio', 'ponto'].includes(estilo);
        const candidato = path.join(usaCwd ? dir : primeiro, 'probe');
        const seguinte = path.join(fallback, 'probe');
        criarExecutavel(seguinte, 'fallback');
        if (tipo === 'executavel') criarExecutavel(candidato, 'preferido');
        if (tipo === 'sem-permissao') { criarExecutavel(candidato, 'incorreto'); fs.chmodSync(candidato, 0o644); }
        if (tipo === 'diretorio') fs.mkdirSync(candidato);
        if (tipo === 'link-arquivo') { criarExecutavel(path.join(dir, 'alvo'), 'preferido'); fs.symlinkSync(path.join(dir, 'alvo'), candidato); }
        if (tipo === 'link-diretorio') { fs.mkdirSync(path.join(dir, 'alvo')); fs.symlinkSync(path.join(dir, 'alvo'), candidato); }
        const envPath = estilo === 'absoluto' ? `${primeiro}:${fallback}`
          : estilo === 'relativo' ? 'primeiro:fallback'
          : estilo === 'prefixo-ponto' ? './primeiro:./fallback'
          : estilo === 'vazio-inicio' ? `:${fallback}`
          : estilo === 'vazio-meio' ? `${path.join(dir, 'ausente')}::${fallback}` : `.:${fallback}`;
        const resultado = resolverEmProcessoSeparado(dir, envPath, 'probe', outroCwd);
        const preferido = ['executavel', 'link-arquivo'].includes(tipo);
        assert.equal(resultado.resolvido, preferido ? candidato : seguinte);
        assert.equal(path.isAbsolute(resultado.resolvido), true);
        assert.equal(resultado.status, 0, resultado.erroFilho);
        assert.equal(resultado.stdout.trim(), preferido ? 'preferido' : 'fallback');
      });
    });
  }
}

for (const envPath of ['', 'ausente:', 'ausente::']) {
  test(`executavel: PATH ${JSON.stringify(envPath)} inclui cwd sem mudar env global`, () => {
    comDiretorioTemporario((dir) => {
      criarExecutavel(path.join(dir, 'probe'), 'cwd');
      const resultado = resolverEmProcessoSeparado(dir, envPath, 'probe', os.tmpdir());
      assert.equal(resultado.resolvido, path.join(dir, 'probe'));
      assert.equal(resultado.stdout.trim(), 'cwd');
    });
  });
}

test('executavel: PATH ausente mantem erro em vez de inventar busca', () => {
  comDiretorioTemporario((dir) => {
    criarExecutavel(path.join(dir, 'probe'), 'cwd');
    const resultado = resolverEmProcessoSeparado(dir, undefined, 'probe', dir);
    assert.match(resultado.erro, /comando nao encontrado no PATH/);
  });
});
