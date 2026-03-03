export type Commodity = 'ore' | 'fuel' | 'equipment' | 'organics' | 'luxury' | 'contraband'

export interface PortPrice {
  buy: number
  sell: number
  stock: number
}

export type PortInventory = {
  [K in Commodity]?: PortPrice
}

export const BASE_PRICES: Record<Commodity, number> = {
  ore: 10,
  fuel: 20,
  equipment: 100,
  organics: 50,
  luxury: 500,
  contraband: 1000
}

export const getPortInventory = (portType: number): PortInventory => {
  const inventory: PortInventory = {}
  
  // Port Types from Plan.md:
  // 1 (BBS): Buys Ore, Sells Equipment
  // 2 (BSB): Buys Equipment, Sells Ore
  // 3 (SBB): Sells Ore, Sells Equipment, Buys Fuel
  // 4 (BBB): Buys everything (consumer world)
  // 5 (SSS): Sells everything (producer world)
  // 6 (Special): Black market, rare goods
  // 7 (SSB): Sells Ore, Sells Equipment, Buys Organics
  // 8 (BBS): Buys Organics, Buys Fuel, Sells Luxury

  const setup = (commodity: Commodity, type: 'buy' | 'sell' | 'both') => {
    const base = BASE_PRICES[commodity]
    inventory[commodity] = {
      buy: type === 'sell' ? -1 : Math.floor(base * 0.9), // Port buys from player
      sell: type === 'buy' ? -1 : Math.floor(base * 1.1), // Port sells to player
      stock: 1000
    }
  }

  switch (portType) {
    case 1:
      setup('ore', 'buy')
      setup('equipment', 'sell')
      break
    case 2:
      setup('equipment', 'buy')
      setup('ore', 'sell')
      break
    case 3:
      setup('ore', 'sell')
      setup('equipment', 'sell')
      setup('fuel', 'buy')
      break
    case 4:
      setup('ore', 'buy')
      setup('fuel', 'buy')
      setup('equipment', 'buy')
      setup('organics', 'buy')
      break
    case 5:
      setup('ore', 'sell')
      setup('fuel', 'sell')
      setup('equipment', 'sell')
      setup('organics', 'sell')
      break
    // ... add more types as needed
    default:
      setup('fuel', 'both')
  }

  return inventory
}
