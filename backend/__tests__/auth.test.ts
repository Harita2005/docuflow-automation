import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';

describe('Auth API Integration', () => {
  it('should reject login with empty payload', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Identifier and password are required');
  });

  it('should accept valid username login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'anbu',
        password: 'password123'
      });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
  });

  it('should accept valid employee ID login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'EMP-1001',
        password: 'password123'
      });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('manager');
  });
});
