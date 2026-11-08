import {
  cubicIntersections,
  lineIntersections,
} from "../geometry/intersections";
import { distance, type Vec2 } from "../geometry/line";
import { asCubic } from "./segments";
import { splitLine } from "./operations";
import type { PatternDocument } from "./schema";
// Split only crossings involving the selected edge, but split every participant.
export function addIntersectionPoints(
  doc: PatternDocument,
  selectedId: string,
  createId: () => string,
) {
  const selected = doc.segments[selectedId];
  if (!selected) throw new Error("Select an existing edge.");
  const cuts = new Map<string, { t: number; pointId: string }[]>();
  const nodes: { id: string; point: Vec2 }[] = [];
  const addCut = (id: string, t: number, pointId: string) => {
    const edge = doc.segments[id];
    const point = nodes.find((node) => node.id === pointId)!.point;
    // Numerical curve roots near an existing endpoint must reuse that endpoint,
    // not produce a microscopic segment on repeated intersection commands.
    if (distance(doc.points[edge.from], point) < 1e-4) t = 0;
    else if (distance(doc.points[edge.to], point) < 1e-4) t = 1;
    const list = cuts.get(id) ?? [];
    if (!list.some((c) => Math.abs(c.t - t) < 1e-8)) list.push({ t, pointId });
    cuts.set(id, list);
  };
  for (const other of Object.values(doc.segments)) {
    if (other.id === selectedId) continue;
    const hits =
      selected.kind === "line" && other.kind === "line"
        ? lineIntersections(
            doc.points[selected.from],
            doc.points[selected.to],
            doc.points[other.from],
            doc.points[other.to],
          )
        : cubicIntersections(asCubic(doc, selected), asCubic(doc, other));
    for (const hit of hits) {
      const existing = Object.entries(doc.points).find(
        ([, p]) => distance(p, hit.point) < 1e-4,
      );
      let node = nodes.find((n) => distance(n.point, hit.point) < 1e-4);
      if (!node) {
        node = {
          id: existing?.[0] ?? createId(),
          point: existing?.[1] ?? hit.point,
        };
        nodes.push(node);
      }
      addCut(selectedId, hit.t, node.id);
      addCut(other.id, hit.u, node.id);
    }
  }
  let next = structuredClone(doc);
  for (const node of nodes) next.points[node.id] = node.point;
  let splitCount = 0;
  for (const [id, unsorted] of cuts) {
    const sorted = unsorted.sort((a, b) => a.t - b.t);
    let remainingId = id,
      previous = 0;
    for (const cut of sorted) {
      const edge = next.segments[remainingId];
      if (cut.t < 1e-8) {
        next.segments[remainingId] = { ...edge, from: cut.pointId };
        continue;
      }
      if (cut.t > 1 - 1e-8) {
        next.segments[remainingId] = { ...edge, to: cut.pointId };
        continue;
      }
      const nextId = createId(),
        temporaryId = createId(),
        ids = [temporaryId, nextId];
      next = splitLine(
        next,
        remainingId,
        (cut.t - previous) / (1 - previous),
        () => ids.shift()!,
      );
      next.segments[remainingId] = {
        ...next.segments[remainingId],
        to: cut.pointId,
      };
      next.segments[nextId] = { ...next.segments[nextId], from: cut.pointId };
      delete next.points[temporaryId];
      previous = cut.t;
      remainingId = nextId;
      splitCount++;
    }
  }
  const used = new Set(
    Object.values(next.segments).flatMap((e) => [e.from, e.to]),
  );
  // Preserve pre-existing standalone points; discard only endpoint IDs replaced by welding.
  const replaced = new Set<string>();
  for (const id of cuts.keys()) {
    const edge = doc.segments[id];
    if (!used.has(edge.from)) replaced.add(edge.from);
    if (!used.has(edge.to)) replaced.add(edge.to);
  }
  for (const id of replaced) delete next.points[id];
  return { document: next, splitCount };
}
