家族历史数字馆｜项目详细设计文档
仓库代号：jiazu
文档版本：V1.0‑Final
生成时间：2026‑08‑12
状态：全部决策落地，无备选方案，可直接据此开发部署
目录
1 项目概述
2 域名、路由与访问规则
3 Tree‑ID 强约束命名规范
4 元数据映射配置
5 整体技术架构
6 前端外壳（Vue3+Vite）详细设计
7 Gramps‑Web 配置与部署
8 数据模型与跨树软关联
9 权限与用户体系
10 核心业务功能明细
11 存储、CDN 设计
12 备份策略（手动）
13 部署方案 Docker‑Compose
14 新增一个家族树完整标准化流程
15 合规、隐私（个人备案）
16 风险清单与规避措施
1 项目概述
1.1 项目定位
家族历史数字馆，一套底层支撑多姓氏、多支派家谱数字化展示平台。
定位：个人主导的谱牒文化数字化研究工具；不是宗亲组织、无理事会、无会费、不组织线下活动，个人备案站点。
每一个家族支派为一棵独立的 Gramps‑Web Tree；物理数据库隔离；
单 Gramps‑Web 实例多 Tree，不一个支派启动一套服务；
所有定制业务、UI、专题全部放在外部 Vue3 外壳，不修改 Gramps‑Web 上游源码，可直接升级官方镜像；
业务逻辑模块抽离，预留复用给后续微信小程序；
优先落地样板：季氏多支派系列 tree。
1.2 核心能力
各支派家谱世系、人物档案查阅
老谱扫描件、历史图片、文献 PDF 浏览
完整中式传统竖排族谱 PDF 导出下载
字辈检索专题、家族迁徙地图专题
同平台不同家族树之间联姻、人物互引跳转（跨 tree 软关联）
当前树内搜索 + 平台全局跨 tree 搜索
聚合导航首页，浏览全部上线家族数字馆
1.3 边界（严格遵守个人备案约束）
✅允许：开放注册（手机号验证码）；匿名访客只读；管理员审核升级协作者；邮件接收史料投稿；GEDCOM/.gramps 导入导出
❌禁止：留言、BBS 论坛；线上支付；宗亲组织相关功能；DNA 族谱匹配。
2 域名、路由与访问规则
2.1 域名清单
表格
域名	用途
jiazutong.cn	根域名：聚合导航首页 + 项目关于页
*.jiazutong.cn	泛域名 SSL 证书，支持自定义子域名
ji.jiazutong.cn	示例：季氏某支自定义友好子域名，先到先得分配
admin.jiazutong.cn	独立管理员后台入口，Gramps‑Web 原生管理界面
media.jiazutong.cn	CDN 媒体资源域名，图片、PDF、扫描谱册
2.2 两套访问方式（同时生效）
自定义二级域名访问（优先对外推广）
例：ji.jiazutong.cn，Nginx 解析域名读取元映射，路由至对应 tree‑id；面向普通用户。
路径式兜底访问（无自定义子域名时使用）
格式：jiazutong.cn/{tree_id}
示例：jiazutong.cn/ji_23376_02
tree‑id 全部为 ASCII，URL 无需特殊转义。
所有对外访问均走 Vue 外壳；admin.jiazutong.cn直接透传给 Gramps‑Web 原生后台，普通访客不可访问。
2.3 根域名页面内容
聚合导航：卡片列表展示所有已上线家族数字馆，卡片包含：显示名称、发源地、简介、跳转链接（子域名优先，回退路径模式）
项目关于页：项目说明、免责声明、联系投稿邮箱、隐私说明。
3 Tree‑ID 强约束命名规范
目标：解决同音字（季 / 纪；杨 / 阳）；支持同一个汉字数十个不同支派；全 ASCII 字符，兼容文件系统、COS 对象 key、URL、日志、shell 脚本。
格式固定
plaintext
拼音_汉字Unicode十进制码点_支派序号
拼音：姓氏拼音小写
下划线_作为分隔符
Unicode 十进制：该姓氏标准简体汉字十进制码点，用于唯一锁定字形，区分同音字
支派序号：两位数字从01开始递增，同一汉字不同支派使用不同序号
示例表
表格
汉字	拼音	Unicode 十进制	tree‑id	说明
| 季	|ji	|23395	|ji_23395_01	|季氏‑苏南支|
| 季	|ji	|23395	|ji_23395_02	|季氏‑秦皇岛支|
| 纪	|ji	|32426	|ji_32426_01	|纪氏‑河北支|
| 顾	|gu	|39038	|gu_39038_01	|顾氏主支|
禁止：直接汉字、拼音不带码点、生僻异体字、空格、特殊符号。
Gramps‑Web 配置开启GRAMPSWEB_MEDIA_PREFIX_TREE=True，媒体资源自动以 tree‑id 为 COS 顶层目录。
4 元数据映射配置
存储位置：项目仓库配置目录 config/tree‑meta.json；同时备份到 COS 私有备份桶；属于核心业务元数据。
作用：域名 / 路径 → tree‑id；保存对外展示信息；跨树跳转时查表翻译 tree‑id 为人类可读中文。
json
{
  "ji.jiazutong.cn": {
    "tree_id": "ji_23395_01",
    "path_alias": "/ji_23395_01",
    "surname_char": "季",
    "display_title": "季氏（苏南支）家族历史数字馆",
    "origin": "江苏苏州洞庭",
    "description": "苏州洞庭季氏支系家谱数字化，收录旧谱与迁徙史料",
    "enable_custom_domain": true
  },
  "jiazutong.cn/ji_23395_02": {
    "tree_id": "ji_23395_02",
    "path_alias": "/ji_23395_02",
    "surname_char": "季",
    "display_title": "季氏（秦皇岛闯关东支）家族历史数字馆",
    "origin": "山东迁徙河北秦皇岛",
    "description": "清末闯关东迁徙季氏支系",
    "enable_custom_domain": false
  }
}
脚本能力：提供简易 node 小工具，输入汉字输出拼音_十进制Unicode前缀，新建 tree 直接拼接序号生成完整 tree‑id。
5 整体技术架构
技术栈全部固定
表格
模块	选型说明
家谱内核	Gramps‑Web 官方原版 docker 镜像，multi‑tree 模式，不 fork、不修改源码
数据库	SQLite，每个 tree 独立 sqlite 数据库文件
缓存消息队列	Redis
前端外壳	Vue3 + Vite SPA；业务逻辑抽离可复用于未来小程序；全部页面外壳调用 RESTAPI 自行渲染，不 iframe，不跳转原生 gramps 页面
反向代理网关	Nginx；SSL 终结；路由分发；泛域名处理
容器编排	Docker + Docker Compose；仓库代号：jiazu
对象存储	腾讯云 COS 北京；S3 兼容模式对接 Gramps‑Web
CDN	腾讯云 CDN，域名media.jiazutong.cn
服务器	腾讯云轻量 4 核 8G Ubuntu
架构流程图
plaintext
浏览器访客
    ↓
