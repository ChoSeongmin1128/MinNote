import type { BodyFontFamily, CodeFontFamily } from '../../lib/types';
import {
  DEFAULT_BODY_FONT_FAMILY,
  DEFAULT_BODY_FONT_SIZE_PX,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_CODE_FONT_SIZE_PX,
  getBodyFontLabel,
  getCodeFontLabel,
} from '../../lib/editorTypography';
import { SegmentedSelector } from '../SegmentedSelector';

interface SettingsFontSectionProps {
  bodyFontFamily: BodyFontFamily;
  bodyFontSizePx: number;
  codeFontFamily: CodeFontFamily;
  codeFontSizePx: number;
  bodyFontOptions: Array<{ id: BodyFontFamily; label: string }>;
  codeFontOptions: Array<{ id: CodeFontFamily; label: string }>;
  minBodyFontSizePx: number;
  maxBodyFontSizePx: number;
  minCodeFontSizePx: number;
  maxCodeFontSizePx: number;
  onBodyFontFamilyChange: (value: BodyFontFamily) => void;
  onPreviewBodyFontSizePx: (value: number) => void;
  onCommitBodyFontSizePx: (value: number) => Promise<unknown>;
  onCodeFontFamilyChange: (value: CodeFontFamily) => void;
  onPreviewCodeFontSizePx: (value: number) => void;
  onCommitCodeFontSizePx: (value: number) => Promise<unknown>;
}

export function SettingsFontSection({
  bodyFontFamily,
  bodyFontSizePx,
  codeFontFamily,
  codeFontSizePx,
  bodyFontOptions,
  codeFontOptions,
  minBodyFontSizePx,
  maxBodyFontSizePx,
  minCodeFontSizePx,
  maxCodeFontSizePx,
  onBodyFontFamilyChange,
  onPreviewBodyFontSizePx,
  onCommitBodyFontSizePx,
  onCodeFontFamilyChange,
  onPreviewCodeFontSizePx,
  onCommitCodeFontSizePx,
}: SettingsFontSectionProps) {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <span className="settings-section-title">글꼴</span>
      </div>
      <span className="document-menu-option-description">
        기본값: 본문 {getBodyFontLabel(DEFAULT_BODY_FONT_FAMILY)} {DEFAULT_BODY_FONT_SIZE_PX}px, 코드 {getCodeFontLabel(DEFAULT_CODE_FONT_FAMILY)} {DEFAULT_CODE_FONT_SIZE_PX}px
      </span>

      <div className="settings-font-group">
        <div className="settings-section-header">
          <span className="settings-section-title">본문</span>
          <button
            className="ghost-button settings-inline-action"
            type="button"
            onClick={() => {
              onBodyFontFamilyChange(DEFAULT_BODY_FONT_FAMILY);
              void onCommitBodyFontSizePx(DEFAULT_BODY_FONT_SIZE_PX);
            }}
          >
            기본값으로
          </button>
        </div>
        <SegmentedSelector
          ariaLabel="본문 글꼴 선택"
          tone="settings"
          value={bodyFontFamily}
          options={bodyFontOptions.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
          onChange={onBodyFontFamilyChange}
        />
        <div className="settings-range-group">
          <div className="settings-range-header">
            <div className="settings-range-title-group">
              <span className="settings-section-title">본문 크기</span>
              <span className="settings-inline-stat">{bodyFontSizePx}px</span>
            </div>
          </div>
          <input
            className="opacity-slider"
            type="range"
            min={minBodyFontSizePx}
            max={maxBodyFontSizePx}
            step={1}
            value={bodyFontSizePx}
            onInput={(event) => onPreviewBodyFontSizePx(Number(event.currentTarget.value))}
            onPointerUp={(event) => {
              void onCommitBodyFontSizePx(Number(event.currentTarget.value));
            }}
            onKeyUp={(event) => {
              void onCommitBodyFontSizePx(Number(event.currentTarget.value));
            }}
            onBlur={(event) => {
              void onCommitBodyFontSizePx(Number(event.currentTarget.value));
            }}
          />
        </div>
      </div>

      <div className="settings-font-group">
        <div className="settings-section-header">
          <span className="settings-section-title">코드</span>
          <button
            className="ghost-button settings-inline-action"
            type="button"
            onClick={() => {
              onCodeFontFamilyChange(DEFAULT_CODE_FONT_FAMILY);
              void onCommitCodeFontSizePx(DEFAULT_CODE_FONT_SIZE_PX);
            }}
          >
            기본값으로
          </button>
        </div>
        <SegmentedSelector
          ariaLabel="코드 글꼴 선택"
          tone="settings"
          value={codeFontFamily}
          options={codeFontOptions.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
          onChange={onCodeFontFamilyChange}
        />
        <div className="settings-range-group">
          <div className="settings-range-header">
            <div className="settings-range-title-group">
              <span className="settings-section-title">코드 크기</span>
              <span className="settings-inline-stat">{codeFontSizePx}px</span>
            </div>
          </div>
          <input
            className="opacity-slider"
            type="range"
            min={minCodeFontSizePx}
            max={maxCodeFontSizePx}
            step={1}
            value={codeFontSizePx}
            onInput={(event) => onPreviewCodeFontSizePx(Number(event.currentTarget.value))}
            onPointerUp={(event) => {
              void onCommitCodeFontSizePx(Number(event.currentTarget.value));
            }}
            onKeyUp={(event) => {
              void onCommitCodeFontSizePx(Number(event.currentTarget.value));
            }}
            onBlur={(event) => {
              void onCommitCodeFontSizePx(Number(event.currentTarget.value));
            }}
          />
        </div>
      </div>
    </div>
  );
}
