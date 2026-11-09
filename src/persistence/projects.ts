import Dexie, { type Table } from "dexie";
import { documentSchema, type PatternDocument } from "../document/schema";
import {
  defaultSettings,
  parseEditorSettings,
  type EditorSettings,
} from "../editor/settings";
export class ProjectDatabase extends Dexie {
  projects!: Table<{
    id: string;
    document: PatternDocument;
    updatedAt: number;
  }>;
  settings!: Table<{ id: string; value: EditorSettings }>;
  constructor(name = "patternaki") {
    super(name);
    this.version(1).stores({ projects: "id,updatedAt" });
    this.version(2).stores({ settings: "id" });
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
export async function loadEditorSettings(
  database = db,
): Promise<EditorSettings> {
  try {
    const row = await database.settings.get("editor");
    return row ? parseEditorSettings(row.value) : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}
export function createSettingsQueue(
  write: (settings: EditorSettings) => Promise<unknown>,
) {
  let pending: Promise<unknown> = Promise.resolve();
  return (settings: EditorSettings) => {
    const parsed = parseEditorSettings(settings);
    const job = pending.then(() => write(parsed));
    pending = job.catch(() => undefined);
    return job;
  };
}
export const saveEditorSettings = createSettingsQueue((settings) =>
  db.settings.put({ id: "editor", value: settings }),
);
