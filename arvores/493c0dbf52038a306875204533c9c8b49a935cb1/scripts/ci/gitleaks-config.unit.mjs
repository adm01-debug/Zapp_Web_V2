import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("a allowlist do Gitleaks limita-se ao hash estrutural da FK Talk X", () => {
  const config = readFileSync(".gitleaks.toml", "utf8");
  assert.match(config, /talkx_blacklist_removed_by_fkey/u);
  assert.match(config, /\[a-f0-9\]\{32\}/u);
  assert.doesNotMatch(config, /paths\s*=/u);
  assert.doesNotMatch(config, /regexes\s*=\s*\[\s*['"]\.\*['"]/u);
});
