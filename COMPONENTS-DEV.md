# Yayi Design · 组件与页面开发说明（面向开发）

> 配套文档：`DESIGN-SPEC.md`（视觉规范/token）。本文档描述画板体系的技术结构、每个组件/模板的 Props 接口与行为语义，供开发还原与后续页面生成时对照。
>
> 维护约定：**新增/修改组件时必须同步更新本文档**；组件 Props 变更以画板文件内 `data-props` JSON 为准。

---

## 一、画板体系（.dc.html）技术结构

每个画板是一个独立 HTML 文件（`project/*.dc.html`），结构固定为：

```
<!doctype html>
<html>… <script src="./support.js"></script>   ← dc runtime
<x-dc>
  <helmet><style>…</style></helmet>              ← 样式（合并进运行环境）
  <div class="yy …">                              ← 组件 DOM，支持 {{ 绑定 }} 与 <sc-for> 循环
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{…}'>
class Component extends DCLogic { renderVals() { … } }   ← 交互逻辑
</script>
```

核心机制：

| 机制 | 说明 |
|---|---|
| `data-props` | 编辑器右侧属性面板的 schema（editor: text/int/enum/boolean，default 即组件默认值） |
| `renderVals()` | 返回模板绑定对象；`{{ expr }}` 从中取值，支持函数绑定到 `onClick` 等事件 |
| `this.state` + `this.setState()` | 组件内部状态；state 变化自动重渲染 |
| `<sc-for list="{{…}}" as="item">` | 列表循环渲染，`hint-placeholder-count` 为占位项数 |
| `is_interactive`（canvas.json） | 画板可交互（可点/可输入）；纯静态展示画板置 false |
| `dc-import name="X"` | **引用语义**：内容仍挂在被引用画板上，改源全局联动（模板用法） |
| 独立副本落地 | 组件面板拖出的普通组件按**默认值展开为独立 HTML**，与组件库解耦，可随意改 |

组件落地语义（重要）：

- **模板**（标题含「全局/模板」，如 AdminNav）：以 `dc-import` 引用，改模板一处、全站引用处一起变。适合全局侧边菜单、页头等。
- **组件**（其余全部）：拖入画布即展开为独立副本，文字、枚举值、选项等可直接改，不受组件库后续修改影响。

---

## 二、组件清单与 Props 接口

### 1. Button 按钮 · `Button.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| label | text | 确认发货 | 按钮文字 |
| variant | enum | primary | primary 主按钮（靛紫 #6366F1）/ secondary 次按钮 / ghost 幽灵 / danger 危险（玫红） |
| size | enum | md | sm 28px / md 32px / lg 40px |
| block | boolean | false | 是否占满整行 |
| loading | boolean | false | 加载态（转圈 + 禁点） |
| disabled | boolean | false | 禁用态 |

行为：点击有 noop 动作（原型级）；loading/disabled 时不可点。

### 2. Input 输入框 · `Input.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| label / placeholder / value / hint / prefix / error | text | — | 标签、占位、值、底部提示、前缀图标、错误文案 |
| type | enum | text | text / password / number / email / tel |
| size | enum | md | sm / md / lg |
| maxLength | int | 0 | 0 = 不限 |
| required / disabled / clearable | boolean | false/true | 必填星号 / 禁用 / 一键清空 |

行为：可输入，聚焦显示靛紫 3px 光环；error 非空时红边 + 错误文案。

### 3. Select 下拉框（单选）· `Select.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| options | text | 全部渠道,天猫,抖音,独立站,小红书 | 逗号分隔选项 |
| label / placeholder / value | text | — | 标签 / 占位 / 当前值 |
| w | int | 168 | 宽度 88–420px |
| size | enum | md | sm / md / lg |
| disabled | boolean | false | 禁用 |

行为：点击展开浮层选项（键盘可达），选中项文字靛紫；state.value 覆盖 props.value。

