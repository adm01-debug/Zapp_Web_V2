// scripts/db-audit/local-pg-proxy.mjs <diretorio-temporario-0700>
//
// Escreve a config de um pgbouncer LOCAL (bind 127.0.0.1) que repassa para o
// DESTINO_URL real, com TLS verify-full + CA Supabase pinada no trecho
// pgbouncer->producao. A credencial real fica apenas no arquivo pgbouncer.ini
// (modo 0600, dentro de um diretorio 0700); o --db-url que o chamador (gen-
// types.sh) passa ao `supabase` CLI usa uma credencial descartavel que nunca
// aponta pra producao.
//
// Motivo: `supabase gen types typescript --db-url` (CLI 2.116.0) nao usa
// libpq/PGPASSFILE como os outros scripts deste diretorio — ele sobe um
// container Docker (ghcr.io/supabase/postgres-meta) que recebe a --db-url em
// texto puro e conecta a ela diretamente, usando a rede do host (confirmado
// empiricamente: uma porta em 127.0.0.1 do runner e alcancavel de dentro do
// container gerado pela CLI, com ou sem a rede bridge padrao do Docker
// disponivel). Sem esse proxy, a credencial de producao fica visivel via
// /proc a qualquer processo irmao no mesmo job (ex.: uma dependencia
// comprometida instalada por `bun install` mais adiante no mesmo workflow).
//
// Imprime no stdout, sozinha, a porta local escolhida.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { parseConnection } from './psql-environment.mjs';
import { endurecerDestinoTls, SUPABASE_CA_PATH } from './database-identity.mjs';

const proxyDir = process.argv[2];
if (!proxyDir) {
  console.error('uso: local-pg-proxy.mjs <diretorio-temporario-0700>');
  process.exit(2);
}

const destino = process.env.DESTINO_URL;
if (!destino) {
  console.error('Erro: DESTINO_URL nao definida no ambiente.');
  process.exit(1);
}

const tls = endurecerDestinoTls(destino);
if (tls.erros.length) {
  for (const erro of tls.erros) console.error('ERRO: ' + erro);
  process.exit(1);
}

const { fields, password } = parseConnection(tls.connectionString);

function escapeIniValue(value) {
  // Formato "connstring" da secao [databases] do pgbouncer.ini: NAO e
  // libpq-style apesar do que a doc do pgbouncer sugere ("similar to
  // libpq, but... different"). Verificado contra o parser real
  // (pgbouncer 1.22.0, src/loader.c: cstr_get_value/cstr_unquote_value)
  // por leitura de codigo-fonte E teste empirico ponta a ponta (pgbouncer
  // real autenticando num Postgres real com senha contendo espaco, aspa
  // simples e barra invertida juntos):
  //   - barra invertida (\) NAO tem nenhum significado especial — nunca
  //     precisa (nem deve) ser escapada, com ou sem aspas.
  //   - espaco fora de aspas termina o valor (delimitador); dentro de
  //     aspas simples, passa liso.
  //   - aspa simples (') e o UNICO caractere que precisa de tratamento:
  //     dentro de um valor entre aspas simples, uma aspa simples literal
  //     e representada dobrando-a ('' -> '), estilo string SQL — nao com
  //     barra invertida (\' NAO funciona: quebra o parser).
  // Logo: so precisamos abrir aspas quando ha espaco OU aspa simples no
  // valor; dentro delas, so a aspa simples e dobrada.
  if (/[\s']/.test(value)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const caPath = path.resolve(SUPABASE_CA_PATH);

const iniLines = [
  '[databases]',
  `proxydb = host=${escapeIniValue(fields.PGHOST)} port=${escapeIniValue(fields.PGPORT)} ` +
    `dbname=${escapeIniValue(fields.PGDATABASE)} user=${escapeIniValue(fields.PGUSER)} ` +
    `password=${escapeIniValue(password)}`,
  '',
  '[pgbouncer]',
  'listen_addr = 127.0.0.1',
  `listen_port = ${port}`,
  'unix_socket_dir =',
  'auth_type = trust',
  `auth_file = ${path.join(proxyDir, 'userlist.txt')}`,
  `logfile = ${path.join(proxyDir, 'pgbouncer.log')}`,
  `pidfile = ${path.join(proxyDir, 'pgbouncer.pid')}`,
  'pool_mode = session',
  'max_client_conn = 10',
  'default_pool_size = 5',
  'server_tls_sslmode = verify-full',
  `server_tls_ca_file = ${caPath}`,
  '',
].join('\n');

fs.writeFileSync(path.join(proxyDir, 'userlist.txt'), '"proxy" "unused"\n', { mode: 0o600 });
fs.writeFileSync(path.join(proxyDir, 'pgbouncer.ini'), iniLines, { mode: 0o600 });

console.log(String(port));
