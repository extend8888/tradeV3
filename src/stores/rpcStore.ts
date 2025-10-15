import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Connection } from '@solana/web3.js';
import { RPCNode, RPCStats } from '@/types';
import { DEFAULT_RPC_NODES, STORAGE_KEYS, RPC_LIMITS } from '@/constants';

interface RPCState {
  // 状态
  nodes: RPCNode[];
  activeNodeId: string | null;
  currentNode: RPCNode | null;
  isConnected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  connection: Connection | null;
  stats: RPCStats;
  isChecking: boolean;
  lastHealthCheck: Date | null;

  // 操作
  addNode: (node: Omit<RPCNode, 'id' | 'lastChecked'>) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<RPCNode>) => void;
  setActiveNode: (nodeId: string) => Promise<boolean>;
  setCurrentNode: (nodeId: string) => Promise<boolean>;
  testConnection: (nodeId: string) => Promise<{ success: boolean; error: string | null; latency: number }>;
  startHealthCheck: () => void;
  stopHealthCheck: () => void;
  checkNodeHealth: (nodeId: string) => Promise<boolean>;
  checkAllNodesHealth: () => Promise<void>;
  getConnection: () => Connection | null;
  getBestNode: () => RPCNode | null;
  resetToDefaults: () => void;
  calculateStats: (nodes: RPCNode[]) => RPCStats;
}

