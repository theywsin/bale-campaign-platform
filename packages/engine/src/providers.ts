import { BaleBotProvider, CredentialsCipher, MockMessagingProvider, type MessagingProvider } from "@bcp/messaging";
import type { AccountForSend } from "./dispatch";

export interface ProviderOptions {
  mockEnabled: boolean;
  /** base64 key for bot tokens; without it Bale accounts cannot send. */
  credentialsKey?: string;
  baleApiBaseUrl: string;
}

/** Builds the provider for an account, or a Persian reason why it cannot send. */
export function providerResolver(opts: ProviderOptions): (account: AccountForSend) => MessagingProvider | { unavailable: string } {
  const mock = new MockMessagingProvider();
  const cipher = opts.credentialsKey ? new CredentialsCipher(opts.credentialsKey) : null;
  return (account) => {
    if (account.provider === "MOCK") {
      return opts.mockEnabled ? mock : { unavailable: "حساب آزمایشی (Mock) در این استقرار غیرفعال است." };
    }
    if (!cipher) return { unavailable: "اتصال بله در این استقرار پیکربندی نشده است (کلید رمزنگاری تنظیم نشده)." };
    if (!account.credentialsEncrypted) return { unavailable: "برای حساب بازوی بله توکنی ثبت نشده است." };
    try {
      return new BaleBotProvider(cipher.decrypt(account.credentialsEncrypted, account.id), opts.baleApiBaseUrl);
    } catch {
      // Never include the error: it could relate to the secret.
      return { unavailable: "توکن ذخیره‌شده حساب بازو قابل استفاده نیست. توکن را دوباره ثبت کنید." };
    }
  };
}
