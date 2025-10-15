import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, TrendingUp, TrendingDown, AlertCircle, Wallet, DollarSign, Activity, RefreshCw, Play, Pause, Settings, CheckCircle, XCircle, Percent, Hash, Shuffle, ExternalLink, AlertTriangle } from 'lucide-react';
import { useTradeStore } from '@/stores/tradeStore';
import { useWalletStore } from '@/stores/walletStore';
import { useLogStore } from '@/stores/logStore';
import { useRPCStore } from '@/stores/rpcStore';
import { formatNumber, cn } from '@/utils';
import { clearBondingCurveCache, prefetchBlockhash, getTokenPrice, initializePumpSdk } from '@/utils/pump';
import { validateTokenAddress } from '@/utils/solana';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const Trading: React.FC = () => {
  // Trading component with RPC auto-initialization
  const {
    config,
    orders,
    selectedToken,
    isExecuting,
    setSelectedToken,
    updateConfig,
    createOrder,
    createBatchOrders,
    executeOrder,
    executeBatchOrders,

    stopAllOrders,
    clearOrders
  } = useTradeStore();

  const { wallets, updateAllBalances } = useWalletStore();
  const { addLog } = useLogStore();
  const { connection, setCurrentNode, nodes, currentNode } = useRPCStore();

  // 本地状态 - 从 localStorage 加载代币地址
  const [tokenAddress, setTokenAddress] = useState(() => {
    return localStorage.getItem('socrates-trader_token_address') || '';
  });
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([]);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  
  // 买入订单配置
  const [buyConfig, setBuyConfig] = useState({
    amountType: 'fixed' as 'fixed' | 'range' | 'percentage',
    amount: { min: 0.01, max: 0.1, value: 0.01 },
    percentage: { min: 10, max: 100, value: 50 },
    tradeInterval: 0,
    slippage: 50,
    priorityFee: 0.00001
  });

  // 卖出订单配置
  const [sellConfig, setSellConfig] = useState({
    amountType: 'fixed' as 'fixed' | 'range' | 'percentage',
    amount: { min: 0.01, max: 0.1, value: 0.01 },
    percentage: { min: 10, max: 100, value: 50 },
    tradeInterval: 0,
    slippage: 50,
    priorityFee: 0.00001
  });
  const [tokenBalances, setTokenBalances] = useState<Map<string, number>>(new Map());
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [walletFilter, setWalletFilter] = useState<'all' | 'with-tokens' | 'without-tokens'>('all');

  // 代币价格状态
  const [tokenPrice, setTokenPrice] = useState<number>(0);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const loadingPriceRef = useRef(false);
  const loadingBalancesRef = useRef(false);
  const lastTokenAddressRef = useRef<string>('');

  // 代币地址验证状态
  const [tokenAddressValidation, setTokenAddressValidation] = useState<{
    isValid: boolean;
    error?: string;
  }>({ isValid: false });

  // 初始化RPC连接
  useEffect(() => {
    // 如果没有连接，自动连接到第一个可用节点
    if (!connection && nodes.length > 0) {
      const firstNode = currentNode || nodes[0];
      console.log('[DEBUG] Initializing RPC connection to:', firstNode.url);
      setCurrentNode(firstNode.id).then(success => {
        if (success) {
          addLog({
            level: 'success',
            category: 'rpc',
            message: `已连接到RPC节点: ${firstNode.name}`
          });
        } else {
          addLog({
            level: 'error',
            category: 'rpc',
            message: `无法连接到RPC节点: ${firstNode.name}`
          });
        }
      });
    }
  }, [connection, nodes, currentNode, setCurrentNode, addLog]);

  // 保存代币地址到 localStorage
  useEffect(() => {
    if (tokenAddress) {
      localStorage.setItem('socrates-trader_token_address', tokenAddress);
    }
  }, [tokenAddress]);

  // 过滤和排序钱包
  const filteredWallets = wallets.filter(w => {
    const matchesSearch = !searchFilter ||
      w.address.toLowerCase().includes(searchFilter.toLowerCase()) ||
      w.label?.toLowerCase().includes(searchFilter.toLowerCase());

    const tokenBalance = tokenBalances.get(w.id) || 0;
    const matchesFilter = walletFilter === 'all' ||
      (walletFilter === 'with-tokens' && tokenBalance > 0) ||
      (walletFilter === 'without-tokens' && tokenBalance === 0);

    return matchesSearch && matchesFilter;
  });

  // 批量获取代币余额（优化版：只查询用户钱包）
  const fetchTokenBalances = useCallback(async (forceRefresh = false) => {
    console.log('[DEBUG] fetchTokenBalances 被调用');
    console.log('[DEBUG] 参数 - forceRefresh:', forceRefresh);
    console.log('[DEBUG] 参数 - tokenAddress:', tokenAddress);
    console.log('[DEBUG] 参数 - connection:', !!connection);
    console.log('[DEBUG] 参数 - wallets.length:', wallets.length);
    
    if (!tokenAddress || !connection || wallets.length === 0) {
      console.log('[DEBUG] fetchTokenBalances 提前返回 - 缺少必要参数');
      return;
    }

    // 防止重复调用，但允许强制刷新
    if (loadingBalancesRef.current) {
      console.log('[DEBUG] fetchTokenBalances 提前返回 - 正在加载中');
      return;
    }

    // 只有在非强制刷新且地址相同时才跳过
    if (!forceRefresh && lastTokenAddressRef.current === tokenAddress) {
      console.log('[DEBUG] fetchTokenBalances 提前返回 - 地址未变化且非强制刷新');
      return;
    }

    console.log('[DEBUG] fetchTokenBalances 开始执行');
    loadingBalancesRef.current = true;
    lastTokenAddressRef.current = tokenAddress;
    setLoadingBalances(true);
    try {
      const mint = new PublicKey(tokenAddress);
      const balances = new Map<string, number>();
      console.log('[DEBUG] 开始查询钱包代币余额，钱包数量:', wallets.length);

      // 为每个钱包查询代币账户
      const walletPromises = wallets.map(async (wallet) => {
        try {
          const walletPubkey = new PublicKey(wallet.address);

          // 获取该钱包的所有代币账户
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            walletPubkey,
            {
              mint: mint
            }
          );

          // 如果找到代币账户，获取余额
          if (tokenAccounts.value.length > 0) {
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
            balances.set(wallet.id, balance);
            return { walletId: wallet.id, balance };
          } else {
            balances.set(wallet.id, 0);
            return { walletId: wallet.id, balance: 0 };
          }
        } catch (error) {
          console.warn(`Failed to fetch balance for wallet ${wallet.address}:`, error);
          balances.set(wallet.id, 0);
          return { walletId: wallet.id, balance: 0 };
        }
      });

      // 等待所有查询完成
      const results = await Promise.all(walletPromises);

      // 统计有余额的钱包数
      const walletsWithBalance = results.filter(r => r.balance > 0).length;

      console.log('[DEBUG] 准备更新代币余额状态');
      console.log('[DEBUG] 新的余额数据:', Array.from(balances.entries()));
      setTokenBalances(balances);
      console.log('[DEBUG] 代币余额状态已更新');

      // 使用console.log代替addLog避免依赖循环
      console.log(`[余额更新] 获取到 ${walletsWithBalance} 个钱包的代币余额（共 ${wallets.length} 个钱包）`);
    } catch (error) {
      console.error('Failed to fetch token balances:', error);
      // 使用console.error代替addLog避免依赖循环
      console.error('[余额更新] 获取代币余额失败:', error.message);
    } finally {
      setLoadingBalances(false);
      loadingBalancesRef.current = false;
    }
  }, [tokenAddress, wallets, connection]);

  // 代币地址变化时获取余额
  useEffect(() => {
    if (tokenAddress && (tokenAddress.length === 43 || tokenAddress.length === 44)) {
      fetchTokenBalances();
      setSelectedToken({
        address: tokenAddress,
        symbol: '',
        name: '',
        decimals: 9,
        price: 0,
        marketCap: 0,
        volume24h: 0,
        priceChange24h: 0,
        liquidity: 0,
        holders: 0,
        isVerified: false,
        createdAt: new Date()
      });
    }
  }, [tokenAddress]);

  // 选择钱包快捷操作
  const selectWalletsWithTokens = () => {
    const walletsWithTokens = filteredWallets.filter(w => (tokenBalances.get(w.id) || 0) > 0);
    setSelectedWalletIds(walletsWithTokens.map(w => w.id));
  };

  const selectWalletsWithoutTokens = () => {
    const walletsWithoutTokens = filteredWallets.filter(w => (tokenBalances.get(w.id) || 0) === 0);
    setSelectedWalletIds(walletsWithoutTokens.map(w => w.id));
  };

  const toggleWalletSelection = (walletId: string) => {
    setSelectedWalletIds(prev =>
      prev.includes(walletId)
        ? prev.filter(id => id !== walletId)
        : [...prev, walletId]
    );
  };

  // 全选/取消全选功能
  const toggleSelectAll = () => {
    if (selectedWalletIds.length === filteredWallets.length) {
      // 如果已全选，则取消全选
      setSelectedWalletIds([]);
    } else {
      // 否则全选当前过滤的钱包
      setSelectedWalletIds(filteredWallets.map(w => w.id));
    }
  };

  // 获取指定代币的余额信息
  const getTokenBalances = useCallback((tokenAddress: string): Map<string, number> => {
    return tokenBalances;
  }, [tokenBalances]);

  // 获取代币价格
  const fetchTokenPrice = useCallback(async (address: string) => {
    if (!address) return;

    // 使用ref来防止重复请求
    if (loadingPriceRef.current) {
      console.log('[DEBUG] 价格请求已在进行中，跳过');
      return;
    }

    try {
      loadingPriceRef.current = true;
      setLoadingPrice(true);
      const rpcUrl = currentNode?.url || '';

      if (!rpcUrl) {
        console.warn('[DEBUG] No RPC connection available for price fetch');
        return;
      }

      console.log('[DEBUG] 获取代币价格:', address);
      const { sdk } = await initializePumpSdk(rpcUrl);
      const priceResult = await getTokenPrice(sdk, address, 1); // 获取1 SOL能买到多少代币

      if (priceResult.success && priceResult.pricePerToken) {
        setTokenPrice(priceResult.pricePerToken);
        console.log('[DEBUG] 代币价格:', priceResult.pricePerToken, 'SOL per token');
      } else {
        console.warn('[DEBUG] 无法获取代币价格:', priceResult.error);
        setTokenPrice(0);
      }
    } catch (error) {
      console.error('[DEBUG] 获取代币价格失败:', error);
      setTokenPrice(0);
    } finally {
      loadingPriceRef.current = false;
      setLoadingPrice(false);
    }
  }, [currentNode]); // 移除loadingPrice依赖，避免循环

  // 验证代币地址
  useEffect(() => {
    if (!tokenAddress) {
      setTokenAddressValidation({ isValid: false });
      return;
    }

    const validation = validateTokenAddress(tokenAddress);
    setTokenAddressValidation(validation);

    if (validation.isValid) {
      console.log('[DEBUG] 代币地址验证通过:', tokenAddress);
    } else {
      console.warn('[DEBUG] 代币地址验证失败:', validation.error);
      // 清空相关状态
      setTokenPrice(0);
      setTokenBalances(new Map());
      lastTokenAddressRef.current = '';
      loadingBalancesRef.current = false;
    }
  }, [tokenAddress]);

  // 当代币地址改变时，自动获取价格和余额
  useEffect(() => {
    if (tokenAddress && tokenAddressValidation.isValid) {
      // 重置防抖标志，允许新的代币地址查询
      if (lastTokenAddressRef.current !== tokenAddress) {
        lastTokenAddressRef.current = '';
        loadingBalancesRef.current = false;
      }
      fetchTokenPrice(tokenAddress);
      fetchTokenBalances(); // 代币地址变化时自动刷新余额
    } else {
      setTokenPrice(0);
      setTokenBalances(new Map()); // 清空余额
      lastTokenAddressRef.current = '';
      loadingBalancesRef.current = false;
    }
  }, [tokenAddress, tokenAddressValidation.isValid, fetchTokenPrice]); // 移除fetchTokenBalances依赖避免循环

  // 一键创建并执行订单
  const handleCreateAndExecuteOrders = async (tradeType: 'buy' | 'sell') => {
    console.log('[DEBUG] handleCreateAndExecuteOrders called with type:', tradeType);

    if (!tokenAddress) {
      addLog({
        level: 'error',
        category: 'trade',
        message: '请输入代币地址'
      });
      return;
    }

    if (!tokenAddressValidation.isValid) {
      addLog({
        level: 'error',
        category: 'trade',
        message: `代币地址验证失败: ${tokenAddressValidation.error || '无效的代币地址'}`
      });
      return;
    }

    if (selectedWalletIds.length === 0) {
      addLog({
        level: 'error',
        category: 'trade',
        message: '请选择至少一个钱包'
      });
      return;
    }

    try {
      // 清除之前的缓存，确保获取最新状态
      clearBondingCurveCache(tokenAddress);

      // 预取blockhash以减少延迟
      if (connection) {
        await prefetchBlockhash(connection);
      }

      // 根据交易类型选择配置
      const config = tradeType === 'buy' ? buyConfig : sellConfig;
      
      // 更新配置
      updateConfig({
        tokenAddress,
        slippage: config.slippage,
        priorityFee: config.priorityFee,
        mode: 'internal' // 默认内盘
      });

      console.log('[DEBUG] Creating orders for wallets:', selectedWalletIds);
      console.log('[DEBUG] Using config:', config);

      // 实时创建并执行订单
      let executedCount = 0;
      for (const walletId of selectedWalletIds) {
        let orderAmount = config.amount.value;

        // 根据金额类型计算实际金额
        if (config.amountType === 'range') {
          orderAmount = config.amount.min + Math.random() * (config.amount.max - config.amount.min);
        } else if (config.amountType === 'percentage') {
          const wallet = wallets.find(w => w.id === walletId);
          if (wallet) {
            if (tradeType === 'buy') {
              const percentValue = config.percentage.min + Math.random() * (config.percentage.max - config.percentage.min);
              orderAmount = (wallet.solBalance || 0) * (percentValue / 100);
            } else {
              const tokenBalance = tokenBalances.get(walletId) || 0;
              const percentValue = config.percentage.min + Math.random() * (config.percentage.max - config.percentage.min);
              orderAmount = tokenBalance * (percentValue / 100);
            }
          }
        }

        console.log('[DEBUG] Creating and executing order:', { walletId, tradeType, orderAmount });
        
        // 创建订单
        const order = createOrder(walletId, tradeType, orderAmount);
        
        // 立即执行订单
        try {
          const success = await executeOrder(order.id);
          if (success) {
            executedCount++;
            addLog({
              level: 'success',
              category: 'trade',
              message: `钱包 ${walletId.slice(0, 8)}... ${tradeType === 'buy' ? '买入' : '卖出'}订单执行成功`
            });
          } else {
            addLog({
              level: 'error',
              category: 'trade',
              message: `钱包 ${walletId.slice(0, 8)}... ${tradeType === 'buy' ? '买入' : '卖出'}订单执行失败`
            });
          }
        } catch (error) {
          console.error('[DEBUG] Error executing order:', error);
          addLog({
            level: 'error',
            category: 'trade',
            message: `钱包 ${walletId.slice(0, 8)}... 订单执行异常: ${error.message}`
          });
        }
        
        // 添加交易间隔 (将秒转换为毫秒)
        if (config.tradeInterval > 0 && walletId !== selectedWalletIds[selectedWalletIds.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, config.tradeInterval * 1000));
        }
      }

      addLog({
        level: 'success',
        category: 'trade',
        message: `完成实时执行：${executedCount}/${selectedWalletIds.length} 个${tradeType === 'buy' ? '买入' : '卖出'}订单执行成功`
      });

    } catch (error) {
      console.error('[DEBUG] Error in handleCreateAndExecuteOrders:', error);
      addLog({
        level: 'error',
        category: 'trade',
        message: `创建并执行订单失败: ${error.message}`
      });
    }
  };

  // 一键清仓功能
  const handleEmergencySellAll = async () => {
    try {
      if (!tokenAddress) {
        addLog({
          level: 'error',
          category: 'trade',
          message: '请输入代币地址'
        });
        return;
      }

      addLog({
        level: 'info',
        category: 'trade',
        message: '开始一键清仓...'
      });

      // 1. 先刷新所有钱包的代币余额
      console.log('[DEBUG] 刷新所有钱包的代币余额以获取最新数据');

      // 使用fetchTokenBalances批量获取所有钱包的代币余额
      await fetchTokenBalances();

      // 等待余额更新完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. 自动选择所有代币余额不为0的钱包
      const tokenBalances = getTokenBalances(tokenAddress);
      const walletsWithTokens = wallets.filter(wallet => {
        const tokenBalance = tokenBalances.get(wallet.id) || 0;
        return tokenBalance > 0;
      });

      if (walletsWithTokens.length === 0) {
        addLog({
          level: 'warn',
          category: 'trade',
          message: '没有钱包持有该代币，无法执行清仓'
        });
        return;
      }

      console.log(`[DEBUG] 找到 ${walletsWithTokens.length} 个持有代币的钱包`);
      addLog({
        level: 'info',
        category: 'trade',
        message: `找到 ${walletsWithTokens.length} 个持有代币的钱包，开始创建清仓订单...`
      });

      // 3. 临时设置滑点为100%（保存原值）
      const originalSlippage = sellConfig.slippage;
      setSellConfig(prev => ({ ...prev, slippage: 100 }));

      // 等待设置更新
      await new Promise(resolve => setTimeout(resolve, 100));

      // 4. 实时创建并执行清仓订单
      let executedCount = 0;

      for (const wallet of walletsWithTokens) {
        const tokenBalance = tokenBalances.get(wallet.id) || 0;

        if (tokenBalance > 0) {
          try {
            // 创建并立即执行订单
            const order = createOrder(wallet.id, 'sell', tokenBalance);
            console.log(`[DEBUG] 创建清仓订单: 钱包 ${wallet.id}, 数量 ${tokenBalance}`);
            
            addLog({
              level: 'info',
              category: 'trade',
              message: `为钱包 ${wallet.label || wallet.address.slice(0, 8)} 创建清仓订单: ${formatNumber(tokenBalance)} 代币`
            });

            // 立即执行订单
            const success = await executeOrder(order.id);
            if (success) {
              executedCount++;
              addLog({
                level: 'success',
                category: 'trade',
                message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 清仓订单执行成功`
              });
            } else {
              addLog({
                level: 'error',
                category: 'trade',
                message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 清仓订单执行失败`
              });
            }
          } catch (executeError) {
            console.error('[DEBUG] Execute sell all order failed:', executeError);
            addLog({
              level: 'error',
              category: 'trade',
              message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 清仓订单执行异常: ${executeError.message}`
            });
          }
        }
      }

      if (executedCount === 0) {
        addLog({
          level: 'warn',
          category: 'trade',
          message: '所选钱包都没有代币余额，无法执行清仓'
        });
        setSellConfig(prev => ({ ...prev, slippage: originalSlippage }));
        return;
      }

      // 5. 恢复原始滑点设置
      setSellConfig(prev => ({ ...prev, slippage: originalSlippage }));

      addLog({
        level: 'success',
        category: 'trade',
        message: `一键清仓完成，成功执行 ${executedCount} 个订单`
      });

      // 6. 清仓完成后刷新余额
      setTimeout(async () => {
        try {
          await refreshAllBalances();
          // 只有在有代币地址时才刷新代币余额
          if (tokenAddress && (tokenAddress.length === 43 || tokenAddress.length === 44)) {
            await fetchTokenBalances(true);
            console.log('[DEBUG] 一键清仓后SOL和代币余额刷新完成');
          } else {
            console.log('[DEBUG] 一键清仓后SOL余额刷新完成（无代币地址）');
          }
        } catch (refreshError) {
          console.error('[DEBUG] 清仓后余额刷新失败:', refreshError);
        }
      }, 2000); // 等待2秒让所有交易确认

    } catch (error) {
      console.error('[DEBUG] 一键清仓失败:', error);
      addLog({
        level: 'error',
        category: 'trade',
        message: `一键清仓失败: ${error.message}`
      });
    }
  };



  // 单个钱包买入功能
  const handleSingleWalletBuy = async (walletId: string) => {
    if (!tokenAddress) {
      addLog({
        level: 'error',
        category: 'trade',
        message: '请先输入代币地址'
      });
      return;
    }

    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) {
      addLog({
        level: 'error',
        category: 'trade',
        message: '钱包不存在'
      });
      return;
    }

    try {
      // 使用当前买入配置计算订单金额
      let orderAmount = 0;
      const config = buyConfig;

      if (config.amountType === 'fixed') {
        orderAmount = config.amount.value;
      } else if (config.amountType === 'range') {
        orderAmount = config.amount.min + Math.random() * (config.amount.max - config.amount.min);
      } else if (config.amountType === 'percentage') {
        const percentValue = config.percentage.min + Math.random() * (config.percentage.max - config.percentage.min);
        orderAmount = (wallet.solBalance || 0) * (percentValue / 100);
      }

      console.log('[DEBUG] Single wallet buy:', { walletId, orderAmount, config });
      
      // 同步买入配置到全局配置
      updateConfig({
        slippage: config.slippage,
        priorityFee: config.priorityFee,
        tradeInterval: config.tradeInterval
      });
      
      // 创建并立即执行订单
      const order = createOrder(walletId, 'buy', orderAmount);
      
      addLog({
        level: 'info',
        category: 'trade',
        message: `为钱包 ${wallet.label || wallet.address.slice(0, 8)} 创建买入订单: ${formatNumber(orderAmount)} SOL`
      });

      // 立即执行订单
      try {
        const success = await executeOrder(order.id);
        if (success) {
          addLog({
            level: 'success',
            category: 'trade',
            message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 买入订单执行成功`
          });
          
          // 自动余额刷新已禁用，请手动刷新余额
        } else {
          addLog({
            level: 'error',
            category: 'trade',
            message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 买入订单执行失败`
          });
        }
      } catch (executeError) {
        console.error('[DEBUG] Execute order failed:', executeError);
        addLog({
          level: 'error',
          category: 'trade',
          message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 买入订单执行异常: ${executeError.message}`
        });
      }

    } catch (error) {
      console.error('[DEBUG] Single wallet buy failed:', error);
      addLog({
        level: 'error',
        category: 'trade',
        message: `单个钱包买入失败: ${error.message}`
      });
    }
  };

  // 单个钱包卖出功能
  const handleSingleWalletSell = async (walletId: string) => {
    if (!tokenAddress) {
      addLog({
        level: 'error',
        category: 'trade',
        message: '请先输入代币地址'
      });
      return;
    }

    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) {
      addLog({
        level: 'error',
        category: 'trade',
        message: '钱包不存在'
      });
      return;
    }

    const tokenBalance = tokenBalances.get(walletId) || 0;
    if (tokenBalance === 0) {
      addLog({
        level: 'warn',
        category: 'trade',
        message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 没有代币余额`
      });
      return;
    }

    try {
      // 使用当前卖出配置计算订单金额
      let orderAmount = 0;
      const config = sellConfig;

      if (config.amountType === 'fixed') {
        orderAmount = Math.min(config.amount.value, tokenBalance);
      } else if (config.amountType === 'range') {
        const randomAmount = config.amount.min + Math.random() * (config.amount.max - config.amount.min);
        orderAmount = Math.min(randomAmount, tokenBalance);
      } else if (config.amountType === 'percentage') {
        const percentValue = config.percentage.min + Math.random() * (config.percentage.max - config.percentage.min);
        orderAmount = tokenBalance * (percentValue / 100);
      }

      console.log('[DEBUG] Single wallet sell:', { walletId, orderAmount, tokenBalance, config });
      
      // 同步卖出配置到全局配置
      updateConfig({
        slippage: config.slippage,
        priorityFee: config.priorityFee,
        tradeInterval: config.tradeInterval
      });
      
      // 创建并立即执行订单
      const order = createOrder(walletId, 'sell', orderAmount);
      
      addLog({
        level: 'info',
        category: 'trade',
        message: `为钱包 ${wallet.label || wallet.address.slice(0, 8)} 创建卖出订单: ${formatNumber(orderAmount)} 代币`
      });

      // 立即执行订单
      try {
        const success = await executeOrder(order.id);
        if (success) {
          addLog({
            level: 'success',
            category: 'trade',
            message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 卖出订单执行成功`
          });
          
          // 自动余额刷新已禁用，请手动刷新余额
        } else {
          addLog({
            level: 'error',
            category: 'trade',
            message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 卖出订单执行失败`
          });
        }
      } catch (executeError) {
        console.error('[DEBUG] Execute order failed:', executeError);
        addLog({
          level: 'error',
          category: 'trade',
          message: `钱包 ${wallet.label || wallet.address.slice(0, 8)} 卖出订单执行异常: ${executeError.message}`
        });
      }

    } catch (error) {
      console.error('[DEBUG] Single wallet sell failed:', error);
      addLog({
        level: 'error',
        category: 'trade',
        message: `单个钱包卖出失败: ${error.message}`
      });
    }
  };

  // 计算统计信息
  const stats = {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 'pending').length,
    executingOrders: orders.filter(o => o.status === 'executing').length,
    completedOrders: orders.filter(o => o.status === 'completed').length,
    failedOrders: orders.filter(o => o.status === 'failed').length
  };

  // 计算代币统计数据
  const calculateTokenStats = useCallback(() => {
    if (!tokenAddress || selectedWalletIds.length === 0) {
      return {
        totalSOL: 0,
        totalTokens: 0,
        estimatedValue: 0,
        selectedWallets: 0
      };
    }

    const selectedWallets = wallets.filter(w => selectedWalletIds.includes(w.id));
    const totalSOL = selectedWallets.reduce((sum, wallet) => sum + (wallet.solBalance || 0), 0);
    const totalTokens = selectedWallets.reduce((sum, wallet) => {
      const tokenBalance = tokenBalances.get(wallet.id) || 0;
      return sum + tokenBalance;
    }, 0);

    // 根据当前代币价格计算估算价值
    const estimatedValue = totalTokens * tokenPrice;

    return {
      totalSOL,
      totalTokens,
      estimatedValue,
      selectedWallets: selectedWallets.length
    };
  }, [wallets, selectedWalletIds, tokenBalances, tokenAddress, tokenPrice]);

  // 统一刷新所有余额的函数
  const refreshAllBalances = async () => {
    setIsRefreshingAll(true);
    addLog({
      level: 'info',
      category: 'trade',
      message: '正在刷新所有余额...'
    });

    try {
      // 1. 刷新SOL余额
      console.log('[DEBUG] 开始刷新SOL余额');
      await updateAllBalances();
      
      // 2. 如果有代币地址，刷新代币余额
      if (tokenAddress && (tokenAddress.length === 43 || tokenAddress.length === 44)) {
        console.log('[DEBUG] 开始刷新代币余额');
        await fetchTokenBalances(true);
      }

      addLog({
        level: 'success',
        category: 'trade',
        message: tokenAddress ? '所有余额刷新完成' : 'SOL余额刷新完成'
      });
    } catch (error) {
      console.error('[DEBUG] 刷新余额失败:', error);
      addLog({
        level: 'error',
        category: 'trade',
        message: `余额刷新失败: ${error.message}`
      });
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const tokenStats = calculateTokenStats();

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">批量交易</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={refreshAllBalances}
            disabled={isRefreshingAll}
            className={cn(
              "px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm font-medium transition-colors",
              isRefreshingAll
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshingAll && "animate-spin")} />
            <span>{isRefreshingAll ? '刷新中...' : '刷新所有余额'}</span>
          </button>
        </div>
      </div>

      {/* 代币地址输入 */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              代币地址
            </label>
            <div className="relative">
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="输入 Solana 代币地址"
                className={cn(
                  "w-full px-4 py-3 bg-white border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-blue-500",
                  tokenAddress && !tokenAddressValidation.isValid 
                    ? "border-red-300 focus:ring-red-500" 
                    : "border-gray-300 focus:ring-blue-500"
                )}
              />
              {tokenAddress && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  {tokenAddressValidation.isValid ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {tokenAddress && !tokenAddressValidation.isValid && tokenAddressValidation.error && (
              <div className="mt-2 text-sm text-red-600 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1" />
                {tokenAddressValidation.error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            {loadingBalances ? (
              <div className="text-sm text-gray-600 animate-pulse">
                正在加载代币余额...
              </div>
            ) : (
              <button
                onClick={() => fetchTokenBalances(true)}
                disabled={!tokenAddress || loadingBalances}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>刷新代币余额</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 左侧：买入和卖出订单 */}
        <div className="space-y-6">
          {/* 买入订单模块 */}
          <div className="bg-white rounded-lg p-6 border-l-4 border-green-500 shadow-sm border-t border-r border-b border-gray-200">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900">创建买入订单</h2>
            </div>

            {/* 买入金额设置 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                买入金额
              </label>

              {/* 金额类型选择 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  onClick={() => setBuyConfig(prev => ({ ...prev, amountType: 'fixed' }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center space-x-1",
                    buyConfig.amountType === 'fixed'
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Hash className="w-3 h-3" />
                  <span>固定</span>
                </button>
                <button
                  onClick={() => setBuyConfig(prev => ({ ...prev, amountType: 'range' }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center space-x-1",
                    buyConfig.amountType === 'range'
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Shuffle className="w-3 h-3" />
                  <span>范围</span>
                </button>
                <button
                  onClick={() => setBuyConfig(prev => ({ ...prev, amountType: 'percentage' }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center space-x-1",
                    buyConfig.amountType === 'percentage'
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Percent className="w-3 h-3" />
                  <span>百分比</span>
                </button>
              </div>

              {/* 买入金额输入 */}
              {buyConfig.amountType === 'fixed' && (
                <input
                  type="number"
                  value={buyConfig.amount.value}
                  onChange={(e) => setBuyConfig(prev => ({ 
                    ...prev, 
                    amount: { ...prev.amount, value: parseFloat(e.target.value) || 0 }
                  }))}
                  placeholder="SOL 数量"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              )}

              {buyConfig.amountType === 'range' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={buyConfig.amount.min}
                    onChange={(e) => setBuyConfig(prev => ({ 
                      ...prev, 
                      amount: { ...prev.amount, min: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最小值"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="number"
                    value={buyConfig.amount.max}
                    onChange={(e) => setBuyConfig(prev => ({ 
                      ...prev, 
                      amount: { ...prev.amount, max: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最大值"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {buyConfig.amountType === 'percentage' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={buyConfig.percentage.min}
                    onChange={(e) => setBuyConfig(prev => ({ 
                      ...prev, 
                      percentage: { ...prev.percentage, min: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最小 %"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="number"
                    value={buyConfig.percentage.max}
                    onChange={(e) => setBuyConfig(prev => ({ 
                      ...prev, 
                      percentage: { ...prev.percentage, max: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最大 %"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            {/* 买入配置 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  滑点 (%)
                </label>
                <input
                  type="number"
                  value={buyConfig.slippage}
                  onChange={(e) => setBuyConfig(prev => ({ 
                    ...prev, 
                    slippage: parseFloat(e.target.value) || 0 
                  }))}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  间隔 (秒)
                </label>
                <input
                  type="number"
                  value={buyConfig.tradeInterval}
                  onChange={(e) => setBuyConfig(prev => ({ 
                    ...prev, 
                    tradeInterval: parseInt(e.target.value) || 0 
                  }))}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如: 1 (表示1秒)"
                />
              </div>
            </div>

            {/* 买入执行按钮 */}
            <button
              onClick={() => handleCreateAndExecuteOrders('buy')}
              disabled={!tokenAddress || selectedWalletIds.length === 0 || isExecuting}
              className={cn(
                "w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2",
                tokenAddress && selectedWalletIds.length > 0 && !isExecuting
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
            >
              <Play className="w-4 h-4" />
              <span>
                {isExecuting ? '正在执行...' : `创建买入订单 (${selectedWalletIds.length} 个钱包)`}
              </span>
            </button>
          </div>

          {/* 卖出订单模块 */}
          <div className="bg-white rounded-lg p-6 border-l-4 border-red-500 shadow-sm border-t border-r border-b border-gray-200">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-gray-900">创建卖出订单</h2>
            </div>

            {/* 卖出金额设置 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                卖出金额
              </label>

              {/* 金额类型选择 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  onClick={() => setSellConfig(prev => ({ ...prev, amountType: 'fixed' }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center space-x-1",
                    sellConfig.amountType === 'fixed'
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Hash className="w-3 h-3" />
                  <span>固定</span>
                </button>
                <button
                  onClick={() => setSellConfig(prev => ({ ...prev, amountType: 'range' }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center space-x-1",
                    sellConfig.amountType === 'range'
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Shuffle className="w-3 h-3" />
                  <span>范围</span>
                </button>
                <button
                  onClick={() => setSellConfig(prev => ({ ...prev, amountType: 'percentage' }))}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center space-x-1",
                    sellConfig.amountType === 'percentage'
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Percent className="w-3 h-3" />
                  <span>百分比</span>
                </button>
              </div>

              {/* 卖出金额输入 */}
              {sellConfig.amountType === 'fixed' && (
                <input
                  type="number"
                  value={sellConfig.amount.value}
                  onChange={(e) => setSellConfig(prev => ({ 
                    ...prev, 
                    amount: { ...prev.amount, value: parseFloat(e.target.value) || 0 }
                  }))}
                  placeholder="代币数量"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              )}

              {sellConfig.amountType === 'range' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={sellConfig.amount.min}
                    onChange={(e) => setSellConfig(prev => ({ 
                      ...prev, 
                      amount: { ...prev.amount, min: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最小值"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="number"
                    value={sellConfig.amount.max}
                    onChange={(e) => setSellConfig(prev => ({ 
                      ...prev, 
                      amount: { ...prev.amount, max: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最大值"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {sellConfig.amountType === 'percentage' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={sellConfig.percentage.min}
                    onChange={(e) => setSellConfig(prev => ({ 
                      ...prev, 
                      percentage: { ...prev.percentage, min: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最小 %"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="number"
                    value={sellConfig.percentage.max}
                    onChange={(e) => setSellConfig(prev => ({ 
                      ...prev, 
                      percentage: { ...prev.percentage, max: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="最大 %"
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            {/* 卖出配置 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  滑点 (%)
                </label>
                <input
                  type="number"
                  value={sellConfig.slippage}
                  onChange={(e) => setSellConfig(prev => ({ 
                    ...prev, 
                    slippage: parseFloat(e.target.value) || 0 
                  }))}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  间隔 (秒)
                </label>
                <input
                  type="number"
                  value={sellConfig.tradeInterval}
                  onChange={(e) => setSellConfig(prev => ({ 
                    ...prev, 
                    tradeInterval: parseInt(e.target.value) || 0 
                  }))}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如: 1 (表示1秒)"
                />
              </div>
            </div>

            {/* 卖出执行按钮 */}
            <div className="space-y-3">
              <button
                onClick={() => handleCreateAndExecuteOrders('sell')}
                disabled={!tokenAddress || selectedWalletIds.length === 0 || isExecuting}
                className={cn(
                  "w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2",
                  tokenAddress && selectedWalletIds.length > 0 && !isExecuting
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
              >
                <Play className="w-4 h-4" />
                <span>
                  {isExecuting ? '正在执行...' : `创建卖出订单 (${selectedWalletIds.length} 个钱包)`}
                </span>
              </button>

              {/* 一键清仓按钮 */}
              <button
                onClick={handleEmergencySellAll}
                disabled={!tokenAddress || isExecuting}
                className={cn(
                  "w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2",
                  tokenAddress && !isExecuting
                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
                title="一键清仓：将自动检测所有持有代币的钱包，设置100%滑点，卖出所有代币"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>
                  {isExecuting ? '正在执行...' : '🚨 一键清仓所有持币钱包'}
                </span>
              </button>
            </div>
          </div>

          {/* 全局配置 */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">全局配置</h2>

            <div className="space-y-4">
              {/* 优先费用 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  优先费用 (SOL)
                </label>
                <input
                  type="number"
                  value={buyConfig.priorityFee}
                  onChange={(e) => {
                    const fee = parseFloat(e.target.value) || 0;
                    setBuyConfig(prev => ({ ...prev, priorityFee: fee }));
                    setSellConfig(prev => ({ ...prev, priorityFee: fee }));
                  }}
                  step="0.00001"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：钱包选择 */}
        <div className="bg-white rounded-lg p-6 h-fit shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">选择钱包</h2>
            <div className="text-sm text-gray-600">
              已选择: {selectedWalletIds.length} / {filteredWallets.length}
            </div>
          </div>

          {/* 快捷选择按钮 */}
          <div className="space-y-2 mb-4">
            {/* 全选按钮 */}
            <button
              onClick={toggleSelectAll}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                selectedWalletIds.length === filteredWallets.length && filteredWallets.length > 0
                  ? "bg-orange-100 hover:bg-orange-200 text-orange-600"
                  : "bg-blue-100 hover:bg-blue-200 text-blue-600"
              )}
            >
              {selectedWalletIds.length === filteredWallets.length && filteredWallets.length > 0 
                ? "取消全选" 
                : "全选钱包"
              }
            </button>
            
            {/* 其他快捷选择按钮 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={selectWalletsWithTokens}
                className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg text-sm font-medium"
              >
                选择有代币的
              </button>
              <button
                onClick={selectWalletsWithoutTokens}
                className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-sm font-medium"
              >
                选择无代币的
              </button>
            </div>
          </div>

          {/* 搜索和过滤 */}
          <div className="mb-4 space-y-2">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="搜索钱包地址或标签..."
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />


          </div>

          {/* 钱包列表 */}
          <div className="max-h-[730px] overflow-y-auto space-y-2 pr-2">
            {filteredWallets.map((wallet) => {
              const tokenBalance = tokenBalances.get(wallet.id) || 0;
              const isSelected = selectedWalletIds.includes(wallet.id);

              return (
                <div
                  key={wallet.id}
                  onClick={() => toggleWalletSelection(wallet.id)}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-colors",
                    isSelected
                      ? "bg-blue-50 border border-blue-300"
                      : "bg-white hover:bg-gray-50 border border-gray-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <Wallet className="w-4 h-4 text-gray-500" />
                        <span className="text-base font-medium text-gray-900 truncate">
                          {wallet.label || wallet.address.slice(0, 8) + '...'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1 font-mono">
                        {wallet.address.slice(0, 20)}...
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {/* 余额显示 */}
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">
                          {formatNumber(wallet.solBalance || 0)} SOL
                        </div>
                        {tokenAddress && (
                          <div className="text-base font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                            {formatNumber(tokenBalance)} 代币
                          </div>
                        )}
                      </div>
                      {/* 买卖按钮 */}
                      {tokenAddress && (
                        <div className="flex space-x-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSingleWalletBuy(wallet.id);
                            }}
                            className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-medium transition-colors"
                            title="买入"
                          >
                            买
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSingleWalletSell(wallet.id);
                            }}
                            className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors"
                            title="卖出"
                            disabled={tokenBalance === 0}
                          >
                            卖
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 代币统计面板 */}
      {tokenAddress && selectedWalletIds.length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <Activity className="w-5 h-5" />
              <span>资产统计</span>
            </h2>
            <div className="text-sm text-gray-600">
              {tokenStats.selectedWallets} 个钱包
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* SOL 总量 */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-700">SOL 总量</span>
                </div>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {formatNumber(tokenStats.totalSOL, 4)} SOL
              </div>
              <div className="text-xs text-gray-600 mt-1">
                平均每钱包: {formatNumber(tokenStats.totalSOL / tokenStats.selectedWallets, 4)} SOL
              </div>
            </div>

            {/* 代币总量 */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-700">代币总量</span>
                </div>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {formatNumber(tokenStats.totalTokens)} 代币
              </div>
              <div className="text-xs text-gray-600 mt-1">
                平均每钱包: {formatNumber(tokenStats.totalTokens / tokenStats.selectedWallets)} 代币
              </div>
            </div>

            {/* 估算价值 */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-700">估算价值</span>
                </div>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {loadingPrice ? (
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>加载中...</span>
                  </div>
                ) : tokenStats.estimatedValue > 0 ? (
                  `${formatNumber(tokenStats.estimatedValue, 4)} SOL`
                ) : tokenPrice === 0 ? (
                  '待计算'
                ) : (
                  '无代币'
                )}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {loadingPrice ? (
                  '正在获取价格...'
                ) : tokenPrice > 0 ? (
                  `单价: ${formatNumber(tokenPrice, 8)} SOL/token`
                ) : (
                  '需要联合曲线数据'
                )}
              </div>
            </div>
          </div>

          {/* 资产比例条 */}
          {tokenStats.totalSOL > 0 && tokenStats.estimatedValue > 0 && (
            <div className="mt-4">
              <div className="text-sm text-gray-600 mb-2">资产构成</div>
              <div className="flex bg-gray-200 rounded-lg overflow-hidden h-3">
                <div
                  className="bg-purple-500"
                  style={{
                    width: `${(tokenStats.totalSOL / (tokenStats.totalSOL + tokenStats.estimatedValue)) * 100}%`
                  }}
                  title={`SOL: ${formatNumber(tokenStats.totalSOL, 4)}`}
                ></div>
                <div
                  className="bg-green-500"
                  style={{
                    width: `${(tokenStats.estimatedValue / (tokenStats.totalSOL + tokenStats.estimatedValue)) * 100}%`
                  }}
                  title={`代币价值: ${formatNumber(tokenStats.estimatedValue, 4)} SOL`}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>SOL ({formatNumber((tokenStats.totalSOL / (tokenStats.totalSOL + tokenStats.estimatedValue)) * 100, 1)}%)</span>
                <span>代币 ({formatNumber((tokenStats.estimatedValue / (tokenStats.totalSOL + tokenStats.estimatedValue)) * 100, 1)}%)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 订单列表 */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">订单列表</h2>
          <div className="flex items-center space-x-2">
            <div className="text-sm text-gray-600">
              待执行: {stats.pendingOrders} |
              执行中: {stats.executingOrders} |
              完成: {stats.completedOrders} |
              失败: {stats.failedOrders}
            </div>
            <button
              onClick={() => {
                clearOrders();
                addLog({
                  level: 'info',
                  category: 'trade',
                  message: '已清空所有订单'
                });
              }}
              disabled={orders.length === 0}
              className={cn(
                "px-4 py-2 rounded-lg font-medium",
                orders.length > 0
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
            >
              清空订单 ({orders.length})
            </button>
          </div>
        </div>

        {/* 订单表格 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-sm text-gray-600 border-b border-gray-200">
                <th className="pb-3">钱包</th>
                <th className="pb-3">类型</th>
                <th className="pb-3">金额</th>
                <th className="pb-3">状态</th>
                <th className="pb-3">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-gray-200">
                  <td className="py-3 text-gray-700">
                    {wallets.find(w => w.id === order.walletId)?.label || order.walletId.slice(0, 8) + '...'}
                  </td>
                  <td className="py-3">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      order.type === 'buy'
                        ? "bg-green-600/20 text-green-400"
                        : "bg-red-600/20 text-red-400"
                    )}>
                      {order.type === 'buy' ? '买入' : '卖出'}
                    </span>
                  </td>
                  <td className="py-3 text-gray-700">
                    {formatNumber(order.amount)}
                  </td>
                  <td className="py-3">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      order.status === 'pending' && "bg-yellow-600/20 text-yellow-400",
                      order.status === 'executing' && "bg-blue-600/20 text-blue-400",
                      order.status === 'completed' && "bg-green-600/20 text-green-400",
                      order.status === 'failed' && "bg-red-600/20 text-red-400"
                    )}>
                      {order.status === 'pending' && '待执行'}
                      {order.status === 'executing' && '执行中'}
                      {order.status === 'completed' && '已完成'}
                      {order.status === 'failed' && '失败'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center space-x-2">
                      {order.txHash && (
                        <a
                          href={`https://solscan.io/tx/${order.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 text-gray-600 hover:text-gray-900"
                          title="在 Solscan 上查看"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span className="text-xs">Solscan</span>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {orders.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              暂无订单
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Trading;