/**
 * Tests for MCPService
 *
 * Run with: npx tsx --test src/main/__tests__/mcp-service.test.ts
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MCPService } from '../services/mcp-service';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { MCPConfig } from '../../shared/types';

describe('MCPService', () => {
  let mcpService: MCPService;
  let tempDir: string;
  let globalConfigPath: string;
  let workspaceConfigPath: string;
  let originalHome: string;

  beforeEach(async () => {
    // Create a temporary test directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    originalHome = process.env.HOME || os.homedir();

    // Override HOME for testing global config
    process.env.HOME = tempDir;

    // Create workspace directory
    const workspaceDir = path.join(tempDir, 'workspace');
    await fs.mkdir(workspaceDir, { recursive: true });

    globalConfigPath = path.join(tempDir, '.claude', 'mcp.json');
    workspaceConfigPath = path.join(workspaceDir, '.claude', 'mcp.json');

    mcpService = new MCPService(workspaceDir);
  });

  afterEach(async () => {
    // Restore original HOME
    process.env.HOME = originalHome;

    // Clean up test files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should initialize with workspace path', () => {
      const workspacePath = '/test/workspace';
      const service = new MCPService(workspacePath);
      assert.ok(service);
    });

    it('should initialize without workspace path', () => {
      const service = new MCPService(null);
      assert.ok(service);
    });

    it('should initialize with undefined workspace path', () => {
      const service = new MCPService();
      assert.ok(service);
    });
  });

  describe('setWorkspacePath', () => {
    it('should update workspace path', async () => {
      const newWorkspacePath = path.join(tempDir, 'new-workspace');
      await fs.mkdir(newWorkspacePath, { recursive: true });

      mcpService.setWorkspacePath(newWorkspacePath);

      // Write config to new workspace
      const config: MCPConfig = {
        mcpServers: {
          test: { type: 'stdio', command: 'test' }
        }
      };
      await mcpService.updateConfig(config, 'workspace');

      // Verify file was written to new workspace
      const newConfigPath = path.join(newWorkspacePath, '.claude', 'mcp.json');
      const content = await fs.readFile(newConfigPath, 'utf-8');
      const parsed = JSON.parse(content);
      assert.deepEqual(parsed, config);
    });

    it('should set workspace path to null', () => {
      mcpService.setWorkspacePath(null);

      // Should throw when trying to update workspace config
      assert.rejects(() => mcpService.updateConfig({ mcpServers: {} }, 'workspace'), /no workspace path set/);
    });
  });

  describe('getConfig', () => {
    it('should return empty config when no files exist', async () => {
      const config = await mcpService.getConfig();
      assert.deepEqual(config, { mcpServers: {} });
    });

    it('should return global config when only global exists', async () => {
      const globalConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/tmp']
          }
        }
      };

      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig), 'utf-8');

      const config = await mcpService.getConfig();
      assert.deepEqual(config, globalConfig);
    });

    it('should return workspace config when only workspace exists', async () => {
      const workspaceConfig: MCPConfig = {
        mcpServers: {
          github: {
            type: 'sse',
            url: 'http://localhost:3000/sse'
          }
        }
      };

      await fs.mkdir(path.dirname(workspaceConfigPath), { recursive: true });
      await fs.writeFile(workspaceConfigPath, JSON.stringify(workspaceConfig), 'utf-8');

      const config = await mcpService.getConfig();
      assert.deepEqual(config, workspaceConfig);
    });

    it('should merge global and workspace configs', async () => {
      const globalConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/tmp']
          },
          github: {
            type: 'http',
            url: 'http://global-github.com'
          }
        }
      };

      const workspaceConfig: MCPConfig = {
        mcpServers: {
          slack: {
            type: 'sse',
            url: 'http://localhost:4000/sse'
          }
        }
      };

      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig), 'utf-8');
      await fs.mkdir(path.dirname(workspaceConfigPath), { recursive: true });
      await fs.writeFile(workspaceConfigPath, JSON.stringify(workspaceConfig), 'utf-8');

      const config = await mcpService.getConfig();
      assert.deepEqual(config, {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/tmp']
          },
          github: {
            type: 'http',
            url: 'http://global-github.com'
          },
          slack: {
            type: 'sse',
            url: 'http://localhost:4000/sse'
          }
        }
      });
    });

    it('should override global config with workspace config for same server name', async () => {
      const globalConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/tmp']
          }
        }
      };

      const workspaceConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/workspace/data']
          }
        }
      };

      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig), 'utf-8');
      await fs.mkdir(path.dirname(workspaceConfigPath), { recursive: true });
      await fs.writeFile(workspaceConfigPath, JSON.stringify(workspaceConfig), 'utf-8');

      const config = await mcpService.getConfig();
      assert.deepEqual(config, {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/workspace/data']
          }
        }
      });
    });

    it('should handle invalid JSON in global config gracefully', async () => {
      const workspaceConfig: MCPConfig = {
        mcpServers: {
          github: {
            type: 'sse',
            url: 'http://localhost:3000/sse'
          }
        }
      };

      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, 'invalid json{', 'utf-8');
      await fs.mkdir(path.dirname(workspaceConfigPath), { recursive: true });
      await fs.writeFile(workspaceConfigPath, JSON.stringify(workspaceConfig), 'utf-8');

      const config = await mcpService.getConfig();
      assert.deepEqual(config, workspaceConfig);
    });

    it('should handle invalid JSON in workspace config gracefully', async () => {
      const globalConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem'
          }
        }
      };

      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig), 'utf-8');
      await fs.mkdir(path.dirname(workspaceConfigPath), { recursive: true });
      await fs.writeFile(workspaceConfigPath, 'invalid json{', 'utf-8');

      const config = await mcpService.getConfig();
      assert.deepEqual(config, globalConfig);
    });

    it('should skip config file with invalid structure', async () => {
      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, JSON.stringify({ wrongKey: {} }), 'utf-8');

      const config = await mcpService.getConfig();
      assert.deepEqual(config, { mcpServers: {} });
    });

    it('should handle workspace config when workspace path is null', async () => {
      const service = new MCPService(null);
      const globalConfig: MCPConfig = {
        mcpServers: {
          test: { type: 'stdio', command: 'test' }
        }
      };

      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig), 'utf-8');

      const config = await service.getConfig();
      assert.deepEqual(config, globalConfig);
    });
  });

  describe('updateConfig', () => {
    describe('global scope', () => {
      it('should write global config', async () => {
        const config: MCPConfig = {
          mcpServers: {
            filesystem: {
              type: 'stdio',
              command: 'mcp-server-filesystem',
              args: ['/tmp']
            }
          }
        };

        await mcpService.updateConfig(config, 'global');

        const content = await fs.readFile(globalConfigPath, 'utf-8');
        const parsed = JSON.parse(content);
        assert.deepEqual(parsed, config);
      });

      it('should create directory if it does not exist', async () => {
        const config: MCPConfig = {
          mcpServers: {
            test: { type: 'stdio', command: 'test' }
          }
        };

        await mcpService.updateConfig(config, 'global');

        const exists = await fs
          .access(path.dirname(globalConfigPath))
          .then(() => true)
          .catch(() => false);
        assert.equal(exists, true);
      });

      it('should write with pretty formatting', async () => {
        const config: MCPConfig = {
          mcpServers: {
            test: { type: 'stdio', command: 'test' }
          }
        };

        await mcpService.updateConfig(config, 'global');

        const content = await fs.readFile(globalConfigPath, 'utf-8');
        assert.ok(content.includes('\n'));
        assert.ok(content.includes('  '));
      });

      it('should handle multiple server types', async () => {
        const config: MCPConfig = {
          mcpServers: {
            filesystem: {
              type: 'stdio',
              command: 'mcp-server-filesystem',
              args: ['/tmp'],
              env: { DEBUG: 'true' }
            },
            github: {
              type: 'sse',
              url: 'http://localhost:3000/sse',
              headers: { Authorization: 'Bearer token' }
            },
            api: {
              type: 'http',
              url: 'http://api.example.com',
              headers: { 'X-API-Key': 'key' }
            }
          }
        };

        await mcpService.updateConfig(config, 'global');

        const saved = await mcpService.getConfig();
        assert.deepEqual(saved, config);
      });
    });

    describe('workspace scope', () => {
      it('should write workspace config', async () => {
        const config: MCPConfig = {
          mcpServers: {
            github: {
              type: 'sse',
              url: 'http://localhost:3000/sse'
            }
          }
        };

        await mcpService.updateConfig(config, 'workspace');

        const content = await fs.readFile(workspaceConfigPath, 'utf-8');
        const parsed = JSON.parse(content);
        assert.deepEqual(parsed, config);
      });

      it('should throw error when workspace path is not set', async () => {
        const service = new MCPService(null);
        const config: MCPConfig = {
          mcpServers: {
            test: { type: 'stdio', command: 'test' }
          }
        };

        await assert.rejects(() => service.updateConfig(config, 'workspace'), /no workspace path set/);
      });

      it('should create workspace directory if it does not exist', async () => {
        const config: MCPConfig = {
          mcpServers: {
            test: { type: 'stdio', command: 'test' }
          }
        };

        await mcpService.updateConfig(config, 'workspace');

        const exists = await fs
          .access(path.dirname(workspaceConfigPath))
          .then(() => true)
          .catch(() => false);
        assert.equal(exists, true);
      });
    });

    describe('validation', () => {
      it('should reject config without mcpServers property', async () => {
        const config = { wrongKey: {} } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must have mcpServers property/);
      });

      it('should reject config where mcpServers is not an object', async () => {
        const config = { mcpServers: 'string' } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must be an object/);
      });

      it('should reject config where mcpServers is null', async () => {
        const config = { mcpServers: null } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must be an object/);
      });

      it('should reject config where mcpServers is an array', async () => {
        const config = { mcpServers: [] } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must be an object/);
      });

      it('should reject server config without type field', async () => {
        const config = {
          mcpServers: {
            test: { command: 'test' }
          }
        } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must have a type field/);
      });

      it('should reject server config with invalid type', async () => {
        const config = {
          mcpServers: {
            test: { type: 'invalid', command: 'test' }
          }
        } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /invalid type "invalid"/);
      });

      it('should reject stdio server without command field', async () => {
        const config = {
          mcpServers: {
            test: { type: 'stdio' }
          }
        } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must have a command field/);
      });

      it('should reject sse server without url field', async () => {
        const config = {
          mcpServers: {
            test: { type: 'sse' }
          }
        } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must have a url field/);
      });

      it('should reject http server without url field', async () => {
        const config = {
          mcpServers: {
            test: { type: 'http' }
          }
        } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must have a url field/);
      });

      it('should accept empty mcpServers object', async () => {
        const config: MCPConfig = {
          mcpServers: {}
        };

        // Should not throw
        await mcpService.updateConfig(config, 'global');

        const saved = await mcpService.getConfig();
        assert.deepEqual(saved, config);
      });

      it('should accept valid stdio config with all optional fields', async () => {
        const config: MCPConfig = {
          mcpServers: {
            test: {
              type: 'stdio',
              command: 'test-command',
              args: ['--flag', 'value'],
              env: { VAR: 'value' }
            }
          }
        };

        await mcpService.updateConfig(config, 'global');
        const saved = await mcpService.getConfig();
        assert.deepEqual(saved, config);
      });

      it('should accept valid sse config with headers', async () => {
        const config: MCPConfig = {
          mcpServers: {
            test: {
              type: 'sse',
              url: 'http://localhost:3000/sse',
              headers: { Authorization: 'Bearer token' }
            }
          }
        };

        await mcpService.updateConfig(config, 'global');
        const saved = await mcpService.getConfig();
        assert.deepEqual(saved, config);
      });

      it('should accept valid http config with headers', async () => {
        const config: MCPConfig = {
          mcpServers: {
            test: {
              type: 'http',
              url: 'http://api.example.com',
              headers: { 'X-API-Key': 'key' }
            }
          }
        };

        await mcpService.updateConfig(config, 'global');
        const saved = await mcpService.getConfig();
        assert.deepEqual(saved, config);
      });

      it('should reject stdio config with command as non-string', async () => {
        const config = {
          mcpServers: {
            test: { type: 'stdio', command: 123 }
          }
        } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must have a command field/);
      });

      it('should reject sse config with url as non-string', async () => {
        const config = {
          mcpServers: {
            test: { type: 'sse', url: 123 }
          }
        } as unknown as MCPConfig;

        await assert.rejects(() => mcpService.updateConfig(config, 'global'), /must have a url field/);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should support full workflow: write global, write workspace, read merged', async () => {
      // Write global config
      const globalConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/tmp']
          },
          github: {
            type: 'sse',
            url: 'http://global-github.com'
          }
        }
      };
      await mcpService.updateConfig(globalConfig, 'global');

      // Write workspace config
      const workspaceConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/workspace/data']
          },
          slack: {
            type: 'http',
            url: 'http://slack.example.com'
          }
        }
      };
      await mcpService.updateConfig(workspaceConfig, 'workspace');

      // Read merged config
      const merged = await mcpService.getConfig();
      assert.deepEqual(merged, {
        mcpServers: {
          filesystem: {
            type: 'stdio',
            command: 'mcp-server-filesystem',
            args: ['/workspace/data']
          },
          github: {
            type: 'sse',
            url: 'http://global-github.com'
          },
          slack: {
            type: 'http',
            url: 'http://slack.example.com'
          }
        }
      });
    });

    it('should support changing workspace path mid-lifecycle', async () => {
      // Write to first workspace
      const workspace1 = path.join(tempDir, 'workspace1');
      await fs.mkdir(workspace1, { recursive: true });
      mcpService.setWorkspacePath(workspace1);

      const config1: MCPConfig = {
        mcpServers: {
          test1: { type: 'stdio', command: 'test1' }
        }
      };
      await mcpService.updateConfig(config1, 'workspace');

      // Change to second workspace
      const workspace2 = path.join(tempDir, 'workspace2');
      await fs.mkdir(workspace2, { recursive: true });
      mcpService.setWorkspacePath(workspace2);

      const config2: MCPConfig = {
        mcpServers: {
          test2: { type: 'stdio', command: 'test2' }
        }
      };
      await mcpService.updateConfig(config2, 'workspace');

      // Verify first workspace config unchanged
      const content1 = await fs.readFile(path.join(workspace1, '.claude', 'mcp.json'), 'utf-8');
      assert.deepEqual(JSON.parse(content1), config1);

      // Verify second workspace config written
      const content2 = await fs.readFile(path.join(workspace2, '.claude', 'mcp.json'), 'utf-8');
      assert.deepEqual(JSON.parse(content2), config2);
    });
  });
});
