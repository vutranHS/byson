import { useState } from 'react'
import ConnectionManager from './components/ConnectionManager'

function App() {
  const [showManager, setShowManager] = useState(false)

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary text-text-primary">
      {/* 1. Header / Toolbar */}
      <header className="h-12 bg-bg-tertiary border-b border-border flex items-center px-4 shrink-0">
        <h1 className="font-semibold text-sm">MongoGUI 2025</h1>
      </header>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (Trái) */}
        <aside className="w-64 bg-bg-secondary border-r border-border flex flex-col resize-x overflow-auto min-w-[200px] max-w-sm">
          <div className="p-3 text-xs font-bold text-text-secondary uppercase tracking-wider">
            Connections
          </div>
          {/* Nơi chứa TreeView / DB Nodes */}
          <div className="p-3 text-sm italic text-text-secondary">
            No active connection
          </div>
        </aside>

        {/* Workspace (Phải) */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-primary relative">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4 opacity-20">🍃</div>
              <p className="text-text-secondary">Vui lòng kết nối để bắt đầu</p>
              <button 
                onClick={() => setShowManager(true)}
                className="mt-4 px-4 py-2 bg-accent text-white rounded cursor-pointer hover:bg-accent-hover transition-colors"
              >
                Open Connection Manager
              </button>
            </div>
          </div>
          
          <ConnectionManager 
            isOpen={showManager} 
            onClose={() => setShowManager(false)} 
          />
        </main>
      </div>

      {/* 3. Footer / Status Bar */}
      <footer className="h-6 bg-accent border-t border-border flex items-center px-4 shrink-0 text-xs text-white">
        <div>Ready</div>
      </footer>
    </div>
  )
}

export default App
