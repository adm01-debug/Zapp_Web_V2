export const MANIFEST_FORMAT_VERSION = 2;

export const MANIFEST_SECTIONS = [
  'columns',
  'defaults',
  'constraints',
  'indexes',
  'views',
  'types',
  'rls',
  'policies',
  'triggers',
  'functions',
  'relation_grants',
  'column_grants',
  'routine_grants',
  'type_grants',
  'default_grants',
  'schema_grants',
];

const MD5 = /^[a-f0-9]{32}$/;

function objetoSimples(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

export function validarManifesto(manifesto, rotulo) {
  const erros = [];
  if (!objetoSimples(manifesto)) return ['manifesto ' + rotulo + ': raiz precisa ser objeto JSON'];

  if (manifesto.format_version !== MANIFEST_FORMAT_VERSION) {
    erros.push(
      'manifesto ' + rotulo + ': format_version esperado=' + MANIFEST_FORMAT_VERSION +
      ' obtido=' + JSON.stringify(manifesto.format_version),
    );
  }

  if (!objetoSimples(manifesto.database_identity)) {
    erros.push('manifesto ' + rotulo + ': database_identity ausente ou invalida');
  }

  if (manifesto.how_to_regenerate !== 'scripts/db-audit/manifest.sql') {
    erros.push('manifesto ' + rotulo + ': how_to_regenerate ausente ou invalido');
  }

  for (const secao of MANIFEST_SECTIONS) {
    const objetos = manifesto[secao];
    if (!objetoSimples(objetos)) {
      erros.push('manifesto ' + rotulo + ': secao [' + secao + '] ausente ou invalida');
      continue;
    }
    for (const [chave, hash] of Object.entries(objetos)) {
      if (!chave) erros.push('manifesto ' + rotulo + ': [' + secao + '] contem chave vazia');
      if (typeof hash !== 'string' || !MD5.test(hash)) {
        erros.push(
          'manifesto ' + rotulo + ': [' + secao + '] hash invalido para ' +
          JSON.stringify(chave),
        );
      }
    }
  }

  return erros;
}

export function compararManifestos(A, B) {
  const secoes = [];
  let total = 0;

  for (const secao of MANIFEST_SECTIONS) {
    const SA = A[secao];
    const SB = B[secao];
    const todos = [...new Set([...Object.keys(SA), ...Object.keys(SB)])].sort();
    const soEmA = todos.filter((chave) => !(chave in SB));
    const soEmB = todos.filter((chave) => !(chave in SA));
    const divergentes = todos.filter(
      (chave) => chave in SA && chave in SB && SA[chave] !== SB[chave],
    );
    total += soEmA.length + soEmB.length + divergentes.length;
    secoes.push({ secao, soEmA, soEmB, divergentes });
  }

  return { secoes, total };
}

export function imprimirComparacao(resultado, rotuloA, rotuloB) {
  for (const { secao, soEmA, soEmB, divergentes } of resultado.secoes) {
    console.log(
      '[' + secao + '] so em ' + rotuloA + ': ' + soEmA.length +
      ' | so em ' + rotuloB + ': ' + soEmB.length +
      ' | divergente: ' + divergentes.length,
    );
    if (soEmA.length) console.log('  so em ' + rotuloA + ': ' + soEmA.join(', '));
    if (soEmB.length) console.log('  so em ' + rotuloB + ': ' + soEmB.join(', '));
    if (divergentes.length) console.log('  divergente: ' + divergentes.join(', '));
  }
}
