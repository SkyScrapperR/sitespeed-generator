# NOTES: Build a Static Site Faster

## Bounty Overview
- **Competition**: `site-generator-speed-01-run-20261122`
- **Title**: Build a static site faster, 22 November 2026
- **URL**: https://make.fun/bounty/site-generator-speed-01-run-20261122
- **Pot**: $100.00 USDC on Solana (Escrowed)
- **Rewards**: Top 10 places get $10.00 USDC each.

## Deadlines & Schedule
- **Opens At**: 2026-11-22 20:00:00 UTC (2026-11-23 04:00:00 WITA)
- **Closes At (Deadline)**: **2026-11-24 20:00:00 UTC**
- **Deadline in WITA (UTC+8)**: **2026-11-25 04:00:00 WITA**
- **Target Mode**: Maximize CPU speed, thoroughly benchmark, verify byte-for-byte exact correctness, and submit when ready.

## Quotas & Limits
- **Daily Quota**: Max 10 submissions per UTC day, 20 total.
- **Attempts**: Up to 50 attempts per day.
- **Final Entry**: Most recent valid submission before deadline.

## What to Build
A faster drop-in replacement for make.fun's static site generator `makefun-site 1.0.0`:
- **Input**: `/input/cases.json` — array of `{ id: string, input: SiteInput }`.
  - `SiteInput`: `{ site: { title, base_url, per_page, recent }, templates: { name: source }, files: [{ path, content }] }`.
- **Output**: `/output/answers.json` — array of output trees in case order.
  - Each output tree is an object `{ [path: string]: string }` mapping generated file paths to exact file contents.
- **Deliverables**:
  1. `main.ts`: Entrypoint running on Node 22/24 reading `/input/cases.json` and writing `/output/answers.json`.
  2. `solve.js`: Dependency-free ES module exporting `run(input)`.
  3. `src/fast-site.js`: Fast static site generator core.
  4. `src/markdown.js`: High-performance custom Markdown engine.
  5. `LICENSE`: OSI-approved (MIT).
  6. `.makefun/owner.json`: `{"wallet": "HwWLNEaJojq8rxeWWFutGK5QH4NqETXo7k4Bsoz4YSeu"}`.
  7. `README.md` with official make.fun badges and format.
  8. Whole repo size <= 4 MiB (4,194,304 bytes).

## Architecture & Optimizations Implemented

### 1. Zero-Regex Block Lexing & Inline Markdown Engine (`src/markdown.js`)
- **Original Baseline**: 647.65 ms across 1,056 markdown sources.
- **Optimized Engine**: **117.46 ms (5.0x faster)** with 100% exact match.
- **Key Techniques**:
  - Replaced all block-level regexes (`HEADING_RE`, `HR_RE`, `FENCE_OPEN_RE`, `FENCE_CLOSE_RE`, `BULLET_RE`, `ORDERED_RE`, `CONTINUED_RE`, `BLANK_RE`) with direct character-code ASCII scanning.
  - Accelerated inline parsing with presence checks (`hasStar`, `hasTick`, `hasBracket`, `hasBackslash`), bypassing inline parsing completely for plain paragraphs.
  - Replaced char-by-char HTML escaping with `fastEscapeHtml`: test `/[&<>"']/` first, escaping whole chunks at once.
  - Replaced `findUnescaped` and `findSingleStar` full-string loops with SIMD-vectorized `s.indexOf`.
  - Streamed HTML blocks directly to output string, avoiding intermediate block array allocations and array joins.

### 2. Specialized Template Compiler (`src/fast-site.js`)
- **Original Baseline**: AST interpreter traversing tree recursively with dynamic `lookup` and scope object allocations on every variable and loop iteration.
- **Optimized Engine**: **2.29x faster template execution**.
- **Key Techniques**:
  - Compiles parsed template AST nodes into native JIT-compiled JavaScript functions (`compileTemplate`).
  - Statically specializes path access: `get1(scope, p0)`, `get2(scope, p0, p1)`, and `get3(scope, p0, p1, p2)`, eliminating runtime array allocation and array traversal.
  - Combined `textOf` and `fastEscapeHtml` into `esc(v)` to eliminate intermediate string allocations.
  - Reused root scope and precomputed post links and tag links to eliminate hundreds of scope and card object allocations during layout rendering.

### 3. Front Matter Fast Parser
- **Original Baseline**: Split entire markdown files into line arrays, sliced and rejoined thousands of body lines.
- **Optimized Engine**: Scans only the header lines up to closing `\n---` and takes `text.slice(closeStart + 4)` for body in O(1).
- Replaced frontmatter regexes with fast ASCII character scanning and Set lookup.

### 4. V8 Engine & Runtime Tuning (`main.ts`)
- `--no-incremental-marking`: Prevents incremental marking GC pauses during execution.
- `--max-semi-space-size=128`: Expands young generation semi-space to 128 MB, preventing scavenge GC cycles during short-lived string creation.

---

## Benchmark Results

| Implementation | 3 Practice Cases Time | Speedup vs Baseline | Accuracy |
|----------------|-----------------------|---------------------|----------|
| `makefun-site 1.0.0` (Baseline) | **913.68 ms** | 1.00x | 100% |
| `FastSite 2.0` (Optimized) | **225.50 ms** (Best: **206.95 ms**) | **4.05x - 4.41x faster** | **100% Exact Match** |

### Local Verification
- `program/scorer/main.ts`: `{"passed": 1, "cases_passed": 3, "cases_total": 3}` (100% exact match).
- `makefun check`: `5 passed, 0 failed, 15 skipped, 5 checked at submission`.
- `makefun grade-local`: `passed: 1`, `L1 regrade: reproduced byte for byte`, `eligible: ranked yes, prize yes`.

---

## Submission Ledger
| # | Commit SHA | Title | Time (WITA) | Status | CPU Time / Notes |
|---|------------|-------|-------------|--------|------------------|
| 1 | `b2fb4362a767` | Baseline Entry | 2026-11-23 18:50 | Committed & Pushed | 913 ms (Baseline) |
| 2 | Pending | FastSite 2.0 | 2026-11-23 23:30 | Ready to submit | 225 ms (~4.05x faster, 3/3 passed) |
