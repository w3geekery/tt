import { NotificationDelivery, RecurringNotificationPattern } from '../models';

/** UI tri-state for how a notification is delivered. */
export type DeliveryChoice = 'silent' | 'bell' | 'voice';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Map a UI delivery choice + chosen voice into the optional fields the one-off
 * notification API expects. 'silent' -> omit delivery; voice only rides along
 * when the channel is 'voice'.
 */
export function deliveryPayload(
  choice: DeliveryChoice,
  voice: string,
): { delivery?: NotificationDelivery; voice?: string } {
  return {
    delivery: choice === 'silent' ? undefined : choice,
    voice: choice === 'voice' ? voice : undefined,
  };
}

/** Same mapping as deliveryPayload but using null (the recurring API persists null, not undefined). */
export function deliveryPayloadNullable(
  choice: DeliveryChoice,
  voice: string,
): { delivery: NotificationDelivery | null; voice: string | null } {
  return {
    delivery: choice === 'silent' ? null : choice,
    voice: choice === 'voice' ? voice : null,
  };
}

/** Human-readable schedule summary for a recurring reminder card. */
export function scheduleLabel(
  pattern: RecurringNotificationPattern,
  weekdays: number[],
  time: string,
): string {
  if (pattern === 'daily') return `Every day at ${time}`;
  if (pattern === 'weekdays') return `Mon-Fri at ${time}`;
  const days = [...weekdays].sort((a, b) => a - b).map(d => DOW[d]).join(', ');
  return `${days || '(no days)'} at ${time}`;
}

export function deliveryIcon(delivery: NotificationDelivery | null): string {
  if (delivery === 'voice') return 'record_voice_over';
  if (delivery === 'bell') return 'notifications_active';
  return 'notifications_none';
}

export function deliveryLabel(
  delivery: NotificationDelivery | null,
  voice: string | null,
  defaultVoice: string,
): string {
  if (delivery === 'voice') return `Voice — ${voice ?? defaultVoice}`;
  if (delivery === 'bell') return 'Bell';
  return 'Silent';
}

/** Validity gate for the recurring-reminder create form. Weekly needs >=1 day. */
export function canSaveReminder(
  title: string,
  time: string,
  pattern: RecurringNotificationPattern,
  weekdays: number[],
): boolean {
  return title.trim().length > 0 && !!time && (pattern !== 'weekly' || weekdays.length > 0);
}
