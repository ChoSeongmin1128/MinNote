# MinNote

MinNote는 macOS 단독 데스크톱 노트 앱을 목표로 합니다. 현재 방향은 Heynote식 상위 블록 구분을 유지하면서, Markdown 블록 안에서는 Notion에 가까운 직접 편집 경험을 만드는 것입니다.

## 확정된 전제

- 앱은 `macOS 단독`을 전제로 합니다.
- 패키지 매니저는 `pnpm`을 기준으로 합니다.
- 상위 레벨 구조는 블록 중심으로 유지합니다.
- Markdown 블록은 단순 미리보기보다 직접 편집 가능한 경험을 우선합니다.
- 문서, skill, subagent 구조를 개선해야 할 때는 사용자 승인 후에만 반영합니다.

## 확정된 기술 선택

- 앱 셸은 `Tauri`를 사용합니다.
- 주 구현 언어는 `TypeScript + Rust`입니다.
- 프런트엔드 UI 프레임워크는 `React + TypeScript`를 사용합니다.
- 전체 구조는 `헥사고날 아키텍처`를 사용합니다.
- 에디터 코어는 `BlockNote 기반 Markdown 편집기 + plain textarea 기반 Code/Text 편집기`로 구성합니다.
- 저장 방식은 `SQLite canonical`입니다.
- Markdown 블록의 canonical 저장 형식은 `normalized Markdown string`입니다.
- Code 블록의 canonical 저장 형식은 `plain string + language metadata`입니다.
- Plain text 블록의 canonical 저장 형식은 `plain string`입니다.
- 문서 모델은 `Document -> ordered Blocks` 구조를 사용합니다.
- 블록 순서는 문서별 `integer position`으로 저장합니다.
- 문서 제목 입력은 비워둘 수 있지만, 저장 시에는 `Untitled` 계열 이름으로 정규화합니다.
- 프런트엔드는 Tauri `invoke`를 통해 Rust command facade만 호출하고, DB 접근은 Rust 계층이 담당합니다.
- 1차 블록 종류는 `Markdown + Code + Plain text`입니다.
- Markdown 블록은 외부 Markdown/clipboard 내용을 붙여넣을 수 있습니다.
- Code 블록과 Plain text 블록의 붙여넣기는 `plain text` 기준으로 처리합니다.
- v1에서는 파일 import/export UI를 제공하지 않고, 앱 내부 사용과 SQLite 저장에 집중합니다.
- 저장은 기본적으로 자동 저장이며, `Cmd+S`는 즉시 저장/flush 동작으로 지원합니다.
- `Cmd+A`는 현재 블록 전체 선택, 한 번 더 누르면 모든 블록 전체 선택으로 동작합니다.
- 삭제는 확인 모달 없이 바로 처리합니다.
- 앱 종료 전에는 한 번 더 저장/flush 합니다.
- 별도 복구 UI는 v1에서 제공하지 않습니다.
- 디자인은 macOS 스타일을 대체로 준수하고, 다크/라이트 모드를 구분합니다.
- 기존 앱 코드를 포크하지는 않지만, 에디터와 렌더링에는 오픈소스 라이브러리를 사용합니다.

## 미정인 항목

- 현재 작업 단계를 어떻게 표현할지는 아직 고정하지 않습니다.
- 문서 전체를 하나의 거대한 editor로 합칠지 여부는 아직 결정하지 않았습니다.

## 현재 상태

- 이 저장소는 `Tauri + React + TypeScript + Rust + SQLite` 스캐폴드와 v1 편집 UI/저장 흐름까지 포함한 초기 구현 상태입니다.
- 프런트엔드에는 문서 목록, 블록 셸, Markdown/Code/Text 편집기, autosave, 검색 UI가 들어 있습니다.
- 백엔드에는 SQLite schema, Tauri command facade, 문서/블록 저장 로직, FTS 기반 검색 인덱스가 들어 있습니다.
- 아직 `rules`, `subagents`, `commitlint/hook` 같은 강제 도구는 도입하지 않았습니다.
- AI 전용 세부 맥락은 루트 `AGENTS.md`와 `.agents/skills/` 아래 skill들에 둡니다.

## 실행 방법

- 의존성 설치: `pnpm install`
- 웹 프런트엔드 실행: `pnpm dev`
- Tauri 앱 실행: `pnpm tauri:dev`
- 프런트엔드 빌드: `pnpm build`
- 프런트엔드 테스트: `pnpm test:run`

`pnpm tauri:dev`를 실제로 실행하려면 로컬에 Rust toolchain이 필요합니다.

## 문서 안내

- 기본 작업 규칙: [AGENTS.md](/Users/seongmin/Personal/MinNote/AGENTS.md)
- AI 전용 상세 맥락: `.agents/skills/`
- README 갱신 기준: `readme-maintenance` skill

## README 유지 원칙

README는 모든 변경마다 고치지 않습니다. 설치/실행 방법, 제품 방향, 핵심 구조, 사용자나 기여자가 알아야 하는 워크플로가 바뀌는 의미 있는 변경에서만 갱신합니다. 자세한 기준은 `readme-maintenance` skill을 기준으로 따릅니다.
