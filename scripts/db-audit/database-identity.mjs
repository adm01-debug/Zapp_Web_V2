import crypto from 'node:crypto';
import fs from 'node:fs';

const PROJECT_REF = /^[a-z0-9]{20}$/;
const SHA256 = /^[a-f0-9]{64}$/;
export const SUPABASE_CA_PATH = 'scripts/db-audit/certs/supabase-prod-ca-2021.crt';
export const SUPABASE_CA_FILE_SHA256 =
  '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
export const SUPABASE_CA_FINGERPRINT256 =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';

export function sha256(valor) {
  return crypto.createHash('sha256').update(valor, 'utf8').digest('hex');
}

export function validarSupabaseCa(arquivo = SUPABASE_CA_PATH) {
  try {
    const pem = fs.readFileSync(arquivo);
    const hash = crypto.createHash('sha256').update(pem).digest('hex');
    const certificado = new crypto.X509Certificate(pem);
    const valida = hash === SUPABASE_CA_FILE_SHA256
      && certificado.fingerprint256 === SUPABASE_CA_FINGERPRINT256
      && certificado.ca
      && certificado.subject === certificado.issuer
      && /CN=Supabase Root 2021 CA/.test(certificado.subject);
    return valida ? [] : ['CA Supabase versionada diverge do fingerprint pinado'];
  } catch {
    return ['CA Supabase versionada ausente ou invalida'];
  }
}

/**
 * Extrai o project-ref sem registrar URL, usuario ou senha.
 *
 * Supabase Cloud usa duas formas comuns de conexao:
 *   - host direto: db.<project-ref>.supabase.co
 *   - pooler: usuario postgres.<project-ref>@*.pooler.supabase.com
 */
export function extrairProjectRef(connectionString) {
  if (!connectionString) return null;

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;

  const hostDireto = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
  if (hostDireto && PROJECT_REF.test(hostDireto[1].toLowerCase())) {
    return hostDireto[1].toLowerCase();
  }

  let usuario = '';
  try {
    usuario = decodeURIComponent(url.username);
  } catch {
    return null;
  }
  const usuarioPooler = usuario.match(/^postgres\.([a-z0-9]{20})$/i);
  if (
    usuarioPooler &&
    PROJECT_REF.test(usuarioPooler[1].toLowerCase()) &&
    /(^|\.)pooler\.supabase\.com$/i.test(url.hostname)
  ) {
    return usuarioPooler[1].toLowerCase();
  }

  return null;
}

export function carregarIdentidadeEsperada(arquivo) {
  let identidade;
  try {
    identidade = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (error) {
    throw new Error('identidade versionada invalida (' + arquivo + '): ' + error.message);
  }

  const erros = [];
  if (!identidade || typeof identidade !== 'object' || Array.isArray(identidade)) {
    erros.push('a raiz precisa ser um objeto JSON');
  } else {
    if (identidade.format_version !== 1) erros.push('format_version precisa ser 1');
    if (identidade.connection_provider !== 'supabase-cloud') {
      erros.push('connection_provider precisa ser supabase-cloud');
    }
    if (!SHA256.test(identidade.project_ref_sha256 || '')) {
      erros.push('project_ref_sha256 precisa ser um SHA-256 hexadecimal');
    }
    if (typeof identidade.database !== 'string' || !identidade.database) {
      erros.push('database precisa ser string nao vazia');
    }
    if (typeof identidade.schema !== 'string' || !identidade.schema) {
      erros.push('schema precisa ser string nao vazia');
    }
    if (!Number.isInteger(identidade.server_major) || identidade.server_major < 12) {
      erros.push('server_major precisa ser inteiro PostgreSQL suportado');
    }
  }

  if (erros.length) {
    throw new Error('identidade versionada invalida (' + arquivo + '): ' + erros.join('; '));
  }
  return identidade;
}

export function validarIdentidadeDoArtefato(identidade, esperada, rotulo) {
  const erros = [];
  if (!identidade || typeof identidade !== 'object' || Array.isArray(identidade)) {
    return ['identidade ausente ou invalida no ' + rotulo];
  }

  for (const campo of ['database', 'schema', 'server_major']) {
    if (identidade[campo] !== esperada[campo]) {
      erros.push(
        'identidade ' + rotulo + ': ' + campo + ' esperado=' +
        JSON.stringify(esperada[campo]) + ' obtido=' + JSON.stringify(identidade[campo]),
      );
    }
  }
  return erros;
}

export function validarDestino(connectionString, esperada) {
  if (!connectionString) {
    return ['DESTINO_URL ausente; nao foi possivel provar a identidade do banco'];
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return ['DESTINO_URL invalida; credencial nao exibida'];
  }

  const erros = [];
  const projectRef = extrairProjectRef(connectionString);
  if (!projectRef) {
    erros.push('DESTINO_URL nao identifica um projeto Supabase Cloud suportado');
  } else if (sha256(projectRef) !== esperada.project_ref_sha256) {
    erros.push('DESTINO_URL aponta para outro projeto (fingerprint divergente)');
  }

  let database = '';
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    erros.push('nome do database na DESTINO_URL e invalido');
  }
  if (database !== esperada.database) {
    erros.push('database da DESTINO_URL diverge da identidade versionada');
  }

  return erros;
}

/**
 * Produz uma URL de conexao que nao pode degradar a verificacao TLS.
 * A credencial nunca e incluida em mensagens de erro.
 */
export function endurecerDestinoTls(connectionString) {
  if (!connectionString) {
    return {
      connectionString: null,
      erros: ['DESTINO_URL ausente; TLS nao pode ser fixado'],
    };
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return {
      connectionString: null,
      erros: ['DESTINO_URL invalida; TLS nao pode ser fixado e a credencial nao foi exibida'],
    };
  }

  const sslmode = url.searchParams.get('sslmode');
  if (sslmode !== null && sslmode !== 'verify-full') {
    return {
      connectionString: null,
      erros: ['DESTINO_URL tenta reduzir sslmode; apenas verify-full e permitido'],
    };
  }

  const sslrootcert = url.searchParams.get('sslrootcert');
  if (sslrootcert !== null && sslrootcert !== SUPABASE_CA_PATH) {
    return {
      connectionString: null,
      erros: ['DESTINO_URL tenta substituir a CA Supabase pinada; sslrootcert divergente'],
    };
  }

  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.set('sslrootcert', SUPABASE_CA_PATH);
  return { connectionString: url.toString(), erros: [] };
}
