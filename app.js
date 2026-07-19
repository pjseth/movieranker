const MOVIES_URL = "./data/movies_sample.json";
const HOME_BATCH = 8; // show 8 movies on homepage
const DEFAULT_TMDB_KEY = "bee71253705403e627bdb627ad0e38c7"; // real key from https://www.themoviedb.org/settings/api

const app = document.getElementById("app");
let page = "loading"; // landing, signin, signup, intro, home, insertion, unwatched
let allMovies = [];

// user data stored in localStorage under filmfavs_users and filmfavs_current
let users = {}; // username -> { email, username, password, ratedMovies: [], unwatched: [] }
let currentUser = null;

// insertion state for binary placement
let insertion = { newMovie: null, low: 0, high: 0, source: null, sourceIndex: null };
let currentHomeBatch = [];

async function init() {
  loadUsers();
  try {
    const response = await fetch(MOVIES_URL);
    allMovies = await response.json();
    page = "landing";
    render();
    attachNavHandlers();
  } catch (err) {
    app.innerHTML = `<section><h2>Unable to load movie database</h2><p>${err.message}</p></section>`;
  }
}

function loadUsers() {
  try {
    const raw = localStorage.getItem("filmfavs_users");
    users = raw ? JSON.parse(raw) : {};
    const cu = localStorage.getItem("filmfavs_current");
    currentUser = cu ? JSON.parse(cu) : null;
  } catch (e) {
    users = {};
    currentUser = null;
  }
}

function saveUsers() {
  localStorage.setItem("filmfavs_users", JSON.stringify(users));
  localStorage.setItem("filmfavs_current", JSON.stringify(currentUser));
}

function getPosterUrl(movie) {
  return movie.posterUrl || "https://via.placeholder.com/200x300?text=No+Image";
}

async function hashPassword(password) {
  if (!password) return null;
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getTMDBKey() {
  return DEFAULT_TMDB_KEY || null;
}

function setTMDBKey(key) {
  if (key) localStorage.setItem('tmdb_key', key);
  else localStorage.removeItem('tmdb_key');
}

async function fetchPosterFromTMDB(movie) {
  const key = getTMDBKey();
  if (!key) return null;
  // simple cache in localStorage
  const cacheRaw = localStorage.getItem('tmdb_posters') || '{}';
  const cache = JSON.parse(cacheRaw);
  const cacheKey = `${movie.title}|${movie.year || ''}`;
  if (cache[cacheKey]) return cache[cacheKey];
  try {
    const q = encodeURIComponent(movie.title);
    const year = movie.year ? `&year=${movie.year}` : '';
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${q}${year}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.results && data.results.length) {
      const p = data.results[0].poster_path;
      if (p) {
        const full = `https://image.tmdb.org/t/p/w342${p}`;
        cache[cacheKey] = full;
        localStorage.setItem('tmdb_posters', JSON.stringify(cache));
        return full;
      }
    }
  } catch (e) {
    console.warn('TMDB fetch failed', e);
  }
  return null;
}

