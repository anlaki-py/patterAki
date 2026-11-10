import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { ProjectDatabase } from "./projects";
import {
  deleteSavedProject,
  getSavedProject,
  listSavedProjects,
} from "./projectBrowser";

const database = () => new ProjectDatabase(`m01-${crypto.randomUUID()}`);

describe("M0.1 local project management", () => {
  it("lists saved projects newest first without altering their contents", async () => {
    const db = database();
    const old = { ...emptyDocument("old"), name: "Vintage jacket" };
    const recent = { ...emptyDocument("recent"), name: "Denim wallet" };
    try {
      await db.projects.bulkPut([
        { id: old.id, document: old, updatedAt: 10 },
        { id: recent.id, document: recent, updatedAt: 50 },
      ]);
      expect(await listSavedProjects(db)).toEqual([
        { id: "recent", name: "Denim wallet", updatedAt: 50 },
        { id: "old", name: "Vintage jacket", updatedAt: 10 },
      ]);
      expect(await getSavedProject("old", db)).toEqual(old);
      expect(await getSavedProject("recent", db)).toEqual(recent);
    } finally {
      await db.delete();
    }
  });

  it("deletes only the selected project and keeps other saved records intact", async () => {
    const db = database();
    const one = emptyDocument("one");
    const two = emptyDocument("two");
    try {
      await db.projects.bulkPut([
        { id: "one", document: one, updatedAt: 1 },
        { id: "two", document: two, updatedAt: 2 },
      ]);
      await deleteSavedProject("one", db);
      expect(await db.projects.count()).toBe(1);
      await expect(getSavedProject("one", db)).rejects.toThrow(
        "no longer exists",
      );
      expect(await getSavedProject("two", db)).toEqual(two);
    } finally {
      await db.delete();
    }
  });

  it("rejects invalid saved records instead of opening or rewriting them", async () => {
    const db = database();
    const corrupt = { ...emptyDocument("broken"), name: "" };
    try {
      await db.projects.put({ id: "broken", document: corrupt, updatedAt: 10 });
      await expect(getSavedProject("broken", db)).rejects.toThrow();
      expect((await db.projects.get("broken"))?.document).toEqual(corrupt);
      await expect(deleteSavedProject("absent", db)).rejects.toThrow(
        "no longer exists",
      );
    } finally {
      await db.delete();
    }
  });
});
