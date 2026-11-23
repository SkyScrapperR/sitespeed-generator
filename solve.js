// FastSite 2.0: High-performance drop-in static site generator for makefun-site 1.0.0
import { build } from './src/fast-site.js';

/** makefun-site 1.0.0 drop-in: answers exactly as reference for every case. */
export function run(input) {
  return build(input);
}
