(function () {
  'use strict';

  // --- Data: roots, extensions, note spellings, intervals ---
  const ROOTS = [
    { name: 'C',  pc: 0 },  { name: 'D',  pc: 2 },  { name: 'E',  pc: 4 },  { name: 'F',  pc: 5 },
    { name: 'G',  pc: 7 },  { name: 'A',  pc: 9 },  { name: 'B',  pc: 11 },
    { name: 'C#', pc: 1 },  { name: 'Db', pc: 1 },  { name: 'D#', pc: 3 },  { name: 'Eb', pc: 3 },
    { name: 'F#', pc: 6 },  { name: 'Gb', pc: 6 },  { name: 'G#', pc: 8 },  { name: 'Ab', pc: 8 },
    { name: 'A#', pc: 10 }, { name: 'Bb', pc: 10 },
  ];

  const EXTENSIONS = [
    { id: 'b3',  label: 'minor 3rd',  semitones: 3 },
    { id: '3',   label: 'major 3rd',  semitones: 4 },
    { id: 'b5',  label: '♭5',         semitones: 6 },
    { id: '5',   label: '5th',        semitones: 7 },
    { id: '#5',  label: '#5',         semitones: 8 },
    { id: 'b7',  label: 'minor 7th',  semitones: 10 },
    { id: '7',   label: 'major 7th',  semitones: 11 },
    { id: '9',   label: '9',          semitones: 2 },
    { id: 'b9',  label: '♭9',         semitones: 1 },
    { id: '#9',  label: '#9',         semitones: 3 },
    { id: '11',  label: '11',         semitones: 5 },
    { id: '#11', label: '#11',        semitones: 6 },
    { id: '13',  label: '13',         semitones: 9 },
    { id: 'b13', label: '♭13',        semitones: 8 },
  ];

  const NOTE_SPELLINGS = [
    'Cbb', 'Cb', 'C', 'C#', 'Cx', 'Dbb', 'Db', 'D', 'D#', 'Dx', 'Ebb', 'Eb', 'E', 'E#', 'Ex',
    'Fbb', 'Fb', 'F', 'F#', 'Fx', 'Gbb', 'Gb', 'G', 'G#', 'Gx', 'Abb', 'Ab', 'A', 'A#', 'Ax',
    'Bbb', 'Bb', 'B', 'B#', 'Bx',
  ];

  // Pitch class 0-11 to possible spellings (subset that map to that PC)
  const PC_TO_SPELLINGS = {
    0: ['C', 'Dbb', 'B#'], 1: ['C#', 'Db', 'Bx'], 2: ['D', 'Cx', 'Ebb'], 3: ['D#', 'Eb', 'Fbb'],
    4: ['E', 'Dx', 'Fb'], 5: ['F', 'E#', 'Gbb'], 6: ['F#', 'Gb', 'Ex'], 7: ['G', 'Fx', 'Abb'],
    8: ['G#', 'Ab'], 9: ['A', 'Gx', 'Bbb'], 10: ['A#', 'Bb', 'Cbb'], 11: ['B', 'Ax', 'Cb'],
  };

  function getPreferredSpelling(pc, extensionId) {
    const flatExtensions = ['b3', 'b5', 'b7', 'b9', 'b13'];
    const sharpExtensions = ['#5', '#9', '#11'];
    const spellings = PC_TO_SPELLINGS[pc];
    if (!spellings) return '?';
    const flat = spellings.find(s => s.length === 2 && s[1] === 'b');
    const sharp = spellings.find(s => s.length === 2 && s[1] === '#');
    const natural = spellings.find(s => s.length === 1);
    if (flatExtensions.includes(extensionId) && flat) return flat;
    if (sharpExtensions.includes(extensionId) && sharp) return sharp;
    return natural || sharp || flat || spellings[0];
  }

  const INTERVAL_BY_EXT = Object.fromEntries(EXTENSIONS.map(e => [e.id, e.semitones]));

  // Spelling -> pitch class (0–11) for audio
  const SPELLING_TO_PC = {};
  Object.entries(PC_TO_SPELLINGS).forEach(([pc, spellings]) => {
    spellings.forEach(s => { SPELLING_TO_PC[s] = parseInt(pc, 10); });
  });

  // --- Audio (Web Audio API) ---
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playNote(pitchClass, octave, durationMs) {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const semitonesFromA4 = (pitchClass - 9) + (octave - 4) * 12;
    const freq = 440 * Math.pow(2, semitonesFromA4 / 12);
    const now = ctx.currentTime;
    const duration = durationMs / 1000;
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    // Piano-like: fundamental + harmonics, quick attack and long decay
    const partials = [
      { freq: 1, gain: 1, type: 'sine' },
      { freq: 2, gain: 0.5, type: 'sine' },
      { freq: 3, gain: 0.25, type: 'triangle' },
      { freq: 4, gain: 0.15, type: 'triangle' },
    ];
    partials.forEach(({ freq: mult, gain: g, type }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      osc.frequency.value = freq * mult;
      osc.type = type;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12 * g, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    });
  }

  function playRootForQuestion(rootName) {
    const root = getRootByName(rootName);
    if (!root) return;
    playNote(root.pc, 4, 2200);
  }

  function playAnswerNote(spelling) {
    const pc = SPELLING_TO_PC[spelling];
    if (pc === undefined) return;
    playNote(pc, 4, 2200);
  }

  // --- State ---
  let state = {
    gameStarted: false,
    mode: 'practice',
    correct: 0,
    incorrect: 0,
    mistakes: [],
    currentQuestion: null,
    selectedRoots: ['C'],
    selectedExtensions: ['b3', '3', '5', 'b7', '7'],
    challengeSecondsLeft: 0,
    challengeTimerId: null,
    soundEnabled: true,
    theme: 'dark',
    flipped: false,
  };

  const STORAGE_KEY = 'scale-degree-quiz-settings';
  const SETTINGS_VERSION = 2; // bump to apply new defaults (roots: C only; extensions: minor/major 3rd, 5th, minor/major 7th)

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const version = data.settingsVersion || 1;
        if (version >= SETTINGS_VERSION) {
          if (Array.isArray(data.selectedRoots)) state.selectedRoots = data.selectedRoots;
          if (Array.isArray(data.selectedExtensions)) state.selectedExtensions = data.selectedExtensions;
        }
        if (data.theme === 'light' || data.theme === 'dark') state.theme = data.theme;
      }
    } catch (_) {}
    saveSettings();
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settingsVersion: SETTINGS_VERSION,
      selectedRoots: state.selectedRoots,
      selectedExtensions: state.selectedExtensions,
      theme: state.theme,
    }));
  }

  function getRootByName(name) {
    return ROOTS.find(r => r.name === name);
  }

  function pickQuestion() {
    const roots = state.selectedRoots.filter(r => getRootByName(r));
    const exts = state.selectedExtensions.filter(id => INTERVAL_BY_EXT[id] != null);
    if (roots.length === 0 || exts.length === 0) return null;
    const rootName = roots[Math.floor(Math.random() * roots.length)];
    const extId = exts[Math.floor(Math.random() * exts.length)];
    const root = getRootByName(rootName);
    const semitones = INTERVAL_BY_EXT[extId];
    const pc = (root.pc + semitones) % 12;
    const correctSpelling = getPreferredSpelling(pc, extId);
    const extLabel = EXTENSIONS.find(e => e.id === extId).label;
    return { rootName, extId, extLabel, correctSpelling, pc };
  }

  // Piano layout: 12 keys per octave. 0=C, 1=C#, 2=D, ... 11=B. White = 0,2,4,5,7,9,11; black = 1,3,6,8,10.
  const PIANO_KEY_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const PIANO_WHITE = [0, 2, 4, 5, 7, 9, 11];
  const PIANO_BLACK = [1, 3, 6, 8, 10];

  // --- DOM ---
  const el = (id) => document.getElementById(id);

  function updateStats() {
    const total = state.correct + state.incorrect;
    el('stat-correct').textContent = state.correct;
    el('stat-incorrect').textContent = state.incorrect;
    el('stat-accuracy').textContent = total === 0 ? '—' : Math.round((state.correct / total) * 100) + '%';
  }

  function showFeedback(msg) {
    const fb = el('feedback');
    el('feedback-text').textContent = msg;
    fb.classList.remove('hidden');
  }

  function hideFeedback() {
    el('feedback').classList.add('hidden');
  }

  function setQuestion(q) {
    state.currentQuestion = q;
    state.flipped = false;
    if (!q) {
      el('question-text').innerHTML = 'No roots or extensions selected. Open <strong>Settings</strong> to choose them.';
      el('btn-flip').classList.add('hidden');
      renderPianoKeyboard([]);
      return;
    }
    el('question-text').innerHTML = `What note is the <span class="highlight" id="q-extension">${q.extLabel}</span> of <span class="highlight" id="q-root">${q.rootName}</span> ?`;
    el('btn-flip').classList.remove('hidden');
    renderPianoKeyboard([0,1,2,3,4,5,6,7,8,9,10,11, 0,1,2,3,4,5,6,7,8,9,10,11]);
    playRootForQuestion(q.rootName);
  }

  function renderPianoKeyboard(pitchClasses) {
    const container = el('piano-keyboard');
    container.innerHTML = '';
    if (!pitchClasses.length) return;
    const row = document.createElement('div');
    row.className = 'piano-keys-row';
    pitchClasses.forEach((pc, i) => {
      const isWhite = PIANO_WHITE.includes(pc);
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'piano-key piano-key--' + (isWhite ? 'white' : 'black');
      key.dataset.pitchClass = String(pc);
      key.setAttribute('aria-label', PIANO_KEY_LABELS[pc]);
      key.textContent = PIANO_KEY_LABELS[pc];
      key.addEventListener('click', () => submitAnswerByPitchClass(pc, key));
      row.appendChild(key);
    });
    container.appendChild(row);
  }

  function submitAnswerByPitchClass(selectedPc, clickedKeyEl) {
    const q = state.currentQuestion;
    if (!q) return;
    const correct = selectedPc === q.pc;
    const keys = el('piano-keyboard').querySelectorAll('.piano-key');
    keys.forEach(key => {
      key.disabled = true;
      const pc = parseInt(key.dataset.pitchClass, 10);
      if (pc === q.pc) key.classList.add('correct');
    });
    if (!correct) clickedKeyEl.classList.add('incorrect');
    if (correct) {
      state.correct++;
      hideFeedback();
      playAnswerNote(q.correctSpelling);
      if (state.mode === 'challenge') {
        setTimeout(nextQuestion, 400);
      } else {
        setTimeout(nextQuestion, 800);
      }
    } else {
      state.incorrect++;
      const wrongLabel = PIANO_KEY_LABELS[selectedPc];
      state.mistakes.push({ root: q.rootName, ext: q.extLabel, correct: q.correctSpelling, wrong: wrongLabel });
      showFeedback(`Oops! The ${q.extLabel} of ${q.rootName} is ${q.correctSpelling}`);
      if (state.mode === 'practice') {
        setTimeout(nextQuestion, 2000);
      } else {
        setTimeout(nextQuestion, 600);
      }
    }
    updateStats();
  }

  function nextQuestion() {
    if (state.mode === 'challenge' && state.challengeSecondsLeft <= 0) {
      return;
    }
    setQuestion(pickQuestion());
  }

  function flipCard() {
    if (!state.currentQuestion || state.flipped) return;
    state.flipped = true;
    const q = state.currentQuestion;
    const keys = el('piano-keyboard').querySelectorAll(`[data-pitch-class="${q.pc}"]`);
    keys.forEach(key => key.classList.add('revealed'));
    if (keys.length) keys[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // --- Modes ---
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    const timerEl = el('challenge-timer');
    if (mode === 'challenge') {
      timerEl.classList.remove('hidden');
      startChallenge();
    } else {
      timerEl.classList.add('hidden');
      stopChallengeTimer();
      timerEl.textContent = '60s';
      timerEl.classList.remove('warning', 'danger');
    }
    state.correct = 0;
    state.incorrect = 0;
    state.mistakes = [];
    updateStats();
    hideFeedback();
    nextQuestion();
  }

  function startChallenge() {
    state.challengeSecondsLeft = 60;
    el('challenge-timer').textContent = '60s';
    el('challenge-timer').classList.remove('warning', 'danger');
    nextQuestion();
    stopChallengeTimer();
    state.challengeTimerId = setInterval(() => {
      state.challengeSecondsLeft--;
      const elt = el('challenge-timer');
      elt.textContent = state.challengeSecondsLeft + 's';
      if (state.challengeSecondsLeft <= 10) elt.classList.add('danger');
      else if (state.challengeSecondsLeft <= 20) elt.classList.add('warning');
      if (state.challengeSecondsLeft <= 0) {
        stopChallengeTimer();
        setQuestion(null);
      }
    }, 1000);
  }

  function stopChallengeTimer() {
    if (state.challengeTimerId) {
      clearInterval(state.challengeTimerId);
      state.challengeTimerId = null;
    }
  }

  // --- Modals ---
  function openSettings() {
    renderSettingsCheckboxes();
    el('modal-settings').classList.remove('hidden');
  }

  function closeSettings() {
    el('modal-settings').classList.add('hidden');
  }

  function renderSettingsCheckboxes() {
    const rootsEl = el('settings-roots');
    const extsEl = el('settings-extensions');
    rootsEl.innerHTML = '';
    extsEl.innerHTML = '';

    const rootsToggleRow = document.createElement('div');
    rootsToggleRow.className = 'settings-toggle-row';
    const rootsOn = document.createElement('button');
    rootsOn.type = 'button';
    rootsOn.className = 'btn-link';
    rootsOn.textContent = 'Turn on all';
    rootsOn.addEventListener('click', () => {
      state.selectedRoots = ROOTS.map(r => r.name);
      renderSettingsCheckboxes();
    });
    const rootsOff = document.createElement('button');
    rootsOff.type = 'button';
    rootsOff.className = 'btn-link';
    rootsOff.textContent = 'Turn off all';
    rootsOff.addEventListener('click', () => {
      state.selectedRoots = [];
      renderSettingsCheckboxes();
    });
    rootsToggleRow.appendChild(rootsOn);
    rootsToggleRow.appendChild(document.createTextNode(' · '));
    rootsToggleRow.appendChild(rootsOff);
    rootsEl.appendChild(rootsToggleRow);

    const naturalRoots = ROOTS.filter(r => ['C','D','E','F','G','A','B'].includes(r.name));
    const otherRoots = ROOTS.filter(r => !['C','D','E','F','G','A','B'].includes(r.name));
    [...naturalRoots, ...otherRoots].forEach(r => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = r.name;
      input.checked = state.selectedRoots.includes(r.name);
      input.addEventListener('change', () => {
        if (input.checked) state.selectedRoots.push(r.name);
        else state.selectedRoots = state.selectedRoots.filter(x => x !== r.name);
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(r.name));
      rootsEl.appendChild(label);
    });

    const extsToggleRow = document.createElement('div');
    extsToggleRow.className = 'settings-toggle-row';
    const extsOn = document.createElement('button');
    extsOn.type = 'button';
    extsOn.className = 'btn-link';
    extsOn.textContent = 'Turn on all';
    extsOn.addEventListener('click', () => {
      state.selectedExtensions = EXTENSIONS.map(e => e.id);
      renderSettingsCheckboxes();
    });
    const extsOff = document.createElement('button');
    extsOff.type = 'button';
    extsOff.className = 'btn-link';
    extsOff.textContent = 'Turn off all';
    extsOff.addEventListener('click', () => {
      state.selectedExtensions = [];
      renderSettingsCheckboxes();
    });
    extsToggleRow.appendChild(extsOn);
    extsToggleRow.appendChild(document.createTextNode(' · '));
    extsToggleRow.appendChild(extsOff);
    extsEl.appendChild(extsToggleRow);

    EXTENSIONS.forEach(ext => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = ext.id;
      input.checked = state.selectedExtensions.includes(ext.id);
      input.addEventListener('change', () => {
        if (input.checked) state.selectedExtensions.push(ext.id);
        else state.selectedExtensions = state.selectedExtensions.filter(x => x !== ext.id);
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(ext.label));
      extsEl.appendChild(label);
    });
  }

  function applySettings() {
    saveSettings();
    closeSettings();
    document.documentElement.setAttribute('data-theme', state.theme);
    nextQuestion();
  }

  function openResults() {
    const total = state.correct + state.incorrect;
    let html = `<p><strong>Correct:</strong> ${state.correct} &nbsp; <strong>Incorrect:</strong> ${state.incorrect}</p>`;
    html += total > 0 ? `<p><strong>Accuracy:</strong> ${Math.round((state.correct / total) * 100)}%</p>` : '';
    el('results-summary').innerHTML = html;
    const mistakesEl = el('results-mistakes');
    if (state.mistakes.length === 0) {
      mistakesEl.innerHTML = '<p>No mistakes in this session.</p>';
    } else {
      mistakesEl.innerHTML = '<h3>Mistakes</h3><ul>' +
        state.mistakes.map(m => `<li>${m.ext} of ${m.root}: you said <strong>${m.wrong}</strong>, correct is <strong>${m.correct}</strong></li>`).join('') +
        '</ul>';
    }
    el('modal-results').classList.remove('hidden');
  }

  function closeResults() {
    el('modal-results').classList.add('hidden');
  }

  // --- Theme & sound ---
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    saveSettings();
    const sun = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if (state.theme === 'dark') {
      sun?.classList.remove('hidden');
      moon?.classList.add('hidden');
    } else {
      sun?.classList.add('hidden');
      moon?.classList.remove('hidden');
    }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
  }

  // --- Init ---
  function init() {
    loadSettings();
    document.documentElement.setAttribute('data-theme', state.theme);
    if (state.theme === 'light') {
      document.querySelector('.sun-icon')?.classList.add('hidden');
      document.querySelector('.moon-icon')?.classList.remove('hidden');
    }

    el('btn-settings').addEventListener('click', openSettings);
    el('modal-settings-backdrop').addEventListener('click', closeSettings);
    el('modal-settings-close').addEventListener('click', closeSettings);
    el('btn-settings-apply').addEventListener('click', applySettings);

    el('btn-results').addEventListener('click', openResults);
    el('modal-results-backdrop').addEventListener('click', closeResults);
    el('modal-results-close').addEventListener('click', closeResults);

    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });

    el('btn-flip').addEventListener('click', flipCard);
    el('btn-theme').addEventListener('click', toggleTheme);
    el('btn-sound').addEventListener('click', toggleSound);

    el('btn-start-game').addEventListener('click', startGame);

    updateStats();
  }

  function startGame() {
    state.gameStarted = true;
    el('start-card').classList.add('hidden');
    el('game-content').classList.remove('hidden');
    if (state.mode === 'challenge') {
      startChallenge();
    } else {
      nextQuestion();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
