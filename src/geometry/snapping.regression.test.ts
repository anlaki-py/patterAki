import { expect, it } from "vitest";
import {
  resolveSnapCandidates,
  snapPriority,
  type SnapCandidate,
} from "./snapping";

const candidate = (
  kind: SnapCandidate["kind"],
  x: number,
  id: string,
): SnapCandidate => ({
  kind,
  priority: snapPriority[kind],
  point: { x, y: 0 },
  targetId: id,
  label: kind,
});

it("uses distance before topology priority for distinct fixed targets", () => {
  const result = resolveSnapCandidates(
    { x: 6, y: 0 },
    [
      candidate("endpoint", 0, "start"),
      candidate("midpoint", 6, "middle"),
      candidate("endpoint", 12, "end"),
    ],
    { tolerance: 8 },
  );
  expect(result.chosen?.targetId).toBe("middle");
});

it("can acquire a midpoint even on a sub-millimetre line", () => {
  const result = resolveSnapCandidates(
    { x: 0.25, y: 0 },
    [
      candidate("endpoint", 0, "start"),
      candidate("midpoint", 0.25, "middle"),
      candidate("endpoint", 0.5, "end"),
    ],
    { tolerance: 8 },
  );
  expect(result.chosen?.targetId).toBe("middle");
});

it("preserves topology precedence when fixed targets coincide", () => {
  const result = resolveSnapCandidates(
    { x: 10, y: 0 },
    [
      candidate("midpoint", 10, "mid"),
      candidate("intersection", 10, "cross"),
      candidate("endpoint", 10, "end"),
    ],
    { tolerance: 8 },
  );
  expect(result.chosen?.targetId).toBe("end");
});

it("preserves hysteresis when no new fixed target is in pickup range", () => {
  const endpoint = candidate("endpoint", 0, "point:a");
  const first = resolveSnapCandidates({ x: 6, y: 0 }, [endpoint], {
    tolerance: 8,
  });
  const held = resolveSnapCandidates({ x: 10, y: 0 }, [endpoint], {
    tolerance: 8,
    previousLock: first.lock,
    releaseMultiplier: 1.5,
  });
  expect(held.chosen?.targetId).toBe("point:a");
  const released = resolveSnapCandidates({ x: 12.1, y: 0 }, [endpoint], {
    tolerance: 8,
    previousLock: first.lock,
    releaseMultiplier: 1.5,
  });
  expect(released.chosen).toBeUndefined();
});

it("a held dynamic edge projection yields to a fixed midpoint", () => {
  const movingEdge = candidate("on-edge", 47, "edge:a");
  const middle = candidate("midpoint", 50, "mid:a");
  const result = resolveSnapCandidates({ x: 47, y: 0 }, [movingEdge, middle], {
    tolerance: 4,
    previousLock: {
      kind: "on-edge",
      targetId: "edge:a",
      point: { x: 20, y: 0 },
    },
  });
  expect(result.chosen?.targetId).toBe("mid:a");
});

it("a held fixed endpoint can yield to a closer midpoint", () => {
  const start = candidate("endpoint", 0, "start");
  const mid = candidate("midpoint", 6, "middle");
  const result = resolveSnapCandidates({ x: 6, y: 0 }, [start, mid], {
    tolerance: 8,
    previousLock: { kind: "endpoint", targetId: "start", point: start.point },
  });
  expect(result.chosen?.targetId).toBe("middle");
});

it("two same-priority targets still support cycling", () => {
  const a = candidate("endpoint", -2, "a");
  const b = candidate("endpoint", 2, "b");
  const first = resolveSnapCandidates({ x: 0, y: 0 }, [b, a], {
    tolerance: 4,
  });
  expect(first.chosen?.targetId).toBe("a");
  const next = resolveSnapCandidates({ x: 0, y: 0 }, [b, a], {
    tolerance: 4,
    previousLock: first.lock,
    cycleOffset: 1,
  });
  expect(next.chosen?.targetId).toBe("b");
});

it("wraps successive cycles even when the currently selected fixed target is farther away", () => {
  const a = candidate("endpoint", 2, "point:a");
  const b = candidate("endpoint", 1, "point:b");
  const pointer = { x: 0, y: 0 };
  const first = resolveSnapCandidates(pointer, [b, a], { tolerance: 8 });
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
