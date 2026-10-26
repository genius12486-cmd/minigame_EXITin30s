/**
 * 방탈출 로그라이크 : 더 머신 (The Machine)
 * 8버튼 회전 미니게임 & 다이얼 투입 문 & 빈 방 클리어 엔진
 */

(() => {
  'use strict';

  // ===== 1. 핵심 설정 및 상수 =====
  const STORAGE_KEY = 'THE_MACHINE_SAVE_V6';
  const PASSCODE_SECRET = '8426';

  // 난이도 단일 수치 변수: 문 개방에 필요한 정확한 토큰 수 (카드 3)
  const DIFFICULTY_PRESETS = {
    A: { name: '설정 A (표준 5개)', targetTokens: 5 },
    B: { name: '설정 B (어려움 10개)', targetTokens: 10 }
  };

  // 런타임 게임 상태 (매 판 초기화)
  let state = {
    status: 'READY', // 'READY', 'PLAYING', 'CLEAR_TRUE', 'GAME_OVER'
    timeRemaining: 30.0,
    currentTokens: 0,
    activeDifficulty: 'A',

    // 왼쪽 문 다이얼 투입 및 개방 상태
    leftDoorOpen: false,
    doorDialAmount: 0,

    // 8버튼 원형 다이얼 미니게임 (1~8)
    dialStep: 1,
    gearAngle: 0,

    // 키패드 입력값 (오른쪽 문)
    keypadInput: '',

    // 현재 열려있는 줌인 뷰 ('none', 'doorLeft', 'machine', 'desk', 'chest', 'doorRight', 'emptyRoom')
    currentView: 'none',

    totalPlaySeconds: 0
  };

  // 영구 보존 상태 (localStorage - 카드 4)
  let persistentData = {
    chestTokens: 0,
    isMuted: false,
    isReducedMotion: false,
    activeDifficulty: 'A',
    history: []
  };

  let lastRealTime = 0;
  let animationFrameId = null;
  let backgroundIntervalId = null;

  // ===== 2. 무음원 Web Audio API 사운드 합성 (카드 5) =====
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) audioCtx = new AudioClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.08) {
    if (persistentData.isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // 오디오 예외 무시
    }
  }

  const SoundFX = {
    click: () => playTone(600, 'sine', 0.05, 0.05),
    dialStep: (step) => playTone(400 + step * 60, 'sine', 0.06, 0.07),
    dialComplete: () => {
      playTone(784, 'triangle', 0.1, 0.1);
      setTimeout(() => playTone(1046, 'triangle', 0.15, 0.12), 80);
    },
    dialError: () => playTone(180, 'sawtooth', 0.2, 0.12),
    extendTime: () => {
      // 2초 연장 소리
      playTone(587.33, 'sine', 0.08, 0.08);
      setTimeout(() => playTone(880, 'sine', 0.12, 0.09), 70);
    },
    doorOpen: () => {
      // 문 열림 소리
      playTone(400, 'triangle', 0.15, 0.1);
      setTimeout(() => playTone(600, 'triangle', 0.2, 0.12), 120);
    },
    doorFail: () => playTone(150, 'sawtooth', 0.3, 0.15),
    claimChest: () => {
      playTone(440, 'square', 0.1, 0.06);
      setTimeout(() => playTone(880, 'square', 0.15, 0.08), 100);
    },
    clearFanfare: () => {
      const melody = [523, 659, 783, 1046, 1318];
      melody.forEach((f, i) => {
        setTimeout(() => playTone(f, 'sine', 0.2, 0.14), i * 120);
      });
    },
    keyPress: () => playTone(750, 'sine', 0.04, 0.04),
    keyError: () => playTone(180, 'sawtooth', 0.25, 0.12),
    trueClear: () => {
      [330, 392, 493, 587, 659].forEach((f, i) => {
        setTimeout(() => playTone(f, 'triangle', 0.35, 0.12), i * 180);
      });
    },
    gameOver: () => {
      playTone(180, 'sawtooth', 0.4, 0.15);
      setTimeout(() => playTone(120, 'sawtooth', 0.6, 0.2), 300);
    }
  };

  // ===== 3. DOM 요소 캐싱 =====
  const DOM = {
    timeDisplay: document.getElementById('timeDisplay'),
    hudTimer: document.getElementById('hudTimer'),
    tokenDisplay: document.getElementById('tokenDisplay'),
    chestDisplay: document.getElementById('chestDisplay'),
    btnMute: document.getElementById('btnMute'),
    btnReducedMotion: document.getElementById('btnReducedMotion'),
    btnResetSave: document.getElementById('btnResetSave'),
    statusLogText: document.getElementById('statusLogText'),

    startScreenOverlay: document.getElementById('startScreenOverlay'),
    btnStartGame: document.getElementById('btnStartGame'),

    // 룸 오브젝트
    propDoorLeft: document.getElementById('propDoorLeft'),
    doorLeftImg: document.getElementById('doorLeftImg'),
    propDesk: document.getElementById('propDesk'),
    propChest: document.getElementById('propChest'),
    propMachine: document.getElementById('propMachine'),
    propDoorRight: document.getElementById('propDoorRight'),
    doorRightImg: document.getElementById('doorRightImg'),

    // 줌인 레이어 & 뷰
    closeupLayer: document.getElementById('closeupLayer'),
    btnCloseCloseup: document.getElementById('btnCloseCloseup'),
    viewDoorLeft: document.getElementById('viewDoorLeft'),
    inspectDoorLeftImg: document.getElementById('inspectDoorLeftImg'),
    doorClosedPanel: document.getElementById('doorClosedPanel'),
    doorOpenPanel: document.getElementById('doorOpenPanel'),
    btnDialMinus: document.getElementById('btnDialMinus'),
    btnDialPlus: document.getElementById('btnDialPlus'),
    dialAmountNum: document.getElementById('dialAmountNum'),
    btnSubmitDial: document.getElementById('btnSubmitDial'),
    doorFeedbackMsg: document.getElementById('doorFeedbackMsg'),
    btnEnterLeftDoor: document.getElementById('btnEnterLeftDoor'),

    // 기계 미니게임
    circleDial: document.getElementById('circleDial'),
    gearSpinner: document.getElementById('gearSpinner'),
    stepCounter: document.getElementById('stepCounter'),
    dialGuideText: document.getElementById('dialGuideText'),
    dialBtns: [
      document.getElementById('dBtn1'),
      document.getElementById('dBtn2'),
      document.getElementById('dBtn3'),
      document.getElementById('dBtn4'),
      document.getElementById('dBtn5'),
      document.getElementById('dBtn6'),
      document.getElementById('dBtn7'),
      document.getElementById('dBtn8')
    ],
    btnExtend: document.getElementById('btnExtend'),

    // 기타 뷰
    viewMachine: document.getElementById('viewMachine'),
    viewDesk: document.getElementById('viewDesk'),
    viewChest: document.getElementById('viewChest'),
    crateCountText: document.getElementById('crateCountText'),
    btnTakeChest: document.getElementById('btnTakeChest'),

    viewDoorRight: document.getElementById('viewDoorRight'),
    keypadScreen: document.getElementById('keypadScreen'),
    keypadStatus: document.getElementById('keypadStatus'),
    btnKeyClear: document.getElementById('btnKeyClear'),
    btnKeyEnter: document.getElementById('btnKeyEnter'),

    // 빈 방 뷰 (요구사항 6)
    viewEmptyRoom: document.getElementById('viewEmptyRoom'),
    btnBlankClear: document.getElementById('btnBlankClear'),
    btnReturnToMainRoom: document.getElementById('btnReturnToMainRoom'),

    // 모달들
    clearMessageModal: document.getElementById('clearMessageModal'),
    btnCloseClearMessage: document.getElementById('btnCloseClearMessage'),

    resultModal: document.getElementById('resultModal'),
    modalIcon: document.getElementById('modalIcon'),
    modalTitle: document.getElementById('modalTitle'),
    modalContent: document.getElementById('modalContent'),
    btnRestartGame: document.getElementById('btnRestartGame'),

    // 난이도 및 기록
    btnDiffA: document.getElementById('btnDiffA'),
    btnDiffB: document.getElementById('btnDiffB'),
    btnOpenHistory: document.getElementById('btnOpenHistory'),
    historyBadge: document.getElementById('historyBadge'),
    historyModal: document.getElementById('historyModal'),
    historyTableBody: document.getElementById('historyTableBody'),
    btnExportHistory: document.getElementById('btnExportHistory'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    btnCloseHistory: document.getElementById('btnCloseHistory')
  };

  // ===== 4. 로컬 저장소 안전 관리 (카드 4) =====
  function loadPersistentData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      savePersistentData();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.chestTokens === 'number' && !isNaN(parsed.chestTokens)) {
        persistentData.chestTokens = Math.max(0, Math.floor(parsed.chestTokens));
      }
      if (typeof parsed.isMuted === 'boolean') persistentData.isMuted = parsed.isMuted;
      if (typeof parsed.isReducedMotion === 'boolean') persistentData.isReducedMotion = parsed.isReducedMotion;
      if (parsed.activeDifficulty === 'A' || parsed.activeDifficulty === 'B') {
        persistentData.activeDifficulty = parsed.activeDifficulty;
      }
      if (Array.isArray(parsed.history)) {
        persistentData.history = parsed.history.slice(0, 50);
      }
    } catch (e) {
      console.warn('[The Machine] 손상 저장값 감지, 기본값 복구', e);
      savePersistentData();
    }
  }

  function savePersistentData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentData));
    } catch (e) {
      console.error('[The Machine] 저장 공간 오류:', e);
    }
  }

  // ===== 5. 게임 루프 & 실시간 타이머 (창 이동해도 멈추지 않음) =====
  function handleGameStartButtonClick() {
    DOM.startScreenOverlay.style.display = 'none';
    startCountdown();
  }

  function startCountdown() {
    state.status = 'PLAYING';
    state.timeRemaining = 30.0;
    state.currentTokens = 0;
    state.leftDoorOpen = false;
    state.doorDialAmount = 0;
    state.dialStep = 1;
    state.gearAngle = 0;
    state.keypadInput = '';
    state.totalPlaySeconds = 0;

    DOM.doorLeftImg.src = 'assets/door_closed.png';
    DOM.inspectDoorLeftImg.src = 'assets/door_closed.png';
    DOM.doorClosedPanel.style.display = 'flex';
    DOM.doorOpenPanel.style.display = 'none';
    DOM.doorFeedbackMsg.textContent = '';
    DOM.dialAmountNum.textContent = '0';

    DOM.doorRightImg.src = 'assets/door_closed.png';

    closeCloseup();
    DOM.resultModal.style.display = 'none';
    DOM.clearMessageModal.style.display = 'none';

    DOM.keypadScreen.textContent = '_ _ _ _';
    DOM.keypadStatus.textContent = '암호를 입력하세요.';
    DOM.keypadStatus.style.color = '#94a3b8';

    updateDialVisuals();
    setLog('게임 시작! 30초 산소 타이머가 가동되었습니다.');
    updateUI();

    lastRealTime = Date.now();

    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(gameLoop);
    }

    if (backgroundIntervalId) clearInterval(backgroundIntervalId);
    backgroundIntervalId = setInterval(tickTime, 100);
  }

  // ★ 다시 시작할 때 즉시 시작하지 않고 시작 화면 오버레이로 이동
  function prepareRestart() {
    state.status = 'READY';
    state.timeRemaining = 30.0;
    state.currentTokens = 0;
    state.leftDoorOpen = false;
    state.doorDialAmount = 0;
    state.dialStep = 1;
    state.gearAngle = 0;

    if (backgroundIntervalId) clearInterval(backgroundIntervalId);
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    DOM.doorLeftImg.src = 'assets/door_closed.png';
    DOM.inspectDoorLeftImg.src = 'assets/door_closed.png';
    DOM.doorRightImg.src = 'assets/door_closed.png';

    closeCloseup();
    DOM.resultModal.style.display = 'none';
    DOM.clearMessageModal.style.display = 'none';

    DOM.startScreenOverlay.style.display = 'flex';
    setLog('시작 버튼을 누르면 새 판이 시작됩니다.');
    updateUI();
  }

  function tickTime() {
    if (state.status !== 'PLAYING') return;
    const now = Date.now();
    const delta = (now - lastRealTime) / 1000;
    lastRealTime = now;

    if (delta > 0) {
      state.totalPlaySeconds += delta;
      state.timeRemaining = Math.max(0, state.timeRemaining - delta);

      if (state.timeRemaining <= 0) {
        handleGameOver();
      }
      updateUI();
    }
  }

  function gameLoop() {
    tickTime();
    if (state.status === 'PLAYING') {
      animationFrameId = requestAnimationFrame(gameLoop);
    } else {
      animationFrameId = null;
    }
  }

  function setLog(text) {
    DOM.statusLogText.textContent = text;
  }

  // ===== 6. 줌인(클로즈업) 뷰 전환 =====
  function openCloseup(viewName) {
    if (state.status !== 'PLAYING') return;
    state.currentView = viewName;
    SoundFX.click();

    DOM.viewDoorLeft.style.display = (viewName === 'doorLeft') ? 'block' : 'none';
    DOM.viewMachine.style.display = (viewName === 'machine') ? 'block' : 'none';
    DOM.viewDesk.style.display = (viewName === 'desk') ? 'block' : 'none';
    DOM.viewChest.style.display = (viewName === 'chest') ? 'block' : 'none';
    DOM.viewDoorRight.style.display = (viewName === 'doorRight') ? 'block' : 'none';
    DOM.viewEmptyRoom.style.display = (viewName === 'emptyRoom') ? 'block' : 'none';

    if (viewName === 'machine') {
      updateDialVisuals();
    }

    DOM.closeupLayer.style.display = 'flex';
    updateUI();
  }

  function closeCloseup() {
    state.currentView = 'none';
    DOM.closeupLayer.style.display = 'none';
    SoundFX.click();
    setLog('방 중앙을 둘러보고 있습니다.');
  }

  // ===== 7. 기계 8버튼 회전 미니게임 & 🪙 떠오르는 토큰 FX =====
  function handleDialButtonClick(btnStep) {
    if (state.status !== 'PLAYING') return;

    if (btnStep === state.dialStep) {
      SoundFX.dialStep(btnStep);
      state.gearAngle += 45;
      DOM.gearSpinner.style.transform = `rotate(${state.gearAngle}deg)`;

      if (btnStep < 8) {
        state.dialStep = btnStep + 1;
        updateDialVisuals();
      } else {
        // ★ 8번 완주 -> 토큰 +1 & 떠오르는 토큰 FX 애니메이션
        SoundFX.dialComplete();
        state.currentTokens += 1;
        state.dialStep = 1;
        updateDialVisuals();

        triggerFloatingTokenFx();
        setLog(`[회전 성공!] 토큰 +1 획득! (현재 토큰: ${state.currentTokens}개)`);
        updateUI();
      }
    } else {
      SoundFX.dialError();
      const clickedBtn = DOM.dialBtns[btnStep - 1];
      if (clickedBtn) {
        clickedBtn.classList.add('error-step');
        setTimeout(() => clickedBtn.classList.remove('error-step'), 300);
      }
      state.dialStep = 1;
      updateDialVisuals();
      setLog('[순서 오류] 1번부터 시계 방향으로 누르세요.');
    }
  }

  // 떠오르는 토큰 FX 애니메이션 (요구사항 4)
  function triggerFloatingTokenFx() {
    if (persistentData.isReducedMotion) return;
    const floatFx = document.createElement('div');
    floatFx.className = 'floating-token-fx';
    floatFx.textContent = '🪙 +1';
    DOM.circleDial.appendChild(floatFx);
    setTimeout(() => floatFx.remove(), 850);
  }

  function updateDialVisuals() {
    DOM.stepCounter.textContent = `${state.dialStep} / 8`;
    DOM.dialGuideText.textContent = `${state.dialStep}번 버튼 클릭!`;

    DOM.dialBtns.forEach((btn, idx) => {
      const stepNum = idx + 1;
      btn.classList.remove('next-step', 'passed-step', 'error-step');
      if (stepNum < state.dialStep) {
        btn.classList.add('passed-step');
      } else if (stepNum === state.dialStep) {
        btn.classList.add('next-step');
      }
    });
  }

  // 시간 연장 (★ 1토큰 = +2초 연장)
  function handleExtend() {
    if (state.status !== 'PLAYING') return;
    if (state.currentTokens < 1) {
      setLog('토큰이 부족합니다.');
      return;
    }
    state.currentTokens -= 1;
    state.timeRemaining += 2.0; // 1토큰당 2초 연장!
    SoundFX.extendTime();
    setLog(`[시간 연장] 토큰 1개 소모 ➡️ 생존시간 +2초 확보! (${state.timeRemaining.toFixed(1)}s)`);
    updateUI();
  }

  // ===== 8. 왼쪽 문 다이얼 투입 & 빈 방 클리어 로직 (요구사항 5, 6) =====
  function handleDialMinus() {
    if (state.doorDialAmount > 0) {
      state.doorDialAmount--;
      DOM.dialAmountNum.textContent = state.doorDialAmount;
      SoundFX.click();
    }
  }

  function handleDialPlus() {
    state.doorDialAmount++;
    DOM.dialAmountNum.textContent = state.doorDialAmount;
    SoundFX.click();
  }

  function handleSubmitDial() {
    if (state.status !== 'PLAYING') return;
    if (state.leftDoorOpen) return;

    const amount = state.doorDialAmount;
    if (amount <= 0) {
      DOM.doorFeedbackMsg.textContent = '투입할 토큰 수량을 1개 이상 맞춰주세요.';
      DOM.doorFeedbackMsg.style.color = '#f87171';
      return;
    }

    if (state.currentTokens < amount) {
      DOM.doorFeedbackMsg.textContent = `소지 토큰이 부족합니다! (소지: ${state.currentTokens}개)`;
      DOM.doorFeedbackMsg.style.color = '#f87171';
      return;
    }

    // 토큰 소모
    state.currentTokens -= amount;
    const required = DIFFICULTY_PRESETS[state.activeDifficulty].targetTokens; // 5개 (표준)

    if (amount === required) {
      // 정확한 개수 투입 -> 문 개방!
      state.leftDoorOpen = true;
      DOM.doorLeftImg.src = 'assets/door_open.png';
      DOM.inspectDoorLeftImg.src = 'assets/door_open.png';
      DOM.doorClosedPanel.style.display = 'none';
      DOM.doorOpenPanel.style.display = 'flex';
      SoundFX.doorOpen();
      setLog(`[문 개방] 철컥! 정확히 토큰 ${amount}개를 투입하여 문이 활짝 열렸습니다!`);
    } else {
      // 정확하지 않은 개수 -> 누적되지 않고 토큰 소멸!
      SoundFX.doorFail();
      DOM.doorFeedbackMsg.textContent = `토큰 ${amount}개가 투입구 속으로 사라졌지만 문은 열리지 않았습니다... (토큰 소멸)`;
      DOM.doorFeedbackMsg.style.color = '#f87171';
      setLog(`[투입 실패] 토큰 ${amount}개가 소멸되었습니다.`);
    }

    state.doorDialAmount = 0;
    DOM.dialAmountNum.textContent = '0';
    updateUI();
  }

  // 열린 문 너머의 빈 방으로 들어가기
  function handleEnterLeftDoor() {
    openCloseup('emptyRoom');
    setLog('열린 문 너머의 빈 방으로 들어왔습니다. 가운데에 빈 버튼이 있습니다.');
  }

  // 빈 방의 빈 버튼 클릭 -> "축하합니다. 게임 클리어" 안내창 노출 (게임은 계속 진행!)
  function handleBlankButtonClick() {
    SoundFX.clearFanfare();
    recordHistory('빈 방 클리어 (버튼 작동)', '정확한 5개 투입 후 빈 방 버튼 클릭');
    DOM.clearMessageModal.style.display = 'flex';
    setLog('[클리어 안내] 빈 방의 버튼이 작동되었습니다. 게임을 계속 이어갈 수 있습니다.');
  }

  function handleCloseClearMessage() {
    DOM.clearMessageModal.style.display = 'none';
  }

  // ===== 9. 기타 오브젝트 상호작용 =====

  // 상자 토큰 모두 회수
  function handleTakeChest() {
    if (state.status !== 'PLAYING') return;
    if (persistentData.chestTokens <= 0) {
      setLog('상자가 비어 있습니다.');
      return;
    }
    const claimed = persistentData.chestTokens;
    state.currentTokens += claimed;
    persistentData.chestTokens = 0;
    savePersistentData();
    SoundFX.claimChest();
    setLog(`상자에서 토큰 ${claimed}개를 모두 꺼냈습니다.`);
    updateUI();
  }

  // 오른쪽 문 키패드
  function handleKeyPress(digit) {
    if (state.status !== 'PLAYING') return;
    if (state.keypadInput.length >= 4) return;
    state.keypadInput += digit;
    SoundFX.keyPress();
    renderKeypad();
  }

  function handleKeyClear() {
    state.keypadInput = '';
    SoundFX.keyPress();
    renderKeypad();
  }

  function handleKeyEnter() {
    if (state.status !== 'PLAYING') return;
    if (state.keypadInput === PASSCODE_SECRET) {
      handleTrueClear();
    } else {
      SoundFX.keyError();
      DOM.keypadStatus.textContent = '❌ 암호 불일치!';
      DOM.keypadStatus.style.color = '#f87171';
      state.keypadInput = '';
      renderKeypad();
    }
  }

  function renderKeypad() {
    const padded = (state.keypadInput + '____').slice(0, 4);
    DOM.keypadScreen.textContent = padded.split('').join(' ');
  }

  // 진엔딩 (오른쪽 격벽)
  function handleTrueClear() {
    state.status = 'CLEAR_TRUE';
    if (backgroundIntervalId) clearInterval(backgroundIntervalId);
    DOM.doorRightImg.src = 'assets/door_open.png';
    closeCloseup();
    SoundFX.trueClear();
    recordHistory('보안문 해제 (진엔딩)', '4자리 암호 해제');

    DOM.modalIcon.textContent = '🌌';
    DOM.modalTitle.textContent = '진정한 탈출!';
    DOM.modalTitle.style.color = '#34d399';
    DOM.modalContent.innerHTML = `
      <p style="font-size:1.05rem; color:#f1f5f9; font-weight:700;">
        비밀 암호가 일치하며 보안문이 열리고 시설의 심층 구역으로 진입했습니다.
      </p>
      <div style="background:rgba(52, 211, 153, 0.12); padding:14px; border-radius:8px; margin:16px 0; font-size:0.92rem;">
        ⏱️ 달성 시간: <strong>${state.totalPlaySeconds.toFixed(1)}초</strong><br>
        📦 총 누적 유산: <strong>${persistentData.chestTokens + state.currentTokens}개</strong>
      </div>
    `;
    DOM.resultModal.style.display = 'flex';
    updateUI();
  }

  // 게임오버 (30초 종료)
  function handleGameOver() {
    state.status = 'GAME_OVER';
    if (backgroundIntervalId) clearInterval(backgroundIntervalId);
    closeCloseup();
    DOM.clearMessageModal.style.display = 'none';
    SoundFX.gameOver();

    const saved = state.currentTokens;
    persistentData.chestTokens += saved;
    savePersistentData();

    recordHistory('산소 고갈 (사망)', `토큰 ${saved}개 상자 저장`);

    DOM.modalIcon.textContent = '💀';
    DOM.modalTitle.textContent = '시간 초과';
    DOM.modalTitle.style.color = '#f87171';
    DOM.modalContent.innerHTML = `
      <p style="font-size:0.95rem; color:#f1f5f9;">
        30초 산소 제한 시간이 모두 지났습니다.
      </p>
      <div style="background:rgba(248, 113, 113, 0.12); padding:14px; border-radius:8px; margin:16px 0; font-size:0.92rem;">
        📦 가지고 있던 <strong>${saved}개</strong>의 토큰은 사라지지 않고<br>
        <strong>[상자]</strong>에 안전하게 보관되었습니다!
      </div>
    `;
    DOM.resultModal.style.display = 'flex';
    updateUI();
  }

  function recordHistory(result, detail) {
    const entry = {
      id: persistentData.history.length + 1,
      difficulty: DIFFICULTY_PRESETS[state.activeDifficulty].name,
      result: result,
      duration: `${state.totalPlaySeconds.toFixed(1)}s`,
      tokens: state.currentTokens,
      detail: detail
    };
    persistentData.history.unshift(entry);
    savePersistentData();
    DOM.historyBadge.textContent = persistentData.history.length;
  }

  // ===== 10. UI 동기화 =====
  function updateUI() {
    DOM.timeDisplay.textContent = `${state.timeRemaining.toFixed(1)}s`;
    DOM.tokenDisplay.textContent = state.currentTokens;
    DOM.chestDisplay.textContent = persistentData.chestTokens;

    if (state.timeRemaining <= 10.0 && state.status === 'PLAYING') {
      DOM.hudTimer.classList.add('danger-state');
    } else {
      DOM.hudTimer.classList.remove('danger-state');
    }

    DOM.btnExtend.disabled = (state.currentTokens < 1);
    DOM.crateCountText.textContent = persistentData.chestTokens;
    DOM.btnTakeChest.disabled = (persistentData.chestTokens <= 0);

    DOM.btnMute.textContent = persistentData.isMuted ? '🔇 음소거 중' : '🔊 소리 켬';
    DOM.btnReducedMotion.textContent = persistentData.isReducedMotion ? '🛑 연출 끔' : '✨ 연출 켬';
  }

  // ===== 11. 이벤트 바인딩 =====
  DOM.btnStartGame.addEventListener('click', handleGameStartButtonClick);

  // 룸 오브젝트 클릭
  DOM.propDoorLeft.addEventListener('click', () => {
    openCloseup('doorLeft');
    setLog(state.leftDoorOpen ? '열려 있는 문을 바라봅니다.' : '문을 조사합니다.');
  });
  DOM.propMachine.addEventListener('click', () => {
    openCloseup('machine');
    setLog('기계를 조사합니다.');
  });
  DOM.propDesk.addEventListener('click', () => {
    openCloseup('desk');
    setLog('책상을 조사합니다.');
  });
  DOM.propChest.addEventListener('click', () => {
    openCloseup('chest');
    setLog('상자를 조사합니다.');
  });
  DOM.propDoorRight.addEventListener('click', () => {
    openCloseup('doorRight');
    setLog('문을 조사합니다.');
  });

  DOM.btnCloseCloseup.addEventListener('click', closeCloseup);

  // 8버튼 다이얼
  DOM.dialBtns.forEach((btn, idx) => {
    const stepNum = idx + 1;
    btn.addEventListener('click', () => handleDialButtonClick(stepNum));
  });

  DOM.btnExtend.addEventListener('click', handleExtend);

  // 왼쪽 문 다이얼 조작
  DOM.btnDialMinus.addEventListener('click', handleDialMinus);
  DOM.btnDialPlus.addEventListener('click', handleDialPlus);
  DOM.btnSubmitDial.addEventListener('click', handleSubmitDial);
  DOM.btnEnterLeftDoor.addEventListener('click', handleEnterLeftDoor);

  // 빈 방 조작 (요구사항 6)
  DOM.btnBlankClear.addEventListener('click', handleBlankButtonClick);
  DOM.btnReturnToMainRoom.addEventListener('click', () => {
    openCloseup('doorLeft');
  });
  DOM.btnCloseClearMessage.addEventListener('click', handleCloseClearMessage);

  // 상자 회수
  DOM.btnTakeChest.addEventListener('click', handleTakeChest);

  // 키패드
  document.querySelectorAll('.key-btn[data-key]').forEach(btn => {
    btn.addEventListener('click', () => handleKeyPress(btn.getAttribute('data-key')));
  });
  DOM.btnKeyClear.addEventListener('click', handleKeyClear);
  DOM.btnKeyEnter.addEventListener('click', handleKeyEnter);

  DOM.btnRestartGame.addEventListener('click', prepareRestart);

  // 음소거 & 연출 토글
  DOM.btnMute.addEventListener('click', () => {
    persistentData.isMuted = !persistentData.isMuted;
    savePersistentData();
    updateUI();
  });

  DOM.btnReducedMotion.addEventListener('click', () => {
    persistentData.isReducedMotion = !persistentData.isReducedMotion;
    document.body.classList.toggle('reduced-motion', persistentData.isReducedMotion);
    savePersistentData();
    updateUI();
  });

  DOM.btnResetSave.addEventListener('click', () => {
    if (confirm('모든 상자 토큰과 기록을 초기화하시겠습니까?')) {
      persistentData = {
        chestTokens: 0,
        isMuted: false,
        isReducedMotion: false,
        activeDifficulty: state.activeDifficulty,
        history: []
      };
      savePersistentData();
      prepareRestart();
    }
  });

  // 난이도 전환 (카드 3)
  DOM.btnDiffA.addEventListener('click', () => {
    state.activeDifficulty = 'A';
    persistentData.activeDifficulty = 'A';
    DOM.btnDiffA.classList.add('active');
    DOM.btnDiffB.classList.remove('active');
    savePersistentData();
    prepareRestart();
  });

  DOM.btnDiffB.addEventListener('click', () => {
    state.activeDifficulty = 'B';
    persistentData.activeDifficulty = 'B';
    DOM.btnDiffB.classList.add('active');
    DOM.btnDiffA.classList.remove('active');
    savePersistentData();
    prepareRestart();
  });

  // 기록 모달
  DOM.btnOpenHistory.addEventListener('click', renderHistoryModal);
  DOM.btnCloseHistory.addEventListener('click', () => {
    DOM.historyModal.style.display = 'none';
  });

  DOM.btnClearHistory.addEventListener('click', () => {
    if (confirm('플레이 기록을 모두 지우시겠습니까?')) {
      persistentData.history = [];
      savePersistentData();
      renderHistoryModal();
      DOM.historyBadge.textContent = '0';
    }
  });

  DOM.btnExportHistory.addEventListener('click', () => {
    if (persistentData.history.length === 0) {
      alert('기록된 로그가 없습니다.');
      return;
    }
    const lines = persistentData.history.map(h => 
      `[#${h.id}] ${h.difficulty} | 결과: ${h.result} | 시간: ${h.duration} | 토큰: ${h.tokens} | ${h.detail}`
    );
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      alert('기록이 클립보드에 복사되었습니다!');
    }).catch(() => {
      alert('화면의 표를 직접 복사해 주세요.');
    });
  });

  function renderHistoryModal() {
    DOM.historyTableBody.innerHTML = '';
    if (persistentData.history.length === 0) {
      DOM.historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:18px; color:#94a3b8;">아직 플레이 기록이 없습니다.</td></tr>`;
    } else {
      persistentData.history.forEach((h, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td><span style="color:#38bdf8;">${h.difficulty}</span></td>
          <td><strong>${h.result}</strong></td>
          <td>${h.duration}</td>
          <td>${h.tokens}</td>
          <td style="color:#94a3b8; font-size:0.8rem;">${h.detail}</td>
        `;
        DOM.historyTableBody.appendChild(tr);
      });
    }
    DOM.historyModal.style.display = 'flex';
  }

  // 단축키 (R: 재시작, Esc: 닫기)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      if (state.status === 'GAME_OVER' || state.status === 'CLEAR_TRUE') {
        prepareRestart();
      }
    }
    if (e.key === 'Escape' && state.currentView !== 'none') {
      closeCloseup();
    }
  });

  // ===== 12. 초기화 구동 =====
  loadPersistentData();
  state.activeDifficulty = persistentData.activeDifficulty || 'A';
  if (state.activeDifficulty === 'B') {
    DOM.btnDiffB.classList.add('active');
    DOM.btnDiffA.classList.remove('active');
  }
  if (persistentData.isReducedMotion) {
    document.body.classList.add('reduced-motion');
  }
  DOM.historyBadge.textContent = persistentData.history.length;
  updateUI();

})();
