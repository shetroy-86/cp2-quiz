const STORAGE_KEY       = 'cp2_progress_ch1';  // current question index (or sentinel 99 = retry mode)
const STORAGE_RETRY_KEY = 'cp2_retry_ch1';     // JSON array of question indices to retry
const STORAGE_VOICE_KEY = 'cp2_voice';         // preferred voice name

const state = {
  questions:     [],
  currentIndex:  0,
  selectedAnswer: null,
  submitted:     false,
  speaking:      false,
  // retry
  retryQueue:    [],       // indices of questions answered wrong (master list)
  retryMode:     false,
  retryIndex:    0,        // position within retryQueue for the current pass
  wrongThisPass: new Set() // indices wrong in the current retry pass
};

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadQuestions() {
  const res = await fetch('data/chapter1.json');
  state.questions = await res.json();

  // Restore retry queue
  try {
    const savedRetry = localStorage.getItem(STORAGE_RETRY_KEY);
    if (savedRetry) state.retryQueue = JSON.parse(savedRetry);
  } catch (e) {
    state.retryQueue = [];
  }

  // Restore progress
  const savedIdx = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!isNaN(savedIdx)) {
    if (savedIdx >= state.questions.length && state.retryQueue.length > 0) {
      // Sentinel: was mid-retry when they last closed
      state.retryMode  = true;
      state.retryIndex = 0; // restart the pass from the top
    } else if (savedIdx >= 0 && savedIdx < state.questions.length) {
      state.currentIndex = savedIdx;
    }
  }

  renderQuestion();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentQuestion() {
  return state.retryMode
    ? state.questions[state.retryQueue[state.retryIndex]]
    : state.questions[state.currentIndex];
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderQuestion() {
  const q     = currentQuestion();
  const total = state.questions.length;

  // Progress header
  if (state.retryMode) {
    const remaining = state.retryQueue.length;
    const pos       = state.retryIndex + 1;
    document.getElementById('progress-text').textContent = `Review ${pos} of ${remaining}`;
    document.getElementById('progress-bar').style.width  = Math.round((pos / remaining) * 100) + '%';
    document.getElementById('progress-label').textContent =
      `${remaining} question${remaining !== 1 ? 's' : ''} left to review`;
    document.getElementById('chapter-badge').textContent = 'Review Mode';
  } else {
    const num = state.currentIndex + 1;
    document.getElementById('progress-text').textContent = `Question ${num} of ${total}`;
    document.getElementById('progress-bar').style.width  = Math.round((num / total) * 100) + '%';
    document.getElementById('progress-label').textContent = `Overall Progress: ${Math.round((num / total) * 100)}%`;
    document.getElementById('chapter-badge').textContent = 'Chapter 1';
  }

  // Question text
  document.getElementById('question-text').textContent = q.question;

  // Image
  const imgContainer = document.getElementById('question-image-container');
  if (q.image) {
    document.getElementById('question-image').src = 'data/' + q.image;
    imgContainer.classList.remove('hidden');
  } else {
    imgContainer.classList.add('hidden');
  }

  // Answer buttons (generated fresh each question)
  const optionsEl = document.getElementById('answer-options');
  optionsEl.innerHTML = '';
  Object.entries(q.options).forEach(([key, text]) => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn w-full text-left bg-surface-container-low p-5 rounded-xl border-2 border-transparent hover:border-primary/30 active:scale-[0.98] transition-all duration-200 flex items-center gap-4 group';
    btn.dataset.key = key;
    btn.innerHTML = `
      <span class="answer-key w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary font-bold shrink-0 transition-colors">${key}</span>
      <span class="text-on-surface-variant group-hover:text-on-surface transition-colors">${text}</span>
    `;
    btn.addEventListener('click', () => selectAnswer(key));
    optionsEl.appendChild(btn);
  });

  // Reset transient sections
  document.getElementById('submit-btn-container').classList.add('hidden');
  document.getElementById('feedback-section').classList.add('hidden');
  document.getElementById('next-btn-container').classList.add('hidden');

  state.selectedAnswer = null;
  state.submitted      = false;

  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  state.speaking = false;
  updateReadAloudBtn();
}

// ── Answer Selection ──────────────────────────────────────────────────────────

