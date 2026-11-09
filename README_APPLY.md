# patterAki snapping fix (v2: cycling regression correction)

Prepared against `anlaki-py/patterAki` `master` source viewed on 2026-11-09.
The archive contains **one replacement source file** and **two new regression test files**.

## Apply

Extract the ZIP into the root of your existing patterAki checkout, preserving
paths (merge the `src/` directories). This replaces only:

- `src/geometry/snapping.ts`

And adds:

- `src/geometry/snapping.regression.test.ts`
- `src/editor/snapResolver.regression.test.ts`

There are no package or dependency changes.

## What changed

- Fixed exact snap targets (endpoints, intersections, guide intersections,
  midpoints, perpendicular feet) compete by distance first. Topology priority
  breaks ties at coincident positions. This makes the midpoint of a short line
  reachable even when both endpoints fall within the pickup radius.
- Dynamic snap locks on edges/guides/alignments/grid now yield to a newly
  acquired exact target within the full configured pickup radius. Sliding
  along an existing edge no longer prevents its midpoint, intersections, guide
  crossings or perpendicular feet from taking over.
- Locks on fixed topology points keep hysteresis, but can switch when the
  pointer clearly reaches another fixed target.
- Corrected explicit cycling so cycling a held fixed target does not
  rebase to the nearest target before applying the cycle offset. Repeated cycles
  now wrap instead of bouncing between entries.
- Preserved configurable release distance and snapping mode toggles.

## Check after applying

```sh
npm ci                 # only if dependencies aren't already installed
npm run format
npm test
npm run lint
npm run format:check
npm run build
```

Manually verify drawing a short line with all snap modes enabled, then draw a
second line from its midpoint. Repeat after sliding along the first line from
its edge towards its midpoint. Also try guide/edge intersections and
perpendicular feet while an edge snap is held.

## Validation status

The replacement resolver compiled with the local TypeScript compiler using a
minimal mock of `geometry/line.ts`. Its eight new pure regression tests passed
with a lightweight local Vitest-compatible assertion shim, and eight extra
resolver smoke assertions passed. The exact existing failing cycling scenario
was also reproduced and passed after the correction. **The real repo's Vitest, lint, format and
build checks were not run:** direct GitHub checkout/download was unavailable in
this environment. The editor integration regression tests are included for you
to run in the actual project.
