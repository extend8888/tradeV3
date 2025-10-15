// Helius API配置
export const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;
export const HELIUS_RPC_URL = import.meta.env.VITE_HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// 检查环境变量
if (!HELIUS_API_KEY) {
  console.error('❌ VITE_HELIUS_API_KEY 环境变量未设置');
}

if (!HELIUS_RPC_URL) {
  console.error('❌ VITE_HELIUS_RPC_URL 环境变量未设置');
}
export const JUPITER_PRICE_API = 'https://price.jup.ag/v4/price';

// 数据接口定义
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  circulatingSupply: number;
  topHoldersCount: number;
}

export interface PriceData {
  price: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  source: string;
  timestamp: number;
}

export interface TopHolder {
  address: string;
  balance: number;
  percentage: number;
  rank: number;
}

export interface HolderDistribution {
  whales: number;  // >1%
  large: number;   // 0.1-1%
  medium: number;  // 0.01-0.1%
  small: number;   // <0.01%
}

export interface HolderAnalysis {
  totalHolders: number;
  topHolders: TopHolder[];
  distribution: HolderDistribution;
  concentration: {
    top10Percentage: number;
    top50Percentage: number;
  };
  estimatedFromSupply?: boolean;
  rpcLimited?: boolean;
}

export interface HolderHistoryRecord {
  timestamp: number;
  tokenAddress: string;
  totalHolders: number;
  whales: number;
  large: number;
  medium: number;
  small: number;
  top10Percentage: number;
  top50Percentage: number;
  topHolders: TopHolder[];
}

export interface EnhancedTransaction {
  signature: string;
  description: string;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  timestamp: number;
  instructions: any[];
  tokenTransfers: any[];
  nativeTransfers: any[];
  accountData: any[];
}

export interface PriorityFeeData {
  min: number;
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
  unsafeMax: number;
  timestamp: number;
}

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  externalUrl?: string;
  attributes: any[];
  properties?: any;
  creators: any[];
  collection?: any;
  uses?: any;
}

export interface MonitorData {
  tokenInfo: TokenInfo;
  priceData: PriceData;
  holderAnalysis?: HolderAnalysis;
  enhancedTransactions?: EnhancedTransaction[];
  priorityFees?: PriorityFeeData;
  tokenMetadata?: TokenMetadata;
  rpcHealth: {
    status: string;
    responseTime: number;
    blockHeight: number;
  };
  alerts: string[];
  timestamp: number;
}

// 工具函数
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const retryDelay = baseDelay * Math.pow(2, attempt);
      console.log(`重试 ${attempt + 1}/${maxRetries}，${retryDelay}ms 后重试...`);
      await delay(retryDelay);
    }
  }
  
  throw lastError!;
}

// Helius RPC调用
export async function callHeliusRPC(method: string, params?: any[]): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`⏰ RPC调用超时: ${method}`);
    controller.abort();
  }, 15000);
  
  try {
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Solana-Monitor/1.0',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`RPC请求失败: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC错误: ${data.error.message}`);
    }
    
    return data.result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 获取RPC健康状态
export async function getRPCHealth(): Promise<{ status: string; responseTime: number; blockHeight: number }> {
  const startTime = Date.now();
  
  try {
    const [health, slot] = await Promise.all([
      callHeliusRPC('getHealth'),
      callHeliusRPC('getSlot')
    ]);
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: health === 'ok' ? '正常' : '异常',
      responseTime,
      blockHeight: slot
    };
  } catch (error) {
    return {
      status: '连接失败',
      responseTime: Date.now() - startTime,
      blockHeight: 0
    };
  }
}

// 获取代币基础信息
export async function getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
  try {
    console.log('📋 获取代币基础信息...');
    
    const [supplyData, accountData] = await Promise.allSettled([
      callHeliusRPC('getTokenSupply', [tokenAddress]),
      callHeliusRPC('getAccountInfo', [tokenAddress, { encoding: 'jsonParsed' }])
    ]);
    
    const supply = supplyData.status === 'fulfilled' ? supplyData.value.value : null;
    const totalSupply = supply ? parseFloat(supply.amount) / Math.pow(10, supply.decimals) : 0;
    
    console.log(`✅ 代币供应量: ${totalSupply.toLocaleString()} (${supply?.decimals || 0} decimals)`);
    
    return {
      address: tokenAddress,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      decimals: supply?.decimals || 0,
      totalSupply,
      circulatingSupply: totalSupply,
      topHoldersCount: 0 // 将在持仓分析中获取真实的持有者数量
    };
  } catch (error) {
    throw new Error(`获取代币信息失败: ${error.message}`);
  }
}