export const useRPCStore = create<RPCState>()(
  persist(
    (set, get) => ({
      // 初始状态
      nodes: DEFAULT_RPC_NODES,
      activeNodeId: 'zan', // 默认使用zan节点
      currentNode: DEFAULT_RPC_NODES.find(node => node.id === 'zan') || DEFAULT_RPC_NODES[0] || null,
    isConnected: false,
    connectionStatus: 'disconnected',
      connection: null,
      stats: {
        totalNodes: DEFAULT_RPC_NODES.length,
        activeNodes: 0,
        averageLatency: 0,
        bestNode: undefined
      },
      isChecking: false,
      lastHealthCheck: null,

      // 添加RPC节点
      addNode: (nodeData) => {
        const newNode: RPCNode = {
          ...nodeData,
          id: `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          lastChecked: new Date(),
          status: 'disconnected'
        };

        set((state) => {
          const updatedNodes = [...state.nodes, newNode];
          return {
            nodes: updatedNodes,
            stats: {
              ...state.stats,
              totalNodes: updatedNodes.length
            }
          };
        });
      },

      // 删除RPC节点
      removeNode: (nodeId) => {
        set((state) => {
          const updatedNodes = state.nodes.filter(node => node.id !== nodeId);
          const newActiveNodeId = state.activeNodeId === nodeId 
            ? updatedNodes.find(node => node.isActive)?.id || updatedNodes[0]?.id || null
            : state.activeNodeId;

          return {
            nodes: updatedNodes,
            activeNodeId: newActiveNodeId,
            connection: state.activeNodeId === nodeId ? null : state.connection,
            stats: {
              ...state.stats,
              totalNodes: updatedNodes.length
            }
          };
        });
      },

      // 更新RPC节点
      updateNode: (nodeId, updates) => {
        set((state) => {
          const updatedNodes = state.nodes.map(node => 
            node.id === nodeId 
              ? { ...node, ...updates, lastChecked: new Date() }
              : node
          );

          return {
            nodes: updatedNodes,
            stats: get().calculateStats(updatedNodes)
          };
        });
      },

      // 设置活跃节点
      setActiveNode: async (nodeId) => {
        const { nodes, checkNodeHealth } = get();
        const node = nodes.find(n => n.id === nodeId);
        
        if (!node) {
          console.error('节点未找到:', nodeId);
          return false;
        }

        try {
          // 检查节点健康状态
          const isHealthy = await checkNodeHealth(nodeId);
          
          if (!isHealthy) {
            console.error('节点不健康:', nodeId);
            return false;
          }

          // 创建新连接 - 配置正确的WebSocket端点
          let wsEndpoint = undefined;

          // 如果节点配置了自定义WebSocket端点，优先使用
          if (node.wsEndpoint) {
            wsEndpoint = node.wsEndpoint;
          } else {
            // 自动推断WebSocket URL
            // 特殊处理zan.top的WebSocket URL
            if (node.url.includes('api.zan.top')) {
              // zan.top的WebSocket格式: wss://api.zan.top/node/ws/v1/solana/mainnet/{api-key}
              const apiKey = node.url.split('/').pop(); // 获取API key
              wsEndpoint = `wss://api.zan.top/node/ws/v1/solana/mainnet/${apiKey}`;
            } else if (node.url.startsWith('https://')) {
              // 其他RPC的标准WebSocket转换
              wsEndpoint = node.url.replace('https://', 'wss://');
            } else if (node.url.startsWith('http://')) {
              wsEndpoint = node.url.replace('http://', 'ws://');
            }
          }

          const connection = new Connection(node.url, {
            commitment: 'confirmed',
            wsEndpoint, // 使用正确的WebSocket端点
            disableRetryOnRateLimit: false,
            confirmTransactionInitialTimeout: 60000,
            httpHeaders: {
              'Content-Type': 'application/json'
            }
          });

          // 更新状态
          set((state) => {
            const updatedNodes = state.nodes.map(n => ({
              ...n,
              isActive: n.id === nodeId
            }));

            return {
              nodes: updatedNodes,
              activeNodeId: nodeId,
              currentNode: node,
              isConnected: true,
              connection,
              stats: get().calculateStats(updatedNodes)
            };
          });

          return true;
        } catch (error) {
          console.error('设置活跃节点失败:', error);
          set({ isConnected: false });
          return false;
        }
      },

      // 设置当前节点（别名方法）
      setCurrentNode: async (nodeId) => {
        return get().setActiveNode(nodeId);
      },

      // 开始健康检查
      startHealthCheck: () => {
        startRPCHealthCheck();
      },

      // 停止健康检查
      stopHealthCheck: () => {
        stopRPCHealthCheck();
      },

      // 测试连接（返回详细结果）
      testConnection: async (nodeId) => {
        const { nodes, updateNode } = get();
        const node = nodes.find(n => n.id === nodeId);
        
        if (!node) {
          return { success: false, error: '节点未找到', latency: 0 };
        }

        try {
          const startTime = Date.now();
          const connection = new Connection(node.url, {
            commitment: 'confirmed',
            wsEndpoint: null // 禁用WebSocket
          });
          
          // 测试连接
          await Promise.race([
            connection.getSlot(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), RPC_LIMITS.TIMEOUT)
            )
          ]);

          const latency = Date.now() - startTime;
          
          // 更新节点状态
          updateNode(nodeId, {
            status: 'connected',
            latency,
            lastChecked: new Date()
          });

          return { success: true, latency, error: null };
        } catch (error) {
          // 更新节点状态为断开
          updateNode(nodeId, {
            status: 'disconnected',
            latency: 0,
            lastChecked: new Date()
          });

          return { success: false, error: error instanceof Error ? error.message : '未知错误', latency: 0 };
        }
      },

      // 检查单个节点健康状态
      checkNodeHealth: async (nodeId) => {
        const { nodes, updateNode } = get();
        const node = nodes.find(n => n.id === nodeId);
        
        if (!node) return false;

        try {
          const startTime = Date.now();
          const connection = new Connection(node.url, {
            commitment: 'confirmed',
            wsEndpoint: null // 禁用WebSocket
          });
          
          // 测试连接
          await Promise.race([
            connection.getSlot(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), RPC_LIMITS.TIMEOUT)
            )
          ]);

          const latency = Date.now() - startTime;
          
          // 更新节点状态
          updateNode(nodeId, {
            status: 'connected',
            latency,
            lastChecked: new Date()
          });

          return true;
        } catch (error) {
          // 更新节点状态为断开
          updateNode(nodeId, {
            status: 'disconnected',
            latency: 0,
            lastChecked: new Date()
          });

          return false;
        }
      },

      // 检查所有节点健康状态
      checkAllNodesHealth: async () => {
        const { nodes, checkNodeHealth } = get();
        
        set({ isChecking: true });

        try {
          // 并发检查所有节点
          const healthChecks = nodes.map(node => 
            checkNodeHealth(node.id).catch(() => false)
          );

          await Promise.all(healthChecks);

          set({ 
            lastHealthCheck: new Date(),
            isChecking: false 
          });
        } catch (error) {
          console.error('Health check failed:', error);
          set({ isChecking: false });
        }
      },

      // 获取当前连接
      getConnection: () => {
        return get().connection;
      },

      // 获取最佳节点
      getBestNode: () => {
        const { nodes } = get();
        const connectedNodes = nodes.filter(node => node.status === 'connected');
        
        if (connectedNodes.length === 0) return null;
        
        // 按延迟排序，返回最快的节点
        return connectedNodes.sort((a, b) => a.latency - b.latency)[0];
      },

      // 重置为默认配置
      resetToDefaults: () => {
        set({
          nodes: DEFAULT_RPC_NODES,
          activeNodeId: DEFAULT_RPC_NODES[0]?.id || null,
          connection: null,
          stats: {
            totalNodes: DEFAULT_RPC_NODES.length,
            activeNodes: 0,
            averageLatency: 0,
            bestNode: undefined
          },
          isChecking: false,
          lastHealthCheck: null
        });
      },

      // 计算统计信息（辅助函数）
      calculateStats: (nodes: RPCNode[]): RPCStats => {
        const connectedNodes = nodes.filter(node => node.status === 'connected');
        const totalLatency = connectedNodes.reduce((sum, node) => sum + node.latency, 0);
        const averageLatency = connectedNodes.length > 0 ? totalLatency / connectedNodes.length : 0;
        const bestNode = connectedNodes.length > 0 
          ? connectedNodes.sort((a, b) => a.latency - b.latency)[0]
          : undefined;

        return {
          totalNodes: nodes.length,
          activeNodes: connectedNodes.length,
          averageLatency: Math.round(averageLatency),
          bestNode
        };
      }
    }),
    {
      name: STORAGE_KEYS.RPC_NODES,
      partialize: (state) => ({
        nodes: state.nodes,
        activeNodeId: state.activeNodeId,
        currentNode: state.currentNode
      }),
      onRehydrateStorage: () => (state) => {
        // 确保 currentNode 在重新加载时被正确设置
        if (state && !state.currentNode && state.activeNodeId) {
          const activeNode = state.nodes.find(node => node.id === state.activeNodeId);
          if (activeNode) {
            state.currentNode = activeNode;
          } else {
            // 如果没有找到activeNodeId对应的节点，使用默认的zan节点
            const zanNode = state.nodes.find(node => node.id === 'zan');
            if (zanNode) {
              state.currentNode = zanNode;
              state.activeNodeId = 'zan';
            }
          }
        } else if (state && !state.currentNode) {
          // 如果完全没有currentNode，设置默认的zan节点
          const zanNode = state.nodes.find(node => node.id === 'zan');
          if (zanNode) {
            state.currentNode = zanNode;
            state.activeNodeId = 'zan';
          }
        }
      }
    }
  )
);

// 自动健康检查
let healthCheckInterval: NodeJS.Timeout | null = null;

export const startRPCHealthCheck = () => {
  if (healthCheckInterval) return;
  
  healthCheckInterval = setInterval(() => {
    const store = useRPCStore.getState();
    if (!store.isChecking) {
      store.checkAllNodesHealth();
    }
  }, RPC_LIMITS.HEALTH_CHECK_INTERVAL);
};

export const stopRPCHealthCheck = () => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
};

// 导出store类型
export type RPCStore = typeof useRPCStore;