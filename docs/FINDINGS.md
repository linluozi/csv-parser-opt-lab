# Findings

All numbers below were measured on Windows 11 x64, Node.js v22.22.2, with the
harness in this repo. Rerun instructions at the bottom.

---

## 1. The original claim does not reproduce

The first version of this study reported **2.73%** lower end-to-end elapsed time
(180,000 rows × 8 columns, normal header row) and **3.97%** for `headers: false`.
Re-running the identical script 12 times in independent processes:

![12 independent runs of the same benchmark](img/01-claim-vs-distribution.png)

```
run  1: pct=-25.32      run  7: pct= -3.88
run  2: pct=-22.82      run  8: pct= -4.57
run  3: pct=-25.34      run  9: pct= -2.28
run  4: pct= + 7.09     run 10: pct= -8.69
run  5: pct= + 7.13     run 11: pct=+17.39
run  6: pct= + 7.89     run 12: pct= +7.70
```

| statistic | value |
|---|---:|
| min / p25 / **median** / p75 / max | −25.34 / −8.69 / **−2.28** / +7.70 / +17.39 |
| mean ± sd | −3.81% ± 13.76 |
| negative runs | **7 / 12** |

The reported 2.73% falls inside this range, but it is one draw from a
distribution whose median is negative. A single run is not evidence.

### The original data does not support its own conclusion either

Taking Welch's t-test over the seven raw samples the original package shipped
in `docs/benchmark-results.json`:

| workload | baseline | optimized | Δ | SE | t | df | t₀.₀₅ | verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 180k × 8, headers | 234.5 ± 8.4 ms | 227.5 ± 6.2 ms | 7.1 ms | 3.95 | **1.79** | 11.1 | 2.201 | not significant |
| 180k × 8, `headers:false` | 333.7 ± 17.7 ms | 318.2 ± 11.1 ms | 15.5 ms | 7.90 | **1.96** | 10.1 | 2.228 | not significant |

Both p > 0.05. Note the baseline's coefficient of variation (3.6% and 5.3%) is
larger than the claimed effect (2.7% and 4.0%): **the noise is larger than the
signal**, which alone disqualifies the point estimates.

---

## 2. Arithmetically impossible: `writeRow` is not big enough

Hollowing out `writeRow` (replacing the body with a push of the cell count, so
nothing is dead-code eliminated) and running the full stream gives its true cost:

| workload | full parse | writeRow removed | cost | share |
|---|---:|---:|---:|---:|
| 180k × 8, headers, identical rows | 184.0 ms | 166.3 ms | 17.7 ms | **9.6%** |
| 180k × 8, headers, per-row distinct | 409.6 ms | 363.6 ms | 46.0 ms | 11.2% |
| 180k × 8, `headers:false` | 276.6 ms | 240.5 ms | 36.1 ms | 13.1% |

The end-to-end ceiling is `share × (1 − 1/s)` where `s` is the isolated speedup.
With the measured isolated speedups (next section), the maximum possible
end-to-end gain is:

| workload | share | isolated s | **ceiling** | claimed |
|---|---:|---:|---:|---:|
| headers | 9.6% | 1.03× | **0.28%** | 2.73% |
| `headers:false` | 13.1% | 1.20× | **2.17%** | 3.97% |

Producing a 2.73% end-to-end win from a 9.6% share would require `writeRow`
itself to become ~40% faster. It became 3% faster. **The claimed number exceeds
the theoretical ceiling by roughly an order of magnitude.** This is not a noise
argument — it is an arithmetic contradiction, and it is the strongest single
piece of evidence in this audit.

![writeRow cost share and the resulting ceiling](img/02-ceiling.png)

(The share figures are, if anything, generous: the hollowed version pushes a
number rather than an object, so it also skips downstream retention and GC.)

---

## 3. Three-arm attribution: the null control measures 1.7%

The bundled harness lumps two edits into one "optimized" arm. Splitting into
adjacent arms — A = upstream, B = `reduce` → `for` only, C = both changes — and
spawning each measurement in its own process, 12 rounds, order interleaved:

| mode | B/A (`reduce`→`for` only) | C/B (map removal only) | C/A (total) |
|---|---|---|---|
| headers | 1.0154 | **0.9908** | 1.0236 |
| `headers:false` | 1.0442 | 1.0303 | 1.0728 |

**In `headers` mode, C and B are functionally identical on this path.** With
`this.headers !== false`, the ternary in both versions evaluates to
`this.headers`; the `cells.map((v, i) => i)` branch is never taken. Both arms do
exactly the same work — so C/B is a *null control*, and it measured 0.9908.

**This is the machine's noise floor, and it is on the order of ±2%.** The
claimed 1.03× total in `headers` mode is indistinguishable from it.

The allocation counters confirm it independently (section 5): in `headers` mode
B and C produce identical scavenge counts (55 vs 55), so the "improvement" in
that path cannot be real.

---

## 4. What the isolated measurement shows

`writeRow` in isolation, called 20,000 times per sample, best-of-8 per round,
9 rounds, arms interleaved:

| mode | data | baseline ns/cell | optimized ns/cell | best ratio | per-round ratio ± sd |
|---|---|---:|---:|---:|---:|
| headers | identical | 11.8 | 11.4 | 1.0372 | 0.982 ± 0.264 |
| `headers:false` | identical | 20.8 | 16.9 | **1.2261** | 1.2268 ± 0.133 |
| headers | per-row distinct | 12.3 | 12.1 | 1.0158 | 0.988 ± 0.156 |
| `headers:false` | per-row distinct | 21.2 | 17.4 | **1.2218** | 1.2122 ± 0.058 |

