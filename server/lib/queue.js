import { Queue } from 'bullmq';
import Redis from 'ioredis';
import env from '../config/env.js';

export const PRIORITY_CHANNEL = 'chat:priority';
const QUEUE_NAME = 'priority-classify';
const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500
};

// ponytail: dedicated connections per role (queue producer, publisher,
// subscriber, worker) - BullMQ needs maxRetriesPerRequest:null and blocking
// reads; sharing the presence client would starve it.
function conn() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

let queue = null;
export function getQueue() {
  if (!env.REDIS_URL) return null;
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: conn() });
  return queue;
}

let publisher = null;
function getPublisher() {
  if (!publisher) publisher = conn();
  return publisher;
}

export async function enqueueClassification(job) {
  const q = getQueue();
  if (!q) return false;
  await q.add('classify', job, JOB_OPTS);
  return true;
}

export function publishPriority(payload) {
  if (!env.REDIS_URL) return Promise.resolve();
  return getPublisher()
    .publish(PRIORITY_CHANNEL, JSON.stringify(payload))
    .then(() => undefined);
}

export function subscribeToPriorities(handler) {
  if (!env.REDIS_URL) return null;
  const sub = conn();
  sub.on('error', (e) => console.error('[priority-sub] error:', e.message));
  sub.subscribe(PRIORITY_CHANNEL)
    .then(() => console.log(`[priority-sub] listening on ${PRIORITY_CHANNEL}`))
    .catch((e) => console.error('[priority-sub] subscribe failed:', e.message));
  sub.on('message', (channel, raw) => {
    if (channel !== PRIORITY_CHANNEL) return;
    try {
      handler(JSON.parse(raw));
    } catch (e) {
      console.error('[priority-sub] bad payload:', e.message);
    }
  });
  return sub;
}
