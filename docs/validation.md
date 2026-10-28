# 검증

## 자동 검증

Node.js 26.8.1 / npm 11.19.0 / macOS arm64에서 새 `npm ci --ignore-scripts --no-fund` 후 typecheck, 35개 Vitest 회귀, production build를 실행했습니다. `npm audit`의 잔존 취약점은 0건입니다. build는 Phaser 단일 chunk가 500 kB를 넘는다는 크기 경고를 냅니다. 오류를 무시하거나 테스트 실패를 성공으로 변환하지 않습니다.

실제 수정 전 회귀는 21건 중 10건이 실패했습니다. 홀드 종료 tick 누락, 홀드 중단·폭탄이 정확도에 미반영되는 문제, frame 수에 따른 피버 감소, 역행 시간, 동시 시작, 종료 timestamp 재사용, 저장 예외·잘못된 설정, 오디오 시작 실패의 상태 전이가 대상입니다. 수정 후 해당 회귀 및 작성 chart 전체 진행 테스트가 통과했습니다. 테스트용 chart와 audio double은 `tests/`에 격리되며 product chart·WebAudio 구현과 구별합니다.

## 실제 브라우저 검증

`npm run preview`로 생성한 동일 production build를 단독 browser QA에 전달했습니다. 준비한 flow는 desktop·360/390 px에서 시작, 키보드/터치, hold·bomb, 실제 시간 진행에 의한 결과, 재시작, 음량·싱크 측정입니다. browser 결과를 받기 전에는 실제 소리 출력·모바일 조작이 통과했다고 주장하지 않습니다. source 공개 freeze의 readiness 보고서가 최종 QA 결과와 source/bundle hash를 연결합니다.

CI는 checkout과 Node setup을 commit SHA로 고정하고 `contents: read`만 부여합니다. 설치·typecheck·test·build·audit를 실행하며 배포 권한이나 작업은 없습니다. CI 설정의 존재와 원격 CI 실행 성공은 별도 증거입니다.

저장 경계의 추가 회귀의 수정 전 12건 중10건이 실패했고, 후속 알 수 없는 version/field 보존 회귀도 추가했습니다. 실제 Controller에서 malformed/null/잘못된 shape, 초기 read-denied와 write-success, 후발 손상·읽기 실패는0-write/원문 보존·visible 안내로 전환하고, missing/valid는 정상 저장되는 control을 함께 검증했습니다. flags를 loadSettings보다 먼저 초기화하여 안내·차단 상태가 class field 순서로 사라지지 않게 했습니다. 원R1 source·bundle·실패 로그는 보존했습니다.
