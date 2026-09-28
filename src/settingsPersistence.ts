export interface PersistentCloudSettings {
    pointSize: number;
    pointType: number;
    alpha: number;
    colorMode: number;
    vmin: number;
    vmax: number;
    clipEnabled: boolean;
    clipFlip: boolean;
}

export interface PersistentSettings {
    version: 1;
    backgroundColor: string;
    showCenter: boolean;
    cloud: PersistentCloudSettings | null;
}

const STORAGE_KEY = 'q3dweb.settings.v1';

export function loadPersistentSettings(): PersistentSettings | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PersistentSettings>;
        if (parsed.version !== 1) return null;
        if (typeof parsed.backgroundColor !== 'string') return null;
        if (typeof parsed.showCenter !== 'boolean') return null;
        return parsed as PersistentSettings;
    } catch {
        return null;
    }
}

export function savePersistentSettings(settings: PersistentSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Could not save q3dweb settings:', error);
    }
}
