import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { run } from './solve.js';

const casesPath = 'C:/lomba/sitespeed-generator-kit/site-generator-speed-01-run-20261122-kit/practice/input/cases.json';
const expectedPath = 'C:/lomba/sitespeed-generator-kit/site-generator-speed-01-run-20261122-kit/practice/reference/expected.json';

const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const expectedData = JSON.parse(readFileSync(expectedPath, 'utf8'));
const expectedOutputs = expectedData.cases.map(c => c.output);

console.log(`Loaded ${cases.length} cases.`);

// Warmup
console.log('Warmup...');
for (let i = 0; i < cases.length; i++) {
  run(cases[i].input);
}

// Verification
console.log('Verifying correctness...');
let allMatched = true;
for (let i = 0; i < cases.length; i++) {
  const ans = run(cases[i].input);
  const exp = expectedOutputs[i];
  const ansKeys = Object.keys(ans).sort();
  const expKeys = Object.keys(exp).sort();
  if (ansKeys.length !== expKeys.length) {
    console.error(`Case ${i} key count mismatch: got ${ansKeys.length}, expected ${expKeys.length}`);
    allMatched = false;
    break;
  }
  for (const k of expKeys) {
    if (ans[k] !== exp[k]) {
      console.error(`Case ${i} mismatch at key: ${k}`);
      console.error(`Expected (len ${exp[k]?.length}):\n${exp[k]?.slice(0, 300)}`);
      console.error(`Got (len ${ans[k]?.length}):\n${ans[k]?.slice(0, 300)}`);
      allMatched = false;
      break;
    }
  }
  if (!allMatched) break;
}

if (!allMatched) {
  console.error('VERIFICATION FAILED!');
  process.exit(1);
}
console.log('VERIFICATION PASSED: 100% exact match across all cases!');

// Timing over multiple runs
const RUNS = 5;
console.log(`\nBenchmarking over ${RUNS} iterations...`);
const times = [];
for (let r = 0; r < RUNS; r++) {
  const start = performance.now();
  for (let i = 0; i < cases.length; i++) {
    run(cases[i].input);
  }
  const end = performance.now();
  times.push(end - start);
  console.log(`Run ${r + 1}: ${(end - start).toFixed(2)} ms`);
}

const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`\nAverage time for all 3 cases: ${avg.toFixed(2)} ms`);
