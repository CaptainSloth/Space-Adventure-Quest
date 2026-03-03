export type Faction = 'alliance' | 'empire' | 'neutral'

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
}

export interface Sector {
  id: number
  name?: string
  type: string
  warps: number[]
  portType?: number
}

export interface GameState {
  player: Player | null
  currentSector: Sector | null
  currentScene: SceneId
  lastMessage: string | null
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
