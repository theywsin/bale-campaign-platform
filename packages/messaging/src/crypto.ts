import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts provider credentials with AES-256-GCM. The 32-byte key comes from
 * the environment (CREDENTIALS_ENCRYPTION_KEY, base64) and never touches the
 * database. Format: `v1.<iv>.<tag>.<ciphertext>` (base64url parts).
 */
export class CredentialsCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    this.key = key;
  }

  encrypt(plain: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
  }

  /** `aad` binds the ciphertext to its row (e.g. the account id), so it cannot be copied to another account. */
  decrypt(payload: string, aad: string): string {
    const [version, iv, tag, data] = payload.split(".");
    if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("unsupported credentials format");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  }
}
