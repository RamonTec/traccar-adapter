import type { z } from 'zod';
import type {
  NormalizeContext,
  NormalizeResult,
  RejectionReason,
  TelemetryEvent,
} from './telemetry-event.js';
import {
  traccarEventPayloadSchema,
  traccarPositionPayloadSchema,
} from './traccar-payload.schema.js';
import { knotsToKmh } from './units.js';

const MAX_DETAIL_ISSUES = 5;

export function normalizePosition(
  payload: unknown,
  ctx: NormalizeContext,
): NormalizeResult {
  const groupId = groupIdOf(payload);
  if (groupId === undefined) {
    return reject('MISSING_GROUP', 'device.groupId: missing');
  }

  const parsed = traccarPositionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('SCHEMA_MISMATCH', issuesDetail(parsed.error));
  }

  const { position, device } = parsed.data;
  if (position.deviceId !== device.id) {
    return reject('SCHEMA_MISMATCH', 'position.deviceId: mismatch');
  }

  const fixTime = iso(position.fixTime);
  return accept({
    ...envelope(ctx, fixTime),
    id: `traccar-position-${device.id}-${Date.parse(position.fixTime)}`,
    type: 'position.reported',
    data: {
      positionId: position.id || null,
      deviceId: device.id,
      groupId,
      fixTime,
      deviceTime: iso(position.deviceTime),
      serverTime: iso(position.serverTime),
      valid: position.valid,
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: position.altitude,
      speedKmh: knotsToKmh(position.speed),
      course: position.course,
      accuracy: position.accuracy,
      attributes: position.attributes,
    },
  });
}

export function normalizeEvent(
  payload: unknown,
  ctx: NormalizeContext,
): NormalizeResult {
  const groupId = groupIdOf(payload);
  if (groupId === undefined) {
    return reject('MISSING_GROUP', 'device.groupId: missing');
  }

  const parsed = traccarEventPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('SCHEMA_MISMATCH', issuesDetail(parsed.error));
  }

  const { event, device } = parsed.data;
  if (event.deviceId !== device.id) {
    return reject('SCHEMA_MISMATCH', 'event.deviceId: mismatch');
  }

  const eventTime = iso(event.eventTime);
  return accept({
    ...envelope(ctx, eventTime),
    id: `traccar-event-${event.id}`,
    type: 'device.event',
    data: {
      eventId: event.id,
      eventType: event.type,
      deviceId: device.id,
      groupId,
      eventTime,
      positionId: event.positionId || null,
      attributes: event.attributes,
    },
  });
}

function envelope(ctx: NormalizeContext, occurredAt: string) {
  return {
    version: 1,
    source: 'traccar',
    occurredAt,
    receivedAt: ctx.receivedAt.toISOString(),
    correlationId: ctx.correlationId,
  } as const;
}

/** device.groupId when it is a usable group: 0, null or absent mean "no group". */
function groupIdOf(payload: unknown): number | undefined {
  if (!isRecord(payload) || !isRecord(payload.device)) return undefined;
  const { groupId } = payload.device;
  return typeof groupId === 'number' && groupId !== 0 ? groupId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Paths and codes only: values may carry personal data and never reach the detail.
function issuesDetail(error: z.ZodError): string {
  return error.issues
    .slice(0, MAX_DETAIL_ISSUES)
    .map((issue) => `${issue.path.join('.')}: ${issue.code}`)
    .join('; ');
}

function iso(date: string): string {
  return new Date(date).toISOString();
}

function accept(event: TelemetryEvent): NormalizeResult {
  return { ok: true, event };
}

function reject(reason: RejectionReason, detail: string): NormalizeResult {
  return { ok: false, rejection: { reason, detail } };
}
