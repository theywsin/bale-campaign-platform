import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type GatewayOutcome = "SUCCEEDED" | "FAILED" | "CANCELED";

/** A verified gateway callback. */
export interface GatewayEvent {
  eventId: string;
  providerRef: string;
  outcome: GatewayOutcome;
  amountRials: string;
}

/**
 * Contract for payment gateways. A real gateway must also confirm the result with the gateway's
 * own verify API before reporting SUCCEEDED; a signed callback alone is not proof of payment.
 */
export interface PaymentGateway {
  readonly type: "MOCK";
  readonly testOnly: boolean;
  createPayment(input: { paymentId: string; amountRials: bigint }): { providerRef: string; redirectPath: string };
  /** Returns null when the signature or shape is invalid. */
  parseWebhook(signature: string | undefined, body: unknown): GatewayEvent | null;
}

function canonical(e: GatewayEvent): string {
  return [e.eventId, e.providerRef, e.outcome, e.amountRials].join(".");
}

/**
 * Test-only gateway. No money moves and no external service is contacted: the "checkout" is a page
 * in this panel, clearly labeled as a test, where the payer picks the outcome.
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly type = "MOCK" as const;
  readonly testOnly = true;

  constructor(private readonly secret: string) {}

  createPayment(input: { paymentId: string; amountRials: bigint }) {
    return { providerRef: `mock_${randomBytes(12).toString("hex")}`, redirectPath: `/billing/mock-checkout/${input.paymentId}` };
  }

  sign(event: GatewayEvent): string {
    return createHmac("sha256", this.secret).update(canonical(event)).digest("hex");
  }

  parseWebhook(signature: string | undefined, body: unknown): GatewayEvent | null {
    if (!signature || !/^[0-9a-f]{64}$/.test(signature) || typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    const { eventId, providerRef, outcome, amountRials } = b;
    if (
      typeof eventId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(eventId) ||
      typeof providerRef !== "string" || !/^mock_[0-9a-f]{24}$/.test(providerRef) ||
      (outcome !== "SUCCEEDED" && outcome !== "FAILED" && outcome !== "CANCELED") ||
      typeof amountRials !== "string" || !/^\d{1,15}$/.test(amountRials)
    ) {
      return null;
    }
    const event: GatewayEvent = { eventId, providerRef, outcome, amountRials };
    const expected = Buffer.from(this.sign(event), "hex");
    const given = Buffer.from(signature, "hex");
    return expected.length === given.length && timingSafeEqual(expected, given) ? event : null;
  }
}
