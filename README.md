# Space Adventure Quest (SAQ)

**A BBS-style multiplayer space odyssey door game.**
*Inspired by TradeWars 2002 and Planets: TEOS.*

---

## 🚀 Vision
Space Adventure Quest is a persistent, multinode multiplayer space sim built with a retro BBS aesthetic. Pilot ships, trade commodities, colonize planets, and engage in tactical card duels in a living, breathing galaxy.

## ✨ Current Status: Phase 10 Polish & Fun
The project has reached a high state of polish with the completion of Phase 10. Key features include:

*   **Retro ASCII UI**: Full ASCII art for ships, NPCs, combat, and planets with `%` Sansi color support.
*   **Dynamic NPC Life**: NPCs move between sectors, remember your actions, and now broadcast "Life" messages to the global event feed.
*   **Star Card CCG**: A fully integrated 3-row tactical card game (Star Cards) played in cantinas.
*   **Advanced Economy**: Non-linear supply/demand curves with stock market speculation and player-run ports.
*   **Tiered Combat**: Ship-to-ship combat scaled by tiers (Scout to Legendary) with persistent sector assets like fighters and mines.
*   **Multinode Multiplayer**: Real-time interaction across multiple instances via a shared SQLite WAL-mode database.

## 🛠️ Tech Stack
*   **Shell**: Electron (Node.js)
*   **Frontend**: React + TypeScript
*   **Styling**: Vanilla CSS (Monospace/Retro)
*   **Database**: SQLite (better-sqlite3) with WAL mode for concurrent access.
*   **Architecture**: Scene-based state machine with async IPC notifications.

## 📂 Project Structure
*   `src/main`: Electron main process and SQLite database operations (`db/`).
*   `src/engine`: The core game logic, including:
    *   `scenes/`: UI definitions and action handlers.
    *   `combat.ts`: Ship-to-ship combat scaling.
    *   `duels.ts`: The Star Card CCG engine.
    *   `trading.ts`: Dynamic market and price curves.
*   `src/renderer`: React frontend components and ASCII rendering utilities.
*   `Plan.md`: The master architectural document and 10-phase roadmap.

## 🕹️ Getting Started

### Prerequisites
*   Node.js (v18+)
*   npm or yarn

### Installation
```bash
npm install
```

### Running the Game
To start the primary node:
```bash
npm run dev
```

To test multiplayer, you can open multiple instances. The nodes will automatically sync state via the shared database.

## 🎨 Sansi Color Codes
The game uses a custom inline color system for that authentic BBS feel:
*   `%1` - Red | `%2` - Green | `%3` - Yellow | `%4` - Blue
*   `%e` - Cyan | `%f` - Bright White | `%b` - Bright Yellow
*   `` ` `` - Toggle **Bold**
*   `~` - Toggle **Blink**

## 📜 License
MIT
