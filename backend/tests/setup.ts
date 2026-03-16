import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/msw-server';

// 'bypass' skips warnings for local supertest requests (127.0.0.1)
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
