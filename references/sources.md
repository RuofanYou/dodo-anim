# 来源与能力边界

本文件保存足以理解流程的一手来源与有限证据摘要，便于整体复制 Skill 后仍能理解设计理由。它不是要重新阅读的长课清单，也不把源网页的操作按钮当作所有版本均适用。

## 专业判断依据

| 来源 | 已核对的要点 | 使用边界 |
|---|---|---|
| Esoteric Software：[Mesh weight workflows](https://esotericsoftware.com/blog/Mesh-weight-workflows) | 先按网格目的决定哪些顶点受哪根骨影响；尽量少控制；创建测试动画，检查相反极限后再调整中间区域 | 支持按动作规划、试姿态与权重调整；没有提供巫师专用坐标或万能骨架 |
| Spine 官方：[Weights / Testing weights](https://esotericsoftware.com/spine-weights#Testing-weights)、[Weld](https://esotericsoftware.com/spine-weights#Weld) | 在运动中调权重；跨网格匹配权重可使其像一张图一样变形 | 匹配变形不会凭空补出缺失的皮肤、布料或木柄，也不适合所有需要分离的部件 |
| Spine 官方：[Images](https://esotericsoftware.com/spine-images) | 独立运动部件需要相应图像；图片以附件和注册位置进入绑定 | 识别独立运动是前置判断，不是给所有色块各建一根骨骼 |
| 官方教学：[Asset creation for Spine in Procreate — Sketch and Basic Shapes](https://www.youtube.com/watch?v=7wfEFalO5NI) | 2026-10-21 实际读取英文字幕：12:27–13:05 以膝/腿举例调整形状与覆盖；16:22–16:53 说明遮挡后的部分也要画全，为关节旋转预留覆盖 | 依据仅限这些已取得的段落；没有声称完整学习全部视频或得到通用自动绑定能力 |

## 中文教学的实际取证范围

- **毛怪老师**：[动画系列教程1_切图 spine动画的前期准备工作…](https://www.bilibili.com/video/BV1ch411a7qg/)。2026-10-21 本机 Whisper small 中文 ASR 取得 00:00–03:07，后续为控制等待主动停止。00:37–01:13 区分简单测试切图与复杂动作需求；01:50–02:27 说明头发前后层、头与耳拆分，后脑和后层头发需补完整以适应旋转。平台版权标记为原创，职业履历未另核验。**没有转写余下 24:52 全片。**
- **蓝饺子**：[Spine零基础中文教程，仅 P5《05工具2》](https://www.bilibili.com/video/BV1nAkGYUE59/?p=5)。作者说明按官方大纲重新录制。2026-10-21 所选 05:42 音频完成 Whisper small ASR，末段至 05:40.72。02:34–02:59 讲临时 IK 姿势工具，03:14–04:11 讲逐点权重并旋转观察影响。**未处理其余分 P。**

两条公开接口当时均无可用字幕轨，使用的是 ASR。Spine、子/父骨骼和英文骨名存在误识；这里只保留原则，不据未经画面复核的按钮文字或百分比制定操作规范。来源段落与本工作台流程之间有明确区分：测试与材料完整性有教学依据，具体项目控制方案仍需自己分析并验证。

## 实现与静态素材方法

- [Rigby2D 上游](https://github.com/jaisurya-dev-art/rigby2d)：现成的二维骨骼、网格、关键帧与编辑器基础。本工作台采用打包版本的实际能力；版本与许可证见包内 [VENDORED.json](../vendor/rigby2d/VENDORED.json)、[MIT](../vendor/rigby2d/LICENSE-MIT) 和 [Apache-2.0](../vendor/rigby2d/LICENSE-APACHE)，不能将某个导出后缀当作全部版本兼容的保证。
- [agent-sprite-forge 上游](https://github.com/0x0funky/agent-sprite-forge)：采用其身份描述、静态 master、局部编辑、来源记录的准备方法；包内 [静态参考](../vendor/agent-sprite-forge/skills/generate2dsprite/references/master-still.md)、[版本与范围](../vendor/agent-sprite-forge/VENDORED.json)、[MIT](../vendor/agent-sprite-forge/LICENSE) 自包含。本包没有上游脚本或完整可运行 Skill；使用内置 `image_gen`，上游 I2V、视频切帧和 provider 自动路由不进入制作路线。

学习笔记中的拆层模型、透明生成模型或库只可作为另外选择的工具。分割、补图、关节预测和参数插值都不自动解决“为何这样运动”；默认流程不因此增加重模型或新依赖。

## 同类宝箱工程与参考入口

2026-10-21 核查如下。分类表示实际取得的内容，不按成片效果或仓库名称推定工程成熟度；外部候选尚未替换本包认可宝箱。

| 来源与分类 | 已核实的实际内容 | 当前复用判断 |
|---|---|---|
| [eggmun98/spine-viewer 的 chest](https://github.com/eggmun98/spine-viewer/tree/main/examples/pirate-game/assets/spines/ui)：**简单 Spine rig/动作小样** | 已读取 [JSON](https://raw.githubusercontent.com/eggmun98/spine-viewer/main/examples/pirate-game/assets/spines/ui/chest.json) 与 [atlas](https://raw.githubusercontent.com/eggmun98/spine-viewer/main/examples/pirate-game/assets/spines/ui/chest.atlas)，同目录有 PNG。Spine 4.2.00，3 骨、2 槽，`idle` 与 0.7 秒 `open`；[示例说明](https://raw.githubusercontent.com/eggmun98/spine-viewer/main/examples/README.md) 明确说是生成的几何测试图，未从 Spine 编辑器导出 | 可读其最小铰链与动作组织；没有 `.spine` 编辑器源，不能称为成熟美术 rig，本轮未运行。仓库 [MIT](https://raw.githubusercontent.com/eggmun98/spine-viewer/main/LICENSE) 与 Spine runtime 的独立许可需分别保留，示例图像无单独授权说明 |
| [官方 Treasure chests and loots in Spine](https://en.esotericsoftware.com/spine-twitch)（[视频](https://www.youtube.com/watch?v=jArBisjCsR8)）：**专业制作教程** | 官方章节列出 mesh、2.5D controls、transform constraint、锁扣、开盖、宝石弹出和闪光；本轮核查目录及下载入口，没有观看/转写全片，也没有取得该节源工程 | 可作为专业控制与制作顺序的参考；未核实可下载制作文件和二开许可，不记为已复用工程 |
| [Quaternius Chest](https://poly.pizza/m/eEcIqgJzJ1)：**其他格式结构/动作候选，非 Spine** | 资产页署名 Quaternius，标注 Animated、FBX/GLTF、Public Domain (CC0)，日期 2021-12-21；本轮只核查页面，未下载打开文件 | 值得先打开检查现成转轴、厚度和动画，再决定是否转为二维制作源；尚未验证文件中的骨架、动作片段、隐藏面或转换效果 |

Three.js、Rigby2D、rig-c 是通用几何/骨骼/消费工具。本包真实使用了 Three.js 体积与投影、Rigby2D 工程、rig-c 的官方 Spine poser 渲染，但安装或调用这些工具不等于拿到了成熟宝箱工程。当前可直接查看和二开的本地起点是 [已认可宝箱及固定版本](../README.md#已认可宝箱样例)。

## 已验证案例与尚未验证的范围

巫师案例验证了从认可静态图、补隐藏材料、显式设计控制与动作，到 Rigby2D 预览和确定性 MP4 的一条路径。最初存在颈部和披风连接缺陷，修复依赖完整底面与相接区域一致变形；只看静止拼图不能发现全部问题。

其 26 根骨骼、源图坐标、局部权重分界、补图尺寸、采样区域、动作时长和帧数都属于案例参数。它们不形成新角色的容量、动作范围或验收上限。

宝箱已由用户认可为 SOP 与复用样例，具体构建、预览和制作源统一记录在 [已认可宝箱样例](../README.md#已认可宝箱样例)。该案例补充了底面后沿铰链、真实厚度、六面体的投影与二维消费；后续先查看并复用可用结构，不从每次重新猜骨骼开始。

2026-10-22，用户认可 [死亡之翼原生喷火与 MP4](../examples/deathwing-native-fire/README.md)。火焰来自用户提供的教程工程，恢复与原样播放后复用原骨架、原图和动作，再做喷口注册、尺度与阶段编排；素材商用与再分发许可未确认。两份 3.8 输入的 [便携读取器及适用范围](../scripts/spine38-reader/README.md)、[复现记录](../validation/spine38-reader-reproduction.json) 与 [组合验证](../examples/deathwing-native-fire/evidence/verification.json) 分别保留。流程要点见 [成熟效果复用](native-effect-reuse.md)，不把专业效果的原动作记为原创。

当前不据此宣称已验证：任意陌生原图、所有物种/材质、复杂流体、真正多视角转面、所有目标 runtime 或低价模型独立完成语义运动设计。模型可在明确模板内辅助填写参数或生成候选，但准确性、返工量和费用需要实际对照；不能只凭一次成功推荐替代。

Skill 让之后的任务重新加载这些流程、证据和限制；阅读教学本身不等于能力已经永久改变。新增案例应检验先前判断，优先修正实际失败，不靠扩大规则或继续收集库来证明成熟度。
