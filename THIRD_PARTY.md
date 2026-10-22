# 第三方代码与示例素材

动动 Dodo 将制作 SOP、工具和三个认可案例放在同一私人仓库，便于复建与参考。下列组件分别保留各自许可；仓库私有、素材可下载或工程可打开，都不扩大它们的使用授权。没有一份总 MIT 许可覆盖全部代码、图像和动画。

## 工具与运行时

| 组件 | 随包范围与版本 | 许可和恢复方式 |
| --- | --- | --- |
| [Rigby2D](https://github.com/jaisurya-dev-art/rigby2d) | `vendor/rigby2d/` 中的必要源码；固定提交 `6069ae2ef8cfbb622053a84e7ccd4acc74c06415` | MIT OR Apache-2.0；保留 [MIT](vendor/rigby2d/LICENSE-MIT)、[Apache](vendor/rigby2d/LICENSE-APACHE)、[第三方声明](vendor/rigby2d/THIRD_PARTY_NOTICES.md) 和 [选取范围/哈希](vendor/rigby2d/VENDORED.json)。本包没有携带完整桌面编辑器及其所有附加依赖。 |
| [agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) | 静态主形象和提示方法参考；固定提交 `5324342fdfab72430f4e9604f3fe427009f8596d` | [MIT](vendor/agent-sprite-forge/LICENSE)，范围见 [VENDORED.json](vendor/agent-sprite-forge/VENDORED.json)。没有附带生成脚本、账号、服务或生成视频流程；实际静态图像生成由当前宿主提供。 |
| [Three.js](https://github.com/mrdoob/three.js) | 宝箱构建使用 `three@0.186.1` 的几何和投影 | MIT；通过根目录 `package-lock.json` 锁定，执行 `npm ci` 恢复。`node_modules/` 不进仓库，安装后的原许可在 `node_modules/three/LICENSE`。 |
| 官方 Spine 3.8 WebGL runtime | [spine-webgl-3.8.js](examples/deathwing-native-fire/source/spine-webgl-3.8.js)，来源提交 `8b4844bd4b193ba9e54487ed397a777993cbad56`，原文件和哈希保留 | 适用独立的 [Spine Runtimes License Agreement](examples/deathwing-native-fire/source/SPINE-RUNTIME-LICENSE)，与 MIT/Apache 不同。原生喷火样例的组合构建、离线动作采样和检查实际使用它；网页预览使用 Rigby2D。不能因为网页不用官方 runtime，就把整条离线链路宣称为不涉及其许可。使用前按原许可和当前用途核对。 |

`validation/spine-consumer/package-lock.json` 另外锁定可选的独立检查依赖 `rig-c@2.65.1`、`@esotericsoftware/spine-core@4.3.13` 和 `bun@1.4.3`。安装产物不进仓库；需要该检查或软件渲染时在对应目录执行 `npm ci`，并保留安装依赖自己的 LICENSE/NOTICE。官方 Spine Core 的使用范围仍由其许可决定。Python 依赖从根目录 `requirements.txt` 安装，FFmpeg 由当前电脑提供。

## 三个认可案例

| 案例 | 来源分类 | 使用边界 |
| --- | --- | --- |
| [绿豆巫师](examples/bean-wizard/README.md) | 宿主图像生成的主形象与隐藏面修补，本项目为固定视角和三个动作设计骨架/关键帧 | 原图、补画输入、来源和哈希保存在 [provenance.json](examples/bean-wizard/source/provenance.json)。确定性复建从保存的 PNG 开始，提示词不能保证再次生成相同像素。 |
| [绿豆宝箱](examples/bean-chest/README.md) | 宿主生成静态材料，Three 几何投影，项目编写的动作和烘焙脚本 | 具体素材来源与哈希保存在 [provenance.json](examples/bean-chest/source/provenance.json)。结构代码、工具库许可和素材来源分别保留。 |
| [死亡之翼与原生喷火](examples/deathwing-native-fire/README.md) | 角色为暴雪 IP「死亡之翼 / Deathwing」的同人技术演示；火焰为用户提供教程工程的原图、骨架与动作复用；接口和片段编排为本项目适配 | 角色生成不替代相关 IP 使用授权。火焰的商用及再分发许可尚未确认；公开可下载不等于开源商用。保留 [来源与逐图哈希](examples/deathwing-native-fire/source/provenance.json)，不要将其作为新项目已取得商用授权的通用资源。 |

火焰原材料来自用户本地提供的 `fire.spine` 和五张 PNG，教程线索为 [《仅用5张小图制作火焰特效》](https://www.bilibili.com/video/BV1hw411p7Lo/)。该发布线索不足以确认原作者或授权范围。本仓库携带恢复的 `source/native-fire.json` 与五张原 PNG 以复建认可案例，没有携带第三方原 `.spine` 文件；后续商用或对外分发前需另行解决对应素材许可。

来源记录中的旧绝对路径仅用于追溯当时输入。本仓库的默认构建从随包文件读取，不要求访问那台电脑的 Downloads 或研究目录。已认可案例用作只读参考；新作品的来源、改动和许可按其实际材料重新记录。
