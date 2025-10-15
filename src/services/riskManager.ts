import { VolumeConfig, VolumeSession, VolumeOrder } from '@/types/volume';
import { VolumeRisk, Wallet } from '@/types';
import { useWalletStore } from '@/stores/walletStore';
import { useTradeStore } from '@/stores/tradeStore';
import { useLogStore } from '@/stores/logStore';

/**
 * 风险管理器
 * 负责评估和控制策略交易的风险
 */
export class RiskManager {
  private static instance: RiskManager;
  
  private thresholds = {
    maxConcurrentSessions: 3,
    minTradeInterval: 30,
    maxFailureRate: 20,
    maxWalletUsage: 80,
    networkCongestionThreshold: 0.8,
  };

  // 风险阈值配置
  private readonly RISK_THRESHOLDS = {
    LOW: {
      maxHourlyTransactions: 10,
      maxErrorRate: 0.05, // 5%
      maxPriceImpact: 1, // 1%
      minWalletBalance: 0.1 // SOL
    },
    MEDIUM: {
      maxHourlyTransactions: 30,
      maxErrorRate: 0.15,
      maxPriceImpact: 3,
      minWalletBalance: 0.05
    },
    HIGH: {
      maxHourlyTransactions: 60,
      maxErrorRate: 0.25,
      maxPriceImpact: 5,
      minWalletBalance: 0.02
    },
    CRITICAL: {
      maxHourlyTransactions: 120,
      maxErrorRate: 0.35,
      maxPriceImpact: 10,
      minWalletBalance: 0.01
    }
  };

  private constructor() {}

