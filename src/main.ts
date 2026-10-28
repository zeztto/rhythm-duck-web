import './style.css';
import { RhythmController } from './game/controller';
import { LANE_CODES } from './game/config';
import { createRhythmGame } from './game/phaser/createGame';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found.');
}

app.innerHTML = `
  <div class="app-shell" id="app-shell">
    <aside class="control-deck">
      <div class="brand-block">
        
        <h1>리듬 덕</h1>
        <p class="deck-copy">
          Q, W, E 세 레인으로 박자에 맞춰 오리를 격추하세요. 홀드는 눌러서 유지하고,
          황금 오리는 피버를 빠르게 채우며, 폭탄은 반드시 피해야 합니다. 모바일에서는
          아래 터치 패드로 바로 플레이할 수 있습니다.
        </p>
      </div>

      <div class="panel">
        <div class="panel-head">
          <span>플레이 상태</span>
          <strong id="mode-chip">준비</strong>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <span>최고 점수</span>
            <strong id="best-score">0</strong>
          </div>
          <div class="stat-card">
            <span>BPM</span>
            <strong id="bpm-value">132</strong>
          </div>
          <div class="stat-card">
            <span>곡</span>
            <strong id="track-title">오리의 박자</strong>
          </div>
          <div class="stat-card">
            <span>음원</span>
            <strong id="track-artist">직접 작성한 WebAudio 합성 패턴</strong>
          </div>
        </div>
      </div>

      <div class="panel controls-panel">
        <div class="panel-head">
          <span>조작</span>
          <strong>Q / W / E</strong>
        </div>
        <div class="controls-actions">
          <button class="action-btn primary" id="start-btn">시작</button>
          <button class="action-btn" id="restart-btn">다시 시작</button>
          <button class="action-btn" id="sync-btn">싱크 측정</button>
        </div>
        <p class="microcopy">
          데스크톱은 키보드, 모바일은 하단 터치 패드로 플레이합니다. F로 전체화면,
          Enter로 결과 화면에서 재시작. 싱크 테스트 중에는 Q/W/E 아무 키나 4회 이상
          눌러 평균 보정값을 계산합니다.
        </p>
      </div>

      <div class="panel sliders-panel">
        <div class="slider-row">
          <div class="slider-head">
            <label for="latency-slider">입력 보정</label>
            <strong id="latency-readout">0 ms</strong>
          </div>
          <input id="latency-slider" type="range" min="-150" max="150" step="1" value="0" />
        </div>
        <div class="slider-row">
          <div class="slider-head">
            <label for="volume-slider">음량</label>
            <strong id="volume-readout">72%</strong>
          </div>
          <input id="volume-slider" type="range" min="0" max="100" step="1" value="72" />
        </div>
        <div class="sync-readout" id="sync-state">
          싱크 측정 대기
        </div>
      </div>
    </aside>

    <main class="stage-panel">
      <p id="action-status" role="status" aria-live="polite"></p>
      <div class="hud-bar">
        <div class="hud-card">
          <span>점수</span>
          <strong id="score-value">0</strong>
        </div>
        <div class="hud-card">
          <span>콤보</span>
          <strong id="combo-value">0</strong>
        </div>
        <div class="hud-card">
          <span>정확도</span>
          <strong id="accuracy-value">100.0%</strong>
        </div>
      </div>

      <div class="meter-stack">
        <div class="meter">
          <div class="meter-label">
            <span>체력</span>
            <strong id="hp-value">100</strong>
          </div>
          <div class="meter-track"><div class="meter-fill hp-fill" id="hp-fill"></div></div>
        </div>
        <div class="meter">
          <div class="meter-label">
            <span>피버</span>
            <strong id="fever-label">대기</strong>
          </div>
          <div class="meter-track"><div class="meter-fill fever-fill" id="fever-fill"></div></div>
        </div>
        <div class="meter">
          <div class="meter-label">
            <span>곡 진행</span>
            <strong id="progress-value">0%</strong>
          </div>
          <div class="meter-track"><div class="meter-fill progress-fill" id="progress-fill"></div></div>
        </div>
      </div>

      <div class="stage-frame">
        <div id="game-root" class="game-root" role="img" aria-label="세 레인 리듬 게임. Q 왼쪽, W 가운데, E 오른쪽. 오리는 판정선에서 맞히고 폭탄은 피하세요."></div>
        <div class="overlay intro-overlay" id="intro-overlay">
          
          <h2>박자에 맞춰 오리를 맞히세요</h2>
          <p>시작 버튼 또는 Enter를 누르세요. 소리는 입력 후 활성화됩니다.</p>
        </div>
        <div class="overlay result-overlay hidden" id="result-overlay">
          <p>플레이 결과</p>
          <h2 id="result-title">곡 완료</h2>
          <div class="result-grid">
            <div><span>최종 점수</span><strong id="result-score">0</strong></div>
            <div><span>정확도</span><strong id="result-accuracy">0%</strong></div>
            <div><span>최대 콤보</span><strong id="result-combo">0</strong></div>
            <div><span>정확 / 좋음 / 성공 / 놓침</span><strong id="result-judgments">0 / 0 / 0 / 0</strong></div>
          </div>
          <p>Enter 또는 다시 시작 버튼으로 도전하세요.</p>
        </div>
      </div>

      <div class="touch-controls" id="touch-controls">
        <button class="touch-lane-btn lane-left" data-lane="0" type="button">
          <span>Q</span>
          <small>왼쪽</small>
        </button>
        <button class="touch-lane-btn lane-center" data-lane="1" type="button">
          <span>W</span>
          <small>가운데</small>
        </button>
        <button class="touch-lane-btn lane-right" data-lane="2" type="button">
          <span>E</span>
          <small>오른쪽</small>
        </button>
      </div>

      <div class="keyboard-guide" id="keyboard-guide">
        <div class="keycap" data-lane="0"><span>Q</span><small>왼쪽</small></div>
        <div class="keycap" data-lane="1"><span>W</span><small>가운데</small></div>
        <div class="keycap" data-lane="2"><span>E</span><small>오른쪽</small></div>
      </div>
    </main>
  </div>
`;

