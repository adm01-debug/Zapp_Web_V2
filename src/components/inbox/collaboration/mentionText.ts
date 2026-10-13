/**
 * Marcações `@nome` das notas internas.
 *
 * A nota guarda a marcação no formato que o sistema já usa (`@` + nome do
 * perfil, ex.: `@Ana Maria `), sem delimitador. O selo da nota, porém, era
 * desenhado com `/(@\w+)/g`, que não cobre espaço — então quem tem nome
 * composto só via `@Ana` virar selo e ` Maria` sobrando como texto.
 *
 * Aqui o reconhecimento é ancorado na LISTA DE NOMES ATIVOS (não numa regex
 * genérica): assim `@Ana Maria` vira um selo inteiro, `@Ana` não casa por
 * engano quando só existe "Ana Maria", e uma partícula minúscula no meio do
 * nome (`@Ana da Silva`) continua coberta. O nome mais longo vence quando há
 * nomes que são prefixo um do outro.
 */

export interface MentionTextSegment {
  /** Trecho do texto original, na ordem em que aparece. */
  text: string;
  /** `true` quando o trecho inteiro é uma marcação a um dos nomes conhecidos. */
  isMention: boolean;
}

const PALAVRA = /[\p{L}\p{N}_]/u;

function ehCaractereDePalavra(ch: string | undefined): boolean {
  return ch !== undefined && PALAVRA.test(ch);
}

/** Nomes saneados (sem vazio, sem repetição), do mais longo para o mais curto. */
export function normalizeMentionNames(
  names: readonly (string | null | undefined)[],
): string[] {
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const bruto of names) {
    const nome = bruto?.trim();
    if (!nome || vistos.has(nome)) continue;
    vistos.add(nome);
    nomes.push(nome);
  }
  return nomes.sort((a, b) => b.length - a.length);
}

/**
 * Divide o texto da nota em trechos, marcando os que são menção a um dos nomes
 * conhecidos. A menção termina numa fronteira de palavra: `@Ana MariaSilva` não
 * vira selo de "Ana Maria", e um `@` colado a outra palavra (`a@ana`) não é
 * tratado como marcação.
 */
export function splitMentionText(
  content: string,
  names: readonly (string | null | undefined)[],
): MentionTextSegment[] {
  const candidatos = normalizeMentionNames(names);
  const trechos: MentionTextSegment[] = [];
  let buffer = '';

  const fecharBuffer = () => {
    if (buffer) {
      trechos.push({ text: buffer, isMention: false });
      buffer = '';
    }
  };

  let i = 0;
  while (i < content.length) {
    if (content[i] === '@' && !ehCaractereDePalavra(content[i - 1])) {
      const resto = content.slice(i + 1);
      const nome = candidatos.find(
        (candidato) => resto.startsWith(candidato) && !ehCaractereDePalavra(resto[candidato.length]),
      );
      if (nome) {
        fecharBuffer();
        trechos.push({ text: `@${nome}`, isMention: true });
        i += 1 + nome.length;
        continue;
      }
    }
    buffer += content[i];
    i += 1;
  }

  fecharBuffer();
  return trechos;
}
