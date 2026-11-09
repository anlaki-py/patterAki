import { beforeEach, expect, it } from "vitest";
import { addPath, deleteSegments, splitLine } from "./operations";
import { documentSchema, emptyDocument, parseProject } from "./schema";
import {
  clickPieceSelection,
  closedCycleForEdge,
  createPieceFromEdge,
  expandPieceSelection,
  pieceEdges,
  pieceForEdge,
} from "./pieces";
import { translateSelection } from "./selection";
import { commitTranslation, resolveGroupMovement } from "../editor/movement";
import { defaultSettings } from "../editor/settings";
import { useEditor } from "../editor/store";

let counter = 0;
const id = () => `id-${++counter}`;
function fixture() {
  counter = 0;
  const drawn = addPath(
    emptyDocument("piece-test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  return { drawn, first: Object.keys(drawn.segments)[0] };
}
function madePiece() {
  const { drawn, first } = fixture();
  const doc = createPieceFromEdge(drawn, first, "piece-1", "Front panel");
  return { doc, first };
}
beforeEach(() => {
  useEditor.getState().load(emptyDocument("piece-test"));
});

it("P01 explicitly creates a persisted pattern piece from a valid simple closed contour", () => {
  const { drawn, first } = fixture();
  expect(Object.keys(drawn.pieces)).toEqual([]);
  const doc = createPieceFromEdge(drawn, first, "piece-1", "Front panel");
  expect(doc.pieces["piece-1"]).toMatchObject({
    id: "piece-1",
    name: "Front panel",
    rootSegmentId: first,
  });
  expect(pieceEdges(doc, doc.pieces["piece-1"])).toHaveLength(4);
  expect(parseProject(JSON.stringify(doc))).toEqual(doc);
  expect(documentSchema.safeParse(doc).success).toBe(true);
  expect(() => createPieceFromEdge(doc, first, "another")).toThrow(
    "already a pattern piece",
  );
});

it("P02 old v4 projects migrate without inventing pieces", () => {
  const { drawn } = fixture();
  const previous = {
    schemaVersion: 4,
    id: drawn.id,
    name: drawn.name,
    points: drawn.points,
    segments: drawn.segments,
    unitsDisplay: drawn.unitsDisplay,
    annotations: drawn.annotations,
    guides: drawn.guides,
  };
  const migrated = parseProject(JSON.stringify(previous));
  expect(migrated.schemaVersion).toBe(5);
  expect(migrated.pieces).toEqual({});
  expect(migrated.points).toEqual(drawn.points);
  expect(migrated.segments).toEqual(drawn.segments);
});

it("P03 click and shift-click select or toggle whole piece; loose paths stay individual", () => {
  const { doc, first } = madePiece();
  const members = pieceEdges(doc, doc.pieces["piece-1"]);
  expect(expandPieceSelection(doc, [first])).toEqual(members);
  expect(clickPieceSelection(doc, [], first, false)).toEqual(members);
  expect(clickPieceSelection(doc, members, first, true)).toEqual([]);
  expect(clickPieceSelection(doc, [], first, true)).toEqual(members);
  const standalone = addPath(
    doc,
    [
      { x: 200, y: 0 },
      { x: 250, y: 0 },
    ],
    false,
    id,
  );
  const loose = Object.keys(standalone.segments).at(-1)!;
  expect(expandPieceSelection(standalone, [loose])).toEqual([loose]);
});

it("P04 translating the piece moves each vertex once and preserves relative geometry", () => {
  const { doc } = madePiece();
  const members = pieceEdges(doc, doc.pieces["piece-1"]);
  const moved = translateSelection(doc, members, { x: 13.25, y: -6.5 });
  for (const [pointId, original] of Object.entries(doc.points)) {
    expect(moved.points[pointId]).toEqual({
      x: original.x + 13.25,
      y: original.y - 6.5,
    });
  }
  expect(documentSchema.safeParse(moved).success).toBe(true);
  expect(pieceForEdge(moved, members[2])?.id).toBe("piece-1");
});

it("P05 piece movement uses existing stationary snapping and full-group preview", () => {
  const { doc, first } = madePiece();
  const extra = addPath(
    doc,
    [
      { x: 150, y: 30 },
      { x: 150, y: 60 },
    ],
    false,
    id,
  );
  const members = expandPieceSelection(extra, [first]);
  const result = resolveGroupMovement(
    extra,
    members,
    { x: 50, y: 0 },
    { x: 150.6, y: 30.5 },
    {
      scale: 2,
      touch: false,
      alt: false,
      snap: true,
      grid: false,
      modes: { ...defaultSettings.snapModes, alignments: false },
      gridSpacingMm: 10,
      mouseRadiusPx: 8,
      touchRadiusPx: 16,
      releaseMultiplier: 1.5,
      showGuides: true,
      snapGuides: true,
    },
  );
  expect(result.chosen?.kind).toBe("endpoint");
  expect(result.delta).toEqual({ x: 100, y: 30 });
  for (const [pointId, source] of Object.entries(doc.points)) {
    expect(result.preview.points[pointId]).toEqual({
      x: source.x + 100,
      y: source.y + 30,
    });
  }
});

it("P06 numeric moves and undo/redo preserve piece membership in one step", () => {
  const { doc, first } = madePiece();
  useEditor.getState().load(doc);
  useEditor.setState({
    selected: expandPieceSelection(doc, [first]),
    activePoint: null,
  });
  commitTranslation({ x: 2.5, y: -3 });
  expect(useEditor.getState().past).toHaveLength(1);
  expect(useEditor.getState().document.pieces["piece-1"]).toEqual(
    doc.pieces["piece-1"],
  );
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().redo();
  expect(
    useEditor.getState().document.points[Object.keys(doc.points)[0]].x,
  ).toBe(2.5);
});

it("P07 splitting keeps identity; deleting the contour drops its piece safely", () => {
  const { doc, first } = madePiece();
  expect(closedCycleForEdge(doc, first)).toBeDefined();
  const split = splitLine(doc, first, 0.5, id);
  expect(pieceEdges(split, split.pieces["piece-1"])).toHaveLength(5);
  expect(parseProject(JSON.stringify(split))).toEqual(split);
  const erased = deleteSegments(split, [first]);
  expect(erased.pieces).toEqual({});
  expect(documentSchema.safeParse(erased).success).toBe(true);
});

it("P08 rejects open, branched, overlapping, duplicate and invalid piece records", () => {
  const { drawn, first } = fixture();
  const open = addPath(
    emptyDocument("open"),
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ],
    false,
    id,
  );
  expect(() =>
    createPieceFromEdge(open, Object.keys(open.segments)[0], "open-piece"),
  ).toThrow("closed contour");
  const doc = createPieceFromEdge(drawn, first, "piece-1");
  expect(() => createPieceFromEdge(doc, first, "piece-1")).toThrow();
  expect(
    documentSchema.safeParse({
      ...doc,
      pieces: {
        ...doc.pieces,
        other: { id: "other", name: "Duplicate", rootSegmentId: first },
      },
    }).success,
  ).toBe(false);
  const corrupted = {
    ...doc,
    pieces: {
      ...doc.pieces,
      "piece-1": { ...doc.pieces["piece-1"], rootSegmentId: "absent" },
    },
  };
  expect(documentSchema.safeParse(corrupted).success).toBe(false);
});
