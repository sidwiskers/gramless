let score = 0;
const scoreEl = document.getElementById('score');
const tapBtn = document.getElementById('tap-btn');
const saveBtn = document.getElementById('save-btn');
const listEl = document.getElementById('leaderboard-list');

// Promise wrapper around Telegram.WebApp.Serverless.call
function callEndpoint(name, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!window.Telegram?.WebApp?.Serverless?.call) {
      return reject(new Error('Telegram.WebApp.Serverless is not available. Open inside Telegram.'));
    }
    window.Telegram.WebApp.Serverless.call(name, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

tapBtn.addEventListener('click', () => {
  score += 10;
  scoreEl.textContent = score;
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  try {
    await callEndpoint('submitScore', { score });
    alert('Score submitted successfully!');
    await loadLeaderboard();
  } catch (err) {
    alert('Error submitting score: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Submit Score';
  }
});

async function loadLeaderboard() {
  try {
    const data = await callEndpoint('getLeaderboard');
    if (data.leaderboard && data.leaderboard.length > 0) {
      listEl.innerHTML = data.leaderboard
        .map((item) => `<li><strong>${item.firstName}</strong>: ${item.score}</li>`)
        .join('');
    } else {
      listEl.innerHTML = '<li>No scores recorded yet.</li>';
    }
  } catch (err) {
    listEl.innerHTML = `<li>Error loading: ${err.message}</li>`;
  }
}

// Initial load
loadLeaderboard();
