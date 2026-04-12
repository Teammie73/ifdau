/* ═══════════════════════════════════════════════════════════
   IfDAU – Client-side JavaScript
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Mobile Sidebar Toggle ────────────────────────────────
  const menuToggle = document.getElementById('menuToggle');
  const sidebar    = document.getElementById('sidebar');
  const overlay    = document.getElementById('sidebarOverlay');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay && overlay.classList.toggle('open');
    });
    overlay && overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // ─── Auto-dismiss alerts ──────────────────────────────────
  document.querySelectorAll('.alert').forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.4s';
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 400);
    }, 5000);
  });

  // ─── Reading Progress Bar ─────────────────────────────────
  const progressBar = document.getElementById('readingProgress');
  if (progressBar) {
    const update = () => {
      const scrollTop = window.scrollY;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docH > 0 ? Math.round((scrollTop / docH) * 100) : 100;
      progressBar.style.width = pct + '%';
      const btn = document.getElementById('startQuizBtn');
      if (btn && pct >= 90) btn.style.display = 'inline-flex';
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // ─── Quiz ─────────────────────────────────────────────────
  const quizData = window.QUIZ_DATA;
  if (quizData && quizData.questions) {
    initQuiz(quizData);
  }

  // ─── Question Builder (Admin) ─────────────────────────────
  if (document.getElementById('questionsList')) {
    initQuestionBuilder();
  }

  // ─── Confirm dialogs ─────────────────────────────────────
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', e => {
      if (!confirm(el.dataset.confirm)) e.preventDefault();
    });
  });

});

/* ═══════════════════════════════════════════════════════════
   QUIZ ENGINE
   ═══════════════════════════════════════════════════════════ */
function initQuiz({ questions, passingScore, assignmentId }) {
  let current = 0;
  const userAnswers = {}; // { questionId: Set of answerIds }

  const container     = document.getElementById('quizContainer');
  const progressFill  = document.getElementById('quizProgressFill');
  const progressText  = document.getElementById('quizProgressText');
  const btnPrev       = document.getElementById('btnPrev');
  const btnNext       = document.getElementById('btnNext');
  const btnSubmit     = document.getElementById('btnSubmit');
  const form          = document.getElementById('quizForm');

  function getOrCreate(qId) {
    if (!userAnswers[qId]) userAnswers[qId] = new Set();
    return userAnswers[qId];
  }

  function render() {
    const q   = questions[current];
    const pct = Math.round(((current + 1) / questions.length) * 100);

    if (progressFill)  progressFill.style.width = pct + '%';
    if (progressText)  progressText.textContent = `Frage ${current + 1} von ${questions.length}`;

    const isMultiple = q.type === 'multiple';
    const selected   = getOrCreate(q.id);

    container.innerHTML = `
      <div class="question-card">
        <div class="question-number">Frage ${current + 1}</div>
        <div class="question-text">${escHtml(q.question_text)}</div>
        <div class="question-type-hint">
          ${isMultiple ? '(Mehrere Antworten möglich)' : '(Eine Antwort auswählen)'}
        </div>
        <div id="answersWrap">
          ${q.answers.map(a => `
            <label class="answer-option ${selected.has(String(a.id)) ? 'selected' : ''}">
              <input type="${isMultiple ? 'checkbox' : 'radio'}"
                     name="q_${q.id}"
                     value="${a.id}"
                     ${selected.has(String(a.id)) ? 'checked' : ''}>
              <span>${escHtml(a.answer_text)}</span>
            </label>
          `).join('')}
        </div>
      </div>`;

    // Bind answer events
    container.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        const qId  = String(q.id);
        const aId  = String(inp.value);
        const set  = getOrCreate(qId);
        if (isMultiple) {
          inp.checked ? set.add(aId) : set.delete(aId);
        } else {
          set.clear();
          set.add(aId);
        }
        container.querySelectorAll('.answer-option').forEach(el => el.classList.remove('selected'));
        container.querySelectorAll('input:checked').forEach(el => el.closest('.answer-option').classList.add('selected'));
      });
    });

    if (btnPrev)   btnPrev.disabled   = current === 0;
    if (btnNext)   btnNext.style.display  = current < questions.length - 1 ? '' : 'none';
    if (btnSubmit) btnSubmit.style.display = current === questions.length - 1 ? '' : 'none';
  }

  btnPrev  && btnPrev.addEventListener('click',   () => { if (current > 0) { current--; render(); } });
  btnNext  && btnNext.addEventListener('click',   () => { if (current < questions.length - 1) { current++; render(); } });

  if (btnSubmit && form) {
    btnSubmit.addEventListener('click', () => {
      // Build hidden answers JSON
      const answersObj = {};
      for (const [qId, set] of Object.entries(userAnswers)) {
        answersObj[qId] = Array.from(set);
      }
      // Add missing (unanswered) questions
      questions.forEach(q => {
        if (!answersObj[q.id]) answersObj[q.id] = [];
      });
      document.getElementById('answersInput').value = JSON.stringify(answersObj);
      form.submit();
    });
  }

  render();
}

