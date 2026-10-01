/**
 * SERVIÇO DE ARMAZENAMENTO LOCAL (OFFLINE-FIRST)
 */
class StorageService {
  static get(key, defaultValue = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Falha de armazenamento:', e);
    }
  }
}

/**
 * MODELO DE TREINO
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

class WorkoutManager {
  constructor() {
    this.storageKey = 'app_workouts_data';
    this.entries = this.loadEntries();
  }

  loadEntries() {
    const data = StorageService.get(this.storageKey, []);
    return data.map(i => new WorkoutEntry(i.id, i.name, i.sets, i.reps, i.weight, i.duration, i.date));
  }

  addEntry(data) {
    const entry = new WorkoutEntry(null, data.name, data.sets, data.reps, data.weight, data.duration, data.date);
    this.entries.unshift(entry);
    this.save();
    return entry;
  }

  save() {
    StorageService.set(this.storageKey, this.entries);
  }

  getTodayCount() {
    const today = new Date().toISOString().split('T')[0];
    return this.entries.filter(e => e.date === today).length;
  }
}

/**
 * MODELO DE LIVRO DA ESTANTE (ESTILO SKOOB / MARATONA.APP)
 */
class Book {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.authors = data.authors;
    this.totalPages = Number(data.totalPages) > 0 ? Number(data.totalPages) : 100;
    this.currentPage = Number(data.currentPage) || 0;
    this.thumbnail = data.thumbnail || 'https://via.placeholder.com/128x192?text=Sem+Capa';
    this.status = data.status || 'want_to_read'; // 'reading', 'want_to_read', 'read', 'dnf'
    this.rating = Number(data.rating) || 0; // 1 a 5 estrelas
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  get progressPercentage() {
    const pct = (this.currentPage / this.totalPages) * 100;
    return Math.min(100, Math.round(pct));
  }

  get pagesRemaining() {
    return Math.max(0, this.totalPages - this.currentPage);
  }

  updateProgress(page, newStatus = null) {
    this.currentPage = Math.min(this.totalPages, Math.max(0, Number(page)));
    
    if (newStatus) {
      this.status = newStatus;
    } else if (this.currentPage >= this.totalPages) {
      this.status = 'read';
    }

    this.updatedAt = new Date().toISOString();
  }
}

/**
 * MOTOR DE PESQUISA COM DUPLA FONTE (GOOGLE BOOKS + OPEN LIBRARY OTIMIZADA)
 */
class BookSearchEngine {
  static async search(query, filterType = 'all', page = 0) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    let formattedQuery = cleanQuery;
    if (filterType === 'title') formattedQuery = `intitle:${cleanQuery}`;
    if (filterType === 'author') formattedQuery = `inauthor:${cleanQuery}`;

    // 1ª Tentativa: Google Books API com timeout de segurança
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(formattedQuery)}&startIndex=${page * 15}&maxResults=15&printType=books`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          return data.items.map(item => {
            const info = item.volumeInfo || {};
            let cover = info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : '';
            if (cover && cover.startsWith('http://')) cover = cover.replace('http://', 'https://');

            return {
              id: item.id,
              title: info.title || 'Título Desconhecido',
              authors: info.authors ? info.authors.join(', ') : 'Autor Desconhecido',
              totalPages: info.pageCount || 200,
              thumbnail: cover || 'https://via.placeholder.com/128x192?text=Sem+Capa',
              year: info.publishedDate ? info.publishedDate.substring(0, 4) : 'N/D'
            };
          });
        }
      }
    } catch (errGoogle) {
      console.warn('Google Books indisponível ou bloqueado, acionando Open Library:', errGoogle);
    }

    // 2ª Tentativa: Open Library com payload leve restrito por campos
    try {
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanQuery)}&page=${page + 1}&limit=15&fields=key,title,author_name,number_of_pages_median,cover_i,first_publish_year`;
      const olRes = await fetch(olUrl);
      
      if (olRes.ok) {
        const olData = await olRes.json();
        if (olData.docs && olData.docs.length > 0) {
          return olData.docs.map(doc => ({
            id: doc.key.replace('/works/', ''),
            title: doc.title || 'Título Desconhecido',
            authors: doc.author_name ? doc.author_name.slice(0, 2).join(', ') : 'Autor Desconhecido',
            totalPages: doc.number_of_pages_median || 220,
            thumbnail: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : 'https://via.placeholder.com/128x192?text=Sem+Capa',
            year: doc.first_publish_year || 'N/D'
          }));
        }
      }
    } catch (errOL) {
      console.error('Falha em ambos os provedores:', errOL);
    }

    return [];
  }
}

/**
 * GERENCIADOR DA BIBLIOTECA PESSOAL
 */
class LibraryManager {
  constructor() {
    this.storageKey = 'app_user_library_v2';
    this.books = this.loadBooks();
  }