### 4. MultiSelect 下拉多选 · `MultiSelect.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| options | text | 天猫\n抖音\n小红书\n独立站\n拼多多 | **换行分隔**选项 |
| label / placeholder | text | — | 标签 / 占位 |
| checked | text | 0,1 | 初始选中项索引（逗号分隔） |
| max | int | 0 | 最多可选数，0 = 不限 |
| maxTags | int | 3 | 字段区最多显示的 chip 数（超出 +N） |
| searchable | boolean | true | 支持搜索过滤 |
| disabled | boolean | false | 禁用 |

行为：选中项以靛紫 chip 呈现（#EEF2FF 底/#4F46E5 字），chip 可单独点 × 移除。

### 5. Checkbox 多选组 · `Checkbox.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| options | text | 短信通知\n邮件通知\n站内信\n电话回访 | 换行分隔选项 |
| label | text | 通知方式 | 组标题 |
| checked | text | 0,1 | 初始选中索引 |
| direction | enum | column | row / column |
| gap | int | 12 | 间距 6–40px |
| disabled | boolean | false | 禁用 |

### 6. Radio 单选组 · `Radio.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| options | text | 全部订单\n待发货\n待收货\n已完成 | 换行分隔选项 |
| label | text | 订单状态 | 组标题 |
| value | int | 0 | 初始选中索引 |
| direction / gap / disabled | — | — | 同 Checkbox |

### 7. Toggle 开关 · `Toggle.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| label | text | （空） | 可选左侧文字 |
| checked | boolean | true | 开/关 |
| size | enum | md | sm 32px / md 40px / lg 48px |
| disabled | boolean | false | 禁用 |

行为：点击切换；开态靛紫，关态灰。

### 8. DatePicker 日期选择器 · `DatePicker.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| label / placeholder / value | text | — | 标签 / 占位 / 值 |
| format | enum | YYYY-MM-DD | YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日 |
| weekStart | enum | sun | 周日/周一起始 |
| disabled | boolean | false | 禁用 |

行为：点击弹出日历面板，支持月份翻页；选中回填至 format 格式。

### 9. Tabs 标签页 · `Tabs.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| items | text | 全部\n待付款\n待发货\n已发货\n已完成\n售后 | 换行分隔标签 |
| activeIndex | int | 0 | 初始激活项 |
| gap | int | 24 | 标签间距 8–64px |
| size | enum | md | sm 12.5px / md 13px / lg 14px |
| variant | enum | line | line 下划线式 / pill 胶囊式 |
| groupLabel | text | 订单状态 | 无障碍标签 |

行为：点击切换激活项（line 式靛紫下划线，pill 式靛紫底白字）；支持 ← → Home End 键盘导航。

### 10. Badge 状态标签 · `Badge.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| text | text | 待发货 | 文字 |
| tone | enum | warn | neutral 灰 / info 天蓝 / warn 琥珀 / success 绿 / danger 玫红 |
| size | enum | md | sm / md / lg |
| dot | boolean | false | 左侧圆点 |

语义色 token（与 DESIGN-SPEC.md 一致）：info `#E0F2FE`/`#0369A1`、success `#F0FDF4`/`#16A34A`、warn `#FFFBEB`/`#B45309`、danger `#FFF1F2`/`#BE123C`。

### 11. Table 数据表格 · `Table.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| title | text | 订单明细 | 卡片标题 |
| columns | text | 商品,数量,单价,金额 | 逗号分隔列名 |
| rows | text | [img]保温杯,2,¥59,¥118 … | 换行=行，逗号=单元格；`[img]` 前缀渲染缩略图占位 |
| variant | enum | plain | plain / zebra 斑马纹 / bordered 全边框 |
| density | enum | md | compact 40px / md 48px / comfortable 56px 行高 |
| sortable | boolean | true | 表头点击排序 |
| sticky | boolean | false | 表头吸顶 |
| maxHeight | int | 0 | 0 = 不限；>0 出滚动条 |
| emptyText | text | 暂无数据 | 空态文案 |

