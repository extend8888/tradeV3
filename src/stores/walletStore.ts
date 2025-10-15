import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, WalletStats, TokenBalance, BatchOperation } from '@/types';
import { STORAGE_KEYS, WALLET_LIMITS, REFRESH_INTERVALS } from '@/constants';
import { useRPCStore } from './rpcStore';
import { createKeypairFromPrivateKey } from '@/utils/solana';

interface WalletState {
  // 状态
  wallets: Wallet[];
  selectedWalletIds: string[];
  stats: WalletStats;
  totalBalance: number;
  tokenBalances: TokenBalance[];
  isUpdatingBalances: boolean;
  lastBalanceUpdate: Date | null;
  batchOperations: BatchOperation[];
  searchQuery: string;
  sortField: keyof Wallet;
  sortDirection: 'asc' | 'desc';
  filterActive: boolean | null;
  balanceInterval: NodeJS.Timeout | null;

  // 操作
  importWallet: (privateKey: string, label?: string) => Promise<boolean>;
  importWallets: (privateKeys: string[], labels?: string[]) => Promise<BatchOperation>;
  generateWallet: (label?: string) => Wallet;
  removeWallet: (walletId: string) => void;
  removeWallets: (walletIds: string[]) => void;
  updateWallet: (walletId: string, updates: Partial<Wallet>) => void;
  toggleWalletActive: (walletId: string) => void;
  selectWallet: (walletId: string, selected: boolean) => void;
  selectAllWallets: (selected: boolean) => void;
  updateBalance: (walletId: string) => Promise<boolean>;
  updateAllBalances: () => Promise<void>;
  updateTokenBalances: (tokenAddress: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setSortConfig: (field: keyof Wallet, direction: 'asc' | 'desc') => void;
  setFilterActive: (active: boolean | null) => void;
  getFilteredWallets: () => Wallet[];
  exportWallets: (walletIds?: string[]) => string;
  clearAll: () => void;
  startBalanceMonitoring: () => void;
  stopBalanceMonitoring: () => void;
  calculateStats: (wallets: Wallet[]) => WalletStats;
  updateBatchBalances: () => Promise<void>;
  setTestBalance: (walletId: string, solAmount: number) => boolean;
  setAllTestBalances: (solAmount?: number) => boolean;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      // 初始状态
      wallets: [],
      selectedWalletIds: [],
      stats: {
        totalWallets: 0,
        activeWallets: 0,
        totalBalance: 0,
        totalSolBalance: 0,
        averageBalance: 0,
        balanceInterval: null
      },
      totalBalance: 0,
      tokenBalances: [],
      isUpdatingBalances: false,
      lastBalanceUpdate: null,
      batchOperations: [],
      searchQuery: '',
      sortField: 'createdAt',
      sortDirection: 'desc',
      filterActive: null,
      balanceInterval: null,

      // 导入单个钱包
      importWallet: async (privateKey, label) => {
        try {
          // 使用工具函数创建 Keypair
          const keypair = createKeypairFromPrivateKey(privateKey.trim());
          
          if (!keypair) {
            throw new Error('无效的私钥格式');
          }
          
          const address = keypair.publicKey.toBase58();
          
          // 检查是否已存在
          const { wallets } = get();
          if (wallets.some(w => w.address === address)) {
            console.error('Wallet already exists:', address);
            return false;
          }

          // 检查钱包数量限制
          if (wallets.length >= WALLET_LIMITS.MAX_WALLETS) {
            console.error('Maximum wallet limit reached');
            return false;
          }

          const newWallet: Wallet = {
            id: `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            address,
            privateKey,
            balance: 0,
            solBalance: 0,
            isActive: true,
            label: label || `Wallet ${wallets.length + 1}`,
            createdAt: new Date(),
            lastUpdated: new Date()
          };

          set((state) => {
            const updatedWallets = [...state.wallets, newWallet];
            const totalWallets = updatedWallets.length;
            const totalBalance = updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0);
            
            return {
              wallets: updatedWallets,
              totalBalance,
              stats: {
                totalWallets,
                activeWallets: updatedWallets.filter(w => w.isActive).length,
                totalBalance,
                totalSolBalance: updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0),
                averageBalance: totalWallets > 0 ? totalBalance / totalWallets : 0,
                balanceInterval: get().balanceInterval
              }
            };
          });

          // 异步更新余额
          get().updateBalance(newWallet.id);

          return true;
        } catch (error) {
          console.error('Failed to import wallet:', error);
          return false;
        }
      },

      // 批量导入钱包
      importWallets: async (privateKeys, labels) => {
        const batchId = `batch_${Date.now()}`;
        const batchOperation: BatchOperation = {
          id: batchId,
          type: 'import_wallets',
          status: 'running',
          progress: 0,
          total: privateKeys.length,
          completed: 0,
          failed: 0,
          startedAt: new Date(),
          errors: []
        };

        // 添加批量操作记录
        set((state) => ({
          batchOperations: [...state.batchOperations, batchOperation]
        }));

        let completed = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < privateKeys.length; i++) {
          try {
            const success = await get().importWallet(
              privateKeys[i], 
              labels?.[i] || `Imported Wallet ${i + 1}`
            );
            
            if (success) {
              completed++;
            } else {
              failed++;
              errors.push(`导入钱包 ${i + 1} 失败`);
            }
          } catch (error) {
            failed++;
            errors.push(`导入钱包 ${i + 1} 时出错: ${error}`);
          }

          // 更新进度
          const progress = Math.round(((completed + failed) / privateKeys.length) * 100);
          set((state) => ({
            batchOperations: state.batchOperations.map(op => 
              op.id === batchId 
                ? { ...op, progress, completed, failed, errors }
                : op
            )
          }));
        }

        // 完成批量操作
        set((state) => ({
          batchOperations: state.batchOperations.map(op => 
            op.id === batchId 
              ? { 
                  ...op, 
                  status: 'completed', 
                  progress: 100, 
                  completed, 
                  failed, 
                  errors,
                  completedAt: new Date()
                }
              : op
          )
        }));

        return batchOperation;
      },

      // 生成新钱包
      generateWallet: (label) => {
        const keypair = Keypair.generate();
        const privateKey = Array.from(keypair.secretKey).join(',');
        const address = keypair.publicKey.toBase58();
        
        const { wallets } = get();
        const newWallet: Wallet = {
          id: `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          address,
          privateKey,
          balance: 0,
          solBalance: 0,
          isActive: true,
          label: label || `Generated Wallet ${wallets.length + 1}`,
          createdAt: new Date(),
          lastUpdated: new Date()
        };

        set((state) => {
          const updatedWallets = [...state.wallets, newWallet];
          const totalWallets = updatedWallets.length;
          const connectedWallets = updatedWallets.filter(w => w.balance !== undefined).length;
          const totalBalance = updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0);
          const avgBalance = totalWallets > 0 ? totalBalance / totalWallets : 0;
          
          return {
            wallets: updatedWallets,
            totalBalance,
            stats: {
              totalWallets,
              activeWallets: updatedWallets.filter(w => w.isActive).length,
              totalBalance,
              totalSolBalance: updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0),
              averageBalance: totalWallets > 0 ? totalBalance / totalWallets : 0,
              balanceInterval: get().balanceInterval
            }
          };
        });

        return newWallet;
      },

