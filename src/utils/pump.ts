import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
// Internal trading SDK (pump.fun内盘)
import { OnlinePumpSdk, PumpSdk } from '@pump-fun/pump-sdk';
// External trading SDK (外盘DEX交易)
import { PumpAmmSdk, OnlinePumpAmmSdk } from '@pump-fun/pump-swap-sdk';
import { logger } from './logger';

// Blockhash预取缓存
interface BlockhashCache {
  blockhash: string;
  lastValidBlockHeight: number;
  timestamp: number;
}

let blockhashCache: BlockhashCache | null = null;
const BLOCKHASH_CACHE_TIME = 3000; // 3秒缓存，更短的缓存时间以确保新鲜度

// 预取blockhash
export const prefetchBlockhash = async (connection: Connection): Promise<void> => {
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    blockhashCache = {
      blockhash,
      lastValidBlockHeight,
      timestamp: Date.now()
    };
    logger.debug('pump', 'Prefetched blockhash', { blockhash });
  } catch (error) {
    logger.error('pump', 'Failed to prefetch blockhash', { error: error.message });
  }
};

// 获取blockhash（优先使用缓存）
const getBlockhash = async (connection: Connection): Promise<{ blockhash: string; lastValidBlockHeight: number }> => {
  // 检查缓存是否有效
  if (blockhashCache && (Date.now() - blockhashCache.timestamp) < BLOCKHASH_CACHE_TIME) {
    logger.debug('pump', 'Using cached blockhash', {
      age: Date.now() - blockhashCache.timestamp
    });
    return {
      blockhash: blockhashCache.blockhash,
      lastValidBlockHeight: blockhashCache.lastValidBlockHeight
    };
  }

  // 获取新的blockhash
  const result = await connection.getLatestBlockhash('processed');

  // 更新缓存
  blockhashCache = {
    blockhash: result.blockhash,
    lastValidBlockHeight: result.lastValidBlockHeight,
    timestamp: Date.now()
  };

  return result;
};

interface TradeConfig {
  slippage: number;
  priorityFee?: number;
}

interface BondingCurve {
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
  realTokenReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
}

// 缓存bonding curve状态，避免重复查询
interface BondingCurveCache {
  tokenAddress: string;
  bondingCurveAccountInfo: any;
  bondingCurve: BondingCurve;
  global: any;
  timestamp: number;
}

const bondingCurveCache = new Map<string, BondingCurveCache>();
const CACHE_DURATION = 30000; // 缓存30秒 - 避免使用过时的状态

// 清除缓存
export const clearBondingCurveCache = (tokenAddress?: string) => {
  if (tokenAddress) {
    bondingCurveCache.delete(tokenAddress);
    logger.info('pump', 'Cleared bonding curve cache for token', { tokenAddress });
  } else {
    bondingCurveCache.clear();
    logger.info('pump', 'Cleared all bonding curve caches');
  }
};

// ============= 内盘交易 (Pump SDK) =============

// 静态方法 - 计算买入时能获得的代币数量
const getBuyTokenAmountFromSolAmount = (global: any, bondingCurve: BondingCurve, solAmount: BN): BN => {
  const virtualSolReserves = bondingCurve.virtualSolReserves;
  const virtualTokenReserves = bondingCurve.virtualTokenReserves;

  const productOfReserves = virtualSolReserves.mul(virtualTokenReserves);
  const newVirtualSolReserves = virtualSolReserves.add(solAmount);
  const newVirtualTokenReserves = productOfReserves.div(newVirtualSolReserves);
  const tokenAmount = virtualTokenReserves.sub(newVirtualTokenReserves);

  return tokenAmount;
};

// 静态方法 - 计算卖出代币能获得的SOL数量
const getSellSolAmountFromTokenAmount = (global: any, bondingCurve: BondingCurve, tokenAmount: BN): BN => {
  const virtualSolReserves = bondingCurve.virtualSolReserves;
  const virtualTokenReserves = bondingCurve.virtualTokenReserves;

  const productOfReserves = virtualSolReserves.mul(virtualTokenReserves);
  const newVirtualTokenReserves = virtualTokenReserves.add(tokenAmount);
  const newVirtualSolReserves = productOfReserves.div(newVirtualTokenReserves);
  const solAmount = virtualSolReserves.sub(newVirtualSolReserves);

  return solAmount;
};

