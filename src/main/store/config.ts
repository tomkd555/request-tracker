import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { localSettingsFrom, type LocalConfig } from "../../shared/types";
import { errorCode, toJsonText, writeAtomic } from "./collection";

const configPath = (userDataDir: string): string => join(userDataDir, "config.json");

/** A config.json holding only rootDir (every install before the settings existed) comes back with the default settings. */
export async function loadConfig(userDataDir: string): Promise<LocalConfig | null> {
  try {
    const value: unknown = JSON.parse(await fsp.readFile(configPath(userDataDir), "utf8"));
    if (typeof value === "object" && value !== null) {
      const stored = value as Record<string, unknown>;
      if (typeof stored.rootDir === "string") return { ...localSettingsFrom(stored), rootDir: stored.rootDir };
    }
  } catch (e) {
    if (errorCode(e) !== "ENOENT") console.error("config: unreadable, ignored", e);
  }
  return null;
}

export async function saveConfig(userDataDir: string, config: LocalConfig): Promise<void> {
  await writeAtomic(configPath(userDataDir), toJsonText(config));
}
