import { documentSchema, type PatternDocument } from "../document/schema";
import { db, type ProjectDatabase } from "./projects";

export type SavedProject = {
  id: string;
  name: string;
  updatedAt: number;
};

/** Local-only project catalog. Opening validates the entire document before loading. */
export async function listSavedProjects(
  database: ProjectDatabase = db,
): Promise<SavedProject[]> {
  const rows = await database.projects.orderBy("updatedAt").reverse().toArray();
  return rows.map(({ id, document, updatedAt }) => ({
    id,
    name:
      typeof document?.name === "string" ? document.name : "Invalid project",
    updatedAt,
  }));
}

export async function getSavedProject(
  id: string,
  database: ProjectDatabase = db,
): Promise<PatternDocument> {
  const row = await database.projects.get(id);
  if (!row) throw new Error("This saved project no longer exists.");
  // Never load or silently overwrite an invalid/unsupported schema.
  return documentSchema.parse(row.document);
}

export async function deleteSavedProject(
  id: string,
  database: ProjectDatabase = db,
): Promise<void> {
  if (!(await database.projects.get(id)))
    throw new Error("This saved project no longer exists.");
  await database.projects.delete(id);
}
