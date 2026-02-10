/**
 * Drizzle ORM schema for SQLite database
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sdkSessionId: text('sdk_session_id'),
  model: text('model'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(), // JSON serialized
  tokenUsage: text('token_usage'), // JSON serialized
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull(),
  baseUrl: text('base_url'),
  extraEnv: text('extra_env'), // JSON object
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

// Type inference helpers
export type SessionInsert = typeof sessions.$inferInsert
export type SessionSelect = typeof sessions.$inferSelect

export type MessageInsert = typeof messages.$inferInsert
export type MessageSelect = typeof messages.$inferSelect

export type ProviderInsert = typeof providers.$inferInsert
export type ProviderSelect = typeof providers.$inferSelect

export type SettingInsert = typeof settings.$inferInsert
export type SettingSelect = typeof settings.$inferSelect
