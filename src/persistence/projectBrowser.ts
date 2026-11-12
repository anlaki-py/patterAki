import { documentSchema, type PatternDocument } from "../document/schema";
import { db, type ProjectDatabase } from "./projects";
import { repository } from "./repository";

export type SavedProject = {
  id: string;
  name: string;
  updatedAt: number;
  issue?: string;
};

/** Local-only project catalog. Opening validates the entire document before loading. */
export async function listSavedProjects(
  database: ProjectDatabase = db,
): Promise<SavedProject[]> {
  const rows = (await database.projects.toArray()).sort(
    (a, b) =>
      (Number.isFinite(b.updatedAt) ? b.updatedAt : 0) -
        (Number.isFinite(a.updatedAt) ? a.updatedAt : 0) ||
      a.id.localeCompare(b.id),
  );
  return rows.map(({ id, document, updatedAt }) => ({
    id,
    name:
      typeof document?.name === "string" ? document.name : "Invalid project",
    updatedAt,
    ...(!documentSchema.safeParse(document).success
      ? {
          issue:
            "Invalid or unsupported project. Export the stored JSON or open a recovery copy.",
        }
      : {}),
  }));
}

export async function getSavedProject(
  id: string,
  database: ProjectDatabase = db,
): Promise<PatternDocument> {
  return (await repository(database).open(id)).document;
}

export async function deleteSavedProject(
  id: string,
  database: ProjectDatabase = db,
): Promise<void> {
  await repository(database).observe(id);
  await repository(database).remove(id);
}
