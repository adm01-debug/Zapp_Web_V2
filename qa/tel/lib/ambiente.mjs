/**
 * Contrato de ambiente dos scripts de QA da Telefonia.
 *
 * Nada de segredo aqui: as credenciais vêm do ambiente da tarefa e nunca são
 * impressas — o relatório só mostra o HOST. Sem credenciais o script roda
 * contra uma fixture `file://` (é assim que a prova offline funciona).
 */

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1']);

/** Só o alvo local da tarefa pode ser medido/escrito pela QA automatizada. */
function validarBaseLocal(base, { mutacao = false } = {}) {
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error('TEL_URL precisa ser file://, localhost ou 127.0.0.1');
  }

  const local = url.protocol === 'file:' || HOSTS_LOCAIS.has(url.hostname);
  if (!local && mutacao) {
    throw new Error('TEL_MUTACAO=1 só pode rodar em alvo local (file://, localhost ou 127.0.0.1)');
  }
  if (!local) {
    throw new Error('TEL_URL precisa apontar para alvo local: file://, localhost ou 127.0.0.1');
  }
  return url;
}

/** Base do alvo. A própria função recusa qualquer alvo fora da máquina local. */
export function ambiente() {
  const base = process.env.TEL_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
  const mutacao = process.env.TEL_MUTACAO === '1';
  const url = validarBaseLocal(base, { mutacao });
  const arquivo = url.protocol === 'file:';
  return {
    base,
    arquivo,
    email: process.env.TEL_EMAIL ?? process.env.E2E_TEST_EMAIL ?? null,
    senha: process.env.TEL_SENHA ?? process.env.E2E_TEST_PASSWORD ?? null,
    // Numa fixture `file://` não existe rota `/?view=voip` — o alvo é o próprio arquivo.
    caminho: process.env.TEL_CAMINHO ?? (arquivo ? '' : '/?view=voip'),
    largura: Number(process.env.TEL_LARGURA ?? 1672),
    altura: Number(process.env.TEL_ALTURA ?? 1000),
  };
}

/**
 * Publica o JSON do aceite e devolve o código de saída. Vermelho = algum eixo
 * reprovado OU erro de console no módulo (o plano exige os dois zerados).
 */
export function publicar(resultado) {
  console.log(JSON.stringify(resultado, null, 2));
  const verde = resultado.fail.length === 0 && resultado.consoleErrors === 0;
  process.exit(verde ? 0 : 1);
}
