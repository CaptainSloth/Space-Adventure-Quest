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
  | 'company_create'
  | 'company_manage'
  | 'company_members'
  | 'company_chat'
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
  kills: number
  companyId: string | null
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

export interface CargoItem {
  commodity: string
  quantity: number
}

export interface PlanetBuilding {
  id: number
  planetId: string
  type: 'shipyard' | 'defense_grid' | 'sensor_array' | 'cantina' | 'refinery'
  level: number
  status: string
  builtAt: string
}

export interface StarCard {
  id: string
  name: string
  type: 'ship' | 'crew' | 'event' | 'planet'
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  preferredRow: 'vanguard' | 'fleet' | 'support' | 'any'
  power: number
  effect?: string
  description: string
}

export interface PlayerCard extends StarCard {
  instanceId: number
  level: number
  equipped: boolean
  acquiredAt: string
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

export interface Bounty {
  id: number
  type: string
  target: string
  required: number
  progress: number
  reward: number
  expiresAt: string
  playerId?: string | null
  companyId?: string | null
}

export interface RankingEntry {
  name: string
  value: number
}

export interface GalacticRankings {
  netWorth: RankingEntry[]
  kills: RankingEntry[]
  alignment: RankingEntry[]
  companies: RankingEntry[]
}

export interface Company {
  id: string
  name: string
  ceoPlayerId: string
  faction: Faction | null
  treasury: number
  createdAt: string
}

export interface CompanyMember {
  companyId: string
  playerId: string
  role: 'ceo' | 'officer' | 'member'
  joinedAt: string
  playerName: string
  playerFaction: Faction
  playerLevel: number
  lastSeen: string
  lastLoginAt: string
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
  rankings: GalacticRankings | null
  bounties: Bounty[]
  currentCompany: Company | null
  companyMembers: CompanyMember[]
  availableCompanies: Company[]
  companyChatMessages: ChatMessage[]
  companyAlliances: any[]
  playerCargo: CargoItem[]
  stocks: any[]
  playerPortfolio: any[]
  shipyardStock: any[]
  pendingShipPurchase?: any | null
  playerDeck: PlayerCard[]
  allStarCards: StarCard[]
  planetBuildings: PlanetBuilding[]
  adminBuilder?: {
    templateId?: string
    prefixId?: number
    suffixId?: number
    step: 'menu' | 'template_list' | 'modifier_list' | 'build_template' | 'build_prefix' | 'build_suffix' | 'review'
  }
  currentDuel: DuelState | null
}

export interface DuelRow {
  cards: StarCard[]
  score: number
  isWeathered?: boolean
}

export interface DuelSide {
  name: string
  hand: StarCard[]
  vanguard: DuelRow
  fleet: DuelRow
  support: DuelRow
  score: number
  lives: number
  hasPassed: boolean
}

export interface DuelState {
  player: DuelSide
  opponent: DuelSide
  round: number
  turn: 'player' | 'opponent'
  log: string[]
  winner: 'player' | 'opponent' | null
}

export interface SerializableSceneOption {
  label: string
  key: string
}

export interface HudStats {
  playerName: string
  shipName: string
  turns: number
  maxTurns: number
  credits: number
  sectorId: number
  alignment: number
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
  rankings?: GalacticRankings | null
  bounties?: Bounty[]
  currentCompany?: Company | null
  companyMembers?: CompanyMember[]
  availableCompanies?: Company[]
  companyChatMessages?: ChatMessage[]
  companyAlliances?: any[]
  playerCargo?: CargoItem[]
  hudStats?: HudStats | null
  stocks?: any[]
  playerPortfolio?: any[]
  shipyardStock?: any[]
  playerDeck?: PlayerCard[]
  allStarCards?: StarCard[]
  planetBuildings?: PlanetBuilding[]
  currentDuel?: DuelState | null
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