  static getInstance(): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager();
    }
    return RiskManager.instance;
  }

  /**
   * 评估配置风险（简化版，不需要orders和sessions）
   */
  assessRisk(config: VolumeConfig): VolumeRisk & { score: number } {
    return this.assessOverallRisk(config, [], []);
  }

  /**
   * 评估整体风险
   */
  assessOverallRisk(config: VolumeConfig, sessions: VolumeSession[], orders: VolumeOrder[]): VolumeRisk & { score: number } {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let riskScore = 0;

    // 1. 交易量风险评估
    const volumeRisk = this.assessVolumeRisk(config, orders);
    riskScore += volumeRisk.score;
    factors.push(...volumeRisk.factors);
    recommendations.push(...volumeRisk.recommendations);

    // 2. 频率风险评估
    const frequencyRisk = this.assessFrequencyRisk(config, orders);
    riskScore += frequencyRisk.score;
    factors.push(...frequencyRisk.factors);
    recommendations.push(...frequencyRisk.recommendations);

    // 3. 钱包风险评估
    const walletRisk = this.assessWalletRisk(config);
    riskScore += walletRisk.score;
    factors.push(...walletRisk.factors);
    recommendations.push(...walletRisk.recommendations);

    // 4. 网络风险评估
    const networkRisk = this.assessNetworkRisk(orders);
    riskScore += networkRisk.score;
    factors.push(...networkRisk.factors);
    recommendations.push(...networkRisk.recommendations);

    // 5. 行为模式风险评估
    const behaviorRisk = this.assessBehaviorRisk(config, orders);
    riskScore += behaviorRisk.score;
    factors.push(...behaviorRisk.factors);
    recommendations.push(...behaviorRisk.recommendations);

    // 确定风险等级
    const level = this.calculateRiskLevel(riskScore);
    
    // 计算检测风险
    const detectionRisk = this.calculateDetectionRisk(riskScore, config, orders);

    // 计算最大安全交易量
    const maxSafeVolume = this.calculateMaxSafeVolume(level, config);

    return {
      level,
      score: riskScore,
      factors: [...new Set(factors)], // 去重
      recommendations: [...new Set(recommendations)], // 去重
      estimatedDetectionRisk: detectionRisk,
      maxSafeVolume
    };
  }

  /**
   * 交易量风险评估
   */
  private assessVolumeRisk(config: VolumeConfig, orders: VolumeOrder[]) {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // 计算今日交易量
    const today = new Date().toDateString();
    const todayOrders = orders.filter(order => 
      new Date(order.createdAt).toDateString() === today
    );
    const dailyVolume = todayOrders.reduce((sum, order) => sum + order.amount, 0);

    // 评估每日交易量（使用maxAmount作为参考）
    const estimatedDailyLimit = config.maxAmount * 50; // 估算每日限额
    if (dailyVolume > estimatedDailyLimit * 0.8) {
      score += 30;
      factors.push('接近预估每日交易量限制');
      recommendations.push('降低交易频率或金额');
    }

    if (config.maxAmount > 1) {
      score += 20;
      factors.push('单笔交易金额过大');
      recommendations.push('降低单笔交易金额至1 SOL以下');
    }

    if (estimatedDailyLimit > 50) {
      score += 25;
      factors.push('每日交易量设置过高');
      recommendations.push('将每日限额降至50 SOL以下');
    }

    return { score, factors, recommendations };
  }

  /**
   * 频率风险评估
   */
  private assessFrequencyRisk(config: VolumeConfig, orders: VolumeOrder[]) {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // 计算平均交易间隔
    const avgInterval = (config.minInterval + config.maxInterval) / 2;

    if (avgInterval < 60) { // 小于1分钟
      score += 40;
      factors.push('交易频率过高');
      recommendations.push('增加交易间隔至少1分钟');
    } else if (avgInterval < 300) { // 小于5分钟
      score += 20;
      factors.push('交易频率较高');
      recommendations.push('考虑增加交易间隔');
    }

    // 检查最近1小时的交易数量
    const oneHourAgo = Date.now() - 3600000;
    const recentOrders = orders.filter(order => 
      new Date(order.createdAt).getTime() > oneHourAgo
    );

    if (recentOrders.length > 30) {
      score += 35;
      factors.push('小时交易数量过多');
      recommendations.push('降低交易频率');
    }

    return { score, factors, recommendations };
  }

  /**
   * 钱包风险评估
   */
  private assessWalletRisk(config: VolumeConfig) {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    const { wallets } = useWalletStore.getState();
    const activeWallets = wallets.filter(w => w.isActive);

    // 钱包数量风险
    if (activeWallets.length < 3) {
      score += 30;
      factors.push('活跃钱包数量过少');
      recommendations.push('增加更多钱包以分散风险');
    }

    // 钱包余额风险
    const lowBalanceWallets = activeWallets.filter(w => w.solBalance < 0.1);
    if (lowBalanceWallets.length > activeWallets.length * 0.5) {
      score += 25;
      factors.push('多数钱包余额过低');
      recommendations.push('为钱包充值以维持正常运行');
    }

    // 钱包轮换风险
    if (!config.enableWalletRotation) {
      score += 15;
      factors.push('未启用钱包轮换');
      recommendations.push('启用钱包轮换以降低检测风险');
    }

    return { score, factors, recommendations };
  }

  /**
   * 网络风险评估
   */
  private assessNetworkRisk(orders: VolumeOrder[]) {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // 计算最近的失败率
    const recentOrders = orders.filter(order => 
      Date.now() - new Date(order.createdAt).getTime() < 3600000 // 1小时内
    );

    if (recentOrders.length > 0) {
      const failureRate = recentOrders.filter(order => order.status === 'failed').length / recentOrders.length;
      
      if (failureRate > 0.3) {
        score += 40;
        factors.push('网络失败率过高');
        recommendations.push('检查网络连接和RPC节点状态');
      } else if (failureRate > 0.1) {
        score += 20;
        factors.push('网络失败率较高');
        recommendations.push('监控网络状况');
      }
    }

    return { score, factors, recommendations };
  }

  /**
   * 行为模式风险评估
   */
  private assessBehaviorRisk(config: VolumeConfig, orders: VolumeOrder[]) {
    const factors: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // 检查交易策略
    if (config.strategy === 'sideways') {
      // 横盘震荡策略风险较低
      score += 0;
    } else if (config.strategy === 'bullish' || config.strategy === 'bearish') {
      score += 10;
      factors.push('使用定向策略交易');
      recommendations.push('考虑使用横盘震荡策略降低风险');
    }

    // 检查交易金额的变化性
    const recentAmounts = orders.slice(-20).map(order => order.amount);
    if (recentAmounts.length > 5) {
      const variance = this.calculateVariance(recentAmounts);
      const mean = recentAmounts.reduce((sum, amount) => sum + amount, 0) / recentAmounts.length;
      const coefficientOfVariation = Math.sqrt(variance) / mean;

      if (coefficientOfVariation < 0.2) {
        score += 25;
        factors.push('交易金额变化性不足');
        recommendations.push('增加交易金额的随机性');
      }
    }

    // 检查时间模式
    const tradingHours = orders.map(order => new Date(order.createdAt).getHours());
    const uniqueHours = new Set(tradingHours);
    
    if (uniqueHours.size < 8) {
      score += 15;
      factors.push('交易时间集中');
      recommendations.push('在更多时间段进行交易');
    }

    return { score, factors, recommendations };
  }

  /**
   * 计算方差
   */
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  }

  /**
   * 计算风险等级
   */
  private calculateRiskLevel(score: number): VolumeRisk['level'] {
    if (score <= 30) return 'low';
    if (score <= 60) return 'medium';
    if (score <= 90) return 'high';
    return 'critical';
  }

  /**
   * 计算检测风险百分比
   */
  private calculateDetectionRisk(score: number, config: VolumeConfig, orders: VolumeOrder[]): number {
    let detectionRisk = Math.min(score * 0.8, 80); // 基础风险



    // 根据频率调整
    const avgInterval = (config.minInterval + config.maxInterval) / 2;
    if (avgInterval < 120) detectionRisk += 15;

    return Math.min(Math.round(detectionRisk), 95);
  }

  /**
   * 计算最大安全交易量
   */
  private calculateMaxSafeVolume(level: VolumeRisk['level'], config: VolumeConfig): number {
    // 基于风险级别返回建议的安全交易量
    switch (level) {
      case 'low': return 5; // SOL
      case 'medium': return 20;
      case 'high': return 50;
      case 'critical': return 100;
      default: return 10;
    }
  }



  /**
   * 实时风险监控
   */
  monitorRealTimeRisk(config: VolumeConfig, orders: VolumeOrder[]): {
    shouldStop: boolean;
    shouldPause: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let shouldStop = false;
    let shouldPause = false;



    // 检查最近失败率
    const recentOrders = orders.filter(order => 
      Date.now() - new Date(order.createdAt).getTime() < 1800000 // 30分钟内
    );

    if (recentOrders.length >= 5) {
      const failureRate = recentOrders.filter(order => order.status === 'failed').length / recentOrders.length;
      
      if (failureRate >= 0.5) {
        shouldStop = true;
        warnings.push('失败率过高，建议停止交易');
      } else if (failureRate >= 0.3) {
        shouldPause = true;
        warnings.push('失败率较高，建议暂停交易');
      }
    }

    // 检查钱包余额
    const { wallets } = useWalletStore.getState();
    const activeWallets = wallets.filter(w => w.isActive);
    const lowBalanceCount = activeWallets.filter(w => w.solBalance < config.minAmount * 2).length;
    
    if (lowBalanceCount >= activeWallets.length * 0.8) {
      shouldPause = true;
      warnings.push('多数钱包余额不足');
    }

    return { shouldStop, shouldPause, warnings };
  }

  /**
   * 获取当前风险阈值
   */
  getThresholds() {
    return { ...this.thresholds };
  }

  /**
   * 更新风险阈值
   */
  updateThresholds(newThresholds: Partial<typeof this.thresholds>) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }

  /**
   * 生成安全建议
   */
  generateSafetyRecommendations(config: VolumeConfig): string[] {
    const recommendations: string[] = [];

    // 基础安全建议
    recommendations.push('定期监控交易状态和网络连接');
    recommendations.push('保持钱包余额充足');
    recommendations.push('避免在网络拥堵时进行大量交易');

    // 根据配置给出具体建议
    if (config.maxAmount > 0.5) {
      recommendations.push('考虑降低单笔交易金额以减少风险');
    }

    if (config.minInterval < 60) {
      recommendations.push('增加交易间隔以降低检测风险');
    }

    if (!config.enableWalletRotation) {
      recommendations.push('启用钱包轮换功能');
    }

    if (config.strategy === 'bullish' || config.strategy === 'bearish') {
      recommendations.push('使用横盘震荡策略增加不可预测性');
    }

    return recommendations;
  }
}

// 导出单例实例
export const riskManager = RiskManager.getInstance();