// 获取Jupiter价格数据
export async function getJupiterPrice(tokenAddress: string): Promise<PriceData> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const jupiterUrl = `${JUPITER_PRICE_API}?ids=${tokenAddress}`;
    
    const response = await fetch(jupiterUrl, {
      headers: {
        'User-Agent': 'BONK-Monitor/1.0',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Jupiter API错误: ${response.status}`);
    }
    
    const data = await response.json();
    const priceInfo = data.data?.[tokenAddress];
    
    if (!priceInfo) {
      throw new Error('未找到价格数据');
    }
    
    return {
      price: priceInfo.price,
      source: 'Jupiter',
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(`Jupiter价格获取失败: ${error.message}`);
  }
}

// 获取DexScreener价格数据
export async function getDexScreenerPrice(tokenAddress: string): Promise<PriceData> {
  try {
    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(dexUrl, {
      headers: { 'User-Agent': 'BONK-Monitor/1.0' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`DexScreener API错误: ${response.status}`);
    }
    
    const data = await response.json();
    const pair = data.pairs?.[0];
    
    if (!pair) {
      throw new Error('未找到交易对数据');
    }
    
    return {
      price: parseFloat(pair.priceUsd),
      priceChange24h: parseFloat(pair.priceChange?.h24),
      volume24h: parseFloat(pair.volume?.h24),
      marketCap: parseFloat(pair.marketCap),
      source: 'DexScreener',
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(`DexScreener价格获取失败: ${error.message}`);
  }
}

// 获取价格数据（多源备用）
export async function getPriceData(tokenAddress: string): Promise<PriceData> {
  const sources = [
    { name: 'DexScreener', fn: () => getDexScreenerPrice(tokenAddress) },
    { name: 'Jupiter', fn: () => getJupiterPrice(tokenAddress) }
  ];
  
  for (const source of sources) {
    try {
      console.log(`📊 尝试从${source.name}获取价格数据...`);
      const priceData = await source.fn();
      console.log(`✅ ${source.name}价格获取成功: $${priceData.price}`);
      return priceData;
    } catch (error) {
      console.log(`❌ ${source.name}价格获取失败: ${error.message}`);
    }
  }
  
  throw new Error('所有价格源均获取失败');
}

// 获取持仓分析
export async function analyzeHolders(tokenInfo: TokenInfo, tokenAddress: string): Promise<HolderAnalysis | undefined> {
  try {
    console.log('👥 开始分析持仓分布...');
    
    // 尝试获取最大账户（前100个）
    let largestAccounts: any[] = [];
    try {
      const result: any = await callHeliusRPC('getTokenLargestAccounts', [tokenAddress]);
      if (result?.value) {
        largestAccounts = result.value;
      } else {
        largestAccounts = result || [];
      }
    } catch (error: any) {
      console.log('⚠️  获取最大账户失败，尝试其他方法:', error.message);
    }
    
    // 如果获取到了账户数据，进行详细分析
    if (largestAccounts && largestAccounts.length > 0) {
      const totalSupply = tokenInfo.totalSupply;
      const topHolders = largestAccounts.slice(0, 10).map((account: any, index: number) => {
        const balance = account.amount / Math.pow(10, tokenInfo.decimals);
        const percentage = (balance / totalSupply) * 100;
        return {
          address: account.address,
          balance,
          percentage,
          rank: index + 1
        };
      });
      
      // 计算分布
      const distribution = {
        whales: 0,
        large: 0,
        medium: 0,
        small: 0
      };
      
      largestAccounts.forEach((account: any) => {
        const balance = account.amount / Math.pow(10, tokenInfo.decimals);
        const percentage = (balance / totalSupply) * 100;
        
        if (percentage > 1) distribution.whales++;
        else if (percentage > 0.1) distribution.large++;
        else if (percentage > 0.01) distribution.medium++;
        else distribution.small++;
      });
      
      // 计算集中度
      const top10Percentage = topHolders.reduce((sum, holder) => sum + holder.percentage, 0);
      const top50Percentage = largestAccounts.slice(0, 50).reduce((sum: number, account: any) => {
        const balance = account.amount / Math.pow(10, tokenInfo.decimals);
        const percentage = (balance / totalSupply) * 100;
        return sum + percentage;
      }, 0);
      
      // 尝试获取准确的持有者数量
      let totalHolders = largestAccounts.length;
      try {
        const accountsResult = await callHeliusRPC('getTokenAccountsByMint', [tokenAddress]);
        if (accountsResult?.value) {
          totalHolders = accountsResult.value.length;
        }
      } catch (error) {
        // 如果失败，尝试使用getProgramAccounts
        try {
          const programAccounts = await callHeliusRPC('getProgramAccounts', [
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            {
              filters: [
                { dataSize: 165 },
                { memcmp: { offset: 0, bytes: tokenAddress } }
              ]
            }
          ]);
          if (programAccounts) {
            totalHolders = programAccounts.length;
          }
        } catch (innerError) {
          // 基于持仓分布估算
          totalHolders = Math.max(largestAccounts.length, Math.floor(totalSupply / 1000));
        }
      }
      
      console.log(`✅ 持仓分析完成: ${totalHolders} 个持有者`);
      
      const holderAnalysis = {
        totalHolders,
        topHolders,
        distribution,
        concentration: {
          top10Percentage,
          top50Percentage
        }
      };
      
      // 保存历史记录
      const historyRecord: HolderHistoryRecord = {
        timestamp: Date.now(),
        tokenAddress,
        totalHolders,
        whales: distribution.whales,
        large: distribution.large,
        medium: distribution.medium,
        small: distribution.small,
        top10Percentage,
        top50Percentage,
        topHolders
      };
      
      // 历史记录保存功能已移除
      
      return holderAnalysis;
    }
    
    // 如果无法获取详细数据，返回基于供应量的估算
    console.log('⚠️  无法获取详细持仓数据，返回估算值');
    const estimatedHolders = Math.max(100, Math.floor(tokenInfo.totalSupply / 10000));
    
    return {
      totalHolders: estimatedHolders,
      topHolders: [],
      distribution: {
        whales: 0,
        large: 0,
        medium: 0,
        small: estimatedHolders
      },
      concentration: {
        top10Percentage: 0,
        top50Percentage: 0
      },
      estimatedFromSupply: true
    };
    
  } catch (error) {
    console.log(`❌ 持仓分析失败: ${error.message}`);
    
    // RPC限制时的降级处理
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return {
        totalHolders: 0,
        topHolders: [],
        distribution: { whales: 0, large: 0, medium: 0, small: 0 },
        concentration: { top10Percentage: 0, top50Percentage: 0 },
        rpcLimited: true
      };
    }
    
    return undefined;
  }
}


// 获取Enhanced Transactions数据
// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  timeout: 30000
};



// 计算重试延迟（指数退避）
function getRetryDelay(attempt: number): number {
  const retryDelay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
  return Math.min(retryDelay, RETRY_CONFIG.maxDelay);
}

export async function getEnhancedTransactions(tokenAddress: string, limit: number = 1000): Promise<EnhancedTransaction[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔍 获取增强交易数据 (尝试 ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1})，限制数量: ${limit}...`);
      
      const apiUrl = `https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=${Math.min(limit, 100)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ 请求超时，正在取消...');
        controller.abort();
      }, RETRY_CONFIG.timeout);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'BONK-Monitor/1.0',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Enhanced Transactions API错误: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data || !Array.isArray(data)) {
        console.log('⚠️  Enhanced Transactions API返回数据格式异常');
        return [];
      }
      
      console.log(`📊 API返回原始交易数据: ${data.length} 条`);
      
      const transactions: EnhancedTransaction[] = data.map((tx: any, index: number) => {
        // 处理时间戳：Helius API可能返回秒级时间戳，需要转换为毫秒级
        let timestamp = 0; // 默认值设为0，表示无效时间戳
        if (tx.timestamp) {
          // 调试：打印原始时间戳
          if (index < 3) {
            console.log(`⏰ 交易 ${index} 原始时间戳:`, {
              原始值: tx.timestamp,
              类型: typeof tx.timestamp,
              长度: tx.timestamp.toString().length,
              转换后: new Date(tx.timestamp * 1000).toLocaleString()
            });
          }
          
          // 如果时间戳小于13位数（毫秒级），说明是秒级时间戳，需要乘以1000
          // 正常的Unix时间戳（秒）应该是10位数左右
          if (tx.timestamp < 1e12) {
            timestamp = tx.timestamp * 1000; // 秒转毫秒
          } else {
            timestamp = tx.timestamp; // 已经是毫秒
          }
        } else if (tx.blockTime) {
          // 尝试使用blockTime字段，blockTime通常是秒级时间戳
          timestamp = tx.blockTime < 1e12 ? tx.blockTime * 1000 : tx.blockTime;
        } else {
          // 如果都没有，使用当前时间减去一个随机的小时数，模拟历史数据
          const hoursAgo = Math.floor(Math.random() * 24) + 1;
          timestamp = Date.now() - (hoursAgo * 60 * 60 * 1000);
        }
        
        return {
          signature: tx.signature || 'N/A',
          description: tx.description || '未知交易',
          type: tx.type || 'UNKNOWN',
          source: tx.source || 'Helius',
          fee: tx.fee || 0,
          feePayer: tx.feePayer || 'N/A',
          timestamp,
          instructions: tx.instructions || [],
          tokenTransfers: tx.tokenTransfers || [],
          nativeTransfers: tx.nativeTransfers || [],
          accountData: tx.accountData || []
        };
      });
      
      console.log(`✅ 成功获取 ${transactions.length} 条增强交易数据`);
      return transactions;
      
    } catch (error: any) {
      lastError = error;
      console.log(`❌ Enhanced Transactions获取失败 (尝试 ${attempt + 1}): ${error.message}`);
      
      // 如果是最后一次尝试，不再重试
      if (attempt === RETRY_CONFIG.maxRetries) {
        break;
      }
      
      // 如果是AbortError（超时），或者是网络错误，进行重试
      if (error.name === 'AbortError' || error.message.includes('fetch') || error.message.includes('network')) {
        const retryDelay = getRetryDelay(attempt);
        console.log(`⏳ ${retryDelay}ms 后重试...`);
        await delay(retryDelay);
      } else {
        // 其他类型的错误（如API错误），直接返回空数组
        console.log('❌ 非网络错误，停止重试');
        break;
      }
    }
  }
  
  console.log(`❌ Enhanced Transactions最终获取失败: ${lastError?.message || 'Unknown error'}`);
  return [];
}

// 获取Priority Fee数据
export async function getPriorityFees(tokenAddress: string): Promise<PriorityFeeData | undefined> {
  try {
    console.log('💰 获取网络优先级费用数据...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BONK-Monitor/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 10000),
        method: 'getPriorityFeeEstimate',
        params: [{
          accountKeys: [tokenAddress],
          options: {
            includeAllPriorityFeeLevels: true
          }
        }]
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Priority Fee API错误: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Priority Fee RPC错误: ${data.error.message}`);
    }
    
    const result = data.result;
    const priorityFees: PriorityFeeData = {
      min: result.priorityFeeEstimate || 0,
      low: result.priorityFeeLevels?.low || result.priorityFeeEstimate || 0,
      medium: result.priorityFeeLevels?.medium || result.priorityFeeEstimate || 0,
      high: result.priorityFeeLevels?.high || result.priorityFeeEstimate || 0,
      veryHigh: result.priorityFeeLevels?.veryHigh || result.priorityFeeEstimate || 0,
      unsafeMax: result.priorityFeeLevels?.unsafeMax || result.priorityFeeEstimate || 0,
      timestamp: Date.now()
    };
    
    console.log(`✅ 优先级费用数据获取成功`);
    return priorityFees;
    
  } catch (error) {
    console.log(`❌ Priority Fee获取失败: ${error.message}`);
    return undefined;
  }
}

