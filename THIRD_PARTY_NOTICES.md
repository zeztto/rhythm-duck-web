# 외부 라이브러리 고지

자체 MIT License는 아래 외부 라이브러리의 원 저작권·라이선스를 변경하지 않습니다. 실제 lockfile에서 이 환경에 설치된 package와 버전, 라이선스 원문 hash는 [index.json](third-party-licenses/index.json)에 기록했습니다. 원문은 `third-party-licenses/`에 byte 그대로 보존했습니다. 플랫폼별 optional package는 설치 환경에 따라 달라지며 해당 package의 원문 고지를 함께 유지해야 합니다.

- Runtime: Phaser 3.90.0, EventEmitter3 — MIT. Phaser가 포함한 구성 요소의 추가 고지는 Phaser LICENSE 원문을 따릅니다. 별도 Spine plugin은 import하거나 bundle하지 않습니다.
- Build/test: TypeScript — Apache-2.0, Vite·Vitest 및 관련 도구 — 각 MIT/BSD/Apache 등의 원문 조건을 따릅니다. TypeScript의 ThirdPartyNotice도 포함했습니다.
- 외부 image/audio/font asset은 동봉하지 않습니다. Canvas 도형과 oscillator 패턴은 자체 코드로 만듭니다. Google Fonts 요청은 제거했습니다.

라이브러리를 업그레이드하거나 다른 플랫폼용 binary를 배포할 때는 그 배포물의 고지를 다시 수집해야 합니다. 이 source 공개본에는 `node_modules/`와 production bundle을 넣지 않습니다.
