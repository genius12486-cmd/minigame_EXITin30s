/**
 * 방탈출 로그라이크 : 30초 안에 탈출하라
 */

(() => {
  'use strict';

  // ===== 상수 =====
  const STORAGE_KEY = 'THE_MACHINE_SAVE_V19';
  const TARGET_TOKENS_A = 5;
  const TARGET_TOKENS_B = 12;
  const BASE_TIME = 30.0;
  const DEMO_TOKEN_PER_CLEAR = 3;
  const NORMAL_TOKEN_PER_CLEAR = 2;
  const CELEBRATION_CHEST_TOKENS = 12;
  const CONFETTI_COLORS = [
    '#fbbf24', '#f87171', '#34d399', '#38bdf8', '#c084fc',
    '#facc15', '#fb923c', '#a3e635', '#f472b6', '#e2e8f0'
  ];
  const CONFETTI_DURATION_MS = 2600;

  let state = {
    status: 'READY',
    timeRemaining: BASE_TIME,
    currentTokens: 0,
    gameMode: 'normal',
    currentRoom: 'main',
    isPaused: false,           // ★ 추가: 일시정지 여부

    doorAOpen: false,
    doorADialTens: 0,
    doorADialOnes: 0,

    doorBOpen: false,
    doorBDialTens: 0,
    doorBDialOnes: 0,

    activeDoor: null,
    exitPending: false,

    dialStep: 1,
    gearAngle: 0,
    currentView: 'none',
    totalPlaySeconds: 0
  };

  let persistentData = {
    chestTokens: 2,
    celebrationChestClaimed: false,
    isMuted: false,
    volume: 0.6,
    isReducedMotion: false,
    history: []
  };

  let lastRealTime = 0;
  let animationFrameId = null;
  let backgroundIntervalId = null;
  let exitEndingTimer1 = null;
  let exitEndingTimer2 = null;

  // ===== 사운드 =====
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (A) audioCtx = new A();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function playTone(freq, type='sine', dur=0.08, gainVal=0.08) {
    if (persistentData.isMuted) return;
    if (persistentData.volume <= 0) return;
    try {
      const ctx = getAudioContext(); if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
      const finalGain = gainVal * persistentData.volume;
      gain.gain.setValueAtTime(finalGain, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + dur);
    } catch(e){}
  }
  const SoundFX = {
    click: () => playTone(600,'sine',0.05,0.05),
    dialStep: (s) => playTone(400+s*60,'sine',0.06,0.07),
    dialComplete: () => { playTone(784,'triangle',0.1,0.1); setTimeout(()=>playTone(1046,'triangle',0.15,0.12),80); },
    dialError: () => playTone(180,'sawtooth',0.2,0.12),
    extendTime: () => { playTone(587.33,'sine',0.08,0.08); setTimeout(()=>playTone(880,'sine',0.12,0.09),70); },
    doorOpen: () => { playTone(400,'triangle',0.15,0.1); setTimeout(()=>playTone(600,'triangle',0.2,0.12),120); },
    doorFail: () => playTone(150,'sawtooth',0.3,0.15),
    claimChest: () => { playTone(440,'square',0.1,0.06); setTimeout(()=>playTone(880,'square',0.15,0.08),100); },
    clearFanfare: () => {
      [523,659,783,1046,1318].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.2,0.14),i*120));
    },
    escapeFanfare: () => {
      [392,523,659,783,1046,1318,1568].forEach((f,i)=>setTimeout(()=>playTone(f,'triangle',0.35,0.14),i*140));
    },
    gameOver: () => { playTone(180,'sawtooth',0.4,0.15); setTimeout(()=>playTone(120,'sawtooth',0.6,0.2),300); }
  };

  // ===== DOM =====
  const DOM = {
    timeDisplay: document.getElementById('timeDisplay'),
    hudTimer: document.getElementById('hudTimer'),
    btnPause: document.getElementById('btnPause'),
    tokenDisplay: document.getElementById('tokenDisplay'),
    modeBadge: document.getElementById('modeBadge'),
    btnMute: document.getElementById('btnMute'),
    btnPause: document.getElementById('btnPause'),
    pauseOverlay: document.getElementById('pauseOverlay'),
    btnResumeGame: document.getElementById('btnResumeGame'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeSliderPanel: document.getElementById('volumeSliderPanel'),
    volumeValueText: document.getElementById('volumeValueText'),
    btnReducedMotion: document.getElementById('btnReducedMotion'),
    btnResetSave: document.getElementById('btnResetSave'),

    startScreenOverlay: document.getElementById('startScreenOverlay'),
    btnStartGame: document.getElementById('btnStartGame'),
    btnModeNormal: document.getElementById('btnModeNormal'),
    btnModeDemo: document.getElementById('btnModeDemo'),
    btnModeHelp: document.getElementById('btnModeHelp'),
    modeHelpTooltip: document.getElementById('modeHelpTooltip'),

    roomBgImg: document.getElementById('roomBgImg'),
    mainRoomObjects: document.getElementById('mainRoomObjects'),
    celebrationRoomObjects: document.getElementById('celebrationRoomObjects'),
    corridorRoomObjects: document.getElementById('corridorRoomObjects'),
    outsideRoomObjects: document.getElementById('outsideRoomObjects'),
    fadeToClearOverlay: document.getElementById('fadeToClearOverlay'),
    confettiContainer: document.getElementById('confettiContainer'),

    propDoorLeft: document.getElementById('propDoorLeft'),
    doorLeftImg: document.getElementById('doorLeftImg'),
    propDoorRight: document.getElementById('propDoorRight'),
    doorRightImg: document.getElementById('doorRightImg'),
    propDesk: document.getElementById('propDesk'),
    propChest: document.getElementById('propChest'),
    propMachine: document.getElementById('propMachine'),

    propCelebrationDoor: document.getElementById('propCelebrationDoor'),
    celebrationDoorImg: document.getElementById('celebrationDoorImg'),
    propCelebrationDesk: document.getElementById('propCelebrationDesk'),
    propCelebrationChest: document.getElementById('propCelebrationChest'),

    propCorridorDoor: document.getElementById('propCorridorDoor'),
    corridorDoorImg: document.getElementById('corridorDoorImg'),
    propCorridorExit: document.getElementById('propCorridorExit'),

    closeupLayer: document.getElementById('closeupLayer'),
    btnCloseCloseup: document.getElementById('btnCloseCloseup'),

    viewDoorAClosed: document.getElementById('viewDoorAClosed'),
    viewDoorBClosed: document.getElementById('viewDoorBClosed'),
    viewDoorOpen: document.getElementById('viewDoorOpen'),
    viewMachine: document.getElementById('viewMachine'),
    viewDesk: document.getElementById('viewDesk'),
    viewChest: document.getElementById('viewChest'),
    viewCelebrationChest: document.getElementById('viewCelebrationChest'),
    viewCelebrationClear: document.getElementById('viewCelebrationClear'),

    doorATens: document.getElementById('doorATens'),
    doorAOnes: document.getElementById('doorAOnes'),
    doorBTens: document.getElementById('doorBTens'),
    doorBOnes: document.getElementById('doorBOnes'),
    btnSubmitDoorA: document.getElementById('btnSubmitDoorA'),
    btnSubmitDoorB: document.getElementById('btnSubmitDoorB'),
    doorAFeedbackMsg: document.getElementById('doorAFeedbackMsg'),
    doorBFeedbackMsg: document.getElementById('doorBFeedbackMsg'),

    btnEnterDoor: document.getElementById('btnEnterDoor'),
    btnCloseDoor: document.getElementById('btnCloseDoor'),

    circleDial: document.getElementById('circleDial'),
    gearSpinner: document.getElementById('gearSpinner'),
    stepCounter: document.getElementById('stepCounter'),
    dialGuideText: document.getElementById('dialGuideText'),
    dialBtns: [1,2,3,4,5,6,7,8].map(n => document.getElementById('dBtn'+n)),
    btnExtend: document.getElementById('btnExtend'),

    crateCountText: document.getElementById('crateCountText'),
    btnTakeChest: document.getElementById('btnTakeChest'),

    celebrationTokenIcons: document.getElementById('celebrationTokenIcons'),
    btnClaimCelebrationChest: document.getElementById('btnClaimCelebrationChest'),
    celebrationChestClaimedText: document.getElementById('celebrationChestClaimedText'),

    resultModal: document.getElementById('resultModal'),
    resultModalCard: document.getElementById('resultModalCard'),
    modalIcon: document.getElementById('modalIcon'),
    modalTitle: document.getElementById('modalTitle'),
    modalContent: document.getElementById('modalContent'),
    btnRestartGame: document.getElementById('btnRestartGame'),

    btnOpenHistory: document.getElementById('btnOpenHistory'),
    historyBadge: document.getElementById('historyBadge'),
    historyModal: document.getElementById('historyModal'),
    historyTableBody: document.getElementById('historyTableBody'),
    btnExportHistory: document.getElementById('btnExportHistory'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    btnCloseHistory: document.getElementById('btnCloseHistory')
  };

  // ===== 저장소 =====
    function loadPersistentData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    
    // 1. 저장된 데이터가 아예 없는 경우 (최초 실행)
    if (!raw) { 
      persistentData.chestTokens = 2; // ★ 최초 1회 2개 지급
      savePersistentData(); 
      return; 
    }
    
    try {
      const p = JSON.parse(raw);
      if (typeof p.chestTokens === 'number' && !isNaN(p.chestTokens)) {
        persistentData.chestTokens = Math.max(0, Math.floor(p.chestTokens));
      }
      
      // ★ 중요: 기존에 있던 '0개면 5개로 채워주는' 코드는 여기서 삭제했습니다.
      // (새로고침으로 토큰을 무한 파밍하는 것을 막기 위함입니다)

      if (typeof p.celebrationChestClaimed === 'boolean') persistentData.celebrationChestClaimed = p.celebrationChestClaimed;
      if (typeof p.isMuted === 'boolean') persistentData.isMuted = p.isMuted;
      if (typeof p.volume === 'number' && !isNaN(p.volume)) {
        persistentData.volume = Math.min(1, Math.max(0, p.volume));
      }
      if (typeof p.isReducedMotion === 'boolean') persistentData.isReducedMotion = p.isReducedMotion;
      if (Array.isArray(p.history)) persistentData.history = p.history.slice(0, 50);
    } catch (e) {
      console.warn('[The Machine] 손상 저장값 감지, 기본값 복구', e);
      persistentData.chestTokens = 2; // 에러 났을 때도 2개 지급
      savePersistentData();
    }
  }
  function savePersistentData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentData)); }
    catch (e) { console.error('[The Machine] 저장 오류:', e); }
  }

  // ===== 볼륨 UI =====
  function updateVolumeUI() {
    DOM.volumeSlider.value = Math.round(persistentData.volume * 100);
    DOM.volumeValueText.textContent = Math.round(persistentData.volume * 100);
    if (persistentData.isMuted || persistentData.volume === 0) {
      DOM.btnMute.textContent = '🔇';
    } else if (persistentData.volume < 0.34) {
      DOM.btnMute.textContent = '🔈';
    } else if (persistentData.volume < 0.67) {
      DOM.btnMute.textContent = '🔉';
    } else {
      DOM.btnMute.textContent = '🔊';
    }
  }

  // ===== 색종이 좌우 폭발 =====
  function fireConfetti() {
    if (persistentData.isReducedMotion) return;
    const container = DOM.confettiContainer;
    if (!container) return;
    container.innerHTML = '';

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = vw / 2;
    const cy = vh * 0.5 + 50;

    const spread = vw * 0.45;
    const count = 80;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece' + (Math.random() < 0.35 ? ' round' : '');

      const goRight = i % 2 === 0;
      const angleDeg = (Math.random() - 0.5) * 50;
      const angleRad = angleDeg * Math.PI / 180;
      const dirSign = goRight ? 1 : -1;
      const dist = spread * (0.5 + Math.random() * 0.5);

      const tx = Math.cos(angleRad) * dist * dirSign;
      const ty = Math.sin(angleRad) * dist;

      const w = 6 + Math.random() * 8;
      const h = 10 + Math.random() * 10;
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const spin = (Math.random() - 0.5) * 1440;
      const dur = 1200 + Math.random() * 700;

      piece.style.width = w + 'px';
      piece.style.height = h + 'px';
      piece.style.background = color;
      piece.style.left = cx + 'px';
      piece.style.top = cy + 'px';
      piece.style.animationDuration = dur + 'ms';
      piece.style.animationDelay = (Math.random() * 60) + 'ms';
      piece.style.setProperty('--tx', tx + 'px');
      piece.style.setProperty('--ty', ty + 'px');
      piece.style.setProperty('--spin', spin + 'deg');

      container.appendChild(piece);

      setTimeout(() => { piece.remove(); }, dur + 200);
    }

    setTimeout(() => {
      if (container) container.innerHTML = '';
    }, CONFETTI_DURATION_MS + 800);
  }

  // ===== 게임 루프 =====
  function handleGameStartButtonClick() {
    DOM.startScreenOverlay.style.display = 'none';
    startCountdown();
  }

  function clearExitTimers() {
    if (exitEndingTimer1) { clearTimeout(exitEndingTimer1); exitEndingTimer1 = null; }
    if (exitEndingTimer2) { clearTimeout(exitEndingTimer2); exitEndingTimer2 = null; }
  }

  function startCountdown() {
    state.status = 'PLAYING';
    state.isPaused = false;
    DOM.pauseOverlay.style.display = 'none';
    state.timeRemaining = BASE_TIME;
    state.currentTokens = 0;
    state.currentRoom = 'main';
    state.doorAOpen = false;
    state.doorBOpen = false;
    state.doorADialTens = 0; state.doorADialOnes = 0;
    state.doorBDialTens = 0; state.doorBDialOnes = 0;
    state.activeDoor = null;
    state.exitPending = false;
    state.dialStep = 1;
    state.gearAngle = 0;
    state.totalPlaySeconds = 0;
    state.currentView = 'none';

    clearExitTimers();
    DOM.doorAFeedbackMsg.textContent = '';
    DOM.doorBFeedbackMsg.textContent = '';
    DOM.gearSpinner.style.transform = 'rotate(0deg)';
    DOM.fadeToClearOverlay.classList.remove('active');
    if (DOM.confettiContainer) DOM.confettiContainer.innerHTML = '';

    applyRoomVisual();
    updateDialDigits();
    closeCloseupSilent();
    DOM.resultModal.style.display = 'none';
    DOM.resultModalCard.classList.remove('wide-result');

    updateDialVisuals();
    updateModeBadge();
    updateUI();

    lastRealTime = Date.now();
    if (!animationFrameId) animationFrameId = requestAnimationFrame(gameLoop);
    if (backgroundIntervalId) clearInterval(backgroundIntervalId);
    backgroundIntervalId = setInterval(tickTime, 100);
  }

  function prepareRestart() {
    state.status = 'READY';
    state.isPaused = false;
    DOM.pauseOverlay.style.display = 'none';
    state.timeRemaining = BASE_TIME;
    state.currentTokens = 0;
    state.currentRoom = 'main';
    state.doorAOpen = false;
    state.doorBOpen = false;
    state.doorADialTens = 0; state.doorADialOnes = 0;
    state.doorBDialTens = 0; state.doorBDialOnes = 0;
    state.activeDoor = null;
    state.exitPending = false;
    state.dialStep = 1;
    state.gearAngle = 0;
    state.currentView = 'none';

    clearExitTimers();
    if (backgroundIntervalId) clearInterval(backgroundIntervalId);
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

    DOM.gearSpinner.style.transform = 'rotate(0deg)';
    DOM.fadeToClearOverlay.classList.remove('active');
    if (DOM.confettiContainer) DOM.confettiContainer.innerHTML = '';
    applyRoomVisual();
    updateDialDigits();
    closeCloseupSilent();
    DOM.resultModal.style.display = 'none';
    DOM.startScreenOverlay.style.display = 'flex';
    updateUI();
  }

  function tickTime() {
    if (state.status !== 'PLAYING') return;
    if (state.exitPending) return;
    if (state.isPaused) return;   // ★ 추가: 일시정지 상태면 타이머 작동 중지
    const now = Date.now();
    const delta = (now - lastRealTime) / 1000;
    lastRealTime = now;
    if (delta > 0) {
      state.totalPlaySeconds += delta;
      state.timeRemaining = Math.max(0, state.timeRemaining - delta);
      if (state.timeRemaining <= 0) handleGameOver();
      updateUI();
    }
  }

  function gameLoop() {
    tickTime();
    if (state.status === 'PLAYING') animationFrameId = requestAnimationFrame(gameLoop);
    else animationFrameId = null;
  }

  function updateModeBadge() {
    if (state.gameMode === 'demo') {
      DOM.modeBadge.style.display = 'inline-flex';
    } else DOM.modeBadge.style.display = 'none';
  }

  // ===== 방 시각 =====
  function applyRoomVisual() {
    const r = state.currentRoom;
    DOM.mainRoomObjects.style.display = (r === 'main') ? 'block' : 'none';
    DOM.celebrationRoomObjects.style.display = (r === 'celebration') ? 'block' : 'none';
    DOM.corridorRoomObjects.style.display = (r === 'corridor') ? 'block' : 'none';
    DOM.outsideRoomObjects.style.display = (r === 'outside') ? 'block' : 'none';

    if (r === 'outside') {
      DOM.roomBgImg.src = 'assets/outside_street.webp';
    } else {
      DOM.roomBgImg.src = 'assets/room_empty.webp';
    }

    if (r === 'corridor') {
      DOM.corridorDoorImg.src = state.doorBOpen ? 'assets/door_open.webp' : 'assets/door_closed.webp';
    }

    const srcA = state.doorAOpen ? 'assets/door_open.webp' : 'assets/door_closed.webp';
    DOM.doorLeftImg.src = srcA;
    DOM.celebrationDoorImg.src = srcA;

    const srcB = state.doorBOpen ? 'assets/door_open.webp' : 'assets/door_closed.webp';
    DOM.doorRightImg.src = srcB;
    DOM.corridorDoorImg.src = srcB;

        // ★ 추가: 열린 문일 때 크기 클래스 토글
    DOM.propDoorLeft.classList.toggle('open-door-state', state.doorAOpen);
    DOM.propCelebrationDoor.classList.toggle('open-door-state', state.doorAOpen);
    DOM.propDoorRight.classList.toggle('open-door-state', state.doorBOpen);
    DOM.propCorridorDoor.classList.toggle('open-door-state', state.doorBOpen);

    if (state.doorAOpen) {
      DOM.propCelebrationChest.classList.add('hidden-by-door');
      DOM.propCelebrationChest.style.pointerEvents = 'none';
      DOM.propCelebrationChest.style.zIndex = '1';
    } else {
      DOM.propCelebrationChest.classList.remove('hidden-by-door');
      DOM.propCelebrationChest.style.pointerEvents = 'auto';
      DOM.propCelebrationChest.style.zIndex = '4';
    }
  }

  function enterRoom(roomName) {
    state.currentRoom = roomName;
    applyRoomVisual();
  }

  // ===== 클로즈업 =====
  const ALL_VIEWS = [
    'viewDoorAClosed','viewDoorBClosed','viewDoorOpen','viewMachine',
    'viewDesk','viewChest','viewCelebrationChest','viewCelebrationClear'
  ];

  function openCloseup(viewName) {
    if (state.status !== 'PLAYING') return;
    state.currentView = viewName;
    SoundFX.click();
    ALL_VIEWS.forEach(k => { DOM[k].style.display = 'none'; });
    const map = {
      doorAClosed: DOM.viewDoorAClosed,
      doorBClosed: DOM.viewDoorBClosed,
      doorOpen: DOM.viewDoorOpen,
      machine: DOM.viewMachine,
      desk: DOM.viewDesk,
      chest: DOM.viewChest,
      celebrationChest: DOM.viewCelebrationChest,
      celebrationClear: DOM.viewCelebrationClear
    };
    if (map[viewName]) map[viewName].style.display = 'block';
    if (viewName === 'machine') updateDialVisuals();
    if (viewName === 'doorAClosed' || viewName === 'doorBClosed') updateDialDigits();
    if (viewName === 'celebrationChest') renderCelebrationChestView();
    DOM.closeupLayer.style.display = 'flex';
    updateUI();
  }

  function closeCloseup() {
    if (state.currentView === 'none') return;
    state.currentView = 'none';
    DOM.closeupLayer.style.display = 'none';
    SoundFX.click();
  }
  function closeCloseupSilent() {
    state.currentView = 'none';
    DOM.closeupLayer.style.display = 'none';
  }

  // ===== 문 클릭 =====
  function handleDoorAClick() {
    if (state.doorAOpen) {
      state.activeDoor = 'A';
      openCloseup('doorOpen');
    } else {
      openCloseup('doorAClosed');
    }
  }
  function handleDoorBClick() {
    if (state.doorBOpen) {
      state.activeDoor = 'B';
      openCloseup('doorOpen');
    } else {
      openCloseup('doorBClosed');
    }
  }

  // ===== 2자리 다이얼 =====
  function updateDialDigits() {
    DOM.doorATens.textContent = state.doorADialTens;
    DOM.doorAOnes.textContent = state.doorADialOnes;
    DOM.doorBTens.textContent = state.doorBDialTens;
    DOM.doorBOnes.textContent = state.doorBDialOnes;
  }

  function handleDigitArrow(target, place, dir) {
    const isA = target === 'A';
    if (isA) {
      if (place === 'tens') state.doorADialTens = (state.doorADialTens + dir + 10) % 10;
      else state.doorADialOnes = (state.doorADialOnes + dir + 10) % 10;
    } else {
      if (place === 'tens') state.doorBDialTens = (state.doorBDialTens + dir + 10) % 10;
      else state.doorBDialOnes = (state.doorBDialOnes + dir + 10) % 10;
    }
    SoundFX.click();
    updateDialDigits();
  }

  function getDialValue(target) {
    if (target === 'A') return state.doorADialTens * 10 + state.doorADialOnes;
    return state.doorBDialTens * 10 + state.doorBDialOnes;
  }

  function handleSubmitDoor(target) {
    if (state.status !== 'PLAYING') return;
    const isA = target === 'A';
    if (isA && state.doorAOpen) return;
    if (!isA && state.doorBOpen) return;

    const amount = getDialValue(target);
    const required = isA ? TARGET_TOKENS_A : TARGET_TOKENS_B;
    const feedbackEl = isA ? DOM.doorAFeedbackMsg : DOM.doorBFeedbackMsg;

    if (amount <= 0) {
      feedbackEl.textContent = '투입할 토큰 수량을 1개 이상 맞춰주세요.';
      feedbackEl.style.color = '#f87171';
      return;
    }
    if (state.currentTokens < amount) {
      feedbackEl.textContent = `소지 토큰이 부족합니다! (소지: ${state.currentTokens}개)`;
      feedbackEl.style.color = '#f87171';
      return;
    }

    state.currentTokens -= amount;

    if (amount === required) {
      if (isA) state.doorAOpen = true;
      else state.doorBOpen = true;
      applyRoomVisual();
      SoundFX.doorOpen();
      state.activeDoor = target;
      openCloseup('doorOpen');
    } else {
      SoundFX.doorFail();
      feedbackEl.textContent = `토큰 ${amount}개가 투입구 속으로 사라졌지만 문은 열리지 않았습니다... (토큰 소멸)`;
      feedbackEl.style.color = '#f87171';
    }

    if (isA) { state.doorADialTens = 0; state.doorADialOnes = 0; }
    else { state.doorBDialTens = 0; state.doorBDialOnes = 0; }
    updateDialDigits();
    updateUI();
  }

  // ===== 문 열림 패널 =====
  function handleEnterDoor() {
    const which = state.activeDoor;
    if (which === 'A') {
      if (state.currentRoom === 'main') enterRoom('celebration');
      else if (state.currentRoom === 'celebration') enterRoom('main');
    } else if (which === 'B') {
      if (state.currentRoom === 'main') enterRoom('corridor');
      else if (state.currentRoom === 'corridor') enterRoom('main');
    }
    closeCloseupSilent();
  }

  function handleCloseDoor() {
    const which = state.activeDoor;
    if (which === 'A') { state.doorAOpen = false; state.doorADialTens = 0; state.doorADialOnes = 0; }
    else if (which === 'B') { state.doorBOpen = false; state.doorBDialTens = 0; state.doorBDialOnes = 0; }
    state.activeDoor = null;
    applyRoomVisual();
    updateDialDigits();
    DOM.doorAFeedbackMsg.textContent = '';
    DOM.doorBFeedbackMsg.textContent = '';
    SoundFX.doorFail();
    closeCloseupSilent();
    updateUI();
  }

  // ===== 기계 =====
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
        SoundFX.dialComplete();
        const gain = state.gameMode === 'demo' ? DEMO_TOKEN_PER_CLEAR : NORMAL_TOKEN_PER_CLEAR;
        state.currentTokens += gain;
        state.dialStep = 1;
        updateDialVisuals();
        if (state.gameMode === 'demo') {
          triggerFloatingTokenFx('+1');
          setTimeout(() => triggerFloatingTokenFx('+1'), 150);
          setTimeout(() => triggerFloatingTokenFx('+1'), 300);
        } 
        else {
          triggerFloatingTokenFx('+1');
          setTimeout(() => triggerFloatingTokenFx('+1'), 150);
        }
        updateUI();
      }
    } else {
      SoundFX.dialError();
      const cb = DOM.dialBtns[btnStep - 1];
      if (cb) { cb.classList.add('error-step'); setTimeout(()=>cb.classList.remove('error-step'),300); }
      state.dialStep = 1;
      updateDialVisuals();
    }
  }

  function triggerFloatingTokenFx(text) {
    if (persistentData.isReducedMotion) return;
    const fx = document.createElement('div');
    fx.className = 'floating-token-fx';
    fx.textContent = `🪙`;
    DOM.circleDial.appendChild(fx);
    setTimeout(() => fx.remove(), 850);
  }

  function updateDialVisuals() {
    DOM.stepCounter.textContent = `${state.dialStep} / 8`;
    DOM.dialGuideText.textContent = `${state.dialStep}번 버튼 클릭!`;
    DOM.dialBtns.forEach((btn, idx) => {
      const n = idx + 1;
      btn.classList.remove('next-step','passed-step','error-step');
      if (n < state.dialStep) btn.classList.add('passed-step');
      else if (n === state.dialStep) btn.classList.add('next-step');
    });
  }

  function handleExtend() {
    if (state.status !== 'PLAYING') return;
    if (state.currentTokens < 1) return;
    state.currentTokens -= 1;
    state.timeRemaining += 2.0;
    SoundFX.extendTime();
    updateUI();
  }

  // ===== 상자들 =====
  function handleTakeChest() {
    if (state.status !== 'PLAYING') return;
    if (persistentData.chestTokens <= 0) return;
    const n = persistentData.chestTokens;
    state.currentTokens += n;
    persistentData.chestTokens = 0;
    savePersistentData();
    SoundFX.claimChest();
    updateUI();
  }

  function renderCelebrationChestView() {
    if (persistentData.celebrationChestClaimed) {
      DOM.celebrationTokenIcons.innerHTML = '';
      DOM.btnClaimCelebrationChest.style.display = 'none';
      DOM.celebrationChestClaimedText.style.display = 'block';
    } else {
      DOM.celebrationTokenIcons.innerHTML =
        `<span class="token-reward-line">🪙 × ${CELEBRATION_CHEST_TOKENS}</span>`;
      DOM.btnClaimCelebrationChest.style.display = 'block';
      DOM.btnClaimCelebrationChest.disabled = false;
      DOM.celebrationChestClaimedText.style.display = 'none';
    }
  }

  function handleClaimCelebrationChest() {
    if (persistentData.celebrationChestClaimed) return;
    persistentData.celebrationChestClaimed = true;
    state.currentTokens += CELEBRATION_CHEST_TOKENS;
    savePersistentData();
    SoundFX.claimChest();
    renderCelebrationChestView();
    updateUI();
  }

  // ===== 축하방 일지 (팡파레 + 색종이) =====
  function handleCelebrationDeskClick() {
    SoundFX.clearFanfare();
    fireConfetti();
    recordHistory('축하방 일지 조사 (클리어)', '축하방 일지 상호작용');
    openCloseup('celebrationClear');
  }

  // ===== 복도 EXIT =====
  function handleCorridorExit() {
    if (state.exitPending) return;
    state.exitPending = true;
    SoundFX.escapeFanfare();

    state.currentRoom = 'outside';
    applyRoomVisual();

    exitEndingTimer1 = setTimeout(() => {
      DOM.fadeToClearOverlay.classList.add('active');
    }, 1000);

    exitEndingTimer2 = setTimeout(() => {
      if (backgroundIntervalId) clearInterval(backgroundIntervalId);
      if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
      state.status = 'GAME_OVER';
      recordHistory('진엔딩 - 탈출 성공', '복도 EXIT 통과');
      DOM.resultModalCard.classList.remove('wide-result');
      DOM.modalIcon.textContent = 'YOU🏃WIN';
      DOM.modalTitle.innerHTML = '축하합니다! <br> 진정한 탈출에 성공하였습니다.';
      DOM.modalTitle.style.color = '#34d399';
      DOM.modalContent.innerHTML = '';
      DOM.btnRestartGame.textContent = '처음화면으로 돌아가기';
      DOM.resultModal.style.display = 'flex';
      updateUI();
    }, 3000);
  }

  // ===== 게임오버 =====
  function handleGameOver() {
    state.status = 'GAME_OVER';
    if (backgroundIntervalId) clearInterval(backgroundIntervalId);
    closeCloseupSilent();
    SoundFX.gameOver();
    const saved = state.currentTokens;
    persistentData.chestTokens += saved;
    savePersistentData();
    recordHistory('시간 초과', `토큰 ${saved}개 상자 저장`);

    DOM.resultModalCard.classList.add('wide-result');
    DOM.modalIcon.textContent = '';
    DOM.modalIcon.style.minHeight = '1em'; // 공간 확보
    DOM.modalTitle.textContent = '💨시간 초과💨';
    DOM.modalTitle.style.color = '#f87171';
    DOM.modalContent.innerHTML = `
      <p style="font-size:1.95rem; color:#cbd5e1; line-height:1.6; margin:0;">
        <br>
      </p>
    `;
    DOM.btnRestartGame.textContent = '다시 하기';
    DOM.resultModal.style.display = 'flex';
    updateUI();
  }

  function recordHistory(result, detail) {
    const entry = {
      id: persistentData.history.length + 1,
      mode: state.gameMode === 'demo' ? '시연용' : '표준',
      result, duration: `${state.totalPlaySeconds.toFixed(1)}s`,
      tokens: state.currentTokens, detail
    };
    persistentData.history.unshift(entry);
    savePersistentData();
    DOM.historyBadge.textContent = persistentData.history.length;
  }

  // ===== UI =====
  function updateUI() {
    DOM.timeDisplay.textContent = `${state.timeRemaining.toFixed(1)}`;
    DOM.tokenDisplay.textContent = state.currentTokens;
    if (state.timeRemaining <= 10.0 && state.status === 'PLAYING' && !state.exitPending) {
      DOM.hudTimer.classList.add('danger-state');
    } else DOM.hudTimer.classList.remove('danger-state');
    DOM.btnExtend.disabled = (state.currentTokens < 1);
    DOM.crateCountText.textContent = persistentData.chestTokens;
    DOM.btnTakeChest.disabled = (persistentData.chestTokens <= 0);
  }

  function setGameMode(mode) {
    state.gameMode = mode;
    DOM.btnModeDemo.classList.toggle('active', mode === 'demo');
    DOM.btnModeNormal.classList.toggle('active', mode === 'normal');
    updateModeBadge();
  }

  // ===== 이벤트 =====
  DOM.btnModeNormal.addEventListener('click', () => setGameMode('normal'));
  DOM.btnModeDemo.addEventListener('click', () => setGameMode('demo'));
  DOM.btnModeHelp.addEventListener('mouseenter', () => DOM.modeHelpTooltip.classList.add('visible'));
  DOM.btnModeHelp.addEventListener('mouseleave', () => DOM.modeHelpTooltip.classList.remove('visible'));
  DOM.btnModeHelp.addEventListener('focus', () => DOM.modeHelpTooltip.classList.add('visible'));
  DOM.btnModeHelp.addEventListener('blur', () => DOM.modeHelpTooltip.classList.remove('visible'));

  DOM.btnStartGame.addEventListener('click', handleGameStartButtonClick);

  DOM.propDoorLeft.addEventListener('click', handleDoorAClick);
  DOM.propDoorRight.addEventListener('click', handleDoorBClick);
  DOM.propCelebrationDoor.addEventListener('click', handleDoorAClick);
  DOM.propCorridorDoor.addEventListener('click', handleDoorBClick);

  DOM.propMachine.addEventListener('click', () => openCloseup('machine'));
  DOM.propDesk.addEventListener('click', () => openCloseup('desk'));
  DOM.propChest.addEventListener('click', () => openCloseup('chest'));
  DOM.propCelebrationDesk.addEventListener('click', handleCelebrationDeskClick);
  DOM.propCelebrationChest.addEventListener('click', () => {
    if (state.doorAOpen) return;
    openCloseup('celebrationChest');
  });
  DOM.propCorridorExit.addEventListener('click', handleCorridorExit);

  DOM.btnCloseCloseup.addEventListener('click', closeCloseup);

  document.querySelectorAll('.digit-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const place = btn.dataset.place;
      const isUp = btn.classList.contains('up');
      handleDigitArrow(target, place, isUp ? 1 : -1);
    });
  });

  DOM.btnSubmitDoorA.addEventListener('click', () => handleSubmitDoor('A'));
  DOM.btnSubmitDoorB.addEventListener('click', () => handleSubmitDoor('B'));

  DOM.dialBtns.forEach((btn, idx) => {
    const n = idx + 1;
    btn.addEventListener('click', () => handleDialButtonClick(n));
  });
  DOM.btnExtend.addEventListener('click', handleExtend);

  DOM.btnEnterDoor.addEventListener('click', handleEnterDoor);
  DOM.btnCloseDoor.addEventListener('click', handleCloseDoor);

  DOM.btnTakeChest.addEventListener('click', handleTakeChest);
  DOM.btnClaimCelebrationChest.addEventListener('click', handleClaimCelebrationChest);
  DOM.btnRestartGame.addEventListener('click', () => {
    DOM.resultModal.style.display = 'none';
    prepareRestart();
  });

  DOM.closeupLayer.addEventListener('click', (e) => {
    if (e.target === DOM.closeupLayer) closeCloseup();
  });

  // ===== 일시정지 =====
  DOM.btnPause.addEventListener('click', () => {
    if (state.status !== 'PLAYING') return;
    state.isPaused = true;
    DOM.pauseOverlay.style.display = 'flex';
    if (backgroundIntervalId) { clearInterval(backgroundIntervalId); backgroundIntervalId = null; }
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
  });

  DOM.btnResumeGame.addEventListener('click', () => {
    if (!state.isPaused) return;
    state.isPaused = false;
    DOM.pauseOverlay.style.display = 'none';
    lastRealTime = Date.now();
    if (!animationFrameId) animationFrameId = requestAnimationFrame(gameLoop);
    if (!backgroundIntervalId) backgroundIntervalId = setInterval(tickTime, 100);
  });

  DOM.btnMute.addEventListener('click', () => {
    DOM.volumeSliderPanel.classList.toggle('open');
  });
  DOM.volumeSliderPanel.addEventListener('mouseleave', () => {
    DOM.volumeSliderPanel.classList.remove('open');
  });
  DOM.volumeSlider.addEventListener('input', () => {
    const v = parseInt(DOM.volumeSlider.value, 10) / 100;
    persistentData.volume = v;
    if (v > 0) persistentData.isMuted = false;
    updateVolumeUI();
    savePersistentData();
  });
  DOM.volumeSlider.addEventListener('change', () => {
    playTone(660, 'sine', 0.06, 0.08);
  });

  DOM.btnReducedMotion.addEventListener('click', () => {
    persistentData.isReducedMotion = !persistentData.isReducedMotion;
    document.body.classList.toggle('reduced-motion', persistentData.isReducedMotion);
    savePersistentData();
    DOM.btnReducedMotion.textContent = persistentData.isReducedMotion ? '🛑' : '✨';
  });
  DOM.btnResetSave.addEventListener('click', () => {
    if (confirm('모든 상자 토큰과 기록을 초기화하시겠습니까?')) {
      persistentData = {
        chestTokens: 2, celebrationChestClaimed: false,
        isMuted: false, volume: 0.6,
        isReducedMotion: false, history: []
      };
      savePersistentData();
      updateVolumeUI();
      prepareRestart();
    }
  });

  DOM.btnOpenHistory.addEventListener('click', renderHistoryModal);
  DOM.btnCloseHistory.addEventListener('click', () => { DOM.historyModal.style.display = 'none'; });
  DOM.btnClearHistory.addEventListener('click', () => {
    if (confirm('플레이 기록을 모두 지우시겠습니까?')) {
      persistentData.history = []; savePersistentData(); renderHistoryModal();
      DOM.historyBadge.textContent = '0';
    }
  });
  DOM.btnExportHistory.addEventListener('click', () => {
    if (persistentData.history.length === 0) { alert('기록된 로그가 없습니다.'); return; }
    const lines = persistentData.history.map(h =>
      `[#${h.id}] ${h.mode} | 결과: ${h.result} | 시간: ${h.duration} | 토큰: ${h.tokens} | ${h.detail}`);
    navigator.clipboard.writeText(lines.join('\n')).then(()=>alert('기록이 클립보드에 복사되었습니다!'))
      .catch(()=>alert('화면의 표를 직접 복사해 주세요.'));
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
          <td><span style="color:#38bdf8;">${h.mode}</span></td>
          <td><strong>${h.result}</strong></td>
          <td>${h.duration}</td>
          <td>${h.tokens}</td>
          <td style="color:#94a3b8; font-size:0.8rem;">${h.detail}</td>`;
        DOM.historyTableBody.appendChild(tr);
      });
    }
    DOM.historyModal.style.display = 'flex';
  }

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && state.status === 'GAME_OVER') { DOM.resultModal.style.display = 'none'; prepareRestart(); }
    if (e.key === 'Escape' && state.currentView !== 'none') closeCloseup();
  });

  // ===== 새로고침/창 닫기 시 토큰 상자로 이동 (기절 처리) =====
  window.addEventListener('beforeunload', () => {
    // 게임 플레이 중일 때만 토큰을 상자로 옮깁니다. (이미 게임오버면 중복 저장 방지)
    if (state.status === 'PLAYING') {
      persistentData.chestTokens += state.currentTokens;
      savePersistentData();
    }
  });

  // ===== 초기화 =====
  loadPersistentData();
  if (persistentData.isReducedMotion) document.body.classList.add('reduced-motion');
  DOM.historyBadge.textContent = persistentData.history.length;
  DOM.btnReducedMotion.textContent = persistentData.isReducedMotion ? '🛑' : '✨';
  updateVolumeUI();
  setGameMode('normal');
  applyRoomVisual();
  updateDialDigits();
  updateUI();

})();