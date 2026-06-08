import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches render errors and shows a recoverable fallback instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="errorboundary">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
