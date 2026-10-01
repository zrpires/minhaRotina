/**
 * Serviço de Persistência Local (Offline-First)
 */
class StorageService {
  static get(key, defaultValue = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error('Falha ao ler localStorage:', e);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Falha ao salvar no localStorage:', e);
    }
  }
}

/**
 * Entidade de Exercício/Treino
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
 * Gerenciador de Treinos
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

  addEntry(data) {
    const entry = new WorkoutEntry(
      null, data.name, data.sets, data.reps, data.weight, data.duration, data.date
    );
    this.entries.unshift(entry);
    this.save();
    return entry;
  }

  save() {
    StorageService.set(this.storageKey, this.entries);
  }

  getEntriesForDate(dateStr) {
    return this.entries.filter(e => e.date === dateStr);
  }
}

/**
 * Entidade Livro
 */
class Book {
  constructor(id, title, authors, totalPages, thumbnail, currentPage = 0, status = 'reading') {
    this.id = id;
    this.title = title;
    this.authors = authors;
    this.totalPages = Number(totalPages) > 0 ? Number(totalPages) : 1;
    this.thumbnail = thumbnail || 'https://via.placeholder.com/128x192?text=Sem+Capa';
    this.currentPage = Number(currentPage) || 0;
    this.status = status;
  }

  get progressPercentage() {
    const pct = (this.currentPage / this.totalPages) * 100;
    return Math.min(100, Math.round(pct));
  }

  updateProgress(pages) {
    this.currentPage = Math.min(this.totalPages, Math.max(0, Number(pages)));
    if (this.currentPage >= this.totalPages) {
      this.status = 'completed';
    } else {
      this.status = 'reading';
    }
  }
}

/**
 * Serviço de Conexão com Google Books API
 */