const controller = new RhythmController();
const game = createRhythmGame('game-root', controller);

const refs = {
  appShell: document.querySelector<HTMLElement>('#app-shell'),
  modeChip: document.querySelector<HTMLElement>('#mode-chip'),
  bestScore: document.querySelector<HTMLElement>('#best-score'),
  bpmValue: document.querySelector<HTMLElement>('#bpm-value'),
  trackTitle: document.querySelector<HTMLElement>('#track-title'),
  trackArtist: document.querySelector<HTMLElement>('#track-artist'),
  score: document.querySelector<HTMLElement>('#score-value'),
  combo: document.querySelector<HTMLElement>('#combo-value'),
  accuracy: document.querySelector<HTMLElement>('#accuracy-value'),
  hpValue: document.querySelector<HTMLElement>('#hp-value'),
  hpFill: document.querySelector<HTMLElement>('#hp-fill'),
  feverFill: document.querySelector<HTMLElement>('#fever-fill'),
  feverLabel: document.querySelector<HTMLElement>('#fever-label'),
  progressFill: document.querySelector<HTMLElement>('#progress-fill'),
  progressValue: document.querySelector<HTMLElement>('#progress-value'),
  introOverlay: document.querySelector<HTMLElement>('#intro-overlay'),
  resultOverlay: document.querySelector<HTMLElement>('#result-overlay'),
  resultTitle: document.querySelector<HTMLElement>('#result-title'),
  resultScore: document.querySelector<HTMLElement>('#result-score'),
  resultAccuracy: document.querySelector<HTMLElement>('#result-accuracy'),
  resultCombo: document.querySelector<HTMLElement>('#result-combo'),
  resultJudgments: document.querySelector<HTMLElement>('#result-judgments'),
  latencySlider: document.querySelector<HTMLInputElement>('#latency-slider'),
  volumeSlider: document.querySelector<HTMLInputElement>('#volume-slider'),
  latencyReadout: document.querySelector<HTMLElement>('#latency-readout'),
  volumeReadout: document.querySelector<HTMLElement>('#volume-readout'),
  syncState: document.querySelector<HTMLElement>('#sync-state'),
  actionStatus: document.querySelector<HTMLElement>('#action-status'),
  startBtn: document.querySelector<HTMLButtonElement>('#start-btn'),
  restartBtn: document.querySelector<HTMLButtonElement>('#restart-btn'),
  syncBtn: document.querySelector<HTMLButtonElement>('#sync-btn'),
  keycaps: Array.from(
    document.querySelectorAll<HTMLElement>('.keycap'),
  ),
  touchLaneButtons: Array.from(
    document.querySelectorAll<HTMLButtonElement>('.touch-lane-btn'),
  ),
};