// 初始化内盘SDK
export const initializePumpSdk = async (rpcUrl: string) => {
  try {
    // 配置正确的WebSocket端点
    let wsEndpoint = undefined;

    // 特殊处理zan.top的WebSocket URL
    if (rpcUrl.includes('api.zan.top')) {
      // zan.top的WebSocket格式: wss://api.zan.top/node/ws/v1/solana/mainnet/{api-key}
      const apiKey = rpcUrl.split('/').pop(); // 获取API key
      wsEndpoint = `wss://api.zan.top/node/ws/v1/solana/mainnet/${apiKey}`;
    } else if (rpcUrl.startsWith('https://')) {
      // 其他RPC的标准WebSocket转换
      wsEndpoint = rpcUrl.replace('https://', 'wss://');
    } else if (rpcUrl.startsWith('http://')) {
      wsEndpoint = rpcUrl.replace('http://', 'ws://');
    }

    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint, // 使用正确的WebSocket端点
      disableRetryOnRateLimit: false,
      confirmTransactionInitialTimeout: 60000,
      httpHeaders: {
        'Content-Type': 'application/json'
      }
    });
    const sdk = new OnlinePumpSdk(connection);

    logger.info('pump', 'Pump SDK initialized', { rpcUrl, wsEndpoint });

    return { sdk, connection };
  } catch (error) {
    logger.error('pump', 'Failed to initialize Pump SDK', {
      error: error.message,
      rpcUrl
    });
    throw error;
  }
};

// 初始化外盘SDK
export const initializePumpSwapSdk = (connection: Connection) => {
  try {
    const sdk = new PumpAmmSdk();
    const onlineSdk = new OnlinePumpAmmSdk(connection);

    logger.info('pump', 'Pump Swap SDK initialized');

    return { sdk, onlineSdk };
  } catch (error) {
    logger.error('pump', 'Failed to initialize Pump Swap SDK', {
      error: error.message
    });
    throw error;
  }
};

// 获取代币信息（内盘）
export const getTokenInfo = async (
  sdk: OnlinePumpSdk,
  tokenAddress: string
): Promise<{
  name?: string;
  symbol?: string;
  decimals?: number;
  supply?: number;
  bondingCurve?: any;
  isComplete?: boolean;
  progress?: number;
  success: boolean;
  error?: string;
}> => {
  try {
    const mint = new PublicKey(tokenAddress);
    const bondingCurve = await sdk.fetchBondingCurve(mint);

    if (!bondingCurve) {
      return {
        success: false,
        error: '代币不存在于Pump.fun或已毕业到Raydium'
      };
    }

    // 计算进度（基于虚拟储备）
    const virtualSolReserves = Number(bondingCurve.virtualSolReserves) / 1e9;
    const targetSol = 85; // Pump.fun毕业目标是85 SOL
    const progress = Math.min((virtualSolReserves / targetSol) * 100, 100);

    return {
      name: 'PUMP Token',
      symbol: 'PUMP',
      decimals: 6,
      supply: Number(bondingCurve.tokenTotalSupply) / 1e6,
      bondingCurve,
      isComplete: bondingCurve.complete,
      progress,
      success: true
    };
  } catch (error) {
    logger.error('pump', 'Failed to get token info', {
      error: error.message,
      tokenAddress
    });

    return {
      success: false,
      error: error.message
    };
  }
};

// 验证代币是否可交易
export const validateTokenTradability = async (
  sdk: OnlinePumpSdk,
  tokenAddress: string
): Promise<{
  canTrade: boolean;
  reason?: string;
  tokenInfo?: any;
}> => {
  try {
    const info = await getTokenInfo(sdk, tokenAddress);

    if (!info.success) {
      return {
        canTrade: false,
        reason: info.error || '无法获取代币信息'
      };
    }

    if (info.isComplete) {
      return {
        canTrade: false,
        reason: '代币已完成绑定曲线，请在Raydium交易',
        tokenInfo: info
      };
    }

    return {
      canTrade: true,
      tokenInfo: info
    };
  } catch (error) {
    return {
      canTrade: false,
      reason: error.message
    };
  }
};

// 获取代币价格（内盘）
export const getTokenPrice = async (
  sdk: OnlinePumpSdk,
  tokenAddress: string,
  amountInSOL: number = 1
): Promise<{
  price?: number;
  pricePerToken?: number;
  success: boolean;
  error?: string;
}> => {
  try {
    const mint = new PublicKey(tokenAddress);
    const global = await sdk.fetchGlobal();
    const bondingCurve = await sdk.fetchBondingCurve(mint);

    if (!bondingCurve) {
      return {
        success: false,
        error: '无法获取代币信息'
      };
    }

    // 计算指定amountInSOL可以买到的代币数量
    const solAmount = new BN(Math.floor(amountInSOL * 1e9));
    const tokenAmount = getBuyTokenAmountFromSolAmount(
      global,
      bondingCurve,
      solAmount
    );

    const tokensReceived = Number(tokenAmount) / 1e6; // 6 decimals
    const pricePerToken = amountInSOL / tokensReceived;

    return {
      price: tokensReceived,
      pricePerToken,
      success: true
    };
  } catch (error) {
    logger.error('pump', 'Failed to get token price', {
      error: error.message,
      tokenAddress
    });

    return {
      success: false,
      error: error.message
    };
  }
};

