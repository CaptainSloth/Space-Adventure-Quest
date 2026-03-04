import { CombatState, CombatSide, GameState } from './types'

export const initCombat = (attacker: CombatSide, defender: CombatSide): CombatState => {
  return {
    attacker,
    defender,
    round: 1,
    log: [`Combat initiated: ${attacker.name} vs ${defender.name}`]
  }
}

export const processCombatRound = (state: CombatState): CombatState => {
  const log: string[] = [...state.log]
  const { attacker, defender } = state

  // 1. Attacker fires
  const attackerDamage = calculateDamage(attacker, defender)
  defender.shields -= attackerDamage
  log.push(`${attacker.name} fires at ${defender.name} for ${attackerDamage} damage!`)

  if (defender.shields <= 0) {
    defender.shields = 0
    log.push(`${defender.name} is disabled!`)
    return { ...state, defender, log, round: state.round + 1 }
  }

  // 2. Defender retaliates
  const defenderDamage = calculateDamage(defender, attacker)
  attacker.shields -= defenderDamage
  log.push(`${defender.name} retaliates against ${attacker.name} for ${defenderDamage} damage!`)

  if (attacker.shields <= 0) {
    attacker.shields = 0
    log.push(`${attacker.name} is disabled!`)
  }

  return {
    ...state,
    attacker,
    defender,
    round: state.round + 1,
    log
  }
}

function calculateDamage(source: CombatSide, target: CombatSide): number {
  // Simple formula: weapon power - (target shields percentage / something) + RNG
  const base = source.weaponPower
  const variance = Math.floor(Math.random() * (base * 0.4)) - (base * 0.2)
  return Math.max(1, base + variance)
}
