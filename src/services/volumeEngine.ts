import { VolumeConfig, VolumeOrder, VolumeSession } from '@/types/volume';
import { useWalletStore } from '@/stores/walletStore';
import { useRPCStore } from '@/stores/rpcStore';
import { useLogStore } from '@/stores/logStore';
import { useTradeStore } from '@/stores/tradeStore';

export class VolumeEngine {
  private session: VolumeSession | null = null;
  private isRunning = false;
  private timeoutId: NodeJS.Timeout | null = null;
  private orders: VolumeOrder[] = [];
  private lastTradeTime = 0;
  private dailyVolume = 0;
  private failureCount = 0;

  constructor() {
    this.resetDailyStats();
  }

  // 启动刷量会话
  async startSession(config: VolumeConfig): Promise<{ success: boolean; error?: string }> {
    try {
      // 验证配置
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 检查钱包状态
      const walletCheck = this.checkWallets();
      if (!walletCheck.valid) {
        return { success: false, error: walletCheck.error };
      }

      // 创建新会话
      this.session = {
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

      this.isRunning = true;
      this.failureCount = 0;

      // 记录启动日志
      useLogStore.getState().addLog({
        level: 'success',
        category: 'volume',
        message: `刷量会话已启动`,
        details: {
          sessionId: this.session.id,
          tokenAddress: config.tokenAddress,
          mode: config.mode,
          walletCount: this.getActiveWallets().length
        }
      });

      // 开始交易循环
      this.scheduleNextTrade();

      return { success: true };
    } catch (error) {
      useLogStore.getState().addLog({
        level: 'error',
        category: 'volume',
        message: `启动刷量会话失败: ${error.message}`
      });
      return { success: false, error: error.message };
    }
  }

  // 停止刷量会话
  stopSession(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.isRunning = false;

    if (this.session) {
      this.session.status = 'stopped';
      this.session.endTime = new Date();

      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: `刷量会话已停止`,
        details: {
          sessionId: this.session.id,
          duration: this.session.endTime.getTime() - this.session.startTime.getTime(),
          totalTrades: this.session.totalTrades,
          successRate: this.session.totalTrades > 0 ? (this.session.successfulTrades / this.session.totalTrades * 100).toFixed(2) + '%' : '0%'
        }
      });
    }
  }

  // 暂停会话
  pauseSession(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.isRunning = false;

    if (this.session) {
      this.session.status = 'paused';
      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: `刷量会话已暂停`
      });
    }
  }

  // 恢复会话
  resumeSession(): void {
    if (this.session && this.session.status === 'paused') {
      this.session.status = 'running';
      this.isRunning = true;
      this.scheduleNextTrade();

      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: `刷量会话已恢复`
      });
    }
  }

  // 获取当前会话状态
  getSession(): VolumeSession | null {
    return this.session;
  }

  // 获取订单列表
  getOrders(): VolumeOrder[] {
    return [...this.orders];
  }

  // 验证配置
  private validateConfig(config: VolumeConfig): { valid: boolean; error?: string } {
    if (!config.enabled) {
      return { valid: false, error: '刷量功能未启用' };
    }

    if (!config.tokenAddress) {
      return { valid: false, error: '请设置代币地址' };
    }

    if (config.minAmount <= 0 || config.maxAmount <= 0 || config.minAmount > config.maxAmount) {
      return { valid: false, error: '交易金额设置无效' };
    }

    if (config.minInterval <= 0 || config.maxInterval <= 0 || config.minInterval > config.maxInterval) {
      return { valid: false, error: '交易间隔设置无效' };
    }

    return { valid: true };
  }

  // 检查钱包状态
  private checkWallets(): { valid: boolean; error?: string } {
    const activeWallets = this.getActiveWallets();

    if (activeWallets.length === 0) {
      return { valid: false, error: '没有可用的活跃钱包' };
    }

    // 检查钱包余额
    const insufficientWallets = activeWallets.filter(w => w.solBalance < 0.01);
    if (insufficientWallets.length === activeWallets.length) {
      return { valid: false, error: '所有钱包余额不足' };
    }

    // 检查RPC连接
    const connection = useRPCStore.getState().getConnection();
    if (!connection) {
      return { valid: false, error: 'RPC连接未建立' };
    }

    return { valid: true };
  }

  // 获取活跃钱包
  private getActiveWallets() {
    return useWalletStore.getState().wallets.filter(w => w.isActive && w.solBalance > 0.01);
  }

  // 调度下一次交易
  private scheduleNextTrade(): void {
    if (!this.isRunning || !this.session) {
      return;
    }

    // 检查失败次数
    if (this.failureCount >= this.session.config.maxFailures) {
      this.handleSessionError('连续失败次数过多，会话已停止');
      return;
    }

    // 计算下次交易时间
    const { minInterval, maxInterval } = this.session.config;
    const interval = Math.random() * (maxInterval - minInterval) + minInterval;
    const nextTradeTime = Math.max(this.lastTradeTime + interval * 1000, Date.now() + 1000);
    const delay = nextTradeTime - Date.now();

    this.timeoutId = setTimeout(() => {
      this.executeTrade();
    }, delay);

    useLogStore.getState().addLog({
      level: 'info',
      category: 'volume',
      message: `下次交易将在 ${(delay / 1000).toFixed(1)} 秒后执行`
    });
  }

  // 执行交易
  private async executeTrade(): Promise<void> {
    if (!this.isRunning || !this.session) {
      return;
    }

    try {
      // 选择钱包
      const wallet = this.selectWallet();
      if (!wallet) {
        throw new Error('没有可用的钱包');
      }

      // 决定交易类型和金额
      const tradeType = Math.random() > 0.5 ? 'buy' : 'sell';
      const { minAmount, maxAmount } = this.session.config;
      const amount = Math.random() * (maxAmount - minAmount) + minAmount;

      // 创建订单
      const order: VolumeOrder = {
        id: `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        sessionId: this.session.id,
        walletId: wallet.id,
        type: tradeType,
        amount,
        status: 'pending',
        createdAt: new Date()
      };

      this.orders.push(order);
      this.session.totalTrades++;

      useLogStore.getState().addLog({
        level: 'info',
        category: 'volume',
        message: `创建${tradeType === 'buy' ? '买入' : '卖出'}订单`,
        details: {
          orderId: order.id,
          walletId: wallet.id,
          amount,
          type: tradeType
        }
      });

      // 执行订单
      const success = await this.executeOrder(order);

      if (success) {
        this.failureCount = 0; // 重置失败计数
        this.session.successfulTrades++;
        this.session.totalVolume += amount;
        this.dailyVolume += amount;
      } else {
        this.failureCount++;
        this.session.failedTrades++;
        this.session.errorCount++;
      }

      this.lastTradeTime = Date.now();

      // 调度下一次交易
      this.scheduleNextTrade();

    } catch (error) {
      this.failureCount++;
      if (this.session) {
        this.session.errorCount++;
        this.session.lastError = error.message;
      }

      useLogStore.getState().addLog({
        level: 'error',
        category: 'volume',
        message: `交易执行失败: ${error.message}`
      });

      // 如果不是致命错误，继续调度下一次交易
      if (this.failureCount < (this.session?.config.maxFailures || 5)) {
        setTimeout(() => this.scheduleNextTrade(), 5000); // 5秒后重试
      } else {
        this.handleSessionError('连续失败次数过多');
      }
    }
  }

  // 选择钱包
  private selectWallet() {
    const activeWallets = this.getActiveWallets();
    if (activeWallets.length === 0) {
      return null;
    }

    // 简单的轮询选择
    const index = this.session?.totalTrades || 0;
    return activeWallets[index % activeWallets.length];
  }

  // 执行订单
  private async executeOrder(order: VolumeOrder): Promise<boolean> {
    try {
      order.status = 'executing';
      order.executedAt = new Date();

      // 使用交易商店执行订单
      const tradeStore = useTradeStore.getState();
      const success = await tradeStore.executeOrder(order.id);

      if (success) {
        order.status = 'completed';
        useLogStore.getState().addLog({
          level: 'success',
          category: 'volume',
          message: `订单执行成功`,
          details: { orderId: order.id }
        });
        return true;
      } else {
        order.status = 'failed';
        order.error = '订单执行失败';
        return false;
      }
    } catch (error) {
      order.status = 'failed';
      order.error = error.message;
      return false;
    }
  }

  // 处理会话错误
  private handleSessionError(error: string): void {
    if (this.session) {
      this.session.status = 'error';
      this.session.lastError = error;
      this.session.endTime = new Date();
    }

    this.isRunning = false;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    useLogStore.getState().addLog({
      level: 'error',
      category: 'volume',
      message: `刷量会话错误: ${error}`
    });
  }

  // 重置每日统计
  private resetDailyStats(): void {
    const now = new Date();
    const lastReset = localStorage.getItem('volume_daily_reset');
    const today = now.toDateString();

    if (lastReset !== today) {
      this.dailyVolume = 0;
      localStorage.setItem('volume_daily_reset', today);
      localStorage.setItem('volume_daily_volume', '0');
    } else {
      this.dailyVolume = parseFloat(localStorage.getItem('volume_daily_volume') || '0');
    }
  }

  // 保存每日统计
  private saveDailyStats(): void {
    localStorage.setItem('volume_daily_volume', this.dailyVolume.toString());
  }
}

// 导出单例实例
export const volumeEngine = new VolumeEngine();