async function fetchBatchPosters(batch) {
  const key = getTMDBKey();
  if (!key) return;
  const promises = batch.map(async (movie) => {
    if (!movie.posterUrl || movie.posterUrl.includes('via.placeholder.com')) {
      const poster = await fetchPosterFromTMDB(movie);
      if (poster) {
        movie.posterUrl = poster;
      }
    }
  });
  await Promise.all(promises);
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function attachNavHandlers() {
  document.getElementById("nav-home").addEventListener("click", () => { page = "home"; render(); });
  const mylistBtn = document.getElementById("nav-mylist");
  if (mylistBtn) mylistBtn.addEventListener("click", () => { page = "mylist"; render(); });
  document.getElementById("nav-unwatched").addEventListener("click", () => { page = "unwatched"; render(); });
  const undoBtn = document.getElementById("nav-undo");
  if (undoBtn) undoBtn.addEventListener("click", () => { performUndo(); });
  document.getElementById("nav-signin").addEventListener("click", () => { page = "signin"; render(); });
  document.getElementById("nav-signup").addEventListener("click", () => { page = "signup"; render(); });
  document.getElementById("nav-logout").addEventListener("click", () => { currentUser = null; saveUsers(); page = "landing"; render(); });
}

function renderHeader() {
  // update nav visibility based on auth
  const signin = document.getElementById("nav-signin");
  const signup = document.getElementById("nav-signup");
  const logout = document.getElementById("nav-logout");
  const undo = document.getElementById("nav-undo");
  const mylist = document.getElementById("nav-mylist");
  if (currentUser) {
    signin.style.display = "none";
    signup.style.display = "none";
    logout.style.display = "inline-block";
    if (undo) undo.style.display = (currentUser._history && currentUser._history.length) ? 'inline-block' : 'none';
    if (mylist) mylist.style.display = 'inline-block';
  } else {
    signin.style.display = "inline-block";
    signup.style.display = "inline-block";
    logout.style.display = "none";
    if (undo) undo.style.display = 'none';
    if (mylist) mylist.style.display = 'none';
  }
}

function renderLoading() {
  const section = document.createElement('section');
  section.innerHTML = `
    <h2>Loading...</h2>
    <p>Please wait while the page loads.</p>
  `;
  app.appendChild(section);
}

function render() {
  renderHeader();
  app.innerHTML = "";
  console.log('render page:', page);
  if (page === "loading") return renderLoading();
  if (page === "landing") return renderLanding();
  if (page === "signin") return renderSignIn();
  if (page === "signup") return renderSignUp();
  if (page === "intro") return renderIntro();
  if (page === "home") {
    return renderHome();
  }
  if (page === "mylist") return renderMyList();
  if (page === "insertion") return renderInsertion();
  if (page === "unwatched") return renderUnwatchedPage();
  const section = document.createElement('section');
  section.innerHTML = `
    <h2>Unknown page: ${page}</h2>
    <p>This is a fallback render state. Try refreshing the page.</p>
  `;
  app.appendChild(section);
}

function renderLanding() {
  const section = document.createElement("section");
  section.className = "landing";
  section.innerHTML = `
    <h2>Welcome to Filmfavs</h2>
    <p class="small-meta">Compare movies the way humans choose: by preference, not stars.</p>
    <div style="margin-top:18px">
      <button id="landing-signin">Sign In</button>
      <button id="landing-signup" class="secondary">Create Account</button>
    </div>
  `;
  app.appendChild(section);
  document.getElementById("landing-signin").addEventListener("click", () => { page = "signin"; render(); });
  document.getElementById("landing-signup").addEventListener("click", () => { page = "signup"; render(); });
}

function renderSignIn() {
  const section = document.createElement("section");
  section.innerHTML = `
    <h2>Sign in</h2>
    <form id="signin-form" class="auth-form">
      <label>Username</label>
      <input name="username" />
      <label>Password</label>
      <input name="password" type="password" />
      <div style="display:flex;gap:8px"><button type="submit">Sign In</button><button type="button" class="secondary" id="cancel-signin">Cancel</button></div>
    </form>
  `;
  app.appendChild(section);
  document.getElementById("cancel-signin").addEventListener("click", () => { page = "landing"; render(); });
  document.getElementById("signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const username = f.username.value.trim();
    const password = f.password.value;
    const user = users[username];
    if (!user) return alert('Invalid username or password');
    // if user has legacy plaintext `password`, accept and migrate
    if (user.password && user.password === password) {
      const hashed = await hashPassword(password);
      user.passwordHash = hashed;
      delete user.password;
      users[username] = user;
      currentUser = user;
      saveUsers();
      page = "home";
      render();
      return;
    }
    // otherwise compare hashes
    if (user.passwordHash) {
      const h = await hashPassword(password);
      if (h === user.passwordHash) {
        currentUser = user;
        saveUsers();
        page = "home";
        render();
        return;
      }
    }
    alert('Invalid username or password');
  });
}

function renderSignUp() {
  const section = document.createElement("section");
  section.innerHTML = `
    <h2>Create account</h2>
    <form id="signup-form" class="auth-form">
      <label>Email</label>
      <input name="email" type="email" />
      <label>Username</label>
      <input name="username" />
      <label>Password</label>
      <input name="password" type="password" />
      <div style="display:flex;gap:8px"><button type="submit">Create account</button><button type="button" class="secondary" id="cancel-signup">Cancel</button></div>
    </form>
  `;
  app.appendChild(section);
  document.getElementById("cancel-signup").addEventListener("click", () => { page = "landing"; render(); });
  document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const username = f.username.value.trim();
    const password = f.password.value;
    if (!username || !password || !email) { alert('Please fill all fields'); return; }
    if (users[username]) { alert('Username taken'); return; }
    const hashed = await hashPassword(password);
    users[username] = { email, username, passwordHash: hashed, ratedMovies: [], unwatched: [], _history: [] };
    currentUser = users[username];
    saveUsers();
    page = "intro";
    render();
  });
}

