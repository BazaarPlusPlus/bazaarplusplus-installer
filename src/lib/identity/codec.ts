const MAGIC_TEXT = 'BPP1';
const HEADER_LENGTH = 12;
const CHECKSUM_LENGTH = 32;
const SUPPORTED_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const magicBytes = encoder.encode(MAGIC_TEXT);

function getCrypto(): Crypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('webcrypto_unavailable');
  }

  return crypto;
}

function encodeBase64Chunk(binary: string): string {
  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  return Buffer.from(binary, 'binary').toString('base64');
}

function decodeBase64Chunk(base64: string): string {
  if (typeof atob === 'function') {
    return atob(base64);
  }

  return Buffer.from(base64, 'base64').toString('binary');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return encodeBase64Chunk(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = decodeBase64Chunk(base64.trim());
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function base64UrlToBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;

  if (remainder === 0) {
    return normalized;
  }

  return normalized.padEnd(normalized.length + (4 - remainder), '=');
}

export function base64ToBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await getCrypto().subtle.digest('SHA-256', new Uint8Array(bytes));
  return new Uint8Array(digest);
}

function arraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export async function encodeEnvelope(
  payloadBytes: Uint8Array,
  options?: { version?: number; flags?: number }
): Promise<Uint8Array> {
  const version = options?.version ?? SUPPORTED_VERSION;
  const flags = options?.flags ?? 0;
  const checksum = await sha256(payloadBytes);
  const buffer = new Uint8Array(
    HEADER_LENGTH + payloadBytes.length + CHECKSUM_LENGTH
  );
  const view = new DataView(buffer.buffer);

  buffer.set(magicBytes, 0);
  view.setUint16(4, version, true);
  view.setUint16(6, flags, true);
  view.setUint32(8, payloadBytes.length, true);
  buffer.set(payloadBytes, HEADER_LENGTH);
  buffer.set(checksum, HEADER_LENGTH + payloadBytes.length);

  return buffer;
}

export async function decodeEnvelope(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < HEADER_LENGTH + CHECKSUM_LENGTH) {
    throw new Error('identity_envelope_too_short');
  }

  const magic = decoder.decode(bytes.subarray(0, 4));
  if (magic !== MAGIC_TEXT) {
    throw new Error('identity_envelope_magic_mismatch');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version !== SUPPORTED_VERSION) {
    throw new Error('identity_envelope_version_unsupported');
  }

  const payloadLength = view.getUint32(8, true);
  const expectedLength = HEADER_LENGTH + payloadLength + CHECKSUM_LENGTH;
  if (bytes.length !== expectedLength) {
    throw new Error('identity_envelope_length_mismatch');
  }

  const payloadBytes = bytes.subarray(HEADER_LENGTH, HEADER_LENGTH + payloadLength);
  const expectedChecksum = bytes.subarray(HEADER_LENGTH + payloadLength);
  const actualChecksum = await sha256(payloadBytes);

  if (!arraysEqual(expectedChecksum, actualChecksum)) {
    throw new Error('identity_envelope_checksum_mismatch');
  }

  return payloadBytes;
}

export async function encodePayloadEnvelope<T>(payload: T): Promise<Uint8Array> {
  return encodeEnvelope(encoder.encode(JSON.stringify(payload)));
}

export async function decodePayloadEnvelope<T>(bytes: Uint8Array): Promise<T> {
  const payloadBytes = await decodeEnvelope(bytes);
  return JSON.parse(decoder.decode(payloadBytes)) as T;
}
