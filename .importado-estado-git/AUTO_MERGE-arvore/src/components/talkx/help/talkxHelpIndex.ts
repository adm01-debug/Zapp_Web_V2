/**
 * X189 — índice da Ajuda do Talk X.
 *
 * O conteúdo da Ajuda são arquivos markdown fora do código:
 * `docs/talkx/help/<topico>/<artigo>.md` e `docs/talkx/help/guias/<guia>.md`.
 * Cada arquivo abre com um frontmatter (`titulo`, `topico`, `tipo`, `nivel`,
 * `ordem`, `palavras-chave` e, opcionalmente, `resumo`) e o resto do arquivo é
 * o corpo do artigo — por isso corrigir um texto da Ajuda não mexe em tela.
 *
 * O `import.meta.glob` abaixo é preguiçoso (sem `eager`): nenhum markdown entra
 * no grafo de entrada da aplicação; cada arquivo é um módulo pequeno que só é
 * baixado quando a Ajuda é aberta.
 */

export type TalkXHelpKind = 'artigo' | 'guia';
export type TalkXHelpLevel = 'Iniciante' | 'Intermediário' | 'Avançado';

export interface TalkXHelpDoc {
  /** `<topico>/<slug>` (artigo) ou `guias/<slug>` (guia) — é o `article` da rota. */
  id: string;
  slug: string;
  topicSlug: string;
  topic: string;
  title: string;
  kind: TalkXHelpKind;
  level: TalkXHelpLevel | null;
  order: number;
  resume: string | null;
  keywords: string[];
  /** Minutos de leitura calculados da contagem de palavras do corpo. */
  minutes: number;
  body: string;
  sourcePath: string;
}

export interface TalkXHelpTopic {
  slug: string;
  label: string;
  /** Menor `ordem` entre os artigos do tópico: define a ordem da grade. */
  order: number;
  articles: TalkXHelpDoc[];
}

/** Pasta dos guias: o que não mora nela é artigo. */
export const HELP_GUIDES_SLUG = 'guias';
/** Sentinela da rota para a lista completa de artigos. */
export const HELP_ALL_TOPICS = 'all';

/** Exemplos do campo de busca (T16-008) — todo chip tem de achar artigo. */
export const HELP_EXAMPLE_QUERIES = [
  'Como criar uma campanha',
  'Como segmentar contatos',
  'Ciclo de vida da campanha',
  'LGPD e lista de supressão',
];

export const HELP_WORDS_PER_MINUTE = 200;

const KINDS: TalkXHelpKind[] = ['artigo', 'guia'];
const LEVELS: TalkXHelpLevel[] = ['Iniciante', 'Intermediário', 'Avançado'];
const KIND_WEIGHT: Record<TalkXHelpKind, number> = { artigo: 0, guia: 1 };

const HELP_FILES = import.meta.glob<string>('../../../../docs/talkx/help/**/*.md', {
  query: '?raw',
  import: 'default',
});

export class TalkXHelpFrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TalkXHelpFrontmatterError';
  }
}

/** Compara chaves com ou sem acento (`título` e `titulo` valem o mesmo). */
function foldHelpKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Separa o frontmatter do corpo. O arquivo TEM de começar com `---` e fechar
 * com uma linha `---`; qualquer linha sem `chave: valor` é erro (não é um
 * frontmatter válido, e um campo silenciosamente ignorado esconderia erro de
 * digitação em artigo publicado).
 */
export function parseHelpFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  if (lines[0]?.trim() !== '---') {
    throw new TalkXHelpFrontmatterError('frontmatter ausente (o arquivo deve começar com "---")');
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) {
    throw new TalkXHelpFrontmatterError('frontmatter não fechado com "---"');
  }

  const data: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new TalkXHelpFrontmatterError(`linha de frontmatter inválida: "${line.trim()}"`);
    }
    const key = foldHelpKey(line.slice(0, separator));
    const value = line.slice(separator + 1).trim();
    if (!key || !value) {
      throw new TalkXHelpFrontmatterError(`campo de frontmatter vazio: "${line.trim()}"`);
    }
    data[key] = value;
  }

  return { data, body: lines.slice(end + 1).join('\n').trim() };
}

export function countHelpWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Minutos de leitura pela contagem de palavras; nunca menos que 1. */
export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(countHelpWords(text) / HELP_WORDS_PER_MINUTE));
}

/**
 * Valida o frontmatter e monta o documento. Lança
 * `TalkXHelpFrontmatterError` em arquivo inválido — o índice é conteúdo
 * publicado, então erro de digitação falha alto em vez de sumir da tela.
 */