function renderIntro() {
  const section = document.createElement("section");
  section.innerHTML = `
    <h2>Welcome to filmfavs!</h2>
    <p>Here you can rank and order your favorite movies. First we need to set a standard for your rating system. Let's start with the most popular films.</p>
    <p class="small-meta">Filmfavs uses comparisons like Beli's binary insertion method: each new movie is compared against movies on your list until it's placed exactly.</p>
    <div style="margin-top:16px"><button id="start-home">Start rating popular films</button></div>
  `;
  app.appendChild(section);
  document.getElementById("start-home").addEventListener("click", () => { page = "home"; render(); });
}

function getUserData() {
  if (!currentUser) return { ratedMovies: [], unwatched: [] };
  const u = users[currentUser.username];
  return u || { ratedMovies: [], unwatched: [] };
}

function saveUserData() {
  if (!currentUser) return;
  users[currentUser.username] = currentUser;
  saveUsers();
}

async function renderHome() {
  const section = document.createElement("section");
  section.innerHTML = `<h2>Homepage</h2><p>Browse popular movies and add them to your ranked list.</p>`;
  const controls = document.createElement('div');
  const shuffleBtn = document.createElement('button');
  shuffleBtn.textContent = 'Refresh batch';
  controls.appendChild(shuffleBtn);
  section.appendChild(controls);

  const grid = document.createElement('div');
  grid.className = 'grid movie-grid movie-grid-home';
  if (!currentHomeBatch.length) {
    currentHomeBatch = shuffleArray(allMovies).slice(0, HOME_BATCH);
  }
  const batch = currentHomeBatch;

  if (getTMDBKey()) {
    await fetchBatchPosters(batch);
  }

  batch.forEach((movie) => {
    const inList = currentUser && currentUser.ratedMovies && currentUser.ratedMovies.some(x => x.id === movie.id);
    const isUnwatched = currentUser && currentUser.unwatched && currentUser.unwatched.some(x => x.id === movie.id);
    const card = document.createElement('article');
    card.className = 'movie-card';
    card.innerHTML = `
      <img src="${getPosterUrl(movie)}" alt="${movie.title} poster" />
      <h3>${movie.title}</h3>
      <p class="small-meta">${movie.year || ''}${movie.genres ? ' • ' + movie.genres.slice(0,2).join(', ') : ''}</p>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button data-add="${movie.id}" ${inList ? 'disabled class="secondary"' : ''}>${inList ? 'In list' : 'Add to list'}</button>
        <button class="secondary" data-unseen="${movie.id}" ${isUnwatched ? 'disabled' : ''}>${isUnwatched ? 'Saved' : "I haven't seen this"}</button>
      </div>
    `;
    grid.appendChild(card);
  });
  section.appendChild(grid);
  app.appendChild(section);

  shuffleBtn.addEventListener('click', () => {
    currentHomeBatch = shuffleArray(allMovies).slice(0, HOME_BATCH);
    render();
  });

  section.querySelectorAll('button[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.add);
      const movie = allMovies.find(m => m.id === id);
      startInsertion(movie);
    });
  });
  section.querySelectorAll('button[data-unseen]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.unseen);
      const movie = allMovies.find(m => m.id === id);
      if (!currentUser) { alert('Sign in to save unwatched list'); return; }
      if (!currentUser.unwatched) currentUser.unwatched = [];
      if (!currentUser.unwatched.some(x=>x.id===movie.id)) currentUser.unwatched.push(movie);
      saveUserData();
      alert('Added to your Unwatched list');
    });
  });
}

