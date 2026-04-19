// Allow CSS custom properties ("--wc-accent", "--ev-color", etc.) on React
// inline style objects without forcing casts at each call site.
import 'react';

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
