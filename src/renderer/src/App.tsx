import React, { useEffect, useState, useCallback, useRef } from 'react'
import { parseSansi } from './utils/sansi'

interface SceneOption {
  label: string
  key: string
}

interface SceneViewModel {
  title: string
  description: string
  options: SceneOption[]
  ascii?: string[]
  lastMessage?: string | null
  selectedPlanetId?: string | null
  playerList?: { id: string, name: string }[]
  onlinePlayers?: any[]
  chatMessages?: any[]
  globalEvents?: any[]
  currentCompany?: any
  companyMembers?: any[]
  availableCompanies?: any[]
  companyChatMessages?: any[]
  companyAlliances?: any[]
  playerCargo?: any[]
  hudStats?: any | null
  stocks?: any[]
  playerPortfolio?: any[]
}

interface Notification {
  id: number
  payload: string
}

const App: React.FC = () => {
  const [vm, setVm] = useState<SceneViewModel | null>(null)
  const [name, setName] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const lastEventId = useRef<number>(0)

  const refreshScene = useCallback(async () => {
    try {
      // @ts-ignore
      const newVm = await window.api.invoke('get-scene')
      setVm(newVm)
      if (newVm.selectedPlanetId !== undefined) {
        setSelectedPlanetId(newVm.selectedPlanetId)
      }
      if (newVm.globalEvents && newVm.globalEvents.length > 0) {
        lastEventId.current = Math.max(...newVm.globalEvents.map((e: any) => e.id))
      }
    } catch (err) {
      console.error('Renderer: Error in get-scene:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshScene()
  }, [refreshScene])

  // Polling loop
  useEffect(() => {
    if (!vm) return
    const isGameScene = !['SPACE ADVENTURE QUEST', 'CHARACTER LOGIN', 'CHARACTER REGISTRATION'].some(t => vm.title.includes(t))
    if (!isGameScene) return

    const interval = setInterval(async () => {
      try {
        // @ts-ignore
        const newVm = await window.api.invoke('poll-state')
        setVm(newVm)

        if (newVm.globalEvents) {
          const newEvents = newVm.globalEvents.filter((e: any) => e.id > lastEventId.current)
          if (newEvents.length > 0) {
            lastEventId.current = Math.max(...newVm.globalEvents.map((e: any) => e.id))
            const newToasts = newEvents.map((e: any) => ({ id: e.id, payload: e.payload }))
            setNotifications(prev => {
              const uniqueNew = newToasts.filter(nt => !prev.some(p => p.id === nt.id))
              return [...prev, ...uniqueNew]
            })
            newToasts.forEach((t: any) => {
              setTimeout(() => {
                setNotifications(prev => prev.filter(note => note.id !== t.id))
              }, 5000)
            })
          }
        }
      } catch (e) {
        console.error('Polling error', e)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [vm?.title])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [vm?.chatMessages, vm?.companyChatMessages])

  const handleAction = async (key: string) => {
    setLoading(true)
    let newVm
    
    if (vm?.title.includes('PLANET:') && key === 'C' && selectedPlanetId) {
      // @ts-ignore
      newVm = await window.api.invoke('claim-planet', selectedPlanetId)
    } else if (vm?.title.includes('PORT') && /^[o|f|e|r|u|q]$/.test(key.toLowerCase())) {
       const metadataRegex = /\[DATA:(\w+):(-?\d+|N\/A):(-?\d+|N\/A)\]/g
       const buyMap: Record<string, string> = { 'o': 'ore', 'f': 'fuel', 'e': 'equipment' }
       const sellMap: Record<string, string> = { 'r': 'ore', 'u': 'fuel', 'q': 'equipment' }
       const char = key.toLowerCase()
       const isBuy = !!buyMap[char]
       const commodityName = isBuy ? buyMap[char] : sellMap[char]
       let price = 0
       let match
       metadataRegex.lastIndex = 0
       while ((match = metadataRegex.exec(vm.description)) !== null) {
         if (match[1] === commodityName) {
           price = isBuy ? parseInt(match[3]) : parseInt(match[2])
           break
         }
       }
       if (price > 0) {
         // @ts-ignore
         newVm = await window.api.invoke('trade-commodity', commodityName, isBuy ? 1 : -1, price)
       } else {
         // @ts-ignore
         newVm = await window.api.invoke('execute-action', key)
       }
    } else if (vm?.title.includes('EXCHANGE:') && (key === '1' || key === 'S')) {
       // Stock Trading Logic
       const symbol = selectedPlanetId // Symbol is stored here
       const stock = vm.stocks?.find(s => s.symbol === symbol)
       const portfolio = vm.playerPortfolio?.find(p => p.symbol === symbol)
       if (stock) {
         if (key === '1') {
           // @ts-ignore
           newVm = await window.api.invoke('trade-stock', symbol, 10, stock.price)
         } else {
           // @ts-ignore
           newVm = await window.api.invoke('trade-stock', symbol, -(portfolio?.quantity || 0), stock.price)
         }
       }
    } else if (vm?.title.includes('VEX') && key.toLowerCase() === 't') {
       // @ts-ignore
       newVm = await window.api.invoke('trade-commodity', 'ore', -1, 30) 
    } else if (vm?.title.includes('COMPANIES') && /^\d+$/.test(key)) {
      const company = vm.availableCompanies?.[parseInt(key) - 1]
      if (company) {
        // @ts-ignore
        newVm = await window.api.invoke('join-company', company.id)
      } else {
        // @ts-ignore
        newVm = await window.api.invoke('execute-action', key)
      }
    } else if (vm?.title.includes('COMPANY:') && key === 'T') {
       // @ts-ignore
       newVm = await window.api.invoke('deposit-treasury', 1000)
    } else {
      // @ts-ignore
      newVm = await window.api.invoke('execute-action', key)
    }
    
    if (newVm) {
      setVm(newVm)
      if (newVm.title.includes('BRIDGE')) {
        setSelectedPlanetId(null)
      } else if (newVm.selectedPlanetId !== undefined) {
        setSelectedPlanetId(newVm.selectedPlanetId)
      }
    }
    setLoading(false)
  }

  const handleCreateCharacter = async (faction: string) => {
    if (!name) return
    setLoading(true)
    // @ts-ignore
    const newVm = await window.api.invoke('create-character', name, faction)
    setVm(newVm)
    setLoading(false)
  }

  const handleCreateCompany = async () => {
    if (!name) return
    setLoading(true)
    // @ts-ignore
    const newVm = await window.api.invoke('create-company', name)
    setVm(newVm)
    setName('')
    setLoading(false)
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return
    const msg = chatInput
    setChatInput('')
    
    let newVm
    if (vm?.title.includes('COMPANY CHAT')) {
      // @ts-ignore
      newVm = await window.api.invoke('send-company-message', msg)
    } else {
      // @ts-ignore
      newVm = await window.api.invoke('send-message', msg)
    }
    setVm(newVm)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      if (vm && !loading) {
        const option = vm.options.find(o => o.key.toLowerCase() === e.key.toLowerCase())
        if (option) {
          handleAction(option.key)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [vm, loading])

  if (!vm) return <div className="container">Loading...</div>

  const isGameScene = !['SPACE ADVENTURE QUEST', 'CHARACTER LOGIN', 'CHARACTER REGISTRATION'].some(t => vm.title.includes(t))

  const handleLogin = async () => {
    if (!name) return
    setLoading(true)
    // @ts-ignore
    const newVm = await window.api.invoke('login', name)
    setVm(newVm)
    setLoading(false)
  }

  const handleLoginById = async (id: string) => {
    setLoading(true)
    // @ts-ignore
    const newVm = await window.api.invoke('login-id', id)
    setVm(newVm)
    setLoading(false)
  }

  return (
    <div className="container">
      <div className="notification-overlay">
        {notifications.map((note) => (
          <div key={note.id} className="notification-toast">
            {parseSansi(`%b[ALERT]%7 ${note.payload}`)}
          </div>
        ))}
      </div>

      {vm.globalEvents && vm.globalEvents.length > 0 && (
        <div className="event-feed">
          <marquee scrollamount="5">
            {vm.globalEvents.slice(0, 5).map(e => `[${new Date(e.createdAt).toLocaleTimeString()}] ${e.payload}`).join(' |***| ')}
          </marquee>
        </div>
      )}

      {isGameScene && vm.hudStats && (
        <div className="hud">
          <div className="hud-stats">
            <div>PILOT: <span className="sansi-f">{vm.hudStats.playerName}</span></div>
            <div>TURNS: <span className="sansi-b">{vm.hudStats.turns}</span> / {vm.hudStats.maxTurns}</div>
            <div>CREDITS: <span className="sansi-e">{vm.hudStats.credits}</span></div>
          </div>
          <div className="hud-inventory">
            <div>SHIP: <span className="sansi-d">{vm.hudStats.shipName}</span></div>
            <div>CARGO: 
              <span className="cargo-list">
                {vm.playerCargo && vm.playerCargo.length > 0 
                  ? vm.playerCargo.slice(0, 3).map(c => ` ${c.commodity.toUpperCase()}(${c.quantity})`)
                  : ' EMPTY'}
              </span>
            </div>
          </div>
          <div className="hud-presence">
            <div>SECTOR: <span className="sansi-f">{vm.hudStats.sectorId}</span></div>
            <div>SCANNER: <span className="sansi-a">{vm.onlinePlayers?.length || 0} Online</span></div>
          </div>
        </div>
      )}

      <div className="header">
        <h1>{parseSansi(vm.title)}</h1>
      </div>

      <div className="main-content">
        {vm.ascii && (
          <pre className="ascii-art">
            {vm.ascii.map((line, i) => (
              <div key={i}>{parseSansi(line)}</div>
            ))}
          </pre>
        )}

        <div className="description">
          {parseSansi(vm.description)}
        </div>

        {(vm.title.includes('COMM LINK') || vm.title.includes('COMPANY CHAT')) && (
          <div className="chat-interface">
            <div className="chat-messages">
              {(vm.title.includes('COMM LINK') ? vm.chatMessages : vm.companyChatMessages)?.map((msg: any) => (
                <div key={msg.id} className="chat-message">
                  <span className="chat-time">[{new Date(msg.createdAt).toLocaleTimeString()}]</span>
                  <span className="chat-author"> {msg.playerName}:</span>
                  <span className="chat-text"> {msg.message}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-row">
              <span>&gt; </span>
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                autoFocus
                className="bbs-input chat-input"
                placeholder={vm.title.includes('COMM LINK') ? "Broadcast to sector..." : "Message company..."}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage()
                }}
              />
            </div>
          </div>
        )}

        {vm.lastMessage && (
          <div className="message-box">
            {parseSansi(vm.lastMessage)}
          </div>
        )}

        {vm.title.includes('LOGIN') && vm.playerList && vm.playerList.length > 0 && (
          <div className="player-selection">
            <p>Existing Pilots:</p>
            {vm.playerList.map((p) => (
              <div key={p.id} className="option" onClick={() => handleLoginById(p.id)}>
                <span className="option-key">[*]</span>
                <span className="option-label">{p.name}</span>
              </div>
            ))}
          </div>
        )}

        {(vm.title.includes('REGISTRATION') || vm.title.includes('FOUND NEW COMPANY')) && (
          <div className="registration-form">
            <p>Enter Name:</p>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              autoFocus
              className="bbs-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (vm.title.includes('FOUND NEW COMPANY')) handleCreateCompany()
                }
              }}
            />
          </div>
        )}
      </div>

      <div className="options">
        {vm.options.map((opt) => (
          <div key={opt.key} className="option" onClick={() => {
            if (vm.title.includes('REGISTRATION')) {
              handleCreateCharacter(opt.label.split(' ')[1].toLowerCase())
            } else if (vm.title.includes('LOGIN') && opt.key === 'S') {
              handleLogin()
            } else if (vm.title.includes('FOUND NEW COMPANY') && opt.key === 'S') {
              handleCreateCompany()
            } else {
              handleAction(opt.key)
            }
          }}>
            <span className="option-key">[{opt.key}]</span>
            <span className="option-label">{opt.label}</span>
          </div>
        ))}
      </div>

      {loading && <div className="loading-indicator">... BUSY ...</div>}
    </div>
  )
}

export default App
