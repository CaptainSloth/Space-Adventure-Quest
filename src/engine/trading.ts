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

// SUPPLY & DEMAND CURVE:
// Price = BasePrice * (IdealStock / CurrentStock)
// Scarcity (low stock) = High Price
// Abundance (high stock) = Low Price
export function calculateDynamicPrice(commodity: Commodity, currentStock: number, isBuyForPort: boolean): number {
  const base = BASE_PRICES[commodity]
  const idealStock = 1000
  
  // Clamp stock to prevent infinity/zero prices (Min 100, Max 5000)
  const clampedStock = Math.max(100, Math.min(5000, currentStock))
  
  const multiplier = idealStock / clampedStock
  const midPrice = base * multiplier
  
  // Port buys from player at a discount, sells at a premium
  return isBuyForPort 
    ? Math.floor(midPrice * 0.9) 
    : Math.floor(midPrice * 1.1)
}

export const getPortInventory = (portType: number): PortInventory => {
  const inventory: PortInventory = {}
  const setup = (commodity: Commodity, type: 'buy' | 'sell' | 'both') => {
    inventory[commodity] = {
      buy: type === 'sell' ? -1 : 0, // Placeholder, calculated in scene/main
      sell: type === 'buy' ? -1 : 0, 
      stock: 1000
    }
  }

  switch (portType) {
    case 1: setup('ore', 'buy'); setup('equipment', 'sell'); break
    case 2: setup('equipment', 'buy'); setup('ore', 'sell'); break
    case 3: setup('ore', 'sell'); setup('equipment', 'sell'); setup('fuel', 'buy'); break
    case 4: setup('ore', 'buy'); setup('fuel', 'buy'); setup('equipment', 'buy'); setup('organics', 'buy'); break
    case 5: setup('ore', 'sell'); setup('fuel', 'sell'); setup('equipment', 'sell'); setup('organics', 'sell'); break
    default: setup('fuel', 'both')
  }
  return inventory
}
