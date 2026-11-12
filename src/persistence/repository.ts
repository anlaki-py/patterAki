import { documentSchema, type PatternDocument } from "../document/schema";
import { parseEditorSettings, type EditorSettings } from "../editor/settings";
import { db, type ProjectDatabase, type ProjectRow } from "./database";
import { projectSettings, recoveryEnabled } from "./preferences";

export class ProjectConflictError extends Error {
  constructor() {
    super(
      "Conflict: this project changed or was deleted in another tab. Export JSON, save a recovery copy, or reload the saved version.",
    );
  }
}
type Token = { revision: number; fingerprint: string };
function token(row: ProjectRow): Token {
  const revision = row.revision === undefined ? 0 : row.revision;
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error(
      "Invalid stored project revision. Export the stored record before recovering.",
    );
  return { revision, fingerprint: JSON.stringify(row.document) };
}
function matches(row: ProjectRow | undefined, expected: Token | undefined) {
  return (
    row &&
    expected &&
    token(row).revision === expected.revision &&
    JSON.stringify(row.document) === expected.fingerprint
  );
}
const listeners = new Set<(id: string) => void>();
export function onProjectWrite(listener: (id: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Each instance is one tab's observed versions; the transaction is the final write guard. */
export class ProjectRepository {
  private epochs = new Map<string, number>();
  private observed = new Map<string, Token>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private database: ProjectDatabase) {}
  private queue<T>(action: () => Promise<T>): Promise<T> {
    const job = this.pending.then(action);
    this.pending = job.catch(() => undefined);
    return job;
  }
  async open(id: string) {
    return this.database.transaction(
      "r",
      [
        this.database.projects,
        this.database.projectSettings,
        this.database.settings,
      ],
      async () => {
        const row = await this.database.projects.get(id);
        if (!row) throw new Error("This saved project no longer exists.");
        const document = documentSchema.parse(row.document);
        if (document.id !== row.id)
          throw new Error("Stored project identity does not match its record.");
        const settings = await projectSettings(id, this.database);
        this.epochs.set(id, (this.epochs.get(id) ?? 0) + 1);
        this.observed.set(id, token(row));
        return { document, settings };
      },
    );
  }
  async observe(id: string) {
    const row = await this.database.projects.get(id);
    if (!row) throw new Error("This saved project no longer exists.");
    this.epochs.set(id, (this.epochs.get(id) ?? 0) + 1);
    this.observed.set(id, token(row));
    return row;
  }
  async conflicted(id: string) {
    const row = await this.database.projects.get(id),
      expected = this.observed.get(id);
    return expected ? !matches(row, expected) : !!row;
  }
  save(document: PatternDocument, settings?: EditorSettings) {
    const snapshot = documentSchema.parse(document);
    const epoch = this.epochs.get(snapshot.id) ?? 0;
    const preferences = settings ? parseEditorSettings(settings) : undefined;
    return this.queue(async () => {
      const result = await this.database.transaction(
        "rw",
        [
          this.database.projects,
          this.database.projectSettings,
          this.database.preferences,
          this.database.checkpoints,
        ],
        async () => {
          const previous = await this.database.projects.get(snapshot.id),
            expected = this.observed.get(snapshot.id);
          if (
            (this.epochs.get(snapshot.id) ?? 0) !== epoch ||
            (previous ? !matches(previous, expected) : !!expected)
          )
            throw new ProjectConflictError();
          const oldSettings = await this.database.projectSettings.get(
            snapshot.id,
          );
          const same =
            previous &&
            JSON.stringify(previous.document) === JSON.stringify(snapshot) &&
            (!preferences ||
              JSON.stringify(oldSettings?.value) ===
                JSON.stringify(preferences));
          const revision = same
            ? token(previous).revision
            : (previous ? token(previous).revision : 0) + 1;
          if (!Number.isSafeInteger(revision))
            throw new Error(
              "Project revision limit reached. Save as a new project.",
            );
          if (!same)
            await this.database.projects.put({
              id: snapshot.id,
              document: snapshot,
              revision,
              updatedAt: Date.now(),
            });
          if (preferences)
            await this.database.projectSettings.put({
              id: snapshot.id,
              version: 1,
              value: preferences,
            });
          const changedDocument =
            !previous ||
            JSON.stringify(previous.document) !== JSON.stringify(snapshot);
          if (changedDocument && (await recoveryEnabled(this.database))) {
            await this.database.checkpoints.put({
              id: `${snapshot.id}:${revision}`,
              projectId: snapshot.id,
              revision,
              savedAt: Date.now(),
              document: snapshot,
            });
            const points = await this.database.checkpoints
              .where("projectId")
              .equals(snapshot.id)
              .sortBy("revision");
            await this.database.checkpoints.bulkDelete(
              points.slice(0, -5).map((point) => point.id),
            );
          }
          return { revision, fingerprint: JSON.stringify(snapshot) };
        },
      );
      this.observed.set(snapshot.id, result);
      listeners.forEach((listener) => listener(snapshot.id));
    });
  }
  remove(id: string) {
    return this.queue(async () => {
      await this.database.transaction(
        "rw",
        [
          this.database.projects,
          this.database.projectSettings,
          this.database.preferences,
          this.database.checkpoints,
        ],
        async () => {
          const row = await this.database.projects.get(id);
          if (!row) throw new Error("This saved project no longer exists.");
          if (!matches(row, this.observed.get(id)))
            throw new ProjectConflictError();
          await this.database.projects.delete(id);
          await this.database.projectSettings.delete(id);
          await this.database.checkpoints
            .where("projectId")
            .equals(id)
            .delete();
          const active = await this.database.preferences.get("last-project");
          if (
            active &&
            typeof active.value === "object" &&
            active.value &&
            "projectId" in active.value &&
            active.value.projectId === id
          )
            await this.database.preferences.delete("last-project");
        },
      );
      // Retain the old token so queued/stale saves cannot resurrect a deleted project.
      listeners.forEach((listener) => listener(id));
    });
  }
}
const repositories = new WeakMap<ProjectDatabase, ProjectRepository>();
export function repository(database = db) {
  let value = repositories.get(database);
  if (!value) {
    value = new ProjectRepository(database);
    repositories.set(database, value);
  }
  return value;
}
