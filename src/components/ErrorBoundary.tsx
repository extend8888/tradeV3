import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="text-lg font-semibold text-red-800">
              {this.props.componentName || '组件'}出现错误
            </h3>
          </div>
          
          <div className="space-y-3">
            <p className="text-red-700">
              抱歉，{this.props.componentName || '该组件'}遇到了一个错误。请尝试刷新或联系技术支持。
            </p>
            
            {this.state.error && (
              <details className="bg-red-100 rounded p-3">
                <summary className="cursor-pointer text-red-800 font-medium">
                  错误详情
                </summary>
                <div className="mt-2 text-sm text-red-700">
                  <p><strong>错误信息:</strong> {this.state.error.message}</p>
                  {this.state.error.stack && (
                    <pre className="mt-2 text-xs overflow-auto bg-red-200 p-2 rounded">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              </details>
            )}
            
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;