### 12. AdminNav 全局侧边菜单（模板）· `AdminNav-oz79.dc.html`

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| active | enum | home | 当前高亮菜单项，枚举见下表 |

菜单枚举映射（active 值 → 菜单项）：

| active | 菜单 | active | 菜单 |
|---|---|---|---|
| home | 工作台 | pattern | 图案库 |
| inspire | 灵感广场 | layout | 版型库 |
| design | 智能开款 | pricing | 智能核价 |
| fulfill | 智能履约 | campaign | 活动申报 |
| records | 生成记录 | stock | 库存同步 |
| | | delist | 商品下架 |
| | | catalog | 货盘中心 |
| | | products | 商品列表 |
| | | orders | 订单列表 |
| | | shop | 店铺管理 |
| | | settings | 设置（底部） |

兼容：legacy 值 `detail` 自动归并到 `orders`；未知值回退 `home`。

用法（页面内引用，改模板全局联动）：

```html
<dc-import name="AdminNav" active="inspire"></dc-import>
```

> ⚠️ 注意：模板文件当前为 `AdminNav-oz79.dc.html`（画板标题「AdminNav copy」）。页面 `dc-import name="AdminNav"` 的解析名与文件名/标题的对应关系需在改名后重新核对，引用前先用 linkcheck 验证。

视觉：宽 240px、浅灰底 `#F7F7F8`、选中项深靛紫 `#4F46E5` 白字；分组结构（工作区/资产/运营/经营）与首页侧栏一致。

---

## 三、页面清单

| 文件 | 页面 | 尺寸 | 交互 | 说明 |
|---|---|---|---|---|
| `YayiHome.dc.html` | home 首页 | 1440×960 | 否 | 工作台首页：左栏 240px 三组导航 + 顶栏 64px（搜索/算力/铃铛/头像）+ 四工具族卡 + 编号分组工具网格（01 图案处理 / 02 图案生成 / 03 商品资料生成 / 04 风险检测） |
| `InspirePlaza.dc.html` | inspire 灵感广场 | 1440×1290 | 是 | 图案素材库：平台切换（Temu/Shein）+ 三行筛选（含图案元素/侵权结果 chip）+ 排序工具条（全选/已选计数）+ **6 列 12 张图案卡**（真实图片）+ 分页。交互：平台与排序切换、卡片勾选、全选、chip 过滤、翻页 |
| 组件 ×11 + 模板 ×1 | components 组件库 | 各异 | 是 | 见上表；面板中拖出的普通组件 = 独立副本，模板 = dc-import 引用 |

**图片资源约定**：画板内引用 `project/images/*.jpg`（相对路径 `images/xxx.jpg`）。编辑器渲染画板时会把 project 内图片重写为 data URI 内联（`rewriteProjectAssets`，支持 png/jpg/gif/webp/avif/bmp/svg），因此**不要用绝对路径或外链**。卡片图建议 ≤360px 宽 / 单张 ≤60KB，避免画板加载过重。

组件速查（画板标题即面板卡片名）：按钮 · 4 变体｜输入框｜下拉框｜下拉多选｜多选｜单选｜开关｜日期选择器｜标签页｜状态标签 · 5 色｜数据表格｜全局侧边菜单（模板）。

---

## 四、开发还原注意事项

1. **色值一律取 DESIGN-SPEC.md token**：主色 `#6366F1`（hover `#4F46E5`），中性 zinc 系，禁旧蓝（`#3c5bdb`/`#2d4ccb`/`#2A62D4`）。
2. 控件统一 `border-radius:8px`；字号最小 11px；正文 13px。
3. 交互态统一：hover 灰底 `#EDEDEF`；聚焦 `0 0 0 3px rgba(99,102,241,.14)` 光环；禁用 opacity .7。
4. 图标全部为 Lucide 风格线性 SVG（stroke=currentColor，1.5px），无 emoji。
5. 表单组件 label 12.5px/600；可交互元素必须键盘可达（focus-visible 靛紫 outline）。
6. 无障碍：交互组提供 aria-label；Tabs 支持 roving tabindex。
