export interface Ship {
  id: string
  name: string
  holds: number
  shields: number
  fighters: number
  cost: number
  description: string
}

export const STARTER_SHIPS: Ship[] = [
  {
    id: 'scout_wasp',
    name: 'Wasp Scout',
    holds: 5,
    shields: 10,
    fighters: 0,
    cost: 500,
    description: 'A small, fast scout ship with limited cargo.'
  },
  {
    id: 'trader_hauler',
    name: 'Hauler',
    holds: 20,
    shields: 5,
    fighters: 0,
    cost: 1000,
    description: 'A slow but sturdy merchant vessel.'
  },
  {
    id: 'frigate_falcon',
    name: 'Falcon Frigate',
    holds: 10,
    shields: 50,
    fighters: 5,
    cost: 2500,
    description: 'A combat-oriented frigate with fighter bays.'
  }
]
