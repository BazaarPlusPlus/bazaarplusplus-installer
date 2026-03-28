interface Env {
  RELEASES: KVNamespace;
  ACTIVITY_DB?: D1Database;
  RELEASE_KEY?: string;
}

interface ReleaseConfig {
  latestVersion?: string;
  websiteUrl?: string;
  title?: string;
  message?: string;
}

interface UpdateCheckRequest {
  installId?: string;
  machineId?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  arch?: string;
  locale?: string;
}

interface ClientActivityRecord {
  installId: string;
  machineId: string;
  appVersion: string;
  platform: string | null;
  osVersion: string | null;
  arch: string | null;
  locale: string | null;
  seenAt: string;
}

const MAX_INSTALL_ID_LENGTH = 64;
const MAX_VERSION_LENGTH = 32;
const MAX_METADATA_LENGTH = 32;

const jsonHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: jsonHeaders });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const body = await safeReadJson<UpdateCheckRequest>(request);
    const appVersion = body?.appVersion?.trim();
    if (!appVersion || !isValidSemanticVersion(appVersion)) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    const releaseKey = env.RELEASE_KEY?.trim() || "installer:release:stable";
    const releaseConfig = await readReleaseConfig(env.RELEASES, releaseKey);
    if (!isValidReleaseConfig(releaseConfig)) {
      return json({ ok: false, error: "release_not_configured" }, 503);
    }

    const updateAvailable =
      compareSemanticVersions(releaseConfig.latestVersion, appVersion) > 0;

    const activityRecord = buildClientActivityRecord(body, new Date().toISOString());
    if (activityRecord && env.ACTIVITY_DB) {
      ctx.waitUntil(persistClientActivity(env.ACTIVITY_DB, activityRecord));
    }

    return json({
      ok: true,
      updateAvailable,
      latestVersion: releaseConfig.latestVersion,
      websiteUrl: releaseConfig.websiteUrl,
      title: releaseConfig.title ?? null,
      message: releaseConfig.message ?? null,
    });
  },
};

export function buildClientActivityRecord(
  request: UpdateCheckRequest | null,
  seenAt: string,
): ClientActivityRecord | null {
  const installId = normalizeRequiredField(request?.installId, MAX_INSTALL_ID_LENGTH);
  const machineId = normalizeRequiredField(request?.machineId, MAX_INSTALL_ID_LENGTH);
  const appVersion = normalizeRequiredField(request?.appVersion, MAX_VERSION_LENGTH);
  if (!installId || !machineId || !appVersion) {
    return null;
  }

  return {
    installId,
    machineId,
    appVersion,
    platform: normalizeOptionalField(request?.platform, MAX_METADATA_LENGTH),
    osVersion: normalizeOptionalField(request?.osVersion, MAX_METADATA_LENGTH),
    arch: normalizeOptionalField(request?.arch, MAX_METADATA_LENGTH),
    locale: normalizeOptionalField(request?.locale, MAX_METADATA_LENGTH),
    seenAt,
  };
}

async function safeReadJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function readReleaseConfig(
  namespace: KVNamespace,
  key: string,
): Promise<ReleaseConfig | null> {
  const payload = await namespace.get(key, "json");
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return payload as ReleaseConfig;
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftSegments = normalizeVersion(left);
  const rightSegments = normalizeVersion(right);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const delta = (leftSegments[index] ?? 0) - (rightSegments[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function isValidSemanticVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version.trim());
}

export function isValidReleaseConfig(
  releaseConfig: ReleaseConfig | null,
): releaseConfig is ReleaseConfig & { latestVersion: string; websiteUrl: string } {
  return Boolean(
    releaseConfig?.websiteUrl?.trim() &&
    releaseConfig?.latestVersion &&
    isValidSemanticVersion(releaseConfig.latestVersion),
  );
}

export function buildUpsertStatement(record: ClientActivityRecord): {
  sql: string;
  params: (string | null)[];
} {
  return {
    sql: `
      INSERT INTO install_clients (
        install_id,
        machine_id,
        first_seen_at,
        last_seen_at,
        last_version,
        platform,
        os_version,
        arch,
        locale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(install_id) DO UPDATE SET
        machine_id = excluded.machine_id,
        last_seen_at = excluded.last_seen_at,
        last_version = excluded.last_version,
        platform = excluded.platform,
        os_version = excluded.os_version,
        arch = excluded.arch,
        locale = excluded.locale
    `,
    params: [
      record.installId,
      record.machineId,
      record.seenAt,
      record.seenAt,
      record.appVersion,
      record.platform,
      record.osVersion,
      record.arch,
      record.locale,
    ],
  };
}

async function persistClientActivity(
  database: D1Database,
  record: ClientActivityRecord,
): Promise<void> {
  const statement = buildUpsertStatement(record);
  await database.prepare(statement.sql).bind(...statement.params).run();
}

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .split(".")
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));
}

function normalizeRequiredField(
  value: string | undefined,
  maxLength: number,
): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeOptionalField(
  value: string | undefined,
  maxLength: number,
): string | null {
  return normalizeRequiredField(value, maxLength);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}
