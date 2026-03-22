# Environment Facts

## 현재 전제

- 이 저장소는 `pnpm`을 기준으로 운영합니다.
- 이 저장소는 `macOS 단독` 데스크톱 앱 개발을 전제로 합니다.
- 앱 셸은 `Tauri`를 사용합니다.
- 프런트엔드 UI는 `React + TypeScript`를 사용합니다.
- 네이티브 레이어는 `Rust`를 사용합니다.
- AI 전용 상세 문서는 루트 `.agents/skills/` 아래에 둡니다.

## 현재 상태

- 저장소에는 루트 문서, repo-local skills, Vite 기반 React 프런트엔드, `src-tauri` Rust 백엔드 스캐폴드가 존재합니다.
- `package.json`, `pnpm-lock.yaml`, `src/`, `src-tauri/`가 실제 기준점입니다.
- 현재 로컬 환경에서는 Node/pnpm, Rust toolchain, `tauri-cli`가 확인됐습니다.

## 작업 원칙

- 패키지 설치, 스크립트 예시, 실행 방법은 `pnpm` 기준으로 설명합니다.
- macOS 전용 동작이나 UI/배포 제약이 있으면 cross-platform 일반론보다 macOS 관점을 우선합니다.
- Tauri 개발은 주로 CLI 기반으로 진행하고, Xcode는 macOS toolchain과 배포 관련 작업에서 보조적으로 사용될 수 있습니다.
- 새로운 코어 툴체인 선택이나 기존 확정 스택 변경은 사용자 승인 없이 하지 않습니다.

## Gotchas

- `npm`, `yarn`, `bun` 기준 예시를 기본값처럼 쓰지 않습니다.
- 이미 있는 `package.json`과 `src-tauri/tauri.conf.json`을 무시하고 다른 개발 포트나 스크립트를 임의로 제안하지 않습니다.
- 환경 관련 문서나 skill을 보완해야 할 것 같으면 먼저 사용자에게 질문합니다.