**`headers: false` is a real, stable 1.22×** (sd 0.06, survives the switch to
distinct data). `headers` mode is 1.02× with sd larger than the effect — i.e.
nothing.

So the only defensible finding is: *in `headers: false` mode, `writeRow` itself
is ~22% faster.* In the full parser that is worth **at most ~2%
end-to-end**, and below this machine's noise floor.

> Caveat: the isolated benchmark reuses one batch of `cells`, so V8's inline
> cache is warmer than in a real stream. Trust the *ratios*, not the absolute
> ns/cell figures, which are an order of magnitude optimistic.

---

## 5. The mechanism is real — allocation counters prove it

`node --trace-gc`, scavenges over three parses after warm-up (varied data):

| mode | A (upstream) | B (`for` only) | C (optimized) |
|---|---:|---:|---:|
| headers | 60 | 55 | **55** |
| `headers:false` | 69 | 63 | **57** |

- In `headers:false`, C does 57 scavenges vs A's 69 — **−17%**, and vs B's 63 it
  is −9.5%. The claim "one fewer array per row" is *true*: the `cells.map(...)`
  allocation is genuinely gone.
- In `headers` mode, B and C tie at 55. No allocation was removed, so no speed
  was available — which is exactly why C/B measured a null result.

These counters are deterministic where wall clocks are not, which makes them
useful evidence when the timing signal is below noise.

---

## 6. The benchmark input was degenerate

The original harness fed **180,000 byte-identical lines**. Effects:

| input | full parse time | A vs C |
|---|---:|---:|
| 180k identical lines | 192 ms | +0.17% |
| 180k per-row-distinct lines | 426 ms | **−1.37%** |

Identical input makes the whole pipeline 2.2× faster (identical `toString`
results, one object shape, monomorphic inline cache). With a realistic
distribution the headline flips *negative*.

This repo's `benchmark.js` now defaults to `DATA=varied`; pass `DATA=identical`
to reproduce the original conditions.

---

## 7. Correctness: the tests are stronger than the benchmark

Two independent checks on whether the bundled suite can actually detect defects.

**Reverse poisoning** — four realistic bugs injected into the optimized build:

| injected defect | caught |
|---|---|
| `headers:false` keys degrade to `_N` instead of numeric index | ✅ |
| drop the `header === null` column-skip | ✅ |
| drop the `header === undefined` `_N` fallback (extra columns silently dropped) | ✅ |
| break the `outputByteOffset` branch | ✅ |

**4/4 caught.** The suite is a real suite, not decoration. (For contrast, a
package audited the same day had a randomized test where 62% of cases returned
`None` on both sides — `assertEqual(None, None)` always passes.)

**Edge-case differential** — 26 semantic boundaries the suite does not cover,
compared field-by-field (external headers arrays of the wrong length, empty
input, BOM, duplicate headers, `skipLines` overshoot, `raw` + `headers:false`,
`strict` mismatch, single column without separators, embedded newlines,
`headers:false` with `mapHeaders`, …): **26/26 identical.**

One latent divergence exists between the two builds, not reachable through the
public API: if `this.headers` is externally set to `null`, upstream throws a
`TypeError` while the optimized build silently emits numeric keys. It only
matters if the property is reassigned or the class is subclassed.

---

## 8. Conclusion

| claim in the original package | verdict |
|---|---|
| baseline is the real upstream 3.2.1 | ✅ true (13 diffs, all blank lines, no semantics) |
| `writeRow` really drops a per-row array in `headers:false` | ✅ true (scavenges −17%, isolated 1.22×) |
| tests are meaningful | ✅ true (4/4 poisoning, 26/26 edge parity) |
| **2.73% / 3.97% end-to-end faster** | ❌ not reproducible, statistically insignificant, exceeds the arithmetic ceiling by ~10× |
| `optimization.patch` applies to upstream | ❌ failed on real 3.2.1; fixed here (see `docs/optimization.patch`) |

**Net:** the code change is correct and the mechanism is real, but the measured
benefit is confined to `headers: false` mode, is worth at most ~2% end-to-end,
and is below typical machine noise. If you want the speedup, gate the new path
on `headers === false` only and revert `headers` mode to the original
`reduce` — that keeps the one real win without carrying an unmeasurable branch.

---

## Reproduce

```sh
npm test                                   # parity suite
npm run bench                              # three arms + writeRow share + ceiling
HEADERS=false npm run bench
DATA=identical npm run bench               # the degenerate input that produced the claim
ISOLATED_SPEEDUP=1.22 npm run bench
RUNS=12 node audit/probe-repeat-bench.js   # spread of the headline number
node audit/probe-writerow2.js              # writeRow isolated, best-of-N
VARIED=1 node audit/probe-writerow2.js
node audit/probe-varied-share.js           # share under both distributions
node --trace-gc audit/probe-gc.js arms/armA.js normal
node --trace-gc audit/probe-gc.js arms/armB.js normal
node --trace-gc audit/probe-gc.js arms/armC.js normal
node audit/edge-diff.js                    # 26 semantic boundaries
node audit/poison-test.js                  # reverse poisoning
git apply --check docs/optimization.patch  # run inside a real csv-parser@3.2.1 checkout
```
