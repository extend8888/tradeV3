import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { Wallet, RPCNode } from '@/types';
import { logger } from '@/stores/logStore';

/**
 * Solana 区块链相关工具函数
 */

// 验证 Solana 地址格式
export const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

// 验证私钥格式
export const isValidPrivateKey = (privateKey: string): boolean => {
  try {
    // 支持多种私钥格式
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
      // 数组格式: [1,2,3,...]
      const keyArray = JSON.parse(privateKey);
      if (Array.isArray(keyArray) && keyArray.length === 64) {
        Keypair.fromSecretKey(new Uint8Array(keyArray));
        return true;
      }
    } else if (privateKey.length === 128) {
      // Hex 格式
      const keyArray = privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
      if (keyArray && keyArray.length === 64) {
        Keypair.fromSecretKey(new Uint8Array(keyArray));
        return true;
      }
    } else {
      // 尝试 Base58 格式（Solana 标准格式）
      try {
        const decoded = bs58.decode(privateKey);
        if (decoded.length === 64) {
          Keypair.fromSecretKey(decoded);
          return true;
        }
      } catch {}
      
      // 尝试 Base64 格式
      try {
        const decoded = Buffer.from(privateKey, 'base64');
        if (decoded.length === 64) {
          Keypair.fromSecretKey(decoded);
          return true;
        }
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
};

// 从私钥创建 Keypair
export const createKeypairFromPrivateKey = (privateKey: string): Keypair | null => {
  try {
    // 处理逗号分隔的数字格式
    if (privateKey.includes(',') && !privateKey.startsWith('[')) {
      const keyArray = privateKey.split(',').map(s => parseInt(s.trim()));
      if (keyArray.length === 64 && keyArray.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
        return Keypair.fromSecretKey(new Uint8Array(keyArray));
      }
    }
    
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
      // 数组格式
      const keyArray = JSON.parse(privateKey);
      if (Array.isArray(keyArray) && keyArray.length === 64) {
        return Keypair.fromSecretKey(new Uint8Array(keyArray));
      }
    } else if (privateKey.length === 128) {
      // Hex 格式
      const keyArray = privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
      if (keyArray && keyArray.length === 64) {
        return Keypair.fromSecretKey(new Uint8Array(keyArray));
      }
    } else {
      // 尝试 Base58 格式（Solana 标准格式）
      try {
        const decoded = bs58.decode(privateKey);
        if (decoded.length === 64) {
          return Keypair.fromSecretKey(decoded);
        }
      } catch {}
      
      // 尝试 Base64 格式
      try {
        const decoded = Buffer.from(privateKey, 'base64');
        if (decoded.length === 64) {
          return Keypair.fromSecretKey(decoded);
        }
      } catch {}
    }
    return null;
  } catch (error) {
    logger.error('solana', '从私钥创建密钥对失败', { error: error.message });
    return null;
  }
};

// 测试 RPC 连接
export const testRPCConnection = async (rpcUrl: string): Promise<{
  success: boolean;
  latency: number;
  blockHeight?: number;
  error?: string;
}> => {
  const startTime = Date.now();
  
  try {
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: null // 禁用WebSocket
    });
    const blockHeight = await connection.getBlockHeight();
    const latency = Date.now() - startTime;
    
    return {
      success: true,
      latency,
      blockHeight
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      latency,
      error: error.message
    };
  }
};

// 批量测试 RPC 连接
export const testMultipleRPCs = async (rpcNodes: RPCNode[]): Promise<{
  [nodeId: string]: {
    success: boolean;
    latency: number;
    blockHeight?: number;
    error?: string;
  }
}> => {
  const results: { [nodeId: string]: any } = {};
  
  const promises = rpcNodes.map(async (node) => {
    const result = await testRPCConnection(node.url);
    results[node.id] = result;
  });
  
  await Promise.all(promises);
  return results;
};

