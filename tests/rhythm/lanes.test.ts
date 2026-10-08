import { describe, expect, it } from 'vitest';
import { LANES, mapLanes } from '../../src/rhythm/lanes.js';

describe('mapLanes', () => {
  it('builds one value per lane', () => {
    expect(mapLanes((lane) => lane * 10)).toEqual({ 0: 0, 1: 10, 2: 20, 3: 30 });
  });

  it('covers every lane in LANES', () => {
    const lanes = mapLanes((lane) => lane);
    expect(LANES.map((lane) => lanes[lane])).toEqual([...LANES]);
  });
});
