const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

/**
 * Provedor Google Books (Server-side nativo)
 */
class GoogleBooksProvider {
  static async search(query, filterType = 'all', page = 0, limit = 15) {
    try {
      let formattedQuery = query.trim();
      if (filterType === 'title') formattedQuery = `intitle:${formattedQuery}`;
      if (filterType === 'author') formattedQuery = `inauthor:${formattedQuery}`;

      const startIndex = page * limit;
      const apiUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(formattedQuery)}&startIndex=${startIndex}&maxResults=${limit}&printType=books`;

      const response = await fetch(apiUrl, { headers: { 'User-Agent': 'OrganizadorApp/1.0' } });
      if (!response.ok) return [];

      const data = await response.json();
      if (!data.items) return [];

      return data.items.map(item => {
        const info = item.volumeInfo || {};
        let cover = info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : '';
        if (cover && cover.startsWith('http://')) cover = cover.replace('http://', 'https://');

        return {
          id: `gb_${item.id}`,
          title: info.title || 'Título Desconhecido',
          authors: info.authors ? info.authors.join(', ') : 'Autor Desconhecido',
          totalPages: info.pageCount || 200,
          thumbnail: cover || 'https://via.placeholder.com/128x192?text=Sem+Capa',
          year: info.publishedDate ? info.publishedDate.substring(0, 4) : 'N/D',
          source: 'Google Books'
        };
      });
    } catch {
      return [];
    }
  }
}

/**
 * Provedor Open Library (Server-side nativo)
 */
class OpenLibraryProvider {
  static async search(query, page = 0, limit = 15) {
    try {
      const pageIndex = page + 1;
      const apiUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&page=${pageIndex}&limit=${limit}&fields=key,title,author_name,number_of_pages_median,cover_i,first_publish_year`;

      const response = await fetch(apiUrl, { headers: { 'User-Agent': 'OrganizadorApp/1.0' } });
      if (!response.ok) return [];

      const data = await response.json();
      if (!data.docs) return [];

      return data.docs.map(doc => ({
        id: `ol_${doc.key.replace('/works/', '')}`,
        title: doc.title || 'Título Desconhecido',
        authors: doc.author_name ? doc.author_name.slice(0, 2).join(', ') : 'Autor Desconhecido',
        totalPages: doc.number_of_pages_median || 220,
        thumbnail: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : 'https://via.placeholder.com/128x192?text=Sem+Capa',
        year: doc.first_publish_year || 'N/D',
        source: 'Open Library'
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Serviço de Agregação de Livros
 */
class BookAggregatorService {
  static async searchBooks(query, filterType = 'all', page = 0) {
    if (!query || !query.trim()) return [];

    const [googleResults, openLibraryResults] = await Promise.all([
      GoogleBooksProvider.search(query, filterType, page, 15),
      OpenLibraryProvider.search(query, page, 15)
    ]);

    const combined = [...googleResults, ...openLibraryResults];
    const seenTitles = new Set();
    const uniqueResults = [];

    for (const book of combined) {
      const key = book.title.toLowerCase().trim();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        uniqueResults.push(book);
      }
    }

    return uniqueResults;
  }
}

/**
 * Servidor HTTP Nativo
 */
class NativeServer {
  constructor(port = 3000) {
    this.port = port;
    this.mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg'
    };
  }

  start() {
    const server = http.createServer(async (req, res) => {
      // Cabeçalhos CORS para permitir requisições sem restrição
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;

      // Rota de API: /api/books/search
      if (pathname === '/api/books/search') {
        const query = parsedUrl.query.q || '';
        const filterType = parsedUrl.query.type || 'all';
        const page = parseInt(parsedUrl.query.page, 10) || 0;

        try {
          const results = await BookAggregatorService.searchBooks(query, filterType, page);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, count: results.length, results }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Erro ao buscar livros.' }));
        }
        return;
      }

      // Servir Arquivos Estáticos (index.html, styles.css, app.js)
      let filePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      const safePath = path.join(__dirname, filePath);

      fs.readFile(safePath, (err, content) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Arquivo não encontrado');
          return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = this.mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });

    server.listen(this.port, () => {
      console.log(`\n==================================================`);
      console.log(`>> Servidor rodando em: http://localhost:${this.port}`);
      console.log(`>> Abra o navegador nesse link para testar.`);
      console.log(`==================================================\n`);
    });
  }
}

new NativeServer(3000).start();