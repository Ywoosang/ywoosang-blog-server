import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/user.entity';
import { Post } from 'src/post/entities/post.entity';
import { Comment } from 'src/comment/entities/comment.entity';
import { Like } from 'src/like/entities/like.entity';

@Module({
    imports: [
        ConfigModule, // AppModule 에서 설정한 ConfigModule 을 import
        TypeOrmModule.forRootAsync({
            useFactory: config => ({
                type: config.get('database.type', { infer: true }),
                host: config.get('database.host', { infer: true }),
                port: config.get('database.port', { infer: true }),
                username: config.get('database.username', { infer: true }),
                password: config.get('database.password', { infer: true }),
                database: config.get('database.name', { infer: true }),
                charset: 'utf8mb4',
                synchronize: config.get('database.synchronize', { infer: true }),
                entities: [User, Post, Comment, Like]
            }),
            inject: [ConfigService]
        })
    ]
})
export class DatabaseModule {}
