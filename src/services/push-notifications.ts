import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || '',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export function deliverPush(userIds, payload) {
  // delivering logic
  for (const userId of userIds) {
    // fetch subscriptions for the userId
    // send notification using webpush.sendNotification each endpoint
  }
}