/* ═══════════════════════════════════════════════════════════
   QUESTION BUILDER (Admin)
   ═══════════════════════════════════════════════════════════ */
function initQuestionBuilder() {
  const list       = document.getElementById('questionsList');
  const addBtn     = document.getElementById('addQuestionBtn');
  const hiddenInput= document.getElementById('questionsJson');
  let questions    = [];

  // Load existing questions if editing
  try {
    const existing = window.EXISTING_QUESTIONS;
    if (existing && Array.isArray(existing)) {
      questions = existing.map(q => ({
        text: q.question_text,
        type: q.type,
        answers: (q.answers || []).map(a => ({ text: a.answer_text, is_correct: !!a.is_correct }))
      }));
    }
  } catch(e) {}

  function syncHidden() {
    hiddenInput.value = JSON.stringify(questions);
  }

  function renderQuestion(q, idx) {
    const div = document.createElement('div');
    div.className = 'question-builder';
    div.dataset.idx = idx;
    div.innerHTML = `
      <div class="question-builder-header">
        <strong style="font-size:14px;">Frage ${idx + 1}</strong>
        <div style="display:flex;gap:8px;align-items:center;">
          <select class="form-control" style="width:auto;padding:5px 10px;font-size:13px;" data-field="type">
            <option value="single" ${q.type==='single'?'selected':''}>Einfachauswahl</option>
            <option value="multiple" ${q.type==='multiple'?'selected':''}>Mehrfachauswahl</option>
          </select>
          <button type="button" class="btn btn-sm btn-ghost" data-action="remove-question"
            style="color:var(--danger)">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="question-builder-body">
        <div class="form-group">
          <input type="text" class="form-control" placeholder="Frage eingeben..." value="${escHtml(q.text)}" data-field="text">
        </div>
        <div class="answers-list">
          ${q.answers.map((a, ai) => renderAnswerRow(a, ai)).join('')}
        </div>
        <button type="button" class="btn btn-sm btn-secondary" data-action="add-answer">
          + Antwort hinzufügen
        </button>
      </div>`;

    // Events
    div.querySelector('[data-field="text"]').addEventListener('input', e => {
      questions[idx].text = e.target.value;
      updateLabel(div, idx);
      syncHidden();
    });
    div.querySelector('[data-field="type"]').addEventListener('change', e => {
      questions[idx].type = e.target.value;
      syncHidden();
    });
    div.querySelector('[data-action="remove-question"]').addEventListener('click', () => {
      questions.splice(idx, 1);
      renderAll();
    });
    div.querySelector('[data-action="add-answer"]').addEventListener('click', () => {
      questions[idx].answers.push({ text: '', is_correct: false });
      renderAll();
    });
    bindAnswerEvents(div, idx);
    return div;
  }

  function renderAnswerRow(a, ai) {
    return `
      <div class="answer-row" data-ai="${ai}">
        <input type="text" class="form-control" placeholder="Antwort ${ai+1}" value="${escHtml(a.text)}" data-field="atext">
        <label class="correct-toggle">
          <input type="checkbox" ${a.is_correct ? 'checked' : ''} data-field="correct">
          Richtig
        </label>
        <button type="button" class="btn btn-sm btn-ghost" data-action="remove-answer" style="color:var(--danger);padding:4px 8px;">✕</button>
      </div>`;
  }

  function bindAnswerEvents(div, idx) {
    div.querySelectorAll('.answer-row').forEach((row, ai) => {
      row.querySelector('[data-field="atext"]').addEventListener('input', e => {
        questions[idx].answers[ai].text = e.target.value;
        syncHidden();
      });
      row.querySelector('[data-field="correct"]').addEventListener('change', e => {
        questions[idx].answers[ai].is_correct = e.target.checked;
        syncHidden();
      });
      row.querySelector('[data-action="remove-answer"]').addEventListener('click', () => {
        questions[idx].answers.splice(ai, 1);
        renderAll();
      });
    });
  }

  function updateLabel(div, idx) {
    const h = div.querySelector('.question-builder-header strong');
    if (h) h.textContent = `Frage ${idx + 1}`;
  }

  function renderAll() {
    list.innerHTML = '';
    questions.forEach((q, i) => list.appendChild(renderQuestion(q, i)));
    syncHidden();
  }

  addBtn && addBtn.addEventListener('click', () => {
    questions.push({ text: '', type: 'single', answers: [
      { text: '', is_correct: false },
      { text: '', is_correct: false }
    ]});
    renderAll();
  });

  renderAll();
}

/* ─── Quill Editor init ──────────────────────────────────── */
window.initQuill = function(selector, hiddenId, initialContent) {
  if (typeof Quill === 'undefined') return;
  const quill = new Quill(selector, {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['clean']
      ]
    }
  });
  if (initialContent) quill.root.innerHTML = initialContent;
  const hidden = document.getElementById(hiddenId);
  quill.on('text-change', () => { if (hidden) hidden.value = quill.root.innerHTML; });
  return quill;
};

/* ─── Helpers ────────────────────────────────────────────── */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
