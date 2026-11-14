import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addPath } from "../document/operations";
import { bendCurve, moveVertex } from "../document/curves";
import { createPieceFromEdge } from "../document/pieces";
import { documentSchema, emptyDocument } from "../document/schema";
import * as seams from "../document/seamAllowance";
import * as segments from "../document/segments";
import { preparedGeometry } from "./preparedGeometry";
import { pieceForItem } from "../document/pieceAccess";
import { attachInternalPath } from "../document/piecePathsEdit";
import { updateSewing } from "../document/sewing";
import { emptySewing } from "../document/sewingSchema";
import { SvgGeometry } from "./SvgGeometry";
import { useEditor } from "./store";

function fixture(count = 1) {
  let doc = emptyDocument("artwork");
  let next = 0;
  for (let i = 0; i < count; i++) {
    const x = (i % 8) * 150;
    const y = Math.floor(i / 8) * 180;
    doc = addPath(
      doc,
      [
        { x, y },
        { x: x + 100, y },
        { x: x + 100, y: y + 120 },
        { x, y: y + 120 },
      ],
      true,
      () => `art-${++next}`,
    );
    const edgeId = Object.keys(doc.segments).at(-4)!;
    doc = createPieceFromEdge(doc, edgeId, `piece-${i}`);
    doc = bendCurve(doc, edgeId, 0.5, { x: 0, y: -10 });
    doc = seams.setSeamAllowance(doc, `piece-${i}`, {
      widthMm: 5,
      join: "miter",
      miterLimit: 4,
    });
  }
  return documentSchema.parse(doc);
}

beforeEach(() =>
  useEditor.setState({ outlineVisibility: "both", preview: null }),
);
afterEach(() => vi.restoreAllMocks());

it("reuses physical paths across pointer-style renders, selection and zoom changes", () => {
  const doc = fixture(32);
  const first = doc.pieces["piece-0"].stitchingOutline[1].segmentId;
  const cut = vi.spyOn(seams, "cutPath");
  const path = vi.spyOn(segments, "segmentPath");
  for (let i = 0; i < 10; i++) {
    const html = renderToStaticMarkup(
      <svg>
        <SvgGeometry
          doc={doc}
          selectedIds={i % 2 ? [first] : []}
          scale={[0.5, 2, 8][i % 3]}
          editPieceId={i % 2 ? "piece-0" : null}
          interactivePoints
        />
      </svg>,
    );
    expect((html.match(/data-cut=/g) ?? []).length).toBe(32);
    expect(html.includes('class="selected edge"')).toBe(i % 2 === 1);
    expect(html).toContain(`stroke-width="${18 / [0.5, 2, 8][i % 3]}"`);
  }
  expect(cut).toHaveBeenCalledTimes(32);
  expect(path).toHaveBeenCalledTimes(Object.keys(doc.segments).length);
});

it("invalidates geometry when endpoints change even when the piece object is shared", () => {
  const doc = fixture();
  const edgeId = doc.pieces["piece-0"].rootSegmentId;
  const edge = doc.segments[edgeId];
  const original = preparedGeometry(doc);
  const cut = original.cut("piece-0");
  const moved = moveVertex(doc, edge.from, { x: -10, y: 0 });
  expect(moved.pieces).toBe(doc.pieces);
  const preview = preparedGeometry(moved);
  expect(preview.paths.get(edgeId)).toBe(
    segments.segmentPath(moved, moved.segments[edgeId]),
  );
  expect(preview.paths.get(edgeId)).not.toBe(original.paths.get(edgeId));
  expect(preview.cut("piece-0")).not.toBe(cut);
  expect(original.cut("piece-0")).toBe(cut);
});

it("uses fresh cut geometry for seam settings and per-edge overrides", () => {
  const doc = fixture();
  const edgeId = doc.pieces["piece-0"].stitchingOutline[1].segmentId;
  const original = preparedGeometry(doc).cut("piece-0");
  const changed = seams.setSeamAllowance(
    doc,
    "piece-0",
    {
      widthMm: 10,
      join: "bevel",
      miterLimit: 4,
    },
    { [edgeId]: 0 },
  );
  expect(changed.points).toBe(doc.points);
  expect(preparedGeometry(changed).cut("piece-0")).toBe(
    seams.cutPath(changed, changed.pieces["piece-0"]),
  );
  expect(preparedGeometry(changed).cut("piece-0")).not.toBe(original);
});

