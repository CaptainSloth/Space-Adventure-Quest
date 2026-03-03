import React, { useEffect, useState, useCallback } from 'react'
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
}

const App: React.FC = () => {
  const [vm, setVm] = useState<SceneViewModel | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  const refreshScene = useCallback(async () => {
    console.log('Renderer: refreshScene calling get-scene')
    try {
      // @ts-ignore
      const newVm = await window.api.invoke('get-scene')
      console.log('Renderer: received vm:', newVm)
      setVm(newVm)
    } catch (err) {
      console.error('Renderer: Error in get-scene:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshScene()
  }, [refreshScene])

  const handleAction = async (key: string) => {
    setLoading(true)
    // @ts-ignore
    const newVm = await window.api.invoke('execute-action', key)
    setVm(newVm)
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

  return (
    <div className="container">
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

      {vm.lastMessage && (
        <div className="message-box">
          {parseSansi(vm.lastMessage)}
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
          />
        </div>
      )}

      <div className="options">
        {vm.options.map((opt) => (
          <div key={opt.key} className="option" onClick={() => {
            if (vm.title.includes('REGISTRATION')) {
              handleCreateCharacter(opt.label.split(' ')[1].toLowerCase())
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
