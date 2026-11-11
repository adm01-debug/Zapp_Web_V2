"""Regressões offline do gerador de regras; não acessam banco nem APIs de LLM."""
from __future__ import annotations

import importlib.util
import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).with_name("generate.py")
SPEC = importlib.util.spec_from_file_location("context_rules_generate", SCRIPT)
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


class CurrentSqlSourcesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="context-rules-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.files = []

    def write(self, name, content):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding="utf-8")
        self.files.append(file)
        return file

    def schema(self):
        return generator.parse_sql_schema(self.root, self.files)

    def test_foreign_migration_cannot_replace_current_table(self):
        current = "supabase/migrations/20260101000000_orders.sql"
        self.write(current, "CREATE TABLE public.orders (id uuid, created_at timestamptz);")
        self.write("supabase/migrations/_foreign/another-project/20250101000000_orders.sql",
                   "CREATE TABLE public.orders (id uuid, changed_at timestamptz);")
        schema = self.schema()
        self.assertEqual([c["name"] for c in schema["tables"]["orders"]["columns"]], ["id", "created_at"])
        self.assertEqual(schema["tables"]["orders"]["src"], current)
        self.assertEqual(schema["sources"], [current])

    def test_superseded_migration_cannot_undo_current_changes(self):
        self.write("supabase/migrations/20260101000000_orders.sql", "CREATE TABLE public.orders (id uuid);")
        self.write("supabase/migrations/20260102000000_status.sql", "ALTER TABLE public.orders ADD COLUMN status text;")
        self.write("supabase/migrations/_superseded/20250101000000_orders.sql", "DROP TABLE public.orders;")
        schema = self.schema()
        self.assertIn("orders", schema["tables"])
        self.assertEqual([c["name"] for c in schema["tables"]["orders"]["columns"]], ["id", "status"])
        self.assertEqual(len(schema["sources"]), 2)

    def test_archived_objects_do_not_contribute_to_schema_or_rules(self):
        sql = """
CREATE TYPE order_state AS ENUM ('open', 'done');
CREATE TABLE public.orders (id uuid PRIMARY KEY, status order_state DEFAULT 'open', amount numeric CHECK (amount >= 0));
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (true);
CREATE FUNCTION public.ensure_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'amount cannot be negative';
  RETURN NEW;
END;
$$;
CREATE TRIGGER ensure_order_before BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.ensure_order();
CREATE INDEX orders_status ON public.orders (status);
CREATE VIEW public.open_orders AS SELECT * FROM public.orders;
GRANT SELECT ON public.orders TO authenticated;
COMMENT ON TABLE public.orders IS 'Current orders';
SELECT cron.schedule('daily_orders', '0 0 * * *', $$SELECT 1$$);
"""
        self.write("supabase/migrations/20260101000000_orders.sql", sql)
        self.write("supabase/seed.sql", "INSERT INTO public.orders (id) VALUES ('current');")
        expected = self.schema()
        for key in ("tables", "policies", "triggers", "functions", "enums", "indexes", "cron_jobs",
                    "views", "rls", "grants", "raises", "seed", "comments"):
            self.assertTrue(expected[key], key)
        self.write("supabase/migrations/_foreign/old-project/20240101000000_schema.sql",
                   sql.replace("orders", "foreign_orders").replace("order_state", "foreign_state").replace("ensure_order", "ensure_foreign"))
        self.write("supabase/migrations/_superseded/20240102000000_seed.sql", "INSERT INTO public.orders (id) VALUES ('historical');")
        self.assertEqual(self.schema(), expected)

    def test_archive_only_repository_has_no_current_sql_schema(self):
        self.write("db/migrations/_foreign/old.sql", "CREATE TABLE old_foreign (id uuid);")
        self.write("db/migrations/_superseded/old.sql", "CREATE TABLE old_superseded (id uuid);")
        schema = self.schema()
        self.assertEqual(schema["sources"], [])
        self.assertEqual(schema["tables"], {})

    def test_exact_directory_names_leave_other_sql_sources_visible(self):
        # O nome de um diretório acima da raiz do repo não muda seu significado.
        self.root = self.root / "_foreign" / "project"
        paths = [
            "supabase/migrations/_foreign.sql",
            "supabase/migrations/_superseded.sql",
            "supabase/migrations/customer_foreign/active.sql",
            "supabase/migrations/_superseded_backup/active.sql",
            "packages/store/prisma/migrations/20260101/active.sql",
            "db/current.sql",
            "sql/current.sql",
            "database/current.sql",
            "prisma/current.sql",
            "custom/schema.sql",
        ]
        for index, name in enumerate(paths):
            self.write(name, f"CREATE TABLE current_{index} (id uuid);")
        schema = self.schema()
        self.assertEqual(schema["sources"], sorted(paths))
        self.assertEqual(set(schema["tables"]), {f"current_{i}" for i in range(len(paths))})

    def test_current_prisma_and_types_fallback_remain_available(self):
        self.write("prisma/schema.prisma", "model Store {\n id String @id\n}\n")
        self.write("src/database.types.ts", """
export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string
        }
      }
    }
  }
}
""")
        schema = self.schema()
        self.assertEqual(set(schema["tables"]), {"Store", "customers"})
        self.assertEqual(schema["tables"]["Store"]["origin"], "prisma")
        self.assertEqual(schema["tables"]["customers"]["origin"], "types.ts")

    def test_archived_sql_is_not_current_code_but_remains_in_file_inventory(self):
        current = self.write("supabase/migrations/20260101000000_retention.sql", "SELECT now() - interval '7 days';")
        archived = self.write("supabase/migrations/_superseded/20250101000000_retention.sql", "SELECT now() - interval '365 days';")
        self.assertTrue(generator.analyze_code_file(current, self.root)["temporal"])
        self.assertIsNone(generator.analyze_code_file(archived, self.root))
        files = generator.walk_repo(self.root, self.root / "output")
        self.assertEqual(set(files), {current, archived})

    def test_cli_rules_profile_uses_current_schema_and_temporal_rules(self):
        current = "supabase/migrations/20260101000000_orders.sql"
        archived = "supabase/migrations/_superseded/20250101000000_orders.sql"
        self.write(current, "CREATE TABLE public.orders (id uuid, created_at timestamptz);\nSELECT now() - interval '7 days';")
        self.write(archived, "CREATE TABLE public.orders (id uuid, historical_status text);\nSELECT now() - interval '365 days';")
        subprocess.run([sys.executable, str(SCRIPT), "--repo", str(self.root), "--out", "output",
                        "--profile", "regras", "--no-pointer"], check=True, capture_output=True, text=True, timeout=30)
        context = json.loads((self.root / "output/context.json").read_text(encoding="utf-8"))
        self.assertEqual(context["schema"]["sources"], [current])
        self.assertEqual([c["name"] for c in context["schema"]["tables"]["orders"]["columns"]], ["id", "created_at"])
        self.assertEqual(context["rules"]["temporal"], [{"file": current, "line": "SELECT now() - interval '7 days';"}])
        self.assertIn(current, context["code_files"])
        self.assertNotIn(archived, context["code_files"])
        self.assertEqual(context["meta"]["files_total"], 2)
        rendered = (self.root / "output/07-REGRAS-DE-NEGOCIO.md").read_text(encoding="utf-8")
        self.assertIn("7 days", rendered)
        self.assertNotIn("365 days", rendered)
        self.assertNotIn("historical_status", rendered)
        self.assertFalse((self.root / "AGENTS.md").exists())