// 获取单个钱包余额
export const getWalletBalance = async (
  connection: Connection,
  publicKey: string
): Promise<{
  sol: number;
  lamports: number;
  error?: string;
}> => {
  try {
    const pubKey = new PublicKey(publicKey);
    const lamports = await connection.getBalance(pubKey);
    const sol = lamports / LAMPORTS_PER_SOL;
    
    return {
      sol: Math.round(sol * 1000000) / 1000000, // 保留6位小数
      lamports
    };
  } catch (error) {
    return {
      sol: 0,
      lamports: 0,
      error: error.message
    };
  }
};

// 批量获取钱包余额
export const getBatchWalletBalances = async (
  connection: Connection,
  wallets: Wallet[],
  batchSize: number = 100
): Promise<{
  [walletId: string]: {
    sol: number;
    lamports: number;
    error?: string;
  }
}> => {
  const results: { [walletId: string]: any } = {};
  
  // 分批处理，避免请求过多
  for (let i = 0; i < wallets.length; i += batchSize) {
    const batch = wallets.slice(i, i + batchSize);
    
    const promises = batch.map(async (wallet) => {
      const result = await getWalletBalance(connection, wallet.address);
      results[wallet.id] = result;
    });
    
    await Promise.all(promises);
    
    // 添加延迟，避免请求过于频繁
    if (i + batchSize < wallets.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
};

// 获取代币账户余额
export const getTokenBalance = async (
  connection: Connection,
  walletPublicKey: string,
  tokenMintAddress: string
): Promise<{
  balance: number;
  decimals: number;
  error?: string;
}> => {
  try {
    const walletPubKey = new PublicKey(walletPublicKey);
    const tokenMintPubKey = new PublicKey(tokenMintAddress);
    
    // 获取代币账户
    const tokenAccounts = await connection.getTokenAccountsByOwner(walletPubKey, {
      mint: tokenMintPubKey
    });
    
    if (tokenAccounts.value.length === 0) {
      return {
        balance: 0,
        decimals: 0
      };
    }
    
    // 获取第一个代币账户的余额
    const tokenAccount = tokenAccounts.value[0];
    const accountInfo = await connection.getTokenAccountBalance(tokenAccount.pubkey);
    
    return {
      balance: parseFloat(accountInfo.value.amount),
      decimals: accountInfo.value.decimals
    };
  } catch (error) {
    return {
      balance: 0,
      decimals: 0,
      error: error.message
    };
  }
};

// 批量获取代币余额
export const getBatchTokenBalances = async (
  connection: Connection,
  wallets: Wallet[],
  tokenMintAddress: string,
  batchSize: number = 50
): Promise<{
  [walletId: string]: {
    balance: number;
    decimals: number;
    error?: string;
  }
}> => {
  const results: { [walletId: string]: any } = {};
  
  for (let i = 0; i < wallets.length; i += batchSize) {
    const batch = wallets.slice(i, i + batchSize);
    
    const promises = batch.map(async (wallet) => {
      const result = await getTokenBalance(connection, wallet.address, tokenMintAddress);
      results[wallet.id] = result;
    });
    
    await Promise.all(promises);
    
    if (i + batchSize < wallets.length) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  
  return results;
};

// 估算交易费用
export const estimateTransactionFee = async (
  connection: Connection,
  transaction: Transaction
): Promise<{
  fee: number;
  feeInSOL: number;
  error?: string;
}> => {
  try {
    const feeCalculator = await connection.getRecentBlockhash();
    transaction.recentBlockhash = feeCalculator.blockhash;
    
    const fee = await connection.getFeeForMessage(
      transaction.compileMessage(),
      'confirmed'
    );
    
    if (fee.value === null) {
      throw new Error('Unable to calculate transaction fee');
    }
    
    return {
      fee: fee.value,
      feeInSOL: fee.value / LAMPORTS_PER_SOL
    };
  } catch (error) {
    return {
      fee: 0,
      feeInSOL: 0,
      error: error.message
    };
  }
};

// 发送并确认交易
export const sendAndConfirmTransaction = async (
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  maxRetries: number = 3
): Promise<{
  signature?: string;
  success: boolean;
  error?: string;
}> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 获取最新的 blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      
      // 签名交易
      transaction.sign(...signers);
      
      // 发送交易
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        }
      );
      
      // 确认交易
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
      });
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      return {
        signature,
        success: true
      };
    } catch (error) {
      lastError = error;
      logger.warn('solana', `Transaction attempt ${attempt + 1} failed`, { error: error.message });
      
      // 如果不是最后一次尝试，等待一段时间再重试
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  return {
    success: false,
    error: lastError?.message || 'Transaction failed after all retries'
  };
};

