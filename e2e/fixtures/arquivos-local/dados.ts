/**
 * Constantes sintéticas do fluxo local da aba Arquivos (cartão t_6c2d8281).
 *
 * Compartilhadas entre `seed.ts` (que cria o estado no banco/Storage LOCAIS) e
 * `files-tab.spec.ts` (que consome pela UI). Nenhum valor aqui é segredo nem
 * credencial real: a senha só existe no conjunto `zapp-db-local` da máquina e o
 * e-mail usa o domínio reservado `example.com` (RFC 2606).
 */
export const E2E_ARQUIVOS = {
  usuario: {
    /** Id fixo: seed idempotente (`on conflict` no id). */
    id: 'e2e26100-7005-4509-a000-000000000001',
    email: 'e2e.arquivos@example.com',
    senha: 'e2e-arquivos-local-sintetico-2610',
    nome: '[E2E] Arquivos Local',
  },
  conexao: {
    id: 'e2e26100-7005-4509-a000-0000000000c0',
    nome: '[E2E] Conexão Arquivos Local',
    telefone: '5511900000026',
    instanceId: 'e2e-arquivos-local',
  },
  contato: {
    id: 'e2e26100-7005-4509-a000-0000000000c1',
    nome: 'ArquivosLocal Contato Sintético',
    /** O item da inbox exibe `nickname ?? name.split(' ')[0]` — a 1ª palavra. */
    nomeVisivel: 'ArquivosLocal',
    telefone: '5511900000027',
  },
  /** > MEDIA_PAGE_SIZE (60) de mensagens de imagem: prova "Buscando entre N" +
   *  "Carregar tudo" no caminho real do keyset. */
  contatoPaginacao: {
    id: 'e2e26100-7005-4509-a000-0000000000c2',
    nome: 'PaginacaoLocal Contato Sintético',
    nomeVisivel: 'PaginacaoLocal',
    telefone: '5511900000028',
    objeto: 'e2e-arquivos-pagina.png',
    totalMidias: 65,
  },
  /** Só mensagens de texto: prova o estado "Nenhum arquivo nesta conversa". */
  contatoVazio: {
    id: 'e2e26100-7005-4509-a000-0000000000c3',
    nome: 'VazioLocal Contato Sintético',
    nomeVisivel: 'VazioLocal',
    telefone: '5511900000029',
  },
  bucket: 'whatsapp-media',
  mensagens: {
    imagem: {
      id: 'e2e26100-7005-4509-a000-000000000101',
      objeto: 'e2e-arquivos-imagem.png',
      messageType: 'image',
      mediaType: 'image/png',
      mimetype: 'image/png',
      filename: 'e2e-arquivos-imagem.png',
      sender: 'contact',
      ptt: false,
      content: 'Imagem sintética do fixture local',
    },
    video: {
      id: 'e2e26100-7005-4509-a000-000000000102',
      objeto: 'e2e-arquivos-video.mp4',
      messageType: 'video',
      mediaType: 'video/mp4',
      mimetype: 'video/mp4',
      filename: 'e2e-arquivos-video.mp4',
      sender: 'contact',
      ptt: false,
      content: 'Vídeo sintético do fixture local',
    },
    audio: {
      id: 'e2e26100-7005-4509-a000-000000000103',
      objeto: 'e2e-arquivos-audio.ogg',
      // `ptt` conta como áudio tanto no chip (useContactMediaCounts) quanto no
      // classificador do item (useContactMedia.classify).
      messageType: 'ptt',
      mediaType: 'audio/ogg',
      mimetype: 'audio/ogg',
      filename: 'e2e-arquivos-audio.ogg',
      sender: 'contact',
      ptt: true,
      content: 'Áudio sintético do fixture local',
    },
    documento: {
      id: 'e2e26100-7005-4509-a000-000000000104',
      objeto: 'e2e-arquivos-documento.pdf',
      messageType: 'document',
      mediaType: 'application/pdf',
      mimetype: 'application/pdf',
      filename: 'e2e-arquivos-documento.pdf',
      // sender=agent: exercita o rótulo "Atendente" e o item "Excluir" do painel.
      sender: 'agent',
      ptt: false,
      content: 'Documento sintético do fixture local',
    },
    /** Mensagem de texto: dá preview à conversa na inbox; NÃO conta na aba. */
    texto: {
      id: 'e2e26100-7005-4509-a000-000000000105',
      content: 'mensagem de texto do fixture local',
    },
  },
  /** Contagens que a aba deve exibir com o seed aplicado. */
  contagens: { todos: 4, imagens: 1, videos: 1, audios: 1, docs: 1 },
} as const;

/** Caminho do objeto dentro do bucket: <contact_id>/<arquivo> — a policy de SELECT
 *  de storage.objects exige que o 1º segmento seja um contato visível do usuário. */
export function caminhoObjeto(arquivo: string, contactId: string = E2E_ARQUIVOS.contato.id): string {
  return `${contactId}/${arquivo}`;
}

/** Locator durável de objeto privado (ver src/lib/storage_object_reference.ts). */
export function locatorObjeto(
  apiUrl: string,
  arquivo: string,
  contactId: string = E2E_ARQUIVOS.contato.id,
): string {
  return `${apiUrl}/storage/v1/object/public/${E2E_ARQUIVOS.bucket}/${caminhoObjeto(arquivo, contactId)}`;
}
