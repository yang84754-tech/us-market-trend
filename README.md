# 璇璇的小猫美股趋势魔方

这是一个手机优先的美股主题板块趋势网站。页面会读取主要指数、股指期货和主题板块成分股，并展示常规交易、盘前/盘后、综合趋势和上涨热度。

## 当前推荐上线方式

使用 Cloudflare Pages，不需要填写银行卡。

Cloudflare 表单这样填：

```text
Project name: us-market-trend
Production branch: main
Framework preset: None
Build command: 留空
Build output directory: public
Root directory: 留空
Environment variables: 不填
```

部署成功后会得到一个类似下面的稳定网址：

```text
https://us-market-trend.pages.dev
```

## 文件说明

- `public`：网站页面、小猫贴纸、样式和交互。
- `functions/api/market.js`：Cloudflare Pages 的行情接口。
- `server.py`：本地预览或备用 Python 服务。
- `CLOUDFLARE.md`：Cloudflare 部署说明。
- `DEPLOY.md`：简短部署说明。

## 数据说明

- 指数只按真实指数代码读取：道琼斯、纳斯达克、标普500、纳斯达克100、恐慌指数。
- 主题板块不是行业 ETF，而是按主题成分股合成，例如 CPO、存储芯片、AI 算力芯片、半导体设备等。
- 盘前/盘后会结合返回的盘外数据展示。
- 正数显示红色，负数显示绿色。

## 本地预览

```bash
python server.py
```

默认地址：

```text
http://localhost:4177
```
