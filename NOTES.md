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
- **Current Local Time**: ~18:48 WITA (10:48 UTC) — **~33 hours remaining!**

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
  3. `LICENSE`: OSI-approved (MIT).
  4. `.makefun/owner.json`: `{"wallet": "HwWLNEaJojq8rxeWWFutGK5QH4NqETXo7k4Bsoz4YSeu"}`.
  5. `README.md` with official make.fun badges and format.
  6. Whole repo size <= 4 MiB (4,194,304 bytes).

## How It Is Judged
1. **The Gate (Exact Match)**:
   - Scorer compares `answers.json` against `expected.json` using canonical JSON comparison.
   - Every single generated file path and file content must match makefun-site byte-for-byte (`passed: 1`).
2. **Timing Heat (CPU Time `cpu_us`)**:
   - 1 untimed warm-up + 9 timed rounds on the scored set in a 1-CPU container.
   - Net CPU time calculated after subtracting the null-entry baseline.
   - Trimmed mean drops the 2 fastest and 2 slowest runs.
   - Must beat the house baseline (`makefun-site 1.0.0`) at 95% confidence to qualify for prizes.

## The Tie-Break Rules
1. Lowest trimmed mean CPU time (`cpu_us`) on the scored set.
2. A later entry passes an earlier one only if faster at 95% confidence.
3. Exact tie goes to **EARLIER RECEIPT TIMESTAMP**!
   -> **Critical Strategy**: Ship a verified, correct safety entry early to establish an early receipt timestamp, then push optimized iterations.

## Submission Ledger
| # | Commit SHA | Title | Time (WITA) | Status | CPU Time / Notes |
|---|------------|-------|-------------|--------|------------------|
| - | Pending | - | - | Initializing | - |
