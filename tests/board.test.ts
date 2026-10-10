import { describe, expect, it } from 'vitest';
import { clampBoardOffset } from '../src/board/Board';

describe('board drag bounds', () => {
  it('keeps drag offsets inside the board bounds', () => {
    expect(clampBoardOffset(-20, 100)).toBe(0);
    expect(clampBoardOffset(120, 100)).toBe(100);
    expect(clampBoardOffset(40, 100)).toBe(40);
  });
});