function renderMyList() {
  const section = document.createElement('section');
  section.innerHTML = `<h2>My Ranked List</h2>`;
  if (!currentUser) {
    section.innerHTML += '<p>Please sign in to view your list.</p>';
    app.appendChild(section);
    return;
  }
  const list = document.createElement('ol');
  list.className = 'final-list';
  const rated = currentUser.ratedMovies || [];
  if (!rated.length) {
    section.innerHTML += '<p>Your list is empty. Add movies on the Homepage.</p>';
    app.appendChild(section);
    return;
  }
  rated.forEach((m, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <article class="movie-card">
        <img src="${getPosterUrl(m)}" alt="${m.title} poster" />
        <h3>${m.title}</h3>
        <p class="small-meta">${m.year || ''}${m.genres ? ' • ' + m.genres.slice(0,2).join(', ') : ''}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px">
          <div style="display:flex;gap:8px">
            <button data-up="${idx}">▲</button>
            <button data-down="${idx}">▼</button>
          </div>
          <button data-remove="${idx}">Remove</button>
        </div>
      </article>`;
    list.appendChild(li);
  });
  section.appendChild(list);
  app.appendChild(section);

  section.querySelectorAll('button[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.remove);
      const removed = currentUser.ratedMovies.splice(idx,1)[0];
      if (!currentUser._history) currentUser._history = [];
      currentUser._history.push({type:'remove', index: idx, movie: removed});
      saveUserData();
      render();
    });
  });
  section.querySelectorAll('button[data-up]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.up);
      if (idx <= 0) return;
      const arr = currentUser.ratedMovies;
      const item = arr[idx];
      arr.splice(idx,1);
      arr.splice(idx-1,0,item);
      if (!currentUser._history) currentUser._history = [];
      currentUser._history.push({ type: 'move', from: idx, to: idx-1, movie: item });
      saveUserData();
      render();
    });
  });
  section.querySelectorAll('button[data-down]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.down);
      const arr = currentUser.ratedMovies;
      if (idx >= arr.length-1) return;
      const item = arr[idx];
      arr.splice(idx,1);
      arr.splice(idx+1,0,item);
      if (!currentUser._history) currentUser._history = [];
      currentUser._history.push({ type: 'move', from: idx, to: idx+1, movie: item });
      saveUserData();
      render();
    });
  });
}

function performUndo() {
  if (!currentUser || !currentUser._history || !currentUser._history.length) return alert('Nothing to undo');
  const last = currentUser._history.pop();
  if (last.type === 'insert') {
    // remove inserted movie at index if matches
    const cur = currentUser.ratedMovies;
    if (cur[last.index] && cur[last.index].id === last.movie.id) {
      cur.splice(last.index,1);
    }
  } else if (last.type === 'remove') {
    // re-insert removed
    currentUser.ratedMovies.splice(last.index,0,last.movie);
  } else if (last.type === 'move') {
    // move back
    const cur = currentUser.ratedMovies;
    // find current index of the movie (best effort)
    const idx = cur.findIndex(m => m.id === last.movie.id);
    if (idx !== -1) {
      cur.splice(idx,1);
      cur.splice(last.from,0,last.movie);
    }
  }
  saveUserData();
  render();
}

function startInsertion(movie, options = {}) {
  insertion.newMovie = movie;
  insertion.source = options.source || null;
  insertion.sourceIndex = typeof options.sourceIndex === 'number' ? options.sourceIndex : null;
  const userData = getUserData();
  insertion.low = 0;
  insertion.high = (userData.ratedMovies || []).length;
  insertion.comparisons = 0;
  insertion.totalEstimate = Math.max(1, Math.ceil(Math.log2(Math.max(1, insertion.high - insertion.low + 1))));
  if (insertion.high === 0) {
    // empty list — just add
    if (!currentUser) { alert('Sign in to save your list'); return; }
    if (!currentUser.ratedMovies) currentUser.ratedMovies = [];
    currentUser.ratedMovies.push(movie);
    if (insertion.source === 'unwatched' && currentUser.unwatched) {
      currentUser.unwatched = currentUser.unwatched.filter(m => m.id !== movie.id);
    }
    saveUserData();
    alert('Added to your list');
    page = 'home';
    render();
    return;
  }
  page = 'insertion';
  render();
}

function renderInsertion() {
  const userData = getUserData();
  const mid = Math.floor((insertion.low + insertion.high) / 2);
  const compareAgainst = userData.ratedMovies[mid];
  const section = document.createElement('section');
  section.innerHTML = `
    <h2>Place: ${insertion.newMovie.title}</h2>
    <p>Compare the new movie against an item on your list to place it exactly.</p>
    <p class="small-meta">Comparison ${insertion.comparisons + 1} of ~${insertion.totalEstimate} (mid index: ${mid + 1} of ${userData.ratedMovies.length})</p>
  `;
  const row = document.createElement('div');
  row.className = 'compare-row';
  [ {movie: compareAgainst, label: 'Your list'}, {movie: insertion.newMovie, label: 'New'} ].forEach((it, idx) => {
    const card = document.createElement('article');
    card.className = 'compare-card';
    card.innerHTML = `
      <img src="${getPosterUrl(it.movie)}" alt="${it.movie.title} poster" />
      <h3>${it.movie.title}</h3>
      <p>${it.label}</p>
    `;
    row.appendChild(card);
  });
  section.appendChild(row);
  const actions = document.createElement('div');
  actions.className = 'compare-actions';
  const preferNew = document.createElement('button');
  preferNew.textContent = 'I prefer the new movie';
  const preferOld = document.createElement('button');
  preferOld.textContent = 'I prefer the listed movie';
  const cancel = document.createElement('button'); cancel.className='secondary'; cancel.textContent='Cancel';
  actions.appendChild(preferNew);
  actions.appendChild(preferOld);
  actions.appendChild(cancel);
  section.appendChild(actions);
  app.appendChild(section);

  preferNew.addEventListener('click', () => {
    // new preferred => it should be placed before mid
    insertion.comparisons = (insertion.comparisons || 0) + 1;
    insertion.high = mid;
    if (insertion.low >= insertion.high) {
      finalizeInsertion(insertion.low);
    } else {
      insertion.totalEstimate = Math.max(1, Math.ceil(Math.log2(Math.max(1, insertion.high - insertion.low + 1))));
      render();
    }
  });
  preferOld.addEventListener('click', () => {
    insertion.comparisons = (insertion.comparisons || 0) + 1;
    insertion.low = mid + 1;
    if (insertion.low >= insertion.high) {
      finalizeInsertion(insertion.low);
    } else {
      insertion.totalEstimate = Math.max(1, Math.ceil(Math.log2(Math.max(1, insertion.high - insertion.low + 1))));
      render();
    }
  });
  cancel.addEventListener('click', () => { page='home'; render(); });
}

function finalizeInsertion(index) {
  if (!currentUser) { alert('Sign in to save your list'); page='landing'; render(); return; }
  if (!currentUser.ratedMovies) currentUser.ratedMovies = [];
  currentUser.ratedMovies.splice(index, 0, insertion.newMovie);
  if (!currentUser._history) currentUser._history = [];
  currentUser._history.push({ type: 'insert', index, movie: insertion.newMovie });
  saveUserData();
  insertion = { newMovie: null, low:0, high:0 };
  alert('Movie placed in your list');
  page = 'home';
  render();
}

function renderUnwatchedPage() {
  const section = document.createElement('section');
  section.innerHTML = `<h2>Your Unwatched list</h2>`;
  if (!currentUser || !currentUser.unwatched || currentUser.unwatched.length===0) {
    section.innerHTML += '<p>No unwatched movies saved (sign in to save).</p>';
    app.appendChild(section);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'grid movie-grid movie-grid-home';
  currentUser.unwatched.forEach((m, idx) => {
    const card = document.createElement('article');
    card.className = 'movie-card';
    card.innerHTML = `
      <img src="${getPosterUrl(m)}" alt="${m.title} poster" />
      <h3>${m.title}</h3>
      <p class="small-meta">${m.year || ''}${m.genres ? ' • ' + m.genres.slice(0,2).join(', ') : ''}</p>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button data-watch="${idx}">Mark watched</button>
      </div>
    `;
    grid.appendChild(card);
  });
  section.appendChild(grid);
  app.appendChild(section);
  section.querySelectorAll('button[data-watch]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.watch);
      const movie = currentUser.unwatched[idx];
      if (!currentUser.ratedMovies) currentUser.ratedMovies = [];
      const exists = currentUser.ratedMovies.some(x => x.id === movie.id);
      if (!exists) {
        currentUser.ratedMovies.push(movie);
        if (!currentUser._history) currentUser._history = [];
        currentUser._history.push({ type: 'insert', index: currentUser.ratedMovies.length - 1, movie });
      }
      currentUser.unwatched.splice(idx, 1);
      saveUserData();
      render();
    });
  });
}

init();
