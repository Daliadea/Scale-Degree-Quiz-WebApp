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
    { id: '9',   label: '9',   semitones: 2 },
    { id: 'b9',  label: '♭9',  semitones: 1 },
    { id: '#9',  label: '#9',  semitones: 3 },
    { id: '11',  label: '11',  semitones: 5 },
    { id: '#11', label: '#11', semitones: 6 },
    { id: '13',  label: '13',  semitones: 9 },
    { id: 'b13', label: '♭13', semitones: 8 },
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
    const flatExtensions = ['b9', 'b13'];
    const sharpExtensions = ['#9', '#11'];
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
    // A4 = 440 Hz; A is pitch class 9. semitones from A4 = (pc - 9) + (octave - 4) * 12
    const semitonesFromA4 = (pitchClass - 9) + (octave - 4) * 12;
    const freq = 440 * Math.pow(2, semitonesFromA4 / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  function playRootForQuestion(rootName) {
    const root = getRootByName(rootName);
    if (!root) return;
    playNote(root.pc, 4, 500);
  }

  function playAnswerNote(spelling) {
    const pc = SPELLING_TO_PC[spelling];
    if (pc === undefined) return;
    playNote(pc, 5, 600);
  }

  // --- State ---
  let state = {
    mode: 'practice',
    correct: 0,
    incorrect: 0,
    mistakes: [],
    currentQuestion: null,
    selectedRoots: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    selectedExtensions: ['9', 'b9', '#9', '11', '#11', '13', 'b13'],
    challengeSecondsLeft: 0,
    challengeTimerId: null,
    soundEnabled: true,
    theme: 'dark',
    flipped: false,
  };

  const STORAGE_KEY = 'scale-degree-quiz-settings';

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.selectedRoots)) state.selectedRoots = data.selectedRoots;
        if (Array.isArray(data.selectedExtensions)) state.selectedExtensions = data.selectedExtensions;
        if (data.theme === 'light' || data.theme === 'dark') state.theme = data.theme;
      }
    } catch (_) {}
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
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

  function getSpellingsForPitchClass(pc) {
    return PC_TO_SPELLINGS[pc] || [];
  }

  function getAllSpellingsForGrid() {
    const set = new Set();
    NOTE_SPELLINGS.forEach(n => set.add(n));
    return Array.from(set).sort((a, b) => {
      const order = 'C D E F G A B'.split(' ');
      const letter = (s) => s.replace(/[#bx]+$/i, '')[0];
      const acc = (s) => {
        const m = s.match(/([#b]*)(x)?$/i);
        let v = (m && m[1]) || '';
        if (m && m[2]) v += 'x';
        return v;
      };
      const la = order.indexOf(letter(a)), lb = order.indexOf(letter(b));
      if (la !== lb) return la - lb;
      const aa = acc(a), ab = acc(b);
      const accOrder = ['bb', 'b', '', '#', 'x'];
      return accOrder.indexOf(aa) - accOrder.indexOf(ab);
    });
  }

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
      el('q-extension').textContent = '';
      el('q-root').textContent = '';
      el('btn-flip').classList.add('hidden');
      renderNoteGrid([]);
      return;
    }
    el('question-text').innerHTML = `What note is the <span class="highlight" id="q-extension">${q.extLabel}</span> of <span class="highlight" id="q-root">${q.rootName}</span> ?`;
    el('btn-flip').classList.remove('hidden');
    const spellings = getAllSpellingsForGrid();
    renderNoteGrid(spellings, q.correctSpelling);
    playRootForQuestion(q.rootName);
  }

  function renderNoteGrid(spellings, correctSpelling) {
    const grid = el('note-grid');
    grid.innerHTML = '';
    if (!spellings.length) return;
    spellings.forEach(note => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'note-btn';
      btn.textContent = note;
      btn.dataset.note = note;
      btn.addEventListener('click', () => onNoteClick(note));
      grid.appendChild(btn);
    });
  }

  function onNoteClick(selectedNote) {
    const q = state.currentQuestion;
    if (!q) return;
    const correct = selectedNote === q.correctSpelling;
    const buttons = el('note-grid').querySelectorAll('.note-btn');
    buttons.forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.note === q.correctSpelling) btn.classList.add('correct');
      else if (btn.dataset.note === selectedNote && !correct) btn.classList.add('incorrect');
    });
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
      state.mistakes.push({ root: q.rootName, ext: q.extLabel, correct: q.correctSpelling, wrong: selectedNote });
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
    const btn = el('note-grid').querySelector(`[data-note="${q.correctSpelling}"]`);
    if (btn) {
      btn.classList.add('revealed');
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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

    updateStats();
    nextQuestion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
