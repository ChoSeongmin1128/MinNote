# Madi

Madi는 Apple Silicon macOS 단독 데스크톱 노트 앱입니다. 현재 방향은 Heynote식 상위 블록 구분을 유지하면서, Markdown 블록 안에서는 Notion에 가까운 직접 편집 경험을 만드는 것입니다.

## 확정된 전제

- 앱은 `Apple Silicon macOS 단독`을 전제로 합니다. Intel Mac과 Windows 배포는 지원하지 않습니다.
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

- 이 저장소는 `Tauri + React + TypeScript + Rust + SQLite` 기반의 Apple Silicon macOS 앱 구현을 포함합니다.
- 프런트엔드에는 문서 목록, 블록 셸, Markdown/Code/Text 편집기, autosave, 검색 UI, 휴지통, iCloud 동기화 상태 UI, 업데이트 UI가 들어 있습니다.
- 앱은 초기 로딩이 끝나면 업데이트를 한 번 확인하고, 이후 `6시간` 간격으로 다시 확인합니다.
- 새 버전이 있으면 백그라운드 다운로드를 먼저 진행하고, 헤더 우측의 작은 버튼으로 `업데이트 적용`을 실행합니다.
- 설정의 업데이트 영역은 상태 확인과 수동 `업데이트 확인` 버튼을 위한 보조 UI입니다.
- 백엔드에는 SQLite schema, Tauri command facade, 문서/블록 저장 로직, FTS 기반 검색 인덱스, iCloud/CloudKit 동기화 엔진, updater 연동이 들어 있습니다.
- 앱 데이터의 canonical source는 로컬 SQLite입니다. iCloud/CloudKit 동기화는 로컬 변경을 raw operation queue에 기록한 뒤 sync 직전에 coalesced intent로 압축해 CloudKit에 반영합니다.
- iCloud 동기화는 CloudKit bridge helper와 Push 권한이 포함된 provisioning profile을 전제로 합니다. 원격 변경이 적용되면 `workspace-documents-changed` 이벤트로 문서 목록과 휴지통 목록을 경량 갱신합니다.
- 현재 앱은 Madi 저장소와 Madi iCloud 컨테이너만 사용합니다. 이전 전환용 로컬 DB import와 read-only iCloud import 경로는 런타임에서 제거된 상태입니다.
- AI 전용 세부 맥락은 루트 `AGENTS.md`와 `.agents/skills/` 아래 skill들에 둡니다.

## 실행 방법

- 의존성 설치: `pnpm install`
- 웹 프런트엔드 실행: `pnpm dev`
- Tauri 앱 실행: `pnpm tauri:dev`
- 로컬 signed 앱 확인: `pnpm tauri:dev:signed`
- 프런트엔드 빌드: `pnpm build`
- 앱 빌드: `pnpm tauri:build`
- 프런트엔드 테스트: `pnpm test:run`

`pnpm tauri:dev`와 `pnpm tauri:build`를 실제로 실행하려면 로컬에 Rust toolchain이 필요합니다.

로컬 릴리스 빌드는 아래 경로를 전제로 합니다.

- `/.env.release.local`
- `/.local-release/madi-updater.key`
- `/.local-release/Madi_Developer_ID_CloudKit.provisionprofile` 또는 `/.local-release/madi-cloudkit.provisionprofile`

`pnpm tauri:dev:signed`와 `pnpm tauri:build`는 위 파일 중 필요한 값을 자동으로 읽습니다. iCloud/Push가 포함된 실제 배포 빌드는 CloudKit 권한과 `aps-environment` 권한이 들어 있는 provisioning profile을 필요로 합니다.

## 릴리스 흐름

- 공식 설치 채널은 DMG입니다. 앱 내 업데이트는 Tauri updater용 `latest.json + .app.tar.gz + .sig` 산출물을 사용합니다.
- DMG 산출물은 Apple Silicon macOS용 `Madi_<version>.dmg`입니다.
- updater 기준 산출물은 `Madi_aarch64.app.tar.gz`, `Madi_aarch64.app.tar.gz.sig`, `latest.json`입니다.
- 자동 릴리스 워크플로우는 [`.github/workflows/release.yml`](.github/workflows/release.yml)에 남아 있습니다.
- 다만 현재 기준으로 가장 안정적으로 검증된 배포 경로는 `로컬 Mac에서 빌드/서명/공증/검증 후 gh release로 업로드`하는 방식입니다.
- 자동 워크플로우를 쓸 때는 `GitHub hosted macOS runner`가 공증된 `.app`과 updater 산출물을 만들고, `self-hosted Mac runner`가 DMG 생성과 release publish를 담당합니다.
- 수동 릴리스에서는 [`scripts/release-local.sh`](scripts/release-local.sh)가 검증, Apple Silicon app 빌드/서명/공증, updater 산출물 생성, DMG 공증, `latest.json` 생성, release 업로드를 한 번에 수행합니다.
- DMG 생성 스크립트는 [`scripts/create-dmg.sh`](scripts/create-dmg.sh) 기준으로 유지합니다.
- release는 DMG가 첨부되기 전까지 완료로 보지 않습니다.

## Madi 식별자

- 앱 bundle id는 `com.seongmin.madi`입니다.
- iCloud container는 `iCloud.com.seongmin.madi`입니다.
- CloudKit zone은 `MadiZone`입니다.

## 버전 및 배포 규칙

- 버전 변경 시 아래 4개 파일을 항상 같은 버전으로 맞춥니다.
  - [`package.json`](package.json)
  - [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)
  - [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml)
  - [`src-tauri/Cargo.lock`](src-tauri/Cargo.lock)의 `name = "madi"` 항목
- 태그는 반드시 `vX.Y.Z` 형식을 사용합니다.
- 릴리스 태그는 검증이 끝난 커밋에서만 생성합니다.
- 별도 지시가 없으면 릴리스 작업은 `main` 기준으로 진행합니다.
- DMG가 없는 release는 배포 완료로 취급하지 않습니다.

## 문서 안내

- 기본 작업 규칙: [AGENTS.md](AGENTS.md)
- UI/UX 디자인 기준: [DESIGN.md](DESIGN.md)
- AI 전용 상세 맥락: `.agents/skills/`
- README 갱신 기준: `readme-maintenance` skill

## README 유지 원칙

README는 모든 변경마다 고치지 않습니다. 설치/실행 방법, 제품 방향, 핵심 구조, 사용자나 기여자가 알아야 하는 워크플로가 바뀌는 의미 있는 변경에서만 갱신합니다. 자세한 기준은 `readme-maintenance` skill을 기준으로 따릅니다.
