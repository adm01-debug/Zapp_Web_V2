// GA14: extrai o runtime_sha256 da prova impressa por run-runtime-contract.mjs.
// Fail-closed: entrada invalida => exit 2, nunca string vazia como "sha".
let texto = '';
process.stdin.on('data', (c) => { texto += c; }).on('end', () => {
  try {
    const prova = JSON.parse(texto);
    if (!/^[a-f0-9]{64}$/.test(prova.runtime_sha256 ?? '')) throw new Error('sem runtime_sha256');
    console.log(prova.runtime_sha256);
  } catch (e) {
    console.error(`::error::prova de runtime invalida: ${e.message}`);
    process.exit(2);
  }
});
