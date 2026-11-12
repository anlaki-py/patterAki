import { z } from "zod";
import { db, type ProjectDatabase } from "./database";
import {
  defaultSettings,
  parseEditorSettings,
  type EditorSettings,
} from "../editor/settings";
const activeSchema = z
  .object({ version: z.literal(1), projectId: z.string().min(1) })
  .strict();
const recoverySchema = z
  .object({ version: z.literal(1), enabled: z.boolean() })
  .strict();
export async function lastProjectId(database = db) {
  const row = await database.preferences.get("last-project");
  return row ? activeSchema.parse(row.value).projectId : undefined;
}
export async function rememberProject(projectId: string, database = db) {
  await database.preferences.put({
    id: "last-project",
    value: activeSchema.parse({ version: 1, projectId }),
  });
}
export async function recoveryEnabled(database = db) {
  const row = await database.preferences.get("recovery");
  return row ? recoverySchema.parse(row.value).enabled : true;
}
export async function setRecoveryEnabled(enabled: boolean, database = db) {
  await database.preferences.put({
    id: "recovery",
    value: recoverySchema.parse({ version: 1, enabled }),
  });
}
export async function projectSettings(
  projectId: string,
  database: ProjectDatabase = db,
): Promise<EditorSettings> {
  const row = await database.projectSettings.get(projectId);
  if (row) {
    if (row.version !== 1)
      throw new Error(
        "Unsupported project preference version. Your geometry is unchanged.",
      );
    return parseEditorSettings(row.value);
  }
  const legacy = await database.settings.get("editor");
  return legacy
    ? parseEditorSettings(legacy.value)
    : structuredClone(defaultSettings);
}
