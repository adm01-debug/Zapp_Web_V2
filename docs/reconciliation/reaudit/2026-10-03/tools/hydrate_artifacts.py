#!/usr/bin/env python3
"""Verify or materialize losslessly compressed audit data in an audit copy."""
from pathlib import Path
import argparse, gzip, hashlib, json

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--root', required=True)
p.add_argument('--verify-only', action='store_true')
a = p.parse_args()
root = Path(a.root).resolve()
manifest = json.loads((root / 'PACKAGING_MAP.json').read_text())
verified = 0
for row in manifest['compressed_files']:
    source, dest = (root / row['packed_path']).resolve(), (root / row['original_path']).resolve()
    assert source.is_relative_to(root) and dest.is_relative_to(root)
    packed = source.read_bytes()
    assert hashlib.sha256(packed).hexdigest() == row['packed_sha256'], str(source)
    raw = gzip.decompress(packed)
    assert len(raw) == row['original_bytes']
    assert hashlib.sha256(raw).hexdigest() == row['original_sha256'], str(dest)
    if dest.exists():
        assert dest.read_bytes() == raw, f'Refusing to replace changed file: {dest}'
    elif not a.verify_only:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
    verified += 1
print(json.dumps({'verified_compressed_artifacts': verified, 'materialization_requested': not a.verify_only}))