function selectAnswer(key) {
  if (state.submitted) return;
  state.selectedAnswer = key;

  document.querySelectorAll('.answer-btn').forEach(btn => {
    const k        = btn.dataset.key;
    const keySpan  = btn.querySelector('.answer-key');
    const textSpan = btn.querySelector('span:last-child');

    if (k === key) {
      btn.classList.add('border-primary/50', 'bg-primary/5');
      btn.classList.remove('border-transparent');
      keySpan.classList.add('bg-primary', 'text-on-primary');
      keySpan.classList.remove('bg-surface-container-highest', 'text-primary');
      textSpan.classList.add('text-on-surface');
      textSpan.classList.remove('text-on-surface-variant');
    } else {
      btn.classList.remove('border-primary/50', 'bg-primary/5');
      btn.classList.add('border-transparent');
      keySpan.classList.remove('bg-primary', 'text-on-primary');
      keySpan.classList.add('bg-surface-container-highest', 'text-primary');
      textSpan.classList.remove('text-on-surface');
      textSpan.classList.add('text-on-surface-variant');
    }
  });

  document.getElementById('submit-btn-container').classList.remove('hidden');
}

// ── Submit ────────────────────────────────────────────────────────────────────

function submitAnswer() {
  if (!state.selectedAnswer || state.submitted) return;
  state.submitted = true;

  const q       = currentQuestion();
  const correct = state.selectedAnswer === q.answer;

  // Track misses
  if (!correct) {
    if (state.retryMode) {
      state.wrongThisPass.add(state.retryQueue[state.retryIndex]);
    } else {
      if (!state.retryQueue.includes(state.currentIndex)) {
        state.retryQueue.push(state.currentIndex);
        localStorage.setItem(STORAGE_RETRY_KEY, JSON.stringify(state.retryQueue));
      }
    }
  }

  // Lock buttons and colour correct / wrong
  document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.disabled = true;
    const k       = btn.dataset.key;
    const keySpan = btn.querySelector('.answer-key');

    if (k === q.answer) {
      btn.classList.add('border-secondary/50', 'bg-secondary/5');
      btn.classList.remove('border-transparent', 'border-primary/50', 'bg-primary/5');
      keySpan.classList.add('bg-secondary', 'text-on-secondary');
      keySpan.classList.remove('bg-surface-container-highest', 'text-primary', 'bg-primary', 'text-on-primary');
    }
    if (k === state.selectedAnswer && !correct) {
      btn.classList.add('border-tertiary-container/50', 'bg-tertiary-container/5');
      btn.classList.remove('border-transparent', 'border-primary/50', 'bg-primary/5');
      keySpan.classList.add('bg-tertiary-container', 'text-on-tertiary-container');
      keySpan.classList.remove('bg-surface-container-highest', 'text-primary', 'bg-primary', 'text-on-primary');
    }
  });

  document.getElementById('submit-btn-container').classList.add('hidden');

  // Feedback banner
  const feedbackSection        = document.getElementById('feedback-section');
  const feedbackIconContainer  = document.getElementById('feedback-icon-container');
  const feedbackIcon           = document.getElementById('feedback-icon');
  const feedbackTitle          = document.getElementById('feedback-title');

  feedbackSection.classList.remove('hidden');

  if (correct) {
    feedbackSection.className        = 'bg-secondary/10 rounded-xl p-6 space-y-3';
    feedbackIconContainer.className  = 'bg-secondary-container p-2 rounded-full flex items-center justify-center shrink-0';
    feedbackIcon.textContent         = 'check';
    feedbackIcon.className           = 'material-symbols-outlined text-on-secondary text-xl';
    feedbackTitle.textContent        = 'Correct!';
    feedbackTitle.className          = 'text-lg font-bold text-secondary';
  } else {
    feedbackSection.className        = 'bg-tertiary-container/10 rounded-xl p-6 space-y-3';
    feedbackIconContainer.className  = 'bg-tertiary-container/30 p-2 rounded-full flex items-center justify-center shrink-0';
    feedbackIcon.textContent         = 'close';
    feedbackIcon.className           = 'material-symbols-outlined text-on-tertiary-container text-xl';
    feedbackTitle.textContent        = `Incorrect — the answer is ${q.answer}`;
    feedbackTitle.className          = 'text-lg font-bold text-tertiary-container';
  }

  document.getElementById('next-btn-container').classList.remove('hidden');
}

// ── Navigation ────────────────────────────────────────────────────────────────

function nextQuestion() {
  state.retryMode ? advanceRetry() : advanceNormal();
}

function advanceNormal() {
  if (state.currentIndex >= state.questions.length - 1) {
    // Finished the chapter
    if (state.retryQueue.length === 0) {
      showCompletion();
    } else {
      enterRetryMode();
    }
    return;
  }
  state.currentIndex++;
  localStorage.setItem(STORAGE_KEY, state.currentIndex);
  renderQuestion();
}

function enterRetryMode() {
  state.retryMode    = true;
  state.retryIndex   = 0;
  state.wrongThisPass = new Set();
  localStorage.setItem(STORAGE_KEY, state.questions.length); // sentinel: past end = retry mode
  renderQuestion();
}

