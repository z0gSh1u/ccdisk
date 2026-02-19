/**
 * App Component - Main application entry point
 */

import { useEffect, useState } from 'react';
import { MainLayout } from './components/MainLayout';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { FilePreview } from './components/workspace/FilePreview';
import { SidePanel, type PanelType } from './components/SidePanel';
import { useChatStore, setupChatStreamListener } from './stores/chat-store';
import { useWorkspaceStore } from './stores/workspace-store';
import { useSettingsStore } from './stores/settings-store';

function App() {
  const { loadSessions } = useChatStore();
  const { loadWorkspace, setupFileWatcher } = useWorkspaceStore();
  const { loadProviders } = useSettingsStore();
  const selectedFile = useWorkspaceStore((s) => s.selectedFile);
  const [activePanelType, setActivePanelType] = useState<PanelType | null>(null);

  // Initialize app on mount
  useEffect(() => {
    // Setup stream listener for real-time chat updates
    const teardownStreamListener = setupChatStreamListener();

    // Load initial data
    loadWorkspace(); // Load default workspace first
    loadSessions();
    loadProviders();

    // Setup file watcher
    const unwatchFiles = setupFileWatcher();

    // Cleanup on unmount
    return () => {
      teardownStreamListener();
      unwatchFiles();
    };
  }, [loadSessions, loadProviders, loadWorkspace, setupFileWatcher]);

  return (
    <MainLayout
      sidebar={<Sidebar activePanelType={activePanelType} onPanelTypeChange={setActivePanelType} />}
      toolbar={<Toolbar />}
      preview={selectedFile ? <FilePreview /> : undefined}
    >
      <ChatInterface />
      <SidePanel
        isOpen={activePanelType !== null}
        panelType={activePanelType}
        onClose={() => setActivePanelType(null)}
      />
    </MainLayout>
  );
}

function Toolbar() {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const currentSession = sessions.find((session) => session.id === currentSessionId);

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-text-primary">{currentSession?.name || 'New Conversation'}</div>
      </div>
    </div>
  );
}

export default App;
