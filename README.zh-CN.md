# bloub widget

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-blue.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)  ![Made by Wang Nan](https://img.shields.io/badge/Made%20by-Wang%20Nan-brightgreen)

一个会呼吸、会眨眼、视线跟随鼠标的动画 SVG 挂件，只需一个 script 标签即可嵌入页面。

[English](README.md) | **简体中文**

---

![平静状态的 bloub 循环播放待机动画](docs/calm.gif)

## 简介

bloub widget 是一个无框架、零依赖的挂件，基于 Jérémy Perret 的 [bloub](https://github.com/jeremy-prt/bloub) 引擎构建。这个角色是一个在不同表情之间形变（morph）的填充形体，眼睛是形体上挖出的洞，视线会跟随鼠标。点击它可以在你自定义的表情序列之间循环切换。

在配置页上可视化地完成定制，然后把生成的代码粘贴到任意页面即可 —— 无需构建步骤，也没有任何依赖。

配置页：<https://bloub.wangnan.net/>

## 特性

- 使用原生 DOM 渲染纯 SVG，无框架、无运行时依赖
- 眼睛跟随鼠标；点击以弹性「跳动」效果循环切换自定义表情序列
- 16 种表情、8 种形状、12 种颜色；每个表情可单独设置形状与颜色
- 两种嵌入模式：放进你自定义尺寸的容器，或在窗口角落生成固定圆盘
- 在任意嵌入了 bloub 的页面上双击小球，可带着当前配置重新打开配置页
- 挂件离屏时自动暂停动画；压缩后约 32 KB

## 定制方法

1. 点击右侧表情预览，将其拖入点击序列。
2. 横向拖动卡片调整顺序；把表情拖到某张卡片上可替换该卡片的表情。
3. 选中一张卡片，再为它单独选择形状和颜色。新卡片默认为黑色圆形。
4. 复制容器模式或全局模式的代码。

## 使用方法

### 容器模式

准备一个设置好宽高和位置的 `<div>`，然后把代码粘贴到这个 `<div>` 里面：

```html
<div data-bloub='{"moods":[{"expression":"neutre","color":"encre","shape":"cercle"},{"expression":"heureux","color":"encre","shape":"cercle"}]}' style="width:100%;height:100%"></div>
<script src="https://bloub.wangnan.net/bloub.js"></script>
```

脚本会自动初始化所有带有 `data-bloub` 属性的元素。

### 全局模式

把代码粘贴到 `<body>` 中，会在指定的窗口角落生成一个白色圆形徽章：

```html
<script src="https://bloub.wangnan.net/bloub.js"></script>
<script>
  Bloub.fixed({ corner: "br", size: 64, margin: 16 }, {
    moods: [
      { expression: "neutre", color: "encre", shape: "cercle" },
      { expression: "heureux", color: "encre", shape: "cercle" }
    ]
  });
</script>
```

### JavaScript API

- `Bloub.mount(target, config?)` —— 在 `target`（元素或选择器）内渲染，尺寸由 target 控制。
- `Bloub.fixed(fixedOptions?, config?)` —— 创建固定徽章圆盘并添加到 body。
- 两者都返回实例对象，包含 `setMoods(moods, startIndex?)`、`getMoods()` 和 `destroy()` 方法。

### 配置参数说明

`config` 字段：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `moods` | 单个平静表情 | `{ expression, color?, shape? }` 数组；第一项为页面加载时显示的表情 |
| `follow` | `true` | 眼睛跟随鼠标 |
| `pop` | `true` | 点击时播放缩放跳动 |
| `clickable` | `true` | 点击切换表情；设为 `false` 则仅为纯展示挂件 |
| `onMoodChange` | — | 点击切换到另一表情后的回调，参数为新表情的下标 |
| `paper` | `#ffffff` | 眼睛孔洞中透出的颜色 |
| `toolUrl` | 配置页地址 | 双击时打开的页面 |

`fixedOptions` 字段：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `corner` | `br` | 窗口角落：`br`、`bl`、`tr`、`tl`（右下、左下、右上、左上） |
| `size` | `64` | 圆盘尺寸（像素） |
| `margin` | `16` | 距窗口边缘的距离（像素） |

可选 id 目录：

- 表情：`neutre`、`attentif`、`surpris`、`excite`、`heureux`、`hilare`、`colere`、`triste`、`effraye`、`mefiant`、`confus`、`curieux`、`fier`、`timide`、`blase`、`somnolent`
- 形状：`cercle`、`galet`、`squircle`、`capsule`、`triangle`、`hexagone`、`nuage`、`goutte`
- 颜色：`encre`、`brun`、`rouge`、`orange`、`ambre`、`vert`、`turquoise`、`bleu`、`violet`、`rose`、`gris`、`creme`

## 自行托管

引擎是一个单独的静态文件。你可以自行托管 `bloub.js`，也可以通过 CDN 引用指定版本，例如：

```
https://cdn.jsdelivr.net/gh/theFool-wn/bloub-widget@v1.0.0/bloub.js
```

## 从源码构建

```
npm install
npm run build   # 打包 bloub.js 和 assets/tool.js
npm run gif     # 重新生成 docs/calm.gif
```

## 版本信息

**创建：** Wang Nan，2026.10.06

**联系方式：**

* [me@wangnan.net](mailto:me@wangnan.net)

**上游项目：**

* [bloub](https://github.com/jeremy-prt/bloub) —— Jérémy Perret，MIT 许可证（见 `licenses/bloub-MIT-LICENSE`）

## 许可证

本作品 —— 挂件封装、配置页与文档 —— 采用 **[CC BY-NC-SA 4.0 许可证](https://creativecommons.org/licenses/by-nc-sa/4.0/)** 授权。

在 **非商业用途** 下，你可以自由使用、分享和改编本作品，但需满足：

* 你必须注明 **适当的署名**、提供 **本许可证的链接**，并说明是否做了修改。你可以以任何合理的方式署名，但不得以任何方式暗示许可人为你或你的使用背书。
* 你对任何修改 **须以相同许可证发布**。

`src/bot/` 下的动画引擎衍生自 Jérémy Perret 的 bloub，继续适用 **MIT 许可证**；版权与许可声明已保留在 `licenses/bloub-MIT-LICENSE` 中。

© 2026 Wang Nan. 保留所有权利。
