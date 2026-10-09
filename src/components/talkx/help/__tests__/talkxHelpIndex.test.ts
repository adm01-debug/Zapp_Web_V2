import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HELP_GUIDES_SLUG,
  TalkXHelpFrontmatterError,
  countHelpWords,
  groupHelpTopics,
  helpGuides,
  loadTalkXHelpDocs,
  parseHelpDoc,
  parseHelpFrontmatter,
  readingMinutes,
  talkXHelpSourcePaths,
} from '../talkxHelpIndex';

const HELP_DIR = path.resolve(process.cwd(), 'docs/talkx/help');
const VISAO_GERAL = path.join(HELP_DIR, 'primeira-campanha/visao-geral.md');

function diskFiles(dir = HELP_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return diskFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

describe('índice da Ajuda (X189)', () => {
  it('lê o frontmatter e devolve o corpo sem ele', () => {
    const raw = [
      '---',
      'título: Um artigo',
      'tópico: Tópico',
      'tipo: artigo',
      'ordem: 2',
      'palavras-chave: um, dois',
      '---',
      '',
      '# Corpo',
      '',
      'Texto do artigo.',
    ].join('\n');

    const { data, body } = parseHelpFrontmatter(raw);

    expect(data.titulo).toBe('Um artigo');
    expect(data['palavras-chave']).toBe('um, dois');
    expect(body).toBe('# Corpo\n\nTexto do artigo.');
  });

  it('conta palavras e minutos de leitura (200 palavras por minuto)', () => {
    expect(countHelpWords('uma duas três')).toBe(3);
    expect(readingMinutes(Array.from({ length: 400 }, () => 'palavra').join(' '))).toBe(2);
    expect(readingMinutes('curto')).toBe(1);
  });

  it('frontmatter inválido falha o teste em vez de sumir da tela', () => {
    const semCabecalho = '# Sem frontmatter';
    expect(() => parseHelpDoc('primeira-campanha/exemplo.md', semCabecalho)).toThrow(
      TalkXHelpFrontmatterError,
    );

    const semOrdem = [
      '---',
      'título: Sem ordem',
      'tópico: Primeira campanha',
      'tipo: artigo',
      'palavras-chave: algo',
      '---',
      'corpo',
    ].join('\n');
    expect(() => parseHelpDoc('primeira-campanha/exemplo.md', semOrdem)).toThrow(/ordem/);

    const tipoErrado = [
      '---',
      'título: Tipo errado',
      'tópico: Primeira campanha',
      'tipo: tudim',
      'ordem: 1',
      'palavras-chave: algo',
      '---',
      'corpo',
    ].join('\n');
    expect(() => parseHelpDoc('primeira-campanha/exemplo.md', tipoErrado)).toThrow(/tipo/);

    const guiaForaDaPasta = [
      '---',
      'título: Guia no lugar errado',
      'tópico: Guias',
      'tipo: guia',
      'nível: Iniciante',
      'ordem: 1',
      'palavras-chave: algo',
      '---',
      'corpo',
    ].join('\n');
    expect(() => parseHelpDoc('primeira-campanha/exemplo.md', guiaForaDaPasta)).toThrow(/pasta/);

    const guiaSemNivel = guiaForaDaPasta.replace('nível: Iniciante\n', '');
    expect(() => parseHelpDoc('guias/exemplo.md', guiaSemNivel)).toThrow(/nivel/);
  });

  it('carrega os arquivos de docs/talkx/help com id único e minutos >= 1', async () => {
    const docs = await loadTalkXHelpDocs();
    const ids = docs.map((doc) => doc.id);

    expect(docs.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const doc of docs) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.keywords.length).toBeGreaterThan(0);
      expect(doc.minutes).toBeGreaterThanOrEqual(1);
      expect(doc.body.length).toBeGreaterThan(0);
    }
    expect(docs.some((doc) => doc.kind === 'artigo')).toBe(true);
  });

  it('a contagem por tópico do índice é o nº de arquivos do tópico no disco', async () => {
    const docs = await loadTalkXHelpDocs();
    const topics = groupHelpTopics(docs);
    const paths = talkXHelpSourcePaths();

    // O glob conhece exatamente os arquivos que existem em docs/talkx/help.
    expect(paths.length).toBe(diskFiles().length);
    expect(paths.map((entry) => path.basename(entry)).sort()).toEqual(
      diskFiles().map((entry) => path.basename(entry)).sort(),
    );

    for (const topic of topics) {
      const onDisk = diskFiles(path.join(HELP_DIR, topic.slug)).filter(
        (file) => !file.startsWith(path.join(HELP_DIR, HELP_GUIDES_SLUG)),
      ).length;
      expect(onDisk).toBeGreaterThan(0);
      expect(topic.articles.length).toBe(onDisk);
    }

    const guidesOnDisk = diskFiles(path.join(HELP_DIR, HELP_GUIDES_SLUG)).length;
    expect(helpGuides(docs).length).toBe(guidesOnDisk);

    // Toda pasta com artigo aparece como tópico do índice.
    const folders = readdirSync(HELP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== HELP_GUIDES_SLUG)
      .map((entry) => entry.name)
      .sort();
    expect(topics.map((topic) => topic.slug).sort()).toEqual(folders);
  });

  it('um guia real traz nível e resumo do frontmatter', async () => {
    const docs = await loadTalkXHelpDocs();
    const guias = helpGuides(docs);
    expect(guias.length).toBeGreaterThan(0);
    for (const guia of guias) {
      expect(guia.level).not.toBeNull();
      expect(guia.topicSlug).toBe(HELP_GUIDES_SLUG);
    }
  });

  it('o arquivo de exemplo do disco casa com o frontmatter esperado', () => {
    const raw = readFileSync(VISAO_GERAL, 'utf8');
    const doc = parseHelpDoc('primeira-campanha/visao-geral.md', raw);
    expect(doc.kind).toBe('artigo');
    expect(doc.id).toBe('primeira-campanha/visao-geral');
  });
});
