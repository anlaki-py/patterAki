import { documentSchema } from "../document/schema";
import { db } from "./database";
export async function listCheckpoints(projectId: string, database = db) {
  const rows = await database.checkpoints
    .where("projectId")
    .equals(projectId)
    .sortBy("revision");
  return rows.reverse().map((row) => ({
    id: row.id,
    savedAt: row.savedAt,
    revision: row.revision,
  }));
}
export async function recoveryDocument(id: string, database = db) {
  const point = await database.checkpoints.get(id);
  if (!point) throw new Error("This recovery checkpoint no longer exists.");
  const doc = documentSchema.parse(point.document);
  if (doc.id !== point.projectId)
    throw new Error("Invalid recovery checkpoint identity.");
  return doc;
}
