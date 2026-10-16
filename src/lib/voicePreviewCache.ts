/**
 * G6 — a prévia de voz do seletor é gerada por TTS (custo por chamada) e o texto
 * de amostra é fixo: o mesmo blob vale para a sessão inteira do navegador. Este
 * cache vive no módulo (fora do componente) por isso: sobrevive à troca de voz e
 * ao fechamento do menu, e evita pagar a MESMA síntese a cada clique em ▶.
 */
const previaPorVoz = new Map<string, Blob>();

export function lerPreviaDeVoz(voiceId: string): Blob | undefined {
  return previaPorVoz.get(voiceId);
}

export function guardarPreviaDeVoz(voiceId: string, blob: Blob): void {
  previaPorVoz.set(voiceId, blob);
}

/** Apenas para teste: uma sessão nova começa com o cache vazio. */
export function limparCacheDePreviaDeVoz(): void {
  previaPorVoz.clear();
}
