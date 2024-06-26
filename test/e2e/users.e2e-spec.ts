import { AppTestModule } from '../app-test.module';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UsersService } from 'src/users/users.service';
import UserSeeder from '../seeds/users.seed';
import { User } from 'src/users/entities/user.entity';
import { UsersRole } from 'src/users/users-role.enum';
import validationOptions from 'src/utils/validation-options';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { USER_EMAIL, USER_EMAIL_SECOND } from '../consts';
import { AuthService } from 'src/auth/auth.service';

describe('UserController (e2e)', () => {
    let app: INestApplication;
    let accessTokenUser: string;
    let userSeeder: UserSeeder;
    let testUser: User;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppTestModule],
        }).compile();

        const authService = moduleFixture.get<AuthService>(AuthService);
        const usersService = moduleFixture.get<UsersService>(UsersService);

        userSeeder = new UserSeeder(usersService);

        testUser = await userSeeder.createTestUser(USER_EMAIL, UsersRole.USER);

        const userHash = await authService.generateHash(USER_EMAIL);

        let response;
        response = await authService.login({ hash: userHash });
        accessTokenUser = response.accessToken;

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe(validationOptions));
        app.useGlobalInterceptors(new ResponseInterceptor());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('/users/profile (GET)', () => {
        it('사용자 프로필 정보를 반환한다.', async () => {
            const response = await request(app.getHttpServer())
                .get('/users/profile')
                .set('Authorization', `Bearer ${accessTokenUser}`);
            expect(response.statusCode).toBe(200);
            testUser = response.body;
            expect(testUser).toHaveProperty('id');
            expect(testUser).toHaveProperty('description');
            expect(testUser).toHaveProperty('userId');
            expect(testUser).toHaveProperty('nickname');
            expect(testUser).toHaveProperty('email');
            expect(testUser).toHaveProperty('role');
        });

        it('사용자 프로필 정보에 비밀번호는 포함되지 않아야 한다.', async () => {
            expect(testUser).not.toHaveProperty('password');
        });

        it('사용자 프로필 정보에 refreshToken 은 포함되지 않아야 한다.', async () => {
            expect(testUser).not.toHaveProperty('refreshToken');
        });
    });

    describe('/users/public/profile/:userId (GET)', () => {
        it('userId 에 해당하는 사용자 공개 프로필 정보를 반환한다.', async () => {
            const response = await request(app.getHttpServer())
                .get(`/users/public/profile/${testUser.userId}`)
                .expect(200);
            expect(response.statusCode).toBe(200);
            const user = response.body;
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('description');
            expect(user).toHaveProperty('profileImage');
            expect(user).toHaveProperty('nickname');
            expect(user).toHaveProperty('userId');
        });

        it('존재하지 않는 사용자라면 404 NotFound 를 반환한다.', async () => {
            await request(app.getHttpServer())
                .get(`/users/public/profile/${encodeURIComponent('가나다')}`)
                .expect(404);
        });
    });

    describe('/users/profile (PATCH)', () => {
        it('사용자 프로필 정보를 변경한다.', async () => {
            const nickname = 'ywoosang';
            const description = 'nestJS 블로그 개발 테스트';
            await request(app.getHttpServer())
                .patch('/users/profile')
                .set('Authorization', `Bearer ${accessTokenUser}`)
                .send({
                    nickname,
                    description,
                })
                .expect(200);
            const response = await request(app.getHttpServer())
                .get('/users/profile')
                .set('Authorization', `Bearer ${accessTokenUser}`);
            const user = response.body;
            expect(user.nickname).toBe(nickname);
            expect(user.description).toBe(description);
        });

        it('이메일은 변경할 수 없어야 한다.', async () => {
            await request(app.getHttpServer())
                .patch('/users/profile')
                .set('Authorization', `Bearer ${accessTokenUser}`)
                .send({
                    email: USER_EMAIL_SECOND,
                })
                .expect(200);

            const response = await request(app.getHttpServer())
                .get('/users/profile')
                .set('Authorization', `Bearer ${accessTokenUser}`);
            const user = response.body;
            expect(user.email).toBe(USER_EMAIL);
        });
    });
});
