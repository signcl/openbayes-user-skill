# serving-apikey-create variables

`createApiKey(userId, name, servingIds, keyType)` 返回的是**明文 key 字符串本身**，不是对象；只返回这一次，之后 `serving-apikey-list.graphql` 只能看到名称与绑定范围。执行前仍须按 `workflows/serving/manage-apikeys.md` 取得用户确认；`tests/maintenance/user-mutation-tier-decisions.test.mjs` 的 ALLOWLIST 只表示它不带 manifest 确认档位（可撤销、零成本），不是免去这一步。展示与落盘规则也见该 workflow。

## vars.json

```json
{
  "userId": "zhangsan",
  "name": "demo-key",
  "servingIds": ["vycpv1a7wiky"],
  "keyType": "SERVING"
}
```

`servingIds` 可省：`keyType` 为 `USER_LEVEL` 时不绑定具体 serving。

## KeyType enum values（入参 `$keyType`）

From `references/graphql/schema.graphql`:

- `SERVING`
- `USER_LEVEL`
