/**
 * Gerenciador de Armazenamento Local
 */
class StorageService {
  static get(key, defaultValue = []) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  }

  static set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/**
 * Modelo de Registro de Treino
 */
class WorkoutEntry {
  constructor(id, name, sets, reps, weight, duration, date) {
    this.id = id || Date.now().toString();
    this.name = name;
    this.sets = Number(sets);
    this.reps = Number(reps);
    this.weight = Number(weight);
    this.duration = Number(duration);
    this.date = date;
  }

  get totalVolume() {
    return this.sets * this.reps * this.weight;
  }
}

/**
 * Gerenciador de Exercícios
 */
class WorkoutManager {
  constructor() {
    this.storageKey = 'app_workouts_data';
    this.entries = this.loadEntries();
  }

  loadEntries() {
    const rawData = StorageService.get(this.storageKey, []);
    return rawData.map(item => new WorkoutEntry(
      item.id, item.name, item.sets, item.reps, item.weight, item.duration, item.date
    ));
  }

  addEntry(entryData) {
    const newEntry = new WorkoutEntry(
      null,
      entryData.name,
      entryData.sets,
      entryData.reps,
      entryData.weight,
      entryData.duration,
      entryData.date
    );
    this.entries.unshift(newEntry);
    this.save();
    return newEntry;
  }

  removeEntry(id) {
    this.entries = this.entries.filter(entry => entry.id !== id);
    this.save();
  }

  save() {
    StorageService.set(this.storageKey, this.entries);
  }

  getEntriesForDate(dateStr) {
    return this.entries.filter(entry => entry.date === dateStr);
  }
}

/**
 * Modelo de Livro
 */
class Book {
  constructor(id, title, authors, totalPages, currentPage = 0, status = 'reading') {
    this.id = id;
    this.title = title;
    this.authors = authors;
    this.totalPages = Number(totalPages) || 1;
    this.currentPage = Number(currentPage) || 0;
    this.status = status; // 'reading', 'completed'
  }

  get progressPercentage() {
    const pct = (this.currentPage / this.totalPages) * 100;
    return Math.min(100, Math.round(pct));
  }

  updateProgress(pagesRead) {
    this.currentPage = Math.min(this.totalPages, Number(pagesRead));
    if (this.currentPage === this.totalPages) {
      this.status = 'completed';
    }
  }
}

/**
 * Gerenciador de Leitura & Integração com API
 */
class ReadingManager {
  constructor() {
    this.storageKey = 'app_reading_library';
    this.library = this.loadLibrary();
  }

  loadLibrary() {
    const rawData = StorageService.get(this.storageKey, []);
    return rawData.map(item => new Book(
      item.id, item.title, item.authors, item.totalPages, item.currentPage, item.status
    ));
  }

  async searchGoogleBooks(query) {
    if (!query.trim()) return [];
    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
      const data = await response.json();
      if (!data.items) return [];

      return data.items.map(item => ({
        id: item.id,
        title: item.volumeInfo.title || 'Título desconhecido',
        authors: item.volumeInfo.authors ? item.volumeInfo.authors.join(', ') : 'Autor desconhecido',
        totalPages: item.volumeInfo.pageCount || 200
      }));
    } catch (error) {
      console.error('Erro ao conectar com Google Books API:', error);
      return [];
    }
  }

  addBook(bookData) {
    const exists = this.library.some(b => b.id === bookData.id);
    if (exists) return false;

    const newBook = new Book(
      bookData.id,
      bookData.title,
      bookData.authors,
      bookData.totalPages,
      0,
      'reading'
    );
    this.library.unshift(newBook);
    this.save();
    return newBook;
  }

  updateBookProgress(bookId, pages) {
    const book = this.library.find(b => b.id === bookId);
    if (book) {
      book.updateProgress(pages);
      this.save();
    }
  }

  removeBook(bookId) {
    this.library = this.library.filter(b => b.id !== bookId);
    this.save();
  }

  save() {
    StorageService.set(this.storageKey, this.library);
  }
}

/**
 * Controlador de Interface (UI)
 */
class AppUI {
  constructor() {
    this.workoutManager = new WorkoutManager();
    this.readingManager = new ReadingManager();
    this.initDOMElements();
    this.bindEvents();
    this.renderInitialData();
  }

  initDOMElements() {
    this.currentDateEl = document.getElementById('current-date');
    this.viewTitleEl = document.getElementById('view-title');
    this.navButtons = document.querySelectorAll('.nav-item');
    this.views = document.querySelectorAll('.view');

    // Workout Elements
    this.workoutForm = document.getElementById('workout-form');
    this.workoutListEl = document.getElementById('workout-list');
    this.exerciseDateInput = document.getElementById('exercise-date');

    // Reading Elements
    this.bookSearchInput = document.getElementById('book-search-input');
    this.btnSearchBook = document.getElementById('btn-search-book');
    this.searchResultsEl = document.getElementById('api-search-results');
    this.libraryListEl = document.getElementById('library-list');

    // Overview Stats
    this.statWorkoutsCount = document.getElementById('stat-workouts-count');
    this.statPagesRead = document.getElementById('stat-pages-read');
  }

