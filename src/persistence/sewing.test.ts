import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { ProjectDatabase, createSaveQueue, latestProject } from "./projects";
import { emptyDocument } from "../document/schema";
import { addPath, splitLine } from "../document/operations";
import { createPieceFromEdge } from "../document/pieces";
import { updateSewing } from "../document/sewing";
it("reopens committed sewing records, split attachments and metadata from IndexedDB", async () => {
  const database = new ProjectDatabase(`sewing-${crypto.randomUUID()}`);
  try {
    let n = 0;
    const id = () => `save-${++n}`;
    let doc = addPath(
      emptyDocument("sewing"),
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ],
      true,
      id,
    );
    const edge = Object.keys(doc.segments)[0];
    doc = createPieceFromEdge(doc, edge, "p", "Front");
    doc = updateSewing(doc, "p", (s) => ({
      ...s,
      edges: { [edge]: { role: "hem" } },
      notches: [
        {
          id: id(),
          segmentId: edge,
          fraction: 0.15,
          style: "double",
          depthMm: 3,
        },
      ],
      marks: [
        {
          id: id(),
          kind: "grainline",
          position: { x: 100, y: 40 },
          rotation: 90,
          lengthMm: 50,
        },
      ],
      darts: [
        {
          id: id(),
          center: { x: 100, y: 40 },
          rotation: 0,
          intakeMm: 20,
          depthMm: 100,
        },
      ],
    }));
    doc = splitLine(doc, edge, 0.1, id);
    doc.pieces.p.metadata = {
      size: "S",
      fabric: "Linen",
      cutQuantity: 2,
      onFold: false,
      mirroredPair: true,
      notes: "Pocket",
      version: "2",
    };
    const save = createSaveQueue((snapshot) =>
      database.projects.put({
        id: snapshot.id,
        document: snapshot,
        updatedAt: 1,
      }),
    );
    await save(doc);
    expect(await latestProject(database)).toEqual(doc);
    const malformed = structuredClone(doc);
    malformed.pieces.p.sewing!.notches[0].fraction = 2;
    expect(() => save(malformed)).toThrow();
    expect(await latestProject(database)).toEqual(doc);
  } finally {
    database.close();
    await database.delete();
  }
});