function advanceRetry() {
  state.retryIndex++;

  if (state.retryIndex >= state.retryQueue.length) {
    // End of pass — remove every question answered correctly in this pass
    state.retryQueue    = state.retryQueue.filter(idx => state.wrongThisPass.has(idx));
    state.wrongThisPass = new Set();
    state.retryIndex    = 0;

    if (state.retryQueue.length === 0) {
      showCompletion();
      return;
    }

    localStorage.setItem(STORAGE_RETRY_KEY, JSON.stringify(state.retryQueue));
  }

  renderQuestion();
}

// ── Completion & Reset ────────────────────────────────────────────────────────

function showCompletion() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_RETRY_KEY);
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  document.getElementById('quiz-container').classList.add('hidden');
  document.getElementById('completion-screen').classList.remove('hidden');
}

function startOver() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_RETRY_KEY);
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

  Object.assign(state, {
    currentIndex:   0,
    selectedAnswer: null,
    submitted:      false,
    speaking:       false,
    retryQueue:     [],
    retryMode:      false,
    retryIndex:     0,
    wrongThisPass:  new Set()
  });

  document.getElementById('completion-screen').classList.add('hidden');
  document.getElementById('quiz-container').classList.remove('hidden');
  renderQuestion();
}

// ── Voice Picker ──────────────────────────────────────────────────────────────

function populateVoices() {
  const select = document.getElementById('voice-select');
  const saved  = localStorage.getItem(STORAGE_VOICE_KEY);

  const voices = window.speechSynthesis.getVoices();

  select.innerHTML = '';
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    // Clean up long Windows/Google voice names for readability
    opt.textContent = v.name
      .replace('Microsoft ', '')
      .replace(/ - English \(.*?\)/, '')
      .replace(/ Online \(Natural\)/, ' (Natural)');
    if (v.name === saved) opt.selected = true;
    select.appendChild(opt);
  });

  // If nothing matched the saved preference, save whatever is now selected
  if (!saved && select.options.length > 0) {
    localStorage.setItem(STORAGE_VOICE_KEY, select.value);
  }
}

function selectedVoice() {
  const name   = document.getElementById('voice-select').value;
  const voices = window.speechSynthesis.getVoices();
  return voices.find(v => v.name === name) || null;
}

// ── Read Aloud ────────────────────────────────────────────────────────────────

function readAloud() {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    state.speaking = false;
    updateReadAloudBtn();
    return;
  }

  const q = currentQuestion();
  let text = `Question: ${q.question}. `;
  Object.entries(q.options).forEach(([key, val]) => { text += `${key}: ${val}. `; });

  const utterance  = new SpeechSynthesisUtterance(text);
  utterance.rate   = 0.85;
  const voice = selectedVoice();
  if (voice) utterance.voice = voice;
  utterance.onend  = () => { state.speaking = false; updateReadAloudBtn(); };
  utterance.onerror = () => { state.speaking = false; updateReadAloudBtn(); };

  state.speaking = true;
  updateReadAloudBtn();
  window.speechSynthesis.speak(utterance);
}

function updateReadAloudBtn() {
  const icon = document.querySelector('#read-aloud-btn .material-symbols-outlined');
  if (icon) icon.textContent = state.speaking ? 'stop_circle' : 'volume_up';
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('submit-btn').addEventListener('click', submitAnswer);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('read-aloud-btn').addEventListener('click', readAloud);
  document.getElementById('start-over-btn').addEventListener('click', () => {
    if (confirm('Start over from Question 1? Progress and missed questions will be cleared.')) {
      startOver();
    }
  });
  document.getElementById('completion-start-over-btn').addEventListener('click', startOver);

  document.getElementById('voice-select').addEventListener('change', e => {
    localStorage.setItem(STORAGE_VOICE_KEY, e.target.value);
  });

  // Refresh voice list when dropdown is opened — catches newly downloaded voices
  document.getElementById('voice-select').addEventListener('focus', populateVoices);

  document.getElementById('debug-voices-btn').addEventListener('click', () => {
    const voices = window.speechSynthesis.getVoices();
    alert(voices.length === 0
      ? 'No voices found.'
      : voices.map(v => `${v.name} (${v.lang})`).join('\n'));
  });

  // Voices load asynchronously — voiceschanged fires on desktop Chrome/Firefox,
  // but iOS won't provide voices until after a user gesture.
  window.speechSynthesis.addEventListener('voiceschanged', populateVoices);
  populateVoices();
  document.addEventListener('touchstart', function initVoicesOnTouch() {
    populateVoices();
    document.removeEventListener('touchstart', initVoicesOnTouch);
  }, { once: true });

  loadQuestions();
});
