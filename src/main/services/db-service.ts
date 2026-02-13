/**
 * Database service using Drizzle ORM with better-sqlite3
 */
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { eq, desc } from 'drizzle-orm'
import * as schema from '../db/schema'
import type {
  SessionInsert,
  SessionSelect,
  MessageInsert,
  MessageSelect,
  ProviderInsert,
  ProviderSelect
} from '../db/schema'
import path from 'path'
import os from 'os'
import fs from 'fs'

export class DatabaseService {
  private db: ReturnType<typeof drizzle>
  private sqlite: Database.Database

  constructor(dbPath?: string) {
    // Default to ~/.ccdisk/sessions.db
    const defaultPath = path.join(os.homedir(), '.ccdisk', 'sessions.db')
    const finalPath = dbPath || defaultPath

    // Ensure directory exists
    const dir = path.dirname(finalPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.sqlite = new Database(finalPath)
    this.sqlite.pragma('journal_mode = WAL')
    this.db = drizzle(this.sqlite, { schema })

    // Run migrations (create tables if they don't exist)
    this.migrate()
  }

  private migrate(): void {
    // Check if sessions table exists and has workspace_path column
    const tableInfo = this.sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'")
      .get() as { sql?: string } | undefined

    if (tableInfo?.sql?.includes('workspace_path')) {
      console.log('Migrating sessions table to remove workspace_path column...')

      // Create new table without workspace_path
      this.sqlite.exec(`
        -- Create new sessions table without workspace_path
        CREATE TABLE sessions_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          sdk_session_id TEXT,
          model TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- Copy data from old table (excluding workspace_path)
        INSERT INTO sessions_new (id, name, sdk_session_id, model, created_at, updated_at)
        SELECT id, name, sdk_session_id, model, created_at, updated_at
        FROM sessions;

        -- Drop old table
        DROP TABLE sessions;

        -- Rename new table
        ALTER TABLE sessions_new RENAME TO sessions;
      `)

      console.log('Migration completed successfully')
    } else {
      // Create tables if they don't exist
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          sdk_session_id TEXT,
          model TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)
    }

    // Create other tables
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        token_usage TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        base_url TEXT,
        extra_env TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
      CREATE INDEX IF NOT EXISTS idx_providers_is_active ON providers(is_active);
    `)
  }

  // Sessions CRUD
  async createSession(session: SessionInsert): Promise<SessionSelect> {
    const result = await this.db.insert(schema.sessions).values(session).returning()
    return result[0]
  }

  async getSession(id: string): Promise<SessionSelect | undefined> {
    const results = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, id))
      .limit(1)
    return results[0]
  }

  async listSessions(): Promise<SessionSelect[]> {
    return await this.db.select().from(schema.sessions).orderBy(desc(schema.sessions.updatedAt))
  }

  /**
   * Update session by ID
   */
  async updateSession(
    id: string,
    data: Partial<SessionInsert>
  ): Promise<SessionSelect | null> {
    try {
      const result = await this.db
        .update(schema.sessions)
        .set(data)
        .where(eq(schema.sessions.id, id))
        .returning()
      return result[0] || null
    } catch (error) {
      console.error('Failed to update session:', error)
      throw error
    }
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(schema.sessions).where(eq(schema.sessions.id, id))
  }

  // Messages CRUD
  async createMessage(message: MessageInsert): Promise<MessageSelect> {
    const result = await this.db.insert(schema.messages).values(message).returning()
    return result[0]
  }

  async getMessages(sessionId: string): Promise<MessageSelect[]> {
    return await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, sessionId))
      .orderBy(schema.messages.createdAt)
  }

  async deleteMessages(sessionId: string): Promise<void> {
    await this.db.delete(schema.messages).where(eq(schema.messages.sessionId, sessionId))
  }

  // Providers CRUD
  async createProvider(provider: ProviderInsert): Promise<ProviderSelect> {
    const result = await this.db.insert(schema.providers).values(provider).returning()
    return result[0]
  }

  async listProviders(): Promise<ProviderSelect[]> {
    return await this.db.select().from(schema.providers).orderBy(desc(schema.providers.createdAt))
  }

  async getProvider(id: string): Promise<ProviderSelect | undefined> {
    const results = await this.db
      .select()
      .from(schema.providers)
      .where(eq(schema.providers.id, id))
      .limit(1)
    return results[0]
  }

  async getActiveProvider(): Promise<ProviderSelect | undefined> {
    const results = await this.db
      .select()
      .from(schema.providers)
      .where(eq(schema.providers.isActive, true))
      .limit(1)
    return results[0]
  }

  async activateProvider(id: string): Promise<void> {
    // Deactivate all providers first
    await this.db.update(schema.providers).set({ isActive: false })
    // Activate the target provider
    await this.db
      .update(schema.providers)
      .set({ isActive: true })
      .where(eq(schema.providers.id, id))
  }

  async updateProvider(id: string, data: Partial<ProviderInsert>): Promise<void> {
    await this.db.update(schema.providers).set(data).where(eq(schema.providers.id, id))
  }

  async deleteProvider(id: string): Promise<void> {
    await this.db.delete(schema.providers).where(eq(schema.providers.id, id))
  }

  // Settings CRUD
  async getSetting(key: string): Promise<string | undefined> {
    const results = await this.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1)
    return results[0]?.value
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
  }

  async deleteSetting(key: string): Promise<void> {
    await this.db.delete(schema.settings).where(eq(schema.settings.key, key))
  }

  // Utility
  close(): void {
    this.sqlite.close()
  }
}

// Singleton instance
let dbInstance: DatabaseService | null = null

export function getDatabase(dbPath?: string): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService(dbPath)
  }
  return dbInstance
}