// 执行内盘买入交易
export const executeBuyTransaction = async (
  sdk: OnlinePumpSdk,
  connection: Connection,
  keypair: Keypair,
  tokenAddress: string,
  amountInSOL: number,
  config: TradeConfig,
  useCachedState: boolean = true
): Promise<{
  signature?: string;
  success: boolean;
  error?: string;
  gasUsed?: number;
  actualPrice?: number;
  tokensReceived?: number;
}> => {
  try {
    // 验证参数
    if (!tokenAddress || !amountInSOL || amountInSOL <= 0) {
      return { success: false, error: 'Invalid parameters: tokenAddress or amountInSOL' };
    }

    const validation = validatePumpTokenAddress(tokenAddress);
     if (!validation.isValid) {
       return { success: false, error: `Invalid token address: ${validation.error}` };
     }

    let mint: PublicKey;
    try {
      mint = new PublicKey(tokenAddress);
    } catch (error) {
      return {
        success: false,
        error: '无效的代币地址格式'
      };
    }

    const user = keypair.publicKey;



    let bondingCurveAccountInfo;
    let bondingCurve;
    let associatedUserAccountInfo;
    let global;

    // 检查缓存
    const cached = bondingCurveCache.get(tokenAddress);
    if (useCachedState && cached &&
        Date.now() - cached.timestamp < CACHE_DURATION) {
      logger.info('pump', 'Using cached bonding curve state');
      bondingCurveAccountInfo = cached.bondingCurveAccountInfo;
      bondingCurve = cached.bondingCurve;
      global = cached.global;

      // 仍需要获取用户账户信息
      try {
        const buyState = await sdk.fetchBuyState(mint, user);
        associatedUserAccountInfo = buyState.associatedUserAccountInfo;
      } catch (error) {
        logger.warn('pump', 'Failed to fetch user account info', {
          tokenAddress,
          error: error.message
        });
        associatedUserAccountInfo = null;
      }
    } else {
      // 获取全局状态
      global = await sdk.fetchGlobal();
      if (!global) {
        return {
          success: false,
          error: '无法获取全局状态'
        };
      }

      // 使用SDK的fetchBuyState获取所有需要的状态
      try {
        const buyState = await sdk.fetchBuyState(mint, user);
        bondingCurveAccountInfo = buyState.bondingCurveAccountInfo;
        bondingCurve = buyState.bondingCurve;
        associatedUserAccountInfo = buyState.associatedUserAccountInfo;

        // 更新缓存
        bondingCurveCache.set(tokenAddress, {
          tokenAddress,
          bondingCurveAccountInfo,
          bondingCurve,
          global,
          timestamp: Date.now()
        });
        logger.info('pump', 'Cached bonding curve state');
      } catch (error) {
        logger.warn('pump', 'Failed to fetch buy state', {
          tokenAddress,
          error: error.message
        });
        return {
          success: false,
          error: '无法获取代币交易状态 - 代币可能已经毕业到Raydium或不存在于Pump.fun'
        };
      }
    }

    if (!bondingCurve) {
      logger.warn('pump', 'Bonding curve not found', {
        tokenAddress
      });
      return {
        success: false,
        error: '无法获取代币信息 - 代币不存在于Pump.fun'
      };
    }

    // 检查代币是否已完成
    if (bondingCurve.complete) {
      logger.warn('pump', 'Token has completed bonding curve', {
        tokenAddress
      });
      return {
        success: false,
        error: '代币已完成绑定曲线，请在Raydium上交易'
      };
    }

    if (!bondingCurveAccountInfo) {
      logger.error('pump', 'Bonding curve account info not found', {
        tokenAddress
      });
      return {
        success: false,
        error: '无法获取绑定曲线账户信息'
      };
    }

    // 转换SOL金额为lamports
    const solAmount = new BN(Math.floor(amountInSOL * 1e9));

    // 计算预期获得的代币数量
    const tokenAmount = getBuyTokenAmountFromSolAmount(
      global,
      bondingCurve,
      solAmount
    );

    logger.info('pump', 'Calculated buy amounts', {
      solAmount: solAmount.toString(),
      expectedTokens: tokenAmount.toString(),
      tokenDecimals: 6
    });

    // 创建买入指令 - 使用SDK的离线方法
    const offlineSDK = new PumpSdk();
    const instructions = await offlineSDK.buyInstructions({
      global,
      bondingCurveAccountInfo,
      bondingCurve,
      associatedUserAccountInfo, // 可以为null
      mint,
      user,
      solAmount,
      amount: tokenAmount,
      slippage: config.slippage
    });

    // 创建交易 - 使用缓存或获取最新blockhash
    const { blockhash, lastValidBlockHeight } = await getBlockhash(connection);
    const message = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    let transaction = new VersionedTransaction(message);
    transaction.sign([keypair]);

    // 发送交易
    let signature: string;
    let retries = 3;
    let lastError: any;

    logger.info('pump', 'Starting transaction execution', {
      tokenAddress,
      amount: amountInSOL,
      retries,
      user: user.toBase58()
    });

    while (retries > 0) {
      try {
        signature = await connection.sendTransaction(transaction, {
          skipPreflight: false,
          preflightCommitment: 'processed',
          maxRetries: 3
        });

        logger.success('pump', 'Transaction sent successfully', {
          signature,
          retryAttempt: 3 - retries + 1,
          solscan: `https://solscan.io/tx/${signature}`
        });
        break;
      } catch (error) {
        lastError = error;
        retries--;

        logger.warn('pump', 'Transaction attempt failed', {
          error: error.message,
          retriesLeft: retries,
          attempt: 3 - retries + 1
        });

        // 处理不同类型的错误
        if (error.message?.includes('block height exceeded') ||
            error.message?.includes('Blockhash not found') ||
            error.message?.includes('blockhash not found')) {
          // blockhash过期，立即获取新的
          if (retries > 0) {
            logger.info('pump', 'Refreshing blockhash due to expiration', { retriesLeft: retries });
            try {
              const { blockhash: newBlockhash } = await connection.getLatestBlockhash('processed');
              const newMessage = new TransactionMessage({
                payerKey: user,
                recentBlockhash: newBlockhash,
                instructions
              }).compileToV0Message();
              transaction = new VersionedTransaction(newMessage);
              transaction.sign([keypair]);
              continue;
            } catch (blockhashError) {
              logger.error('pump', 'Failed to get fresh blockhash', {
                error: blockhashError.message,
                retriesLeft: retries
              });
            }
          }
        } else if (error.message?.includes('insufficient funds') ||
                   error.message?.includes('Attempt to debit') ||
                   error.message?.includes('insufficient lamports') ||
                   error.message?.includes('Insufficient funds')) {
          // 余额不足，不需要重试
          return {
            success: false,
            error: `余额不足: ${error.message}`
          };
        }

        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!signature && lastError) {
      throw lastError;
    }

    logger.info('pump', 'Transaction sent', {
      signature,
      solscan: `https://solscan.io/tx/${signature}`
    });

    return {
      signature,
      success: true,
      tokensReceived: Number(tokenAmount) / 1e6,
      actualPrice: amountInSOL / (Number(tokenAmount) / 1e6)
    };
  } catch (error) {
    logger.error('pump', 'Buy transaction failed', {
      error: error.message,
      tokenAddress,
      amount: amountInSOL
    });

    return {
      success: false,
      error: error.message
    };
  }
};

// 执行内盘卖出交易
export const executeSellTransaction = async (
  sdk: OnlinePumpSdk,
  connection: Connection,
  keypair: Keypair,
  tokenAddress: string,
  tokenAmount: number,
  config: TradeConfig,
  useCachedState: boolean = true
): Promise<{
  signature?: string;
  success: boolean;
  error?: string;
  gasUsed?: number;
  actualPrice?: number;
  solReceived?: number;
}> => {
  try {
    // 验证参数
    if (!tokenAddress || !tokenAmount || tokenAmount <= 0) {
      return { success: false, error: 'Invalid parameters: tokenAddress or tokenAmount' };
    }

    const validation = validatePumpTokenAddress(tokenAddress);
     if (!validation.isValid) {
       return { success: false, error: `Invalid token address: ${validation.error}` };
     }

    let mint: PublicKey;
    try {
      mint = new PublicKey(tokenAddress);
    } catch (error) {
      return {
        success: false,
        error: '无效的代币地址格式'
      };
    }

    const user = keypair.publicKey;

    // 首先检查用户的代币余额
    try {
      const tokenAccount = await connection.getTokenAccountsByOwner(user, { mint });
      
      if (tokenAccount.value.length === 0) {
        logger.warn('pump', 'No token account found for sell', {
          tokenAddress,
          user: user.toBase58()
        });
        return {
          success: false,
          error: '钱包没有该代币账户，无法执行卖出'
        };
      }

      // 获取代币余额
      const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccount.value[0].pubkey);
      const actualTokenBalance = parseFloat(tokenAccountInfo.value.amount) / Math.pow(10, tokenAccountInfo.value.decimals);
      
      logger.info('pump', 'Token balance check for sell', {
        tokenAddress,
        requestedAmount: tokenAmount,
        actualBalance: actualTokenBalance,
        user: user.toBase58()
      });

      // 检查余额是否足够
      if (actualTokenBalance < tokenAmount) {
        logger.warn('pump', 'Insufficient token balance for sell', {
          tokenAddress,
          requestedAmount: tokenAmount,
          actualBalance: actualTokenBalance,
          deficit: tokenAmount - actualTokenBalance
        });
        return {
          success: false,
          error: `代币余额不足: 需要 ${tokenAmount.toFixed(6)}，实际 ${actualTokenBalance.toFixed(6)}`
        };
      }

      // 如果余额为0或接近0，直接返回失败
      if (actualTokenBalance <= 0.000001) {
        logger.warn('pump', 'Token balance too low for sell', {
          tokenAddress,
          actualBalance: actualTokenBalance
        });
        return {
          success: false,
          error: '代币余额过低，无法执行卖出'
        };
      }

    } catch (balanceError) {
      logger.error('pump', 'Failed to check token balance for sell', {
        tokenAddress,
        error: balanceError.message,
        user: user.toBase58()
      });
      return {
        success: false,
        error: `无法获取代币余额: ${balanceError.message}`
      };
    }

    let bondingCurveAccountInfo;
    let bondingCurve;
    let global;

    // 检查缓存
    const cached = bondingCurveCache.get(tokenAddress);
    if (useCachedState && cached &&
        Date.now() - cached.timestamp < CACHE_DURATION) {
      logger.info('pump', 'Using cached bonding curve state for sell');
      bondingCurveAccountInfo = cached.bondingCurveAccountInfo;
      bondingCurve = cached.bondingCurve;
      global = cached.global;
    } else {
      // 获取全局状态
      global = await sdk.fetchGlobal();
      if (!global) {
        return {
          success: false,
          error: '无法获取全局状态'
        };
      }

      // 使用SDK的fetchSellState获取所有需要的状态
      try {
        const sellState = await sdk.fetchSellState(mint, user);
        bondingCurveAccountInfo = sellState.bondingCurveAccountInfo;
        bondingCurve = sellState.bondingCurve;

        // 更新缓存
        bondingCurveCache.set(tokenAddress, {
          tokenAddress,
          bondingCurveAccountInfo,
          bondingCurve,
          global,
          timestamp: Date.now()
        });
        logger.info('pump', 'Cached bonding curve state for sell');
      } catch (error) {
        logger.warn('pump', 'Failed to fetch sell state', {
          tokenAddress,
          error: error.message
        });
        return {
          success: false,
          error: '无法获取代币交易状态 - 代币可能已经毕业到Raydium或不存在于Pump.fun'
        };
      }
    }

    if (!bondingCurve) {
      return {
        success: false,
        error: '无法获取代币信息 - 代币不存在于Pump.fun'
      };
    }

    if (!bondingCurveAccountInfo) {
      return {
        success: false,
        error: '无法获取绑定曲线账户信息'
      };
    }

    // 转换代币数量（6位小数）
    const amount = new BN(Math.floor(tokenAmount * 1e6));

    // 计算预期获得的SOL数量
    const solAmount = getSellSolAmountFromTokenAmount(
      global,
      bondingCurve,
      amount
    );

    logger.info('pump', 'Calculated sell amounts', {
      tokenAmount: amount.toString(),
      expectedSol: solAmount.toString()
    });

    // 创建卖出指令 - 使用SDK的离线方法
    const offlineSDK = new PumpSdk();
    const instructions = await offlineSDK.sellInstructions({
      global,
      bondingCurveAccountInfo,
      bondingCurve,
      mint,
      user,
      amount,
      solAmount,
      slippage: config.slippage
    });

    // 创建交易 - 使用缓存或获取最新blockhash
    const { blockhash, lastValidBlockHeight } = await getBlockhash(connection);
    const message = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    let transaction = new VersionedTransaction(message);
    transaction.sign([keypair]);

    // 发送交易 - 优化重试机制
    let signature: string;
    let retries = 8; // 减少重试次数，避免过度重试
    let lastError: any;
    let retryDelay = 100; // 增加初始延迟

    logger.info('pump', 'Starting sell transaction execution', {
      tokenAddress,
      amount: tokenAmount,
      retries,
      user: user.toBase58()
    });

    while (retries > 0) {
      try {
        // 在每次重试前验证连接状态
        try {
          await connection.getLatestBlockhash('processed');
        } catch (connectionError) {
          logger.error('pump', 'RPC connection test failed', {
            error: connectionError.message,
            retriesLeft: retries
          });
          throw new Error(`RPC连接失败: ${connectionError.message}`);
        }

        // 优化交易发送参数
        signature = await connection.sendTransaction(transaction, {
          skipPreflight: true, // 跳过预检查，减少失败率
          preflightCommitment: 'processed',
          maxRetries: 0, // 禁用RPC层面的重试，由我们控制
          minContextSlot: undefined
        });

        // 成功发送，记录日志
        logger.success('pump', 'Sell transaction sent successfully', {
          signature,
          retryAttempt: 8 - retries + 1,
          solscan: `https://solscan.io/tx/${signature}`
        });
        break; // 成功发送，退出重试循环
      } catch (error) {
        lastError = error;
        retries--;

        logger.warn('pump', 'Sell transaction attempt failed', {
          error: error.message,
          retriesLeft: retries,
          attempt: 8 - retries + 1
        });

        // 处理不同类型的错误
        if (error.message?.includes('block height exceeded') ||
            error.message?.includes('Blockhash not found') ||
            error.message?.includes('blockhash not found')) {
          // blockhash过期，立即获取新的
          if (retries > 0) {
            logger.info('pump', 'Refreshing blockhash for sell transaction', { retriesLeft: retries });
            try {
              const { blockhash: newBlockhash } = await connection.getLatestBlockhash('processed');
              const newMessage = new TransactionMessage({
                payerKey: user,
                recentBlockhash: newBlockhash,
                instructions
              }).compileToV0Message();
              transaction = new VersionedTransaction(newMessage);
              transaction.sign([keypair]);
              // 不需要延迟，立即重试
              continue;
            } catch (blockhashError) {
              logger.error('pump', 'Failed to get fresh blockhash for sell', {
                error: blockhashError.message,
                retriesLeft: retries
              });
              // 继续到通用错误处理
            }
          }
        } else if (error.message?.includes('429') ||
                   error.message?.includes('Too many requests') ||
                   error.message?.includes('rate limit') ||
                   error.message?.includes('Rate limit')) {
          // 限流错误，需要等待更长时间
          if (retries > 0) {
            const waitTime = retryDelay * 5;
            logger.warn('pump', 'Rate limited on sell transaction', {
              retriesLeft: retries,
              waitTime
            });
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryDelay = Math.min(retryDelay * 2, 5000); // 指数退避，最多5秒
            continue;
          }
        } else if (error.message?.includes('insufficient funds') ||
                   error.message?.includes('Attempt to debit') ||
                   error.message?.includes('insufficient lamports') ||
                   error.message?.includes('Insufficient funds')) {
          // 余额不足，不需要重试
          logger.error('pump', 'Insufficient token balance for sell', { 
            error: error.message,
            tokenAddress,
            amount: tokenAmount,
            user: user.toBase58()
          });
          return {
            success: false,
            error: `代币余额不足: ${error.message}`
          };
        } else if (error.message?.includes('Transaction simulation failed')) {
          // 交易模拟失败，可能是代币状态问题
          logger.error('pump', 'Sell transaction simulation failed', {
            error: error.message,
            tokenAddress,
            amount: tokenAmount
          });
          
          if (retries > 0) {
            // 清除缓存并重新获取状态
            clearBondingCurveCache(tokenAddress);
            await new Promise(resolve => setTimeout(resolve, retryDelay * 2));
            retryDelay = Math.min(retryDelay * 1.5, 1000);
            continue;
          }
        } else if (error.message?.includes('failed to get recent blockhash') ||
                   error.message?.includes('RPC response error') ||
                   error.message?.includes('fetch')) {
          // RPC错误，尝试重试
          if (retries > 0) {
            logger.warn('pump', 'RPC error on sell transaction', {
              error: error.message,
              retriesLeft: retries,
              delay: retryDelay
            });

            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay = Math.min(retryDelay * 1.3, 2000); // 温和的退避
            continue;
          }
        } else {
          // 其他错误，短暂等待后重试
          if (retries > 0) {
            logger.warn('pump', 'Unknown error on sell transaction', {
              error: error.message,
              retriesLeft: retries,
              delay: retryDelay
            });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay = Math.min(retryDelay * 1.2, 1000);
            continue;
          }
        }

        // 如果没有更多重试，抛出错误
        if (retries === 0) {
          throw error;
        }
      }
    }

    if (!signature && lastError) {
      throw lastError;
    }

    logger.info('pump', 'Transaction sent', {
      signature,
      solscan: `https://solscan.io/tx/${signature}`
    });

    return {
      signature,
      success: true,
      solReceived: Number(solAmount) / 1e9,
      actualPrice: tokenAmount / (Number(solAmount) / 1e9)
    };
  } catch (error) {
    logger.error('pump', 'Sell transaction failed', {
      error: error.message,
      tokenAddress,
      amount: tokenAmount
    });

    return {
      success: false,
      error: error.message
    };
  }
};

