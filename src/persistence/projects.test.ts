import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createSaveQueue, latestProject, ProjectDatabase } from "./projects";
import { newAnnotation, putAnnotation } from "../document/annotations";
import { emptyDocument } from "../document/schema";
it("saves and reopens validated documents in IndexedDB", async () => {
  const database = new ProjectDatabase("test-" + crypto.randomUUID()),
    doc = emptyDocument("one");
  await database.projects.put({ id: doc.id, document: doc, updatedAt: 1 });
  expect(await latestProject(database)).toEqual(doc);
  await database.delete();
});
it("serializes rapid writes in order", async () => {
  const writes: string[] = [];
  const save = createSaveQueue(async (doc) => {
    await new Promise((resolve) =>
      setTimeout(resolve, doc.name === "old" ? 20 : 0),
    );
    writes.push(doc.name);
  });
  await Promise.all([
    save({ ...emptyDocument("one"), name: "old" }),
    save({ ...emptyDocument("one"), name: "new" }),
  ]);
  expect(writes).toEqual(["old", "new"]);
});
it("reports storage errors and permits a later retry", async () => {
  let calls = 0;
  const save = createSaveQueue(async () => {
    if (calls++ === 0) throw new Error("quota");
  });
  await expect(save(emptyDocument("one"))).rejects.toThrow("quota");
  await expect(save(emptyDocument("one"))).resolves.toBeUndefined();
});
it("rejects corrupt stored documents rather than replacing them", async () => {
  const database = new ProjectDatabase("test-" + crypto.randomUUID());
  const doc = emptyDocument("bad");
  doc.name = "";
  await database.projects.put({ id: doc.id, document: doc, updatedAt: 1 });
  await expect(latestProject(database)).rejects.toThrow();
  expect(await database.projects.count()).toBe(1);
  await database.delete();
});
it("opens a version 1 saved project as version 3 without rewriting the original record", async () => {
  const database = new ProjectDatabase("legacy-" + crypto.randomUUID());
  const { annotations, ...base } = emptyDocument("old");
  expect(annotations).toEqual({});
  const legacy = { ...base, schemaVersion: 1 };
  await database
    .table("projects")
    .put({ id: legacy.id, document: legacy, updatedAt: 1 });
  expect((await latestProject(database))?.schemaVersion).toBe(3);
  expect(
    (await database.table("projects").get("old")).document.schemaVersion,
  ).toBe(1);
  await database.delete();
});
it("saves and reopens every annotation kind with exact dimensions", async () => {
  const database = new ProjectDatabase("marks-" + crypto.randomUUID());
  let doc = emptyDocument("marks");
  for (const kind of ["text", "arrow", "grainline", "fold", "drill"] as const)
    doc = putAnnotation(
      doc,
      newAnnotation(kind, { x: 12.345, y: -54.321 }, kind),
    );
  const save = createSaveQueue((snapshot) =>
    database.projects.put({
      id: snapshot.id,
      document: snapshot,
      updatedAt: 1,
    }),
  );
  await save(doc);
  expect(await latestProject(database)).toEqual(doc);
  await database.delete();
});
it("migrates saved version 2 curves without rewriting their source record", async () => {
  const database = new ProjectDatabase("v2-" + crypto.randomUUID());
  const legacy = {
    schemaVersion: 2,
    id: "legacy-curve",
    name: "Old curve",
    unitsDisplay: "mm",
    points: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    segments: {
      curve: {
        id: "curve",
        kind: "cubic",
        from: "a",
        to: "b",
        control1: { x: 20, y: 30 },
        control2: { x: 80, y: 30 },
      },
    },
  };
  await database
    .table("projects")
    .put({ id: legacy.id, document: legacy, updatedAt: 1 });
  expect(await latestProject(database)).toEqual({
    ...legacy,
    schemaVersion: 3,
    annotations: {},
  });
  expect((await database.table("projects").get(legacy.id)).document).toEqual(
    legacy,
  );
  await database.delete();
});
it("preserves a stored record with invalid annotations and refuses to open it", async () => {
  const database = new ProjectDatabase("invalid-mark-" + crypto.randomUUID());
  const invalid = {
    ...emptyDocument("invalid-mark"),
    annotations: { unknown: { id: "unknown", kind: "unsupported" } },
  };
  await database
    .table("projects")
    .put({ id: invalid.id, document: invalid, updatedAt: 1 });
  await expect(latestProject(database)).rejects.toThrow();
  expect((await database.table("projects").get(invalid.id)).document).toEqual(
    invalid,
  );
  await database.delete();
});
