/**
 * rust-fast-build-lib-dropin.ts — apply the estate's fast Rust build profile
 * to a target Cargo.toml. Pattern-borrowed from the rhodochrosite proxy build
 * (verified live 2026-11-02: cold 6m10s, incremental 40s with mold vs the old
 * fat-LTO single-codegen-unit 2-5min lock; cc 1.2.65 -> 1.11.0 fixed the
 * sccache-wrapped cc jobserver hang).
 *
 * Capability: ensure `[profile.release-fast]` exists in a Rust project.
 * Idempotent: skips when the profile is already present. Monadic (neverthrow,
 * the scaffold default).
 *
 * Usage (as a drop-in, no wiring):
 *   import { applyRustFastBuild } from "./rust-fast-build-lib-dropin.ts";
 *   const r = await applyRustFastBuild("/path/to/project");
 *   r.match({ ok: (s) => console.log(s), err: (e) => console.error(e.message) });
 */
import { err, ok, type Result } from "neverthrow";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The committed template = the verified rhodochrosite proxy fast profile. */
export const RUST_FAST_BUILD_TEMPLATE = `# eidos rust-fast-build drop-in — estate fast-iteration profile (verified 2026-11-02).
# Thin LTO + 8 codegen units + opt-level=2: the iteration loop (~40s incremental
# with mold) instead of the fat-LTO single-unit 2-5min lock. The final deploy
# binary stays under [profile.release]; release-fast is for daily loops.
[profile.release-fast]
inherits = "release"
lto = "thin"
codegen-units = 8
opt-level = 2
`;

/**
 * Append the release-fast profile to <dir>/Cargo.toml if absent.
 * - No Cargo.toml -> Ok("skip") (not a Rust project; callers decide).
 * - Profile already present -> Ok("noop") (idempotent).
 * - Otherwise appends and returns Ok("applied").
 */
export function applyRustFastBuild(dir: string): Result<"skip" | "noop" | "applied", Error> {
  const cargoPath = join(dir, "Cargo.toml");
  if (!existsSync(cargoPath)) return ok("skip");
  let text: string;
  try {
    text = readFileSync(cargoPath, "utf8");
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
  if (text.includes("[profile.release-fast]")) return ok("noop");
  // Append at the end; the profile block is top-level (never inside a package).
  const updated = `${text.replace(/\s*$/, "\n")}\n${RUST_FAST_BUILD_TEMPLATE}`;
  try {
    writeFileSync(cargoPath, updated);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
  return ok("applied");
}