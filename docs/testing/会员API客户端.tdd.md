# 会员 API 客户端：TDD 证据

## 用户旅程

- 作为登录用户，我可以安全同步自己的会员状态。
- 作为免费用户，我可以请求一个由服务端创建的 Pro 收银台会话。
- 作为系统，异常响应、非 HTTPS 地址、缺失令牌和上游错误必须安全失败。

## RED / GREEN

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| RED | `npm test -- --run src/shared/membership-client.test.ts` | 失败：`membership-client` 模块不存在 |
| GREEN | `npm test -- --run src/shared/membership-client.test.ts` | 通过：8 个测试 |
| RED | `npm test -- --run src/shared/entitlements.test.ts` | 失败：Pro 提示词仍存在于扩展包 |
| GREEN | `npm test -- --run src/shared/entitlements.test.ts src/shared/membership-client.test.ts` | 通过：16 个测试 |

## 测试保证

| # | 保证 | 测试文件 | 结果 |
| --- | --- | --- | --- |
| 1 | 生产 API 强制 HTTPS，本地开发可使用回环地址 | `membership-client.test.ts` | PASS |
| 2 | 缺少令牌时不会发出网络请求 | `membership-client.test.ts` | PASS |
| 3 | 会员状态仅接受白名单字段和值 | `membership-client.test.ts` | PASS |
| 4 | 收银台地址仅接受 HTTPS | `membership-client.test.ts` | PASS |
| 5 | 服务端错误转换为稳定错误码且不暴露正文 | `membership-client.test.ts` | PASS |
| 6 | 扩展包不包含 24 个 Pro 模板的提示词正文 | `entitlements.test.ts` | PASS |

## 已知范围

- 当前只实现支付商无关的客户端与 OpenAPI 契约，尚未连接真实服务端。
- 登录方式、API 域名和支付服务商仍需确定后才能配置 Manifest 权限与生产适配器。
- 仓库没有浏览器 E2E 测试环境；支付跳转必须在选定服务端后做真实浏览器验证。
