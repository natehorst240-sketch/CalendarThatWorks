declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.css';

declare module 'react-map-gl/maplibre' {
  import type { ComponentType, ReactNode, CSSProperties } from 'react';

  export interface MapViewState {
    longitude: number;
    latitude: number;
    zoom: number;
  }

  export interface MapProps {
    initialViewState?: Partial<MapViewState>;
    mapStyle?: string;
    style?: CSSProperties;
    children?: ReactNode;
  }

  export interface MarkerProps {
    longitude: number;
    latitude: number;
    anchor?: string;
    onClick?: (e: { originalEvent: MouseEvent }) => void;
    children?: ReactNode;
  }

  export interface PopupProps {
    longitude: number;
    latitude: number;
    anchor?: string;
    onClose?: () => void;
    closeOnClick?: boolean;
    children?: ReactNode;
  }

  export interface NavigationControlProps {
    position?: string;
  }

  export const Map: ComponentType<MapProps>;
  export const Marker: ComponentType<MarkerProps>;
  export const Popup: ComponentType<PopupProps>;
  export const NavigationControl: ComponentType<NavigationControlProps>;
}