  bindEvents() {
    // Navegação por abas
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.target;
        this.switchView(targetView, btn);
      });
    });

    // Adição do formulário de treino
    this.workoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleWorkoutSubmit();
    });

    // Buscador de livros interativa
    this.btnSearchBook.addEventListener('click', () => this.handleBookSearch());
    this.bookSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleBookSearch();
    });
  }

  renderInitialData() {
    const today = new Date().toISOString().split('T')[0];
    this.exerciseDateInput.value = today;
    this.currentDateEl.innerText = new Date().toLocaleDateString('pt-BR', {
      weekday: 'short', day: 'numeric', month: 'short'
    });

    this.renderWorkouts();
    this.renderLibrary();
    this.updateOverviewStats();
  }

  switchView(viewId, activeBtn) {
    this.views.forEach(v => v.classList.remove('active'));
    this.navButtons.forEach(b => b.classList.remove('active'));

    document.getElementById(viewId).classList.add('active');
    activeBtn.classList.add('active');

    const titles = {
      'view-workouts': 'Treinos Diários',
      'view-reading': 'Biblioteca & Leitura',
      'view-overview': 'Painel Geral'
    };
    this.viewTitleEl.innerText = titles[viewId] || 'Organizador';

    if (viewId === 'view-overview') {
      this.updateOverviewStats();
    }
  }

  handleWorkoutSubmit() {
    const payload = {
      name: document.getElementById('exercise-name').value,
      sets: document.getElementById('exercise-sets').value,
      reps: document.getElementById('exercise-reps').value,
      weight: document.getElementById('exercise-weight').value,
      duration: document.getElementById('exercise-duration').value,
      date: document.getElementById('exercise-date').value
    };

    this.workoutManager.addEntry(payload);
    this.workoutForm.reset();
    this.exerciseDateInput.value = payload.date;
    this.renderWorkouts();
  }

  renderWorkouts() {
    this.workoutListEl.innerHTML = '';
    const entries = this.workoutManager.entries;

    if (entries.length === 0) {
      this.workoutListEl.innerHTML = `<p class="item-meta">Nenhum treino registrado.</p>`;
      return;
    }

    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-header">
          <span class="item-title">${entry.name}</span>
          <span class="item-meta">${entry.date}</span>
        </div>
        <div class="item-meta">
          ${entry.sets} séries × ${entry.reps} reps | ${entry.weight} kg (${entry.duration} min)
        </div>
        <div class="item-meta" style="color: var(--accent-color);">
          Volume Total: ${entry.totalVolume} kg
        </div>
      `;
      this.workoutListEl.appendChild(card);
    });
  }

  async handleBookSearch() {
    const query = this.bookSearchInput.value;
    if (!query) return;

    this.searchResultsEl.innerHTML = `<p class="item-meta">Buscando na API...</p>`;
    const results = await this.readingManager.searchGoogleBooks(query);
    this.searchResultsEl.innerHTML = '';

    if (results.length === 0) {
      this.searchResultsEl.innerHTML = `<p class="item-meta">Nenhum livro encontrado.</p>`;
      return;
    }

    results.forEach(book => {
      const row = document.createElement('div');
      row.className = 'search-result-item';
      row.innerHTML = `
        <div>
          <div style="font-size: 0.85rem; font-weight: 600;">${book.title}</div>
          <div class="item-meta">${book.authors} (${book.totalPages} págs)</div>
        </div>
        <button class="btn primary-btn" style="width: auto; padding: 6px 12px; font-size: 0.75rem;">+ Adicionar</button>
      `;

      row.querySelector('button').addEventListener('click', () => {
        const added = this.readingManager.addBook(book);
        if (added) {
          this.searchResultsEl.innerHTML = '';
          this.bookSearchInput.value = '';
          this.renderLibrary();
        } else {
          alert('Livro já existe na biblioteca!');
        }
      });

      this.searchResultsEl.appendChild(row);
    });
  }

  renderLibrary() {
    this.libraryListEl.innerHTML = '';
    const books = this.readingManager.library;

    if (books.length === 0) {
      this.libraryListEl.innerHTML = `<p class="item-meta">Sua estante está vazia.</p>`;
      return;
    }

    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="item-card-header">
          <span class="item-title">${book.title}</span>
          <span class="item-meta">${book.status === 'completed' ? '✅ Lido' : '📖 Lendo'}</span>
        </div>
        <div class="item-meta">${book.authors}</div>
        <div class="progress-container">
          <div class="progress-bar" style="width: ${book.progressPercentage}%"></div>
        </div>
        <div class="item-card-header" style="margin-top: 4px;">
          <span class="item-meta">${book.currentPage} / ${book.totalPages} págs (${book.progressPercentage}%)</span>
          <button class="btn secondary-btn update-btn" style="width: auto; padding: 4px 8px; font-size: 0.75rem;">Atualizar Páginas</button>
        </div>
      `;

      card.querySelector('.update-btn').addEventListener('click', () => {
        const pages = prompt(`Atualizar páginas lidas de "${book.title}":`, book.currentPage);
        if (pages !== null && !isNaN(pages)) {
          this.readingManager.updateBookProgress(book.id, pages);
          this.renderLibrary();
        }
      });

      this.libraryListEl.appendChild(card);
    });
  }

  updateOverviewStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayWorkouts = this.workoutManager.getEntriesForDate(today);
    this.statWorkoutsCount.innerText = todayWorkouts.length;

    const totalPages = this.readingManager.library.reduce((acc, b) => acc + Number(b.currentPage), 0);
    this.statPagesRead.innerText = totalPages;
  }
}

// Inicia a aplicação
document.addEventListener('DOMContentLoaded', () => {
  new AppUI();
});