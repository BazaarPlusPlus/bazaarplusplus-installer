import { base64ToBase64Url, base64UrlToBase64, bytesToBase64 } from './codec.ts';
import type { InstallationKeyPair } from './types.ts';

export async function generateInstallationKeyPair(): Promise<InstallationKeyPair> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('webcrypto_unavailable');
  }

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1])
    },
    true,
    ['sign', 'verify']
  );

  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    keyPair.publicKey
  )) as JsonWebKey;
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  );

  if (!jwk.n || !jwk.e) {
    throw new Error('installation_key_export_failed');
  }

  return {
    publicKey: {
      modulus_b64: base64UrlToBase64(jwk.n),
      exponent_b64: base64UrlToBase64(jwk.e)
    },
    privateKeyPkcs8B64: bytesToBase64(pkcs8)
  };
}

export function exportPrivateKeyToJwk(privateKeyPkcs8B64: string) {
  return {
    pkcs8_b64: privateKeyPkcs8B64,
    pkcs8_b64url: base64ToBase64Url(privateKeyPkcs8B64)
  };
}
