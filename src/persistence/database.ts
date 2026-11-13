import Dexie, { type Table } from "dexie";
import type { PatternDocument } from "../document/schema";
import type { EditorSettings } from "../editor/settings";

export type ProjectRow = {
  id: string;
  document: PatternDocument;
  updatedAt: number;
  revision?: number;
};
export type Checkpoint = {
  id: string;
  projectId: string;
  savedAt: number;
  revision: number;
  document: PatternDocument;
};
export class ProjectDatabase extends Dexie {
  projects!: Table<ProjectRow>;
  settings!: Table<{ id: string; value: EditorSettings }>;
  preferences!: Table<{ id: string; value: unknown }>;
  projectSettings!: Table<{
    id: string;
    version: number;
    value: EditorSettings;
  }>;
  checkpoints!: Table<Checkpoint>;
  assets!: Table<{ id: string; blob: Blob; mime: string }>;
  constructor(name = "patternaki") {
    super(name);
    this.version(4).stores({ assets: "id" });
    this.version(1).stores({ projects: "id,updatedAt" });
    this.version(2).stores({ settings: "id" });
    this.version(3)
      .stores({
        preferences: "id",
        projectSettings: "id",
        checkpoints: "id,projectId,savedAt",
      })
      .upgrade(async (tx) => {
        // Storage records evolve independently of the preserved document schemas.
        const legacy = await tx.table("settings").get("editor");
        await tx
          .table("projects")
          .toCollection()
          .modify((row) => {
            row.revision = 0;
          });
        if (legacy) {
          const ids = await tx.table("projects").toCollection().primaryKeys();
          await tx.table("projectSettings").bulkPut(
            ids.map((id) => ({
              id,
              version: 1,
              value: legacy.value,
            })),
          );
        }
      });
  }
}
export const db = new ProjectDatabase();
