declare module 'virtual:pwa-register' {
    export function register(config?: { immediate?: boolean, onRegistered?: () => void, onRegistrationError?: (error: Error) => void }): Promise<void>;
    export function update(): Promise<void>;
}