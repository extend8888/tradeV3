import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TradeConfig, TradeOrder, TradeStats, Token } from '@/types';
import { DEFAULT_TRADE_CONFIG, STORAGE_KEYS, TRADE_LIMITS } from '@/constants';
import { useRPCStore } from './rpcStore';
import { useWalletStore } from './walletStore';
import { useLogStore } from './logStore';
import {
  initializePumpSdk,
  executeBuyTransaction,
  executeSellTransaction,
  executeExternalBuy,
  executeExternalSell
} from '@/utils/pump';
import { createKeypairFromPrivateKey } from '@/utils/solana';

interface TradeState {
  // 状态
  config: TradeConfig;
  orders: TradeOrder[];
  stats: TradeStats;
  selectedToken: Token | null;
  isExecuting: boolean;
  isTrading: boolean;
  executionQueue: string[]; // 订单ID队列
  maxConcurrentTrades: number;
  activeTrades: number;

  // 操作
  updateConfig: (updates: Partial<TradeConfig>) => void;
  setSelectedToken: (token: Token | null) => void;
  createOrder: (walletId: string, type: 'buy' | 'sell', amount: number) => TradeOrder;
  createBatchOrders: (walletIds: string[], type: 'buy' | 'sell', amount: number) => TradeOrder[];
  executeOrder: (orderId: string) => Promise<boolean>;
  executeBatchOrders: (orderIds: string[]) => Promise<boolean[]>;
  cancelOrder: (orderId: string) => void;
  cancelAllOrders: () => void;
  updateOrder: (orderId: string, updates: Partial<TradeOrder>) => void;
  removeOrder: (orderId: string) => void;
  clearCompletedOrders: () => void;
  getOrdersByStatus: (status: TradeOrder['status']) => TradeOrder[];
  getOrdersByWallet: (walletId: string) => TradeOrder[];
  validateConfig: () => string[];
  resetConfig: () => void;
  pauseExecution: () => void;
  resumeExecution: () => void;
  startBatchTrading: () => Promise<void>;
  stopBatchTrading: () => Promise<void>;
  stopAllOrders: () => void;
  clearOrders: () => void;
  calculateStats: (orders: TradeOrder[]) => TradeStats;
}

