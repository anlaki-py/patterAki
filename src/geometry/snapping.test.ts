import { expect, it } from "vitest";
import {
  resolveSnapCandidates,
  sortSnapCandidates,
  type SnapCandidate,
  type SnapLock,
} from "./snapping";

const candidate = (
  targetId: string,
  point: { x: number; y: number },
  priority: number,
  kind: SnapCandidate["kind"] = "endpoint",
): SnapCandidate => ({
  targetId,
  point,
  priority,
  kind,
  label: kind,
});

it("cycles equal-priority choices deterministically and wraps", () => {
  const pointer = { x: 0, y: 0 };
  const a = candidate("point:a", { x: 2, y: 0 }, 1);
  const b = candidate("point:b", { x: 1, y: 0 }, 1);
  const first = resolveSnapCandidates(
    pointer,
    [b, a, candidate("grid", { x: 0, y: 0 }, 9, "grid")],
    {
      tolerance: 8,
    },
  );
  expect(first.choices.map((choice) => choice.targetId)).toEqual([
    "point:b",
    "point:a",
  ]);
  expect(first.chosen?.targetId).toBe("point:b");
  const second = resolveSnapCandidates(pointer, [b, a], {
    tolerance: 8,
    previousLock: first.lock,
    cycleOffset: 1,
  });
  expect(second.chosen?.targetId).toBe("point:a");
  expect(second.choiceIndex).toBe(1);
  const wrapped = resolveSnapCandidates(pointer, [b, a], {
    tolerance: 8,
    previousLock: second.lock,
    cycleOffset: 1,
  });
  expect(wrapped.chosen?.targetId).toBe("point:b");
  expect(wrapped.choiceIndex).toBe(0);
});

it("orders by priority, then raw-pointer distance, then stable target id", () => {
  const pointer = { x: 0, y: 0 };
  const candidates = [
    candidate("b", { x: 4, y: 0 }, 8, "alignment"),
    candidate("a", { x: 4, y: 0 }, 8, "alignment"),
    candidate("grid", { x: 1, y: 0 }, 9, "grid"),
    candidate("endpoint", { x: 6, y: 0 }, 1),
  ];
  expect(
    sortSnapCandidates(pointer, candidates).map((c) => c.targetId),
  ).toEqual(["endpoint", "a", "b", "grid"]);
});

it("keeps a held target through the release radius and reacquires beyond it", () => {
  const held = candidate("point:a", { x: 3, y: 0 }, 1);
  const other = candidate("point:b", { x: 5, y: 0 }, 1);
  const lock: SnapLock = {
    targetId: held.targetId,
    point: held.point,
    kind: held.kind,
  };
  const inside = resolveSnapCandidates(
    { x: 10, y: 0 },
    [candidate("point:a", { x: 10, y: 0 }, 1), other],
    { tolerance: 8, previousLock: lock, releaseMultiplier: 1.5 },
  );
  expect(inside.chosen?.targetId).toBe("point:a");
  const outside = resolveSnapCandidates(
    { x: 20, y: 0 },
    [candidate("point:a", { x: 20, y: 0 }, 1), other],
    { tolerance: 8, previousLock: lock, releaseMultiplier: 1.5 },
  );
  expect(outside.chosen?.targetId).toBe("point:a");
  const released = resolveSnapCandidates(
    { x: 20, y: 0 },
    [
      candidate("point:a", { x: 40, y: 0 }, 1),
      candidate("point:b", { x: 18, y: 0 }, 1),
    ],
    { tolerance: 8, previousLock: lock, releaseMultiplier: 1.5 },
  );
  expect(released.chosen?.targetId).toBe("point:b");
});

it("lets an exact endpoint replace a held weak target inside the near-hit radius", () => {
  const grid = candidate("grid:0:0", { x: 0, y: 0 }, 9, "grid");
  const endpoint = candidate("point:a", { x: 2, y: 0 }, 1);
  const resolution = resolveSnapCandidates({ x: 2.5, y: 0 }, [grid, endpoint], {
    tolerance: 8,
    previousLock: {
      targetId: grid.targetId,
      point: grid.point,
      kind: grid.kind,
    },
  });
  expect(resolution.chosen?.targetId).toBe("point:a");
});

it("cycles same-priority choices in both directions without changing order", () => {
  const pointer = { x: 0, y: 0 };
  const candidates = [
    candidate("b", { x: 2, y: 0 }, 1),
    candidate("a", { x: 2, y: 0 }, 1),
    candidate("c", { x: 2, y: 0 }, 2),
  ];
  const first = resolveSnapCandidates(pointer, candidates, { tolerance: 8 });
  expect(first.choices.map((c) => c.targetId)).toEqual(["a", "b"]);
  const second = resolveSnapCandidates(pointer, candidates, {
    tolerance: 8,
    previousLock: first.lock,
    cycleOffset: 1,
  });
  expect(second.chosen?.targetId).toBe("b");
  expect(second.choiceIndex).toBe(1);
  const back = resolveSnapCandidates(pointer, candidates, {
    tolerance: 8,
    previousLock: second.lock,
    cycleOffset: -1,
  });
  expect(back.chosen?.targetId).toBe("a");
});

it("rejects non-finite candidates, points and tolerances", () => {
  expect(
    resolveSnapCandidates({ x: 0, y: 0 }, [candidate("a", { x: 1, y: 0 }, 1)], {
      tolerance: Number.NaN,
    }).chosen,
  ).toBeUndefined();
  expect(
    resolveSnapCandidates(
      { x: 0, y: 0 },
      [candidate("a", { x: Number.NaN, y: 0 }, 1)],
      { tolerance: 8 },
    ).chosen,
  ).toBeUndefined();
});
