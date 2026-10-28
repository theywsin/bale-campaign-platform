import { MockPaymentGateway } from "./payment-gateway";

const gw = new MockPaymentGateway("x".repeat(32));

describe("MockPaymentGateway", () => {
  it("accepts only correctly signed events", () => {
    const { providerRef, redirectPath } = gw.createPayment({ paymentId: "p1", amountRials: 1000n });
    expect(redirectPath).toBe("/billing/mock-checkout/p1");
    const event = { eventId: "evt_12345678", providerRef, outcome: "SUCCEEDED" as const, amountRials: "1000" };
    const sig = gw.sign(event);
    expect(gw.parseWebhook(sig, event)).toEqual(event);
    expect(gw.parseWebhook(sig, { ...event, amountRials: "1" })).toBeNull();
    expect(gw.parseWebhook(sig, { ...event, outcome: "FAILED" })).toBeNull();
    expect(gw.parseWebhook(undefined, event)).toBeNull();
    expect(gw.parseWebhook("00".repeat(32), event)).toBeNull();
    expect(new MockPaymentGateway("y".repeat(32)).parseWebhook(sig, event)).toBeNull();
  });
});
