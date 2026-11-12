import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { ProjectDatabase } from "./database";
import {
  ProjectConflictError,
  ProjectRepository,
  repository,
} from "./repository";
import { defaultSettings } from "../editor/settings";
import { emptyDocument } from "../document/schema";
import { latestProject } from "./projects";
import {
  projectSettings,
  rememberProject,
  setRecoveryEnabled,
} from "./preferences";
import { listCheckpoints, recoveryDocument } from "./recovery";
const database = () => new ProjectDatabase(`m41-${crypto.randomUUID()}`);
describe("atomic project records and recovery", () => {
  it("serializes rapid saves across project switches and stores independent settings", async () => {
    const db = database(),
      repo = repository(db);
    try {
      const a = emptyDocument("a"),
        b = { ...emptyDocument("b"), unitsDisplay: "in" as const };
      await Promise.all([
        repo.save({ ...a, name: "Old" }, { ...defaultSettings, snap: false }),
        repo.save(b, { ...defaultSettings, grid: false }),
        repo.save(
          { ...a, name: "Newest" },
          { ...defaultSettings, snap: false },
        ),
      ]);
      expect((await repo.open("a")).document.name).toBe("Newest");
      expect((await projectSettings("a", db)).snap).toBe(false);
      expect((await projectSettings("b", db)).grid).toBe(false);
      expect((await repo.open("b")).document.unitsDisplay).toBe("in");
      await rememberProject("b", db);
      expect((await latestProject(db))?.id).toBe("b");
      await repo.save({ ...a, name: "Renamed from catalog" });
      expect((await latestProject(db))?.id).toBe("b");
    } finally {
      await db.delete();
    }
  });
  it("allows one simultaneous writer and refuses the stale tab without overwriting the winner", async () => {
    const db = database(),
      first = new ProjectRepository(db),
      second = new ProjectRepository(db);
    try {
      await first.save(emptyDocument("shared"));
      const a = (await first.open("shared")).document,
        b = (await second.open("shared")).document;
      const results = await Promise.allSettled([
        first.save({ ...a, name: "Winner A" }),
        second.save({ ...b, name: "Winner B" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failure = results.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failure.reason).toBeInstanceOf(ProjectConflictError);
      const winner = (await db.projects.get("shared"))!.document;
      const loser = winner.name === "Winner A" ? second : first;
      expect(await loser.conflicted("shared")).toBe(true);
      await expect(loser.save({ ...b, name: "Stale retry" })).rejects.toThrow(
        /Conflict/,
      );
      expect((await db.projects.get("shared"))!.document).toEqual(winner);
      await expect(loser.remove("shared")).rejects.toThrow(/Conflict/);
      await loser.save({ ...b, id: "recovered", name: "Recovery copy" });
      expect((await db.projects.get("shared"))!.document).toEqual(winner);
    } finally {
      await db.delete();
    }
  });
  it("does not blindly write existing records or resurrect deleted projects", async () => {
    const db = database(),
      writer = new ProjectRepository(db),
      stale = new ProjectRepository(db);
    try {
      const doc = emptyDocument("one");
      await writer.save(doc);
      await expect(new ProjectRepository(db).save(doc)).rejects.toThrow(
        /Conflict/,
      );
      await stale.open("one");
      await writer.remove("one");
      await expect(
        stale.save({ ...doc, name: "Resurrection" }),
      ).rejects.toThrow(/Conflict/);
      await expect(writer.save(doc)).rejects.toThrow(/Conflict/);
      expect(await db.projects.count()).toBe(0);
      expect(await db.checkpoints.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
  it("detects legacy/raw writes and refuses to rewrite unsupported stored schemas", async () => {
    const db = database(),
      repo = repository(db);
    try {
      const doc = emptyDocument("old");
      await repo.save(doc);
      await db.projects.update("old", {
        document: { ...doc, name: "Other client" },
      });
      await expect(repo.save({ ...doc, name: "Stale" })).rejects.toThrow(
        /Conflict/,
      );
      const unsupported = { ...doc, schemaVersion: 999 };
      await db
        .table("projects")
        .put({ id: "old", document: unsupported, updatedAt: 1, revision: 2 });
      await expect(repo.open("old")).rejects.toThrow();
      await expect(repo.save(doc)).rejects.toThrow(/Conflict/);
      expect((await db.projects.get("old"))!.document).toEqual(unsupported);
      const points = await listCheckpoints("old", db);
      expect(await recoveryDocument(points[0].id, db)).toEqual(doc);
    } finally {
      await db.delete();
    }
  });
  it("rolls back document and project preferences together when checkpoint storage fails", async () => {
    const db = database(),
      repo = repository(db);
    try {
      const doc = emptyDocument("quota");
      await repo.save(doc, defaultSettings);
      const before = await db.projects.get(doc.id);
      const fail = () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      };
      db.checkpoints.hook("creating", fail);
      await expect(
        repo.save(
          { ...doc, name: "Unsaved geometry" },
          { ...defaultSettings, snap: false },
        ),
      ).rejects.toThrow(/Quota/);
      expect(await db.projects.get(doc.id)).toEqual(before);
      expect((await projectSettings(doc.id, db)).snap).toBe(true);
      expect(await db.checkpoints.count()).toBe(1);
      db.checkpoints.hook("creating").unsubscribe(fail);
      await repo.save({ ...doc, name: "Retry succeeds" });
      expect((await db.projects.get(doc.id))!.document.name).toBe(
        "Retry succeeds",
      );
    } finally {
      await db.delete();
    }
  });
  it("retains five committed checkpoints, ignores no-op saves and supports disabling future checkpoints", async () => {
    const db = database(),
      repo = repository(db);
    try {
      const doc = emptyDocument("history");
      for (let i = 0; i < 8; i++)
        await repo.save({ ...doc, name: `Revision ${i}` });
      const points = await listCheckpoints(doc.id, db);
      expect(points.map((p) => p.revision)).toEqual([8, 7, 6, 5, 4]);
      expect((await recoveryDocument(points[4].id, db)).name).toBe(
        "Revision 3",
      );
      await repo.save({ ...doc, name: "Revision 7" });
      expect(await listCheckpoints(doc.id, db)).toEqual(points);
      await repo.save(
        { ...doc, name: "Revision 7" },
        { ...defaultSettings, snap: false },
      );
      expect(await listCheckpoints(doc.id, db)).toEqual(points);
      await setRecoveryEnabled(false, db);
      await repo.save({ ...doc, name: "Without checkpoint" });
      expect(await listCheckpoints(doc.id, db)).toEqual(points);
      await db.checkpoints.update(points[0].id, {
        document: { ...doc, name: "" },
      });
      await expect(recoveryDocument(points[0].id, db)).rejects.toThrow();
    } finally {
      await db.delete();
    }
  });
  it("explicitly upgrades database v2 settings without rewriting legacy document geometry", async () => {
    const name = `m41-upgrade-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({ projects: "id,updatedAt" });
    old.version(2).stores({ settings: "id" });
    const { annotations, guides, pieces, ...base } = emptyDocument("legacy");
    expect([annotations, guides, pieces]).toEqual([{}, {}, {}]);
    const document = { ...base, schemaVersion: 1 };
    await old.table("projects").put({ id: "legacy", document, updatedAt: 1 });
    await old
      .table("settings")
      .put({ id: "editor", value: { ...defaultSettings, snap: false } });
    old.close();
    const upgraded = new ProjectDatabase(name);
    try {
      expect((await latestProject(upgraded))?.schemaVersion).toBe(9);
      expect((await upgraded.projects.get("legacy"))!.document).toEqual(
        document,
      );
      expect((await projectSettings("legacy", upgraded)).snap).toBe(false);
      expect((await upgraded.projects.get("legacy"))!.revision).toBe(0);
      await upgraded.projectSettings.update("legacy", { version: 999 });
      await expect(repository(upgraded).open("legacy")).rejects.toThrow(
        /Unsupported project preference/,
      );
    } finally {
      await upgraded.delete();
    }
  });
});
