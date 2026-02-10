import { Resend } from "resend";

/**
 * Default "from" address.  Uses Resend's sandbox sender which only
 * delivers to the account owner's email during development.  Replace
 * with your own verified domain in production.
 */
const FROM = "ForzaCars Rentals <onboarding@resend.dev>";

interface CancellationEmailParams {
  to: string;
  bookingId: string;
  refundCredits: number;
  refundPct: number;
}

/**
 * Send a booking-cancellation confirmation email via Resend.
 *
 * Non-critical: errors are logged but not re-thrown so they don't
 * block the cancel action itself.
 *
 * If RESEND_API_KEY is not set, the email is skipped silently.
 */
export async function sendCancellationEmail({
  to,
  bookingId,
  refundCredits,
  refundPct,
}: CancellationEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set, skipping cancellation email");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const pctDisplay = Math.round(refundPct * 100);

    await resend.emails.send({
      from: FROM,
      to,
      subject: "Booking Canceled — ForzaCars Rentals",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #111827;">Booking Canceled</h2>
          <p style="color: #374151;">
            Your booking <strong>${bookingId.slice(0, 8)}…</strong> has been
            successfully canceled.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Refund</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #111827;">
                ${refundCredits} credit${refundCredits !== 1 ? "s" : ""}
                (${pctDisplay}%)
              </td>
            </tr>
          </table>
          ${
            refundCredits === 0
              ? `<p style="color: #9ca3af; font-size: 14px;">
                   No refund was issued because the cancellation was within 1 hour
                   of the booking start time.
                 </p>`
              : ""
          }
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            ForzaCars Rentals — this is an automated message.
          </p>
        </div>
      `,
    });
  } catch (err) {
    // Non-critical: log and continue
    console.error("[email] Failed to send cancellation email:", err);
  }
}