      // 删除钱包
      removeWallet: (walletId) => {
        set((state) => {
          const updatedWallets = state.wallets.filter(w => w.id !== walletId);
          const updatedSelectedIds = state.selectedWalletIds.filter(id => id !== walletId);
          const updatedTokenBalances = state.tokenBalances.filter(tb => 
            updatedWallets.some(w => w.address === tb.walletAddress)
          );

          const totalWallets = updatedWallets.length;
          const connectedWallets = updatedWallets.filter(w => w.balance !== undefined).length;
          const totalBalance = updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0);
          const avgBalance = totalWallets > 0 ? totalBalance / totalWallets : 0;
          
          return {
            wallets: updatedWallets,
            selectedWalletIds: updatedSelectedIds,
            tokenBalances: updatedTokenBalances,
            totalBalance,
            stats: {
               totalWallets,
               activeWallets: updatedWallets.filter(w => w.isActive).length,
               totalBalance,
               totalSolBalance: updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0),
               averageBalance: totalWallets > 0 ? totalBalance / totalWallets : 0,
               balanceInterval: get().balanceInterval
             }
          };
        });
      },

      // 批量删除钱包
      removeWallets: (walletIds) => {
        set((state) => {
          const updatedWallets = state.wallets.filter(w => !walletIds.includes(w.id));
          const updatedSelectedIds = state.selectedWalletIds.filter(id => !walletIds.includes(id));
          const updatedTokenBalances = state.tokenBalances.filter(tb => 
            updatedWallets.some(w => w.address === tb.walletAddress)
          );

          const totalWallets = updatedWallets.length;
          const connectedWallets = updatedWallets.filter(w => w.balance !== undefined).length;
          const totalBalance = updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0);
          const avgBalance = totalWallets > 0 ? totalBalance / totalWallets : 0;
          
          return {
            wallets: updatedWallets,
            selectedWalletIds: updatedSelectedIds,
            tokenBalances: updatedTokenBalances,
            totalBalance,
            stats: {
               totalWallets,
               activeWallets: updatedWallets.filter(w => w.isActive).length,
               totalBalance,
               totalSolBalance: updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0),
               averageBalance: totalWallets > 0 ? totalBalance / totalWallets : 0,
               balanceInterval: get().balanceInterval
             }
          };
        });
      },

      // 更新钱包信息
      updateWallet: (walletId, updates) => {
        set((state) => {
          const updatedWallets = state.wallets.map(wallet => 
            wallet.id === walletId 
              ? { ...wallet, ...updates, lastUpdated: new Date() }
              : wallet
          );

          const totalWallets = updatedWallets.length;
          const connectedWallets = updatedWallets.filter(w => w.balance !== undefined).length;
          const totalBalance = updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0);
          const avgBalance = totalWallets > 0 ? totalBalance / totalWallets : 0;
          
          return {
            wallets: updatedWallets,
            totalBalance,
            stats: {
              totalWallets,
              activeWallets: updatedWallets.filter(w => w.isActive).length,
              totalBalance,
              totalSolBalance: updatedWallets.reduce((sum, w) => sum + (w.solBalance || 0), 0),
              averageBalance: totalWallets > 0 ? totalBalance / totalWallets : 0,
              balanceInterval: get().balanceInterval
            }
          };
        });
      },

      // 切换钱包激活状态
      toggleWalletActive: (walletId) => {
        const { wallets, updateWallet } = get();
        const wallet = wallets.find(w => w.id === walletId);
        if (wallet) {
          updateWallet(walletId, { isActive: !wallet.isActive });
        }
      },

      // 选择钱包
      selectWallet: (walletId, selected) => {
        set((state) => {
          const updatedSelectedIds = selected
            ? [...state.selectedWalletIds, walletId]
            : state.selectedWalletIds.filter(id => id !== walletId);

          return { selectedWalletIds: updatedSelectedIds };
        });
      },

      // 全选/取消全选
      selectAllWallets: (selected) => {
        const { wallets } = get();
        set({
          selectedWalletIds: selected ? wallets.map(w => w.id) : []
        });
      },

      // 更新单个钱包余额
      updateBalance: async (walletId) => {
        const { wallets, updateWallet } = get();
        const wallet = wallets.find(w => w.id === walletId);
        
        if (!wallet) {
          console.error('[DEBUG] Wallet not found for balance update:', walletId);
          return false;
        }

        try {
          console.log('[DEBUG] Updating balance for wallet:', wallet.address);
          
          const connection = useRPCStore.getState().getConnection();
          if (!connection) {
            console.error('[DEBUG] No RPC connection available');
            return false;
          }

          const publicKey = new PublicKey(wallet.address);
          const balance = await connection.getBalance(publicKey);
          const solBalance = balance / 1e9; // 转换为 SOL

          console.log('[DEBUG] Retrieved balance:', solBalance, 'SOL for wallet:', wallet.address);

          // 更新钱包余额
          updateWallet(walletId, { 
            solBalance,
            lastUpdated: new Date()
          });

          console.log('[DEBUG] Wallet balance updated successfully');

          return true;
        } catch (error) {
          console.error('[DEBUG] Failed to update balance for wallet', walletId, ':', error);
          console.error('[DEBUG] Error details:', error.message);
          return false;
        }
      },

      // 开发环境：设置测试余额
      setTestBalance: (walletId: string, solAmount: number) => {
        const { updateWallet } = get();
        
        // 只在开发环境下允许设置测试余额
        if (process.env.NODE_ENV === 'development') {
          updateWallet(walletId, { 
            solBalance: solAmount,
            lastUpdated: new Date()
          });
          
          console.log(`[DEV] 设置测试余额: ${solAmount} SOL for wallet ${walletId}`);
          return true;
        }
        
        console.warn('[DEV] 测试余额功能仅在开发环境下可用');
        return false;
      },

      // 开发环境：为所有钱包设置测试余额
      setAllTestBalances: (solAmount: number = 1.0) => {
        const { wallets } = get();
        
        if (process.env.NODE_ENV === 'development') {
          wallets.forEach(wallet => {
            get().setTestBalance(wallet.id, solAmount);
          });
          
          console.log(`[DEV] 为所有 ${wallets.length} 个钱包设置测试余额: ${solAmount} SOL`);
          return true;
        }
        
        console.warn('[DEV] 测试余额功能仅在开发环境下可用');
        return false;
      },

      // 更新所有钱包余额
      updateAllBalances: async () => {
        const { wallets, updateBalance } = get();
        
        set({ isUpdatingBalances: true });

        try {
          // 并发更新所有钱包余额
          const updatePromises = wallets.map(wallet => 
            updateBalance(wallet.id).catch(() => false)
          );

          await Promise.all(updatePromises);

          set({ 
            lastBalanceUpdate: new Date(),
            isUpdatingBalances: false 
          });
        } catch (error) {
          console.error('Failed to update all balances:', error);
          set({ isUpdatingBalances: false });
        }
      },

      // 更新代币余额（修复版本）
      updateTokenBalances: async (tokenAddress) => {
        const { wallets } = get();
        const connection = useRPCStore.getState().getConnection();

        if (!connection || !tokenAddress) return;

        try {
          const tokenBalances: TokenBalance[] = [];
          const tokenMint = new PublicKey(tokenAddress);

          console.log('[DEBUG] 刷新代币余额:', tokenAddress);

          // 为每个钱包单独获取代币余额（使用更高效的方法）
          const walletPromises = wallets.map(async (wallet) => {
            try {
              const walletPubkey = new PublicKey(wallet.address);
              
              // 使用getParsedTokenAccountsByOwner获取解析后的代币账户信息
              const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                walletPubkey,
                {
                  mint: tokenMint
                }
              );

              let totalBalance = 0;

              // 直接从解析后的数据中获取余额
              if (tokenAccounts.value.length > 0) {
                totalBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
              }

              console.log(`[DEBUG] 钱包 ${wallet.address.slice(0, 8)}... 代币余额: ${totalBalance}`);

              return {
                tokenAddress,
                walletAddress: wallet.address,
                balance: totalBalance,
                usdValue: 0,
                lastUpdated: new Date()
              };

            } catch (error) {
              console.error(`获取钱包 ${wallet.address} 代币余额失败:`, error);
              // 即使失败也要添加0余额记录
              return {
                tokenAddress,
                walletAddress: wallet.address,
                balance: 0,
                usdValue: 0,
                lastUpdated: new Date()
              };
            }
          });

          // 等待所有钱包的余额查询完成
          const results = await Promise.all(walletPromises);
          tokenBalances.push(...results);

          // 统计有余额的钱包数
          const walletsWithBalance = tokenBalances.filter(tb => tb.balance > 0).length;

          set((state) => {
            // 移除旧的代币余额记录
            const filteredBalances = state.tokenBalances.filter(
              tb => tb.tokenAddress !== tokenAddress
            );

            console.log(`[DEBUG] 更新代币余额完成，共 ${tokenBalances.length} 个钱包，其中 ${walletsWithBalance} 个有余额`);

            return {
              tokenBalances: [...filteredBalances, ...tokenBalances]
            };
          });
        } catch (error) {
          console.error('Failed to update token balances:', error);
        }
      },

      // 设置搜索查询
      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      // 设置排序配置
      setSortConfig: (field, direction) => {
        set({ sortField: field, sortDirection: direction });
      },

      // 设置活跃状态过滤
      setFilterActive: (active) => {
        set({ filterActive: active });
      },

      // 获取过滤后的钱包列表
      getFilteredWallets: () => {
        const { wallets, searchQuery, sortField, sortDirection, filterActive } = get();
        
        let filtered = [...wallets];

        // 搜索过滤
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(wallet => 
            wallet.address.toLowerCase().includes(query) ||
            wallet.label?.toLowerCase().includes(query)
          );
        }

        // 活跃状态过滤
        if (filterActive !== null) {
          filtered = filtered.filter(wallet => wallet.isActive === filterActive);
        }

        // 排序
        filtered.sort((a, b) => {
          const aValue = a[sortField];
          const bValue = b[sortField];
          
          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        });

        return filtered;
      },

      // 导出钱包
      exportWallets: (walletIds) => {
        const { wallets } = get();
        const walletsToExport = walletIds 
          ? wallets.filter(w => walletIds.includes(w.id))
          : wallets;

        const exportData = walletsToExport.map(wallet => ({
          address: wallet.address,
          privateKey: wallet.privateKey,
          label: wallet.label,
          balance: wallet.solBalance,
          isActive: wallet.isActive,
          createdAt: wallet.createdAt
        }));

        return JSON.stringify(exportData, null, 2);
      },

      // 清空所有钱包
      clearAll: () => {
        set({
          wallets: [],
          selectedWalletIds: [],
          tokenBalances: [],
          stats: {
            totalWallets: 0,
            activeWallets: 0,
            totalBalance: 0,
            totalSolBalance: 0,
            averageBalance: 0,
            balanceInterval: null
          }
        });
      },

      // 开始余额监控
      startBalanceMonitoring: () => {
        const state = get();
        if (state.balanceInterval) return;
        
        const interval = setInterval(() => {
          const currentState = get();
          if (!currentState.isUpdatingBalances && currentState.wallets.length > 0) {
            currentState.updateAllBalances();
          }
        }, REFRESH_INTERVALS.BALANCE_UPDATE);
        
        set({ balanceInterval: interval });
      },

      // 停止余额监控
      stopBalanceMonitoring: () => {
        const state = get();
        if (state.balanceInterval) {
          clearInterval(state.balanceInterval);
          set({ balanceInterval: null });
        }
      },

      // 批量更新余额（高效方法，带重试逻辑）
      updateBatchBalances: async () => {
        const { wallets } = get();
        const connection = useRPCStore.getState().getConnection();

        if (!connection || wallets.length === 0) return;

        // 重试配置
        const maxRetries = 3;
        const baseDelay = 500; // 500ms

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[DEBUG] 批量更新余额（尝试 ${attempt}/${maxRetries}），钱包数量:`, wallets.length);

            // 准备所有钱包地址
            const walletAddresses = wallets.map(wallet => new PublicKey(wallet.address));

            // 使用 getMultipleAccountsInfo 一次性获取所有账户信息
            const accounts = await connection.getMultipleAccountsInfo(walletAddresses);

            console.log('[DEBUG] 获取到账户信息:', accounts.length);

            // 更新余额
            const updatedWallets = wallets.map((wallet, index) => {
              const account = accounts[index];
              const solBalance = account ? account.lamports / 1e9 : 0;

              return {
                ...wallet,
                solBalance,
                lastUpdated: new Date()
              };
            });

            set({ wallets: updatedWallets });
            console.log('[DEBUG] 批量余额更新完成');
            return; // 成功则退出重试循环

          } catch (error: any) {
            console.error(`[DEBUG] 批量余额更新失败（尝试 ${attempt}/${maxRetries}）:`, error);

            // 检查是否是429错误（太多请求）
            const is429Error = error?.message?.includes('429') ||
                              error?.code === 429 ||
                              error?.response?.status === 429;

            // 如果是最后一次尝试，或者不是429错误，则抛出错误
            if (attempt === maxRetries || !is429Error) {
              throw error;
            }

            // 计算指数退避延迟
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`[DEBUG] 等待 ${delay}ms 后重试...`);

            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      },

      // 计算统计信息
      calculateStats: (wallets: Wallet[]) => {
        const totalWallets = wallets.length;
        const activeWallets = wallets.filter(w => w.isActive).length;
        const totalBalance = wallets.reduce((sum, w) => sum + (w.solBalance || 0), 0);
        const totalSolBalance = wallets.reduce((sum, w) => sum + (w.solBalance || 0), 0);
        const averageBalance = totalWallets > 0 ? totalBalance / totalWallets : 0;
        
        return {
          totalWallets,
          activeWallets,
          totalBalance,
          totalSolBalance,
          averageBalance,
          balanceInterval: get().balanceInterval
        };
      }
    }),
    {
      name: STORAGE_KEYS.WALLETS,
      partialize: (state) => ({
        wallets: state.wallets,
        searchQuery: state.searchQuery,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
        filterActive: state.filterActive
      })
    }
  )
);

// 自动余额更新
let balanceUpdateInterval: NodeJS.Timeout | null = null;

export const startBalanceUpdates = () => {
  if (balanceUpdateInterval) return;
  
  balanceUpdateInterval = setInterval(() => {
    const store = useWalletStore.getState();
    if (!store.isUpdatingBalances && store.wallets.length > 0) {
      store.updateAllBalances();
    }
  }, REFRESH_INTERVALS.BALANCE_UPDATE);
};

export const stopBalanceUpdates = () => {
  if (balanceUpdateInterval) {
    clearInterval(balanceUpdateInterval);
    balanceUpdateInterval = null;
  }
};

// 导出store类型
export type WalletStore = typeof useWalletStore;