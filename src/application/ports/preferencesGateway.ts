import type {
  BlockKind,
  BlockTintPreset,
  DocumentSurfaceTonePreset,
  ThemeMode,
} from '../../lib/types';

export interface PreferencesGateway {
  setThemeMode(themeMode: ThemeMode): void;
  setDefaultBlockTintPreset(preset: BlockTintPreset): void;
  setDefaultDocumentSurfaceTonePreset(preset: DocumentSurfaceTonePreset): void;
  setDefaultBlockKind(kind: BlockKind): void;
  setMenuBarIconEnabled(value: boolean): void;
  getAlwaysOnTopEnabled(): boolean;
  setAlwaysOnTopEnabled(value: boolean): void;
  getWindowOpacityPercent(): number;
  setWindowOpacityPercent(value: number): void;
  getGlobalToggleShortcut(): string | null;
  setGlobalToggleShortcut(value: string | null): void;
  getGlobalShortcutError(): string | null;
  setGlobalShortcutError(value: string | null): void;
}
