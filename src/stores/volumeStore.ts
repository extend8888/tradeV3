import { create } from 'zustand';
import { VolumeConfig, VolumeSession, VolumeOrder, VolumeStats, DEFAULT_VOLUME_CONFIG } from '@/types/volume';
import { useLogStore } from './logStore';
import { useRPCStore } from './rpcStore';
import { useWalletStore } from './walletStore';
import {
  initializePumpSdk,
  executeBuyTransaction,
  executeSellTransaction
} from '@/utils/pump';
import { createKeypairFromPrivateKey } from '@/utils/solana';

interface VolumeState {
  // 配置
  config: VolumeConfig;
  
  // 状态
  isRunning: boolean;
  currentSession: VolumeSession | null;
  orders: VolumeOrder[];
  stats: VolumeStats;
  selectedWalletId: string | null;
  
  // 钱包轮换状态
  currentWalletIndex: number;
  ordersSinceLastRotation: number;
  recentWalletUsage: Record<string, number>;
  availableWallets: string[];
  
  // 内部状态
  executionTimer: NodeJS.Timeout | null;
  nextOrderTime: Date | null;
  
  // 操作
  updateConfig: (config: Partial<VolumeConfig>) => void;
  setSelectedWallet: (walletId: string | null) => void;
  startSession: () => Promise<void>;
  stopSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  refreshData: () => void;
  getStats: () => VolumeStats;
  
  // 钱包轮换操作
  getNextWallet: () => string | null;
  updateAvailableWallets: () => void;
  shouldRotateWallet: () => boolean;
  rotateToNextWallet: () => void;
  resetWalletRotation: () => void;
  
  // 内部方法
  executeOrder: () => Promise<void>;
  scheduleNextOrder: () => void;
  addOrder: (order: Omit<VolumeOrder, 'id' | 'createdAt'>) => void;
  updateOrder: (orderId: string, updates: Partial<VolumeOrder>) => void;
  clearOrders: () => void;
}