// ============= 外盘交易 (Pump Swap SDK) =============

// 执行外盘买入（通过Pump Swap）- 暂时简化实现
export const executeExternalBuy = async (
  connection: Connection,
  keypair: Keypair,
  poolKey: string, // 外盘需要poolKey而不是tokenAddress
  amountInSOL: number,
  config: TradeConfig
): Promise<{
  signature?: string;
  success: boolean;
  error?: string;
  gasUsed?: number;
  actualPrice?: number;
  tokensReceived?: number;
}> => {
  try {
    // 外盘交易暂时不实现，专注于内盘交易
    logger.warn('pump', 'External trading not yet implemented', {
      poolKey,
      amountInSOL
    });

    return {
      success: false,
      error: '外盘交易功能尚未实现，请使用内盘交易'
    };
  } catch (error) {
    logger.error('pump', 'External buy failed', {
      error: error.message,
      poolKey,
      amount: amountInSOL
    });

    return {
      success: false,
      error: error.message
    };
  }
};

// 执行外盘卖出（通过Pump Swap）- 暂时简化实现
export const executeExternalSell = async (
  connection: Connection,
  keypair: Keypair,
  poolKey: string,
  tokenAmount: number,
  config: TradeConfig
): Promise<{
  signature?: string;
  success: boolean;
  error?: string;
  gasUsed?: number;
  actualPrice?: number;
  solReceived?: number;
}> => {
  try {
    // 外盘交易暂时不实现，专注于内盘交易
    logger.warn('pump', 'External trading not yet implemented', {
      poolKey,
      tokenAmount
    });

    return {
      success: false,
      error: '外盘交易功能尚未实现，请使用内盘交易'
    };
  } catch (error) {
    logger.error('pump', 'External sell failed', {
      error: error.message,
      poolKey,
      amount: tokenAmount
    });

    return {
      success: false,
      error: error.message
    };
  }
};

