import { describe, it, expect, vi } from 'vitest';
import { bootstrap } from '../bootstrap.js';

describe('bootstrap', () => {
  it('should be defined', () => {
    expect(typeof bootstrap).toBe('function');
  });
});
