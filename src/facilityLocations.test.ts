import { describe, expect, it } from 'vitest';
import { coordinates, nearestFacilities } from './facilityLocations';
import { sampleTransactions, type Transaction } from './model';

const sample = sampleTransactions()[0];

function facility(id: string, latitude: number | null, longitude: number | null): Transaction {
  return { ...sample, id, latitude, longitude };
}

describe('facility coordinates', () => {
  it('accepts zero and geographic boundary coordinates', () => {
    expect(coordinates({ latitude: 0, longitude: 0 })).toEqual([0, 0]);
    expect(coordinates({ latitude: -90, longitude: 180 })).toEqual([-90, 180]);
  });

  it.each([
    [null, 0],
    [0, null],
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
    [91, 0],
    [0, -181],
  ])('rejects an invalid pair (%s, %s)', (latitude, longitude) => {
    expect(coordinates({ latitude, longitude })).toBeNull();
  });
});

describe('nearest facilities', () => {
  it('returns no results without a mapped selected facility', () => {
    expect(nearestFacilities(facility('selected', 0, null), [facility('mapped', 0, 0)])).toEqual([]);
  });

  it('excludes the selected ID and invalid records, orders ties by ID and caps the list at four', () => {
    const selected = facility('selected', 0, 0);
    const transactions = [
      facility('fifth', 0, 3),
      facility('b', 0, 0),
      facility('selected', 0, 0),
      facility('unmapped', null, 0),
      facility('fourth', 0, 2),
      facility('a', 0, 0),
      facility('third', 0, 1),
    ];
    const nearby = nearestFacilities(selected, transactions);

    expect(nearby.map(({ transaction }) => transaction.id)).toEqual(['a', 'b', 'third', 'fourth']);
    expect(nearby[0]).toMatchObject({ position: [0, 0], miles: 0 });
    expect(nearby[2].miles).toBeCloseTo(69.09, 2);
    expect(transactions[0].id).toBe('fifth');
  });

  it('finds the shorter path across the antimeridian', () => {
    const selected = facility('selected', 0, 179.8);
    const nearby = nearestFacilities(selected, [facility('west', 0, 178.8), facility('east', 0, -179.8)]);

    expect(nearby.map(({ transaction }) => transaction.id)).toEqual(['east', 'west']);
    expect(nearby[0].miles).toBeCloseTo(27.64, 2);
    expect(nearestFacilities(facility('selected', 0, 180), [facility('same', 0, -180)])[0].miles).toBe(0);
  });
});
