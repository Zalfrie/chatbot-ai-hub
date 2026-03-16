import Redis from 'ioredis';
import { env } from './env';

class RedisClient {
  private static instance: Redis;

  static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis({
        host: env.REDIS_HOST,
        port: parseInt(env.REDIS_PORT),
        password: env.REDIS_PASSWORD,
        retryStrategy: (times) => {
          // Retry after 2 seconds, up to 5 times
          if (times > 5) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
      });

      // Log connection events
      RedisClient.instance.on('connect', () => {
        console.log('✅ Connected to Redis');
      });

      RedisClient.instance.on('error', (err) => {
        console.error('❌ Redis connection error:', err);
      });

      RedisClient.instance.on('close', () => {
        console.log('⚠️ Redis connection closed');
      });

      RedisClient.instance.on('reconnecting', () => {
        console.log('🔄 Reconnecting to Redis...');
      });
    }

    return RedisClient.instance;
  }

  static async disconnect(): Promise<void> {
    if (RedisClient.instance) {
      await RedisClient.instance.quit();
    }
  }
}

export const redis = RedisClient.getInstance();
export type RedisClientType = typeof redis;