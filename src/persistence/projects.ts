import Dexie, { type Table } from "dexie";
import { documentSchema, type PatternDocument } from "../document/schema";
export class ProjectDatabase extends Dexie {
  projects!: Table<{
    id: string;
    document: PatternDocument;
    updatedAt: number;
  }>;
  constructor(name = "patternaki") {
    super(name);
    this.version(1).stores({ projects: "id,updatedAt" });
  }
}
export const db = new ProjectDatabase();
export async function latestProject(
  database = db,
): Promise<PatternDocument | undefined> {
  const row = await database.projects.orderBy("updatedAt").last();
  return row && documentSchema.parse(row.document);
}
export function createSaveQueue(
  write: (doc: PatternDocument) => Promise<unknown>,
) {
  let pending: Promise<unknown> = Promise.resolve();
  return (doc: PatternDocument) => {
    const snapshot = documentSchema.parse(doc);
    const job = pending.then(() => write(snapshot));
    // The caller receives the rejection; the next explicit save can still recover.
    pending = job.catch(() => undefined);
    return job;
  };
}
export const saveProject = createSaveQueue((doc) =>
  db.projects.put({ id: doc.id, document: doc, updatedAt: Date.now() }),
);
