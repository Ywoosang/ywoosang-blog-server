import { AppTestModule } from '../app-test.module';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UsersService } from 'src/users/users.service';
import { PostService } from 'src/post/post.service';
import { PostStatus } from 'src/post/post-status.enum';
import { User } from 'src/users/entities/user.entity';
import UserSeeder from '../seeds/users.seed';
import PostSeeder from '../seeds/post.seed';
import CommentSeeder from '../seeds/comment.seed';
import { UsersRole } from 'src/users/users-role.enum';
import validationOptions from 'src/utils/validation-options';
import * as faker from 'faker';
import { CommentService } from 'src/comment/comment.service';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { AuthService } from 'src/auth/auth.service';
import { ADMIN_EMAIL, USER_EMAIL } from '../consts';
import { POST_PER_PAGE } from 'src/common/consts';

describe('PostController (e2e)', () => {
    let app: INestApplication;
    let accessTokenUser: string;
    let accessTokenAdmin: string;
    let userSeeder: UserSeeder;
    let postSeeder: PostSeeder;
    let commentSeeder: CommentSeeder;
    let testAdminUser: User;
    let testUser: User;
    let publicPostCount: number;
    let privatePostCount: number;

    beforeAll(async () => {
        jest.setTimeout(1000000);
        const moduleFixture = await Test.createTestingModule({
            imports: [AppTestModule],
        }).compile();

        const usersService = moduleFixture.get<UsersService>(UsersService);
        const postService = moduleFixture.get<PostService>(PostService);
        const commentService = moduleFixture.get<CommentService>(CommentService);
        const authService = moduleFixture.get<AuthService>(AuthService);

        userSeeder = new UserSeeder(usersService);
        postSeeder = new PostSeeder(postService);
        commentSeeder = new CommentSeeder(commentService);

        testAdminUser = await userSeeder.createTestUser(ADMIN_EMAIL, UsersRole.ADMIN);
        testUser = await userSeeder.createTestUser(USER_EMAIL, UsersRole.USER);

        const adminHash = await authService.generateHash(ADMIN_EMAIL);
        const userHash = await authService.generateHash(USER_EMAIL);

        let response;
        response = await authService.login({ hash: adminHash });
        accessTokenAdmin = response.accessToken;
        response = await authService.login({ hash: userHash });
        accessTokenUser = response.accessToken;

        // 공개 게시물 생성
        const publicPostPromises = Array.from({ length: 20 }).map(() => {
            return postSeeder.createTestPost(testAdminUser);
        });
        await Promise.all(publicPostPromises);
        publicPostCount = 20;

        // 비공개 게시물 생성
        const privatePostPromises = Array.from({ length: 10 }).map(() => {
            return postSeeder.createTestPost(testAdminUser, PostStatus.PRIVATE);
        });
        await Promise.all(privatePostPromises);
        privatePostCount = 10;

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe(validationOptions));
        app.useGlobalInterceptors(new ResponseInterceptor());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('/post (POST)', () => {
        const title = faker.lorem.sentence();
        const content = faker.lorem.paragraph();
        const description = faker.lorem.sentence();
        it('게시물을 생성한다.', async () => {
            await request(app.getHttpServer())
                .post('/posts')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .send({
                    title,
                    content,
                    description,
                    status: PostStatus.PUBLIC,
                })
                .expect(201);
            publicPostCount++;
        });

        it('로그인하지 않은 사용자가 게시물을 생성할 때 401 Unauthrized 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .post('/posts')
                .send({
                    title,
                    content,
                    description,
                    status: PostStatus.PUBLIC,
                })
                .expect(401);
        });

        it('관리자가 아닌 사용자가 게시물을 생성할 때 403 Forbiden 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .post('/posts')
                .set('Authorization', `Bearer ${accessTokenUser}`)
                .send({
                    title,
                    content,
                    description,
                    status: PostStatus.PUBLIC,
                })
                .expect(403);
        });

        it('제목이 없을 때 400 BadRequest 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .post('/posts')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .send({
                    title: '',
                    content: '내용1',
                    description,
                    status: PostStatus.PUBLIC,
                })
                .expect(400);
        });

        it('내용이 없을 때 400 BadRequest 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .post('/posts')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .send({
                    title: '제목1',
                    content: '',
                    description,
                    status: PostStatus.PUBLIC,
                })
                .expect(400);
        });

        it('게시글 설명이 없을 때 400 BadRequest 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .post('/posts')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .send({
                    title: '제목1',
                    content: '',
                    status: PostStatus.PUBLIC,
                })
                .expect(400);
        });
    });

    describe('/posts/public/count  (GET)', () => {
        it('공개 게시물 개수를 반환한다.', async () => {
            const response = await request(app.getHttpServer()).get('/posts/public/count').expect(200);
            const data = response.body;
            expect(data.postCount).toBeDefined();
            expect(data.postCount).toBe(publicPostCount);
        });
    });

    describe('/posts/count  (GET)', () => {
        it('모든 게시물 개수를 반환한다.', async () => {
            const response = await request(app.getHttpServer())
                .get('/posts/count')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .expect(200);
            const data = response.body;
            expect(data.postCount).toBeDefined();
            expect(data.postCount).toBe(publicPostCount + privatePostCount);
        });
    });

    describe('/posts/public?page= (GET)', () => {
        it('현재 페이지의 공개 게시글 목록과 총 게시글 수를 반환한다.', async () => {
            const response = await request(app.getHttpServer()).get('/posts/public?page=1&limit=2').expect(200);
            const data = response.body;
            expect(data).toHaveProperty('posts');
            expect(data).toHaveProperty('total');
            data.posts.forEach((post) => {
                expect(post.status).toBe(PostStatus.PUBLIC);
            });
        });

        it(`limit 또는 page 가 주어지지 않는다면 1페이지, ${POST_PER_PAGE} 개 게시물을 반환한다.`, async () => {
            const response = await request(app.getHttpServer()).get('/posts/public').expect(200);
            const data = response.body;
            expect(data).toHaveProperty('posts');
            expect(data).toHaveProperty('total');
            expect(Array.isArray(data.posts)).toBeTruthy();
            expect(data.posts.length).toBe(POST_PER_PAGE);
        });

        it('없는 페이지일 경우 빈 게시물 목록과 총 게시글 수를 반환한다.', async () => {
            await request(app.getHttpServer())
                .get('/posts/public?page=10&limit=15')
                .expect((response) => {
                    const data = response.body;
                    expect(data).toHaveProperty('posts');
                    expect(data).toHaveProperty('total');
                    expect(data.posts.length).toBe(0);
                });
        });
    });

    describe('/posts?page= (GET)', () => {
        it('현재 페이지의 게시글 목록과 총 게시글 수를 반환한다.', async () => {
            const response = await request(app.getHttpServer())
                .get('/posts?page=1&limit=2')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .expect(200);
            const data = response.body;
            expect(data).toHaveProperty('posts');
            expect(data).toHaveProperty('total');
        });

        it('없는 페이지일 경우 빈 게시물 목록과 총 게시글 수를 반환한다.', async () => {
            const response = await request(app.getHttpServer())
                .get('/posts?page=10&limit=15')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .expect(200);

            const data = response.body;
            expect(data).toHaveProperty('posts');
            expect(data).toHaveProperty('total');
            expect(data.posts.length).toBe(0);
        });

        it('관리자가 아닐 경우 403 Forbidden 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .get('/posts?page=1&limit=2')
                .set('Authorization', `Bearer ${accessTokenUser}`)
                .expect(403);
        });
    });

    describe('/posts/public/:id (GET)', () => {
        it('id 에 해당하는 공개 게시물을 반환한다.', async () => {
            await request(app.getHttpServer()).get('/posts/public/1').expect(200);
        });

        it('존재하지 않는 게시물일 경우 404 NotFound 에러를 반환한다.', async () => {
            await request(app.getHttpServer()).get('/posts/public/200').expect(404);
        });

        it('비공개 게시물일 경우 403 Forbidden 에러를 반환한다.', async () => {
            await request(app.getHttpServer()).get('/posts/public/30').expect(403);
        });
    });

    describe('/posts/:id (GET)', () => {
        it('id 에 해당하는 게시물을 반환한다.', async () => {
            await request(app.getHttpServer())
                .get('/posts/1')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .expect(200);
        });

        it('로그인하지 않았을 경우 401 Unauthorized 에러를 반환한다.', async () => {
            await request(app.getHttpServer()).get('/posts/1').expect(401);
        });

        it('존재하지 않는 게시물일 경우 404NotFound 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .get('/posts/200')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .expect(404);
        });

        it('비공개 게시물일 경우 관리자가 아니라면 403 Forbidden 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .get('/posts/12')
                .set('Authorization', `Bearer ${accessTokenUser}`)
                .expect(403);
        });
    });

    describe('/posts/:id/status (PATCH)', () => {
        it('게시물의 공개/비공개 상태를 변경한다.', async () => {
            await request(app.getHttpServer())
                .patch('/posts/1/status')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .send({
                    status: PostStatus.PRIVATE,
                })
                .expect(204);
        });

        it('관리자가 아니라면 403 Forbidden 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .patch('/posts/12/status')
                .set('Authorization', `Bearer ${accessTokenUser}`)
                .send({
                    status: PostStatus.PUBLIC,
                })
                .expect(403);
        });

        it('존재하지 않는 게시물의 상태를 변경하려는 경우 404 NotFound 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .patch('/posts/100/status')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .send({
                    status: PostStatus.PRIVATE,
                })
                .expect(404);
        });
    });

    describe('/posts/:id (DELETE)', () => {
        it('id 에 해당하는 게시물을 삭제한다.', async () => {
            await request(app.getHttpServer())
                .delete('/posts/1')
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .expect(200);
        });

        it('게시물 삭제시 댓글도 같이 삭제되어야 한다.', async () => {
            // 게시물 생성
            const post = await postSeeder.createTestPost(testUser);
            // 댓글 생성
            const comment = await commentSeeder.createTestComment(testUser, post.id);
            // 대댓글 생성
            await commentSeeder.createTestReply(testAdminUser, comment.id);
            await request(app.getHttpServer())
                .delete(`/posts/${post.id}`)
                .set('Authorization', `Bearer ${accessTokenAdmin}`)
                .expect(200);
        });

        it('관리자가 아니라면 403 Forbidden 에러를 반환한다.', async () => {
            await request(app.getHttpServer())
                .delete('/posts/12')
                .set('Authorization', `Bearer ${accessTokenUser}`)
                .expect(403);
        });
    });
});