export const useTradeStore = create<TradeState>()(
  persist(
    (set, get) => ({
      // 初始状态
      config: DEFAULT_TRADE_CONFIG,
      orders: [],
      stats: {
        totalOrders: 0,
        completedOrders: 0,
        failedOrders: 0,
        successRate: 0,
        totalVolume: 0,
        totalProfit: 0,
        averageExecutionTime: 0
      },
      selectedToken: null,
      isExecuting: false,
      isTrading: false,
      executionQueue: [],
      maxConcurrentTrades: 2, // 降低并发数减少失败率
      activeTrades: 0,

      // 更新交易配置
      updateConfig: (updates) => {
        set((state) => ({
          config: { ...state.config, ...updates }
        }));
      },

      // 设置选中的代币
      setSelectedToken: (token) => {
        set({ selectedToken: token });
        if (token) {
          get().updateConfig({ tokenAddress: token.address });
        }
      },

      // 创建订单
      createOrder: (walletId, type, amount) => {
        const { config, selectedToken } = get();
        
        if (!selectedToken) {
          throw new Error('No token selected');
        }

        const newOrder: TradeOrder = {
          id: `order_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          walletId,
          tokenAddress: config.tokenAddress,
          type,
          mode: config.mode,
          amount,
          price: selectedToken.price,
          status: 'pending',
          createdAt: new Date()
        };

        set((state) => {
          const updatedOrders = [...state.orders, newOrder];
          const completedOrders = updatedOrders.filter(o => o.status === 'completed');
          const failedOrders = updatedOrders.filter(o => o.status === 'failed');
          const totalOrders = updatedOrders.length;
          const successRate = totalOrders > 0 ? (completedOrders.length / totalOrders) * 100 : 0;
          
          return {
            orders: updatedOrders,
            stats: {
              totalOrders,
              completedOrders: completedOrders.length,
              failedOrders: failedOrders.length,
              successRate: Math.round(successRate * 100) / 100,
              totalVolume: 0,
              totalProfit: 0,
              averageExecutionTime: 0
            }
          };
        });

        // 记录日志
        useLogStore.getState().addLog({
          level: 'info',
          category: 'trade',
          message: `Created ${type} order for ${amount} ${type === 'buy' ? 'SOL' : 'tokens'}`,
          details: { orderId: newOrder.id, walletId, tokenAddress: config.tokenAddress },
          walletId,
          orderId: newOrder.id
        });

        return newOrder;
      },

      // 批量创建订单
      createBatchOrders: (walletIds, type, amount) => {
        const orders: TradeOrder[] = [];
        
        for (const walletId of walletIds) {
          try {
            const order = get().createOrder(walletId, type, amount);
            orders.push(order);
          } catch (error) {
            console.error(`Failed to create order for wallet ${walletId}:`, error);
            useLogStore.getState().addLog({
              level: 'error',
              category: 'trade',
              message: `Failed to create order for wallet ${walletId}`,
              details: { error: error.message, walletId },
              walletId
            });
          }
        }

        return orders;
      },

      // 执行订单
      executeOrder: async (orderId) => {
        console.log('[DEBUG] executeOrder called with orderId:', orderId);
        const { orders, config, updateOrder } = get();
        const order = orders.find(o => o.id === orderId);

        if (!order) {
          console.error('[DEBUG] Order not found:', orderId);
          return false;
        }
        console.log('[DEBUG] Found order:', order);

        if (order.status !== 'pending') {
          console.error('[DEBUG] Order is not pending, status:', order.status);
          return false;
        }

        // 检查RPC连接
        console.log('[DEBUG] Checking RPC connection...');
        const connection = useRPCStore.getState().getConnection();
        if (!connection) {
          console.error('[DEBUG] No RPC connection available');
          updateOrder(orderId, {
            status: 'failed',
            error: 'No RPC connection available'
          });
          return false;
        }
        console.log('[DEBUG] RPC connection obtained:', connection.rpcEndpoint);

        // 检查钱包
        console.log('[DEBUG] Getting wallet for ID:', order.walletId);
        const wallet = useWalletStore.getState().wallets.find(w => w.id === order.walletId);
        if (!wallet) {
          console.error('[DEBUG] Wallet not found:', order.walletId);
          updateOrder(orderId, {
            status: 'failed',
            error: 'Wallet not found'
          });
          return false;
        }
        console.log('[DEBUG] Wallet found:', wallet.address);
        console.log('[DEBUG] Wallet balance:', wallet.solBalance, 'SOL');
        console.log('[DEBUG] Wallet active status:', wallet.isActive);

        // 检查钱包余额是否足够
        if (order.type === 'buy' && wallet.solBalance < order.amount) {
          console.error('[DEBUG] Insufficient wallet balance:', wallet.solBalance, '<', order.amount);
          updateOrder(orderId, {
            status: 'failed',
            error: `Insufficient balance: ${wallet.solBalance} SOL < ${order.amount} SOL`
          });
          return false;
        }

        // 创建keypair
        console.log('[DEBUG] Creating keypair from private key...');
        const keypair = createKeypairFromPrivateKey(wallet.privateKey);
        if (!keypair) {
          console.error('[DEBUG] Failed to create keypair');
          updateOrder(orderId, {
            status: 'failed',
            error: 'Invalid wallet private key'
          });
          return false;
        }
        console.log('[DEBUG] Keypair created successfully');

        // 验证钱包连接状态
        console.log('[DEBUG] Verifying wallet connection...');
        try {
          const balance = await connection.getBalance(keypair.publicKey);
          const balanceInSOL = balance / 1e9;
          console.log('[DEBUG] Current blockchain balance:', balanceInSOL, 'SOL');
          
          // 如果余额差异过大，更新本地余额
          if (Math.abs(balanceInSOL - wallet.solBalance) > 0.001) {
            console.log('[DEBUG] Balance mismatch detected, updating local balance');
            useWalletStore.getState().updateWallet(wallet.id, { 
              solBalance: balanceInSOL,
              balance: balance 
            });
          }
        } catch (balanceError) {
          console.error('[DEBUG] Failed to verify wallet connection:', balanceError);
          updateOrder(orderId, {
            status: 'failed',
            error: `Wallet connection failed: ${balanceError.message}`
          });
          return false;
        }

        try {
          console.log('[DEBUG] Starting order execution...');
          // 更新订单状态为执行中
          updateOrder(orderId, {
            status: 'executing',
            executedAt: new Date()
          });

          set((state) => ({ activeTrades: state.activeTrades + 1 }));

          // 记录开始执行日志
          useLogStore.getState().addLog({
            level: 'info',
            category: 'trade',
            message: `Executing ${order.type} order`,
            details: { orderId, walletId: order.walletId, amount: order.amount },
            walletId: order.walletId,
            orderId
          });

          let result: any;

          // 初始化SDK
          console.log('[DEBUG] Initializing Pump SDK...');
          const rpcUrl = useRPCStore.getState().currentNode?.url || '';
          console.log('[DEBUG] RPC URL:', rpcUrl);
          const { sdk } = await initializePumpSdk(rpcUrl);
          console.log('[DEBUG] SDK initialized:', sdk);

          // 根据交易模式选择不同的执行函数
          console.log('[DEBUG] Trade mode:', order.mode, 'Type:', order.type);
          
          useLogStore.getState().addLog({
            level: 'info',
            category: 'trade',
            message: 'Starting order execution',
            details: {
              orderId,
              type: order.type,
              mode: order.mode,
              amount: order.amount,
              tokenAddress: order.tokenAddress,
              slippage: config.slippage,
              priorityFee: config.priorityFee
            },
            walletId: order.walletId,
            orderId
          });

          try {
            if (order.mode === 'internal') {
              // 内盘交易
              if (order.type === 'buy') {
                console.log('[DEBUG] Executing buy transaction with params:', {
                  tokenAddress: order.tokenAddress,
                  amount: order.amount,
                  slippage: config.slippage,
                  priorityFee: config.priorityFee
                });
                result = await executeBuyTransaction(
                  sdk,
                  connection,
                  keypair,
                  order.tokenAddress,
                  order.amount,
                  { slippage: config.slippage, priorityFee: config.priorityFee },
                  true // 使用缓存的bonding curve状态
                );
              } else {
                console.log('[DEBUG] Executing sell transaction with params:', {
                  tokenAddress: order.tokenAddress,
                  amount: order.amount,
                  slippage: config.slippage,
                  priorityFee: config.priorityFee
                });
                result = await executeSellTransaction(
                  sdk,
                  connection,
                  keypair,
                  order.tokenAddress,
                  order.amount,
                  { slippage: config.slippage, priorityFee: config.priorityFee },
                  true // 使用缓存的bonding curve状态
                );
              }
            } else {
              // 外盘交易
              if (order.type === 'buy') {
                result = await executeExternalBuy(
                  connection,
                  keypair,
                  order.tokenAddress,
                  order.amount,
                  { slippage: config.slippage, priorityFee: config.priorityFee }
                );
              } else {
                result = await executeExternalSell(
                  connection,
                  keypair,
                  order.tokenAddress,
                  order.amount,
                  { slippage: config.slippage, priorityFee: config.priorityFee }
                );
              }
            }
          } catch (executionError) {
            // 捕获执行过程中的异常
            console.error('[DEBUG] Order execution threw exception:', executionError);
            
            useLogStore.getState().addLog({
              level: 'error',
              category: 'trade',
              message: 'Order execution threw exception',
              details: {
                orderId,
                error: executionError.message,
                stack: executionError.stack,
                type: order.type,
                mode: order.mode,
                tokenAddress: order.tokenAddress
              },
              walletId: order.walletId,
              orderId
            });

            result = {
              success: false,
              error: `交易执行异常: ${executionError.message}`
            };
          }

          // 确保result存在
          if (!result) {
            console.error('[DEBUG] Order execution returned null result');
            
            useLogStore.getState().addLog({
              level: 'error',
              category: 'trade',
              message: 'Order execution returned null result',
              details: {
                orderId,
                type: order.type,
                mode: order.mode,
                tokenAddress: order.tokenAddress
              },
              walletId: order.walletId,
              orderId
            });

            result = {
              success: false,
              error: '交易执行返回空结果'
            };
          }

          if (result?.success) {
            updateOrder(orderId, {
              status: 'completed',
              txHash: result.signature,
              gasUsed: result.gasUsed || 0,
              actualPrice: result.actualPrice || order.price
            });

            useLogStore.getState().addLog({
              level: 'success',
              category: 'trade',
              message: `${order.type} order completed successfully`,
              details: {
                orderId,
                txHash: result.signature,
                gasUsed: result.gasUsed || 0,
                actualPrice: result.actualPrice || order.price,
                actualAmount: result.actualAmount,
                solscan: result.signature ? `https://solscan.io/tx/${result.signature}` : undefined
              },
              walletId: order.walletId,
              orderId
            });

            // 注意：个别余额更新已移除，改为批量执行结束后统一更新以避免率限制
            // await useWalletStore.getState().updateBalance(order.walletId);
            // await useWalletStore.getState().updateTokenBalances(order.tokenAddress);

            return true;
          } else {
            updateOrder(orderId, {
              status: 'failed',
              error: result.error
            });

            useLogStore.getState().addLog({
              level: 'error',
              category: 'trade',
              message: `${order.type} order failed`,
              details: { 
                orderId, 
                error: result.error,
                errorDetails: result.errorDetails || 'No additional details'
              },
              walletId: order.walletId,
              orderId
            });

            return false;
          }
        } catch (error) {
          console.error('[DEBUG] Exception in executeOrder:', error);
          console.error('[DEBUG] Error stack:', error.stack);
          updateOrder(orderId, {
            status: 'failed',
            error: error.message
          });

          useLogStore.getState().addLog({
            level: 'error',
            category: 'trade',
            message: `${order.type} order execution error`,
            details: { 
              orderId, 
              error: error.message,
              stack: error.stack,
              type: order.type,
              mode: order.mode,
              tokenAddress: order.tokenAddress
            },
            walletId: order.walletId,
            orderId
          });

          return false;
        } finally {
          set((state) => ({ activeTrades: Math.max(0, state.activeTrades - 1) }));
        }
      },

      // 优化的批量执行订单
      executeBatchOrders: async (orderIds) => {
        const { maxConcurrentTrades, executeOrder } = get();

        set({
          isExecuting: true,
          executionQueue: orderIds
        });

        try {
          // 优化的并发执行策略 - 降低并发数减少失败率
          const batchSize = Math.min(maxConcurrentTrades, 2); // 限制最大并发数为2
          const results: boolean[] = [];

          // 分批执行，每批并发执行
          for (let i = 0; i < orderIds.length; i += batchSize) {
            const batch = orderIds.slice(i, i + batchSize);

            // 并发执行当前批次
            const batchPromises = batch.map(async (orderId) => {
              try {
                const result = await executeOrder(orderId);

                // 更新执行队列
                set((state) => ({
                  executionQueue: state.executionQueue.filter(id => id !== orderId)
                }));

                return result;
              } catch (error) {
                console.error('[DEBUG] Batch execution error for order:', orderId, error);
                return false;
              }
            });

            // 等待当前批次完成
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            console.log(`[DEBUG] Batch ${Math.floor(i / batchSize) + 1} completed:`, {
              batchSize: batch.length,
              successCount: batchResults.filter(r => r).length,
              failureCount: batchResults.filter(r => !r).length
            });

            // 批次间增加延迟，减少网络压力
            if (i + batchSize < orderIds.length) {
              await new Promise(resolve => setTimeout(resolve, 3000)); // 批次间等待3秒
            }
          }

          // 所有批次都已完成

          // 统计成功和失败的交易
          const successCount = results.filter(r => r === true).length;
          const failCount = results.filter(r => r === false).length;

          useLogStore.getState().addLog({
            level: successCount > 0 ? 'success' : 'error',
            category: 'trade',
            message: `批量执行完成: ${successCount} 成功, ${failCount} 失败`
          });

          // 自动刷新所有钱包余额（使用高效批量方法）
          if (successCount > 0) {
            // 等待交易上链（3秒）后再刷新余额
            console.log('[DEBUG] 等待3秒让交易上链...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            console.log('[DEBUG] 使用批量方法刷新所有钱包余额...');
            try {
              await useWalletStore.getState().updateBatchBalances();
              console.log('[DEBUG] 批量余额刷新完成');
            } catch (error) {
              console.error('[DEBUG] 批量余额刷新失败:', error);
            }
          }

          return results;
        } finally {
          set({
            isExecuting: false,
            executionQueue: []
          });
        }
      },

      // 取消订单
      cancelOrder: (orderId) => {
        const { updateOrder } = get();
        updateOrder(orderId, { status: 'cancelled' });
        
        useLogStore.getState().addLog({
          level: 'info',
          category: 'trade',
          message: 'Order cancelled',
          details: { orderId },
          orderId
        });
      },

      // 取消所有订单
      cancelAllOrders: () => {
        const { orders } = get();
        const pendingOrders = orders.filter(o => o.status === 'pending');
        
        pendingOrders.forEach(order => {
          get().cancelOrder(order.id);
        });
      },

      // 更新订单
      updateOrder: (orderId, updates) => {
        set((state) => {
          const updatedOrders = state.orders.map(order => 
            order.id === orderId 
              ? { ...order, ...updates }
              : order
          );
          
          const completedOrders = updatedOrders.filter(o => o.status === 'completed');
          const failedOrders = updatedOrders.filter(o => o.status === 'failed');
          const totalOrders = updatedOrders.length;
          const successRate = totalOrders > 0 ? (completedOrders.length / totalOrders) * 100 : 0;

          return {
            orders: updatedOrders,
            stats: {
              totalOrders,
              completedOrders: completedOrders.length,
              failedOrders: failedOrders.length,
              successRate: Math.round(successRate * 100) / 100,
              totalVolume: 0,
              totalProfit: 0,
              averageExecutionTime: 0
            }
          };
        });
      },

      // 删除订单
      removeOrder: (orderId) => {
        set((state) => {
          const updatedOrders = state.orders.filter(o => o.id !== orderId);
          const completedOrders = updatedOrders.filter(o => o.status === 'completed');
          const failedOrders = updatedOrders.filter(o => o.status === 'failed');
          const totalOrders = updatedOrders.length;
          const successRate = totalOrders > 0 ? (completedOrders.length / totalOrders) * 100 : 0;

          return {
            orders: updatedOrders,
            stats: {
              totalOrders,
              completedOrders: completedOrders.length,
              failedOrders: failedOrders.length,
              successRate: Math.round(successRate * 100) / 100,
              totalVolume: 0,
              totalProfit: 0,
              averageExecutionTime: 0
            }
          };
        });
      },

      // 清除已完成的订单
      clearCompletedOrders: () => {
        set((state) => {
          const updatedOrders = state.orders.filter(o =>
            o.status !== 'completed' && o.status !== 'failed' && o.status !== 'cancelled'
          );
          const completedOrders = updatedOrders.filter(o => o.status === 'completed');
          const failedOrders = updatedOrders.filter(o => o.status === 'failed');
          const totalOrders = updatedOrders.length;
          const successRate = totalOrders > 0 ? (completedOrders.length / totalOrders) * 100 : 0;

          return {
            orders: updatedOrders,
            stats: {
              totalOrders,
              completedOrders: completedOrders.length,
              failedOrders: failedOrders.length,
              successRate: Math.round(successRate * 100) / 100,
              totalVolume: 0,
              totalProfit: 0,
              averageExecutionTime: 0
            }
          };
        });
      },

      // 清空所有订单
      clearOrders: () => {
        set({
          orders: [],
          stats: {
            totalOrders: 0,
            completedOrders: 0,
            failedOrders: 0,
            successRate: 0,
            totalVolume: 0,
            totalProfit: 0,
            averageExecutionTime: 0
          }
        });
        
        useLogStore.getState().addLog({
          level: 'info',
          category: 'trade',
          message: 'All orders cleared'
        });
      },

      // 按状态获取订单
      getOrdersByStatus: (status) => {
        const { orders } = get();
        return orders.filter(o => o.status === status);
      },

      // 按钱包获取订单
      getOrdersByWallet: (walletId) => {
        const { orders } = get();
        return orders.filter(o => o.walletId === walletId);
      },

      // 验证配置
      validateConfig: () => {
        const { config, selectedToken } = get();
        const errors: string[] = [];

        if (!config.tokenAddress) {
          errors.push('代币地址为必填项');
        }

        if (config.buyAmount < TRADE_LIMITS.MIN_BUY_AMOUNT) {
          errors.push(`买入金额至少为 ${TRADE_LIMITS.MIN_BUY_AMOUNT} SOL`);
        }

        if (config.buyAmount > TRADE_LIMITS.MAX_BUY_AMOUNT) {
          errors.push(`买入金额不能超过 ${TRADE_LIMITS.MAX_BUY_AMOUNT} SOL`);
        }

        if (config.slippage < TRADE_LIMITS.MIN_SLIPPAGE) {
          errors.push(`滑点至少为 ${TRADE_LIMITS.MIN_SLIPPAGE}%`);
        }

        if (config.slippage > TRADE_LIMITS.MAX_SLIPPAGE) {
          errors.push(`滑点不能超过 ${TRADE_LIMITS.MAX_SLIPPAGE}%`);
        }

        return errors;
      },

      // 重置配置
      resetConfig: () => {
        set({ config: DEFAULT_TRADE_CONFIG });
      },

      // 暂停执行
      pauseExecution: () => {
        set({ isExecuting: false });
      },

      // 恢复执行
      resumeExecution: () => {
        const { executionQueue } = get();
        if (executionQueue.length > 0) {
          get().executeBatchOrders(executionQueue);
        }
      },

      // 开始批量交易
      startBatchTrading: async () => {
        const { orders } = get();
        const pendingOrders = orders.filter(o => o.status === 'pending');
        
        if (pendingOrders.length === 0) {
          return;
        }

        set({ isTrading: true });
        
        try {
          await get().executeBatchOrders(pendingOrders.map(o => o.id));
        } catch (error) {
          console.error('Batch trading failed:', error);
        } finally {
          set({ isTrading: false });
        }
      },

      // 停止批量交易
      stopBatchTrading: async () => {
        set({ isTrading: false, isExecuting: false });
      },

      // 停止所有订单
      stopAllOrders: () => {
        set((state) => ({
          orders: state.orders.map(order => 
            order.status === 'pending' || order.status === 'executing'
              ? { ...order, status: 'cancelled' as const }
              : order
          ),
          isTrading: false,
          isExecuting: false,
          executionQueue: []
        }));
      },



      // 计算统计信息（辅助函数）
      calculateStats: (orders: TradeOrder[]): TradeStats => {
        const completedOrders = orders.filter(o => o.status === 'completed');
        const failedOrders = orders.filter(o => o.status === 'failed');
        const totalOrders = orders.length;
        const successRate = totalOrders > 0 ? (completedOrders.length / totalOrders) * 100 : 0;
        
        const totalVolume = completedOrders.reduce((sum, order) => {
          return sum + (order.amount * (order.actualPrice || order.price));
        }, 0);

        const totalProfit = completedOrders.reduce((sum, order) => {
          // 简化的利润计算，实际需要考虑买入卖出价差
          const profit = order.type === 'sell' 
            ? (order.actualPrice || order.price) - order.price
            : 0;
          return sum + profit * order.amount;
        }, 0);

        const executionTimes = completedOrders
          .filter(o => o.executedAt && o.createdAt)
          .map(o => o.executedAt!.getTime() - o.createdAt.getTime());
        
        const averageExecutionTime = executionTimes.length > 0
          ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
          : 0;

        return {
          totalOrders,
          completedOrders: completedOrders.length,
          failedOrders: failedOrders.length,
          successRate: Math.round(successRate * 100) / 100,
          totalVolume: Math.round(totalVolume * 1000000) / 1000000,
          totalProfit: Math.round(totalProfit * 1000000) / 1000000,
          averageExecutionTime: Math.round(averageExecutionTime)
        };
      }
    }),
    {
      name: STORAGE_KEYS.TRADE_CONFIG || 'trade-config',
      partialize: (state) => ({
        config: state.config,
        selectedToken: state.selectedToken
      })
    }
  )
);

export type TradeStore = typeof useTradeStore;