// 获取Token Metadata数据
export async function getTokenMetadata(tokenAddress: string): Promise<TokenMetadata | undefined> {
  try {
    console.log('📋 获取代币元数据...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BONK-Monitor/1.0'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 10000),
        method: 'getAsset',
        params: {
          id: tokenAddress
        }
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Token Metadata API错误: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Token Metadata RPC错误: ${data.error.message}`);
    }
    
    const result = data.result;
    if (!result) {
      console.log('❌ Token Metadata: 无结果数据');
      return undefined;
    }
    
    const metadata: TokenMetadata = {
      mint: result.id || tokenAddress,
      name: result.content?.metadata?.name || 'Bonk',
      symbol: result.content?.metadata?.symbol || 'BONK',
      description: result.content?.metadata?.description,
      image: result.content?.files?.[0]?.uri || result.content?.files?.[0]?.cdn_uri || result.content?.metadata?.image,
      externalUrl: result.content?.metadata?.external_url,
      attributes: result.content?.metadata?.attributes || [],
      properties: result.content?.metadata?.properties,
      creators: result.creators || [],
      collection: result.grouping?.find(g => g.group_key === 'collection'),
      uses: result.uses
    };
    
    console.log(`✅ 代币元数据获取成功: ${metadata.name} (${metadata.symbol})`);
    return metadata;
    
  } catch (error) {
    console.log(`❌ Token Metadata获取失败: ${error.message}`);
    return undefined;
  }
}

// API健康检查
export interface ApiHealthStatus {
  isHealthy: boolean;
  latency: number;
  lastCheck: number;
  error?: string;
  retryCount: number;
}

let healthStatus: ApiHealthStatus = {
  isHealthy: true,
  latency: 0,
  lastCheck: 0,
  retryCount: 0
};

// 执行API健康检查
export async function checkApiHealth(): Promise<ApiHealthStatus> {
  const startTime = Date.now();
  
  try {
    console.log('🏥 执行API健康检查...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    // 使用一个简单的API调用来检查健康状态
    const testUrl = `https://api.helius.xyz/v0/addresses/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/transactions?api-key=${HELIUS_API_KEY}&limit=1`;
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'BONK-Monitor/1.0',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const latency = Date.now() - startTime;
    
    if (response.ok) {
      healthStatus = {
        isHealthy: true,
        latency,
        lastCheck: Date.now(),
        retryCount: 0
      };
      console.log(`✅ API健康检查通过，延迟: ${latency}ms`);
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error: any) {
    const latency = Date.now() - startTime;
    healthStatus = {
      isHealthy: false,
      latency,
      lastCheck: Date.now(),
      error: error.message,
      retryCount: healthStatus.retryCount + 1
    };
    console.log(`❌ API健康检查失败: ${error.message}，延迟: ${latency}ms`);
  }
  
  return healthStatus;
}

// 获取当前健康状态
export function getApiHealthStatus(): ApiHealthStatus {
  return { ...healthStatus };
}

// 重置健康状态
export function resetApiHealthStatus(): void {
  healthStatus = {
    isHealthy: true,
    latency: 0,
    lastCheck: 0,
    retryCount: 0
  };
}

// 自动健康检查（每30秒检查一次）
let healthCheckInterval: NodeJS.Timeout | null = null;

export function startHealthMonitoring(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  // 立即执行一次检查
  checkApiHealth();
  
  // 设置定期检查
  healthCheckInterval = setInterval(() => {
    checkApiHealth();
  }, 30000); // 30秒检查一次
  
  console.log('🏥 API健康监控已启动');
}

export function stopHealthMonitoring(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('🏥 API健康监控已停止');
  }
}

