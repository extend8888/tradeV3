import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 支持的区块链类型
 */
export type ChainType = 'SOL' | 'BSC' | 'SOC';

/**
 * 区块链配置接口
 */
export interface ChainConfig {
  id: ChainType;
  name: string;
  displayName: string;
  symbol: string;
  color: string;
  icon?: string;
  rpcUrls: string[];
  explorerUrl: string;
  isActive: boolean;
}

/**
 * 链选择器状态接口
 */
interface ChainState {
  // 当前选中的链
  selectedChain: ChainType;
  
  // 支持的链配置
  chains: Record<ChainType, ChainConfig>;
  
  // 操作方法
  setSelectedChain: (chain: ChainType) => void;
  getChainConfig: (chain: ChainType) => ChainConfig;
  getActiveChains: () => ChainConfig[];
}

/**
 * 默认链配置
 */
const defaultChains: Record<ChainType, ChainConfig> = {
  SOL: {
    id: 'SOL',
    name: 'solana',
    displayName: 'Solana',
    symbol: 'SOL',
    color: '#9945FF',
    rpcUrls: [
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com'
    ],
    explorerUrl: 'https://solscan.io',
    isActive: true
  },
  BSC: {
    id: 'BSC',
    name: 'binance-smart-chain',
    displayName: 'BSC',
    symbol: 'BNB',
    color: '#F3BA2F',
    rpcUrls: [
      'https://bsc-dataseed1.binance.org',
      'https://bsc-dataseed2.binance.org'
    ],
    explorerUrl: 'https://bscscan.com',
    isActive: true
  },
  SOC: {
    id: 'SOC',
    name: 'soc-chain',
    displayName: 'SOC Chain',
    symbol: 'SOC',
    color: '#00D4AA',
    rpcUrls: [],
    explorerUrl: '',
    isActive: true
  }
};

/**
 * 链选择器状态管理
 */
export const useChainStore = create<ChainState>()(
  persist(
    (set, get) => ({
      selectedChain: 'SOL', // 默认选择SOL
      chains: defaultChains,
      
      setSelectedChain: (chain: ChainType) => {
        const chainConfig = get().chains[chain];
        if (chainConfig && chainConfig.isActive) {
          set({ selectedChain: chain });
        }
      },
      
      getChainConfig: (chain: ChainType) => {
        return get().chains[chain];
      },
      
      getActiveChains: () => {
        const chains = get().chains;
        return Object.values(chains).filter(chain => chain.isActive);
      }
    }),
    {
      name: 'chain-store',
      partialize: (state) => ({
        selectedChain: state.selectedChain
      })
    }
  )
);