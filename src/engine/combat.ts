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
  // Enhanced formula for Phase 10:
  // Base Damage = WeaponPower * (1 + 0.1 * SourceTier)
  // Reduction = TargetTier * 0.05 + (TargetShieldLevel * 0.02)
  
  const tierBonus = 1 + (source.shipTier * 0.15)
  const base = source.weaponPower * tierBonus
  
  const reduction = (target.shipTier * 0.1) // 10% reduction per tier difference? No, flat reduction based on target tier
  const finalBase = Math.max(1, base * (1 - reduction))
  
  const variance = Math.floor(Math.random() * (finalBase * 0.3)) - (finalBase * 0.15)
  return Math.max(1, Math.floor(finalBase + variance))
}
