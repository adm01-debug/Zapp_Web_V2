/**
 * Contrato de ambiente dos scripts de QA da Telefonia.
 *
 * Nada de segredo aqui: as credenciais vêm do ambiente da tarefa e nunca são
 * impressas — o relatório só mostra o HOST. Sem credenciais o script roda
 * contra uma fixture `file://` (é assim que a prova offline funciona).
 */

/** Base do alvo. Nunca produção: quem chama é que responde pelo alvo. */
export function ambiente() {
  const base = process.env.TEL_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
  const archive = base.startsWith('file://');
  return {
    base,
    arquivo: archive,
    email: process.env.TEL_EMAIL ?? process.env.E2E_TEST_EMAIL ?? null,
    senha: process.env.TEL_SENHA ?? process.env.E2E_TEST_PASSWORD ?? null,
    // Numa fixture `file://` não existe rota `/?view=voip` — o alvo é o próprio arquivo.
    caminho: process.env.TEL_CAMINHO ?? (archive ? '' : '/?view=voip'),
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
