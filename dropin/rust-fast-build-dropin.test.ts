import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRustFastBuild, RUST_FAST_BUILD_TEMPLATE } from "./rust-fast-build-lib-dropin.ts";

function tmpProject(cargoToml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "eidos-rust-fast-"));
  if (cargoToml !== undefined) writeFileSync(join(dir, "Cargo.toml"), cargoToml);
  return dir;
}

describe("rust-fast-build drop-in", () => {
  test("skip: no Cargo.toml (not a Rust project)", () => {
    const dir = tmpProject();
    try {
      const r = applyRustFastBuild(dir);
      expect(r.isOk()).toBe(true);
      expect(r._unsafeUnwrap()).toBe("skip");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("applied: Cargo.toml without the profile gets the template", () => {
    const dir = tmpProject('[package]\nname = "probe"\nversion = "0.1.0"\n');
    try {
      const r = applyRustFastBuild(dir);
      expect(r.isOk()).toBe(true);
      expect(r._unsafeUnwrap()).toBe("applied");
      const text = require("node:fs").readFileSync(join(dir, "Cargo.toml"), "utf8");
      expect(text).toContain("[profile.release-fast]");
      expect(text).toContain('lto = "thin"');
      expect(text).toContain("codegen-units = 8");
      expect(text).toContain(RUST_FAST_BUILD_TEMPLATE.trim());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("noop: profile already present (idempotent)", () => {
    const dir = tmpProject(
      '[package]\nname = "probe"\n\n[profile.release-fast]\ninherits = "release"\nlto = "thin"\ncodegen-units = 8\nopt-level = 2\n',
    );
    try {
      const r = applyRustFastBuild(dir);
      expect(r.isOk()).toBe(true);
      expect(r._unsafeUnwrap()).toBe("noop");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});