import 'dotenv/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { classifyPriority } from './lib/groq.js';
import { PRIORITY_CHANNEL } from './lib/queue.js';

// Per the compose contract: exit quietly when there is nothing to do.
if (!process.env.REDIS_URL) {
  console.log('[worker] REDIS_URL not set - queue disabled, exiting');
  process.exit(0);
}

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const publisher = connection.duplicate();

const worker = new Worker(
  'priority-classify',
  async (job) => {
    const { msgId, room, message } = job.data;
    const priority = await classifyPriority(message);
    await publisher.publish(PRIORITY_CHANNEL, JSON.stringify({ msgId, room, priority }));
    return priority;
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 2)
  }
);

worker.on('completed', (job, result) => {
  console.log(`[worker] ${job.id} classified -> ${result}`);
});
worker.on('failed', (job, err) => {
  console.error(`[worker] ${job?.id || '?'} failed (attempt ${job?.attemptsMade}):`, err.message);
});

console.log(`[worker] running on queue 'priority-classify' (concurrency ${worker.opts.concurrency})`);

async function shutdown() {
  console.log('[worker] shutting down...');
  try {
    await worker.close();
    publisher.quit();
    connection.quit();
  } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