// ============= 通用接口 =============

// 执行买入（自动选择内盘/外盘）
export const executeBuy = async (
  sdk: OnlinePumpSdk,
  connection: Connection,
  keypair: Keypair,
  tokenAddress: string,
  amountInSOL: number,
  config: TradeConfig & { useExternal?: boolean; poolKey?: string }
): Promise<{
  signature?: string;
  success: boolean;
  error?: string;
  gasUsed?: number;
  actualPrice?: number;
  tokensReceived?: number;
  isExternal?: boolean;
}> => {
  try {
    const mint = new PublicKey(tokenAddress);
    const bondingCurve = await sdk.fetchBondingCurve(mint);

    // 如果代币已经migrate到Raydium，或者用户指定使用外盘
    if (bondingCurve?.complete || config.useExternal) {
      if (!config.poolKey) {
        return {
          success: false,
          error: '外盘交易需要提供poolKey'
        };
      }
      const result = await executeExternalBuy(
        connection,
        keypair,
        config.poolKey,
        amountInSOL,
        config
      );
      return { ...result, isExternal: true };
    }

    // 否则使用内盘
    const result = await executeBuyTransaction(
      sdk,
      connection,
      keypair,
      tokenAddress,
      amountInSOL,
      config
    );
    return { ...result, isExternal: false };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// 执行卖出（自动选择内盘/外盘）
export const executeSell = async (
  sdk: OnlinePumpSdk,
  connection: Connection,
  keypair: Keypair,
  tokenAddress: string,
  tokenAmount: number,
  config: TradeConfig & { useExternal?: boolean; poolKey?: string }
): Promise<{
  signature?: string;
  success: boolean;
  error?: string;
  gasUsed?: number;
  actualPrice?: number;
  solReceived?: number;
  isExternal?: boolean;
}> => {
  try {
    const mint = new PublicKey(tokenAddress);
    const bondingCurve = await sdk.fetchBondingCurve(mint);

    // 如果代币已经migrate到Raydium，或者用户指定使用外盘
    if (bondingCurve?.complete || config.useExternal) {
      if (!config.poolKey) {
        return {
          success: false,
          error: '外盘交易需要提供poolKey'
        };
      }
      const result = await executeExternalSell(
        connection,
        keypair,
        config.poolKey,
        tokenAmount,
        config
      );
      return { ...result, isExternal: true };
    }

    // 否则使用内盘
    const result = await executeSellTransaction(
      sdk,
      connection,
      keypair,
      tokenAddress,
      tokenAmount,
      config
    );
    return { ...result, isExternal: false };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// ============= 辅助功能 =============

// 计算价格影响（内盘）
export const calculatePriceImpact = async (
  sdk: OnlinePumpSdk,
  tokenAddress: string,
  amountInSOL: number,
  isBuy: boolean = true
): Promise<{
  priceImpact?: number;
  slippageEstimate?: number;
  tokensExpected?: number;
  success: boolean;
  error?: string;
}> => {
  try {
    const tokenMint = new PublicKey(tokenAddress);

    // 获取全局状态和绑定曲线
    const global = await sdk.fetchGlobal();
    const bondingCurve = await sdk.fetchBondingCurve(tokenMint);

    if (!bondingCurve) {
      return {
        success: false,
        error: 'Unable to get bonding curve'
      };
    }

    // 计算小额交易的基准价格
    const smallSolAmount = new BN(Math.floor(0.01 * 1e9));
    const smallTokenAmount = getBuyTokenAmountFromSolAmount(
      global,
      bondingCurve,
      smallSolAmount
    );
    const smallPrice = 0.01 / (Number(smallTokenAmount) / 1e6);

    // 计算大额交易的价格
    const largeSolAmount = new BN(Math.floor(amountInSOL * 1e9));
    const largeTokenAmount = getBuyTokenAmountFromSolAmount(
      global,
      bondingCurve,
      largeSolAmount
    );
    const largePrice = amountInSOL / (Number(largeTokenAmount) / 1e6);

    // 计算价格影响
    const priceImpact = ((largePrice - smallPrice) / smallPrice) * 100;

    // 估算建议滑点
    const slippageEstimate = Math.max(0.5, Math.min(Math.abs(priceImpact) * 1.5, 10));

    return {
      priceImpact: Math.round(priceImpact * 100) / 100,
      slippageEstimate: Math.round(slippageEstimate * 100) / 100,
      tokensExpected: Number(largeTokenAmount) / 1e6,
      success: true
    };
  } catch (error) {
    logger.error('pump', 'Failed to calculate price impact', {
      error: error.message,
      tokenAddress,
      amountInSOL
    });

    return {
      success: false,
      error: error.message
    };
  }
};

// 检查代币是否可交易
export const checkTokenTradability = async (
  sdk: OnlinePumpSdk,
  tokenAddress: string
): Promise<{
  isTradable: boolean;
  isInternal: boolean; // 是否在内盘
  isExternal: boolean; // 是否在外盘
  bondingCurve?: any;
  success: boolean;
  error?: string;
}> => {
  try {
    const mint = new PublicKey(tokenAddress);
    const bondingCurve = await sdk.fetchBondingCurve(mint);

    if (!bondingCurve) {
      return {
        isTradable: false,
        isInternal: false,
        isExternal: false,
        success: true
      };
    }

    // 检查是否已经迁移到外盘
    const isExternal = bondingCurve.complete;
    const isInternal = !isExternal;

    return {
      isTradable: true,
      isInternal,
      isExternal,
      bondingCurve,
      success: true
    };
  } catch (error) {
    logger.error('pump', 'Failed to check token tradability', {
      error: error.message,
      tokenAddress
    });

    return {
      isTradable: false,
      isInternal: false,
      isExternal: false,
      success: false,
      error: error.message
    };
  }
};

// 验证代币地址格式
export const validatePumpTokenAddress = (tokenAddress: string): { isValid: boolean; error?: string } => {
  if (!tokenAddress || typeof tokenAddress !== 'string') {
    return { isValid: false, error: '代币地址不能为空' };
  }

  if (tokenAddress.length < 43 || tokenAddress.length > 44) {
    return { isValid: false, error: `代币地址长度应为43-44字符，当前为${tokenAddress.length}字符` };
  }

  try {
    new PublicKey(tokenAddress);
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: '无效的代币地址格式' };
  }
};