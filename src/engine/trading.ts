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
  contraband: 2500 // High value, high risk
}

export function calculateDynamicPrice(commodity: Commodity, currentStock: number, isBuyForPort: boolean): number {
  const base = BASE_PRICES[commodity]
  const idealStock = 1000
  
  // Market Curve: Prices spike sharply when stock is very low, 
  // and bottom out slowly as stock becomes abundant.
  // Formula: price = base * (ideal / current)^1.2
  const ratio = idealStock / Math.max(1, currentStock)
  const marketCurve = Math.pow(ratio, 1.2)
  const midPrice = base * marketCurve
  
  // Apply spread (Port profit margin)
  // Ports buy low, sell high
  return isBuyForPort 
    ? Math.max(1, Math.floor(midPrice * 0.85)) // Port buys from player
    : Math.max(1, Math.floor(midPrice * 1.15)) // Port sells to player
}

export const getPortInventory = (portType: number): PortInventory => {
  const inventory: PortInventory = {}
  const setup = (commodity: Commodity, type: 'buy' | 'sell' | 'both', initialStock: number = 1000) => {
    inventory[commodity] = {
      buy: type === 'sell' ? -1 : 0,
      sell: type === 'buy' ? -1 : 0, 
      stock: initialStock
    }
  }

  switch (portType) {
    case 1: setup('ore', 'buy'); setup('equipment', 'sell'); break
    case 2: setup('equipment', 'buy'); setup('ore', 'sell'); break
    case 3: setup('ore', 'sell'); setup('equipment', 'sell'); setup('fuel', 'buy'); break
    case 4: setup('ore', 'buy'); setup('fuel', 'buy'); setup('equipment', 'buy'); setup('organics', 'buy'); break
    case 5: setup('ore', 'sell'); setup('fuel', 'sell'); setup('equipment', 'sell'); setup('organics', 'sell'); break
    case 6: // BLACK MARKET: Deals in high-end and illegal goods
      setup('luxury', 'both', 200)
      setup('contraband', 'both', 100)
      setup('equipment', 'buy', 500)
      break
    case 7: setup('ore', 'sell'); setup('equipment', 'sell'); setup('organics', 'buy'); break
    case 8: setup('organics', 'buy'); setup('fuel', 'buy'); setup('luxury', 'sell', 300); break
    default: setup('fuel', 'both')
  }
  return inventory
}
