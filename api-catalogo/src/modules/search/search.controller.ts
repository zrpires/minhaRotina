import { Controller, Get, Query, BadRequestException, UseInterceptors } from '@nestjs/common';
import { SearchService } from './search.service';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';

@Controller('api/books')
@UseInterceptors(ResponseInterceptor)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search')
  async search(@Query('q') q: string) {
    if (!q) throw new BadRequestException('Parâmetro "q" é obrigatório.');
    
    // O TypeScript agora já sabe que 'results' é uma lista e não vai bloquear o .length
    const results = await this.searchService.search(q, 20);
    return { results, meta: { query: q, count: results.length } };
  }
}