// 创建转账交易
export const createTransferTransaction = async (
  connection: Connection,
  fromKeypair: Keypair,
  toPublicKey: string,
  amountInSOL: number
): Promise<{
  transaction?: Transaction;
  success: boolean;
  error?: string;
}> => {
  try {
    const toPubKey = new PublicKey(toPublicKey);
    const lamports = Math.floor(amountInSOL * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPubKey,
        lamports
      })
    );
    
    return {
      transaction,
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// 格式化 SOL 数量显示
export const formatSOL = (lamports: number, decimals: number = 6): string => {
  const sol = lamports / LAMPORTS_PER_SOL;
  return sol.toFixed(decimals);
};

// 格式化代币数量显示
export const formatTokenAmount = (amount: number, decimals: number, displayDecimals: number = 6): string => {
  const actualAmount = amount / Math.pow(10, decimals);
  return actualAmount.toFixed(displayDecimals);
};

export const formatLamports = (sol: number): number => {
  return Math.floor(sol * LAMPORTS_PER_SOL);
};

// 验证代币地址格式和有效性
export const validateTokenAddress = (address: string): {
  isValid: boolean;
  error?: string;
  publicKey?: PublicKey;
} => {
  if (!address) {
    return {
      isValid: false,
      error: '代币地址不能为空'
    };
  }

  // 检查长度（Solana地址通常是43-44个字符）
  if (address.length < 43 || address.length > 44) {
    return {
      isValid: false,
      error: `代币地址长度错误，应为43-44个字符，当前为${address.length}个字符`
    };
  }

  // 检查是否只包含Base58字符
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return {
      isValid: false,
      error: '代币地址包含无效字符，只能包含Base58字符'
    };
  }

  try {
    const publicKey = new PublicKey(address);
    
    // 检查是否是有效的PublicKey
    if (!PublicKey.isOnCurve(publicKey.toBytes())) {
      return {
        isValid: false,
        error: '代币地址不在椭圆曲线上，无效的Solana地址'
      };
    }

    return {
      isValid: true,
      publicKey
    };
  } catch (error) {
    return {
      isValid: false,
      error: `代币地址格式错误: ${error.message}`
    };
  }
};

// 解析私钥字符串为数组格式
export const parsePrivateKeyToArray = (privateKey: string): number[] | null => {
  try {
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
      return JSON.parse(privateKey);
    } else if (privateKey.length === 128) {
      // Hex 格式
      const keyArray = privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
      return keyArray || null;
    } else {
      // 尝试 Base58 格式（Solana 标准格式）
      try {
        const decoded = bs58.decode(privateKey);
        return Array.from(decoded);
      } catch {}
      
      // 尝试 Base64 格式
      try {
        const decoded = Buffer.from(privateKey, 'base64');
        return Array.from(decoded);
      } catch {}
    }
  } catch {
    return null;
  }
};

// 生成随机钱包
export const generateRandomWallet = (): {
  keypair: Keypair;
  publicKey: string;
  privateKey: string;
  privateKeyArray: number[];
} => {
  const keypair = Keypair.generate();
  const privateKeyArray = Array.from(keypair.secretKey);
  
  return {
    keypair,
    publicKey: keypair.publicKey.toBase58(),
    privateKey: Buffer.from(keypair.secretKey).toString('base64'),
    privateKeyArray
  };
};