import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const socketStub = {
  connected: true,
  id: 'socket-test-client',
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn()
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socketStub)
}));

beforeAll(() => {
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');

    if (url.includes('/api/auth/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          authenticated: false,
          user: null
        }),
        text: async () => ''
      };
    }

    if (url.includes('/api/forum/feed')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          posts: []
        }),
        text: async () => ''
      };
    }

    if (url.includes('/api/forum/library')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          savedRulesets: [],
          savedGames: [],
          matchHistory: [],
          bookmarkedRulesetPosts: []
        }),
        text: async () => ''
      };
    }

    if (url.includes('/api/notifications')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          notifications: [],
          unreadCount: 0
        }),
        text: async () => ''
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => ''
    };
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });

  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  globalThis.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