class ModuleKeyTests(unittest.TestCase):
    def test_monorepo_package_root_file_joins_its_package_module(self):
        # Arquivo direto na raiz do pacote (ex.: packages/ui/index.ts) tem só 3 segmentos
        # (pacote/arquivo, sem subpasta) e precisa cair no módulo "packages/ui" — não virar
        # seu próprio módulo com o path completo (fragmenta 03-MODULOS.md em 1 módulo por arquivo).
        self.assertEqual(generator.module_key("packages/ui/index.ts"), "packages/ui")
        self.assertEqual(generator.module_key("apps/web/main.ts"), "apps/web")
        # Com subpasta real, o agrupamento fica por subpasta (comportamento existente preservado).
        self.assertEqual(generator.module_key("packages/ui/src/Button.tsx"), "packages/ui/src")


class CacheValidityTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="context-rules-cache-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "src").mkdir()
        (self.root / "src/main.ts").write_text("export const total = 20;\n", encoding="utf-8")
        (self.root / "package.json").write_text('{"name":"fixture"}', encoding="utf-8")
        self.out = self.root / "output"

    def run_generator(self, *args, **git_overrides):
        git = {"sha": "a" * 40, "branch": "main", "remote": "", "commits": [], "hot_files": []} | git_overrides
        with mock.patch.object(sys, "argv", [str(SCRIPT), "--repo", str(self.root), "--out", "output", *args]), \
                mock.patch.object(generator, "git_info", return_value=git), \
                mock.patch.object(generator, "llm_synthesis", return_value="Síntese offline"), \
                contextlib.redirect_stderr(io.StringIO()):
            return generator.main()

    def files(self):
        return {p.relative_to(self.root).as_posix(): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}

    def test_profile_transitions_check_force_and_manual_preservation(self):
        manual = self.out / "manual/regras.md"
        manual.parent.mkdir(parents=True)
        manual.write_text("# Regra humana\nO limite é 20.\n", encoding="utf-8")
        for source in ("full", "codigo", "regras"):
            for target in ("full", "codigo", "regras"):
                for mode in ("normal", "check", "force"):
                    with self.subTest(source=source, target=target, mode=mode):
                        self.assertEqual(self.run_generator("--no-pointer", "--profile", source), 0)
                        before = self.files()
                        flags = [] if mode == "normal" else ["--" + mode]
                        self.assertEqual(self.run_generator("--no-pointer", "--profile", target, *flags),
                                         int(mode == "check" and source != target))
                        expected = source if mode == "check" else target
                        manifest = json.loads((self.out / "manifest.json").read_text(encoding="utf-8"))
                        self.assertEqual(manifest["perfil"], expected)
                        self.assertEqual(manual.read_text(encoding="utf-8"), "# Regra humana\nO limite é 20.\n")
                        self.assertEqual({p.name for p in self.out.glob("*.md")},
                                         generator.PROFILES.get(expected, generator.PROFILES["codigo"] | generator.PROFILES["regras"]))
                        if mode == "check":
                            self.assertEqual(self.files(), before)

    def test_invalid_or_legacy_state_is_stale_and_recovers(self):
        for value in ([], None, "texto", 1, True, {}, "truncated", "legacy"):
            with self.subTest(value=value):
                self.run_generator("--no-pointer")
                state = self.out / ".state.json"
                if value == "legacy":
                    old = json.loads(state.read_text(encoding="utf-8"))
                    for key in ("render_hash", "artifacts", "pointers"):
                        old.pop(key)
                    state.write_text(json.dumps(old), encoding="utf-8")
                else:
                    state.write_text("{" if value == "truncated" else json.dumps(value), encoding="utf-8")
                before = self.files()
                self.assertEqual(self.run_generator("--no-pointer", "--check"), 1)
                self.assertEqual(self.files(), before)
                self.assertEqual(self.run_generator("--no-pointer"), 0)
                self.assertEqual(self.run_generator("--no-pointer", "--check"), 0)

    def test_missing_modified_or_invalid_utf8_outputs_are_repaired(self):
        for profile in ("full", "codigo", "regras"):
            for name in ("manifest.json", "context.json", "07-REGRAS-DE-NEGOCIO.md" if profile == "regras" else "00-INDEX.md"):
                for damage in ("missing", "modified", "invalid_utf8"):
                    with self.subTest(profile=profile, name=name, damage=damage):
                        flags = ("--no-pointer", "--profile", profile)
                        self.assertEqual(self.run_generator(*flags), 0)
                        p = self.out / name
                        if damage == "missing":
                            p.unlink()
                        else:
                            p.write_bytes(b"alterado" if damage == "modified" else b"\xff")
                        before = self.files()
                        self.assertEqual(self.run_generator(*flags, "--check"), 1)
                        self.assertEqual(self.files(), before)
                        self.assertEqual(self.run_generator(*flags), 0)
                        p.read_text(encoding="utf-8")
                        if p.suffix == ".json":
                            json.loads(p.read_text(encoding="utf-8"))
                        self.assertEqual(self.run_generator(*flags, "--check"), 0)

    def test_render_options_and_git_changes_invalidate_cache(self):
        for option in (("--schema-snapshot", "snapshot"), ("--index-path", "outro/INDEX.md"),
                       ("--model", "outro-modelo"), ("--llm",)):
            with self.subTest(option=option):
                self.run_generator("--no-pointer")
                self.assertEqual(self.run_generator("--no-pointer", *option, "--check"), 1)
                self.assertEqual(self.run_generator("--no-pointer", *option), 0)
                self.assertEqual(self.run_generator("--no-pointer", *option, "--check"), 0)
        self.run_generator("--no-pointer")
        self.assertEqual(self.run_generator("--no-pointer", "--check", sha="b" * 40), 1)
        self.run_generator("--no-pointer", sha="b" * 40)
        self.assertEqual(self.run_generator("--no-pointer", "--check", sha="b" * 40), 0)
        self.assertEqual(self.run_generator("--no-pointer", "--check", sha="b" * 40, branch="outra"), 1)

    def test_snapshot_appearance_contents_and_removal_invalidate_cache(self):
        self.run_generator("--no-pointer")
        snap = self.root / "docs/supabase"
        snap.mkdir(parents=True)
        for change in (lambda: None,
                       lambda: (snap / "manifest.json").write_text('{"gerado_em":"2026-11-10T00:00:00Z"}'),
                       lambda: (snap / "README.md").write_text("# Snapshot"),
                       lambda: (snap / "README.md").unlink(),
                       lambda: (snap / "manifest.json").unlink(),
                       lambda: snap.rmdir()):
            change()
            self.assertEqual(self.run_generator("--no-pointer", "--check"), 1)
            self.run_generator("--no-pointer")
            self.assertEqual(self.run_generator("--no-pointer", "--check"), 0)

    def test_pointer_options_and_deleted_pointer_recover_without_touching_manual(self):
        self.run_generator("--no-pointer")
        self.assertEqual(self.run_generator("--check"), 1)
        self.run_generator()
        self.assertIn("output/00-INDEX.md", (self.root / "AGENTS.md").read_text(encoding="utf-8"))
        self.run_generator()
        self.assertEqual(self.run_generator("--check"), 0)
        self.assertEqual(self.run_generator("--index-path", "contexto/00-INDEX.md", "--check"), 1)
        self.run_generator("--index-path", "contexto/00-INDEX.md")
        self.assertIn("contexto/00-INDEX.md", (self.root / "AGENTS.md").read_text(encoding="utf-8"))
        (self.root / "AGENTS.md").unlink()
        (self.root / "CLAUDE.md").unlink()
        self.assertEqual(self.run_generator("--index-path", "contexto/00-INDEX.md", "--check"), 1)
        self.run_generator("--index-path", "contexto/00-INDEX.md")
        self.assertTrue((self.root / "AGENTS.md").is_file())
        self.assertEqual(self.run_generator("--no-pointer", "--check"), 1)

    def test_unchanged_cache_performs_no_writes_and_force_regenerates(self):
        self.run_generator("--no-pointer")
        before = self.files()
        stamp = (self.out / ".state.json").stat().st_mtime_ns
        self.assertEqual(self.run_generator("--no-pointer"), 0)
        self.assertEqual(self.files(), before)
        self.assertEqual((self.out / ".state.json").stat().st_mtime_ns, stamp)
        self.run_generator("--no-pointer", "--force")
        self.assertGreater((self.out / ".state.json").stat().st_mtime_ns, stamp)

    def test_real_cli_tracks_document_tree_and_code_metadata_without_new_commit(self):
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True, capture_output=True)
        subprocess.run(["git", "add", "."], cwd=self.root, check=True, capture_output=True)
        subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                        "commit", "-qm", "fixture"], cwd=self.root, check=True, capture_output=True)
        doc = self.root / "docs/ARCHITECTURE.md"
        doc.parent.mkdir()
        doc.write_text("# Arquitetura\nMarcador inicial.\n", encoding="utf-8")
        cmd = [sys.executable, str(SCRIPT), "--repo", str(self.root), "--out", "output", "--no-pointer"]

        def run(*args):
            return subprocess.run([*cmd, *args], capture_output=True, text=True, timeout=30).returncode

        for kind in ("doc", "tree", "code"):
            for variant in range(8):
                with self.subTest(kind=kind, variant=variant):
                    self.assertEqual(run(), 0)
                    if kind == "doc":
                        doc.write_text(f"# Arquitetura\nNOVO MARCADOR {variant}.\n", encoding="utf-8")
                    elif kind == "tree":
                        folder = self.root / f"data{variant}"
                        folder.mkdir()
                        (folder / "item.txt").write_text("item", encoding="utf-8")
                    else:
                        (self.root / "src/main.ts").write_text("export const total = 20;\n" + "\n" * (variant + 1), encoding="utf-8")
                    before = self.files()
                    self.assertEqual(run("--check"), 1)
                    self.assertEqual(self.files(), before)
                    self.assertEqual(run(), 0)
                    self.assertEqual(run("--check"), 0)
                    if kind == "doc":
                        self.assertIn(f"NOVO MARCADOR {variant}", (self.out / "01-VISAO-GERAL.md").read_text(encoding="utf-8"))
                    elif kind == "tree":
                        self.assertIn(f"data{variant}/", (self.out / "02-ARQUITETURA.md").read_text(encoding="utf-8"))

    def test_real_cli_second_run_is_idempotent_for_all_profiles_and_pointer_states(self):
        for profile in ("full", "codigo", "regras"):
            for pointers in ((), ("CLAUDE.md",), ("AGENTS.md",), ("CLAUDE.md", "AGENTS.md")):
                for disabled in (False, True):
                    with self.subTest(profile=profile, pointers=pointers, disabled=disabled), \
                            tempfile.TemporaryDirectory(prefix="rules-pointer-cli-") as tmp:
                        root = Path(tmp)
                        (root / "src").mkdir()
                        (root / "src/main.ts").write_text("export const total = 20;\n", encoding="utf-8")
                        for name in pointers:
                            (root / name).write_text("# Instruções humanas\nPreservar conteúdo humano.\n", encoding="utf-8")
                        subprocess.run(["git", "init", "-q"], cwd=root, check=True, capture_output=True)
                        subprocess.run(["git", "add", "."], cwd=root, check=True, capture_output=True)
                        subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                                        "commit", "-qm", "fixture"], cwd=root, check=True, capture_output=True)
                        cmd = [sys.executable, str(SCRIPT), "--repo", str(root), "--out", "output", "--profile", profile]
                        if disabled:
                            cmd.append("--no-pointer")

                        def files():
                            return {p.relative_to(root).as_posix(): (p.read_bytes(), p.stat().st_mtime_ns)
                                    for p in root.rglob("*") if p.is_file() and ".git" not in p.relative_to(root).parts}

                        before = files()
                        self.assertEqual(subprocess.run([*cmd, "--check"], capture_output=True, timeout=30).returncode, 1)
                        self.assertEqual(files(), before)
                        self.assertEqual(subprocess.run(cmd, capture_output=True, timeout=30).returncode, 0)
                        before = files()
                        self.assertEqual(subprocess.run(cmd, capture_output=True, timeout=30).returncode, 0)
                        self.assertEqual(files(), before)
                        self.assertEqual(subprocess.run([*cmd, "--check"], capture_output=True, timeout=30).returncode, 0)
                        self.assertEqual(files(), before)
                        for name in pointers:
                            self.assertIn("Preservar conteúdo humano.", (root / name).read_text(encoding="utf-8"))

    def test_llm_cache_reuses_only_the_same_facts_and_model(self):
        def response(request, timeout):
            model = json.loads(request.data)["model"]
            return contextlib.closing(io.BytesIO(json.dumps({"content": [{"text": model}]}).encode()))

        for initial in ("model-a", "model-b", "model-c"):
            for target in (initial, "model-d", "model-e", "model-f"):
                for changed in (False, True):
                    with self.subTest(initial=initial, target=target, changed=changed), \
                            tempfile.TemporaryDirectory(prefix="rules-llm-cache-") as tmp, \
                            mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "fixture-no-network"}), \
                            mock.patch.object(generator.urllib.request, "urlopen", side_effect=response) as request:
                        self.assertEqual(generator.llm_synthesis({"v": 1}, Path(tmp), initial), initial)
                        self.assertEqual(generator.llm_synthesis({"v": 2 if changed else 1}, Path(tmp), target), target)
                        self.assertEqual(request.call_count, 1 if target == initial and not changed else 2)


if __name__ == "__main__":
    unittest.main()