export const useVolumeStore = create<VolumeState>((set, get) => ({
  // 初始状态
  config: DEFAULT_VOLUME_CONFIG,
  isRunning: false,
  currentSession: null,
  orders: [],
  selectedWalletId: null,
  
  // 钱包轮换状态
    currentWalletIndex: 0,
    ordersSinceLastRotation: 0,
    recentWalletUsage: {},
    availableWallets: [],
  
  stats: {
    activeSessions: 0,
    totalSessions: 0,
    totalOrders: 0,
    completedOrders: 0,
    failedOrders: 0,
    successRate: 0,
    totalVolume: 0,
    totalFees: 0,
    averageOrderSize: 0,
    averageExecutionTime: 0,
    ordersPerMinute: 0,
    runningTime: 0
  },
  
  // 内部状态
  executionTimer: null,
  nextOrderTime: null,

  // 更新配置
  updateConfig: (newConfig) => {
    const currentConfig = get().config;
    const updatedConfig = { ...currentConfig, ...newConfig };
    
    set({ config: updatedConfig });
    
    // 保存到本地存储
    try {
      localStorage.setItem('volume_config', JSON.stringify(updatedConfig));
    } catch (error) {
      console.warn('Failed to save volume config:', error);
    }
    
    // 记录日志
    useLogStore.getState().addLog({
      level: 'info',
      category: 'volume',
      message: '刷量配置已更新',
      details: newConfig
    });
  },

  // 设置选中的钱包
  setSelectedWallet: (walletId) => {
    set({ selectedWalletId: walletId });
    
    // 记录日志
    if (walletId) {
      const wallets = useWalletStore.getState().wallets;
      const wallet = wallets.find(w => w.id === walletId);
      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: '已选择刷量钱包',
        details: `钱包: ${wallet?.label || wallet?.address.slice(0, 8) || 'Unknown'}`
      });
    }
  },

  // 开始会话
  startSession: async () => {
    try {
      const { config } = get();
      
      // 基本验证
      if (!config.enabled) {
        throw new Error('刷量功能未启用');
      }
      
      if (!config.tokenAddress) {
        throw new Error('请设置代币地址');
      }
      
      // 创建新会话
      const session: VolumeSession = {
        id: `session_${Date.now()}`,
        startTime: new Date(),
        status: 'running',
        config: { ...config },
        totalPausedTime: 0,
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalVolume: 0,
        totalFees: 0,
        errorCount: 0
      };
      
      // 更新状态
      set({
        isRunning: true,
        currentSession: session
      });
      
      // 开始执行订单调度
      get().scheduleNextOrder();
      
      // 记录日志
      useLogStore.getState().addLog({
        level: 'success',
        category: 'volume',
        message: '刷量会话已启动，开始执行订单'
      });
      
    } catch (error) {
      // 记录错误
      useLogStore.getState().addLog({
        level: 'error',
        category: 'volume',
        message: '启动刷量会话失败',
        details: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  },

  // 停止会话
  stopSession: () => {
    const { currentSession, executionTimer } = get();
    
    // 清理定时器
    if (executionTimer) {
      clearTimeout(executionTimer);
    }
    
    if (currentSession) {
      const updatedSession = {
        ...currentSession,
        status: 'stopped' as const,
        endTime: new Date()
      };
      
      set({
        isRunning: false,
        currentSession: updatedSession,
        executionTimer: null,
        nextOrderTime: null
      });
      
      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: '刷量会话已停止'
      });
    }
  },

  // 暂停会话
  pauseSession: () => {
    const { currentSession, executionTimer } = get();
    
    if (currentSession && currentSession.status === 'running') {
      // 清理定时器
      if (executionTimer) {
        clearTimeout(executionTimer);
      }
      
      const updatedSession = {
        ...currentSession,
        status: 'paused' as const,
        pausedAt: new Date()
      };
      
      set({
        currentSession: updatedSession,
        executionTimer: null,
        nextOrderTime: null
      });
      
      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: '刷量会话已暂停'
      });
    }
  },

  // 恢复会话
  resumeSession: () => {
    const { currentSession } = get();
    
    if (currentSession && currentSession.status === 'paused') {
      // 计算本次暂停的时间
      const pausedDuration = currentSession.pausedAt 
        ? Date.now() - currentSession.pausedAt.getTime()
        : 0;
      
      const updatedSession = {
        ...currentSession,
        status: 'running' as const,
        totalPausedTime: currentSession.totalPausedTime + pausedDuration,
        pausedAt: undefined
      };
      
      set({
        currentSession: updatedSession
      });
      
      // 重新开始订单调度
      get().scheduleNextOrder();
      
      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: '刷量会话已恢复'
      });
    }
  },

  // 刷新数据
  refreshData: () => {
    const { orders, currentSession } = get();
    
    // 计算统计信息
    const completedOrders = orders.filter(order => order.status === 'completed');
    const failedOrders = orders.filter(order => order.status === 'failed');
    const totalVolume = completedOrders.reduce((sum, order) => sum + order.amount, 0);
    const successRate = orders.length > 0 ? (completedOrders.length / orders.length) * 100 : 0;
    
    // 计算运行时间（排除暂停时间，停止后不再计时）
    const runningTime = currentSession && currentSession.startTime 
      ? (() => {
          // 如果会话已停止，使用停止时间计算
          if (currentSession.status === 'stopped' && currentSession.endTime) {
            const totalElapsed = currentSession.endTime.getTime() - currentSession.startTime.getTime();
            const totalPausedTime = currentSession.totalPausedTime;
            return Math.floor((totalElapsed - totalPausedTime) / 1000);
          }
          
          // 如果会话正在运行或暂停，使用当前时间计算
          const totalElapsed = Date.now() - currentSession.startTime.getTime();
          const currentPausedTime = currentSession.status === 'paused' && currentSession.pausedAt
            ? Date.now() - currentSession.pausedAt.getTime()
            : 0;
          const totalPausedTime = currentSession.totalPausedTime + currentPausedTime;
          return Math.floor((totalElapsed - totalPausedTime) / 1000);
        })()
      : 0;

    const stats: VolumeStats = {
      activeSessions: currentSession && currentSession.status === 'running' ? 1 : 0,
      totalSessions: currentSession ? 1 : 0,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      failedOrders: failedOrders.length,
      successRate,
      totalVolume,
      totalFees: currentSession?.totalFees || 0,
      averageOrderSize: completedOrders.length > 0 ? totalVolume / completedOrders.length : 0,
      averageExecutionTime: 2.5, // 平均执行时间（秒）
      ordersPerMinute: runningTime > 0 ? (completedOrders.length / (runningTime / 60)) : 0,
      runningTime
    };
    
    set({ stats });
  },

  // 获取统计信息
  getStats: () => {
    return get().stats;
  },

  // 执行订单
  executeOrder: async () => {
    try {
      const { config, currentSession } = get();
      
      if (!currentSession || currentSession.status !== 'running') {
        return;
      }

      // 智能选择买入或卖出：只有钱包持有代币时才能卖出
      let orderType: 'buy' | 'sell' = 'buy'; // 默认买入
      
      // 获取可用钱包
      const walletStore = useWalletStore.getState();
      const availableWallets = walletStore.wallets.filter(w => w.isActive);
      
      if (availableWallets.length > 0) {
        // 先更新代币余额
        await walletStore.updateTokenBalances(config.tokenAddress);
        
        // 检查是否有钱包持有代币
        const walletsWithTokens = availableWallets.filter(wallet => {
          const tokenBalance = walletStore.tokenBalances.find(
            tb => tb.walletAddress === wallet.address && tb.tokenAddress === config.tokenAddress
          );
          return tokenBalance && tokenBalance.balance > 0;
        });
        
        // 如果有钱包持有代币，可以随机选择买入或卖出
        if (walletsWithTokens.length > 0) {
          orderType = Math.random() > 0.5 ? 'buy' : 'sell';
          
          useLogStore.getState().addLog({
            level: 'info',
            category: 'volume',
            message: `智能订单选择: ${walletsWithTokens.length}个钱包持有代币，选择${orderType === 'buy' ? '买入' : '卖出'}`
          });
        } else {
          // 没有钱包持有代币，只能买入
          orderType = 'buy';
          
          useLogStore.getState().addLog({
            level: 'info',
            category: 'volume',
            message: '没有钱包持有代币，强制选择买入订单'
          });
        }
      }
      
      // 随机生成订单金额
      const amount = Math.random() * (config.maxAmount - config.minAmount) + config.minAmount;
      
      // 创建订单
      const order: Omit<VolumeOrder, 'id' | 'createdAt'> = {
        sessionId: currentSession.id,
        walletId: get().selectedWalletId || '',
        type: orderType,
        amount: amount,
        status: 'pending'
      };

      // 添加订单到列表
      get().addOrder(order);
      
      // 获取刚添加的订单ID
      const addedOrder = get().orders[0]; // 新订单在数组开头
      const orderId = addedOrder.id;
      
      // 记录订单创建日志
      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: `创建${orderType === 'buy' ? '买入' : '卖出'}订单`,
        details: `订单ID: ${orderId}, 金额: ${amount.toFixed(4)} SOL`
      });
      
      // 真实订单执行过程
      setTimeout(async () => {
        try {
          // 获取当前配置和钱包信息
          const currentConfig = get().config;
          const rpcUrl = useRPCStore.getState().currentNode?.url || '';
          const wallets = useWalletStore.getState().wallets;
          
          // 获取当前要使用的钱包
          let targetWallet: any = null;
          
          // 对于卖出订单，需要特殊处理：只选择有代币的钱包
          if (orderType === 'sell') {
            // 先更新代币余额
            await useWalletStore.getState().updateTokenBalances(currentConfig.tokenAddress);
            
            // 找到所有有代币的钱包
            const walletsWithTokens = wallets.filter(wallet => {
              if (!wallet.isActive) return false;
              
              const tokenBalance = useWalletStore.getState().tokenBalances.find(
                tb => tb.walletAddress === wallet.address && tb.tokenAddress === currentConfig.tokenAddress
              );
              return tokenBalance && tokenBalance.balance > 0;
            });
            
            if (walletsWithTokens.length === 0) {
              throw new Error('没有钱包持有代币，无法执行卖出订单');
            }
            
            // 从有代币的钱包中随机选择一个
            targetWallet = walletsWithTokens[Math.floor(Math.random() * walletsWithTokens.length)];
            
            useLogStore.getState().addLog({
              level: 'info',
              category: 'volume',
              message: `卖出订单选择钱包: ${targetWallet.label || targetWallet.address.slice(0, 8)}, 可选钱包数: ${walletsWithTokens.length}`
            });
          } else if (currentConfig.enableWalletRotation) {
            // 更新可用钱包列表
            get().updateAvailableWallets();
            
            useLogStore.getState().addLog({
              level: 'info',
              category: 'volume',
              message: `钱包轮换已启用，可用钱包数量: ${get().availableWallets.length}`
            });
            
            // 检查是否需要轮换钱包
            if (get().shouldRotateWallet()) {
              useLogStore.getState().addLog({
                level: 'info',
                category: 'volume',
                message: '触发钱包轮换条件，正在轮换钱包'
              });
              get().rotateToNextWallet();
            }
            
            // 使用轮换逻辑获取钱包
            const nextWalletId = get().getNextWallet();
            useLogStore.getState().addLog({
              level: 'info',
              category: 'volume',
              message: `获取下一个钱包ID: ${nextWalletId}`
            });
            
            if (nextWalletId) {
              targetWallet = wallets.find(w => w.id === nextWalletId);
              if (targetWallet) {
                useLogStore.getState().addLog({
                  level: 'info',
                  category: 'volume',
                  message: `使用钱包: ${targetWallet.name}, 余额: ${targetWallet.solBalance.toFixed(4)} SOL`
                });
              }
              // 更新选中的钱包ID
              if (targetWallet && get().selectedWalletId !== nextWalletId) {
                set({ selectedWalletId: nextWalletId });
              }
            }
          } else {
            // 使用手动选择的钱包
            const selectedWalletId = get().selectedWalletId;
            targetWallet = selectedWalletId ? wallets.find(w => w.id === selectedWalletId) : null;
            if (!targetWallet) {
              targetWallet = wallets.find(w => w.isActive);
            }
          }
          
          if (!targetWallet) {
            throw new Error('没有可用的钱包');
          }
          
          if (!currentConfig.tokenAddress) {
            throw new Error('没有设置代币地址');
          }
          
          // 初始化SDK和连接
          const { sdk, connection } = await initializePumpSdk(rpcUrl);
          const keypair = createKeypairFromPrivateKey(targetWallet.privateKey);
          
          // 执行真实交易
          let result: any;
          if (orderType === 'buy') {
            result = await executeBuyTransaction(
              sdk,
              connection,
              keypair,
              currentConfig.tokenAddress,
              amount,
              {
                slippage: currentConfig.slippage,
                priorityFee: currentConfig.priorityFee
              },
              true // 使用缓存
            );
          } else {
            // 对于卖出，需要获取钱包的代币余额
            const walletStore = useWalletStore.getState();
            
            // 先更新代币余额以获取最新数据
            await walletStore.updateTokenBalances(currentConfig.tokenAddress);
            
            const tokenBalanceRecord = walletStore.tokenBalances.find(
              tb => tb.walletAddress === targetWallet.address && tb.tokenAddress === currentConfig.tokenAddress
            );
            const tokenBalance = tokenBalanceRecord?.balance || 0;
            
            if (tokenBalance <= 0) {
              throw new Error(`钱包没有足够的代币余额进行卖出 (余额: ${tokenBalance})`);
            }
            
            // 卖出全部代币数量
            const finalTokenAmount = tokenBalance;
            
            useLogStore.getState().addLog({
              level: 'info',
              category: 'volume',
              message: `卖出全部代币: 代币余额=${tokenBalance.toFixed(6)}, 卖出数量=${finalTokenAmount.toFixed(6)}`
            });
            
            result = await executeSellTransaction(
              sdk,
              connection,
              keypair,
              currentConfig.tokenAddress,
              finalTokenAmount,
              {
                slippage: currentConfig.slippage,
                priorityFee: currentConfig.priorityFee
              },
              true // 使用缓存
            );
          }
          
          if (result.success) {
            // 交易成功
            get().updateOrder(orderId, {
              status: 'completed',
              actualPrice: result.actualPrice || 0,
              txHash: result.signature
            });
            
            // 更新会话统计
            const session = get().currentSession;
            if (session) {
              const updatedSession = {
                ...session,
                totalTrades: session.totalTrades + 1,
                successfulTrades: session.successfulTrades + 1,
                totalVolume: session.totalVolume + amount,
                totalFees: session.totalFees + amount * 0.0025
              };
              set({ currentSession: updatedSession });
            }
            
            // 更新钱包轮换状态
            if (currentConfig.enableWalletRotation) {
              const currentState = get();
              set({
                ordersSinceLastRotation: currentState.ordersSinceLastRotation + 1,
                recentWalletUsage: {
                  ...currentState.recentWalletUsage,
                  [targetWallet.id]: Date.now()
                }
              });
            }
            
            useLogStore.getState().addLog({
              level: 'success',
              category: 'volume',
              message: `${orderType === 'buy' ? '买入' : '卖出'}订单执行成功`,
              details: `订单ID: ${orderId}, 金额: ${amount.toFixed(4)} SOL, 交易签名: ${result.signature}`
            });
          } else {
            // 交易失败
            get().updateOrder(orderId, {
              status: 'failed',
              error: result.error || '交易执行失败'
            });
            
            // 更新会话统计
            const session = get().currentSession;
            if (session) {
              const updatedSession = {
                ...session,
                totalTrades: session.totalTrades + 1,
                failedTrades: session.failedTrades + 1,
                errorCount: session.errorCount + 1
              };
              set({ currentSession: updatedSession });
            }
            
            useLogStore.getState().addLog({
              level: 'error',
              category: 'volume',
              message: `${orderType === 'buy' ? '买入' : '卖出'}订单执行失败`,
              details: `订单ID: ${orderId}, 原因: ${result.error}`
            });
          }
        } catch (error) {
          // 异常处理
          get().updateOrder(orderId, {
            status: 'failed',
            error: error instanceof Error ? error.message : '未知错误'
          });
          
          // 更新会话统计
          const session = get().currentSession;
          if (session) {
            const updatedSession = {
              ...session,
              totalTrades: session.totalTrades + 1,
              failedTrades: session.failedTrades + 1,
              errorCount: session.errorCount + 1
            };
            set({ currentSession: updatedSession });
          }
          
          useLogStore.getState().addLog({
            level: 'error',
            category: 'volume',
            message: `${orderType === 'buy' ? '买入' : '卖出'}订单执行异常`,
            details: `订单ID: ${orderId}, 错误: ${error instanceof Error ? error.message : '未知错误'}`
          });
        }
        
        // 更新统计信息
        get().refreshData();
      }, Math.random() * 3000 + 1000); // 1-4秒执行时间
      
    } catch (error) {
      useLogStore.getState().addLog({
        level: 'error',
        category: 'volume',
        message: '订单执行异常',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  // 调度下一个订单
  scheduleNextOrder: () => {
    const { config, currentSession, executionTimer } = get();
    
    if (!currentSession || currentSession.status !== 'running') {
      return;
    }
    
    // 清理现有定时器
    if (executionTimer) {
      clearTimeout(executionTimer);
    }
    
    // 计算下次执行时间
    const interval = Math.random() * (config.maxInterval - config.minInterval) + config.minInterval;
    const nextTime = new Date(Date.now() + interval * 1000);
    
    // 设置新的定时器
    const timer = setTimeout(() => {
      get().executeOrder();
      get().scheduleNextOrder(); // 递归调度下一个订单
    }, interval * 1000);
    
    set({
      executionTimer: timer,
      nextOrderTime: nextTime
    });
    
    useLogStore.getState().addLog({
      level: 'info',
      category: 'volume',
      message: `下一个订单将在 ${interval.toFixed(1)} 秒后执行`
    });
  },

  // 添加订单
  addOrder: (orderData) => {
    const newOrder: VolumeOrder = {
      ...orderData,
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date()
    };
    
    set(state => ({
      orders: [newOrder, ...state.orders].slice(0, 100) // 只保留最近100个订单
    }));
  },

  // 更新订单
  updateOrder: (orderId, updates) => {
    console.log('更新订单状态:', { orderId, updates });
    set(state => {
      const updatedOrders = state.orders.map(order =>
        order.id === orderId ? { ...order, ...updates } : order
      );
      console.log('订单更新后状态:', updatedOrders.find(o => o.id === orderId));
      return { orders: updatedOrders };
    });
  },

  // 清空订单
  clearOrders: () => {
    set({ orders: [] });
  },

  // 钱包轮换方法实现
  
  // 更新可用钱包列表
  updateAvailableWallets: () => {
    const { config } = get();
    const wallets = useWalletStore.getState().wallets;
    const activeWallets = wallets.filter(w => w.isActive);
    
    // 过滤满足条件的钱包
    const availableWallets = activeWallets.filter(wallet => {
      // 检查余额要求
      if (wallet.solBalance < config.minWalletBalance) {
        return false;
      }
      
      // 如果启用了排除最近使用的钱包
      if (config.excludeRecentWallets) {
        const lastUsedTime = get().recentWalletUsage[wallet.id];
        if (lastUsedTime) {
          const cooldownMs = config.recentWalletCooldown * 60 * 1000;
          const timeSinceLastUse = Date.now() - lastUsedTime;
          if (timeSinceLastUse < cooldownMs) {
            return false;
          }
        }
      }
      
      return true;
    }).map(w => w.id);
    
    set({ availableWallets });
    
    useLogStore.getState().addLog({
      level: 'info',
      category: 'volume',
      message: `更新可用钱包列表: ${availableWallets.length} 个钱包可用`
    });
  },

  // 检查是否应该轮换钱包
  shouldRotateWallet: () => {
    const { config, ordersSinceLastRotation } = get();
    
    if (!config.enableWalletRotation) {
      return false;
    }
    
    return ordersSinceLastRotation >= config.rotationInterval;
  },

  // 获取下一个钱包
  getNextWallet: () => {
    const { config, availableWallets, currentWalletIndex } = get();
    
    useLogStore.getState().addLog({
      level: 'info',
      category: 'volume',
      message: `getNextWallet: 当前可用钱包数量 ${availableWallets.length}, 当前索引 ${currentWalletIndex}`
    });
    
    if (availableWallets.length === 0) {
      useLogStore.getState().addLog({
        level: 'warn',
        category: 'volume',
        message: '可用钱包列表为空，正在重新更新'
      });
      get().updateAvailableWallets();
      const updatedWallets = get().availableWallets;
      if (updatedWallets.length === 0) {
        useLogStore.getState().addLog({
          level: 'error',
          category: 'volume',
          message: '更新后仍然没有可用钱包'
        });
        return null;
      }
    }
    
    let nextWalletId: string;
    
    switch (config.walletRotationMode) {
      case 'sequential':
        // 顺序轮换
        const nextIndex = (currentWalletIndex + 1) % availableWallets.length;
        nextWalletId = availableWallets[nextIndex];
        set({ currentWalletIndex: nextIndex });
        break;
        
      case 'random':
        // 随机选择
        const randomIndex = Math.floor(Math.random() * availableWallets.length);
        nextWalletId = availableWallets[randomIndex];
        set({ currentWalletIndex: randomIndex });
        break;
        
      case 'weighted':
        // 加权选择（基于余额）
        const wallets = useWalletStore.getState().wallets;
        const availableWalletData = availableWallets.map(id => 
          wallets.find(w => w.id === id)
        ).filter(Boolean);
        
        const totalBalance = availableWalletData.reduce((sum, w) => sum + (w.solBalance || 0), 0);
        let random = Math.random() * totalBalance;
        
        for (let i = 0; i < availableWalletData.length; i++) {
          random -= availableWalletData[i].solBalance || 0;
          if (random <= 0) {
            nextWalletId = availableWalletData[i].id;
            set({ currentWalletIndex: i });
            break;
          }
        }
        
        if (!nextWalletId) {
          nextWalletId = availableWallets[0];
          set({ currentWalletIndex: 0 });
        }
        break;
        
      default:
        nextWalletId = availableWallets[currentWalletIndex];
    }
    
    return nextWalletId;
  },

  // 轮换到下一个钱包
  rotateToNextWallet: () => {
    const nextWalletId = get().getNextWallet();
    
    if (nextWalletId) {
      // 更新选中的钱包
      set({ selectedWalletId: nextWalletId });
      
      // 记录使用历史
      set((state) => ({
        recentWalletUsage: {
          ...state.recentWalletUsage,
          [nextWalletId]: Date.now()
        },
        ordersSinceLastRotation: 0
      }));
      
      const wallets = useWalletStore.getState().wallets;
      const wallet = wallets.find(w => w.id === nextWalletId);
      
      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: '钱包轮换',
        details: `切换到钱包: ${wallet?.label || wallet?.address.slice(0, 8) || 'Unknown'}`
      });
    }
  },

  // 重置钱包轮换状态
  resetWalletRotation: () => {
    set({
      currentWalletIndex: 0,
      ordersSinceLastRotation: 0,
      recentWalletUsage: {},
      availableWallets: []
    });
    
    get().updateAvailableWallets();
    
    useLogStore.getState().addLog({
      level: 'info',
      category: 'volume',
      message: '钱包轮换状态已重置'
    });
  }
}));