import { Component, type ReactNode, type ErrorInfo } from 'react';

type Props = {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: unknown, info: ErrorInfo) => void;
};

type State = { hasError: boolean };

/**
 * Catches runtime render errors from the calendar subtree so host apps
 * can keep running even if the calendar fails.
 */
export default class CalendarErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div role="alert" aria-live="assertive">
          Calendar failed to load
        </div>
      );
    }
    return this.props.children;
  }
}