it("restores matching cached artwork on cancel, commit, undo and redo", () => {
  const doc = fixture();
  useEditor.getState().load(doc);
  const edgeId = doc.pieces["piece-0"].rootSegmentId;
  const original = preparedGeometry(doc);
  const preview = moveVertex(doc, doc.segments[edgeId].from, { x: -10, y: 0 });
  useEditor.setState({ preview });
  expect(preparedGeometry(preview).cut("piece-0")).not.toBe(
    original.cut("piece-0"),
  );
  useEditor.getState().cancel();
  expect(preparedGeometry(useEditor.getState().document)).toBe(original);
  useEditor.getState().commit(preview);
  const committed = preparedGeometry(useEditor.getState().document);
  expect(committed.cut("piece-0")).toBe(
    preparedGeometry(preview).cut("piece-0"),
  );
  useEditor.getState().undo();
  expect(preparedGeometry(useEditor.getState().document)).toBe(original);
  useEditor.getState().redo();
  expect(preparedGeometry(useEditor.getState().document)).toBe(committed);
});

it("keeps visibility, internal paths and ownership consistent with canonical access rules", () => {
  let doc = fixture(2);
  let i = 0;
  doc = addPath(
    doc,
    [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
    ],
    false,
    () => `internal-${++i}`,
  );
  const internal = Object.keys(doc.segments).at(-1)!;
  doc = attachInternalPath(doc, "piece-0", [internal], "inside");
  const original = preparedGeometry(doc);
  for (const id of [...Object.keys(doc.points), ...Object.keys(doc.segments)])
    expect(original.owners.get(id)).toEqual(pieceForItem(original.doc, id));
  expect(original.internalPaths.get(internal)?.id).toBe("inside");
  doc = updateSewing(doc, "piece-0", () => ({
    ...emptySewing(),
    paths: { inside: { role: "construction", visible: false, export: true } },
  }));
  expect(preparedGeometry(doc).paths.has(internal)).toBe(false);
  expect(original.paths.has(internal)).toBe(true);
  const hidden = {
    ...doc,
    pieces: {
      ...doc.pieces,
      "piece-1": { ...doc.pieces["piece-1"], visible: false },
    },
  };
  const visible = preparedGeometry(hidden);
  expect(visible.pieces.map(({ piece }) => piece.id)).toEqual(["piece-0"]);
  for (const ref of hidden.pieces["piece-1"].stitchingOutline)
    expect(visible.paths.has(ref.segmentId)).toBe(false);
  for (const id of Object.keys(visible.doc.points))
    expect(visible.owners.get(id)).toEqual(pieceForItem(visible.doc, id));
});

it("updates locked hit targets without changing physical paths", () => {
  const doc = fixture();
  const locked = {
    ...doc,
    pieces: { "piece-0": { ...doc.pieces["piece-0"], locked: true } },
  };
  const render = (source: typeof doc) =>
    renderToStaticMarkup(
      <svg>
        <SvgGeometry
          doc={source}
          selectedIds={[]}
          scale={2}
          editPieceId="piece-0"
          interactivePoints
        />
      </svg>,
    );
  const before = render(doc);
  const after = render(locked);
  expect(before).toContain("data-edge=");
  expect(before).toContain("data-point=");
  expect(after).not.toContain("data-edge=");
  expect(after).not.toContain("data-point=");
  expect(preparedGeometry(locked).cut("piece-0")).toBe(
    preparedGeometry(doc).cut("piece-0"),
  );
});

it("defers offset computation until cut geometry is requested", () => {
  const doc = fixture();
  const cut = vi.spyOn(seams, "cutPath");
  const geometry = preparedGeometry(doc);
  expect(geometry.pieces).toHaveLength(1);
  expect(cut).not.toHaveBeenCalled();
  expect(geometry.cut("piece-0")).toBeTruthy();
  expect(geometry.cut("piece-0")).toBeTruthy();
  expect(cut).toHaveBeenCalledOnce();
});

it("omits an invalid cut preview, caches the failure and retries a repaired document", () => {
  const doc = fixture();
  const original = structuredClone(doc);
  const cut = vi.spyOn(seams, "cutPath").mockImplementationOnce(() => {
    throw new Error("Cannot offset preview");
  });
  const geometry = preparedGeometry(doc);
  expect(geometry.cut("piece-0")).toBeNull();
  expect(geometry.cut("piece-0")).toBeNull();
  expect(cut).toHaveBeenCalledOnce();
  expect(doc).toEqual(original);
  const repaired = { ...doc };
  expect(preparedGeometry(repaired).cut("piece-0")).toBeTruthy();
  expect(cut).toHaveBeenCalledTimes(2);
});
