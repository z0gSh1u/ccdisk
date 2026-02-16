/**
 * Tests for ConfigService
 *
 * Run with: npx tsx --test src/main/__tests__/config-service.test.ts
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigService } from '../services/config-service';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Provider } from '../../shared/types';

describe('ConfigService', () => {
  let configService: ConfigService;
  let testSettingsPath: string;
  let originalHome: string;

  beforeEach(async () => {
    // Create a temporary test directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    originalHome = process.env.HOME || os.homedir();

    // Override HOME for testing
    process.env.HOME = tempDir;

    testSettingsPath = path.join(tempDir, '.claude', 'settings.json');
    configService = new ConfigService();
  });

  afterEach(async () => {
    // Restore original HOME
    process.env.HOME = originalHome;

    // Clean up test files
    try {
      const tempDir = path.dirname(path.dirname(testSettingsPath));
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('getSettings', () => {
    it('should return empty object when file does not exist', async () => {
      const settings = await configService.getSettings();
      assert.deepEqual(settings, {});
    });

    it('should return parsed settings when file exists', async () => {
      // Create settings file
      await fs.mkdir(path.dirname(testSettingsPath), { recursive: true });
      await fs.writeFile(testSettingsPath, JSON.stringify({ env: { TEST_VAR: 'test' } }), 'utf-8');

      const settings = await configService.getSettings();
      assert.deepEqual(settings, { env: { TEST_VAR: 'test' } });
    });

    it('should return empty object when JSON is invalid', async () => {
      // Create invalid JSON file
      await fs.mkdir(path.dirname(testSettingsPath), { recursive: true });
      await fs.writeFile(testSettingsPath, 'invalid json{', 'utf-8');

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {});
    });
  });

  describe('updateSettings', () => {
    it('should create directory if it does not exist', async () => {
      await configService.updateSettings({ env: { TEST: 'value' } });

      const exists = await fs
        .access(path.dirname(testSettingsPath))
        .then(() => true)
        .catch(() => false);
      assert.equal(exists, true);
    });

    it('should write settings with pretty formatting', async () => {
      await configService.updateSettings({ env: { TEST: 'value' } });

      const content = await fs.readFile(testSettingsPath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.deepEqual(parsed, { env: { TEST: 'value' } });
      assert.ok(content.includes('\n')); // Check for pretty formatting
    });

    it('should merge with existing settings', async () => {
      // Create initial settings
      await fs.mkdir(path.dirname(testSettingsPath), { recursive: true });
      await fs.writeFile(
        testSettingsPath,
        JSON.stringify({ existing: 'value', env: { EXISTING_VAR: 'old' } }),
        'utf-8'
      );

      // Update with new settings
      await configService.updateSettings({ env: { NEW_VAR: 'new' }, other: 'data' });

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        existing: 'value',
        env: {
          EXISTING_VAR: 'old',
          NEW_VAR: 'new'
        },
        other: 'data'
      });
    });

    it('should deep merge nested objects', async () => {
      // Create initial settings
      await fs.mkdir(path.dirname(testSettingsPath), { recursive: true });
      await fs.writeFile(
        testSettingsPath,
        JSON.stringify({ env: { VAR1: 'value1' }, nested: { key1: 'val1' } }),
        'utf-8'
      );

      // Update with nested changes
      await configService.updateSettings({
        env: { VAR2: 'value2' },
        nested: { key2: 'val2' }
      });

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        env: { VAR1: 'value1', VAR2: 'value2' },
        nested: { key1: 'val1', key2: 'val2' }
      });
    });

    it('should overwrite arrays instead of merging', async () => {
      await fs.mkdir(path.dirname(testSettingsPath), { recursive: true });
      await fs.writeFile(testSettingsPath, JSON.stringify({ list: [1, 2, 3] }), 'utf-8');

      await configService.updateSettings({ list: [4, 5] });

      const settings = await configService.getSettings();
      assert.deepEqual(settings, { list: [4, 5] });
    });
  });

  describe('syncProviderToFile', () => {
    it('should sync provider apiKey to ANTHROPIC_AUTH_TOKEN', async () => {
      const provider: Provider = {
        id: '1',
        name: 'Test Provider',
        apiKey: 'test-api-key',
        baseUrl: null,
        extraEnv: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await configService.syncProviderToFile(provider);

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'test-api-key'
        }
      });
    });

    it('should sync provider baseUrl to ANTHROPIC_BASE_URL', async () => {
      const provider: Provider = {
        id: '1',
        name: 'Test Provider',
        apiKey: 'test-api-key',
        baseUrl: 'https://custom-base-url.com',
        extraEnv: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await configService.syncProviderToFile(provider);

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'test-api-key',
          ANTHROPIC_BASE_URL: 'https://custom-base-url.com'
        }
      });
    });

    it('should merge extraEnv into env object', async () => {
      const provider: Provider = {
        id: '1',
        name: 'Test Provider',
        apiKey: 'test-api-key',
        baseUrl: null,
        extraEnv: JSON.stringify({ CUSTOM_VAR: 'custom-value', OTHER_VAR: 'other' }),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await configService.syncProviderToFile(provider);

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'test-api-key',
          CUSTOM_VAR: 'custom-value',
          OTHER_VAR: 'other'
        }
      });
    });

    it('should handle all provider fields together', async () => {
      const provider: Provider = {
        id: '1',
        name: 'Test Provider',
        apiKey: 'test-api-key',
        baseUrl: 'https://custom-base.com',
        extraEnv: JSON.stringify({ EXTRA: 'extra-value' }),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await configService.syncProviderToFile(provider);

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'test-api-key',
          ANTHROPIC_BASE_URL: 'https://custom-base.com',
          EXTRA: 'extra-value'
        }
      });
    });

    it('should preserve non-env settings when syncing provider', async () => {
      // Create initial settings with non-env data
      await fs.mkdir(path.dirname(testSettingsPath), { recursive: true });
      await fs.writeFile(testSettingsPath, JSON.stringify({ other: 'data', env: { OLD_VAR: 'old' } }), 'utf-8');

      const provider: Provider = {
        id: '1',
        name: 'Test Provider',
        apiKey: 'new-api-key',
        baseUrl: null,
        extraEnv: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await configService.syncProviderToFile(provider);

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        other: 'data',
        env: {
          OLD_VAR: 'old',
          ANTHROPIC_AUTH_TOKEN: 'new-api-key'
        }
      });
    });

    it('should handle invalid extraEnv JSON gracefully', async () => {
      const provider: Provider = {
        id: '1',
        name: 'Test Provider',
        apiKey: 'test-api-key',
        baseUrl: null,
        extraEnv: 'invalid json{',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Should not throw
      await configService.syncProviderToFile(provider);

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'test-api-key'
        }
      });
    });

    it('should handle extraEnv that is not an object', async () => {
      const provider: Provider = {
        id: '1',
        name: 'Test Provider',
        apiKey: 'test-api-key',
        baseUrl: null,
        extraEnv: JSON.stringify('string value'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await configService.syncProviderToFile(provider);

      const settings = await configService.getSettings();
      assert.deepEqual(settings, {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'test-api-key'
        }
      });
    });
  });
});