Object.entries(refs).forEach(([key, value]) => {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`Missing required DOM reference: ${key}`);
  }
});

let actionError = '';
async function runAction(action: () => Promise<void>): Promise<void> {
  try { actionError = ''; await action(); }
  catch { actionError = '오디오를 시작하지 못했습니다. 브라우저의 소리 권한을 확인하고 다시 시도하세요.'; }
}
function ignoreShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey ||
    (event.target instanceof Element && (!!event.target.closest('input,textarea,select,[contenteditable="true"]') || (!!event.target.closest('button') && ['Enter', 'Space'].includes(event.code))));
}

refs.startBtn!.addEventListener('click', async () => {
  await runAction(() => controller.startRun());
});

refs.restartBtn!.addEventListener('click', async () => {
  await runAction(() => controller.restartRun());
});

refs.syncBtn!.addEventListener('click', async () => {
  await runAction(() => controller.startCalibration());
});

refs.introOverlay!.addEventListener('pointerdown', async (event) => {
  event.preventDefault();
  if (controller.getSnapshot().mode === 'intro') {
    await runAction(() => controller.startRun());
  }
});

refs.latencySlider!.addEventListener('input', () => {
  controller.setLatencyOffsetMs(Number(refs.latencySlider!.value));
});

refs.volumeSlider!.addEventListener('input', () => {
  controller.setMasterVolume(Number(refs.volumeSlider!.value) / 100);
});

refs.touchLaneButtons!.forEach((button, index) => {
  const laneCode = LANE_CODES[index]!;

  const releaseLane = () => {
    button.classList.remove('pressed');
    controller.handleKeyUp(laneCode);
  };

  button.addEventListener('pointerdown', async (event) => {
    event.preventDefault();
    button.classList.add('pressed');
    if (button.setPointerCapture) {
      button.setPointerCapture(event.pointerId);
    }
    await runAction(() => controller.handleKeyDown(laneCode));
  });

  button.addEventListener('pointerup', releaseLane);
  button.addEventListener('pointercancel', releaseLane);
  button.addEventListener('lostpointercapture', releaseLane);
});