Nginx网关（SSL、泛域名解析、读取tree‑meta.json映射）
    ├─根域名jiazutong.cn → Vue外壳【聚合导航/关于页】
    ├─*.jiazutong.cn 子域名 / jiazutong.cn/{tree_id}路径 → Vue外壳【数字馆页面，调用Gramps‑Web RestAPI】
    ├─admin.jiazutong.cn → 直接透传给Gramps‑Web原生管理后台
    └─media.jiazutong.cn → CDN回源COS存储桶

Vue外壳（业务层）
    ├‑人物、世系图谱页面（API拉取数据外壳渲染）
    ├‑字辈检索专题
    ├‑迁徙地图专题(ECharts)
    ├‑完整竖排族谱PDF导出(paged.js)
    ├‑本tree搜索
    └‑外壳层全局跨tree搜索

Gramps‑Web后端服务
    ├‑REST API接口
    ├‑多Tree SQLite数据库
    ├‑Celery异步任务：媒体处理、索引构建
    └‑Redis缓存
重要约束：普通用户访问完全不会进入/gramps原生前端页面；/gramps仅内部后台使用。
6 前端外壳 Vue3+Vite 详细设计
6.1 模块拆分（为小程序复用做准备）
src/business/：纯业务逻辑 js 模块，无 DOM/Vue 依赖；人物解析、跨 tree 跳转逻辑、搜索组装、PDF 数据预处理；未来小程序可直接复用该目录。
src/views/：Vue 页面组件，网页端 UI。
6.2 页面清单
根域名聚合首页：全部数字馆卡片列表
项目关于 & 免责声明页
单家族数字馆首页：支派简介、堂号、迁徙概述、导航入口
人物详情页（外壳调用 API 渲染，统一 UI）
世系图谱页
媒体文献浏览页
字辈检索专题页
迁徙地图专题页（ECharts 渲染迁徙路线、分布点位）
PDF 导出页面：完整中式印刷级竖排族谱配置与下载，使用paged.js；支持：谱序、堂号、字辈、世系、人物小传、迁徙备注。
搜索页面：
默认：仅当前 tree 内搜索（调用 Gramps‑Web 原生搜索接口）
切换：全局跨 tree 搜索（外壳层遍历调用多个 tree 的搜索 API，聚合结果）
6.3 跨 tree 跳转逻辑
读取人物自定义属性external_tree（存储完整 tree‑id）
查询tree‑meta.json映射表
优先生成自定义子域名跳转链接，无自定义域名生成路径模式链接jiazutong.cn/{tree_id}/person/{handle}
7 Gramps‑Web 配置与部署
docker compose 核心环境变量（固定）
yaml
environment:
  - LANG=C.UTF-8
  - LC_ALL=C.UTF-8
  - GRAMPSWEB_TREE="*"
  - GRAMPSWEB_MEDIA_PREFIX_TREE=True
  - GRAMPSWEB_NEW_DB_BACKEND=sqlite
  # 腾讯云COS S3兼容配置
  - GRAMPSWEB_S3_ENDPOINT=https://cos.ap‑beijing.myqcloud.com
  - GRAMPSWEB_S3_BUCKET=jiazu‑main
  - GRAMPSWEB_S3_ACCESS_KEY=xxx
  - GRAMPSWEB_S3_SECRET_KEY=xxx