class BookApiService {
  static async search(query = 'programação ficção', startIndex = 0, maxResults = 20) {
    const cleanQuery = encodeURIComponent(query.trim() || 'best sellers');
    const url = `https://www.googleapis.com/books/v1/volumes?q=${cleanQuery}&startIndex=${startIndex}&maxResults=${maxResults}&printType=books`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro na API (${response.status})`);
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return [];
    }

    return data.items.map(item => {
      const info = item.volumeInfo || {};
      
      // Forçar HTTPS nas imagens da capa para evitar Mixed Content
      let cover = info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : '';
      if (cover && cover.startsWith('http://')) {
        cover = cover.replace('http://', 'https://');
      }

      return {
        id: item.id,
        title: info.title || 'Título Indisponível',
        authors: info.authors ? info.authors.join(', ') : 'Autor Desconhecido',
        totalPages: info.pageCount || 250, // Estimativa padrão se a API não possuir contagem
        thumbnail: cover
      };
    });
  }
}

/**
 * Gerenciador da Biblioteca e Leitura
 */
class ReadingManager {
  constructor() {
    this.storageKey = 'app_reading_library';
    this.library = this.loadLibrary();
    this.currentQuery = 'desenvolvimento pessoal';
    this.currentStartIndex = 0;
  }

  loadLibrary() {
    const rawData = StorageService.get(this.storageKey, []);
    return rawData.map(item => new Book(
      item.id, item.title, item.authors, item.totalPages, item.thumbnail, item.currentPage, item.status
    ));
  }

  addBook(bookData) {
    const alreadyExists = this.library.some(b => b.id === bookData.id);
    if (alreadyExists) return false;

    const book = new Book(
      bookData.id,
      bookData.title,
      bookData.authors,
      bookData.totalPages,
      bookData.thumbnail,
      0,
      'reading'
    );

    this.library.unshift(book);
    this.save();
    return book;
  }

  updateBookProgress(bookId, pages) {
    const book = this.library.find(b => b.id === bookId);
    if (book) {
      book.updateProgress(pages);
      this.save();
    }
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
    this.booksLoadedSoFar = [];
    
    this.initElements();
    this.bindEvents();
    this.initApp();
  }

  initElements() {
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
    this.apiStatusMessage = document.getElementById('api-status-message');
    this.apiSearchResults = document.getElementById('api-search-results');
    this.btnLoadMoreBooks = document.getElementById('btn-load-more-books');
    this.libraryListEl = document.getElementById('library-list');

    // Overview Elements
    this.statWorkoutsCount = document.getElementById('stat-workouts-count');
    this.statPagesRead = document.getElementById('stat-pages-read');
  }

  bindEvents() {
    // Alternar abas
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.target, btn);
      });
    });

    // Submissão de treino
    this.workoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleWorkoutSubmit();
    });

    // Busca de livros
    this.btnSearchBook.addEventListener('click', () => this.handleNewBookSearch());
    this.bookSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleNewBookSearch();
    });

    // Botão "Carregar Mais Livros"
    this.btnLoadMoreBooks.addEventListener('click', () => this.handleLoadMoreBooks());
  }

  initApp() {
    const today = new Date().toISOString().split('T')[0];
    this.exerciseDateInput.value = today;
    this.currentDateEl.innerText = new Date().toLocaleDateString('pt-BR', {
      weekday: 'short', day: 'numeric', month: 'short'
    });

    this.renderWorkouts();
    this.renderLibrary();
    this.updateOverviewStats();

    // Carregamento automático de livros disponíveis ao iniciar
    this.fetchAndRenderBooks(false);
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
      this.workoutListEl.innerHTML = `<p class="item-meta">Nenhum treino registrado ainda.</p>`;
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
        <div class="item-meta" style="color: var(--accent-color); font-weight: 500;">
          Volume: ${entry.totalVolume} kg levantados
        </div>
      `;
      this.workoutListEl.appendChild(card);
    });
  }

  async handleNewBookSearch() {
    const query = this.bookSearchInput.value.trim();
    this.readingManager.currentQuery = query || 'ficção popular';
    this.readingManager.currentStartIndex = 0;
    this.booksLoadedSoFar = [];
    this.apiSearchResults.innerHTML = '';
    await this.fetchAndRenderBooks(false);
  }

  async handleLoadMoreBooks() {
    this.readingManager.currentStartIndex += 20;
    await this.fetchAndRenderBooks(true);
  }

  async fetchAndRenderBooks(isAppend = false) {
    this.apiStatusMessage.innerText = 'Carregando livros disponíveis...';
    this.btnLoadMoreBooks.style.display = 'none';

    try {
      const results = await BookApiService.search(
        this.readingManager.currentQuery,
        this.readingManager.currentStartIndex,
        20
      );

      this.apiStatusMessage.innerText = '';

      if (results.length === 0 && !isAppend) {
        this.apiStatusMessage.innerText = 'Nenhum livro encontrado para esta busca.';
        return;
      }

      this.booksLoadedSoFar = isAppend ? [...this.booksLoadedSoFar, ...results] : results;
      this.renderApiBooks(results, isAppend);

      if (results.length >= 20) {
        this.btnLoadMoreBooks.style.display = 'block';
      }
    } catch (err) {
      console.error(err);
      this.apiStatusMessage.innerText = 'Falha ao buscar livros. Verifique sua conexão e tente novamente.';
    }
  }

  renderApiBooks(books, isAppend) {
    if (!isAppend) {
      this.apiSearchResults.innerHTML = '';
    }

    books.forEach(book => {
      const item = document.createElement('div');
      item.className = 'book-search-card';
      item.innerHTML = `
        <img class="book-thumb" src="${book.thumbnail}" alt="Capa" loading="lazy">
        <div class="book-info">
          <span class="book-info-title">${book.title}</span>
          <span class="book-info-meta">${book.authors}</span>
          <span class="book-info-meta">${book.totalPages} páginas</span>
        </div>
        <button class="btn primary-btn add-book-btn" style="width: auto; padding: 6px 10px; font-size: 0.75rem;">+ Adicionar</button>
      `;

      item.querySelector('.add-book-btn').addEventListener('click', () => {
        const added = this.readingManager.addBook(book);
        if (added) {
          this.renderLibrary();
          alert(`"${book.title}" adicionado à sua biblioteca!`);
        } else {
          alert('Este livro já está na sua biblioteca.');
        }
      });

      this.apiSearchResults.appendChild(item);
    });
  }

  renderLibrary() {
    this.libraryListEl.innerHTML = '';
    const books = this.readingManager.library;

    if (books.length === 0) {
      this.libraryListEl.innerHTML = `<p class="item-meta">Sua biblioteca está vazia. Adicione livros acima!</p>`;
      return;
    }

    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div style="display: flex; gap: 12px; align-items: center;">
          <img class="book-thumb" src="${book.thumbnail}" alt="Capa" style="width: 40px; height: 56px;">
          <div style="flex: 1;">
            <div class="item-card-header">
              <span class="item-title">${book.title}</span>
              <span class="item-meta">${book.status === 'completed' ? '✅ Lido' : '📖 Lendo'}</span>
            </div>
            <div class="item-meta">${book.authors}</div>
          </div>
        </div>

        <div class="progress-container">
          <div class="progress-bar" style="width: ${book.progressPercentage}%"></div>
        </div>

        <div class="item-card-header" style="margin-top: 6px;">
          <span class="item-meta">${book.currentPage} de ${book.totalPages} páginas (${book.progressPercentage}%)</span>
          <button class="btn secondary-btn update-progress-btn" style="width: auto; padding: 4px 8px; font-size: 0.75rem;">
            Atualizar Páginas
          </button>
        </div>
      `;

      card.querySelector('.update-progress-btn').addEventListener('click', () => {
        const input = prompt(`Quantas páginas você já leu de "${book.title}"?`, book.currentPage);
        if (input !== null && !isNaN(input)) {
          this.readingManager.updateBookProgress(book.id, input);
          this.renderLibrary();
          this.updateOverviewStats();
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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  new AppUI();
});