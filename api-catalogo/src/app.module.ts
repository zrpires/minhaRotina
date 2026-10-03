import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [
    CacheModule.register({ isGlobal: true }),
    SearchModule
  ],
})
export class AppModule {}