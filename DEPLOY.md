# 免费上线方案：Cloudflare Pages

目标：拿到一个手机可以直接打开的稳定公网网址，不受同一 Wi-Fi、局域网 IP、电脑是否开机影响。

## 为什么不用 Render

Render 免费项目前面弹出了绑卡窗口。为了不填银行卡，这个版本改用 Cloudflare Pages。

## Cloudflare 怎么填

打开 Cloudflare 后选择：

```text
Workers & Pages -> Create -> Pages -> Connect to Git
```

选择仓库：

```text
yang84754-tech/us-market-trend
```

表单这样填：

```text
Project name: us-market-trend
Production branch: main
Framework preset: None
Build command: 留空
Build output directory: public
Root directory: 留空
Environment variables: 不填
```

然后点 Deploy。成功后 Cloudflare 会给你一个稳定网址，例如：

```text
https://us-market-trend.pages.dev
```

## 重要说明

- 页面文件在 `public`。
- 实时行情接口在 `functions/api/market.js`。
- 指数只按真实指数代码读取：道琼斯、纳斯达克、标普500、纳斯达克100、恐慌指数，不用 ETF 价格冒充。
- 主题板块涨跌幅按主题成分股合成，例如 CPO、存储芯片、AI 算力芯片等。
- 正数显示红色，负数显示绿色。
