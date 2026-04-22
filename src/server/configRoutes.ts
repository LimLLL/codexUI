/**
 * Routes for reading and writing the raw ~/.codex/config.toml file.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function getConfigFilePath(): string {
  return join(getCodexHomeDir(), 'config.toml')
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/**
 * Handles config file routes for reading/writing ~/.codex/config.toml.
 *
 * @param req - Incoming HTTP request.
 * @param res - Server response.
 * @param url - Parsed request URL.
 * @param readJsonBody - Helper to parse JSON request body.
 * @returns True if the route was handled, false otherwise.
 */
export async function handleConfigRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: { readJsonBody: (req: IncomingMessage) => Promise<unknown> },
): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/codex-api/config-file') {
    const filePath = getConfigFilePath()
    try {
      const content = await readFile(filePath, 'utf8')
      setJson(res, 200, { content, path: filePath })
    } catch {
      setJson(res, 200, { content: '', path: filePath })
    }
    return true
  }

  if (req.method === 'PUT' && url.pathname === '/codex-api/config-file') {
    const filePath = getConfigFilePath()
    try {
      const payload = (await context.readJsonBody(req)) as Record<string, unknown> | null
      const content = typeof payload?.content === 'string' ? payload.content : ''
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, content, 'utf8')
      setJson(res, 200, { ok: true, path: filePath })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write config file'
      setJson(res, 500, { ok: false, error: message })
    }
    return true
  }

  return false
}
