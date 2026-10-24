import type { IslandWays } from '../waypoints';

/**
 * Anchorage Cay's routes for the compass (src/game/wayfinding/): the quay along the basin, the pier
 * out to the gangway by the crane (round the crew who stand on it; the crane's levers close its end), the lane to Suri's mill, the village streets from the plaza, the lighthouse path,
 * and the open sand down to the lagoon. At sea: the coast round the cay, its lagoon reef and the pier,
 * with the basin open to the north and a lane in to the berth.
 */
export const ANCHORAGE_WAYS: IslandWays = {
  walk: {
    nodes: [
      { id: 'pier.gangway', x: -107.8, y: 1.8, z: -111 },
      // Weaving past the crew who stand on the pier: between Pim and Pol, then west of Juno.
      { id: 'pier.crane', x: -108, y: 1.8, z: -105.5 },
      { id: 'pier.juno', x: -108.95, y: 1.8, z: -101.6 },
      { id: 'pier.mid', x: -107.8, y: 1.8, z: -94 },
      { id: 'pier.foot', x: -108, y: 1.8, z: -78 },
      { id: 'quay.pier', x: -108, y: 2.4, z: -70 },
      // Along the basin's edge, clear of the palette stand, the stalls and the bollards.
      { id: 'quay.palette', x: -100, y: 2.4, z: -72.8 },
      { id: 'quay.stalls', x: -92.3, y: 2.4, z: -73.3 },
      { id: 'quay.market', x: -80.3, y: 2.4, z: -73 },
      { id: 'quay.e', x: -78, y: 2.4, z: -71.5 },
      { id: 'mill.gate', x: -66.4, y: 1.9, z: -62.9 },
      { id: 'mill', x: -64, y: 2.6, z: -61 },
      { id: 'quay.w', x: -148, y: 2.4, z: -70 },
      { id: 'lighthouse', x: -163, y: 4.5, z: -88.5 },
      { id: 'plaza', x: -112.5, y: 2.7, z: -51 },
      { id: 'street.s', x: -117, y: 3.3, z: -24 },
      { id: 'lagoon', x: -25, y: 1.7, z: 82 },
    ],
    legs: [
      ['pier.gangway', 'pier.crane'],
      ['pier.crane', 'pier.juno'],
      ['pier.juno', 'pier.mid'],
      ['pier.mid', 'pier.foot'],
      ['pier.foot', 'quay.pier'],
      ['quay.pier', 'quay.palette'],
      ['quay.palette', 'quay.stalls'],
      ['quay.stalls', 'quay.market'],
      ['quay.market', 'quay.e'],
      ['quay.e', 'mill.gate'],
      ['mill.gate', 'mill'],
      ['quay.pier', 'quay.w'],
      ['quay.w', 'lighthouse'],
      ['quay.pier', 'plaza'],
      ['plaza', 'street.s'],
      ['street.s', 'lagoon'],
    ],
  },
  sea: {
    coasts: [
      [
        { x: -48, z: -168 },
        { x: 0, z: -175 },
        { x: 100, z: -162 },
        { x: 185, z: -128 },
        { x: 255, z: -60 },
        { x: 258, z: 72 },
        { x: 205, z: 100 },
        { x: 155, z: 175 },
        { x: 115, z: 270 },
        { x: 0, z: 305 },
        { x: -115, z: 270 },
        { x: -155, z: 172 },
        { x: -160, z: 100 },
        { x: -228, z: 32 },
        { x: -232, z: -48 },
        { x: -205, z: -122 },
        { x: -185, z: -146 },
        { x: -115, z: -130 },
        { x: -104.5, z: -130 },
        { x: -104.5, z: -80 },
        { x: -62, z: -80 },
      ],
      // The rock off the lagoon's east reef.
      [
        { x: 245, z: 190 },
        { x: 282, z: 190 },
        { x: 282, z: 225 },
        { x: 245, z: 225 },
      ],
    ],
    lanes: [
      { x: -100, z: -150 },
      { x: -96, z: -205 },
    ],
  },
};
