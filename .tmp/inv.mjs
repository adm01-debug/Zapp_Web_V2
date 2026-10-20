import { readFileSync, readdirSync } from 'fs';
const y = readFileSync('.github/workflows/db-guard.yml', 'utf8');
const inYaml = new Set([...y.matchAll(/\bscripts\/db-audit\/\S+\.test\.sh\b/g)].map(m => m[0]));
const disk = readdirSync('scripts/db-audit').filter(f => f.endsWith('.test.sh')).map(f => 'scripts/db-audit/' + f);
const orf = disk.filter(f => !inYaml.has(f));
console.log('disco:', disk.length, 'no yaml:', inYaml.size);
console.log('ORFAOS (' + orf.length + '):');
orf.sort().forEach(f => console.log('  ' + f));
