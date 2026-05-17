import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin-app";
import { sendLowBalanceWarning } from "@/lib/notifications/email";
import type { CreditLedgerTrigger } from "@/lib/types";

export async function deductSaasCredit(params: {
  businessSlug: string;
  bookingId: string;
  trigger: CreditLedgerTrigger;
  biz: Record<string, unknown>;
}): Promise<void> {
  const { businessSlug, bookingId, trigger, biz } = params;
  if (typeof biz.saas_credit_balance !== "number") return;

  const balanceBefore = biz.saas_credit_balance;
  const balanceAfter = balanceBefore - 1;
  const bizRef = adminDb.collection("businesses").doc(businessSlug);

  await Promise.all([
    bizRef.update({ saas_credit_balance: FieldValue.increment(-1) }),
    bizRef.collection("credit_ledger").add({
      businessSlug,
      bookingId,
      trigger,
      balanceBefore,
      balanceAfter,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  if (balanceAfter === 5 || balanceAfter === 0) {
    sendLowBalanceWarning({
      businessEmail: (biz.email as string) ?? "",
      businessName: (biz.name as string) ?? "",
      businessSlug,
      balance: balanceAfter,
    }).catch((err) => console.error("[ledger] low balance warning:", err));
  }
}
