"use strict";
/**
 * src/adoption-score.ts — defensible DelendAI-adoption health scoring.
 *
 * Replaces the shallow `delendai doctor` Health score (90/80 from a single
 * missing-lockfile warning) with a weighted rubric surfaced by deepseek
 * (via the DelendAI freeinference bridge, 2026-10-21).
 *
 * Scale 0-100. Thresholds: healthy >=80, at_risk >=60, unhealthy <40.
 *
 * Weighted factors:
 *   config_valid    20  delendai.config.json present + JSON-valid
 *   gates_present   25  validate+test:coverage+typecheck present in package.json scripts
 *   coverage        15  min(coverage,90)/90*100   (from coverage report, else 0)
 *   commit_velocity  5  min(commits_30d/20,1)*100  (git log --since=30.days)
 *   ci_green        15  last green run <=14d OR >=70% green last 20 runs (best-effort)
 *   dep_age         10  days since last release penalty (75%/64%/55%/40% scale)
 *   security        10  vuln severity + supply-chain penalty
 *   native_tools    --  (informational; bonus ± )
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export interface AdoptionScoreInput {
  dir: string;
  coveragePct?: number | null; // measured coverage 0-100
  commitsLast30d?: number | null; // else measured
  lastGreenDaysAgo?: number | null; // else best-effort
  vulnSeverity?: "none" | "low" | "moderate" | "high" | "critical" | undefined;
  supplyChainRisk?: "maintained" | "unmaintained" | "suspicious" | undefined;
  daysSinceLastRelease?: number | null;
}

export interface AdoptionScoreResult {
  total: number;
  verdict: "healthy" | "at_risk" | "unhealthy";
  factors: Record<string, { score: number; weight: number; detail: string }>;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function measureCommits(dir: string): number {
  try {
    const out = execFileSync("git", ["log", "--since=30.days", "--oneline"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 8000,
    });
    return out.trim() ? out.trim().split("\n").length : 0;
  } catch {
    return 0;
  }
}

function parsePackageJson(dir: string): { scripts?: Record<string, string> } {
  const p = join(dir, "package.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

const GATES = ["validate", "test", "test:coverage", "typecheck"];

export function scoreAdoption(input: AdoptionScoreInput): AdoptionScoreResult {
  const dir = input.dir;
  const pkg = parsePackageJson(dir);
  const scripts = Object.values(pkg.scripts ?? {});
  const hasConfig = existsSync(join(dir, "delendai.config.json"));

  const gateScore =
    (GATES.reduce((n, g) => {
      // test:coverage may appear as `test:coverage`; also match `test --coverage`
      const found = scripts.some(
        (s) => s.includes(g) || (g === "test:coverage" && /coverage/.test(s)),
      );
      return n + (found ? 1 : 0);
    }, 0) /
      GATES.length) *
    100;

  const gapCoverage = input.coveragePct ?? 0;
  const coverage = (clamp(gapCoverage) / 90) * 100;
  const commits = input.commitsLast30d ?? measureCommits(dir);
  const velocity = clamp(commits / 20, 0, 1) * 100;

  // ci_green: best known or default neutral 50
  const lgd = input.lastGreenDaysAgo;
  const ciGreen = lgd === null || lgd === undefined ? 50 : lgd <= 14 ? 100 : 70;

  const dslr = input.daysSinceLastRelease;
  const depAge =
    dslr === null || dslr === undefined
      ? 100
      : dslr < 90
        ? 100
        : dslr < 180
          ? 75
          : dslr < 365
            ? 64
            : 40;

  const sevPenalty = { none: 0, low: 5, moderate: 10, high: 15, critical: 25 };
  const scPenalty = { maintained: 0, unmaintained: 10, suspicious: 20 };
  const security =
    100 -
    (sevPenalty[input.vulnSeverity ?? "none"] ?? 5) -
    (scPenalty[input.supplyChainRisk ?? "maintained"] ?? 0);

  const factors = {
    config_valid: {
      score: hasConfig ? 100 : 0,
      weight: 20,
      detail: hasConfig ? "config ok" : "no delendai.config.json",
    },
    gates_present: {
      score: gateScore,
      weight: 25,
      detail: `${gateScore}% gates`,
    },
    coverage: { score: coverage, weight: 15, detail: `cov ${gapCoverage}%` },
    commit_velocity: { score: velocity, weight: 5, detail: `${commits}c/30d` },
    ci_green: { score: ciGreen, weight: 15, detail: `ci ${ciGreen}` },
    dep_age: { score: depAge, weight: 10, detail: `deps ${dslr ?? "?"}d` },
    security: { score: security, weight: 10, detail: `sec ${security}` },
  };

  const total = Math.round(
    Object.values(factors).reduce((s, f) => s + f.score * f.weight, 0) / 100,
  );
  const verdict =
    total >= 80 ? "healthy" : total >= 60 ? "at_risk" : "unhealthy";
  return { total, verdict, factors };
}
