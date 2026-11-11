import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { ProjectDatabase, createSaveQueue, latestProject } from "./projects";
import { addPath, splitLine } from "../document/operations";
import { createPieceFromEdge } from "../document/pieces";
import { emptyDocument } from "../document/schema";
import {
  duplicatePieces,
  rotationAround,
  transformPieces,
} from "../document/pieceTransforms";
import { newAnnotation, putAnnotation } from "../document/annotations";
it("reopens transformed, split and duplicated pieces with complete metadata and standalone marks", async () => {
  let n = 0;
  const id = () => `saved-${++n}`;
  let doc = addPath(
    emptyDocument("pieces"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  doc = createPieceFromEdge(
    doc,
    Object.keys(doc.segments)[0],
    "panel",
    "Panel",
  );
  doc.pieces.panel.metadata = {
    size: "M",
    fabric: "Cotton",
    cutQuantity: 2,
    onFold: false,
    mirroredPair: true,
    notes: "Preserve every field",
    version: "rev 2",
  };
  doc = splitLine(doc, doc.pieces.panel.rootSegmentId, 0.3, id);
  doc = transformPieces(doc, ["panel"], rotationAround(33, { x: 50, y: 40 }));
  doc = duplicatePieces(doc, ["panel"], id, { x: 200, y: 0 }).document;
  doc = putAnnotation(
    doc,
    newAnnotation("text", { x: 12, y: 15 }, "free-mark"),
  );
  const database = new ProjectDatabase(`pieces-${crypto.randomUUID()}`);
  try {
    const save = createSaveQueue((document) =>
      database.projects.put({ id: document.id, document, updatedAt: 1 }),
    );
    await save(doc);
    expect(await latestProject(database)).toEqual(doc);
  } finally {
    await database.delete();
  }
});
it("v6 saved identity upgrades in memory and leaves the original database row untouched", async () => {
  let n = 0;
  let doc = addPath(
    emptyDocument("legacy-piece"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    () => `legacy-${++n}`,
  );
  doc = createPieceFromEdge(doc, Object.keys(doc.segments)[0], "piece");
  const p = doc.pieces.piece;
  const legacy = {
    ...doc,
    schemaVersion: 6,
    pieces: {
      piece: { id: p.id, name: p.name, rootSegmentId: p.rootSegmentId },
    },
  };
  const database = new ProjectDatabase(`v6-pieces-${crypto.randomUUID()}`);
  try {
    await database
      .table("projects")
      .put({ id: legacy.id, document: legacy, updatedAt: 1 });
    const reopened = await latestProject(database);
    expect(reopened?.schemaVersion).toBe(7);
    expect(reopened?.pieces.piece.stitchingOutline).toHaveLength(4);
    expect(reopened?.points).toEqual(doc.points);
    expect((await database.table("projects").get(legacy.id)).document).toEqual(
      legacy,
    );
  } finally {
    await database.delete();
  }
});