export function parseHelpDoc(sourcePath: string, raw: string): TalkXHelpDoc {
  const segments = sourcePath.split('/').slice(-2);
  const topicSlug = segments[0] ?? '';
  const file = segments[1] ?? '';
  if (!file.endsWith('.md') || !topicSlug) {
    throw new TalkXHelpFrontmatterError(`caminho inesperado para a Ajuda: "${sourcePath}"`);
  }
  const slug = file.slice(0, -'.md'.length);
  const id = `${topicSlug}/${slug}`;

  const { data, body } = parseHelpFrontmatter(raw);

  const rawKind = data.tipo ?? '';
  if (!KINDS.includes(rawKind as TalkXHelpKind)) {
    throw new TalkXHelpFrontmatterError(
      `${id}.md: "tipo" deve ser artigo ou guia (veio "${rawKind || 'vazio'}")`,
    );
  }
  const kind = rawKind as TalkXHelpKind;
  const inGuidesDir = topicSlug === HELP_GUIDES_SLUG;
  if (inGuidesDir !== (kind === 'guia')) {
    throw new TalkXHelpFrontmatterError(
      `${id}.md: ${kind} na pasta errada (artigos em <topico>/, guias em ${HELP_GUIDES_SLUG}/)`,
    );
  }

  const title = (data.titulo ?? '').trim();
  if (!title) throw new TalkXHelpFrontmatterError(`${id}.md: "titulo" obrigatório`);

  const topic = (data.topico ?? '').trim();
  if (!topic) throw new TalkXHelpFrontmatterError(`${id}.md: "topico" obrigatório`);

  const order = Number(data.ordem ?? '');
  if (!Number.isInteger(order) || order < 1) {
    throw new TalkXHelpFrontmatterError(`${id}.md: "ordem" deve ser inteiro >= 1`);
  }

  const keywords = (data['palavras-chave'] ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  if (keywords.length === 0) {
    throw new TalkXHelpFrontmatterError(`${id}.md: "palavras-chave" obrigatório (uma ou mais)`);
  }

  const rawLevel = (data.nivel ?? '').trim();
  if (rawLevel && !LEVELS.includes(rawLevel as TalkXHelpLevel)) {
    throw new TalkXHelpFrontmatterError(
      `${id}.md: "nivel" deve ser ${LEVELS.join(', ')} (veio "${rawLevel}")`,
    );
  }
  const level = (rawLevel || null) as TalkXHelpLevel | null;
  if (kind === 'guia' && !level) {
    throw new TalkXHelpFrontmatterError(`${id}.md: guia sem "nivel"`);
  }

  if (!body) throw new TalkXHelpFrontmatterError(`${id}.md: corpo vazio`);

  return {
    id,
    slug,
    topicSlug,
    topic,
    title,
    kind,
    level,
    order,
    resume: (data.resumo ?? '').trim() || null,
    keywords,
    minutes: readingMinutes(body),
    body,
    sourcePath,
  };
}

export function sortHelpDocs(docs: TalkXHelpDoc[]): TalkXHelpDoc[] {
  return [...docs].sort(
    (left, right) =>
      KIND_WEIGHT[left.kind] - KIND_WEIGHT[right.kind] ||
      left.order - right.order ||
      left.title.localeCompare(right.title, 'pt-BR'),
  );
}

/** Carrega e valida todos os arquivos da Ajuda, já ordenados. */
export async function loadTalkXHelpDocs(): Promise<TalkXHelpDoc[]> {
  const loaded = await Promise.all(
    Object.entries(HELP_FILES).map(async ([path, load]) => parseHelpDoc(path, await load())),
  );
  return sortHelpDocs(loaded);
}

/** Caminhos conhecidos do índice — usado pelos testes contra o disco. */
export function talkXHelpSourcePaths(): string[] {
  return Object.keys(HELP_FILES).sort();
}

export function helpArticles(docs: TalkXHelpDoc[]): TalkXHelpDoc[] {
  return sortHelpDocs(docs.filter((doc) => doc.kind === 'artigo'));
}

export function helpGuides(docs: TalkXHelpDoc[]): TalkXHelpDoc[] {
  return sortHelpDocs(docs.filter((doc) => doc.kind === 'guia'));
}

/** Grade de tópicos: um item por pasta de artigo, com a contagem real. */
export function groupHelpTopics(docs: TalkXHelpDoc[]): TalkXHelpTopic[] {
  const bySlug = new Map<string, TalkXHelpTopic>();
  for (const doc of helpArticles(docs)) {
    const current = bySlug.get(doc.topicSlug);
    if (current) {
      current.articles.push(doc);
      current.order = Math.min(current.order, doc.order);
      continue;
    }
    bySlug.set(doc.topicSlug, {
      slug: doc.topicSlug,
      label: doc.topic,
      order: doc.order,
      articles: [doc],
    });
  }
  return [...bySlug.values()].sort(
    (left, right) => left.order - right.order || left.label.localeCompare(right.label, 'pt-BR'),
  );
}

export function findHelpDoc(docs: TalkXHelpDoc[], id: string | undefined): TalkXHelpDoc | null {
  if (!id) return null;
  return docs.find((doc) => doc.id === id) ?? null;
}

/** Vizinhos no mesmo tipo (artigo/guia), na ordem em que a Ajuda os lista. */
export function helpNeighbours(
  docs: TalkXHelpDoc[],
  doc: TalkXHelpDoc,
): { previous: TalkXHelpDoc | null; next: TalkXHelpDoc | null } {
  const siblings = doc.kind === 'guia' ? helpGuides(docs) : helpArticles(docs);
  const index = siblings.findIndex((candidate) => candidate.id === doc.id);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: siblings[index - 1] ?? null,
    next: siblings[index + 1] ?? null,
  };
}
