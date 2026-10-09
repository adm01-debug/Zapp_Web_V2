// #436 -- detector de ataques do lamejs distribuido: o agrupamento tem de usar indice
// INTEIRO. A porta JS do C de L3psycho_anal_ns escreve `F / 3` (fracionario em
// JavaScript) onde o C faz divisao inteira:
//   - `ta[F/3]` com F=1,2,4,5,7,8,10,11 le `undefined`; o guard `0 == ...` nao marca o
//     ataque, entao cada grupo so' pode receber o ordinal 1 (nunca 2 nem 3);
//   - `ya[1 + F/3] += Ga` cria chave fracionaria com NaN em vez de somar no grupo inteiro.
//
// A prova NAO reimplementa o trecho: extrai por TEXTO as duas instrucoes do arquivo
// realmente distribuido (public/vendor/lamejs-1.2.1.min.js) e executa exatamente esse
// texto, dentro das variaveis que o proprio trecho usa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const FONTE = readFileSync(new URL('../../public/vendor/lamejs-1.2.1.min.js', import.meta.url), 'utf8');

/** `ya[...] += Ga;` -- o acumulador de energia dos nove subintervalos. */
function extrairAcumuladorDeEnergia(src) {
  const achado = /ya\[[^\]]*\]\+=Ga;/.exec(src);
  assert.ok(achado, 'nao achei `ya[...] += Ga;` no fornecedor distribuido');
  return achado[0];
}

/** O laco de doze posicoes que marca o ataque de cada grupo (statement completo). */
function extrairMarcacaoDeAtaque(src) {
  const inicio = src.indexOf('for(F=0;12>F;F++)');
  assert.notEqual(inicio, -1, 'nao achei o laco de doze posicoes no fornecedor distribuido');
  const fechaCabecalho = src.indexOf(')', inicio) + 1;
  const fim = src.indexOf(';', fechaCabecalho);
  assert.ok(fim > fechaCabecalho, 'o laco de ataque nao termina em `;`');
  return src.slice(inicio, fim + 1);
}

const TRECHO_ENERGIA = extrairAcumuladorDeEnergia(FONTE);
const TRECHO_ATAQUE = extrairMarcacaoDeAtaque(FONTE);

// Limiar de ataque do bloco longo (nsPsy.attackthre) medido no caminho mono/44100/128.
// O trecho sob prova so' compara `qa[F] > Ma`; o valor exato nao muda a indexacao.
const LIMIAR = 6.4;

/** Roda o trecho extraido num contexto com as variaveis do trecho (mesmo objeto). */
function executarTrecho(trecho, variaveis) {
  vm.runInContext(trecho, vm.createContext(variaveis), { filename: 'lamejs-1.2.1.min.js (trecho distribuido)' });
  return variaveis;
}

/** Roda o trecho N vezes, como o laco do fornecedor faz, reusando o mesmo contexto. */
function executarLaco(trecho, variaveis, iteracoes) {
  const contexto = vm.createContext(variaveis);
  for (const valores of iteracoes) {
    Object.assign(variaveis, valores);
    vm.runInContext(trecho, contexto, { filename: 'lamejs-1.2.1.min.js (trecho distribuido)' });
  }
  return variaveis;
}

test('#436: os nove subintervalos de energia somam apenas nos tres grupos inteiros ya[1..3]', () => {
  const energias = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // um valor distinto por subintervalo
  const { ya } = executarLaco(TRECHO_ENERGIA, { ya: [0, 0, 0, 0], F: 0, Ga: 0 },
    energias.map((ga, F) => ({ F, Ga: ga })));

  assert.deepEqual(Object.keys(ya), ['0', '1', '2', '3'],
    'ya nao pode ganhar chave fracionaria: cada subintervalo escreve num dos quatro grupos inteiros');
  for (const [indice, valor] of Object.entries(ya)) {
    assert.ok(Number.isFinite(valor), `ya[${indice}] ficou ${valor} (NaN/Infinito = acumulador quebrado)`);
  }
  assert.equal(ya[0], 0, 'o grupo 0 e alimentado fora deste trecho');
  assert.equal(ya[1], 1 + 2 + 3, 'subintervalos 0..2 no grupo 1');
  assert.equal(ya[2], 4 + 5 + 6, 'subintervalos 3..5 no grupo 2');
  assert.equal(ya[3], 7 + 8 + 9, 'subintervalos 6..8 no grupo 3');
});

