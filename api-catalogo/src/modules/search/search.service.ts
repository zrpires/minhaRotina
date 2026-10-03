import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager'; // <-- CORREÇÃO 1: Adicionado o 'type'
import { normalizeString } from '../../common/utils/string.util';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  // <-- CORREÇÃO 2: Garantir que ele devolve sempre uma lista (Promise<any[]>)
  async search(query: string, limit = 20): Promise<any[]> {
    const normalizedQuery = normalizeString(query);
    const cacheKey = `search:${normalizedQuery}:${limit}`;
    
    // Forçar a leitura do cache como um Array
    const cached = await this.cacheManager.get(cacheKey) as any[];
    if (cached) return cached;

    // Busca Exata por ISBN
    const isIsbn = /^\d{13}$/.test(normalizedQuery);
    if (isIsbn) {
      const result = await this.prisma.edition.findUnique({
        where: { isbn13: normalizedQuery },
        include: { work: { include: { authors: { include: { author: true } } } } }
      });
      if (result) return [this.mapToDto(result)];
    }

    // Busca Avançada usando Similaridade Trigram (Fuzzy)
    const dbResults = await this.prisma.$queryRaw<any[]>`
      SELECT 
        e.id, e.title, e.isbn13, e."cover_url" as "coverUrl", e."page_count" as "pageCount",
        w."canonical_title" as "workTitle",
        string_agg(a.name, ', ') as "authorNames",
        similarity(e.title, ${query}) as rank
      FROM editions e
      JOIN works w ON e.work_id = w.id
      LEFT JOIN work_authors wa ON w.id = wa.work_id
      LEFT JOIN authors a ON wa.author_id = a.id
      WHERE e.title % ${query} OR a.normalized_name % ${normalizedQuery}
      GROUP BY e.id, e.title, e.isbn13, e."cover_url", e."page_count", w."canonical_title"
      ORDER BY rank DESC
      LIMIT ${limit};
    `;

    await this.cacheManager.set(cacheKey, dbResults, 60000);
    return dbResults;
  }

  private mapToDto(e: any) {
    return {
      id: e.id,
      title: e.title,
      isbn13: e.isbn13,
      coverUrl: e.coverUrl,
      authorNames: e.work?.authors?.map((wa: any) => wa.author.name).join(', ') || 'Desconhecido'
    };
  }
}