import type { PatternDocument, PatternPiece } from "./schema";
export function pieceOutlinePath(doc: PatternDocument, piece: PatternPiece) {
  return (
    piece.stitchingOutline
      .map((ref, i) => {
        const edge = doc.segments[ref.segmentId],
          a = doc.points[ref.reversed ? edge.to : edge.from],
          b = doc.points[ref.reversed ? edge.from : edge.to];
        const start = i === 0 ? `M ${a.x} ${a.y} ` : "";
        if (edge.kind === "line") return `${start}L ${b.x} ${b.y}`;
        const c1 = ref.reversed ? edge.control2 : edge.control1,
          c2 = ref.reversed ? edge.control1 : edge.control2;
        return `${start}C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
      })
      .join(" ") + " Z"
  );
}
