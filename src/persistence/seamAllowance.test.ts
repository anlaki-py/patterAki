import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { ProjectDatabase, createSaveQueue, latestProject } from "./projects";
import { emptyDocument } from "../document/schema";
import { addPath, splitLine } from "../document/operations";
import { createPieceFromEdge } from "../document/pieces";
import { cutOutline, setSeamAllowance } from "../document/seamAllowance";
it("round-trips committed allowances and split edge overrides through IndexedDB", async () => {
  const db = new ProjectDatabase(`seam-${crypto.randomUUID()}`);
  try {
    let n = 0;
    const id = () => `edge-${++n}`;
    let doc = addPath(
      emptyDocument("seams"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
      id,
    );
    const edge = Object.keys(doc.segments)[0];
    doc = createPieceFromEdge(doc, edge, "p", "Panel");
    doc = setSeamAllowance(
      doc,
      "p",
      { widthMm: 5, join: "round", miterLimit: 4 },
      { [edge]: 10 },
    );
    doc = splitLine(doc, edge, 0.5, id);
    const save = createSaveQueue((snapshot) =>
      db.projects.put({ id: snapshot.id, document: snapshot, updatedAt: 1 }),
    );
    await save(doc);
    const reopened = (await latestProject(db))!;
    expect(reopened).toEqual(doc);
    expect(cutOutline(reopened, reopened.pieces.p)).toEqual(
      cutOutline(doc, doc.pieces.p),
    );
    expect(
      Object.values(reopened.pieces.p.sewing!.edges).filter(
        (e) => e.allowanceMm === 10,
      ),
    ).toHaveLength(2);
    const invalid = structuredClone(doc);
    invalid.pieces.p.seamAllowance!.widthMm = -1;
    expect(() => save(invalid)).toThrow();
    expect(await latestProject(db)).toEqual(doc);
  } finally {
    db.close();
    await db.delete();
  }
});
