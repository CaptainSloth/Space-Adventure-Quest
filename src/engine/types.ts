export type Faction = 'alliance' | 'empire' | 'neutral'
export type PlanetType = 'terran' | 'volcanic' | 'ice' | 'gas_giant' | 'desert' | 'ocean' | 'barren'

export type SceneId =
  | 'title'
  | 'login'
  | 'create_character'
  | 'bridge'
  | 'navigation'
  | 'sector_view'
  | 'scan'
  | 'combat'
  | 'planet_surface'
  | 'planet_manage'
  | 'planet_trade'
  | 'planet_cantina'
  | 'port'
  | 'station'
  | 'shipyard'
  | 'cantina'
  | 'station_services'
  | 'inventory'
  | 'company'
  | 'rankings'
  | 'bounty_board'
  | 'card_collection'
  | 'card_duel'
  | 'messages'
  | 'npc_dialogue'
  | 'faction_hq'
  | 'admin'

export interface Player {
  id: string
  name: string
  faction: Faction
  alignment: number
  credits: number
  turns: number
  maxTurns: number
  shipId: string | null
  sectorId: number
  hp: number
  maxHp: number
  shields: number
  experience: number
  level: number
  weaponLevel: number
  shieldLevel: number
  engineLevel: number
}

export interface Sector {
  id: number
  name?: string
  type: string
  warps: number[]
  portType?: number
}

export interface Planet {
  id: string
  sectorId: number
  name: string
  type: PlanetType
  ownerId?: string
  ownerName?: string // Display name
  ownerType?: 'player' | 'company'
  population: number
  maxPopulation: number
  credits: number
  fighters: number
  shields: number
  oreMiners: number
  fuelMiners: number
  equipmentMiners: number
  taxRate: number
  accessPolicy: 'open' | 'faction' | 'company' | 'locked'
  customDescription?: string
  landingMessage?: string
  createdAt: string
}

export interface CombatSide {
  id: string
  name: string
  shields: number
  maxShields: number
  fighters: number
  weaponPower: number
  isNpc: boolean
}

export interface CombatState {
  attacker: CombatSide
  defender: CombatSide
  round: number
  log: string[]
}

export interface ChatMessage {
  id: number
  message: string
  createdAt: string
  playerName: string
}

export interface GlobalEvent {
  id: number
  type: string
  payload: string
  createdAt: string
}

export interface OnlinePlayer {
  id: string
  name: string
  faction: Faction
  alignment: number
  shipId: string | null
  level: number
}

export interface GameState {
  player: Player | null
  currentSector: Sector | null
  currentScene: SceneId
  lastMessage: string | null
  currentPlanets: Planet[]
  selectedPlanetId: string | null
  combat: CombatState | null
  onlinePlayers: OnlinePlayer[]
  chatMessages: ChatMessage[]
  globalEvents: GlobalEvent[]
}

export interface SerializableSceneOption {
  label: string
  key: string
}

export interface SerializableSceneViewModel {
  title: string
  description: string
  options: SerializableSceneOption[]
  ascii?: string[]
  lastMessage?: string | null
  selectedPlanetId?: string | null
  playerList?: { id: string, name: string }[]
  onlinePlayers?: OnlinePlayer[]
  chatMessages?: ChatMessage[]
  globalEvents?: GlobalEvent[]
}

export interface SceneOption extends SerializableSceneOption {
  action: (state: GameState) => Promise<GameState | void>
}

export interface SceneViewModel {
  title: string
  description: string
  options: SceneOption[]
  ascii?: string[]
}
