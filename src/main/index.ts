import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// Import services
import { DatabaseService } from './services/db-service'
import { ConfigService } from './services/config-service'
import { MCPService } from './services/mcp-service'
import { SkillsService } from './services/skills-service'
import { CommandsService } from './services/commands-service'
import { FileWatcherService } from './services/file-watcher'
import { ClaudeService } from './services/claude-service'

// Import IPC handlers
import { registerWorkspaceHandlers } from './ipc/workspace-handler'
import { registerSessionsHandlers } from './ipc/sessions-handler'
import { registerSettingsHandlers } from './ipc/settings-handler'
import { registerSkillsHandlers } from './ipc/skills-handler'
import { registerCommandsHandlers } from './ipc/commands-handler'
import { registerMcpHandlers } from './ipc/mcp-handler'
import { registerChatHandlers, createStreamEventEmitter } from './ipc/chat-handler'

// Global services (initialized once)
let dbService: DatabaseService
let configService: ConfigService
let mcpService: MCPService
let skillsService: SkillsService
let commandsService: CommandsService
let fileWatcher: FileWatcherService
let claudeService: ClaudeService

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Initialize services
  dbService = new DatabaseService()
  configService = new ConfigService()
  mcpService = new MCPService() // No workspace path initially
  skillsService = new SkillsService() // No workspace path initially
  commandsService = new CommandsService() // No workspace path initially
  fileWatcher = new FileWatcherService() // No workspace path initially

  // Create stream event emitter for Claude service
  const streamEventEmitter = createStreamEventEmitter(mainWindow)
  claudeService = new ClaudeService(configService, mcpService, streamEventEmitter)

  // Register IPC handlers
  registerWorkspaceHandlers(mainWindow, fileWatcher)
  registerSessionsHandlers(dbService)
  registerSettingsHandlers(dbService, configService)
  registerSkillsHandlers(skillsService)
  registerCommandsHandlers(commandsService)
  registerMcpHandlers(mcpService)
  registerChatHandlers(mainWindow, claudeService, dbService)

  // Handle workspace changes - update services with new workspace path
  ipcMain.on('workspace:changed', (_event, workspacePath: string | null) => {
    console.log('Workspace changed to:', workspacePath)

    // Update services with new workspace path
    mcpService.setWorkspacePath(workspacePath)
    skillsService.setWorkspacePath(workspacePath)
    commandsService.setWorkspacePath(workspacePath)

    if (workspacePath) {
      // Start watching the new workspace
      fileWatcher.setWorkspacePath(workspacePath)
      fileWatcher.startWatching()
    } else {
      // Stop watching if workspace is cleared
      fileWatcher.stopWatching()
    }
  })

  // Cleanup on window close
  mainWindow.on('close', () => {
    console.log('Cleaning up services...')
    fileWatcher.stopWatching()
    claudeService.cleanup()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.ccdisk')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup on quit
app.on('before-quit', () => {
  console.log('App quitting, cleaning up...')
  if (fileWatcher) {
    fileWatcher.stopWatching()
  }
  if (claudeService) {
    claudeService.cleanup()
  }
})