window.addEventListener('keydown', async (event) => {
  if (ignoreShortcut(event) || event.repeat) return;
  if (event.code === 'KeyF') {
    event.preventDefault();
    await toggleFullscreen().catch(() => { actionError = '이 브라우저에서는 전체화면을 열지 못했습니다.'; });
    return;
  }

  if (['KeyQ', 'KeyW', 'KeyE', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter', 'Space'].includes(event.code)) {
    event.preventDefault();
  }

  await runAction(() => controller.handleKeyDown(event.code));
});

window.addEventListener('keyup', (event) => {
  if (['KeyQ', 'KeyW', 'KeyE'].includes(event.code)) {
    event.preventDefault();
  }

  controller.handleKeyUp(event.code);
});

function renderUi(): void {
  const snapshot = controller.getSnapshot();
  refs.actionStatus!.textContent = actionError || controller.getStatusMessage();
  refs.startBtn!.disabled = controller.isBusy() || snapshot.mode === 'playing' || snapshot.calibration.active;
  refs.restartBtn!.disabled = controller.isBusy() || snapshot.mode === 'intro';
  refs.syncBtn!.disabled = controller.isBusy() || snapshot.mode === 'playing' || snapshot.calibration.active;

  refs.modeChip!.textContent =
    snapshot.mode === 'intro'
      ? '준비'
      : snapshot.mode === 'playing'
        ? snapshot.feverActive
          ? '피버'
          : '플레이 중'
        : '결과';

  refs.bestScore!.textContent = snapshot.bestScore.toLocaleString();
  refs.bpmValue!.textContent = String(snapshot.bpm);
  refs.trackTitle!.textContent = snapshot.title;
  refs.trackArtist!.textContent = snapshot.artist;

  refs.score!.textContent = snapshot.score.toLocaleString();
  refs.combo!.textContent = `${snapshot.combo}`;
  refs.accuracy!.textContent = `${snapshot.accuracy.toFixed(1)}%`;
  refs.hpValue!.textContent = `${snapshot.hp}`;
  refs.hpFill!.style.width = `${snapshot.hp}%`;
  refs.feverFill!.style.width = `${snapshot.feverMeter}%`;
  refs.progressFill!.style.width = `${(snapshot.progress * 100).toFixed(1)}%`;
  refs.progressValue!.textContent = `${Math.round(snapshot.progress * 100)}%`;

  refs.feverLabel!.textContent = snapshot.feverActive
    ? `${(snapshot.feverRemainingMs / 1000).toFixed(1)}s x2`
    : snapshot.feverMeter >= 100
      ? '준비'
      : '대기';

  refs.latencySlider!.value = String(snapshot.latencyOffsetMs);
  refs.volumeSlider!.value = String(Math.round(snapshot.masterVolume * 100));
  refs.latencyReadout!.textContent = `${snapshot.latencyOffsetMs} ms`;
  refs.volumeReadout!.textContent = `${Math.round(snapshot.masterVolume * 100)}%`;

  refs.syncState!.textContent = snapshot.calibration.active
    ? `싱크 측정 중 (${snapshot.calibration.samples}회${
        snapshot.calibration.previewOffsetMs !== null
          ? `, 예상 ${snapshot.calibration.previewOffsetMs} ms`
          : ''
      })`
    : '싱크 측정 대기';

  refs.introOverlay!.classList.toggle('hidden', snapshot.mode !== 'intro');
  refs.resultOverlay!.classList.toggle('hidden', snapshot.mode !== 'ended');

  if (snapshot.summary) {
    refs.resultTitle!.textContent = snapshot.summary.cleared
      ? '곡 완료'
      : '체력 소진';
    refs.resultScore!.textContent = snapshot.summary.finalScore.toLocaleString();
    refs.resultAccuracy!.textContent = `${snapshot.summary.accuracy.toFixed(1)}%`;
    refs.resultCombo!.textContent = `${snapshot.summary.maxCombo}`;
    refs.resultJudgments!.textContent = `${snapshot.summary.perfect} / ${snapshot.summary.great} / ${snapshot.summary.good} / ${snapshot.summary.miss}`;
  }

  refs.keycaps!.forEach((keycap, index) => {
    const lane = snapshot.lanes[index];
    keycap.classList.toggle('active', lane.pressed || lane.pulse > 0.18);
    keycap.classList.toggle('holding', lane.holdActive);
    keycap.style.setProperty('--lane-accent', lane.recentAccent);
  });

  refs.touchLaneButtons!.forEach((button, index) => {
    const lane = snapshot.lanes[index];
    button.classList.toggle('active', lane.pressed || lane.pulse > 0.12);
    button.classList.toggle('holding', lane.holdActive);
    button.style.setProperty('--lane-accent', lane.recentAccent);
  });



  requestAnimationFrame(renderUi);
}

async function toggleFullscreen(): Promise<void> {
  const shell = refs.appShell!;

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await shell.requestFullscreen();
}

window.addEventListener('blur', () => { for (const code of LANE_CODES) controller.handleKeyUp(code); });

renderUi();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
