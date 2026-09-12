import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./collection";

export interface LocalConfig { rootDir: string }

const file = (userDataDir: string): string => join(userDataDir, "config.json");

export async function loadConfig(userDataDir: string): Promise<LocalConfig | null> {
  try {
    const value: unknown = JSON.parse(await fsp.readFile(file(userDataDir), "utf8"));
    if (typeof value === "object" && value !== null && typeof (value as LocalConfig).rootDir === "string") {
      return { rootDir: (value as LocalConfig).rootDir };
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("config: unreadable, ignored", e);
  }
  return null;
}

export async function saveConfig(userDataDir: string, config: LocalConfig): Promise<void> {
  await writeAtomic(file(userDataDir), JSON.stringify(config, null, 2) + "\n");
}
