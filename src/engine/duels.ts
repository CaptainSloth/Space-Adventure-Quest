import { DuelState, DuelSide, DuelRow, StarCard, PlayerCard } from './types'

export function createDuel(playerName: string, playerDeck: PlayerCard[], opponentName: string, opponentDeck: StarCard[]): DuelState {
  const playerHand = playerDeck.filter(c => c.equipped).sort(() => Math.random() - 0.5).slice(0, 10)
  const opponentHand = opponentDeck.sort(() => Math.random() - 0.5).slice(0, 10)

  return {
    player: createDuelSide(playerName, playerHand),
    opponent: createDuelSide(opponentName, opponentHand),
    round: 1,
    turn: 'player',
    log: ['Duel Commenced.'],
    winner: null
  }
}

function createDuelSide(name: string, hand: StarCard[]): DuelSide {
  return {
    name,
    hand,
    vanguard: { cards: [], score: 0 },
    fleet: { cards: [], score: 0 },
    support: { cards: [], score: 0 },
    score: 0,
    lives: 2,
    hasPassed: false
  }
}

export function calculateRowScore(row: DuelRow): number {
  let baseScore = row.cards.reduce((sum, c) => sum + c.power, 0)
  const hasBooster = row.cards.some(c => c.effect === 'booster')
  if (hasBooster) baseScore *= 2
  if (row.isWeathered) baseScore = row.cards.length
  return baseScore
}

export function updateDuelScores(state: DuelState): DuelState {
  const sides = [state.player, state.opponent]
  sides.forEach(s => {
    s.vanguard.score = calculateRowScore(s.vanguard)
    s.fleet.score = calculateRowScore(s.fleet)
    s.support.score = calculateRowScore(s.support)
    s.score = s.vanguard.score + s.fleet.score + s.support.score
  })
  return state
}

export function playCard(state: DuelState, side: 'player' | 'opponent', cardIdx: number, rowName: 'vanguard' | 'fleet' | 'support'): DuelState {
  const actor = side === 'player' ? state.player : state.opponent
  const opponent = side === 'player' ? state.opponent : state.player
  const card = actor.hand[cardIdx]
  
  if (!card) return state
  actor.hand.splice(cardIdx, 1)
  
  if (card.effect === 'spy') {
    opponent[rowName].cards.push(card)
    state.log.push(`${actor.name} deployed ${card.name} (Spy) to enemy ${rowName.toUpperCase()}.`)
  } else if (card.effect === 'scorch') {
    const allOpponentCards = [...opponent.vanguard.cards, ...opponent.fleet.cards, ...opponent.support.cards]
    if (allOpponentCards.length > 0) {
      const maxPower = Math.max(...allOpponentCards.map(c => c.power))
      opponent.vanguard.cards = opponent.vanguard.cards.filter(c => c.power < maxPower)
      opponent.fleet.cards = opponent.fleet.cards.filter(c => c.power < maxPower)
      opponent.support.cards = opponent.support.cards.filter(c => c.power < maxPower)
      state.log.push(`${actor.name} used ${card.name} (Orbital Strike)!`)
    }
    actor[rowName].cards.push(card)
  } else if (card.effect === 'hijack') {
    const rows: ('vanguard' | 'fleet' | 'support')[] = ['vanguard', 'fleet', 'support']
    const validRows = rows.filter(r => opponent[r].cards.length > 0)
    if (validRows.length > 0) {
      const targetRow = validRows[Math.floor(Math.random() * validRows.length)]
      const stolen = opponent[targetRow].cards.pop()
      if (stolen) {
        actor[rowName].cards.push(stolen)
        state.log.push(`${actor.name} hijacked ${stolen.name}!`)
      }
    }
    actor[rowName].cards.push(card)
  } else {
    actor[rowName].cards.push(card)
    state.log.push(`${actor.name} played ${card.name}.`)
  }
  
  updateDuelScores(state)
  
  if (!opponent.hasPassed) {
    state.turn = side === 'player' ? 'opponent' : 'player'
  }

  // If it's now opponent's turn and they haven't passed, process AI
  if (state.turn === 'opponent' && !state.opponent.hasPassed && !state.winner) {
    return processAiTurn(state)
  }

  return state
}

export function passRound(state: DuelState, side: 'player' | 'opponent'): DuelState {
  const actor = side === 'player' ? state.player : state.opponent
  actor.hasPassed = true
  state.log.push(`${actor.name} has passed.`)

  const other = side === 'player' ? state.opponent : state.player
  if (other.hasPassed) {
    return resolveRound(state)
  } else {
    state.turn = side === 'player' ? 'opponent' : 'player'
    if (state.turn === 'opponent' && !state.winner) {
      return processAiTurn(state)
    }
  }

  return state
}

export function processAiTurn(state: DuelState): DuelState {
  const ai = state.opponent
  const player = state.player

  // AI Decision Logic
  // 1. If AI is winning and player has passed, AI passes.
  if (player.hasPassed && ai.score > player.score) {
    return passRound(state, 'opponent')
  }

  // 2. If AI is out of cards, AI passes.
  if (ai.hand.length === 0) {
    return passRound(state, 'opponent')
  }

  // 3. If AI is losing by a huge margin and has few cards, maybe pass to save them.
  if (player.score - ai.score > 20 && ai.hand.length < 3) {
    return passRound(state, 'opponent')
  }

  // 4. Play a card.
  // Prefer playing lower power cards first if winning, higher power if losing.
  const cardIdx = player.score > ai.score ? 
    ai.hand.findIndex(c => c.power === Math.max(...ai.hand.map(cc => cc.power))) :
    ai.hand.findIndex(c => c.power === Math.min(...ai.hand.map(cc => cc.power)))
  
  const finalIdx = cardIdx === -1 ? 0 : cardIdx
  const card = ai.hand[finalIdx]
  const row = card.preferredRow === 'any' ? 'fleet' : card.preferredRow as any
  
  return playCard(state, 'opponent', finalIdx, row)
}

function resolveRound(state: DuelState): DuelState {
  const pScore = state.player.score
  const oScore = state.opponent.score

  if (pScore > oScore) {
    state.opponent.lives--
    state.log.push(`${state.player.name} wins the round!`)
  } else if (oScore > pScore) {
    state.player.lives--
    state.log.push(`${state.opponent.name} wins the round!`)
  } else {
    state.player.lives--; state.opponent.lives--
    state.log.push(`Draw! Energy depleted.`)
  }

  if (state.player.lives <= 0 || state.opponent.lives <= 0) {
    state.winner = state.player.lives > state.opponent.lives ? 'player' : 'opponent'
    state.log.push(`Champion: ${state.winner === 'player' ? state.player.name : state.opponent.name}`)
  } else {
    state.round++
    state.player.vanguard.cards = []; state.player.fleet.cards = []; state.player.support.cards = []
    state.opponent.vanguard.cards = []; state.opponent.fleet.cards = []; state.opponent.support.cards = []
    state.player.hasPassed = false
    state.opponent.hasPassed = false
    updateDuelScores(state)
    state.turn = pScore > oScore ? 'player' : 'opponent'
    if (state.turn === 'opponent') return processAiTurn(state)
  }

  return state
}
