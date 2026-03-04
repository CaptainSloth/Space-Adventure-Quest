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
  playerList?: { id: string, name: string }[]
  onlinePlayers?: any[]
  chatMessages?: any[]
  globalEvents?: any[]
}

const App: React.FC = () => {
  const [vm, setVm] = useState<SceneViewModel | null>(null)
  const [name, setName] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(null)
  
  const chatEndRef = useRef<HTMLDivElement>(null)

  const refreshScene = useCallback(async () => {
    try {
      // @ts-ignore
      const newVm = await window.api.invoke('get-scene')
      setVm(newVm)
      if (newVm.selectedPlanetId !== undefined) {
        setSelectedPlanetId(newVm.selectedPlanetId)
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

  // Polling loop for Phase 3 multiplayer
  useEffect(() => {
    if (!vm) return
    const isGameScene = !['SPACE ADVENTURE QUEST', 'CHARACTER LOGIN', 'CHARACTER REGISTRATION'].some(t => vm.title.includes(t))
    if (!isGameScene) return

    const interval = setInterval(async () => {
      try {
        // @ts-ignore
        const newVm = await window.api.invoke('poll-state')
        setVm(newVm)
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
  }, [vm?.chatMessages])

  const handleAction = async (key: string) => {
    setLoading(true)
    let newVm
    
    // Check if we are claiming a planet
    if (vm?.title.includes('PLANET:') && key === 'C' && selectedPlanetId) {
      // @ts-ignore
      newVm = await window.api.invoke('claim-planet', selectedPlanetId)
    } else {
      // @ts-ignore
      newVm = await window.api.invoke('execute-action', key)
    }
    
    setVm(newVm)
    if (newVm.title.includes('BRIDGE')) {
      setSelectedPlanetId(null)
    } else if (newVm.selectedPlanetId !== undefined) {
      setSelectedPlanetId(newVm.selectedPlanetId)
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

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return
    const msg = chatInput
    setChatInput('')
    // @ts-ignore
    const newVm = await window.api.invoke('send-message', msg)
    setVm(newVm)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger actions if typing in an input or textarea
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
      {/* Global Event Feed (Ticker) */}
      {vm.globalEvents && vm.globalEvents.length > 0 && (
        <div className="event-feed">
          <marquee scrollamount="5">
            {vm.globalEvents.slice(0, 5).map(e => `[${new Date(e.createdAt).toLocaleTimeString()}] ${e.payload}`).join(' |***| ')}
          </marquee>
        </div>
      )}

      <div className="header">
        <h1>{parseSansi(vm.title)}</h1>
      </div>

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

      {/* Sector Chat UI */}
      {vm.title.includes('COMM LINK') && (
        <div className="chat-interface">
          <div className="chat-messages">
            {vm.chatMessages?.map((msg: any) => (
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
              placeholder="Broadcast to sector..."
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

      {vm.title.includes('REGISTRATION') && (
        <div className="registration-form">
          <p>Enter your pilot name:</p>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            autoFocus
            className="bbs-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (vm.title.includes('LOGIN')) handleLogin()
              }
            }}
          />
        </div>
      )}

      <div className="options">
        {vm.options.map((opt) => (
          <div key={opt.key} className="option" onClick={() => {
            if (vm.title.includes('REGISTRATION')) {
              handleCreateCharacter(opt.label.split(' ')[1].toLowerCase())
            } else if (vm.title.includes('LOGIN') && opt.key === 'S') {
              handleLogin()
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
