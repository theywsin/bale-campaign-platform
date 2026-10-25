import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

/**
 * Argon2id with parameters above the OWASP minimum (m=19 MiB, t=2, p=1).
 * Changing these is safe: existing hashes carry their own parameters and are
 * transparently re-hashed on next login via `needsRehash`.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 3, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Precomputed hash used to keep login timing similar for unknown e-mails. */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }

  /** Spends the same work as a real verification, for unknown accounts. */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= argon2.hash("dummy-password-for-timing", OPTIONS);
    await this.verify(await this.dummyHash, password);
  }
}