  loadBooks() {
    const raw = StorageService.get(this.storageKey, []);
    return raw.map(b => new Book(b));
  }

  addBook(data, initialStatus = 'want_to_read') {
    const existing = this.books.find(b => b.id === data.id || b.title.toLowerCase() === data.title.toLowerCase());
    if (existing) return { success: false, book: existing };

    const newBook = new Book({
      ...data,
      status: initialStatus,
      currentPage: initialStatus === 'read' ? data.totalPages : 0
    });

    this.books.unshift(newBook);
    this.save();
    return { success: true, book: newBook };
  }

  updateBook(id, page, status, rating) {
    const book = this.books.find(b => b.id === id);
    if (book) {
      book.updateProgress(page, status);
      if (rating !== undefined) book.rating = rating;
      this.save();
    }
  }

  removeBook(id) {
    this.books = this.books.filter(b => b.id !== id);
    this.save();
  }

  save() {
    StorageService.set(this.storageKey, this.books);
  }

  getFiltered(shelfStatus = 'all') {
    if (shelfStatus === 'all') return this.books;
    return this.books.filter(b => b.status === shelfStatus);
  }

  getCounts() {
    return {
      all: this.books.length,
      reading: this.books.filter(b => b.status === 'reading').length,
      want_to_read: this.books.filter(b => b.status === 'want_to_read').length,
      read: this.books.filter(b => b.status === 'read').length,
      dnf: this.books.filter(b => b.status === 'dnf').length
    };
  }

  getTotalPagesRead() {
    return this.books.reduce((acc, b) => acc + Number(b.currentPage), 0);
  }
}

/**
 * CONTROLADOR PRINCIPAL DA APLICAÇÃO (UI)
 */
class AppUI {
  constructor() {
    this.workoutManager = new WorkoutManager();
    this.libraryManager = new LibraryManager();
    
    this.currentSearchPage = 0;
    this.currentFilterType = 'all';
    this.activeShelfFilter = 'all';
    this.selectedBookForModal = null;
    this.activeModalRating = 0;

    this.initDOMElements();
    this.bindEvents();
    this.initApp();
  }

  initDOMElements() {
    // Header & Views
    this.currentDateEl = document.getElementById('current-date');
    this.viewTitleEl = document.getElementById('view-title');
    this.navButtons = document.querySelectorAll('.nav-item');
    this.views = document.querySelectorAll('.view');

    // Treinos
    this.workoutForm = document.getElementById('workout-form');
    this.workoutList = document.getElementById('workout-list');
    this.exerciseDateInput = document.getElementById('exercise-date');

    // Livros & Busca
    this.bookSearchInput = document.getElementById('book-search-input');
    this.btnSearchBook = document.getElementById('btn-search-book');
    this.searchTypeBtns = document.querySelectorAll('.pill-btn');
    this.searchStatus = document.getElementById('search-status');
    this.searchResultsContainer = document.getElementById('search-results-container');
    this.btnLoadMore = document.getElementById('btn-load-more');

    // Estante & Tabs
    this.shelfTabs = document.querySelectorAll('.shelf-tab');
    this.myShelfList = document.getElementById('my-shelf-list');
    this.shelfTotalBadge = document.getElementById('shelf-total-badge');

    // Modal
    this.modal = document.getElementById('progress-modal');
    this.modalBookTitle = document.getElementById('modal-book-title');
    this.modalBookAuthor = document.getElementById('modal-book-author');
    this.modalPageInput = document.getElementById('modal-page-input');
    this.modalPagesTotal = document.getElementById('modal-pages-total');
    this.modalStatusSelect = document.getElementById('modal-status-select');
    this.modalRatingContainer = document.getElementById('modal-rating-container');
    this.modalStars = document.querySelectorAll('#modal-stars span');
    this.modalBtnCancel = document.getElementById('modal-btn-cancel');
    this.modalBtnSave = document.getElementById('modal-btn-save');
    this.btnStepMinus = document.getElementById('btn-step-minus');
    this.btnStepPlus = document.getElementById('btn-step-plus');

    // Stats Gerais
    this.statWorkouts = document.getElementById('stat-workouts-count');
    this.statBooksReading = document.getElementById('stat-books-reading');
    this.statPagesRead = document.getElementById('stat-pages-read');
    this.statBooksCompleted = document.getElementById('stat-books-completed');
  }