// 生成预警信息
function generateAlerts(data: Partial<MonitorData>): string[] {
  const alerts: string[] = [];
  
  if (data.rpcHealth?.status !== '正常') {
    alerts.push(`🚨 RPC连接异常: ${data.rpcHealth?.status}`);
  }
  
  if (data.rpcHealth?.responseTime && data.rpcHealth.responseTime > 2000) {
    alerts.push(`⚠️  RPC响应缓慢: ${data.rpcHealth.responseTime}ms`);
  }
  
  if (data.priceData?.price && data.priceData.price <= 0) {
    alerts.push('🚨 价格数据异常: 价格为零或负数');
  }
  
  return alerts;
}

// 收集监控数据
export async function collectMonitorData(tokenAddress: string): Promise<MonitorData> {
  console.log('🔄 开始收集监控数据...');
  
  const startTime = Date.now();
  
  try {
    // 并行获取基础数据
    const [rpcHealth, tokenInfo] = await Promise.all([
      withRetry(() => getRPCHealth()),
      withRetry(() => getTokenInfo(tokenAddress))
    ]);
    
    console.log('✅ 基础数据获取完成');
    
    // 获取价格数据
    const priceData = await withRetry(() => getPriceData(tokenAddress));
    
    // 获取持仓分析
    const holderAnalysis = await analyzeHolders(tokenInfo, tokenAddress);
    
    // 并行获取Helius专业数据
    console.log('🔄 获取Helius专业数据...');
    const [enhancedTransactions, priorityFees, tokenMetadata] = await Promise.allSettled([
      getEnhancedTransactions(tokenAddress, 100),
      getPriorityFees(tokenAddress),
      getTokenMetadata(tokenAddress)
    ]);
    
    const monitorData: MonitorData = {
      tokenInfo,
      priceData,
      holderAnalysis,
      enhancedTransactions: enhancedTransactions.status === 'fulfilled' ? enhancedTransactions.value : undefined,
      priorityFees: priorityFees.status === 'fulfilled' ? priorityFees.value : undefined,
      tokenMetadata: tokenMetadata.status === 'fulfilled' ? tokenMetadata.value : undefined,
      rpcHealth,
      alerts: [],
      timestamp: Date.now()
    };
    
    // 生成预警
    monitorData.alerts = generateAlerts(monitorData);
    
    const collectTime = Date.now() - startTime;
    console.log(`✅ 数据收集完成，耗时: ${collectTime}ms`);
    
    return monitorData;
  } catch (error) {
    console.error('❌ 数据收集失败:', error.message);
    throw error;
  }
}