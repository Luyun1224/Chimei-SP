/** GitHub 網址直開：登入權杖簽發／驗證與資料 API（doPost）的伺服器端檢查 */
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { doGet, doPost } from '../server/gas/main';

const b64 = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
let props: Record<string, string>;
let user = '';
let lastTemplate: Record<string, unknown> = {};

beforeEach(() => {
  props = { ADMIN_EMAILS: 'admin@x.org', API_URL: 'https://script.google.com/macros/s/API/exec' };
  user = 'admin@x.org';
  Object.assign(globalThis as Record<string, unknown>, {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => (props[k] = v) }) },
    Session: { getActiveUser: () => ({ getEmail: () => user }) },
    Utilities: {
      getUuid: () => Math.random().toString(36).slice(2),
      Charset: { UTF_8: 'UTF-8' },
      computeHmacSha256Signature: (v: string, k: string) => createHmac('sha256', k).update(v).digest(),
      base64EncodeWebSafe: (v: string | Buffer) => b64(Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8')),
      base64DecodeWebSafe: (v: string) => Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      newBlob: (b: Buffer) => ({ getDataAsString: () => b.toString('utf8') }),
    },
    HtmlService: {
      createTemplate: () => {
        lastTemplate = {};
        return new Proxy(lastTemplate, { get: (t, k) => (k === 'evaluate' ? () => ({ setTitle: () => ({ addMetaTag: () => ({}) }) }) : (t as Record<string, unknown>)[k as string]) });
      },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => ({ body: s }) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => { throw new Error('no sheet in test'); } },
  });
});

const login = (ret = 'https://luyun1224.github.io/Chimei-SP/') => {
  doGet({ parameter: { login: '1', return: ret } } as never);
  return lastTemplate;
};
const post = (body: unknown) => JSON.parse((doPost({ postData: { contents: JSON.stringify(body) } } as never) as unknown as { body: string }).body);
const tokenFrom = (back: string) => decodeURIComponent(/sphub_token=([^&]+)/.exec(back)![1]);

describe('登入權杖', () => {
  it('管理員登入後帶回權杖；權杖可通過驗證，竄改或非管理員會被拒絕', () => {
    const t = login();
    expect(String(t.back)).toMatch(/^https:\/\/luyun1224\.github\.io\/Chimei-SP\/#sphub_token=/);
    const token = tokenFrom(String(t.back));
    // 有效權杖：通過身分驗證，進入業務邏輯（測試環境沒有試算表 → NOT_CONFIGURED，表示已通過權限檢查）
    expect(post({ token, action: 'bootstrap', payload: '{}' }).error.code).toBe('NOT_CONFIGURED');
    // 竄改
    expect(post({ token: token.slice(0, -2) + 'xx', action: 'bootstrap' }).error.code).toBe('UNAUTHENTICATED');
    expect(post({ action: 'bootstrap' }).error.code).toBe('UNAUTHENTICATED');
    // 被移出管理員名單後，舊權杖立即失效
    props.ADMIN_EMAILS = 'other@x.org';
    expect(post({ token, action: 'bootstrap' }).error.code).toBe('FORBIDDEN');
    // 更換密鑰 → 所有權杖失效
    props.ADMIN_EMAILS = 'admin@x.org';
    props.TOKEN_SECRET = 'rotated';
    expect(post({ token, action: 'bootstrap' }).error.code).toBe('UNAUTHENTICATED');
  });

  it('非管理員、未登入、非白名單返回網址都不簽發權杖', () => {
    user = 'stranger@gmail.com';
    expect(login().back).toBe('');
    user = '';
    expect(login().back).toBe('');
    user = 'admin@x.org';
    expect(login('https://evil.example.com/').back).toBe('');
    // 白名單前綴後夾帶內容不會被帶入
    const t = login('https://luyun1224.github.io/Chimei-SP/</script><script>alert(1)</script>');
    expect(String(t.back)).toMatch(/^https:\/\/luyun1224\.github\.io\/Chimei-SP\/#sphub_token=/);
    expect(String(t.backJson)).not.toContain('<');
  });
});
