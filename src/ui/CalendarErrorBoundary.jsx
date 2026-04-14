import { Component } from 'react';

/**
 * Catches runtime render errors from the calendar subtree so host apps
 * can keep running even if the calendar fails.
 */
export default class CalendarErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
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