test('#436: as doze posicoes de pico unico caem nos quatro grupos inteiros com o ordinal 1, 2 ou 3', () => {
  const casos = [];
  for (let grupo = 0; grupo < 4; grupo++) {
    for (let ordinal = 1; ordinal <= 3; ordinal++) {
      const posicao = 3 * grupo + (ordinal - 1);
      const qa = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      qa[posicao] = LIMIAR + 1; // pico unico: so' esta posicao passa do limiar
      const { ta } = executarTrecho(TRECHO_ATAQUE, { ta: [0, 0, 0, 0], qa, Ma: LIMIAR, F: 0 });
      const esperado = [0, 0, 0, 0];
      esperado[grupo] = ordinal;
      assert.deepEqual(ta, esperado,
        `pico unico na posicao F=${posicao} (grupo ${grupo}, ordinal ${ordinal})`);
      casos.push(posicao);
    }
  }
  assert.equal(casos.length, 12, 'as doze posicoes vao de F=0 a F=11');
  assert.deepEqual(casos, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('#436: o primeiro ataque do grupo prevalece sobre os seguintes', () => {
  for (let grupo = 0; grupo < 4; grupo++) {
    const base = 3 * grupo;
    const tresAcima = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    tresAcima[base] = LIMIAR + 1;
    tresAcima[base + 1] = LIMIAR + 2;
    tresAcima[base + 2] = LIMIAR + 3;
    const primeiro = [0, 0, 0, 0];
    primeiro[grupo] = 1;
    assert.deepEqual(executarTrecho(TRECHO_ATAQUE, { ta: [0, 0, 0, 0], qa: tresAcima, Ma: LIMIAR, F: 0 }).ta,
      primeiro, `grupo ${grupo}: com os tres subintervalos acima do limiar vale o primeiro (1)`);

    const semPrimeiro = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    semPrimeiro[base + 1] = LIMIAR + 1;
    semPrimeiro[base + 2] = LIMIAR + 2;
    const segundo = [0, 0, 0, 0];
    segundo[grupo] = 2;
    assert.deepEqual(executarTrecho(TRECHO_ATAQUE, { ta: [0, 0, 0, 0], qa: semPrimeiro, Ma: LIMIAR, F: 0 }).ta,
      segundo, `grupo ${grupo}: sem o primeiro, vale o segundo (2) e o terceiro nao sobrescreve`);
  }
});

test('#436: o trecho provado e o que roda no caminho CBR mono/44100/128 (smoke da API real)', () => {
  // Instrumentacao de uma COPIA EM MEMORIA do fornecedor (o arquivo distribuido nao muda):
  // conta quantas vezes o acumulador de energia e executado durante um encode de verdade.
  const marcador = 'globalThis.__subintervalosDeEnergia=(globalThis.__subintervalosDeEnergia||0)+1;';
  const instrumentado = FONTE.replace(TRECHO_ENERGIA, marcador + TRECHO_ENERGIA);
  assert.notEqual(instrumentado, FONTE, 'o trecho de energia tem de existir no fornecedor');

  const sandbox = { console };
  vm.runInContext(`${instrumentado}\nglobalThis.__Mp3Encoder=lamejs.Mp3Encoder;`,
    vm.createContext(sandbox), { filename: 'lamejs-1.2.1.min.js' });
  assert.equal(typeof sandbox.__Mp3Encoder, 'function', 'lamejs.Mp3Encoder tem de existir apos carregar o fornecedor');

  const BLOCK = 1152;
  const pcm = new Int16Array(BLOCK * 12); // ~0,3 s de senoide local, sem arquivo externo
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(9000 * Math.sin((2 * Math.PI * 440 * i) / 44100));

  const encoder = new sandbox.__Mp3Encoder(1, 44100, 128);
  let bytes = 0;
  let blocosComSaida = 0;
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const saida = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK));
    if (saida.length > 0) blocosComSaida++;
    bytes += saida.length;
  }
  bytes += encoder.flush().length; // termina sem excecao

  assert.ok(blocosComSaida > 0, 'encodeBuffer tem de emitir bytes para a entrada sintetica');
  assert.ok(bytes > 0, 'o encode tem de emitir MP3');
  assert.ok(sandbox.__subintervalosDeEnergia > 0,
    'o detector de ataques desta prova nao rodou: o caminho medido nao e o que audioToMp3 usa');
  // Prova de emissao e termino. Nada aqui afirma qualidade audivel do MP3 gerado.
});

test('#436: no encoder real, o grupo com ordinal 2/3 acende e ya nao guarda chave fracionaria nem NaN', () => {
  // Mesma instrumentacao em memoria, agora observando o estado do frame ao fim do laco de ataque.
  const observador = 'globalThis.__OBS.push({chaves:Object.getOwnPropertyNames(ya).sort().join(","),'
    + 'finito:Object.getOwnPropertyNames(ya).every(function(k){return k==="length"||isFinite(ya[k]);}),'
    + 'ta:ta.join(",")});';
  const instrumentado = FONTE.replace(TRECHO_ATAQUE, TRECHO_ATAQUE + observador);
  assert.notEqual(instrumentado, FONTE, 'o laco de ataque tem de existir no fornecedor');

  const sandbox = { console, __OBS: [] };
  vm.runInContext(`${instrumentado}\nglobalThis.__Mp3Encoder=lamejs.Mp3Encoder;`,
    vm.createContext(sandbox), { filename: 'lamejs-1.2.1.min.js' });

  const BLOCK = 1152;
  const pcm = new Int16Array(BLOCK * 24); // silencio, estouro, silencio: ataque forte e local
  for (let i = BLOCK * 4; i < BLOCK * 8; i++) pcm[i] = Math.round(32000 * Math.sin((2 * Math.PI * 3000 * i) / 44100));
  for (let i = BLOCK * 14; i < BLOCK * 16; i++) pcm[i] = Math.round(30000 * Math.sin((2 * Math.PI * 800 * i) / 44100));

  const encoder = new sandbox.__Mp3Encoder(1, 44100, 128);
  for (let i = 0; i < pcm.length; i += BLOCK) encoder.encodeBuffer(pcm.subarray(i, i + BLOCK));
  encoder.flush();

  assert.ok(sandbox.__OBS.length > 0, 'o detector de ataques tem de rodar no encode');
  for (const frame of sandbox.__OBS) {
    assert.equal(frame.chaves, '0,1,2,3,length', `ya com chave fracionaria num frame: ${frame.chaves}`);
    assert.ok(frame.finito, `ya com acumulador NaN num frame: ${frame.chaves}`);
  }
  const ordinais = new Set(sandbox.__OBS.flatMap((frame) => frame.ta.split(',')).filter((v) => v !== '0'));
  assert.ok(ordinais.has('2') || ordinais.has('3'),
    `nenhum frame acendeu ataque com ordinal 2 ou 3 (so' ${[...ordinais].sort().join(',') || 'nenhum'}): `
    + 'e exatamente o que o indice fracionario escondia');
});