数据卷：./gramps_db:/gramps_db；tree‑id 命名的数据库目录全部生成在此目录。
媒体上传方式：A，全部通过 Gramps‑Web 后台上传，自动写入 COS。
admin.jiazutong.cn访问原生后台，用于：tree 新建；.gramps/GEDCOM 导入导出；协作者账号管理；少量线上小修小补。
数据录入主流程：本地 Gramps‑Desktop 整理数据，再导入服务器；线上只做小修改。
8 数据模型与跨树软关联
不修改 Gramps 底层 schema；全部扩展使用人物自定义属性；跨 tree 仅业务层跳转，底层血缘计算仅在单 tree 内部生效。
自定义属性固定字段
表格
属性 key	说明	示例值
external_tree	目标家族完整 tree‑id	ji_23376_02
external_person_handle	目标 tree 内人物唯一 handle	000008ac1234567890abcdef12345678
external_relation_note	关系文字说明	苏南季氏女子婚配秦皇岛季氏男子
校验脚本
提供 node 校验脚本，扫描全部 tree 全部人物记录：
校验external_tree对应的 tree‑id 是否在tree‑meta.json存在；
输出不存在的无效引用告警，用于维护，避免死链接。
跨 tree 不参与辈分、亲属计算，仅外壳渲染超链接。
9 权限与用户体系
企业化运营，开放注册（无密码，手机号 + 短信验证码）
超级管理员：1 个账号，拥有全部 tree 读写权限。
注册用户：默认 guest 只读角色；管理员审核后可升级为编辑/协作者（分配指定 tree 读写权限）。
协作者账号：管理员后台创建或升级；可分配指定 tree 读写权限。
匿名访客：未注册浏览者，只读；在世人物信息自动脱敏。
脱敏强制规则
已故人物：完整世系、生卒、迁徙、小传全部公开；
在世人物：仅对外展示姓名；隐藏生日、出生地、配偶完整信息、联系方式。
Gramps‑Web 匿名访问权限配置强制开启脱敏过滤。
10 核心业务功能明细
家谱世系浏览，人物档案查阅
老谱、图片、PDF 文献浏览，全部走 CDN 域名media.jiazutong.cn
PDF 导出：完整印刷级竖排中式族谱，包含谱序、堂号、字辈、世系、人物小传、迁徙备注。
字辈检索专题页：输入字辈字，匹配所属支派、世代位置。
迁徙地图专题：ECharts，展示家族迁移点位、迁徙路线。
搜索：
本 tree 内搜索：调用 Gramps‑Web 原生搜索接口；
全局跨 tree 搜索：外壳聚合多 tree 搜索结果。
跨 tree 联姻人物跳转查阅。
根域名聚合导航，浏览全部上线数字馆。
投稿：仅提供公开联系邮箱；用户邮件提交史料、GEDCOM；管理员人工审核后导入系统，无网页端投稿表单。
11 存储、CDN 设计
主存储桶：jiazu‑main（北京）；Gramps‑Web 上传媒体全部写入；按 tree‑id 自动分目录。
CDN 加速域名media.jiazutong.cn回源 COS；图片缓存 60 天，PDF 缓存 30 天；开启 304 回源跟随。
COS 生命周期策略：
新文件标准存储；
30 天无访问自动转为低频访问；
180 天无访问转为归档。
归档文件访问会产生取回费用；高频浏览谱册避免进入归档。
不使用服务器磁盘存储大图 / PDF；服务器磁盘只放 sqlite 数据库与缓存。
12 备份策略（手动）
无自动定时备份，全部手动触发
触发时机：每次重要数据变更（导入新 tree、大规模修改家谱）之后，管理员手动操作。
操作步骤：
在admin.jiazutong.cn后台，逐个 tree 导出完整.gramps备份包 + GEDCOM；
将导出备份包 + tree‑meta.json元映射配置文件，手动上传至COS 异地私有备份桶（上海地域）；
同步下载一份到本地离线 NAS / 移动硬盘做物理离线兜底。
媒体文件：COS 开启跨地域复制，主桶数据自动复制到异地备份桶；无需手动上传媒体。
重要提醒：元配置文件tree‑meta.json和家谱数据库同等重要，每次修改必须同步备份。
13 部署方案 Docker‑Compose
仓库代号：jiazu
目录结构
plaintext
jiazu/
├── docker‑compose.yml
├── .env
├── config/
│   └── tree‑meta.json
├── gramps_db/          # 各个tree的sqlite数据库目录
├── shell‑scripts/      # 校验脚本、辅助小工具
└── frontend‑shell/     # Vue3外壳源码
全部服务运行在同一台轻量服务器；新增家族树不需要新增任何容器，不需要修改 docker‑compose.yml。
14 新增一个家族树完整标准化流程
全部步骤固化，后续新增直接照此执行
使用工具输入姓氏汉字，生成拼音_Unicode十进制前缀，分配支派序号得到完整 tree‑id；
在本地 Gramps‑Desktop 完成家谱整理清洗；
访问admin.jiazutong.cn后台，新建 tree，填入 tree‑id；导入本地整理好的.gramps；
修改config/tree‑meta.json，增加该 tree 完整元配置；提交到代码仓库；
DNS（可选）：如果分配独立自定义子域名，添加解析记录；无自定义域名则直接使用路径模式访问；
手动备份：导出.gramps+gedcom，连同更新后的tree‑meta.json，备份至 COS 异地桶 + 本地 NAS；
根域名聚合导航页会读取配置自动渲染该数字馆卡片，对外可访问。
无需修改 docker compose，无需修改 Nginx 主配置文件。
15 合规、隐私（企业运营）
页面强制展示声明（根域名关于页 + 每一个数字馆页脚）
本站为家族历史数字化研究平台，不属于任何宗亲会、联谊会、社会组织。无理事会，不组织线下聚会，不收取会费，不接受捐赠。
本站致力于家谱、旧谱文献、迁徙史料数字化整理。在世亲属信息全部脱敏保护，不会公开完整生辰、籍贯等隐私。
史料、家谱投稿仅通过公开联系邮箱提交；用户注册采用手机号验证码，无密码，需同意《用户协议》与《隐私政策》。
合规硬性约束
开放注册（手机号 + 短信验证码），无公开的密码注册；注册用户默认只读，编辑权限需管理员审核。
不做任何 BBS、留言板、评论功能。
不涉及任何收费、交易功能。
在世人物隐私信息强制脱敏。
16 风险清单与规避措施
表格
风险	规避方案
tree‑meta.json 元配置丢失	每次修改后随备份同步到 COS 异地桶 + 本地 NAS；同时存入 git 仓库版本管理
同音字、同汉字多支派 ID 混淆	严格执行 tree‑id 命名规范，强制带 Unicode 十进制码点 + 序号，不直接使用汉字做 ID
跨 tree 死链接	内置校验脚本，定期扫描全部人物的 external_tree 字段输出告警
媒体消耗服务器外网流量	全部图片 PDF 访问走 CDN 域名media.jiazutong.cn，服务器不直接输出媒体二进制
Gramps‑Web 升级破坏业务	外壳与内核严格分离，不修改上游源码；升级前先完整备份全部 tree
在世人员隐私泄露	外壳 + Gramps‑Web 两层脱敏过滤；上线前校验所有页面输出
备份遗漏重要变更	明确规定：重要数据变更之后必须手动执行完整备份流程
