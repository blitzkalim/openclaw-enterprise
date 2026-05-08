import pino from 'pino';

const logger = pino({ name: 'plugin-guard' });

export interface PluginManifest {
  name: string;
  version: string;
  team_safe?: boolean;
  description?: string;
}

/**
 * Assert that a plugin is marked as team_safe.
 * Throws an error if the plugin does not declare team_safe: true.
 */
export function assertPluginTeamSafe(manifest: PluginManifest): void {
  if (!manifest.team_safe) {
    const error = new Error(
      `[TeamMode] Plugin "${manifest.name}" blocked: manifest does not declare team_safe: true. ` +
      `Audit the plugin and add team_safe: true to its manifest.json to allow in team mode.`
    );
    logger.error({ plugin: manifest.name, version: manifest.version }, 'Plugin rejected: not team_safe');
    throw error;
  }
  
  logger.info({ plugin: manifest.name, version: manifest.version }, 'Plugin passed team_safe check');
}

/**
 * Create an fs proxy that routes through secureRead/secureWrite.
 */
export function createFsProxy(
  userId: string,
  secureRead: (userId: string, path: string) => Promise<string>,
  secureWrite: (userId: string, path: string, content: string, options?: any) => Promise<void>
): object {
  return {
    readFile: async (path: string, encoding = 'utf-8') => secureRead(userId, path),
    writeFile: async (path: string, content: string) => secureWrite(userId, path, content),
    appendFile: async (path: string, content: string) => secureWrite(userId, path, content, { append: true }),
    // Expose safe fs methods as no-ops or pass-through to local /tmp only
    stat: async () => ({ isFile: () => false, isDirectory: () => false }),
    mkdir: async () => {},
    readdir: async () => [],
  };
}
