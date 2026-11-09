import type { Transaction } from './model';

type Coordinates = [latitude: number, longitude: number];
type Location = Pick<Transaction, 'latitude' | 'longitude'>;

export type NearbyFacility = {
  transaction: Transaction;
  position: Coordinates;
  miles: number;
};

const EARTH_RADIUS_MILES = 3958.76;
const RADIANS_PER_DEGREE = Math.PI / 180;
const NEARBY_FACILITY_LIMIT = 4;

export function coordinates({ latitude, longitude }: Location): Coordinates | null {
  if (latitude === null || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      longitude === null || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return null;
  }
  return [latitude, longitude];
}

function distanceInMiles([latitude, longitude]: Coordinates, [otherLatitude, otherLongitude]: Coordinates): number {
  const latitudeDelta = (otherLatitude - latitude) * RADIANS_PER_DEGREE;
  const longitudeDifference = Math.abs(otherLongitude - longitude);
  const longitudeDelta = Math.min(longitudeDifference, 360 - longitudeDifference) * RADIANS_PER_DEGREE;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude * RADIANS_PER_DEGREE) * Math.cos(otherLatitude * RADIANS_PER_DEGREE) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function nearestFacilities(selected: Location & Pick<Transaction, 'id'>, transactions: Transaction[]): NearbyFacility[] {
  const origin = coordinates(selected);
  if (!origin) return [];

  const nearby: NearbyFacility[] = [];
  for (const transaction of transactions) {
    if (transaction.id === selected.id) continue;
    const position = coordinates(transaction);
    if (!position) continue;
    nearby.push({ transaction, position, miles: distanceInMiles(origin, position) });
  }

  nearby.sort((a, b) => {
    if (a.miles !== b.miles) return a.miles - b.miles;
    const firstId = a.transaction.id;
    const secondId = b.transaction.id;
    if (firstId === secondId) return 0;
    return firstId < secondId ? -1 : 1;
  });
  return nearby.slice(0, NEARBY_FACILITY_LIMIT);
}
