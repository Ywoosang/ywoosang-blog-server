import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PostStatus } from './post-status.enum';
import { CreatePostDto } from './dto/create-post.dto';
import { FindOneOptions, Repository } from 'typeorm';
import { Post } from './entities/post.entity';
import { User } from 'src/users/entities/user.entity';
import { FindPostsDto } from './dto/find-posts.dto';
import { NullableType } from 'src/utils/types/nullable.type';
import { UsersService } from 'src/users/users.service';
import { CategoryService } from 'src/category/category.service';
import { TagService } from 'src/tag/tag.service';
import { Tag } from 'src/tag/entities/tag.entity';

@Injectable()
export class PostService {
    constructor(
        @InjectRepository(Post)
        private postRepository: Repository<Post>,
        private usersService: UsersService,
        private categoryService: CategoryService,
        private tagService: TagService
    ) {}

    async findOne(findOptions: FindOneOptions<Post>): Promise<NullableType<Post>> {
        return this.postRepository.findOne(findOptions);
    }

    async findPostsPaginated(page: number = 1, limit: number = 15, isAdmin: boolean = false): Promise<FindPostsDto> {
        const skip = (page - 1) * limit;
        const whereCondition: any = {};
        if (!isAdmin) {
            whereCondition.status = PostStatus.PUBLIC;
        }
        const [posts, total] = await this.postRepository.findAndCount({
            take: limit,
            skip,
            where: whereCondition
        });

        return {
            posts,
            total
        };
    }

    async findPublicUserPosts(userId: number): Promise<NullableType<Post[]>> {
        const user: User = await this.usersService.findOne({
            where: {
                id: userId
            },
            relations: ['posts']
        });
        if (!user) throw new NotFoundException('존재하지 않는 사용자입니다.');

        return user.posts.filter(post => post.status === PostStatus.PUBLIC);
    }

    async create(createPostDto: CreatePostDto, user: User): Promise<Post> {
        const { title, content, status, categoryId, tagNames } = createPostDto;

        let category;
        if (categoryId) {
            category = await this.categoryService.findOneById(categoryId);
            if (!category) {
                throw new NotFoundException('존재하지 않는 카테고리입니다.');
            }
        }
        const tags: Tag[] = [];
        if (tagNames) {
            for (const tagName of tagNames) {
                const tag = await this.tagService.createIfNotExistByName({ name: tagName });
                tags.push(tag);
            }
        }

        return this.postRepository.save(
            this.postRepository.create({
                title,
                content,
                status,
                user,
                category,
                tags
            })
        );
    }

    async updateStatus(id: number, status: PostStatus): Promise<Post> {
        const post = await this.findOne({
            where: {
                id
            }
        });
        if (!post) throw new NotFoundException('존재하지 않는 게시물입니다.');
        post.status = status;
        await this.postRepository.save(post);

        return post;
    }

    async delete(id: number, user: User): Promise<void> {
        const post = await this.findOne({
            where: [
                { id },
                {
                    user: {
                        id: user.id
                    }
                }
            ]
        });
        await this.postRepository.remove(post);
    }
}
