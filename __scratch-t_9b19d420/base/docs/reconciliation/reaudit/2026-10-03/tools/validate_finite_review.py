#!/usr/bin/env python3
"""Validate finite audit completion. Reads source bytes/metadata, never runs source.

Exit 0: COMPLETE, or PENDING with --allow-pending. Exit 1: FAILED, or any
pending work in final mode. Output is always documentary, not runtime acceptance.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

OWNERS = ('auth', 'database', 'inbox', 'infra', 'modules', 'providers', 'root')
EXPECTED = {'test': (713, 118817), 'shell': (85, 24894)}
EXPECTED_HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
FINAL_STATUSES = {
    'COMPLETE', 'COMPLETED', 'SEMANTIC_REVIEW_COMPLETE',
    'COMPLETE_FINITE_TEST_READING', 'COMPLETE_FINITE_SHELL_READING',
    'COMPLETED_REVIEW_PASS', 'COMPLETED_MANUAL_READING',
    'COMPLETED_FINITE_SHELL_READING',
}
ENTRY_STATUSES = {
    'SEMANTIC_REVIEW_COMPLETE', 'COMPLETED_MANUAL_READING', 'READ_COMPLETE',
    'PREVIOUS_WHOLE_FILE_REVIEW_CITED', 'ADJUDICATED_BODY_READ',
    'SEMANTIC_FULL_FILE', 'SEMANTIC_FILE_REVIEW', 'COMPLETE_FINITE_TEST_READING',
}
PENDING_STATUSES = {'IN_PROGRESS', 'PENDING', 'PENDING_READING', 'NOT_REVIEWED',
                    'ALLOCATION_ONLY_NOT_REVIEW', 'ALLOCATED_NOT_REVIEWED'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def meaningful(value):
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple)):
        return bool(value) and any(meaningful(x) for x in value)
    if isinstance(value, dict):
        return bool(value) and any(meaningful(x) for x in value.values())
    return False


def merge_ranges(ranges):
    merged = []
    for lo, hi in sorted(ranges):
        if merged and lo <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], hi)
        else:
            merged.append([lo, hi])
    return merged


def lexical_sql_statements(text):
    """Mirror the recorded inventory's lexical boundaries, not a PG parser.

    Handles quoted strings/identifiers, dollar quotes and nested block comments.
    Hashes retain the inventory's leading-comment removal and trailing bytes.
    No SQL is evaluated; this is solely a statement-pin cross-check.
    """
    start = i = depth = 0
    state = None
    dollar = ''
    spans = []
    while i < len(text):
        c, pair = text[i], text[i:i+2]
        if state == 'line':
            if c == '\n': state = None
        elif state == 'block':
            if pair == '/*': depth += 1; i += 1
            elif pair == '*/':
                depth -= 1; i += 1
                if depth == 0: state = None
        elif state in ('single','double'):
            q = "'" if state == 'single' else '"'
            if c == q:
                if text[i+1:i+2] == q: i += 1
                else: state = None
        elif state == 'dollar':
            if text.startswith(dollar,i): i += len(dollar)-1; state = None
        elif pair == '--': state = 'line'; i += 1
        elif pair == '/*': state = 'block'; depth = 1; i += 1
        elif c == "'": state = 'single'
        elif c == '"': state = 'double'
        elif c == '$':
            m = re.match(r'\$(?:[A-Za-z_][\w]*)?\$',text[i:])
            if m: dollar = m.group(); state = 'dollar'; i += len(dollar)-1
        elif c == ';':
            spans.append((start,i+1)); start = i+1
        i += 1
    if text[start:].strip(): spans.append((start,len(text)))
    result = set()
    for first,last in spans:
        raw = text[first:last]
        offset = 0
        while True:
            m = re.match(r'\s+',raw[offset:])
            if m: offset += m.end()
            if raw[offset:offset+2] == '--':
                end = raw.find('\n',offset); offset = len(raw) if end < 0 else end+1
            elif raw[offset:offset+2] == '/*':
                end = raw.find('*/',offset+2); offset = len(raw) if end < 0 else end+2
            else: break
        statement = raw[offset:]
        if statement.strip():
            lo = text.count('\n',0,first+offset)+1
            hi = text.count('\n',0,first+len(raw.rstrip())-1)+1
            result.add((lo,hi,digest(statement.encode())))
    return result


class Gate:
    def __init__(self, audit_root, source, allow_pending):
        self.root = audit_root.resolve()
        self.source = source.resolve()
        self.allow_pending = allow_pending
        self.errors = []
        self.pending = []
        self.inputs = {}
        self.documents = {}
        self.source_meta = {}
        self.sql_statement_cache = {}
        self.head = None
        self.result = {'schema_version': 1, 'status': 'PENDING',
                       'mode': 'provisional' if allow_pending else 'final',
                       'audit_root': str(self.root), 'source_root': str(self.source)}

    def error(self, code, message, **context):
        self.errors.append(dict(code=code, message=message, **context))

    def wait(self, code, message, **context):
        self.pending.append(dict(code=code, message=message, **context))

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.source), *args])

    def read(self, relative, optional=False):
        """Snapshot/hash every consumed artifact; relative paths cannot escape root."""
        p = Path(relative)
        if p.is_absolute() or '..' in p.parts:
            self.error('UNSAFE_ARTIFACT_PATH', 'Artifact path is not audit-root relative', path=str(p))
            return None
        if str(p) in self.documents:
            return self.documents[str(p)]
        path = self.root / p
        if not path.is_file():
            if optional:
                self.wait('MISSING_ARTIFACT', 'Required final artifact not yet present', artifact=str(p))
            else:
                self.error('MISSING_ARTIFACT', 'Required artifact missing', artifact=str(p))
            return None
        raw = path.read_bytes()
        self.inputs[str(p)] = dict(path=str(p), sha256=digest(raw), bytes=len(raw))
        try:
            value = json.loads(raw)
            self.documents[str(p)] = value
            return value
        except (ValueError, UnicodeDecodeError) as exc:
            self.error('INVALID_JSON', str(exc), artifact=str(p))
            return None

    def check_head(self, obj, artifact, required=True):
        heads = [obj[k] for k in ('source_head', 'head_sha', 'baseline_sha', 'head') if k in obj]
        if required and not heads:
            self.error('HEAD_MISSING', 'No supported source pin', artifact=artifact)
        if any(h != self.head for h in heads):
            self.error('HEAD_MISMATCH', 'Artifact points to a different source', artifact=artifact, observed=heads)

    def check_source_ref(self, row, artifact, need_both=False):
        path = row.get('path')
        meta = self.source_meta.get(path)
        if meta is None:
            self.error('UNTRACKED_REFERENCE', 'Reference absent from verified source manifest', artifact=artifact, path=path)
            return None
        blob = row.get('git_blob_sha')
        sha = row.get('source_sha256', row.get('file_sha256', row.get('sha256')))
        if need_both and (not blob or not sha):
            self.error('MISSING_FILE_PINS', 'SHA256 and Git blob are required', artifact=artifact, path=path)
        if blob and blob != meta['blob']:
            self.error('BLOB_MISMATCH', 'Reference blob differs from source', artifact=artifact, path=path)
        if sha and sha != meta['sha256']:
            self.error('SHA256_MISMATCH', 'Reference SHA256 differs from source', artifact=artifact, path=path)
        self.check_head(row, artifact+':'+str(path), required=False)
        return meta

    def ranges(self, entry, artifact, eof, allow_entry_bounds=False):
        raw = entry.get('reviewed_ranges', entry.get('ranges_read'))
        # Root test journal explicitly records 1..EOF in each adjudicated entry;
        # these are journal bounds, never copied from the allocation by this gate.
        if raw is None and allow_entry_bounds and 'line_start' in entry and 'line_end' in entry:
            raw = [[entry['line_start'], entry['line_end']]]
        if raw is None:
            self.error('REVIEW_RANGES_MISSING', 'Completed entry has no explicit reviewed range', artifact=artifact, path=entry.get('path'))
            return []
        pairs = []
        for r in raw:
            if isinstance(r, dict):
                lo, hi = r.get('line_start', r.get('start_line')), r.get('line_end', r.get('end_line'))
            elif isinstance(r, list) and len(r) == 2:
                lo, hi = r
            else:
                self.error('RANGE_SCHEMA', 'Unrecognized range representation', artifact=artifact, path=entry.get('path'))
                continue
            if type(lo) is not int or type(hi) is not int or not (1 <= lo <= hi <= eof):
                self.error('RANGE_OUT_OF_BOUNDS', 'Range must lie in actual source lines', artifact=artifact, path=entry.get('path'), range=[lo, hi], eof=eof)
                continue
            pairs.append([lo, hi])
        return merge_ranges(pairs)

    def adjudicated(self, entry, owner):
        if any(meaningful(entry.get(k)) for k in ('adjudication', 'assessment')):
            return True
        if isinstance(entry.get('manual_adjudication'), dict):
            nested = entry['manual_adjudication']
            return self.adjudicated(nested, nested.get('reviewer', owner))
        # Auth's explicit schema splits the adjudication into proves + mocks +
        # limits; requiring all three avoids accepting an allocation placeholder.
        return owner == 'auth' and all(meaningful(entry.get(k)) for k in ('proves', 'mocks_and_fixtures', 'limits'))

    def integrity(self):
        d = self.read('source-integrity.json')
        if not isinstance(d, dict):
            return
        self.head = d.get('head_sha')
        if self.head != EXPECTED_HEAD:
            self.error('FINITE_SOURCE_HEAD', 'Manifest differs from the source of this finite review', expected=EXPECTED_HEAD, observed=self.head)
        self.result['source_head'] = self.head
        actual_head = self.git('rev-parse', 'HEAD').decode().strip()
        tracked = {}
        for row in self.git('ls-tree', '-rz', self.head).split(b'\0'):
            if not row:
                continue
            meta, path = row.split(b'\t', 1)
            fields = meta.decode().split()
            if fields[1] != 'blob':
                self.error('NON_BLOB_TRACKED_ENTRY', 'Unsupported tracked object', path=path.decode())
            tracked[path.decode()] = fields[2]
        rows = d.get('files', [])
        manifest_paths = [r['path'] for r in rows]
        if len(rows) != 4068 or d.get('tracked_files') != 4068 or len(set(manifest_paths)) != 4068:
            self.error('INTEGRITY_COUNT', 'Expected 4068 unique tracked manifest entries')
        if set(manifest_paths) != set(tracked):
            self.error('MANIFEST_TREE_MISMATCH', 'Manifest paths differ from pinned Git tree')
        if d.get('mismatches'):
            self.error('RECORDED_INTEGRITY_MISMATCHES', 'Integrity artifact already reports mismatches')
        verified = 0
        for row in rows:
            path = row['path']
            file = self.source/path
            if not file.is_file() or file.is_symlink():
                self.error('SOURCE_FILE_UNAVAILABLE', 'Source entry missing or unexpected symlink', path=path)
                continue
            raw = file.read_bytes()
            blob = hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()
            if blob != row['git_blob_sha'] or blob != tracked.get(path) or len(raw) != row['bytes']:
                self.error('SOURCE_INTEGRITY_MISMATCH', 'Actual source bytes differ from pinned manifest/tree', path=path)
            else:
                verified += 1
            self.source_meta[path] = dict(blob=blob, sha256=digest(raw), lines=len(raw.splitlines()), bytes=len(raw))
        changed = bool(self.git('status', '--porcelain', '--untracked-files=no').strip())
        if actual_head != self.head:
            self.error('ACTUAL_HEAD_MISMATCH', 'Checkout HEAD does not match manifest', observed=actual_head)
        if changed:
            self.error('SOURCE_TRACKED_CHANGES', 'Source checkout has tracked changes')
        self.result['integrity'] = dict(tracked_files=len(rows), verified_blobs=verified,
            source_changed=changed, head_matches=actual_head == self.head,
            source_manifest_sha256=self.inputs['source-integrity.json']['sha256'])

    def roster(self, kind):
        expected_files, expected_lines = EXPECTED[kind]
        allocation = {}
        completed = {}
        owners = {}
        for owner in OWNERS:
            roster_path = f'reports/{owner}/{kind}-review-roster.json'
            journal_path = f'reports/{owner}/{kind}-review.json'
            r = self.read(roster_path)
            if not isinstance(r, dict):
                continue
            self.check_head(r, roster_path)
            if r.get('owner') != owner:
                self.error('ROSTER_OWNER_MISMATCH', 'Allocation owner differs from directory', artifact=roster_path)
            owner_paths = set()
            for e in r.get('files', []):
                p = e.get('path')
                meta = self.check_source_ref(e, roster_path, need_both=True)
                if p in allocation:
                    self.error('DUPLICATE_ALLOCATION', 'Path assigned more than once', artifact=roster_path, path=p)
                allocation[p] = (owner, e)
                owner_paths.add(p)
                if meta and (e.get('line_start') != 1 or e.get('line_end') != meta['lines']):
                    self.error('ROSTER_NOT_WHOLE_FILE', 'Allocation bounds differ from 1..EOF', artifact=roster_path, path=p)
            j = self.read(journal_path, optional=True)
            owners[owner] = dict(allocated_files=len(owner_paths), completed_files=0,
                allocated_lines=sum(self.source_meta.get(p, {}).get('lines', 0) for p in owner_paths),
                completed_lines=0, status=j.get('status') if isinstance(j, dict) else 'MISSING')
            if not isinstance(j, dict):
                continue
            self.check_head(j, journal_path)
            # Database aggregates peer review into its own allocation journal.
            # Verify those referenced snapshots but never add them to totals.
            for peer in j.get('review_artifacts', []):
                peer_path = (self.root/Path(journal_path).parent/peer['artifact']).resolve()
                try:
                    peer_relative = peer_path.relative_to(self.root).as_posix()
                except ValueError:
                    self.error('PEER_ARTIFACT_OUTSIDE_ROOT', 'Peer evidence must remain within audit root', artifact=journal_path)
                    continue
                peer_doc = self.read(peer_relative)
                if isinstance(peer_doc, dict):
                    self.check_head(peer_doc, peer_relative)
                if self.inputs.get(peer_relative,{}).get('sha256') != peer.get('artifact_sha256'):
                    self.error('PEER_ARTIFACT_HASH', 'Aggregated journal references different peer evidence bytes', artifact=journal_path, peer=peer_relative)
            if j.get('roster_sha256') and j['roster_sha256'] != self.inputs[roster_path]['sha256']:
                self.error('ROSTER_REFERENCE_HASH', 'Journal references different allocation bytes', artifact=journal_path)
            jstatus = j.get('status')
            if jstatus not in FINAL_STATUSES:
                if jstatus in PENDING_STATUSES:
                    self.wait('JOURNAL_IN_PROGRESS', 'Owner has not marked reading complete', artifact=journal_path, status=jstatus)
                else:
                    self.error('UNKNOWN_JOURNAL_STATUS', 'Status has no explicit schema mapping', artifact=journal_path, status=jstatus)
            seen = set()
            for e in j.get('files', []):
                p = e.get('path')
                if p in seen:
                    self.error('DUPLICATE_JOURNAL_ENTRY', 'Repeated path in owner journal', artifact=journal_path, path=p)
                    continue
                seen.add(p)
                if p not in owner_paths:
                    self.error('JOURNAL_OUTSIDE_ALLOCATION', 'Owner journal path is not in its roster; peer journals are not counted directly', artifact=journal_path, path=p)
                    continue
                before = len(self.errors)
                meta = self.check_source_ref(e, journal_path, need_both=True)
                status = e.get('review_status', e.get('status'))
                if status not in ENTRY_STATUSES:
                    if status not in PENDING_STATUSES:
                        self.error('UNKNOWN_ENTRY_STATUS', 'Entry status has no explicit schema mapping', artifact=journal_path, path=p, status=status)
                    continue
                if not self.adjudicated(e, owner):
                    self.error('ADJUDICATION_MISSING', 'Completed entry lacks substantive adjudication fields', artifact=journal_path, path=p)
                if meta:
                    nested = e.get('manual_adjudication')
                    if isinstance(nested, dict):
                        if nested.get('path') != p:
                            self.error('PEER_ENTRY_PATH', 'Embedded peer adjudication is for another file', artifact=journal_path, path=p)
                        self.check_source_ref(nested, journal_path, need_both=True)
                        if nested.get('review_status',nested.get('status')) not in ENTRY_STATUSES:
                            self.error('PEER_ENTRY_STATUS', 'Embedded peer reading is not complete', artifact=journal_path,path=p)
                        peer_ranges = self.ranges(nested,journal_path,meta['lines'],
                            allow_entry_bounds=nested.get('whole_file_read') is True)
                        if peer_ranges != [[1,meta['lines']]]:
                            self.error('PEER_ENTRY_RANGES', 'Embedded peer reading does not cover 1..EOF',artifact=journal_path,path=p)
                    ranges = self.ranges(e, journal_path, meta['lines'], allow_entry_bounds=owner == 'root')
                    if ranges != [[1, meta['lines']]]:
                        self.error('JOURNAL_NOT_WHOLE_FILE', 'Completed entry does not cover actual 1..EOF', artifact=journal_path, path=p)
                    for key in ('line_count', 'total_lines'):
                        if key in e and e[key] != meta['lines']:
                            self.error('JOURNAL_LINE_COUNT', 'Entry line count differs from source', artifact=journal_path, path=p)
                    if len(self.errors) == before:
                        completed[p] = dict(owner=owner, path=p, lines=meta['lines'], status=status,
                            journal=journal_path, source_sha256=meta['sha256'], git_blob_sha=meta['blob'])
                        owners[owner]['completed_files'] += 1
                        owners[owner]['completed_lines'] += meta['lines']
            if jstatus in FINAL_STATUSES and owner_paths - set(completed):
                self.error('COMPLETE_JOURNAL_HAS_GAPS', 'Owner declares complete but allocated paths lack valid complete entries', artifact=journal_path, missing_count=len(owner_paths-set(completed)))
        allocated_lines = sum(self.source_meta.get(p, {}).get('lines', 0) for p in allocation)
        if len(allocation) != expected_files or allocated_lines != expected_lines:
            self.error('FINITE_ROSTER_TOTAL', 'Union differs from fixed finite allocation', kind=kind,
                actual_files=len(allocation), actual_lines=allocated_lines,
                expected_files=expected_files, expected_lines=expected_lines)
        pending_paths = sorted(set(allocation)-set(completed))
        if pending_paths:
            self.wait('ROSTER_READING_PENDING', 'Allocated paths still lack completed valid reading', kind=kind, count=len(pending_paths))
        return dict(expected_files=expected_files, expected_lines=expected_lines,
            allocated_unique_files=len(allocation), allocated_lines=allocated_lines,
            completed_files=len(completed), completed_lines=sum(e['lines'] for e in completed.values()),
            pending_paths=pending_paths, owners=owners, files=sorted(completed.values(), key=lambda x:x['path']),
            counting_rule='Count only each allocating owner journal; embedded peer attribution is preserved, independent peer journals and supporting fixtures are not added.')

    def matrices(self):
        summary = self.read('consolidated/summary.json')
        files = self.read('consolidated/file-review-matrix.json')
        bodies = self.read('consolidated/function-review-matrix.json')
        validation_errors = self.read('consolidated/validation-errors.json')
        if validation_errors:
            self.error('CONSOLIDATION_ERRORS', 'Consolidator reports validation errors', count=len(validation_errors))
        if not isinstance(summary, dict) or not isinstance(files, list) or not isinstance(bodies, list):
            return
        self.check_head(summary, 'consolidated/summary.json')
        if summary.get('source_integrity_sha256') != self.inputs['source-integrity.json']['sha256']:
            self.error('CONSOLIDATED_SOURCE_PIN', 'Consolidation refers to different integrity manifest')
        stale_inputs = []
        for inp in summary.get('review_inputs', []):
            name = inp.get('path')
            self.read(name)
            if name in self.inputs and self.inputs[name]['sha256'] != inp.get('sha256'):
                stale_inputs.append(name)
        if stale_inputs:
            self.wait('STALE_CONSOLIDATION', 'Consolidate again after updated owner artifacts', paths=stale_inputs)
        fmap = {}
        unions = {}
        for e in files:
            p = e.get('path')
            if p in fmap:
                self.error('DUPLICATE_MATRIX_FILE', 'Duplicate file matrix path', path=p)
            fmap[p] = e
            meta = self.check_source_ref(e, 'consolidated/file-review-matrix.json')
            if not meta:
                continue
            if e.get('bytes') != meta['bytes'] or (not e.get('binary') and e.get('lines') != meta['lines']):
                self.error('MATRIX_FILE_METADATA', 'File matrix bytes/lines differ from source', path=p)
            merged = self.ranges(e, 'consolidated/file-review-matrix.json', meta['lines'])
            unions[p] = merged
            if merged != e.get('reviewed_line_union'):
                self.error('MATRIX_RANGE_UNION', 'Stored line union differs from actual declared ranges', path=p)
        if set(fmap) != set(self.source_meta) or len(files) != 4068:
            self.error('FILE_MATRIX_UNIVERSE', 'File matrix does not match all verified tracked files')
        ids = set()
        state_counts = Counter()
        non_test_counts = Counter()
        for e in bodies:
            if e.get('id') in ids:
                self.error('DUPLICATE_BODY_ID', 'Repeated JS/TS body identity', id=e.get('id'))
            ids.add(e.get('id'))
            meta = self.check_source_ref(e, 'consolidated/function-review-matrix.json')
            lo, hi = e.get('line_start'), e.get('line_end')
            if not meta or type(lo) is not int or type(hi) is not int or not 1 <= lo <= hi <= meta['lines']:
                self.error('BODY_RANGE_INVALID', 'JS/TS body range outside source', id=e.get('id'))
                continue
            rs = unions.get(e['path'], [])
            full = any(a <= lo and b >= hi for a,b in rs)
            partial = any(a <= hi and b >= lo for a,b in rs)
            calculated = 'BODY_CONTAINED_IN_REVIEWED_RANGES' if full else 'BODY_PARTIALLY_OVERLAPS_REVIEWED_RANGES' if partial else 'NO_CURRENT_REVIEWED_RANGE_LOCATED'
            if e.get('review_span_state') != calculated:
                self.error('BODY_CONTAINMENT_STATE', 'Body state differs from file range union', id=e.get('id'))
            state_counts[calculated] += 1
            if type(e.get('is_test')) is not bool:
                self.error('BODY_TEST_CLASSIFICATION', 'Body must have explicit boolean test classification', id=e.get('id'))
            if e.get('is_test') is False:
                non_test_counts[calculated] += 1
        total, non_test = len(bodies), sum(non_test_counts.values())
        if total != 36853 or non_test != 16652:
            self.error('BODY_UNIVERSE_COUNTS', 'JS/TS body counts differ from adjudicated universe', total=total, non_test=non_test)
        for field, expected in [('all_js_ts_bodies', total), ('non_test_js_ts_bodies', non_test),
                                ('function_span_states_all', dict(state_counts)), ('function_span_states_non_test', dict(non_test_counts))]:
            if summary.get(field) != expected:
                self.error('SUMMARY_MATRIX_MISMATCH', 'Summary differs from body matrix', field=field)
        uncontained = total-state_counts['BODY_CONTAINED_IN_REVIEWED_RANGES']
        uncontained_nt = non_test-non_test_counts['BODY_CONTAINED_IN_REVIEWED_RANGES']
        if uncontained:
            self.wait('JS_TS_UNCONTAINED', 'Body matrix still has bodies not fully contained', count=uncontained, non_test_count=uncontained_nt)
        self.result['js_ts'] = dict(total_bodies=total, non_test_bodies=non_test,
            uncontained_bodies=uncontained, uncontained_non_test_bodies=uncontained_nt,
            states=dict(state_counts), non_test_states=dict(non_test_counts), stale_consolidation_inputs=stale_inputs)
        languages = {}
        for ext, expected in [('.sh',95),('.py',3),('.go',2)]:
            paths = sorted(p for p in self.source_meta if p.endswith(ext))
            pending = [p for p in paths if unions.get(p) != [[1,self.source_meta[p]['lines']]]]
            if len(paths) != expected:
                self.error('LANGUAGE_UNIVERSE', 'Language file count differs from finite source universe', extension=ext, expected=expected, actual=len(paths))
            if pending:
                self.wait('LANGUAGE_RANGES_PENDING', 'Language files do not yet have complete 1..EOF range unions', extension=ext, count=len(pending))
            languages[ext] = dict(expected=expected,total=len(paths),full_range=len(paths)-len(pending),pending_paths=pending)
        self.result['other_languages'] = languages
        # Final supplement: extensionless repository hooks, HTML entrypoint and
        # every source CSS file. These never alter the 713/85 roster counts.
        static_paths = sorted({'.husky/pre-commit','.husky/pre-push','index.html'} |
            {p for p in self.source_meta if p.startswith('src/') and p.endswith('.css')})
        missing_static = [p for p in static_paths if p not in self.source_meta]
        if missing_static:
            self.error('STATIC_ASSET_UNIVERSE', 'Required static entrypoint/hook missing from tracked source', paths=missing_static)
        static_pending = [p for p in static_paths if p in self.source_meta and unions.get(p) != [[1,self.source_meta[p]['lines']]]]
        if static_pending:
            self.wait('STATIC_ASSET_RANGES_PENDING','Hooks, HTML or source CSS still lack full reviewed ranges', count=len(static_pending))
        self.result['static_assets'] = dict(total=len(static_paths),full_range=len(static_paths)-len(static_pending)-len(missing_static),
            pending_paths=static_pending, paths=static_paths,
            meaning='Full source-range reading only; no visual rendering or browser acceptance inferred.')

    def sql(self):
        ddl = self.read('reports/database/ddl_completion.json')
        fun = self.read('reports/database/function_review.json')
        acl = self.read('reports/root/routine-acl-review.json')
        allocation = self.read('reports/database/remaining_ddl_inventory.json')
        manual = self.read('reports/database/ddl_review.json')
        if not all(isinstance(x,dict) for x in (ddl,fun,acl,allocation,manual)):
            return
        for name, d in [('reports/database/ddl_completion.json',ddl),('reports/database/function_review.json',fun),('reports/root/routine-acl-review.json',acl),('reports/database/remaining_ddl_inventory.json',allocation),('reports/database/ddl_review.json',manual)]:
            self.check_head(d, name)
        if ddl.get('status') not in FINAL_STATUSES or ddl.get('pending_ddl_instruction_count') != 0:
            self.wait('SQL_DDL_PENDING', 'DDL reading not complete with zero pending instructions')
        units = ddl.get('units', [])
        def key(u):
            s = u.get('source',{})
            return (s.get('path'),s.get('start_line'),s.get('end_line'),s.get('statement_sha256'))
        allocated = allocation.get('pending_source_units',[])
        if len(units) != 2425 or ddl.get('original_ddl_instruction_count') != 2425 or len(allocated) != 2425:
            self.error('DDL_UNITS_COUNT', 'DDL closure and immutable allocation must each contain 2425 units')
        if len({key(u) for u in units}) != 2425 or {key(u) for u in units} != {key(u) for u in allocated}:
            self.error('DDL_ALLOCATION_CROSSWALK', 'DDL closure does not cover each unique allocated instruction exactly once')
        own_instructions = manual.get('instructions',{})
        batches = manual.get('batches',{})
        for u in units:
            self.sql_ref(u.get('source',{}), 'reports/database/ddl_completion.json')
            if u.get('coverage_level') != 'semantic' or not meaningful(u.get('review_artifact')):
                self.error('DDL_UNIT_UNADJUDICATED', 'DDL unit lacks semantic review provenance', source=u.get('source'))
            if u.get('group') == 'routine_privileges':
                if u.get('review_artifact') != '../root/routine-acl-review.json' or u.get('review_owner') != 'root':
                    self.error('DDL_PEER_PROVENANCE', 'Routine ACL unit must reference the verified dedicated root journal', source=u.get('source'))
            else:
                if u.get('review_artifact') != 'ddl_review.json' or u.get('review_owner') != 'database':
                    self.error('DDL_OWN_PROVENANCE', 'Own DDL unit must reference the verified database journal', source=u.get('source'))
                s = u.get('source',{})
                note = own_instructions.get(f'{s.get("path")}:{s.get("start_line")}:{s.get("end_line")}',{})
                if key(note) != key(u) or note.get('instruction_body_read_in_full') is not True or note.get('coverage_level') != 'semantic':
                    self.error('DDL_MANUAL_INSTRUCTION_MISSING', 'DDL unit lacks matching whole-instruction reading in original journal', source=s)
                labels = u.get('manual_review_batches',[])
                if not labels or any(not meaningful(batches.get(b,{}).get('manual_assessment')) for b in labels):
                    self.error('DDL_BATCH_ADJUDICATION', 'DDL instruction lacks a substantive original batch assessment', source=s)
        functions = fun.get('functions', [])
        semantic = sum(f.get('coverage_level') == 'semantic' and meaningful(f.get('second_pass_review')) for f in functions)
        if len(functions) != 311 or len({f.get('identity') for f in functions}) != 311:
            self.error('SQL_FUNCTION_UNIVERSE', 'Expected 311 unique reviewed function identities')
        if semantic != 311:
            self.wait('SQL_FUNCTION_REVIEWS_PENDING', 'Function reviews lack semantic adjudication', complete=semantic)
        if fun.get('coverage_counts') != {'semantic':311,'targeted':0,'structural':0}:
            self.error('SQL_FUNCTION_COUNTS', 'Function coverage summary differs from required finite pass')
        for f in functions:
            self.sql_ref(f.get('candidate_effective_definition',{}), 'reports/database/function_review.json')
        aunits = acl.get('units', [])
        complete_acl = sum(u.get('read_status') == 'dedicated_acl_semantic_pass_completed' and u.get('coverage_level') == 'semantic' and meaningful(u.get('adjudication')) for u in aunits)
        if len(aunits) != 730 or acl.get('statement_count') != 730:
            self.error('ROUTINE_ACL_UNIVERSE', 'Expected 730 routine privilege statements')
        if complete_acl != 730 or acl.get('status') not in FINAL_STATUSES:
            self.wait('ROUTINE_ACL_PENDING', 'Dedicated routine ACL review not complete', complete=complete_acl)
        for u in aunits:
            self.sql_ref(u.get('source',{}), 'reports/root/routine-acl-review.json')
        if {key(u) for u in units if u.get('group') == 'routine_privileges'} != {key(u) for u in aunits}:
            self.error('DDL_ACL_CROSSWALK', 'DDL routine privileges differ from the dedicated ACL journal')
        if len({key(u) for u in aunits}) != 730:
            self.error('DUPLICATE_ROUTINE_ACL_UNIT','Routine ACL count includes duplicate instruction identities')
        peer = ddl.get('peer_review',{})
        if peer.get('sha256') != self.inputs['reports/root/routine-acl-review.json']['sha256']:
            self.error('DDL_ACL_REFERENCE_HASH', 'DDL completion references different routine ACL artifact')
        if acl.get('function_review_sha256') != self.inputs['reports/database/function_review.json']['sha256']:
            self.error('ACL_FUNCTION_REFERENCE_HASH', 'Routine ACL review references different function journal')
        self.result['sql'] = dict(ddl_status=ddl.get('status'), ddl_pending=ddl.get('pending_ddl_instruction_count'),
            ddl_units=len(units), functions_total=len(functions),functions_semantic=semantic,
            routine_acl_total=len(aunits),routine_acl_complete=complete_acl,
            coverage_meaning='Statement-level DDL/ACL and winning function-body review; no SQL whole-file promotion or runtime acceptance.')

    def sql_ref(self, s, artifact):
        meta = self.check_source_ref(s, artifact)
        lo, hi = s.get('start_line'), s.get('end_line')
        if not meta or type(lo) is not int or type(hi) is not int or not 1 <= lo <= hi <= meta['lines']:
            self.error('SQL_RANGE_INVALID', 'SQL instruction range lies outside source', artifact=artifact, path=s.get('path'))
        if not s.get('file_sha256') or not s.get('statement_sha256'):
            self.error('SQL_PINS_MISSING', 'SQL review needs file and statement pins', artifact=artifact, path=s.get('path'))
        elif meta:
            path = s['path']
            if path not in self.sql_statement_cache:
                self.sql_statement_cache[path] = lexical_sql_statements((self.source/path).read_text(errors='replace'))
            if (lo,hi,s['statement_sha256']) not in self.sql_statement_cache[path]:
                self.error('SQL_STATEMENT_PIN', 'Statement hash/range does not match source lexical inventory bytes', artifact=artifact, path=path, range=[lo,hi])

    def finish(self):
        # Reject artifacts changed during this snapshot. Also re-hash source to
        # avoid accepting an edit made after the first 4068-file verification.
        for name, inp in list(self.inputs.items()):
            p = self.root/name
            if not p.is_file() or digest(p.read_bytes()) != inp['sha256']:
                self.error('INPUT_CHANGED_DURING_VALIDATION', 'Artifact changed while validating; rerun after writers finish', artifact=name)
        changed_paths = []
        for name, meta in self.source_meta.items():
            p = self.source/name
            if not p.is_file() or digest(p.read_bytes()) != meta['sha256']:
                changed_paths.append(name)
        if changed_paths:
            self.error('SOURCE_CHANGED_DURING_VALIDATION', 'Source changed during audit gate', paths=changed_paths)
        try:
            if self.git('rev-parse','HEAD').decode().strip() != self.head or self.git('status','--porcelain','--untracked-files=no').strip():
                self.error('SOURCE_FINAL_STATE', 'Source HEAD or tracked working tree changed at final check')
        except (OSError,subprocess.CalledProcessError) as exc:
            self.error('SOURCE_FINAL_STATE_UNAVAILABLE',str(exc))
        self.result['status'] = 'FAILED' if self.errors else 'PENDING' if self.pending else 'COMPLETE'
        self.result['errors'] = self.errors
        self.result['pending'] = self.pending
        self.result['inputs'] = sorted(self.inputs.values(), key=lambda x:x['path'])
        self.result['generated_at'] = datetime.now(timezone.utc).isoformat()
        self.result['schema_adapters'] = {
            'journal_status': sorted(FINAL_STATUSES), 'entry_status':sorted(ENTRY_STATUSES),
            'ranges':'reviewed_ranges or ranges_read, pairs or named bounds; root tests and embedded database entries with whole_file_read=true additionally use explicit journal line_start/line_end with full-review status and adjudication.',
            'adjudication':'adjudication/assessment; database manual_adjudication wrapper; auth requires proves+mocks_and_fixtures+limits.',
            'peer_counting':'Only seven allocating owner journals contribute counts; peer reviews already integrated into owner journals are not counted again.',
        }
        self.result['limits'] = [
            'This gate validates finite documented reading, path identity, exact source pins, ranges and completion; it does not independently repeat every semantic judgment.',
            'AST containment is range containment, not proof that every branch or scenario passed; test/harness reading is not execution.',
            'No application source, shell harness, SQL, Docker, test suite, provider or prior offline probe was executed by this validator; only read-only Git metadata commands ran.',
            'SQL coverage remains per statement and winning routine body, never promoted to whole-file coverage.',
            'Only the fixed source and finite rosters are covered; deployment, live credentials, provider payloads, external schedulers and operational acceptance remain outside this gate.',
        ]
        out = self.root/'global'
        out.mkdir(parents=True,exist_ok=True)
        (out/'finite-review-completion.json').write_text(json.dumps(self.result,ensure_ascii=False,indent=2)+'\n')
        md = ['# Gate de conclusão da leitura finita',
              f'\n**Estado: {self.result["status"]}. Modo: {self.result["mode"]}.** Fonte `{self.head}`.',
              '\n| Recorte | Concluído | Universo |', '|---|---:|---:|']
        for label, key in [('Testes JS/TS','tests'),('Roster shell','shell')]:
            x = self.result.get(key,{})
            md.append(f'| {label} | {x.get("completed_files",0)} arquivos / {x.get("completed_lines",0)} linhas | {x.get("expected_files",0)} arquivos / {x.get("expected_lines",0)} linhas |')
        js = self.result.get('js_ts',{})
        md.append(f'| Corpos JS/TS sem contenção integral | {js.get("uncontained_bodies","não validado")} pendentes | 36.853 corpos; 16.652 não teste |')
        for ext,x in self.result.get('other_languages',{}).items():
            md.append(f'| Faixas integrais {ext} | {x["full_range"]} | {x["total"]} |')
        static = self.result.get('static_assets',{})
        md.append(f'| Hooks, HTML e CSS do código fonte | {static.get("full_range",0)} | {static.get("total",0)} |')
        sql = self.result.get('sql',{})
        md.extend([f'\nSQL: DDL `{sql.get("ddl_status")}`, pendentes `{sql.get("ddl_pending")}`; funções semânticas `{sql.get("functions_semantic")}/311`; ACL de rotinas `{sql.get("routine_acl_complete")}/730`. Não é cobertura integral de arquivos SQL.',
            f'\nIntegridade: `{self.result.get("integrity",{}).get("verified_blobs",0)}/4068` blobs verificados. O JSON registra hashes de {len(self.inputs)} insumos e todos os caminhos pendentes.', '\n## Pendências e inconsistências'])
        if not self.pending and not self.errors:
            md.append('\nNenhuma pendência documental ou inconsistência encontrada no escopo finito.')
        for label, entries in [('Pendência',self.pending),('Erro',self.errors)]:
            for e in entries:
                md.append(f'\n- **{label} — {e["code"]}:** {e["message"]} '+json.dumps({k:v for k,v in e.items() if k not in ('code','message')},ensure_ascii=False))
        md.extend(['\n## Limites','']+['- '+x for x in self.result['limits']])
        (out/'finite-review-completion.md').write_text('\n'.join(md)+'\n')
        print(json.dumps({k:self.result[k] for k in ('status','mode','source_head')},ensure_ascii=False))
        print(json.dumps({'errors':len(self.errors),'pending':len(self.pending),'inputs':len(self.inputs)},ensure_ascii=False))
        return 0 if not self.errors and (not self.pending or self.allow_pending) else 1

    def run(self):
        validator = self.root/'tools/validate_finite_review.py'
        if validator.is_file():
            raw = validator.read_bytes()
            self.inputs['tools/validate_finite_review.py'] = dict(path='tools/validate_finite_review.py',sha256=digest(raw),bytes=len(raw))
            if raw != Path(__file__).read_bytes():
                self.error('VALIDATOR_COPY_MISMATCH','Invoked validator differs from audit-root tool copy')
        else:
            self.error('VALIDATOR_INPUT_MISSING','Audit root must contain the invoked validator at tools/validate_finite_review.py')
        try:
            self.integrity()
            if self.head and self.source_meta:
                self.result['tests'] = self.roster('test')
                self.result['shell'] = self.roster('shell')
                self.matrices()
                self.sql()
        except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as exc:
            self.error('VALIDATOR_INPUT_EXCEPTION',f'{type(exc).__name__}: {exc}')
        return self.finish()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--audit-root',type=Path,required=True)
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--allow-pending',action='store_true')
    args = p.parse_args()
    return Gate(args.audit_root,args.source,args.allow_pending).run()


if __name__ == '__main__':
    sys.exit(main())
