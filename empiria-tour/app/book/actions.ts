'use server';

import { cookies, headers } from 'next/headers';
import { randomUUID } from 'crypto';
import {
  claimSeats,
  createBooking,
  extendHold,
  lookupPromotion,
  releaseHold,
  type BookingDraft,
  type CreateBookingResult,
  type HoldResult,
} from '@/lib/booking';
import { getUser } from '@/lib/auth';

/**
 * Server actions for the booking flow.
 *
 * Booking is deliberately open to guests. Requiring an account before somebody
 * can hold a seat is the single most reliable way to lose the sale, and the
 * schema was built for it: `booking_holds.session_token` and a nullable
 * `bookings.user_id`. A signed-in traveller still gets their booking attached to
 * their account, so A7 can list it.
 */

const SESSION_COOKIE = 'empiria_booking_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // a day is far longer than any hold

/**
 * The identity a hold belongs to.
 *
 * httpOnly, so a script on the page cannot read it and cannot steal somebody
 * else's held seats: every hold operation is scoped by this token, and the token
 * never reaches JavaScript.
 */
async function bookingSession(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const token = randomUUID();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return token;
}

export async function holdSeatsAction(
  departureId: string,
  seats: number
): Promise<HoldResult> {
  const token = await bookingSession();
  const user = await getUser();
  return claimSeats(departureId, seats, token, user?.id ?? null);
}

export async function extendHoldAction(holdId: string): Promise<string | null> {
  const token = await bookingSession();
  return extendHold(holdId, token);
}

export async function releaseHoldAction(holdId: string): Promise<boolean> {
  const token = await bookingSession();
  return releaseHold(holdId, token);
}

/**
 * Validate a promotion code without revealing anything about codes that do not
 * apply. `promotions` has no public read policy precisely so codes cannot be
 * enumerated from the browser, and this action keeps that true: one code in,
 * one yes or no out.
 */
export async function applyPromotionAction(
  code: string,
  packageId: string,
  currency: string
): Promise<{ id: string; code: string; discountType: 'percent' | 'fixed'; discountValue: number } | null> {
  if (!code.trim()) return null;
  return lookupPromotion(code, packageId, currency);
}

export type SubmitInput = Omit<
  BookingDraft,
  'sessionToken' | 'userId' | 'ipAddress' | 'userAgent'
>;

/**
 * Create the booking.
 *
 * Everything that identifies *who* is doing this — session token, user, IP,
 * user agent — is read here rather than accepted from the client. The IP and
 * user agent go into `booking_acknowledgements`, where their whole value is
 * being evidence; a client-supplied one would be evidence of nothing.
 */
export async function submitBookingAction(input: SubmitInput): Promise<CreateBookingResult> {
  const token = await bookingSession();
  const user = await getUser();
  const h = await headers();

  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null;

  return createBooking({
    ...input,
    sessionToken: token,
    userId: user?.id ?? null,
    ipAddress: ip,
    userAgent: h.get('user-agent'),
  });
}
