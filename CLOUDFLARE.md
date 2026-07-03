# Cloudflare Pages 上线步骤

这个方案不走 Render，也不需要填写银行卡。部署后会得到一个稳定网址，通常长这样：

```text
https://us-market-trend.pages.dev
```

## 需要上传到 GitHub 的内容

把这个文件夹里的内容全部上传到你的 GitHub 仓库：

```text
outputs/us-market-trend
```

如果 GitHub 已经有旧版本，建议重新上传这些内容：

- `public`
- `functions`
- `README.md`
- `DEPLOY.md`
- `CLOUDFLARE.md`
- `wrangler.toml`

`__pycache__` 不用上传。

## Cloudflare Pages 怎么填

进入 Cloudflare 后选择：

```text
Workers & Pages -> Create -> Pages -> Connect to Git
```

选择你的 GitHub 仓库：

```text
yang84754-tech/us-market-trend
```

然后这样填：

```text
Project name: us-market-trend
Production branch: main
Framework preset: None
Build command: 留空
Build output directory: public
Root directory: 留空
Environment variables: 不填
```

点部署后，Cloudflare 会自动识别 `functions/api/market.js`，手机打开它给你的 `pages.dev` 网址就可以看行情。
