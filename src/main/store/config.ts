import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { localSettingsFrom, type LocalConfig } from "../../shared/types";
import { writeAtomic } from "./collection";

const file = (userDataDir: string): string => join(userDataDir, "config.json");

/** A config.json holding only rootDir (every install before the settings existed) comes back with the default settings. */
export async function loadConfig(userDataDir: string): Promise<LocalConfig | null> {
  try {
    const value: unknown = JSON.parse(await fsp.readFile(file(userDataDir), "utf8"));
    if (typeof value === "object" && value !== null && typeof (value as LocalConfig).rootDir === "string") {
      const v = value as Record<string, unknown>;
      return { ...localSettingsFrom(v), rootDir: v.rootDir as string };
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("config: unreadable, ignored", e);
  }
  return null;
}

export async function saveConfig(userDataDir: string, config: LocalConfig): Promise<void> {
  await writeAtomic(file(userDataDir), JSON.stringify(config, null, 2) + "\n");
}
