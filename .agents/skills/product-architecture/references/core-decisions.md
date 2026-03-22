# Core Decisions

## 확정된 전제

- MinNote는 `macOS 단독` 데스크톱 노트 앱을 목표로 합니다.
- 제품 방향은 `Heynote식 상위 블록 구분`과 `Notion식 Markdown 편집 경험`의 결합입니다.
- 상위 레벨은 블록 중심 구조를 유지합니다.
- 전체 구조는 `헥사고날 아키텍처`를 사용합니다.
- 순수 단일 `.md` 문서 모델로 모든 것을 설명하려는 접근은 피합니다.
- 별도 preview pane 중심 UX는 피합니다.
- Markdown 블록은 단순 preview 전용이 아니라 직접 편집 가능한 경험을 지향합니다.
- 코드 블록, 일반 텍스트 블록, Markdown 블록은 같은 성격으로 뭉개지지 않아야 합니다.
- 앱 셸은 `Tauri`를 사용합니다.
- 주 구현 언어는 `TypeScript + Rust`입니다.
- 프런트엔드 UI 프레임워크는 `React + TypeScript`입니다.
- 에디터 코어는 `BlockNote 기반 Markdown 편집기 + plain textarea 기반 Code/Text 편집기`입니다.
- 저장 방식은 `SQLite canonical`입니다.
- Markdown 블록의 canonical 저장 형식은 `normalized Markdown string`입니다.
- Code 블록의 canonical 저장 형식은 `plain string + language metadata`입니다.
- Plain text 블록의 canonical 저장 형식은 `plain string`입니다.
- 문서 데이터 모델은 `Document -> ordered Blocks` 구조입니다.
- 블록 순서는 문서별 `integer position`으로 저장합니다.
- 문서 제목 입력은 비워둘 수 있지만, 저장 시에는 `Untitled` 계열 이름으로 정규화합니다.
- 프런트엔드는 Tauri `invoke`를 통해 Rust command facade만 호출하고, SQLite 접근은 Rust 계층이 담당합니다.
- 1차 블록 종류는 `Markdown + Code + Plain text`입니다.
- Markdown 블록은 clipboard 기반 붙여넣기를 지원합니다.
- Code 블록과 Plain text 블록의 붙여넣기는 `plain string` 기준으로 처리합니다.
- v1에서는 파일 import/export UI를 두지 않습니다.
- 저장은 기본적으로 자동 저장이며, `Cmd+S`는 즉시 저장/flush 동작으로 지원합니다.
- `Cmd+A`는 현재 블록 전체 선택, 한 번 더 누르면 모든 블록 전체 선택으로 동작합니다.
- 삭제는 별도 확인 모달 없이 바로 처리합니다.
- 앱 종료 전에는 한 번 더 저장/flush 합니다.
- 별도 복구 UI는 v1에서 두지 않습니다.
- 기존 앱 코드를 포크하지는 않지만, 에디터와 렌더링에는 오픈소스 라이브러리를 사용합니다.

## 미정인 항목

- 문서 전체를 하나의 거대한 editor로 합치는 방향을 배제할지 여부는 아직 결정하지 않았습니다.
- 세부 모듈 경계, 포트/어댑터 배치, DB 스키마 상세 컬럼 구조는 아직 확정하지 않았습니다.

## 현재 선호하지만 확정하지 않은 방향

- 기존 scratchpad 앱을 조금씩 덧대는 식으로 본질을 바꾸는 접근
- 블록 구분감이 약해져 Heynote식 장점이 사라지는 방향

## 구현 관점의 의미

- 상위 구조는 블록 shell이 분명해야 합니다.
- Markdown 블록은 렌더링된 것처럼 보이되 편집 가능한 경험을 우선 검토합니다.
- 제품의 중심 장점은 “구조적 블록 분리”와 “빠른 편집”의 균형입니다.
- 헥사고날 아키텍처 기준으로 블록/문서 도메인, 저장소, 에디터 어댑터, 데스크톱 어댑터의 경계를 분리해야 합니다.
- 저장 계층에서는 `Document`와 `ordered Blocks`를 중심으로 repository port를 설계하고, Markdown 블록은 정규화된 Markdown 문자열을 저장하는 방향을 기본값으로 둡니다.
- Code 블록은 구조화된 rich format 대신 원문 문자열과 언어 메타데이터를 저장하는 방향을 기본값으로 둡니다.
- Plain text 블록은 별도 구조 없이 원문 문자열을 저장하는 방향을 기본값으로 둡니다.
- 블록 순서는 fractional index보다 단순한 `integer position`을 기본값으로 둡니다.
- 문서 메타데이터에는 제목 필드를 두되, 사용자가 비워두면 저장 시 `Untitled` 계열 이름으로 정규화하는 방향을 기본값으로 둡니다.
- 프런트엔드는 저장소나 SQL을 직접 알지 않고, Rust command facade -> application service -> repository port -> SQLite adapter 흐름을 따릅니다.
- 붙여넣기 경험은 block type에 따라 다르게 처리하고, 파일 import/export는 별도 기능으로 미룹니다.
- 자동 저장을 기본값으로 두고, 명시적 저장 단축키는 flush 성격으로 취급합니다.

## Gotchas

- “Markdown 지원”을 곧바로 “정적 preview 추가”로 해석하지 않습니다.
- “Notion식”을 곧바로 “문서 전체 WYSIWYG”로 해석하지 않습니다.
- 저장 포맷, 블록 모델, 에디터 선택처럼 되돌리기 비싼 결정을 임의로 확정하지 않습니다.
