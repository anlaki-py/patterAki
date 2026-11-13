import type { Fastener } from "./fastenerSchema";
import { ellipseArc } from "../geometry/markCurves";
import type { MarkShape } from "../geometry/marks";

export function fastenerShape(mark: Fastener): MarkShape {
  const shape: MarkShape = { lines: [], circles: [], texts: [], curves: [] };
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    shape.lines.push([
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ]);
  const rectangle = (length: number, width: number) => {
    const x = length / 2,
      y = width / 2;
    line(-x, -y, x, -y);
    line(x, -y, x, y);
    line(x, y, -x, y);
    line(-x, y, -x, -y);
  };
  const cross = (size: number) => {
    line(-size, 0, size, 0);
    line(0, -size, 0, size);
  };
  if (mark.kind === "button") {
    if (mark.shape === "ellipse")
      shape.curves = ellipseArc(
        { x: 0, y: 0 },
        mark.widthMm / 2,
        mark.heightMm / 2,
      );
    else rectangle(mark.widthMm, mark.heightMm);
    if (mark.holes === "none")
      cross(Math.min(2, mark.widthMm / 4, mark.heightMm / 4));
    else
      for (const x of [-mark.holeSpacingMm / 2, mark.holeSpacingMm / 2])
        for (const y of mark.holes === "four"
          ? [-mark.holeSpacingMm / 2, mark.holeSpacingMm / 2]
          : [0])
          shape.circles.push({
            center: { x, y },
            radius: mark.holeDiameterMm / 2,
          });
  } else if (mark.kind === "eyelet" || mark.kind === "snap") {
    shape.circles = [
      { center: { x: 0, y: 0 }, radius: mark.diameterMm / 2 },
      { center: { x: 0, y: 0 }, radius: mark.openingMm / 2 },
    ];
    if (mark.kind === "snap") cross(mark.openingMm / 3);
  } else if (mark.kind === "bartack") {
    rectangle(mark.lengthMm, mark.widthMm);
    for (let i = 0; i < mark.stitches; i++) {
      const x = -mark.lengthMm / 2 + (mark.lengthMm * i) / (mark.stitches - 1);
      line(x, -mark.widthMm / 2, x, mark.widthMm / 2);
    }
  } else {
    const x = mark.lengthMm / 2,
      y = mark.widthMm / 2;
    if (mark.style === "straight") rectangle(mark.lengthMm, mark.widthMm);
    else if (mark.style === "rounded") {
      line(-x + y, -y, x - y, -y);
      line(-x + y, y, x - y, y);
      shape.curves = [
        ...ellipseArc({ x: x - y, y: 0 }, y, y, -Math.PI / 2, Math.PI / 2),
        ...ellipseArc(
          { x: -x + y, y: 0 },
          y,
          y,
          Math.PI / 2,
          (3 * Math.PI) / 2,
        ),
      ];
    } else {
      const rx = mark.eyeLengthMm / 2,
        ry = mark.eyeWidthMm / 2;
      const center = { x: -x + rx, y: 0 },
        angle = Math.asin(y / ry);
      const join = center.x + rx * Math.cos(angle);
      line(join, -y, x, -y);
      line(x, -y, x, y);
      line(x, y, join, y);
      shape.curves = ellipseArc(center, rx, ry, angle, 2 * Math.PI - angle);
    }
  }
  return shape;
}