  bindEvents() {
    // Alternar abas principais
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.target, btn));
    });

    // Form de Treino
    this.workoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleWorkoutSubmit();
    });

    // Busca de Livros
    this.btnSearchBook.addEventListener('click', () => this.handleNewSearch());
    this.bookSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleNewSearch();
    });

    // Filtros de Tipo de Busca (Título, Autor, Tudo)
    this.searchTypeBtns.forEach(pill => {
      pill.addEventListener('click', () => {
        this.searchTypeBtns.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilterType = pill.dataset.type;
        if (this.bookSearchInput.value.trim()) this.handleNewSearch();
      });
    });

    // Carregar Mais Livros
    this.btnLoadMore.addEventListener('click', () => this.handleLoadMore());

    // Abas de Estante
    this.shelfTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.shelfTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeShelfFilter = tab.dataset.shelf;
        this.renderUserShelf();
      });
    });

    // Modal de Leitura
    this.modalBtnCancel.addEventListener('click', () => this.closeModal());
    this.modalBtnSave.addEventListener('click', () => this.saveModalProgress());
    this.btnStepMinus.addEventListener('click', () => {
      this.modalPageInput.value = Math.max(0, Number(this.modalPageInput.value) - 10);
    });
    this.btnStepPlus.addEventListener('click', () => {
      this.modalPageInput.value = Number(this.modalPageInput.value) + 10;
    });

    this.modalStatusSelect.addEventListener('change', (e) => {
      this.modalRatingContainer.style.display = e.target.value === 'read' ? 'block' : 'none';
    });

    this.modalStars.forEach(star => {
      star.addEventListener('click', () => {
        const rating = Number(star.dataset.star);
        this.setModalRating(rating);
      });
    });
  }

  initApp() {
    const today = new Date().toISOString().split('T')[0];
    this.exerciseDateInput.value = today;
    this.currentDateEl.innerText = new Date().toLocaleDateString('pt-BR', {
      weekday: 'short', day: 'numeric', month: 'short'
    });

    this.renderWorkouts();
    this.updateShelfCounts();
    this.renderUserShelf();
    this.updateGlobalDashboard();
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

    if (viewId === 'view-overview') this.updateGlobalDashboard();
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
    this.updateGlobalDashboard();
  }

  renderWorkouts() {
    this.workoutList.innerHTML = '';
    const entries = this.workoutManager.entries;

    if (entries.length === 0) {
      this.workoutList.innerHTML = `<p class="item-meta">Nenhum treino registrado.</p>`;
      return;
    }

    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '12px';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>${entry.name}</span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">${entry.date}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
          ${entry.sets} séries × ${entry.reps} reps | ${entry.weight} kg (${entry.duration} min)
        </div>
        <div style="font-size: 0.8rem; color: var(--accent-color); font-weight: 600; margin-top: 4px;">
          Volume: ${entry.totalVolume} kg
        </div>
      `;
      this.workoutList.appendChild(card);
    });
  }

  async handleNewSearch() {
    const query = this.bookSearchInput.value.trim();
    if (!query) return;

    this.currentSearchPage = 0;
    this.searchResultsContainer.innerHTML = '';
    this.searchStatus.innerText = 'Pesquisando acervo global...';
    this.btnLoadMore.style.display = 'none';

    await this.executeSearch(query, false);
  }

  async handleLoadMore() {
    const query = this.bookSearchInput.value.trim();
    this.currentSearchPage += 1;
    this.btnLoadMore.innerText = 'Carregando...';
    await this.executeSearch(query, true);
    this.btnLoadMore.innerText = 'Carregar Mais Resultados';
  }

  async executeSearch(query, isAppend) {
    try {
      const results = await BookSearchEngine.search(query, this.currentFilterType, this.currentSearchPage);
      this.searchStatus.innerText = '';

      if (results.length === 0 && !isAppend) {
        this.searchStatus.innerText = `Nenhum livro encontrado para "${query}". Tente outro termo ou autor.`;
        return;
      }

      this.renderSearchResults(results, isAppend);
      this.btnLoadMore.style.display = results.length >= 15 ? 'block' : 'none';
    } catch {
      this.searchStatus.innerText = 'Não foi possível carregar livros no momento. Verifique sua rede.';
    }
  }

  renderSearchResults(books, isAppend) {
    if (!isAppend) this.searchResultsContainer.innerHTML = '';

    books.forEach(book => {
      const item = document.createElement('div');
      item.className = 'book-search-card';
      item.innerHTML = `
        <img class="book-cover" src="${book.thumbnail}" alt="Capa" loading="lazy">
        <div class="book-details">
          <span class="book-title" title="${book.title}">${book.title}</span>
          <span class="book-author">${book.authors} (${book.year})</span>
          <span class="book-meta-tag">${book.totalPages} páginas</span>
        </div>
        <select class="quick-add-select">
          <option value="">+ Estante</option>
          <option value="reading">Lendo</option>
          <option value="want_to_read">Quero Ler</option>
          <option value="read">Já Li</option>
        </select>
      `;

      const select = item.querySelector('.quick-add-select');
      select.addEventListener('change', (e) => {
        const shelf = e.target.value;
        if (!shelf) return;

        const res = this.libraryManager.addBook(book, shelf);
        if (res.success) {
          select.value = '';
          this.updateShelfCounts();
          this.renderUserShelf();
          this.updateGlobalDashboard();
          alert(`"${book.title}" adicionado à estante!`);
        } else {
          alert('Este livro já está na sua estante!');
          select.value = '';
        }
      });

      this.searchResultsContainer.appendChild(item);
    });
  }

  renderUserShelf() {
    this.myShelfList.innerHTML = '';
    const books = this.libraryManager.getFiltered(this.activeShelfFilter);

    if (books.length === 0) {
      this.myShelfList.innerHTML = `<p class="item-meta" style="text-align: center; padding: 20px;">Nenhum livro nesta estante.</p>`;
      return;
    }

    const statusLabels = {
      reading: 'Lendo',
      want_to_read: 'Quero Ler',
      read: 'Lido',
      dnf: 'Pausa'
    };

    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'user-book-card';
      card.innerHTML = `
        <div class="user-book-main">
          <img class="book-cover" src="${book.thumbnail}" alt="Capa" style="width: 58px; height: 84px;">
          <div class="user-book-info">
            <span class="user-book-status-tag status-${book.status}">${statusLabels[book.status]}</span>
            <span class="book-title" style="font-size: 0.95rem;">${book.title}</span>
            <span class="book-author">${book.authors}</span>
            ${book.rating > 0 ? `<div class="stars-rating">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</div>` : ''}
          </div>
        </div>

        <div class="progress-container">
          <div class="progress-bar" style="width: ${book.progressPercentage}%"></div>
        </div>

        <div class="user-book-footer">
          <span>${book.currentPage} de ${book.totalPages} págs (${book.progressPercentage}%)</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn secondary-btn edit-progress-btn" style="padding: 5px 10px; font-size: 0.75rem;">
              Atualizar
            </button>
            <button class="btn secondary-btn remove-book-btn" style="padding: 5px 8px; font-size: 0.75rem; color: #ef4444;">
              ✕
            </button>
          </div>
        </div>
      `;

      card.querySelector('.edit-progress-btn').addEventListener('click', () => this.openProgressModal(book));
      card.querySelector('.remove-book-btn').addEventListener('click', () => {
        if (confirm(`Remover "${book.title}" da sua estante?`)) {
          this.libraryManager.removeBook(book.id);
          this.updateShelfCounts();
          this.renderUserShelf();
          this.updateGlobalDashboard();
        }
      });

      this.myShelfList.appendChild(card);
    });
  }

  updateShelfCounts() {
    const counts = this.libraryManager.getCounts();
    document.getElementById('count-all').innerText = counts.all;
    document.getElementById('count-reading').innerText = counts.reading;
    document.getElementById('count-want').innerText = counts.want_to_read;
    document.getElementById('count-read').innerText = counts.read;
    document.getElementById('count-dnf').innerText = counts.dnf;
    this.shelfTotalBadge.innerText = `${counts.all} livros`;
  }

  openProgressModal(book) {
    this.selectedBookForModal = book;
    this.modalBookTitle.innerText = book.title;
    this.modalBookAuthor.innerText = `${book.authors} • Total: ${book.totalPages} págs`;
    this.modalPageInput.value = book.currentPage;
    this.modalPageInput.max = book.totalPages;
    this.modalPagesTotal.innerText = `Meta: ${book.totalPages} páginas`;
    this.modalStatusSelect.value = book.status;

    this.modalRatingContainer.style.display = book.status === 'read' ? 'block' : 'none';
    this.setModalRating(book.rating || 0);

    this.modal.classList.add('open');
  }

  setModalRating(rating) {
    this.activeModalRating = rating;
    this.modalStars.forEach(s => {
      const starVal = Number(s.dataset.star);
      s.classList.toggle('active', starVal <= rating);
    });
  }

  closeModal() {
    this.modal.classList.remove('open');
    this.selectedBookForModal = null;
  }

  saveModalProgress() {
    if (!this.selectedBookForModal) return;

    const page = Number(this.modalPageInput.value);
    const status = this.modalStatusSelect.value;
    const rating = status === 'read' ? this.activeModalRating : 0;

    this.libraryManager.updateBook(this.selectedBookForModal.id, page, status, rating);
    this.closeModal();
    this.updateShelfCounts();
    this.renderUserShelf();
    this.updateGlobalDashboard();
  }

  updateGlobalDashboard() {
    this.statWorkouts.innerText = this.workoutManager.getTodayCount();
    const counts = this.libraryManager.getCounts();
    this.statBooksReading.innerText = counts.reading;
    this.statBooksCompleted.innerText = counts.read;
    this.statPagesRead.innerText = this.libraryManager.getTotalPagesRead();
  }
}

// Inicialização segura
document.addEventListener('DOMContentLoaded', () => {
  new AppUI();
});