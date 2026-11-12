import { documentSchema, type PatternDocument } from "../document/schema";
import { db } from "./database";
import { lastProjectId } from "./preferences";
import { repository } from "./repository";
import type { EditorSettings } from "../editor/settings";
export { db, ProjectDatabase } from "./database";
export async function latestProject(
  database = db,
): Promise<PatternDocument | undefined> {
  const active = await lastProjectId(database);
  const row = active ? await database.projects.get(active) : undefined;
  const selected = row ?? (await database.projects.orderBy("updatedAt").last());
  return selected && (await repository(database).open(selected.id)).document;
}
export function createSaveQueue(
  write: (doc: PatternDocument) => Promise<unknown>,
) {
  let pending: Promise<unknown> = Promise.resolve();
  return (doc: PatternDocument) => {
    const snapshot = documentSchema.parse(doc);
    const job = pending.then(() => write(snapshot));
    pending = job.catch(() => undefined);
    return job;
  };
}
export const saveProject = (doc: PatternDocument, settings?: EditorSettings) =>
  repository().save(doc, settings);
