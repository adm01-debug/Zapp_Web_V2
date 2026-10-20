#!/usr/bin/env python3
"""Parse additional source formats without running application code or scripts."""
import argparse, ast, hashlib, json, pathlib, subprocess, tomllib
import yaml

p = argparse.ArgumentParser(description=__doc__)
for key in ('source', 'integrity', 'typescript', 'output'):
    p.add_argument('--' + key, required=True)
a = p.parse_args()
source = pathlib.Path(a.source).resolve()
integrity = json.loads(pathlib.Path(a.integrity).read_text())
checks, functions, go_files = [], [], []
for entry in integrity['files']:
    path = entry['path']
    ext = pathlib.Path(path).suffix.lower()
    if ext not in ('.py', '.sh', '.json', '.toml', '.yaml', '.yml', '.go'):
        continue
    data = (source / path).read_bytes()
    observed = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert observed == entry['git_blob_sha'], 'Source drift: ' + path
    base = {'path': path, 'git_blob_sha': observed, 'semantic_review_implied': False}
    if ext == '.go':
        go_files.append(dict(base, status='RUNTIME_NOT_EXECUTED', limitation='Go runtime was unavailable; semantic source review, if any, is recorded in infrastructure coverage.'))
        continue
    row = dict(base, status='SYNTAX_OK')
    try:
        text = data.decode('utf8')
        if ext == '.py':
            row['parser'] = 'Python ast.parse; no execution'
            tree = ast.parse(text, filename=path)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                    functions.append(dict(base, name=getattr(node, 'name', 'lambda@' + str(node.lineno)), line_start=node.lineno, line_end=node.end_lineno,
                                          kind=type(node).__name__, review_state='STRUCTURAL_ONLY'))
        elif ext == '.sh':
            row['parser'] = 'bash -n; no script execution'
            result = subprocess.run(['bash', '-n', str(source / path)], capture_output=True)
            if result.returncode:
                row.update(status='SYNTAX_ERROR_REQUIRES_REVIEW', parser_exit_code=result.returncode)
        elif ext == '.json':
            if pathlib.Path(path).name.startswith('tsconfig'):
                row['parser'] = 'TypeScript parseConfigFileTextToJson'
                script = "const fs=require('fs'),ts=require(process.argv[1]);const f=process.argv[2];const r=ts.parseConfigFileTextToJson(f,fs.readFileSync(f,'utf8'));process.stdout.write(JSON.stringify({version:ts.version,errors:r.error?[r.error.code]:[]}));"
                result = subprocess.run(['node', '-e', script, str(pathlib.Path(a.typescript).resolve()), str(source / path)], capture_output=True, text=True, check=True)
                parsed = json.loads(result.stdout)
                row['parser_version'] = parsed['version']
                row['status'] = 'SYNTAX_OK_JSONC' if not parsed['errors'] else 'SYNTAX_ERROR_REQUIRES_REVIEW'
                row['diagnostic_codes'] = parsed['errors']
                row['limitation'] = 'TypeScript configuration accepts comments; rejection by a strict JSON parser is not itself a product defect.'
            else:
                row['parser'] = 'Python json.loads; syntax only'
                json.loads(text)
        elif ext == '.toml':
            row['parser'] = 'Python tomllib; syntax only'
            tomllib.loads(text)
        else:
            row['parser'] = 'PyYAML safe_load; syntax only, YAML1.1 resolution'
            if path == '.claude/homunculus/instincts/inherited/zapp-web-v2-instincts.yaml':
                row.update(status='MIXED_FRONTMATTER_MARKDOWN_FORMAT', limitation='Contains Markdown plus YAML front matter; generic YAML parsing is inapplicable. Plugin loader compatibility was not certified.')
            else:
                yaml.safe_load(text)
    except Exception as exc:
        row.update(status='SYNTAX_ERROR_REQUIRES_REVIEW', exception_type=type(exc).__name__)
        # Do not print input values, which may be environment/configuration data.
    checks.append(row)

result = {'head_sha': integrity['head_sha'], 'checks': checks, 'python_functions': functions, 'go_files': go_files,
          'limitations': ['No Python module, shell script, SQL statement or Go program was executed.',
                         'Syntax validity does not verify provider schemas, authorization, operational effects or deployment configuration.',
                         'YAML1.1 scalar resolution is not a claim about the workflow runner’s schema.',
                         'No source values or credential contents are included.']}
pathlib.Path(a.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'checks': len(checks), 'python_functions': len(functions), 'go_files': len(go_files),
                  'statuses': {s: sum(r['status'] == s for r in checks) for s in sorted({r['status'] for r in checks})}}))
