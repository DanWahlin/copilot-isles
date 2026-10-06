/**
 * Anchorage Cay's village buildings (pure data, so the opening's chart miniature can stand them where
 * they really are without loading the village module).
 */
export type RoofType = 'gable' | 'hip' | 'thatch';

export interface BuildingSpec {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  floors: 1 | 2 | 3;
  colour: number;
  roof: RoofType;
  roofColour: number;
  stoneColour?: number;
  quay?: boolean;
  upperOffset?: { x: number; z: number };
  upperScale?: number;
  balcony?: boolean;
  awning?: number;
  sign?: number;
  chimney?: boolean;
  anchor?: string;
}

const DEG = Math.PI / 180;

export const BUILDINGS: readonly BuildingSpec[] = [
  {
    id: 'harbourmaster',
    x: -94,
    z: -63.6,
    w: 9.2,
    d: 8.3,
    rot: -8 * DEG,
    floors: 2,
    colour: 0x91aeb5,
    roof: 'hip',
    roofColour: 0xa86648,
    quay: true,
    balcony: true,
    sign: 0xd6b259,
    chimney: true,
    anchor: 'harbourmasterDoor',
  },
  {
    id: 'tavern',
    x: -124.8,
    z: -54.2,
    w: 10.8,
    d: 9.4,
    rot: 28 * DEG,
    floors: 3,
    colour: 0xb97868,
    roof: 'gable',
    roofColour: 0x9f5840,
    balcony: true,
    awning: 0xe4bd64,
    sign: 0xf2d17c,
    chimney: true,
    anchor: 'tavernDoor',
  },
  {
    id: 'chandlery',
    x: -139.5,
    z: -64.6,
    w: 9.4,
    d: 8.1,
    rot: 8 * DEG,
    floors: 2,
    colour: 0xbfa36e,
    roof: 'gable',
    roofColour: 0xa45f42,
    quay: true,
    awning: 0x4f9c8a,
    sign: 0xe6c67b,
    chimney: true,
    anchor: 'chandleryDoor',
  },
  {
    id: 'fish-market',
    x: -147.2,
    z: -51.6,
    w: 10.0,
    d: 7.4,
    rot: -19 * DEG,
    floors: 1,
    colour: 0xd8cdb4,
    roof: 'thatch',
    roofColour: 0xa99a71,
    stoneColour: 0xa09c8a,
    awning: 0x77aabd,
    sign: 0xd2c05e,
    anchor: 'fishMarketDoor',
  },
  {
    id: 'storehouse',
    x: -82.2,
    z: -50.4,
    w: 9.8,
    d: 10.6,
    rot: -31 * DEG,
    floors: 2,
    colour: 0xd0c7aa,
    roof: 'gable',
    roofColour: 0x9b6046,
    stoneColour: 0x9a9888,
    chimney: false,
    anchor: 'storehouseDoor',
  },
  {
    id: 'sky-blue-house',
    x: -106.8,
    z: -32.8,
    w: 8.2,
    d: 8.8,
    rot: -44 * DEG,
    floors: 2,
    colour: 0x8faebe,
    roof: 'hip',
    roofColour: 0xaa6a48,
    balcony: false,
    chimney: true,
  },
  {
    id: 'lime-cottage',
    x: -133.8,
    z: -32.6,
    w: 7.6,
    d: 7.2,
    rot: 42 * DEG,
    floors: 2,
    colour: 0xa2b48f,
    roof: 'thatch',
    roofColour: 0xaa9b6d,
    stoneColour: 0x999786,
    awning: 0xd1c48c,
  },
  {
    id: 'chartmaker',
    x: -117.4,
    z: -18.4,
    w: 8.5,
    d: 7.8,
    rot: -3 * DEG,
    floors: 2,
    colour: 0xd9ceb2,
    roof: 'gable',
    roofColour: 0xab6a49,
    balcony: true,
    sign: 0xf0d990,
    anchor: 'chartmakerDoor',
  },
  {
    id: 'cream-rowhouse',
    x: -150.5,
    z: -40.5,
    w: 7.4,
    d: 9.2,
    rot: 79 * DEG,
    floors: 2,
    colour: 0xdccfaf,
    roof: 'hip',
    roofColour: 0xa96547,
    balcony: false,
    chimney: true,
  },
  {
    id: 'green-leaning-house',
    x: -95.5,
    z: -24.1,
    w: 7.2,
    d: 7.7,
    rot: 25 * DEG,
    floors: 2,
    colour: 0x8faf96,
    roof: 'thatch',
    roofColour: 0xa89969,
    stoneColour: 0x969181,
  },
];
